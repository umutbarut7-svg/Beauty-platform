#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import copy
import fcntl
import json
import os
import subprocess
import time
from pathlib import Path

HOST = 'links.orzell.app'
PREVIEW = 'preview.13-51-112-228.sslip.io'
GATEWAY = 'beauty-preview-gateway-1'
CONFIG = '/etc/caddy/Caddyfile'
APPLE = '/.well-known/apple-app-site-association'
SERVICE = '/discover/service?businessId=cmvjkv2uz001tqa0jc72r3rl4&serviceId=cmw1wwm6u0009nx0jc6v3k4cr'
BLOCK = '''
links.orzell.app {
  encode gzip
  header X-Content-Type-Options nosniff
  @association {
    method GET HEAD
    path /.well-known/apple-app-site-association
  }
  handle @association {
    header Content-Type application/json
    respond `{"applinks":{"details":[{"appIDs":["CDL78S6U9A.com.orzell.app"],"components":[{"/":"/discover/service"}]}]}}` 200
  }
  @service {
    method GET HEAD
    path /discover/service /book/service /_next/static/* /orzell-original-reference.jpg
  }
  handle @service {
    reverse_proxy admin:3000
  }
  handle {
    respond 404
  }
}
'''
DOC = {'applinks': {'details': [{'appIDs': ['CDL78S6U9A.com.orzell.app'], 'components': [{'/': '/discover/service'}]}]}}
ROOT = Path('/opt/epifiz/operations')

def run(args, data=None):
    return subprocess.run(args, input=data, text=True, capture_output=True, check=True, timeout=30).stdout

def gateway(*args, data=None):
    return run(['docker', 'exec', '-i', GATEWAY, *args], data)

def active():
    return json.loads(gateway('wget', '-qO-', 'http://127.0.0.1:2019/config/'))

def reload(config):
    gateway('caddy', 'reload', '--config', '/dev/stdin', data=json.dumps(config))

def adapt(contents):
    return json.loads(gateway('caddy', 'adapt', '--config', '/dev/stdin', '--adapter', 'caddyfile', data=contents))

def probe(host, path):
    return run(['curl', '--noproxy', '*', '--max-time', '8', '--resolve', host + ':443:127.0.0.1',
                '-sS', '-w', '\\n%{http_code} %{content_type}', 'https://' + host + path]).rsplit('\n', 1)

def verify_association(host):
    body, status = probe(host, APPLE)
    if status.split(';')[0] != '200 application/json' or json.loads(body) != DOC:
        raise RuntimeError('Unexpected association response at ' + host)

def install():
    mounts = json.loads(run(['docker', 'inspect', '--format', '{{json .Mounts}}', GATEWAY]))
    mount, = [item for item in mounts if item['Destination'] == CONFIG]
    file = Path(mount['Source'])
    if mount['Type'] != 'bind' or mount['RW'] or ROOT not in file.resolve().parents or file.name != 'Caddyfile':
        raise RuntimeError('Unrecognized gateway mount')
    source = file.read_bytes()
    original = source.decode()
    if gateway('cat', CONFIG) != original or (HOST in original and not original.endswith(BLOCK)):
        raise RuntimeError('Gateway file differs')
    persist = not original.endswith(BLOCK)
    adapt(original + BLOCK if persist else original)
    config = adapt(BLOCK)
    alias_server, = config['apps']['http']['servers'].values()
    route, = alias_server['routes']
    if route.get('match') != [{'host': [HOST]}]:
        raise RuntimeError('New route must be limited to the links hostname')
    verify_association(PREVIEW)
    before = active()
    candidate = copy.deepcopy(before)
    server, = [s for s in candidate['apps']['http']['servers'].values()
               if PREVIEW in s.get('logs', {}).get('logger_names', {})]
    if route not in server['routes']:
        if HOST in json.dumps(before):
            raise RuntimeError('Conflicting live links configuration')
        server['routes'].insert(0, route)
    if active() != before:
        raise RuntimeError('Concurrent gateway update')
    if candidate != before:
        reload(candidate)
    try:
        for attempt in range(40):
            try:
                verify_association(HOST)
                break
            except (subprocess.SubprocessError, ValueError, RuntimeError):
                if attempt == 39:
                    raise RuntimeError('Trusted TLS or Apple association did not become ready')
                time.sleep(3)
        page, status = probe(HOST, SERVICE)
        if not status.startswith('200 text/html') or 'Saç kesimi' not in page or 'restart hair design' not in page.casefold():
            raise RuntimeError('Shared service failed at links hostname')
        if not probe(HOST, '/login')[1].startswith('404 ') or not probe(PREVIEW, '/api/health/ready')[1].startswith('200 '):
            raise RuntimeError('Gateway routing check failed')
        if persist:
            # Append to the same bind-mounted inode after verified HTTPS. A rename would detach the mount.
            with file.open('r+b') as stream:
                if stream.read() != source or active() != candidate:
                    raise RuntimeError('Concurrent gateway configuration update')
                try:
                    stream.write(BLOCK.encode())
                    stream.flush()
                    os.fsync(stream.fileno())
                    if gateway('cat', CONFIG) != original + BLOCK:
                        raise RuntimeError('Mounted configuration verification failed')
                except BaseException:
                    stream.truncate(len(source))
                    stream.flush()
                    os.fsync(stream.fileno())
                    raise
    except BaseException:
        if candidate != before and active() == candidate:
            reload(before)
        raise
    print('Verified trusted TLS, exact Apple association, public catalog service, private path isolation and preview health.')

with (ROOT / 'saved-matching-release-20261031.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    install()
PY
