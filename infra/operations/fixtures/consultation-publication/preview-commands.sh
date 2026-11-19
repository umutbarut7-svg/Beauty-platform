#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib, subprocess, urllib.request
REV = 'bad352f6f2b6453cbb32a72293a54fe432155a0f'
EXPECTED = '208ec400cc4f868cc444368a35cf55cb9c894dd50c9742c05f04d143a9312f44'
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
