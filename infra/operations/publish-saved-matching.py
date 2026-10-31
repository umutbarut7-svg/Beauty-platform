"""Publish the owner-approved immutable preview release. Never log secrets."""
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path('/opt/epifiz/operations')
WORK = ROOT / 'saved-matching-release-20261031-1'
SOURCE = '4fdfbe61405633ce85764c0b2a13e157bc9e5833'
API_IMAGE = 'sha256:8d47e73a44a5e2d1ec7df3a54c8feaeb315271c819a8e3217237745d62206225'
MIGRATE_IMAGE = 'sha256:b597f189cd6807d60bf24a5464b4e98b565c18319e394ef88e40b60bcfce8fca'
PREVIOUS = {'api': 'sha256:22b333c13e5dd6de70027a93141aad0b4157be7c1fed4b29067a70173acc94a9', 'worker': 'sha256:d6f15b40595f4abce6e4c5c185158a292d10dea9b1057288e67dff5049633dfe'}
ZIP_SHA = '1cc1bfc11fc8aef672f0e9ff5abf04beceb0c21c70a769b8a53f6a17981780f0'
ZIP_SIZE = 771720992
TAR_SHA = 'c17f18dc84256a8c4d6627303af7eea23ce1c1ad630665824d6235b865c28da5'
TAR_SIZE = 771718568
MIGRATION = '20261030000000_visual_matching_recovery'
MIGRATION_SHA = '9019aa2f5582dff9ce12b3f66c5b3cc0d06196e57e598d6d26a46fd61b6b26a9'
FIELDS = ['matchingOutput', 'matchingRequestId', 'matchingStatus']
MODULES = ['mvp.module', 'visual.service', 'visual.controller', 'semantic.service', 'visual-matches.service', 'photo-maintenance.service']


class Stop(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Stop(message)


def run(args, timeout=30, limit=1000000):
    try:
        reply = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop('Bounded command unavailable or timed out; inspect before retry') from None
    require(reply.returncode == 0 and len(reply.stdout) + len(reply.stderr) <= limit, 'Command failed; private output withheld')
    return reply.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def snapshot():
    ids = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=beauty-preview']).split()
    require(bool(ids), 'Preview inventory unavailable')
    containers = json.loads(run(['docker', 'inspect', *ids], limit=3000000))
    result = {}
    for container in containers:
        labels = container['Config']['Labels']
        if str(labels.get('com.docker.compose.oneoff', '')).lower() == 'true':
            continue
        service = labels.get('com.docker.compose.service')
        require(service and service not in result, 'Ambiguous preview service')
        result[service] = container
    require({'api', 'worker', 'postgres', 'admin', 'gateway', 'prepare-secrets'} <= set(result), 'Preview service missing')
    return result


def compose(container):
    labels = container['Config']['Labels']
    require(labels.get('com.docker.compose.project') == 'beauty-preview', 'Unexpected project')
    working = labels.get('com.docker.compose.project.working_dir', '')
    require(working.startswith('/opt/epifiz/') and Path(working).is_dir(), 'Compose directory unavailable')
    args = ['docker', 'compose', '-p', 'beauty-preview', '--project-directory', working]
    for key, flag in [('environment_file', '--env-file'), ('config_files', '-f')]:
        values = labels.get('com.docker.compose.project.' + key, '').split(',')
        require(bool(values), 'Compose inputs unavailable')
        for value in values:
            require(value.startswith('/opt/epifiz/') and Path(value).is_file(), 'Compose input unavailable')
            args.extend([flag, value])
    return args


def validate_delta(before, after, service, image):
    candidate = copy.deepcopy(after)
    require(candidate['services'][service]['image'] == image, 'Candidate image mismatch')
    candidate['services'][service]['image'] = before['services'][service]['image']
    require(candidate == before, 'Candidate changes more than one service image')


def verify_others(before, after, changed):
    require(set(before) == set(after), 'Preview inventory changed')
    for service in set(before) - set(changed):
        require(all(before[service].get(key) == after[service].get(key) for key in ['Id', 'Image', 'RestartCount']) and before[service]['State']['StartedAt'] == after[service]['State']['StartedAt'], 'Unrelated service changed')


def environment(container):
    return dict(value.split('=', 1) for value in container['Config'].get('Env', []) if '=' in value)


def verify_runtime(original, current, service_config, image):
    require(current['Image'] == image and current['State'].get('Running'), 'Service image or state mismatch')
    require(current['HostConfig'] == original['HostConfig'], 'Service host/security settings changed')
    for key in ['Cmd', 'Entrypoint', 'User', 'WorkingDir']:
        require(current['Config'].get(key) == original['Config'].get(key), 'Service process settings changed')
    image_info = json.loads(run(['docker', 'image', 'inspect', image]))[0]
    expected = environment(image_info)
    expected.update({key: str(value) for key, value in service_config.get('environment', {}).items()})
    require(environment(current) == expected, 'Service environment mismatch')


def sql(query):
    return run(['docker', 'exec', 'beauty-preview-postgres-1', 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'beauty', '-d', 'beauty_preview', '-c', 'SET statement_timeout=5000; SET lock_timeout=1000; BEGIN READ ONLY; ' + query + '; COMMIT;'], limit=60000).strip()


def queue_empty():
    count = sql('SELECT count(*) FROM "BackgroundJob" WHERE type=\'MVP_CATALOG_EMBED_V1\' AND status::text IN (\'PENDING\',\'PROCESSING\',\'RETRYING\')')
    require(count == '0', 'Paid-provider queue not empty; no publication')


def schema_state():
    return json.loads(sql('''SELECT json_build_object('columns',(SELECT COALESCE(json_agg(column_name ORDER BY column_name),'[]'::json) FROM information_schema.columns WHERE table_schema='public' AND table_name='MvpPhotoAnalysis' AND column_name IN ('matchingStatus','matchingRequestId','matchingOutput')),'migrations',(SELECT COALESCE(json_agg(json_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL)),'[]'::json) FROM "_prisma_migrations" WHERE rolled_back_at IS NULL))'''))


def migration_manifest():
    script = "const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto');const root='/repo/apps/api/prisma/migrations';console.log(JSON.stringify(Object.fromEntries(fs.readdirSync(root).filter(n=>/^\\d{14}_[a-z0-9_]+$/.test(n)).sort().map(n=>[n,c.createHash('sha256').update(fs.readFileSync(p.join(root,n,'migration.sql'))).digest('hex')]))))"
    result = json.loads(run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', MIGRATE_IMAGE, '-e', script]))
    require(result.get(MIGRATION) == MIGRATION_SHA, 'Reviewed migration checksum mismatch')
    return result


def validate_migrations(state, candidate):
    require(state['columns'] == [], 'Matching columns already exist; inspect before publication')
    applied = {}
    for row in state['migrations']:
        require(row.get('finished') is True and row['name'] not in applied, 'Incomplete/ambiguous prior migration')
        applied[row['name']] = row['checksum']
    require(bool(applied) and all(candidate.get(name) == digest for name, digest in applied.items()), 'Historical migration drift')
    require(set(candidate) - set(applied) == {MIGRATION}, 'Unexpected pending migration set')


def ready():
    api = inspect('beauty-preview-api-1')
    require(api['State'].get('Running') and api['State'].get('Health', {}).get('Status') == 'healthy', 'API is not healthy')
    require(inspect('beauty-preview-worker-1')['State'].get('Running'), 'Privacy worker is not running')
    for host in ['preview.13-51-112-228.sslip.io', 'admin.13-51-112-228.sslip.io']:
        origin = 'https://' + host
        with urllib.request.urlopen(urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin}), timeout=5) as reply:
            require(reply.status == 200 and reply.headers.get('Access-Control-Allow-Origin') == origin, 'Health/CORS check failed')


def private_guard():
    try:
        with urllib.request.urlopen('https://preview.13-51-112-228.sslip.io/api/mvp/v1/visual/sessions', timeout=5):
            raise Stop('Private read accepted an unauthenticated request')
    except urllib.error.HTTPError as error:
        require(error.code == 401, 'Private read guard failed')


def wait_ready():
    for attempt in range(25):
        try:
            ready()
            return
        except Exception:
            if attempt == 24:
                raise Stop('Readiness deadline reached') from None
            time.sleep(3)


def runtime_modules(container):
    code = "const fs=require('node:fs'),c=require('node:crypto'),p=require('/application/node_modules/@prisma/client').Prisma;const fields=p.dmmf.datamodel.models.find(m=>m.name==='MvpPhotoAnalysis').fields.filter(f=>['matchingStatus','matchingRequestId','matchingOutput'].includes(f.name)).map(f=>f.name).sort();const names=" + json.dumps(MODULES) + ";console.log(JSON.stringify({fields,modules:Object.fromEntries(names.map(n=>[n,c.createHash('sha256').update(fs.readFileSync('/application/dist/mvp/'+n+'.js')).digest('hex')]))}))"
    return json.loads(run(['docker', 'exec', container, 'node', '-e', code], limit=10000))


def verify_modules(container, evidence):
    require(runtime_modules(container) == {'fields': FIELDS, 'modules': evidence['modules']}, 'Deployed Prisma/module identity mismatch')


def worker_ready(original, service_config, evidence):
    current = inspect('beauty-preview-worker-1')
    verify_runtime(original, current, service_config, API_IMAGE)
    require(current['RestartCount'] == 0, 'New worker restarted')
    verify_modules('beauty-preview-worker-1', evidence)
    time.sleep(5)
    again = inspect('beauty-preview-worker-1')
    require(again['State'].get('Running') and again['RestartCount'] == 0 and again['State']['StartedAt'] == current['State']['StartedAt'], 'New worker did not stay running')


def download_package(url):
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == 'https' and parsed.hostname and parsed.hostname.endswith('.blob.core.windows.net') and not parsed.username and not parsed.password, 'Unexpected artifact transfer destination')
    archive = WORK / 'artifact.zip'
    digest = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(url, timeout=30) as response, open(archive, 'xb') as output:
        while True:
            chunk = response.read(4 * 1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            require(total <= ZIP_SIZE, 'Artifact size exceeded')
            digest.update(chunk)
            output.write(chunk)
    require(total == ZIP_SIZE and digest.hexdigest() == ZIP_SHA, 'Artifact ZIP integrity mismatch')
    allowed = {'images.tar.gz': TAR_SIZE, 'release.json': 10000, 'api-evidence.json': 20000, 'worker-evidence.json': 20000}
    with zipfile.ZipFile(archive) as source:
        require(len(source.infolist()) == len(allowed) and set(source.namelist()) == set(allowed), 'Unexpected artifact inventory')
        for item in source.infolist():
            require(item.file_size <= allowed[item.filename], 'Artifact entry size exceeded')
            with source.open(item) as data, open(WORK / item.filename, 'xb') as output:
                shutil.copyfileobj(data, output, 1024 * 1024)
    tar = WORK / 'images.tar.gz'
    with tar.open('rb') as stream:
        require(tar.stat().st_size == TAR_SIZE and hashlib.file_digest(stream, 'sha256').hexdigest() == TAR_SHA, 'Image archive integrity mismatch')
    manifest = json.loads((WORK / 'release.json').read_text())
    require(manifest == {'source': SOURCE, 'images': {'api': API_IMAGE, 'migrate': MIGRATE_IMAGE}, 'archive': {'name': 'images.tar.gz', 'bytes': TAR_SIZE, 'sha256': TAR_SHA}, 'rehearsal': 'PASS', 'liveDeployment': False, 'providerRequests': 0}, 'Release manifest mismatch')
    evidence = json.loads((WORK / 'api-evidence.json').read_text())
    require(evidence == json.loads((WORK / 'worker-evidence.json').read_text()), 'API/worker rehearsal differs')
    require(evidence.get('source') == SOURCE and evidence.get('prismaVersion') == '6.19.0' and evidence.get('matchingFields') == FIELDS and evidence.get('isolatedDatabase') == 'PASS', 'Rehearsal evidence mismatch')
    require(set(evidence.get('modules', {})) == set(MODULES) and all(re.fullmatch(r'[0-9a-f]{64}', value) for value in evidence['modules'].values()), 'Invalid module fingerprint set')
    run(['docker', 'load', '-i', str(tar)], timeout=300)
    for image in [API_IMAGE, MIGRATE_IMAGE]:
        require(json.loads(run(['docker', 'image', 'inspect', image]))[0]['Id'] == image, 'Loaded image identity mismatch')
    return evidence


def overlay(command, baseline, service, image):
    path = WORK / (service + '-image.json')
    path.write_text(json.dumps({'services': {service: {'image': image}}}) + '\n')
    args = command + ['-f', str(path)]
    candidate = json.loads(run(args + ['config', '--format', 'json']))
    validate_delta(baseline, candidate, service, image)
    return args, candidate


def write_record(record):
    path = WORK / 'result.json'
    temporary = WORK / 'result.pending'
    temporary.write_text(json.dumps(record, indent=2) + '\n')
    temporary.replace(path)


def recreate(command, service):
    run(command + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', service], timeout=100)


def rollback(commands, before, candidate_api_attempted):
    # Once a candidate API could have saved matching data, never downgrade its cleaner.
    if candidate_api_attempted:
        recreate(commands['api'], 'api')
        worker = inspect('beauty-preview-worker-1')
        require(worker['Image'] == API_IMAGE and worker['State'].get('Running'), 'Verified new cleaner must remain available')
    else:
        recreate(commands['worker'], 'worker')
        recreate(commands['api'], 'api')
    wait_ready()
    require(inspect('beauty-preview-api-1')['Image'] == PREVIOUS['api'], 'API rollback image mismatch')
    expected_worker = API_IMAGE if candidate_api_attempted else PREVIOUS['worker']
    require(inspect('beauty-preview-worker-1')['Image'] == expected_worker, 'Worker rollback state mismatch')
    verify_others(before, snapshot(), {'api', 'worker'})
    return 'API_ROLLED_BACK_NEW_PRIVACY_WORKER_RETAINED' if candidate_api_attempted else 'ROLLED_BACK'


def publish(url):
    require(not WORK.exists() and not WORK.is_symlink(), 'Existing publication state; inspect before replay')
    require(shutil.disk_usage(ROOT).free >= 8 * 1024**3, 'Insufficient safe preparation disk space')
    before = snapshot()
    ready()
    queue_empty()
    marker = ROOT / 'matching-one-approved-test-20261029/result.json'
    require(marker.is_file() and not marker.is_symlink() and json.loads(marker.read_text()).get('status') == 'RESTORED', 'Prior paid-test window is not restored')
    commands, baselines = {}, {}
    for service in ['api', 'worker']:
        require(before[service]['Image'] == PREVIOUS[service], 'Observed service image drift')
        require(environment(before[service]).get('MVP_AI_DAILY_REQUEST_LIMIT') == '5' and environment(before[service]).get('MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT') == '20', 'Observed quota drift')
        commands[service] = compose(before[service])
        baselines[service] = json.loads(run(commands[service] + ['config', '--format', 'json']))
        expected_hash = run(commands[service] + ['config', '--hash', service]).split()[-1]
        require(expected_hash == before[service]['Config']['Labels'].get('com.docker.compose.config-hash'), 'Compose input drift')
        current_image = baselines[service]['services'][service]['image']
        require(json.loads(run(['docker', 'image', 'inspect', current_image]))[0]['Id'] == PREVIOUS[service], 'Compose image drift')
    WORK.mkdir(mode=0o700)
    record = {'status': 'PREPARING', 'source': SOURCE, 'previous': PREVIOUS, 'image': API_IMAGE, 'rollback': commands, 'providerRequestsStartedByVerification': 0}
    write_record(record)
    stopped = False
    candidate_api_attempted = False
    try:
        evidence = download_package(url)
        validate_migrations(schema_state(), migration_manifest())
        api, api_config = overlay(commands['api'], baselines['api'], 'api', API_IMAGE)
        worker, worker_config = overlay(commands['worker'], baselines['worker'], 'worker', API_IMAGE)
        migrate, _ = overlay(commands['api'], baselines['api'], 'migrate', MIGRATE_IMAGE)
        verify_others(before, snapshot(), set())
        record['status'] = 'PREPARED'
        write_record(record)
        stopped = True
        run(commands['api'] + ['stop', '--timeout', '30', 'api'], timeout=40)
        run(commands['worker'] + ['stop', '--timeout', '30', 'worker'], timeout=40)
        queue_empty()
        record['status'] = 'MIGRATING'
        write_record(record)
        run(migrate + ['run', '--rm', '--no-deps', 'migrate'], timeout=120)
        state = schema_state()
        require(state['columns'] == FIELDS and any(row['name'] == MIGRATION and row['finished'] and row['checksum'] == MIGRATION_SHA for row in state['migrations']) and all(row['finished'] for row in state['migrations']), 'Applied migration did not verify')
        record['status'] = 'UPGRADING_WORKER'
        write_record(record)
        recreate(worker, 'worker')
        worker_ready(before['worker'], worker_config['services']['worker'], evidence)
        record['status'] = 'UPGRADING_API'
        write_record(record)
        candidate_api_attempted = True
        recreate(api, 'api')
        wait_ready()
        verify_runtime(before['api'], inspect('beauty-preview-api-1'), api_config['services']['api'], API_IMAGE)
        verify_modules('beauty-preview-api-1', evidence)
        worker_ready(before['worker'], worker_config['services']['worker'], evidence)
        private_guard()
        verify_others(before, snapshot(), {'api', 'worker'})
        record.update(status='COMPLETED', moduleSha256=evidence['modules'], matchingFields=FIELDS, migration=MIGRATION)
        write_record(record)
        print('COMPLETED: reviewed migration, API and privacy worker verified; health/CORS/authentication PASS')
        print('SOURCE ' + SOURCE)
        print('API_WORKER_IMAGE ' + API_IMAGE)
        print('No paid-provider request, quota/key/retention change, customer-content inspection or unrelated-service update was requested')
    except Exception:
        record['status'] = 'PREPARATION_FAILED'
        if stopped:
            try:
                record['status'] = rollback(commands, before, candidate_api_attempted)
            except Exception:
                record['status'] = 'ROLLBACK_NEEDS_REVIEW'
        write_record(record)
        print('Publication stopped; state: ' + record['status'] + '; inspect before any retry')
        raise Stop('Publication did not complete; private diagnostics withheld') from None


def main(url):
    os.umask(0o077)
    require(ROOT.is_dir() and not ROOT.is_symlink(), 'Operations directory unavailable')
    with open(ROOT / 'saved-matching-release-20261031.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        publish(url)


if __name__ == '__main__':
    try:
        main(TRANSFER_URL)
    except Exception as error:
        print(str(error) if isinstance(error, Stop) else 'Publication stopped; private diagnostics withheld')
        raise SystemExit(1)
