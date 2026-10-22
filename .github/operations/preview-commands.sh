#!/bin/bash
set -euo pipefail
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker stats --no-stream --format 'Memory: {{.Name}} {{.MemUsage}}'
python3 - <<'PY'
import urllib.request
for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
    origin='https://'+host
    request=urllib.request.Request(origin+'/api/health/ready',headers={'Origin':origin})
    with urllib.request.urlopen(request,timeout=8) as response:
        if response.status!=200 or response.headers.get('Access-Control-Allow-Origin')!=origin:
            raise SystemExit('HTTPS/API/CORS check failed')
    with urllib.request.urlopen(origin+'/',timeout=8) as response:
        if response.status!=200 or '<html' not in response.read(200000).decode(errors='replace'):
            raise SystemExit('Frontend HTML check failed')
    print('LIVE PREVIEW PASS: '+host+' HTTPS, HTML, API readiness, CORS')
PY
