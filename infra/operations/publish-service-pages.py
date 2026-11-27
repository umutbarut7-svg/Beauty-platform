"""Apply the pinned service sharing images and public gateway routes on preview."""
import copy
import fcntl
import json
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from html.parser import HTMLParser

import preview_admin_ops as ops

ROOT = ops.ROOT
WORK = ROOT / 'scoped-service-booking-1201'
HOST = 'https://preview.13-51-112-228.sslip.io'
require = ops.require


class RenderedText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.heading = []
        self.in_heading = False
        self.hidden = False

    def handle_starttag(self, tag, attrs):
        if tag == 'h1':
            self.in_heading = True
        if tag in ('script', 'style'):
            self.hidden = True

    def handle_endtag(self, tag):
        if tag == 'h1':
            self.in_heading = False
        if tag in ('script', 'style'):
            self.hidden = False

    def handle_data(self, data):
        if not self.hidden:
            self.text.append(data)
        if self.in_heading:
            self.heading.append(data)


def load_images(release, url):
    uri = urllib.parse.urlsplit(url)
    require(uri.scheme == 'https' and uri.hostname and uri.hostname.endswith('.blob.core.windows.net')
            and not uri.username and not uri.password, 'Unexpected artifact destination')
    artifact, manifest = release['artifact'], release['manifest']
    with urllib.request.urlopen(url, timeout=45) as response, (WORK/'package.zip').open('xb') as target:
        remaining = artifact['bytes']
        while remaining:
            block = response.read(min(4*1024**2, remaining))
            require(bool(block), 'Truncated artifact')
            target.write(block)
            remaining -= len(block)
        require(not response.read(1), 'Unexpected artifact size')
    require(ops.digest(WORK/'package.zip') == artifact['sha256'], 'Artifact digest differs')
    image = WORK/'images.tar.gz'
    with zipfile.ZipFile(WORK/'package.zip') as archive:
        require(sorted(archive.namelist()) == ['images.tar.gz','manifest.json'] and
                archive.getinfo('manifest.json').file_size < 4096 and
                json.loads(archive.read('manifest.json')) == manifest and
                archive.getinfo('images.tar.gz').file_size == manifest['archiveBytes'], 'Package manifest differs')
        with archive.open('images.tar.gz') as source, image.open('xb') as target:
            shutil.copyfileobj(source, target, 4*1024**2)
    require(ops.digest(image) == manifest['archiveSha256'], 'Image archive digest differs')
    ops.run(['docker','load','-i',str(image)], timeout=360)
    for service in PREVIOUS:
        info = json.loads(ops.run(['docker','image','inspect', manifest[service]]))[0]
        require(info['Id'] == manifest[service] and info['Config']['User'] == 'node' and
                info['Config']['Labels']['org.opencontainers.image.revision'] == manifest['source'],
                'Loaded image provenance differs')


def up(command, service):
    ops.run(command + ['up','-d','--no-deps','--no-build','--pull','never',service], timeout=150)


PILOT_BUSINESS = 'cmvjkv2uz001tqa0jc72r3rl4'
PILOT_SERVICE = 'cmw1wwm6u0009nx0jc6v3k4cr'
ORIGIN = 'https://links.orzell.app'
PILOT = PILOT_BUSINESS + '/' + PILOT_SERVICE
PREVIOUS = {
    'api': 'sha256:9eb4def6d1d51887765e992dea3a71a79291b9ea09c3efde2492ed5d538ad3dd',
    'admin': 'sha256:49ab53ef59d5f7fe9431eff07692edbfa8adedb7fbabdd06ff699435834be819',
}

def candidate_config(before, service, manifest):
    require(service in PREVIOUS, 'Unexpected service')
    result = copy.deepcopy(before)
    cfg = result['services'][service]
    require(cfg['environment'].get('ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED') == PILOT,
            'Unexpected booking state')
    if service == 'api':
        require(ORIGIN in cfg['environment']['CORS_ORIGINS'].split(','), 'Pilot CORS missing')
    image = manifest[service]
    cfg['image'] = image
    return result, {'services': {service: {'image': image}}}

def check_pilot(decorated=True):
    query = urllib.parse.urlencode({'businessId': PILOT_BUSINESS, 'serviceId': PILOT_SERVICE})
    routes = ['/discover/service?' + query, '/book/service?' + query]
    if decorated:
        routes.append(routes[0] + '&fbclid=orzell-release-check')
    for route in routes:
        with urllib.request.urlopen(ORIGIN + route, timeout=10) as response:
            parsed = RenderedText()
            parsed.feed(response.read(2000000).decode())
            visible = ' '.join(parsed.text)
            require(response.status == 200 and 'Randevu talebi' in visible and 'Saç kesimi' in visible, 'Pilot booking form missing')
    req = urllib.request.Request(HOST + '/api/auth/login', method='OPTIONS', headers={
        'Origin': ORIGIN, 'Access-Control-Request-Method':'POST',
        'Access-Control-Request-Headers':'content-type,authorization'})
    with urllib.request.urlopen(req, timeout=10) as response:
        require(response.headers.get('Access-Control-Allow-Origin') == ORIGIN, 'Pilot CORS differs')
    ops.ready()

def publish(release, url, caddy):
    before = ops.snapshot()
    manifest = release['manifest']
    if (WORK/'complete').is_file():
        require(all(before[k]['Image']==manifest[k] for k in PREVIOUS),'Pilot runtime drift')
        check_pilot()
        print('COMPLETED: public service pages verified')
        return
    require(not WORK.exists() and all(before[k]['Image']==PREVIOUS[k] for k in PREVIOUS),'Prior service images differ')
    require(shutil.disk_usage(ROOT).free > 3_000_000_000, 'Insufficient reversible image storage')
    ops.ready()
    originals, candidates, applied = {}, {}, []
    WORK.mkdir(mode=0o700)
    try:
        for svc in PREVIOUS:
            original = ops.compose(before[svc])
            baseline = json.loads(ops.run(original+['config','--format','json']))
            original_cfg = baseline['services'][svc]
            original_image = json.loads(ops.run(['docker', 'image', 'inspect', original_cfg['image']]))[0]
            require(original_image['Id'] == PREVIOUS[svc], 'Rollback image differs')
            expected, overlay = candidate_config(baseline, svc, manifest)
            path = WORK/(svc+'.json')
            path.write_text(json.dumps(overlay))
            candidate = original + ['-f',str(path)]
            require(json.loads(ops.run(candidate+['config','--format','json'])) == expected,'Unexpected Compose delta')
            originals[svc], candidates[svc] = original, candidate
        load_images(release,url)
        for svc in PREVIOUS:
            applied.append(svc)
            up(candidates[svc],svc)
            if svc == 'api': ops.wait_ready()
            cfg = json.loads(ops.run(candidates[svc]+['config','--format','json']))['services'][svc]
            ops.verify_runtime(before[svc],ops.inspect('beauty-preview-'+svc+'-1'),cfg,manifest[svc])
        for attempt in range(12):
            try:
                check_pilot()
                break
            except Exception:
                if attempt==11: raise
                time.sleep(2)
        ops.verify_others(before,ops.snapshot(),set(applied))
        (WORK/'complete').write_text(manifest['source'])
    except Exception as error:
        print('Pilot stopped:', str(error) if isinstance(error,ops.Stop) else type(error).__name__,flush=True)
        for svc in reversed(applied): up(originals[svc],svc)
        if applied:
            ops.wait_ready()
            for svc in applied:
                cfg = json.loads(ops.run(originals[svc]+['config','--format','json']))['services'][svc]
                ops.verify_runtime(before[svc],ops.inspect('beauty-preview-'+svc+'-1'),cfg,PREVIOUS[svc])
            ops.verify_others(before,ops.snapshot(),set(applied))
            check_pilot(decorated=False)
            print('ROLLBACK: previous pilot verified', flush=True)
        for name in ('api.json','admin.json','package.zip','images.tar.gz'): (WORK/name).unlink(missing_ok=True)
        WORK.rmdir()
        raise
    for name in ('package.zip','images.tar.gz'): (WORK/name).unlink()
    print('COMPLETED: public service pages verified')

def main(release, url, caddy):
    with (ROOT/'saved-matching-release-20261031.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        publish(release, url, caddy)
