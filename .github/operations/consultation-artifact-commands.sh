#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib, subprocess, urllib.request
REV = 'f3cb912ac93d0b18eb206565ba095ad81b14413d'
EXPECTED = '729d35e5ba6a91bb96f474ac83db76da9513f8d92d86a7d983563b86b49f6cf1'
try:
    url = 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/' + REV + '/infra/operations/publish-preview-consultation-artifact.sh'
    with urllib.request.urlopen(url, timeout=20) as response:
        script = response.read(24001)
    if len(script) > 24000 or hashlib.sha256(script).hexdigest() != EXPECTED or not script.startswith(b'#!/bin/bash\nset -euo pipefail\n'):
        raise ValueError('Pinned helper integrity mismatch')
except Exception:
    print('Pinned recovery helper unavailable; no unverified code executed')
    raise SystemExit(1)
raise SystemExit(subprocess.run(['bash'], input=script).returncode)
PY
