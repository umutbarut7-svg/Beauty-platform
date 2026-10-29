#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib, subprocess, urllib.request
REV = '195f91e1a9969590dccd7fcd5cdd7188ce39c591'
EXPECTED = '2c48f3acae4b01a8a7d6d6a10dc5984044a74f5ce0dbf8cdf6d735acc9566bcb'
try:
    url = 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/' + REV + '/infra/operations/publish-preview-consultation-recovery.sh'
    with urllib.request.urlopen(url, timeout=20) as response:
        script = response.read(24001)
    if len(script) > 24000 or hashlib.sha256(script).hexdigest() != EXPECTED or not script.startswith(b'#!/bin/bash\nset -euo pipefail\n'):
        raise ValueError('Pinned helper integrity mismatch')
except Exception:
    print('Pinned recovery helper unavailable; no unverified code executed')
    raise SystemExit(1)
raise SystemExit(subprocess.run(['bash'], input=script).returncode)
PY
