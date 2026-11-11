"""Apply one immutable admin image; preserve every other preview service."""
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
WORK = ROOT / 'admin-release-20261111-1'
SOURCE = '61f97f0ed996844917be036a77e36d9aad999a94'
TREE = '20e98849b6e0c8ac29a00132c60b2cc04f6aac34'
API_URL = 'https://preview.13-51-112-228.sslip.io/api'
ADMIN_URL = 'https://admin.13-51-112-228.sslip.io'
LOGO = '16ad3fabe252740fb9ec97316ac63a4b1c4c4648ef333e0a08027c3430bc0fa4'

# These bounded runtime checks are reused unchanged from the reviewed preview publisher.
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

def ready():
    api = inspect('beauty-preview-api-1')
    require(api['State'].get('Running') and api['State'].get('Health', {}).get('Status') == 'healthy', 'API is not healthy')
    require(inspect('beauty-preview-worker-1')['State'].get('Running'), 'Privacy worker is not running')
    for host in ['preview.13-51-112-228.sslip.io', 'admin.13-51-112-228.sslip.io']:
        origin = 'https://' + host
        with urllib.request.urlopen(urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin}), timeout=5) as reply:
            require(reply.status == 200 and reply.headers.get('Access-Control-Allow-Origin') == origin, 'Health/CORS check failed')

def wait_ready():
    for attempt in range(25):
        try:
            ready()
            return
        except Exception:
            if attempt == 24:
                raise Stop('Readiness deadline reached') from None
            time.sleep(3)

def validate_release(release):
    require(set(release) == {'request_id', 'mode', 'artifact', 'manifest'}, 'Unexpected release fields')
    require(release['request_id'] == 'orzell-admin-publication-20261111-1' and release['mode'] == 'admin-only-publication', 'Unexpected release operation')
    artifact, manifest = release['artifact'], release['manifest']
    require(set(artifact) == {'id', 'run', 'head', 'bytes', 'sha256'}, 'Artifact fields differ')
    require(all(type(artifact[k]) is int and artifact[k] > 0 for k in ['id', 'run', 'bytes']) and artifact['bytes'] <= 1500000000, 'Artifact size/identity outside bounds')
    require(re.fullmatch(r'[0-9a-f]{40}', artifact['head']) and re.fullmatch(r'[0-9a-f]{64}', artifact['sha256']), 'Artifact hashes invalid')
    require(set(manifest) == {'source','sourceTree','apiUrl','image','imageBytes','logoSha256','archive','rehearsal','network','publicPorts','providerRequests','liveDeployment'}, 'Manifest fields differ')
    require(manifest['source'] == SOURCE and manifest['sourceTree'] == TREE and manifest['apiUrl'] == API_URL and manifest['logoSha256'] == LOGO, 'Reviewed application identity differs')
    require(manifest['rehearsal'] == 'PASS' and manifest['network'] == 'none' and manifest['publicPorts'] is False and manifest['providerRequests'] == 0 and manifest['liveDeployment'] is False, 'Isolated image rehearsal is required')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', manifest['image']) and type(manifest['imageBytes']) is int and 0 < manifest['imageBytes'] <= 2500000000, 'Image identity/size invalid')
    archive = manifest['archive']
    require(set(archive) == {'name','bytes','sha256'} and archive['name'] == 'admin-image.tar.gz' and type(archive['bytes']) is int and 0 < archive['bytes'] <= 1000000000 and re.fullmatch(r'[0-9a-f]{64}', archive['sha256']), 'Image archive fields invalid')


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4*1024*1024), b''): value.update(block)
    return value.hexdigest()


def validate_delta(before, after, image):
    candidate = copy.deepcopy(after)
    require(candidate['services']['admin']['image'] == image, 'Admin image differs')
    candidate['services']['admin']['image'] = before['services']['admin']['image']
    require(candidate == before, 'Unreviewed Compose change; only admin image may change')


def overlay(command, baseline, image, name):
    path = WORK / name
    path.write_text(json.dumps({'services': {'admin': {'image': image}}})+'\n')
    args = command + ['-f', str(path)]
    config = json.loads(run(args + ['config', '--format', 'json']))
    validate_delta(baseline, config, image)
    return args, config


def recreate(command):
    run(command + ['up','-d','--no-deps','--no-build','--pull','never','admin'], timeout=100)


def download(release, url):
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == 'https' and parsed.hostname and parsed.hostname.endswith('.blob.core.windows.net') and not parsed.username and not parsed.password, 'Unexpected artifact destination')
    archive = WORK / 'artifact.zip'
    expected = release['artifact']
    size = 0
    with urllib.request.urlopen(url, timeout=30) as source, archive.open('xb') as target:
        while True:
            block = source.read(4*1024*1024)
            if not block: break
            size += len(block)
            require(size <= expected['bytes'], 'Artifact download exceeded bound')
            target.write(block)
    require(size == expected['bytes'] and digest(archive) == expected['sha256'], 'Artifact ZIP integrity differs')
    manifest = release['manifest']
    allowed = {'admin-image.tar.gz': manifest['archive']['bytes'], 'release.json': 10000}
    with zipfile.ZipFile(archive) as source:
        require(len(source.infolist()) == 2 and set(source.namelist()) == set(allowed), 'Unexpected artifact inventory')
        for entry in source.infolist():
            require(entry.file_size <= allowed[entry.filename] and (entry.external_attr >> 16) & 0o170000 != 0o120000, 'Unsafe artifact entry')
            with source.open(entry) as data, (WORK / entry.filename).open('xb') as target:
                shutil.copyfileobj(data, target, 1024*1024)
    require(json.loads((WORK/'release.json').read_text()) == manifest, 'Release manifest differs')
    image = WORK / 'admin-image.tar.gz'
    require(image.stat().st_size == manifest['archive']['bytes'] and digest(image) == manifest['archive']['sha256'], 'Image archive integrity differs')
    run(['docker','load','-i',str(image)], timeout=300)
    info = json.loads(run(['docker','image','inspect',manifest['image']]))[0]
    require(info['Id'] == manifest['image'] and info['Config']['User'] == 'node', 'Loaded image identity differs')
    labels = info['Config'].get('Labels', {})
    require(labels.get('org.opencontainers.image.revision') == SOURCE and labels.get('org.orzell.admin.source-tree') == TREE and labels.get('org.orzell.admin.api-base') == API_URL, 'Loaded image provenance differs')


def http_candidate():
    for path in ['/','/login']:
        with urllib.request.urlopen(ADMIN_URL+path, timeout=8) as response:
            body = response.read(1000001)
            require(response.status == 200 and len(body) <= 1000000 and '<title>ORZELL · Yönetim merkezi</title>'.encode() in body and 'Giriş yap'.encode() in body, 'Admin page acceptance failed')
    with urllib.request.urlopen(ADMIN_URL+'/orzell-original-reference.jpg', timeout=8) as response:
        data = response.read(1000001)
        require(response.status == 200 and hashlib.sha256(data).hexdigest() == LOGO, 'Original logo acceptance failed')


def wait_candidate():
    for attempt in range(25):
        try:
            http_candidate(); ready(); return
        except Exception:
            if attempt == 24: raise Stop('Admin readiness deadline reached') from None
            time.sleep(3)


def write_record(record):
    pending = WORK / 'result.pending'
    pending.write_text(json.dumps(record, indent=2)+'\n')
    pending.replace(WORK/'result.json')


def publish(release, url):
    validate_release(release)
    require(ROOT.is_dir() and not ROOT.is_symlink() and not WORK.is_symlink(), 'Operation directory unavailable')
    image = release['manifest']['image']
    if WORK.exists():
        marker = WORK/'result.json'
        require(marker.is_file() and not marker.is_symlink() and marker.stat().st_size <= 30000, 'Existing release state requires inspection')
        prior = json.loads(marker.read_text())
        require(prior.get('status') == 'COMPLETED' and prior.get('release') == release, 'Existing publication cannot be blindly replayed')
        require(inspect('beauty-preview-admin-1')['Image'] == image, 'Completed admin image drift')
        http_candidate(); ready()
        print('COMPLETED: immutable admin release already verified; no service mutation')
        return
    manifest = release['manifest']
    require(shutil.disk_usage(ROOT).free >= manifest['imageBytes'] + 3*manifest['archive']['bytes'] + 512*1024**2, 'Insufficient safe preparation space')
    before = snapshot(); ready()
    old = before['admin']
    require(old['State'].get('Running') and old['Image'] != image, 'Admin baseline is unavailable or already changed')
    command = compose(old)
    baseline = json.loads(run(command+['config','--format','json']))
    require(run(command+['config','--hash','admin']).split()[-1] == old['Config']['Labels'].get('com.docker.compose.config-hash'), 'Admin Compose input drift')
    require(json.loads(run(['docker','image','inspect',baseline['services']['admin']['image']]))[0]['Id'] == old['Image'], 'Admin baseline image drift')
    WORK.mkdir(mode=0o700)
    record = {'status':'PREPARING','release':release,'previousAdminImage':old['Image'],'rollback':command,'providerRequests':0}
    write_record(record)
    attempted = False
    try:
        download(release, url)
        candidate, candidate_config = overlay(command, baseline, image, 'admin-image.json')
        rollback, rollback_config = overlay(command, baseline, old['Image'], 'admin-rollback.json')
        verify_others(before, snapshot(), set())
        require(inspect('beauty-preview-admin-1')['Id'] == old['Id'] and run(command+['config','--hash','admin']).split()[-1] == old['Config']['Labels']['com.docker.compose.config-hash'], 'Concurrent admin/configuration change')
        record['status'] = 'APPLYING'; write_record(record)
        attempted = True
        recreate(candidate)
        wait_candidate()
        verify_runtime(old, inspect('beauty-preview-admin-1'), candidate_config['services']['admin'], image)
        verify_others(before, snapshot(), {'admin'})
        record['status'] = 'COMPLETED'; write_record(record)
        for name in ['artifact.zip','admin-image.tar.gz']:
            path = WORK/name
            require(path.is_file() and not path.is_symlink(), 'Release cleanup inventory differs')
            path.unlink()
        print('COMPLETED: immutable admin-only publication; / and /login, original logo and runtime verified; unrelated services unchanged')
        print('SOURCE '+SOURCE+' ADMIN_IMAGE '+image)
    except Exception:
        record['status'] = 'PREPARATION_FAILED'
        if attempted:
            record['status'] = 'ROLLBACK_NEEDS_REVIEW'
            try:
                recreate(rollback)
                wait_ready()
                current = inspect('beauty-preview-admin-1')
                verify_runtime(old, current, rollback_config['services']['admin'], old['Image'])
                require(environment(current) == environment(old), 'Admin rollback environment differs')
                verify_others(before, snapshot(), {'admin'})
                record['status'] = 'ROLLED_BACK'
            except Exception:
                pass
        write_record(record)
        raise Stop('Admin publication stopped; state='+record['status']+'; inspect before retry') from None


def main(release, url):
    os.umask(0o077)
    require(ROOT.is_dir() and not ROOT.is_symlink(), 'Operations root unavailable')
    with (ROOT/'admin-release-20261111.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        publish(release, url)

if __name__ == '__main__':
    if 'RELEASE' not in globals() or 'TRANSFER_URL' not in globals():
        print('PLAN_ONLY: no service or network operation requested')
    else:
        try:
            main(RELEASE, TRANSFER_URL)
        except Exception as error:
            print(str(error) if isinstance(error, Stop) else 'Admin publication stopped; private diagnostics withheld')
            raise SystemExit(1)
