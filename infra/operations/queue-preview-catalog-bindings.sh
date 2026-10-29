#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib, subprocess, urllib.request
REV = '4b30185f72de77147259523128abe7e318520406'
EXPECTED = '34d002ec874e461810af0afacdf0ffae2c115ae59c8198ba9c85020592d6b5ef'
try:
    url = 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/' + REV + '/infra/operations/publish-preview-catalog-bindings.sh'
    with urllib.request.urlopen(url, timeout=20) as response:
        script = response.read(20001)
    if len(script) > 20000 or hashlib.sha256(script).hexdigest() != EXPECTED or not script.startswith(b'#!/bin/bash\nset -euo pipefail\n'):
        raise ValueError('Pinned helper integrity mismatch')
except Exception:
    print('Pinned catalog helper unavailable; no unverified code executed')
    raise SystemExit(1)
raise SystemExit(subprocess.run(['bash'], input=script).returncode)
PY
