#!/bin/bash
set -euo pipefail
python3 - <<'PY'
"""Install the two public preview declarations using the active gateway Compose inputs."""
import fcntl
import http.client
import json
import os
from pathlib import Path
import subprocess
import time

HOST = 'preview.13-51-112-228.sslip.io'
APP = 'CDL78S6U9A.com.orzell.app'
GATEWAY = 'beauty-preview-gateway-1'
CONFIG = '/etc/caddy/Caddyfile'
ROOT = Path('/opt/epifiz/operations')
WORK = ROOT / 'preview-service-domain-20261119'
APPLE = '/.well-known/apple-app-site-association'
ANDROID = '/.well-known/assetlinks.json'
ROUTES = '  @appleServiceLink {\n    host preview.13-51-112-228.sslip.io\n    path /.well-known/apple-app-site-association\n  }\n  handle @appleServiceLink {\n    header Content-Type application/json\n    header Cache-Control "no-store"\n    respond `{"applinks":{"details":[{"appIDs":["CDL78S6U9A.com.orzell.app"],"components":[{"/":"/discover/service"}]}]}}` 200\n  }\n  @androidServiceLink {\n    host preview.13-51-112-228.sslip.io\n    path /.well-known/assetlinks.json\n  }\n  handle @androidServiceLink {\n    header Content-Type application/json\n    header Cache-Control "no-store"\n    respond "[]" 200\n  }\n'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(args, data=None, timeout=35):
    p = subprocess.run(args, text=True, input=data, capture_output=True, timeout=timeout)
    require(p.returncode == 0, 'Failed: ' + ' '.join(args[:2]))
    return p.stdout


def public(path):
    connection = http.client.HTTPSConnection(HOST, timeout=8)
    try:
        connection.request('GET', path, headers={'Cache-Control': 'no-cache'})
        res = connection.getresponse()
        body = res.read(1024 * 1024 + 1)
        require(len(body) <= 1024 * 1024, 'Preview response exceeded size bound')
        return res.status, res.getheader('Content-Type', '').split(';')[0], body
    finally:
        connection.close()


def verify(expected_home):
    status, mime, data = public(APPLE)
    require((status, mime) == (200, 'application/json') and json.loads(data) == {
        'applinks': {'details': [{'appIDs': [APP], 'components': [{'/': '/discover/service'}]}]}
    }, 'Apple declaration did not match')
    status, mime, data = public(ANDROID)
    require((status, mime) == (200, 'application/json') and json.loads(data) == [], 'Android declaration did not match')
    require(public('/') == expected_home and public('/api/health/ready')[0] == 200, 'Preview web or API check failed')


def write_once(path, text):
    if path.exists():
        require(not path.is_symlink() and path.read_text() == text, 'Conflicting previous preview file')
        return
    with path.open('x') as stream:
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())


def setup():
    fmt = '{{json .Config.Labels}}'
    labels = json.loads(run(['docker', 'inspect', '--format', fmt, GATEWAY]))
    key = 'com.docker.compose.project'
    require(labels.get(key) == 'beauty-preview' and labels.get('com.docker.compose.service') == 'gateway', 'Preview gateway identity mismatch')
    directory = labels.get(key + '.working_dir', '')
    require(directory.startswith('/opt/epifiz/') and Path(directory).is_dir(), 'Compose working directory unavailable')
    cmd = ['docker', 'compose', '-p', 'beauty-preview', '--project-directory', directory]
    for label, flag in [('environment_file', '--env-file'), ('config_files', '-f')]:
        values = labels.get(key + '.' + label, '').split(',')
        for name in values:
            require(name.startswith('/opt/epifiz/') and Path(name).is_file(), 'Compose input unavailable')
            cmd.extend([flag, name])
    home = public('/')
    require(home[0:2] == (200, 'text/html') and b'ORZELL' in home[2] and public('/api/health/ready')[0] == 200, 'Preview baseline unavailable')
    live = run(['docker', 'exec', GATEWAY, 'cat', CONFIG])
    if ROUTES in live:
        verify(home)
        print('Preview declarations already active and verified')
        return
    marker = '  handle_path /api/* {'
    require(live.startswith('{$PREVIEW_HOST} {\n') and marker in live.split('{$ADMIN_HOST}', 1)[0] and '.well-known' not in live, 'Unexpected Caddy route layout')
    config = live.replace(marker, ROUTES + marker, 1)
    WORK.mkdir(mode=0o755, exist_ok=True)
    public_file = WORK / 'Caddyfile'
    overlay = WORK / 'gateway.json'
    mount = {'type': 'bind', 'source': str(public_file), 'target': CONFIG, 'read_only': True}
    # Only this public Caddy configuration is mounted. No env files are copied.
    write_once(public_file, config)
    public_file.chmod(0o644)
    write_once(overlay, json.dumps({'services': {'gateway': {'volumes': [mount]}}}) + '\n')
    candidate = cmd + ['-f', str(overlay)]
    before = json.loads(run(cmd + ['config', '--format', 'json']))
    after = json.loads(run(candidate + ['config', '--format', 'json']))
    extra = [v for v in after['services']['gateway']['volumes'] if v['target'] == CONFIG]
    require(len(extra) == 1 and all(extra[0].get(k) == v for k, v in mount.items()), 'Candidate mount differs')
    after['services']['gateway']['volumes'].remove(extra[0])
    require(before == after, 'Candidate changes more than the gateway route file')
    image = run(['docker', 'inspect', '--format', '{{.Image}}', GATEWAY]).strip()
    configured = before['services']['gateway']['image']
    require(run(['docker','image','inspect','--format','{{.Id}}',configured]).strip() == image, 'Compose image drift')
    for change in run(['docker','diff',GATEWAY]).splitlines():
        path = change[2:]
        require(path != '/srv/web' and not path.startswith('/srv/web/') and path != CONFIG,
                'Gateway has unpublished container-layer changes')
    # Adapt only; certificate management stays with the running gateway.
    adapted = json.loads(run(['docker','exec','-i',GATEWAY,'caddy','adapt','--config','/dev/stdin','--adapter','caddyfile'], config))
    require(HOST in json.dumps(adapted) and APP in json.dumps(adapted), 'Gateway adapter did not find the preview identity')
    options = ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'gateway']
    try:
        run(candidate + options, timeout=120)
        for index in range(8):
            try:
                verify(home)
                break
            except (OSError, RuntimeError, ValueError, http.client.HTTPException):
                if index == 7: raise
                time.sleep(2)
        require(run(['docker','exec',GATEWAY,'cat',CONFIG]) == config, 'Active configuration differs')
    except Exception:
        run(cmd + options, timeout=120)
        require(run(['docker','exec',GATEWAY,'cat',CONFIG]) == live, 'Prior gateway needs review')
        raise RuntimeError('Preview publication failed; prior gateway configuration restored') from None
    print('Preview Apple service route verified; Android has zero authorized apps; home and API ready')


with (ROOT / 'saved-matching-release-20261031.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    setup()
PY
