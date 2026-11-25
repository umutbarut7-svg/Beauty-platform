#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import copy
import fcntl
import json
import os
import subprocess
from pathlib import Path

ROOT = Path('/opt/epifiz/operations')
HOST = 'links.orzell.app'
PREVIEW = 'preview.13-51-112-228.sslip.io'
GATEWAY = 'beauty-preview-gateway-1'
CONFIG = '/etc/caddy/Caddyfile'
ANDROID = '/.well-known/assetlinks.json'
APPLE = '/.well-known/apple-app-site-association'
SERVICE = '/discover/service?businessId=cmvjkv2uz001tqa0jc72r3rl4&serviceId=cmw1wwm6u0009nx0jc6v3k4cr'
ROUTE = '''  @androidAssociation {
    method GET HEAD
    path /.well-known/assetlinks.json
  }
  handle @androidAssociation {
    header Content-Type application/json
    header Cache-Control "no-store"
    respond "[]" 200
  }
'''
DOC = {'applinks': {'details': [{'appIDs': ['CDL78S6U9A.com.orzell.app'], 'components': [{'/': '/discover/service'}]}]}}

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

def host_route(block):
    server, = adapt(block)['apps']['http']['servers'].values()
    route, = server['routes']
    if route['match'] != [{'host': [HOST]}]:
        raise RuntimeError('Unexpected hostname scope')
    return route

def probe(host, path, method='GET'):
    args = ['curl', '--noproxy', '*', '--max-time', '8', '--resolve', host + ':443:127.0.0.1',
            '-sS', '-w', '\\n%{http_code} %{content_type}']
    if method == 'HEAD':
        args += ['-I', '-o', '/dev/null']
    body, status = run(args + ['https://' + host + path]).rsplit('\n', 1)
    return status.split(';')[0], body

def verify():
    status, android = probe(HOST, ANDROID)
    if status != '200 application/json' or json.loads(android) != [] or probe(HOST, ANDROID, 'HEAD')[0] != status:
        raise RuntimeError('Android discovery document mismatch')
    status, apple = probe(HOST, APPLE)
    if status != '200 application/json' or json.loads(apple) != DOC:
        raise RuntimeError('Apple association mismatch')
    status, service = probe(HOST, SERVICE)
    if status != '200 text/html' or 'restart hair design' not in service.casefold() or 'Saç kesimi' not in service:
        raise RuntimeError('Shared service mismatch')
    if not probe(HOST, '/login')[0].startswith('404 ') or not probe(PREVIEW, '/api/health/ready')[0].startswith('200 '):
        raise RuntimeError('Gateway routing mismatch')

def write_config(file, expected, replacement):
    # Retain the inode pinned by the read-only container bind mount.
    with file.open('r+b') as stream:
        if stream.read() != expected:
            raise RuntimeError('Concurrent gateway file change')
        def write(data):
            stream.seek(0)
            stream.write(data)
            stream.truncate()
            stream.flush()
            os.fsync(stream.fileno())
        try:
            write(replacement)
            if gateway('cat', CONFIG).encode() != replacement:
                raise RuntimeError('Mounted gateway configuration mismatch')
        except BaseException:
            write(expected)
            raise

def install():
    mounts = json.loads(run(['docker', 'inspect', '--format', '{{json .Mounts}}', GATEWAY]))
    mount, = [item for item in mounts if item['Destination'] == CONFIG]
    file = Path(mount['Source'])
    if mount['Type'] != 'bind' or mount['RW'] or ROOT not in file.resolve().parents or file.name != 'Caddyfile':
        raise RuntimeError('Unexpected gateway mount')
    original = file.read_bytes()
    text = original.decode()
    marker = '\n' + HOST + ' {'
    if gateway('cat', CONFIG) != text or text.count(marker) != 1:
        raise RuntimeError('Unexpected gateway file')
    prefix, suffix = text.split(marker)
    block = marker + suffix
    if block.count('\n}') != 1 or not block.rstrip().endswith('}') or block.count('  @service {') != 1:
        raise RuntimeError('Unrecognized links host block')
    if ANDROID in block and block.count(ROUTE) != 1:
        raise RuntimeError('Existing Android policy requires review')
    old_block = block.replace(ROUTE, '')
    new_block = old_block.replace('  @service {', ROUTE + '  @service {')
    updated = (prefix + new_block).encode()
    adapt(updated.decode())
    old_route, new_route = host_route(old_block), host_route(new_block)
    before = active()
    candidate = copy.deepcopy(before)
    routes, = [s['routes'] for s in candidate['apps']['http']['servers'].values()
               if any(r.get('match') == [{'host': [HOST]}] for r in s['routes'])]
    index, = [i for i,r in enumerate(routes) if r.get('match') == [{'host': [HOST]}]]
    if routes[index] not in (old_route, new_route) or active() != before:
        raise RuntimeError('Live links route differs from the mounted configuration')
    routes[index] = new_route
    if candidate != before:
        reload(candidate)
    try:
        verify()
        if active() != candidate:
            raise RuntimeError('Concurrent gateway update')
        if original != updated:
            write_config(file, original, updated)
    except BaseException:
        if candidate != before and active() == candidate:
            reload(before)
        raise
    print('Verified links host GET/HEAD, unchanged Apple association, service page and preview health.')

with (ROOT / 'saved-matching-release-20261031.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    install()
PY
