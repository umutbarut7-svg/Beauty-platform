"""Publish the reviewed service-compatibility code-only preview release. Never log secrets."""
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
WORK = ROOT / 'visual-service-release-20261104-1'
SOURCE = '04009b390d014431fe0d4fd99c965e2ce134fa20'
API_IMAGE = 'sha256:d2b7ae718ad2ad78aa2ce4700646b4e37f3b861f0b39362e47af47219f11b5b6'
MIGRATE_IMAGE = 'sha256:207e6599c8b8a17fe957f5e833f778f3c770d5e4255bb6d495bb8c452578737f'
PREVIOUS = {service: 'sha256:8d47e73a44a5e2d1ec7df3a54c8feaeb315271c819a8e3217237745d62206225' for service in ['api', 'worker']}
ZIP_SHA = 'fc4c518d58180ba814a1513a60b3dd034cff0397c62d09732837bc9b0e0c6a3c'
ZIP_SIZE = 771698176
TAR_SHA = '49aae4982ce4204f5908e0f98170514f6b7b5a6b7eaffe672d0ea1285745d5bb'
TAR_SIZE = 771695484
MIGRATION = '20261030000000_visual_matching_recovery'
MIGRATION_SHA = '9019aa2f5582dff9ce12b3f66c5b3cc0d06196e57e598d6d26a46fd61b6b26a9'
FIELDS = ['matchingOutput', 'matchingRequestId', 'matchingStatus']
MODULES = ['mvp.module', 'visual.service', 'visual.controller', 'semantic.service', 'visual-matches.service', 'visual-service-compatibility', 'photo-maintenance.service']


class Stop(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Stop(message)


def file_sha256(path):
    # The preview host may use Python before 3.11; do not require file_digest.
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


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
    # This release must have exactly the existing, completed schema. Never migrate.
    require(state['columns'] == FIELDS, 'Expected existing matching columns')
    applied = {}
    for row in state['migrations']:
        require(row.get('finished') is True and row['name'] not in applied, 'Incomplete/ambiguous migration')
        applied[row['name']] = row['checksum']
    require(bool(applied) and applied == candidate, 'Code-only release requires identical migration inventories')
    require(applied.get(MIGRATION) == MIGRATION_SHA, 'Existing matching migration differs')


def schema_identity(state):
    return {'columns': state['columns'], 'migrations': {row['name']: (row['checksum'], row['finished']) for row in state['migrations']}}


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
    if archive.exists():
        require(archive.is_file() and not archive.is_symlink(), 'Existing artifact path requires review')
    else:
        total = 0
        with urllib.request.urlopen(url, timeout=30) as response, open(archive, 'xb') as output:
            while True:
                chunk = response.read(4 * 1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                require(total <= ZIP_SIZE, 'Artifact size exceeded')
                output.write(chunk)
    require(archive.stat().st_size == ZIP_SIZE and file_sha256(archive) == ZIP_SHA, 'Artifact ZIP integrity mismatch')
    allowed = {'images.tar.gz': TAR_SIZE, 'release.json': 10000, 'api-evidence.json': 20000, 'worker-evidence.json': 20000}
    with zipfile.ZipFile(archive) as source:
        require(len(source.infolist()) == len(allowed) and set(source.namelist()) == set(allowed), 'Unexpected artifact inventory')
        for item in source.infolist():
            require(item.file_size <= allowed[item.filename], 'Artifact entry size exceeded')
            target = WORK / item.filename
            if target.exists():
                require(target.is_file() and not target.is_symlink() and target.stat().st_size == item.file_size, 'Existing artifact entry requires review')
                if item.filename == 'images.tar.gz':
                    require(file_sha256(target) == TAR_SHA, 'Existing image archive integrity mismatch')
                else:
                    require(target.read_bytes() == source.read(item), 'Existing metadata differs from the pinned ZIP')
            else:
                with source.open(item) as data, open(target, 'xb') as output:
                    shutil.copyfileobj(data, output, 1024 * 1024)
    tar = WORK / 'images.tar.gz'
    require(tar.stat().st_size == TAR_SIZE and file_sha256(tar) == TAR_SHA, 'Image archive integrity mismatch')
    manifest = json.loads((WORK / 'release.json').read_text())
    require(manifest == {'source': SOURCE, 'images': {'api': API_IMAGE, 'migrate': MIGRATE_IMAGE}, 'archive': {'name': 'images.tar.gz', 'bytes': TAR_SIZE, 'sha256': TAR_SHA}, 'rehearsal': 'PASS', 'liveDeployment': False, 'providerRequests': 0}, 'Release manifest mismatch')
    evidence = json.loads((WORK / 'api-evidence.json').read_text())
    require(evidence == json.loads((WORK / 'worker-evidence.json').read_text()), 'API/worker rehearsal differs')
    require(evidence.get('source') == SOURCE and evidence.get('prismaVersion') == '6.19.0' and evidence.get('matchingFields') == FIELDS and evidence.get('isolatedDatabase') == 'PASS' and evidence.get('compiledCompatibilityAssertions') == 6, 'Rehearsal evidence mismatch')
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
    require(not WORK.is_symlink(), 'Operation directory cannot be a symlink')
    require(not WORK.exists(), 'Existing operation cannot be replayed; inspect before retry')
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
    initial_schema = schema_state()
    WORK.mkdir(mode=0o700)
    record = {'status': 'PREPARING', 'source': SOURCE, 'previous': PREVIOUS, 'image': API_IMAGE, 'rollback': commands, 'providerRequestsStartedByVerification': 0, 'schemaChange': False}
    write_record(record)
    stopped = False
    candidate_api_attempted = False
    try:
        evidence = download_package(url)
        validate_migrations(schema_state(), migration_manifest())
        api, api_config = overlay(commands['api'], baselines['api'], 'api', API_IMAGE)
        worker, worker_config = overlay(commands['worker'], baselines['worker'], 'worker', API_IMAGE)
        verify_others(before, snapshot(), set())
        record['status'] = 'PREPARED'
        write_record(record)
        stopped = True
        run(commands['api'] + ['stop', '--timeout', '30', 'api'], timeout=40)
        run(commands['worker'] + ['stop', '--timeout', '30', 'worker'], timeout=40)
        queue_empty()
        require(schema_identity(schema_state()) == schema_identity(initial_schema), 'Schema changed during code preparation')
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
        require(schema_identity(schema_state()) == schema_identity(initial_schema), 'Schema changed during code update')
        verify_others(before, snapshot(), {'api', 'worker'})
        record.update(status='COMPLETED', moduleSha256=evidence['modules'], matchingFields=FIELDS, schemaChange=False)
        write_record(record)
        print('COMPLETED: code-only API and privacy worker verified; health/CORS/authentication PASS')
        print('SOURCE ' + SOURCE)
        print('API_WORKER_IMAGE ' + API_IMAGE)
        print('No paid-provider request, quota/key/retention change, customer-content inspection or unrelated-service update was requested')
    except Exception as error:
        record['status'] = 'PREPARATION_FAILED'
        if stopped:
            try:
                record['status'] = rollback(commands, before, candidate_api_attempted)
            except Exception:
                record['status'] = 'ROLLBACK_NEEDS_REVIEW'
        write_record(record)
        print('Publication stopped; state: ' + record['status'] + '; inspect before any retry')
        print('Preparation diagnostic: ' + (str(error) if isinstance(error, Stop) else type(error).__name__))
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
