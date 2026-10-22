#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json,subprocess,urllib.request
for service in ['api','worker','postgres','admin','gateway','prepare-secrets']:
    name='beauty-preview-'+service+'-1'
    state=json.loads(subprocess.check_output(['docker','inspect',name,'--format','{{json .State}}'],text=True))
    if not state['Running'] or state.get('OOMKilled'): raise SystemExit('Runtime check failed')
    if service in ['api','postgres'] and state.get('Health',{}).get('Status')!='healthy': raise SystemExit('Readiness failed')
    print('Runtime '+service+': PASS')
for service in ['api','worker']:
    entries=json.loads(subprocess.check_output(['docker','inspect','beauty-preview-'+service+'-1','--format','{{json .Config.Env}}'],text=True))
    names=['STAGE33_MVP_ENABLED','MVP_AI_ENABLED','MVP_SEMANTIC_ENABLED','MVP_PHOTO_POLICY_REVIEWED','MVP_VERIFICATION_POLICY_REVIEWED']
    flags={k:v for k,v in (e.split('=',1) for e in entries) if k in names}
    if flags.get('STAGE33_MVP_ENABLED')!='true' or any(flags.get(k)!='false' for k in names[1:]): raise SystemExit('Rollout isolation failed')
    print('Core enabled; AI and policy gates closed: PASS')
for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
    origin='https://'+host
    q=urllib.request.Request(origin+'/api/health/ready',headers={'Origin':origin})
    with urllib.request.urlopen(q,timeout=10) as r:
        if r.status!=200 or r.headers.get('Access-Control-Allow-Origin')!=origin: raise SystemExit('HTTPS/CORS failed')
    print('HTTPS/API/CORS: PASS')
PY
