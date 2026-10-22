#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json,subprocess,urllib.request
for service in ['api','worker','postgres','admin','gateway','prepare-secrets']:
    name='beauty-preview-'+service+'-1'
    state=json.loads(subprocess.check_output(['docker','inspect',name,'--format','{{json .State}}'],text=True))
    if not state['Running'] or state.get('OOMKilled'): raise SystemExit('Runtime state FAIL: '+service)
    if service in ['api','postgres'] and state.get('Health',{}).get('Status')!='healthy': raise SystemExit('Readiness FAIL: '+service)
    print('Runtime '+service+': PASS')
for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
    origin='https://'+host
    q=urllib.request.Request(origin+'/api/health/ready',headers={'Origin':origin})
    with urllib.request.urlopen(q,timeout=10) as r:
        if r.status!=200 or r.headers.get('Access-Control-Allow-Origin')!=origin: raise SystemExit('HTTPS/CORS FAIL')
    print('Trusted HTTPS, API, CORS '+host+': PASS')
PY
