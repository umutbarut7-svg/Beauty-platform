#!/bin/bash
set -euo pipefail
python3 - <<'PY'
#!/usr/bin/env python3
"""Publish the tested preview only after explicit owner approval."""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path('/opt/epifiz/application-123e7339')
COMPOSE = ROOT / 'infra/preview/compose.yml'
COMPOSE_BLOB = '5ccecefa6448197607f8391070549b7829bc6fe0'
ADMIN = 'sha256:fc18e8b3deffb8939f8dbd8735ecbc6bb769462138f7a65b9c377c0cc2814b4c'
GATEWAY = 'sha256:05686cfe8cee185657590777e7b3b53a28adbd4fdee769095ff6dbb02242391f'
HOSTS = ['preview.13-51-112-228.sslip.io', 'admin.13-51-112-228.sslip.io']


def output(*args):
    return subprocess.check_output(list(args), text=True, timeout=30).strip()


def compose(envfile, *args):
    subprocess.run(['docker', 'compose', '--env-file', str(envfile), '-f', str(COMPOSE), *args], check=True, timeout=180)


def write_env(path, values):
    # Only public hostnames, bindings and image IDs; never database/JWT/API secrets.
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
        handle.write(''.join(key + '=' + value + '\n' for key, value in values.items()))


def preflight():
    data = COMPOSE.read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if blob != COMPOSE_BLOB:
        raise RuntimeError('Compose differs from the reviewed version; no activation')
    for image in [ADMIN, GATEWAY]:
        if output('docker', 'image', 'inspect', image, '--format', '{{.Id}}') != image:
            raise RuntimeError('Tested image missing')
    for service in ['admin', 'gateway']:
        if output('docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=beauty-preview', '--filter', 'label=com.docker.compose.service=' + service):
            raise RuntimeError('An existing frontend must be reviewed before replacement')
    environment = json.loads(output('docker', 'inspect', '--format', '{{json .Config.Env}}', 'beauty-preview-api-1'))
    cors = next((entry.split('=', 1)[1] for entry in environment if entry.startswith('CORS_ORIGINS=')), '')
    if cors != 'https://preview.invalid,https://admin.invalid':
        raise RuntimeError('Existing API origin settings changed; inspect before activation')
    return {
        'API_IMAGE': output('docker', 'inspect', 'beauty-preview-api-1', '--format', '{{.Image}}'),
        'MIGRATE_IMAGE': output('docker', 'inspect', 'beauty-preview-migrate-1', '--format', '{{.Image}}'),
        'ADMIN_IMAGE': ADMIN, 'GATEWAY_IMAGE': GATEWAY,
        'PREVIEW_HOST': HOSTS[0], 'ADMIN_HOST': HOSTS[1],
        'HTTP_BIND': '0.0.0.0:80', 'HTTPS_BIND': '0.0.0.0:443',
    }


def verify_https():
    for host in HOSTS:
        origin = 'https://' + host
        request = urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin})
        with urllib.request.urlopen(request, timeout=8) as response:
            if response.status != 200 or response.headers.get('Access-Control-Allow-Origin') != origin:
                raise RuntimeError('HTTPS/API/CORS verification failed')
        with urllib.request.urlopen(origin + '/', timeout=8) as response:
            if response.status != 200 or '<html' not in response.read(200000).decode(errors='replace'):
                raise RuntimeError('HTTPS frontend verification failed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approved', action='store_true', help='Requires the owner approval recorded in the active session')
    args = parser.parse_args()
    if not args.approved:
        print('PLAN ONLY: replace preview.invalid/admin.invalid CORS with the two tested temporary hostnames.')
        print('Recreate API for that setting, start tested admin and gateway on existing ports 80/443, verify trusted HTTPS and CORS.')
        print('No schema migration, database/worker restart, volume deletion, new AWS resources, or paid capacity increase.')
        print('On failure, stop/remove only the newly created frontends and restore the prior API origin settings.')
        print('Nothing executed. --approved is required after explicit owner approval.')
        return
    values = preflight()
    folder = pathlib.Path('/opt/epifiz/operations')
    folder.mkdir(mode=0o700, exist_ok=True)
    stamp = str(time.time_ns())
    current, rollback = folder / ('preview-' + stamp + '.env'), folder / ('preview-before-' + stamp + '.env')
    write_env(current, values)
    write_env(rollback, {**values, 'PREVIEW_HOST': 'preview.invalid', 'ADMIN_HOST': 'admin.invalid'})
    compose(current, 'config', '--quiet')
    try:
        compose(current, 'up', '-d', '--no-deps', '--pull', 'never', 'api', 'admin')
        for _ in range(60):
            if output('docker', 'inspect', 'beauty-preview-api-1', '--format', '{{.State.Health.Status}}') == 'healthy':
                break
            time.sleep(2)
        else:
            raise RuntimeError('API readiness did not recover')
        compose(current, 'up', '-d', '--no-deps', '--pull', 'never', 'gateway')
        for _ in range(18):
            try:
                verify_https()
                print('PREVIEW ACTIVATION PASS: trusted HTTPS, both frontends, API readiness and both CORS origins.')
                return
            except (OSError, urllib.error.URLError, RuntimeError):
                time.sleep(5)
        raise RuntimeError('Public HTTPS acceptance timed out')
    except Exception:
        # Frontends were absent at preflight; only this activation may create them.
        compose(current, 'stop', 'gateway', 'admin')
        compose(current, 'rm', '-f', 'gateway', 'admin')
        compose(rollback, 'up', '-d', '--no-deps', '--pull', 'never', 'api')
        print('Activation failed; previous API origins restored and new frontends removed. Database and volumes untouched.')
        raise SystemExit(1)


preflight()
print('ACTIVATION PREFLIGHT PASS: reviewed Compose, pinned images, absent public frontends, expected API origin baseline')

PY
