#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib, subprocess, urllib.request
REV = '306b94a3f948bf6f939b56c51dfb14d099653ace'
EXPECTED = '91d45f734152a3e150cde40ce374667443fdb9dea1d1c8c445c0e97d32975769'
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
