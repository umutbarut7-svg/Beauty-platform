#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib, os, pathlib, subprocess, urllib.request
os.umask(0o077)
work = pathlib.Path('/opt/epifiz/operations/matching-one-approved-test-20261029')
if work.is_symlink():
    raise SystemExit('Operation directory cannot be a symlink')
try:
    with urllib.request.urlopen('https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/05d41946f89f263dc263edf539e6761b4f22b827/infra/operations/matching-test-window.py', timeout=20) as response:
        source = response.read(15001)
    if len(source) > 15000 or hashlib.sha256(source).hexdigest() != 'd41ab4f084e0b686e3bad35814d95fdd79855490ac1f7b960afb935faa8ae936':
        raise ValueError('Operation integrity mismatch')
    compile(source, 'quota-window.py', 'exec')
except Exception:
    raise SystemExit('Pinned operation unavailable; no unverified code executed')
work.mkdir(mode=0o700, exist_ok=True)
target = work / 'quota-window.py'
if target.is_symlink():
    raise SystemExit('Operation file cannot be a symlink')
target.write_bytes(source)
raise SystemExit(subprocess.run(['python3', str(target), 'open']).returncode)
PY
