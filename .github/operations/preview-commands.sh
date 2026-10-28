#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json,subprocess,urllib.request
def run(args):
    p=subprocess.run(args,capture_output=True,text=True,timeout=25)
    if p.returncode: raise SystemExit('Read-only command unavailable')
    return p.stdout
for service in ['api','worker']:
    d=json.loads(run(['docker','inspect','beauty-preview-'+service+'-1']))[0]
    e=dict(x.split('=',1) for x in d['Config'].get('Env',[]) if '=' in x)
    print(service+' running: '+str(bool(d['State'].get('Running'))))
    print(service+' image: '+d['Image'])
    for name in ['STAGE33_MVP_ENABLED','MVP_AI_ENABLED','MVP_SEMANTIC_ENABLED','MVP_S3_ENABLED','MVP_PHOTO_POLICY_REVIEWED','MVP_VERIFICATION_POLICY_REVIEWED']:
        v=e.get(name,'')
        print(service+' '+name+': '+(v if v in ['true','false'] else 'UNSET_OR_INVALID'))
    model=e.get('OPENAI_EMBEDDING_MODEL','')
    print(service+' embedding model: '+(model if model in ['text-embedding-3-small','text-embedding-3-large'] else 'UNSET_OR_UNSUPPORTED'))
    print(service+' API key env present: '+str(bool(e.get('OPENAI_API_KEY','').strip())))
    for name in ['MVP_AI_DAILY_REQUEST_LIMIT','MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT']:
        v=e.get(name,'')
        print(service+' '+name+': '+(v if v.isdigit() and len(v)<=5 else 'UNSET_OR_INVALID'))
    labels=d['Config'].get('Labels',{})
    print(service+' compose files: '+labels.get('com.docker.compose.project.config_files','UNKNOWN'))
    print(service+' compose env file: '+labels.get('com.docker.compose.project.environment_file','UNKNOWN'))
for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
    origin='https://'+host
    with urllib.request.urlopen(urllib.request.Request(origin+'/api/health/ready',headers={'Origin':origin}),timeout=15) as response:
        print('Public API health: '+str(response.status))
print('READ ONLY; no customer data, paid request, index change, restart, secret output or configuration change')
PY
