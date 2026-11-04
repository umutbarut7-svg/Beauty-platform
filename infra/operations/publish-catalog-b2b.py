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
WORK = ROOT / 'catalog-b2b-release-20261104-1'
SOURCE = '2e0c52f705d4ec26f161720a97914aa56965e0c2'
API_IMAGE = 'sha256:930a560695c5e251ddb29311135277e6fc63cfeacb96c881f31fa17baa5dfc62'
MIGRATE_IMAGE = 'sha256:c45e73115d8ac2224136e59c233c9a986763e8c3d1eb3d81fe62ef20c22841b9'
PREVIOUS = {'api': 'sha256:6370a6ed976c6b074c001e7c6db84156443c988f3d53342cde32cdd7e6e46936', 'worker': 'sha256:6370a6ed976c6b074c001e7c6db84156443c988f3d53342cde32cdd7e6e46936'}
ZIP_SHA = '68a6c773a7ae640b22578659cc4bd36a73dc5f85965b0f86f1363bf65310af7b'
ZIP_SIZE = 772034003
TAR_SHA = '8091beee269f3e52d71554f50063d114f5b7eb2462cf8b918491a4c2f6176177'
TAR_SIZE = 772029447
FIELDS = ['matchingOutput', 'matchingRequestId', 'matchingStatus']
MODULES = ['app.module', 'auth/permissions.service', 'database/prisma.service', 'mvp/mvp.service', 'inventory/inventory-policy', 'inventory/inventory.module', 'inventory/inventory.controller', 'inventory/inventory.dto', 'inventory/inventory.service', 'b2b/b2b.module', 'b2b/b2b.controller', 'b2b/b2b.dto', 'b2b/b2b.service', 'mvp/visual.service', 'mvp/visual-matches.service', 'mvp/photo-maintenance.service']
MODELS = ['CatalogProduct', 'InventoryMovement', 'InventoryOperation', 'SupplierProfile', 'B2BQuoteRequest']
MIGRATIONS = {'20261104000000_product_inventory': '823a628a4eae48d3226f12672227035aeb8fcb6db2f47351990bbf8f139656fd', '20261104010000_b2b_supplier_bridge': '684436e080e0e4289fc68bbac660a33ee4a61c2926beddbf4c78bef36d51e64a'}
FLAGS = ['MVP_INVENTORY_ENABLED', 'MVP_B2B_ENABLED']


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


def validate_delta(before, after, service, image, activate=False):
    candidate = copy.deepcopy(after)
    require(candidate['services'][service]['image'] == image, 'Candidate image mismatch')
    candidate['services'][service]['image'] = before['services'][service]['image']
    if activate:
        require(service == 'api', 'Only the API may activate catalog flags')
        original = before['services'][service].get('environment', {})
        changed = candidate['services'][service].get('environment', {})
        require(all(changed.get(flag) == 'true' and original.get(flag) in [None, 'false'] for flag in FLAGS), 'Unexpected catalog activation values')
        for flag in FLAGS:
            if flag in original:
                changed[flag] = original[flag]
            else:
                changed.pop(flag, None)
        if not changed and 'environment' not in before['services'][service]:
            candidate['services'][service].pop('environment', None)
    require(candidate == before, 'Candidate changes an unreviewed service setting')

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
    return json.loads(sql("SELECT json_build_object('columns',(SELECT COALESCE(json_agg(column_name ORDER BY column_name),'[]'::json) FROM information_schema.columns WHERE table_schema='public' AND table_name='MvpPhotoAnalysis' AND column_name IN ('matchingStatus','matchingRequestId','matchingOutput')),'tables',(SELECT COALESCE(json_agg(table_name ORDER BY table_name),'[]'::json) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('CatalogProduct','InventoryMovement','InventoryOperation','SupplierProfile','B2BQuoteRequest')),'migrations',(SELECT COALESCE(json_agg(json_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL)),'[]'::json) FROM \"_prisma_migrations\" WHERE rolled_back_at IS NULL))"))

def migration_manifest():
    script = "const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto');const root='/repo/apps/api/prisma/migrations';console.log(JSON.stringify(Object.fromEntries(fs.readdirSync(root).filter(n=>/^\\d{14}_[a-z0-9_]+$/.test(n)).sort().map(n=>[n,c.createHash('sha256').update(fs.readFileSync(p.join(root,n,'migration.sql'))).digest('hex')]))))"
    result = json.loads(run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', MIGRATE_IMAGE, '-e', script]))
    require(all(result.get(name) == digest for name, digest in MIGRATIONS.items()), 'Reviewed catalog migration checksum mismatch')
    return result

def validate_migrations(state, candidate):
    require(state['columns'] == FIELDS and state['tables'] == [], 'Existing privacy fields or new catalog tables differ from the baseline')
    applied = {}
    for row in state['migrations']:
        require(row.get('finished') is True and row['name'] not in applied, 'Incomplete/ambiguous prior migration')
        applied[row['name']] = row['checksum']
    require(bool(applied) and all(candidate.get(name) == digest for name, digest in applied.items()), 'Historical migration drift')
    require(set(candidate) - set(applied) == set(MIGRATIONS), 'Unexpected pending migration set')
    require(all(candidate.get(name) == digest for name, digest in MIGRATIONS.items()), 'Reviewed catalog migration checksum mismatch')

def ready():
    api = inspect('beauty-preview-api-1')
    require(api['State'].get('Running') and api['State'].get('Health', {}).get('Status') == 'healthy', 'API is not healthy')
    require(inspect('beauty-preview-worker-1')['State'].get('Running'), 'Privacy worker is not running')
    for host in ['preview.13-51-112-228.sslip.io', 'admin.13-51-112-228.sslip.io']:
        origin = 'https://' + host
        with urllib.request.urlopen(urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin}), timeout=5) as reply:
            require(reply.status == 200 and reply.headers.get('Access-Control-Allow-Origin') == origin, 'Health/CORS check failed')


def private_guard():
    for endpoint in ['/mvp/v1/visual/sessions', '/businesses/catalog-auth-probe/products', '/businesses/catalog-auth-probe/b2b/profile']:
        try:
            with urllib.request.urlopen('https://preview.13-51-112-228.sslip.io/api' + endpoint, timeout=5):
                raise Stop('Private read accepted an unauthenticated request')
        except urllib.error.HTTPError as error:
            require(error.code == 401, 'Private catalog/visual read guard failed')

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
    code = "const fs=require('node:fs'),c=require('node:crypto'),p=require('/application/node_modules/@prisma/client').Prisma;const fields=p.dmmf.datamodel.models.find(m=>m.name==='MvpPhotoAnalysis').fields.filter(f=>['matchingStatus','matchingRequestId','matchingOutput'].includes(f.name)).map(f=>f.name).sort();const names=" + json.dumps(MODULES) + ";const models=" + json.dumps(MODELS) + ";console.log(JSON.stringify({fields,models:models.filter(n=>p.dmmf.datamodel.models.some(m=>m.name===n)),modules:Object.fromEntries(names.map(n=>[n,c.createHash('sha256').update(fs.readFileSync('/application/dist/'+n+'.js')).digest('hex')]))}))"
    return json.loads(run(['docker', 'exec', container, 'node', '-e', code], limit=20000))

def verify_modules(container, evidence):
    require(runtime_modules(container) == {'fields': FIELDS, 'models': MODELS, 'modules': evidence['modules']}, 'Deployed Prisma/module identity mismatch')

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
    require(evidence.get('source') == SOURCE and evidence.get('prismaVersion') == '6.19.0' and evidence.get('models') == MODELS and evidence.get('isolatedDatabase') == 'PASS' and evidence.get('compiledInventoryAssertions') == 10 and evidence.get('compiledB2BAssertions') == 8 and evidence.get('providerRequests') == 0 and evidence.get('liveDeployment') is False, 'Rehearsal evidence mismatch')
    require(set(evidence.get('modules', {})) == set(MODULES) and all(re.fullmatch(r'[0-9a-f]{64}', value) for value in evidence['modules'].values()), 'Invalid module fingerprint set')
    run(['docker', 'load', '-i', str(tar)], timeout=300)
    for image in [API_IMAGE, MIGRATE_IMAGE]:
        require(json.loads(run(['docker', 'image', 'inspect', image]))[0]['Id'] == image, 'Loaded image identity mismatch')
    return evidence


def overlay(command, baseline, service, image, activate=False):
    path = WORK / (service + '-image.json')
    changes = {'image': image}
    if activate:
        changes['environment'] = {flag: 'true' for flag in FLAGS}
    path.write_text(json.dumps({'services': {service: changes}}) + '\n')
    args = command + ['-f', str(path)]
    candidate = json.loads(run(args + ['config', '--format', 'json']))
    validate_delta(baseline, candidate, service, image, activate)
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


def validate_preparation_resume(record, commands, state):
    require(record.get('status') == 'PREPARATION_FAILED', 'Only an inspected pre-service preparation can resume')
    require(record.get('source') == SOURCE and record.get('previous') == PREVIOUS and record.get('image') == API_IMAGE and record.get('rollback') == commands, 'Preparation source or original Compose inputs differ')
    require(state['columns'] == FIELDS and state['tables'] == [] and all(row.get('finished') is True and row['name'] not in MIGRATIONS for row in state['migrations']), 'Schema changed since failed preparation; no resume')

def publish(url):
    require(not WORK.is_symlink(), 'Operation directory cannot be a symlink')
    previous_record = None
    if WORK.exists():
        marker = WORK / 'result.json'
        require(WORK.is_dir() and marker.is_file() and not marker.is_symlink() and marker.stat().st_size <= 60000, 'Existing publication state requires review')
        previous_record = json.loads(marker.read_text())
        require(previous_record.get('status') == 'PREPARATION_FAILED', 'Existing publication phase cannot be replayed')
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
        require(all(environment(before[service]).get(flag) in [None, 'false'] for flag in FLAGS), 'Catalog gates are already active; inspect before publication')
        commands[service] = compose(before[service])
        baselines[service] = json.loads(run(commands[service] + ['config', '--format', 'json']))
        expected_hash = run(commands[service] + ['config', '--hash', service]).split()[-1]
        require(expected_hash == before[service]['Config']['Labels'].get('com.docker.compose.config-hash'), 'Compose input drift')
        current_image = baselines[service]['services'][service]['image']
        require(json.loads(run(['docker', 'image', 'inspect', current_image]))[0]['Id'] == PREVIOUS[service], 'Compose image drift')
    if previous_record is not None:
        validate_preparation_resume(previous_record, commands, schema_state())
        allowed = {'artifact.zip', 'images.tar.gz', 'release.json', 'api-evidence.json', 'worker-evidence.json', 'result.json', 'result.pending', 'api-image.json', 'worker-image.json', 'migrate-image.json'}
        require(all(path.name in allowed and path.is_file() and not path.is_symlink() for path in WORK.iterdir()), 'Unexpected inspected preparation inventory')
    else:
        WORK.mkdir(mode=0o700)
    record = {'status': 'PREPARING', 'source': SOURCE, 'previous': PREVIOUS, 'image': API_IMAGE, 'rollback': commands, 'providerRequestsStartedByVerification': 0, 'resumedVerifiedPreparation': previous_record is not None}
    write_record(record)
    stopped = False
    candidate_api_attempted = False
    try:
        evidence = download_package(url)
        validate_migrations(schema_state(), migration_manifest())
        api, api_config = overlay(commands['api'], baselines['api'], 'api', API_IMAGE, activate=True)
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
        require(state['columns'] == FIELDS and state['tables'] == sorted(MODELS) and all(any(row['name'] == name and row['finished'] and row['checksum'] == digest for row in state['migrations']) for name, digest in MIGRATIONS.items()) and all(row['finished'] for row in state['migrations']), 'Applied migration did not verify')
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
        record.update(status='COMPLETED', moduleSha256=evidence['modules'], matchingFields=FIELDS, migrations=MIGRATIONS, activatedFeatures=['inventory', 'b2b'])
        write_record(record)
        print('COMPLETED: reviewed migration, API and privacy worker verified; inventory/B2B activation and health/CORS/authentication PASS')
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
    with open(ROOT / 'catalog-b2b-release-20261104.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        publish(url)


if __name__ == '__main__':
    try:
        main(TRANSFER_URL)
    except Exception as error:
        print(str(error) if isinstance(error, Stop) else 'Publication stopped; private diagnostics withheld')
        raise SystemExit(1)
