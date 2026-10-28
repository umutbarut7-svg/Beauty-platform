#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json, subprocess

# Inspect static code only. No DB records, environment, credentials or live requests.
source = """const fs=require('node:fs');const p='dist/mvp/mvp.service.js';if(!fs.existsSync(p)){console.log(JSON.stringify({methodLocated:false}));process.exit(0)}const text=fs.readFileSync(p,'utf8'),start=text.indexOf('async catalog('),end=text.indexOf('async bookings(',start);const method=start>=0&&end>start?text.slice(start,end).trim():null;console.log(JSON.stringify({methodLocated:method!==null,publicCatalogProjection:method}))"""
try:
    p = subprocess.run(['docker', 'exec', 'beauty-preview-api-1', 'node', '-e', source], capture_output=True, text=True, timeout=20)
    if p.returncode:
        raise RuntimeError('Static code inspection unavailable')
    result = json.loads(p.stdout)
    if set(result) - {'methodLocated', 'publicCatalogProjection'}:
        raise RuntimeError('Unexpected static inspection fields')
    print('Compiled public catalog code: ' + json.dumps(result, sort_keys=True))
    print('STATIC CODE READ ONLY; no database, environment, settings, secret, booking or AI request')
except Exception:
    print('Static code inspection unavailable; private output withheld')
    raise SystemExit(1)
PY
