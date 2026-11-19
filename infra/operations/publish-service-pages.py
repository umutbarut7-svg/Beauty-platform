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
WORK = ROOT / 'service-pages-20261119'
HOST = 'https://preview.13-51-112-228.sslip.io'
CONFIG = '/etc/caddy/Caddyfile'
ORIGINAL = {
    'api': 'sha256:f13b300b0a0a236553b174b6453fc1d8ec3c06b1c912074401e625371464c99e',
    'admin': 'sha256:2a8bed2e62811748b09c9bf88e46a16bdd76ad56e0cc13f1463a419ed38b9ab4',
}
ENV = {
    'api': {'ORZELL_EVERYWHERE_ENABLED': 'true', 'ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED': 'false'},
    'admin': {'ORZELL_PUBLIC_ORIGIN': HOST, 'ORZELL_PUBLIC_API_ORIGIN': HOST,
              'ORZELL_PUBLIC_API_PATH_PREFIX': '/api', 'ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED': 'false'},
}
require = ops.require


def http(path):
    try:
        response = urllib.request.urlopen(HOST + path, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(2_000_001)
        require(len(body) <= 2_000_000, 'HTTP size bound exceeded')
        return response.status, response.headers.get_content_type(), body


def catalog_targets():
    status, _, body = http('/api/discovery/services')
    require(status == 200, 'Public catalog unavailable')
    targets = []
    for business in json.loads(body)['items']:
        for service in business['services']:
            ids = [business['businessId'], service['id']]
            if all(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', key) for key in ids):
                targets.append(urllib.parse.urlencode(dict(zip(['businessId','serviceId'], ids))))
                if len(targets) == 2:
                    return targets
    require(bool(targets), 'No published catalog service available for acceptance')
    return targets


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


def inspect_pages(query):
    api = '/api/discovery/shared-service?'
    status, _, raw = http(api + query)
    require(status == 200, 'Published service lookup failed')
    shared = json.loads(raw)
    identity = urllib.parse.parse_qs(query)
    require(shared['business']['id'] == identity['businessId'][0] and
            shared['service']['id'] == identity['serviceId'][0], 'Returned service identity differs')
    for path in ['/discover/service?', '/book/service?']:
        status, mime, raw = http(path + query)
        page = raw.decode()
        rendered = RenderedText()
        rendered.feed(page)
        visible = ' '.join(''.join(rendered.text).split())
        service = shared['service']
        detail = service['price'] + ' ' + service['currency'] + ' · ' + str(service['durationMinutes']) + ' dakika'
        require((status, mime) == (200, 'text/html') and
                ''.join(rendered.heading).strip() == service['name'].strip() and
                shared['business']['name'] in visible and detail in visible and
                'web randevusu şu anda kullanılamıyor' in visible,
                'Browser service detail acceptance failed')
        assets = re.findall(r'(?:src|href)="(/_next/static/[^"]+\.css[^"]*)"', page)
        require(bool(assets) and http(assets[0])[:2] == (200, 'text/css'), 'Public stylesheet unavailable')
    require(http(api + query + '&resultId=unpublished-result')[0] == 404, 'Result publication gate differs')


def acceptance(queries, home):
    for query in queries:
        inspect_pages(query)
    require(http('/')[2] == home and http('/.well-known/apple-app-site-association')[1] == 'application/json',
            'Preview home or Apple declaration changed')
    ops.http_candidate()
    ops.ready()


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
    for service in ORIGINAL:
        info = json.loads(ops.run(['docker','image','inspect', manifest[service]]))[0]
        require(info['Id'] == manifest[service] and info['Config']['User'] == 'node' and
                info['Config']['Labels']['org.opencontainers.image.revision'] == manifest['source'],
                'Loaded image provenance differs')


def candidate_config(before, service, manifest):
    result = copy.deepcopy(before)
    spec = result['services'][service]
    if service == 'gateway':
        matches = [v for v in spec['volumes'] if v['target'] == CONFIG]
        require(len(matches) == 1 and matches[0]['type'] == 'bind' and matches[0].get('read_only') and
                matches[0]['source'] == str(ROOT/'preview-service-domain-20261119'/'Caddyfile'),
                'Existing gateway route mount differs')
        matches[0]['source'] = str(WORK/'Caddyfile')
        entry = {'volumes': [matches[0]]}
    else:
        spec['image'] = manifest[service]
        spec.setdefault('environment', {}).update(ENV[service])
        entry = {'image': manifest[service], 'environment': ENV[service]}
    return result, {'services': {service: entry}}


def up(command, service):
    ops.run(command + ['up','-d','--no-deps','--no-build','--pull','never',service], timeout=150)


def publish(release, url, caddy):
    manifest = release['manifest']
    before = ops.snapshot()
    ops.ready()
    queries = catalog_targets()
    status, mime, home = http('/')
    require((status, mime) == (200, 'text/html') and b'ORZELL' in home, 'Preview home unavailable')
    if WORK.exists() and (WORK/'complete').is_file():
        require(all(before[s]['Image'] == manifest[s] for s in ORIGINAL), 'Installed images drifted')
        acceptance(queries, home)
        print('COMPLETED: public service pages verified')
        return
    require(not WORK.exists(), 'Previous incomplete release requires inspection')
    require(all(before[s]['Image'] == image for s, image in ORIGINAL.items()), 'Prior release identity differs')
    require(shutil.disk_usage(ROOT).free > 3_000_000_000, 'Insufficient disk for reversible preparation')
    original, commands, configs = {}, {}, {}
    for service in ['api','admin','gateway']:
        old = before[service]
        command = ops.compose(old)
        baseline = json.loads(ops.run(command + ['config','--format','json']))
        image = baseline['services'][service]['image']
        require(json.loads(ops.run(['docker','image','inspect',image]))[0]['Id'] == old['Image'],
                'Compose baseline image drift for ' + service)
        original[service] = command
        configs[service] = baseline
    gateway = before['gateway']['Id']
    prior = ops.run(['docker','exec',gateway,'cat',CONFIG])
    marker = '  handle_path /api/* {'
    first = caddy.index('  @publicServicePages {')
    last = caddy.index(marker, first)
    require(prior.startswith('{$PREVIEW_HOST} {') and '@appleServiceLink' in prior and
            marker in prior.split('{$ADMIN_HOST}',1)[0] and '@publicServicePages' not in prior,
            'Current route layout differs')
    new_caddy = prior.replace(marker, caddy[first:last] + marker, 1)
    WORK.mkdir(mode=0o755)
    applied = []
    try:
        (WORK/'Caddyfile').write_text(new_caddy)
        (WORK/'Caddyfile').chmod(0o644)
        for service, baseline in configs.items():
            expected, overlay = candidate_config(baseline, service, manifest)
            path = WORK/(service+'.json')
            path.write_text(json.dumps(overlay))
            commands[service] = original[service] + ['-f',str(path)]
            actual = json.loads(ops.run(commands[service] + ['config','--format','json']))
            require(actual == expected, 'Unreviewed Compose change for ' + service)
        load_images(release, url)
        ops.verify_others(before, ops.snapshot(), set())
        for service in ['api','admin','gateway']:
            applied.append(service)
            up(commands[service], service)
            if service == 'api':
                ops.wait_ready()
            if service in ORIGINAL:
                actual = json.loads(ops.run(commands[service] + ['config','--format','json']))
                ops.verify_runtime(before[service], ops.inspect('beauty-preview-'+service+'-1'),
                                   actual['services'][service], manifest[service])
        for attempt in range(8):
            try:
                acceptance(queries, home)
                break
            except Exception:
                if attempt == 7:
                    raise
                time.sleep(2)
        ops.verify_others(before, ops.snapshot(), set(applied))
        (WORK/'complete').write_text(manifest['source']+'\n')
    except Exception as error:
        reason = str(error) if isinstance(error, ops.Stop) else type(error).__name__
        print('Stopped at ' + reason, flush=True)
        for service in reversed(applied):
            up(original[service], service)
        if applied:
            ops.wait_ready()
            restored = ops.snapshot()
            require(all(restored[s]['Image'] == before[s]['Image'] and
                        ops.environment(restored[s]) == ops.environment(before[s]) for s in applied)
                    and http('/')[2] == home, 'Restore check failed')
            ops.verify_others(before, restored, set(applied))
        # Each candidate overlay is unreferenced once the original inputs are active.
        for file in WORK.iterdir():
            require(file.name in {'Caddyfile','api.json','admin.json','gateway.json','package.zip','images.tar.gz'}
                    and file.is_file() and not file.is_symlink(), 'Unexpected temporary file')
            file.unlink()
        WORK.rmdir()
        raise ops.Stop('Release stopped; prior preview verified') from None
    for name in ['package.zip','images.tar.gz']:
        (WORK/name).unlink()
    print('COMPLETED: public service pages verified')


def main(release, url, caddy):
    with (ROOT/'saved-matching-release-20261031.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        publish(release, url, caddy)
