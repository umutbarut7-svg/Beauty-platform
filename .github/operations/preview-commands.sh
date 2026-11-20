#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import copy
import fcntl
import json
import os
import subprocess
import tempfile
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen

ROOT = Path('/opt/epifiz/operations')
OVERLAY = ROOT / 'service-pages-20261119/admin.json'
ADMIN = 'beauty-preview-admin-1'
OLD = 'https://preview.13-51-112-228.sslip.io'
NEW = 'https://links.orzell.app'
PATH = '/discover/service?businessId=cmvjkv2uz001tqa0jc72r3rl4&serviceId=cmw1wwm6u0009nx0jc6v3k4cr'

def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=120).stdout

class SocialPreview(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        item = dict(attrs)
        if tag == 'meta' and 'property' in item:
            self.meta[item['property']] = item.get('content')

def check(expected):
    with urlopen(NEW + PATH, timeout=8) as response:
        page = response.read(2000000).decode()
    preview = SocialPreview()
    preview.feed(page)
    if (preview.meta.get('og:url') != expected + PATH or
        preview.meta.get('og:image') != expected + '/orzell-original-reference.jpg' or
        'Saç kesimi' not in page or 'restart hair design' not in page.casefold()):
        raise RuntimeError('Public service or share metadata differs')

def install_file(content):
    with tempfile.NamedTemporaryFile(dir=OVERLAY.parent, delete=False) as temp:
        try:
            os.fchmod(temp.fileno(), OVERLAY.stat().st_mode & 0o777)
            temp.write(content)
            temp.flush()
            os.fsync(temp.fileno())
            os.replace(temp.name, OVERLAY)
        finally:
            Path(temp.name).unlink(missing_ok=True)

def publish():
    row = json.loads(run(['docker', 'inspect', ADMIN]))[0]
    labels = row['Config']['Labels']
    key = 'com.docker.compose.project'
    if labels.get(key) != 'beauty-preview' or labels.get('com.docker.compose.service') != 'admin':
        raise RuntimeError('Unexpected preview service')
    def known(path):
        return Path(path).resolve().is_relative_to('/opt/epifiz')
    directory = labels[key + '.working_dir']
    if not known(directory) or not Path(directory).is_dir():
        raise RuntimeError('Compose working directory unavailable')
    cmd = ['docker', 'compose', '-p', 'beauty-preview', '--project-directory', directory]
    for label, flag in [('environment_file', '--env-file'), ('config_files', '-f')]:
        paths = labels[key + '.' + label].split(',')
        if not all(known(p) and Path(p).is_file() for p in paths):
            raise RuntimeError('Compose inputs unavailable')
        for p in paths:
            cmd.extend([flag, p])
    if paths[-1] != str(OVERLAY) or OVERLAY.is_symlink():
        raise RuntimeError('Unexpected admin override file')
    saved = OVERLAY.read_bytes()
    overlay = json.loads(saved)
    spec = overlay['services']['admin']
    if (set(overlay['services']) != {'admin'} or spec['image'] != row['Image'] or
        spec['environment'].get('ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED') != 'false' or
        spec['environment'].get('ORZELL_PUBLIC_API_ORIGIN') != OLD):
        raise RuntimeError('Admin preview differs from the published service configuration')
    target = 'ORZELL_PUBLIC_ORIGIN'
    existing = spec['environment'][target]
    if existing == NEW:
        check(NEW)
        return
    if existing != OLD:
        raise RuntimeError('Unexpected prior public origin')
    check(OLD)
    before = json.loads(run(cmd + ['config', '--format', 'json']))
    expected = copy.deepcopy(before)
    expected['services']['admin']['environment'][target] = NEW
    spec['environment'][target] = NEW
    updated = (json.dumps(overlay) + '\n').encode()
    up = cmd + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'admin']
    applied = False
    install_file(updated)
    try:
        if json.loads(run(cmd + ['config', '--format', 'json'])) != expected:
            raise RuntimeError('Unexpected Compose change')
        applied = True
        run(up)
        for attempt in range(12):
            try:
                check(NEW)
                return
            except (OSError, ValueError, RuntimeError):
                if attempt == 11:
                    raise
                time.sleep(2)
    except BaseException:
        if OVERLAY.read_bytes() != updated:
            raise RuntimeError('Concurrent admin override modification')
        install_file(saved)
        if applied:
            run(up)
        raise

with (ROOT / 'saved-matching-release-20261031.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    publish()
    print('Verified the service details, public share URL and social preview image on links.orzell.app.')
PY
