#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json,subprocess,pathlib

def command(args):
    result=subprocess.run(args,capture_output=True,text=True,timeout=20)
    if result.returncode:raise SystemExit('Read-only inspection unavailable')
    return result.stdout
def inspect(service):
    return json.loads(command(['docker','inspect','beauty-preview-'+service+'-1']))[0]
def configured(values,name):
    return bool(values.get(name,'').strip())
def integer(values,name,minimum,maximum):
    try:
        raw=values.get(name,'')
        return bool(raw) and minimum<=int(raw)<=maximum and float(raw)==int(raw)
    except (ValueError,OverflowError):return False

expected={'api':'sha256:2b21a3c1dfa5f60f07cf04a1d1e741396f40b8ff7a86a79c9e74831810ce8f64','gateway':'sha256:f69ee2a5ed267d2c5d8701466c87671a6c9af5b9569977354ba7a4d4281ac9db'}
for service,image in expected.items():
    if inspect(service)['Image']!=image:raise SystemExit('Reviewed release differs: '+service)
print('Reviewed booking and business-selection release: PASS')
settings={}
names=['STAGE33_MVP_ENABLED','MVP_AI_ENABLED','MVP_SEMANTIC_ENABLED','MVP_PHOTO_POLICY_REVIEWED','MVP_PHOTO_POLICY_VERSION','MVP_PHOTO_NOTICE','MVP_PHOTO_RETENTION_HOURS','MVP_PHOTO_AUDIT_RETENTION_DAYS','MVP_VERIFICATION_POLICY_REVIEWED','MVP_VERIFICATION_POLICY_VERSION','MVP_VERIFICATION_NOTICE','MVP_VERIFICATION_FIELDS_JSON','MVP_VERIFICATION_RETENTION_DAYS','MVP_S3_ENABLED','MVP_S3_BUCKET','OPENAI_VISION_MODEL','OPENAI_EMBEDDING_MODEL','MVP_AI_DAILY_REQUEST_LIMIT','MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT']
for service in ['api','worker']:
    data=inspect(service)
    if not data['State'].get('Running') or data['State'].get('OOMKilled'):raise SystemExit('Runtime health failed: '+service)
    # No secrets are read from the child environment or emitted to logs.
    env=dict(item.split('=',1) for item in data['Config'].get('Env',[]) if '=' in item)
    values={name:env.get(name,'') for name in names}
    settings[service]=values
    if values['STAGE33_MVP_ENABLED']!='true':raise SystemExit('Core rollout differs: '+service)
    for name in ['MVP_AI_ENABLED','MVP_SEMANTIC_ENABLED','MVP_PHOTO_POLICY_REVIEWED','MVP_VERIFICATION_POLICY_REVIEWED']:
        if values[name]!='false':raise SystemExit('Unreviewed provider/policy gate changed: '+service)
    print(service+' unreviewed provider/policy gates closed: PASS')
    checks={
      'private storage enabled and bucket configured':values['MVP_S3_ENABLED']=='true' and configured(values,'MVP_S3_BUCKET'),
      'vision model configured':configured(values,'OPENAI_VISION_MODEL'),
      'supported embedding model configured':values['OPENAI_EMBEDDING_MODEL'] in ['text-embedding-3-small','text-embedding-3-large'],
      'bounded user and platform daily request quotas':integer(values,'MVP_AI_DAILY_REQUEST_LIMIT',1,100) and integer(values,'MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT',1,10000),
      'photo notice/version structurally configured':0<len(values['MVP_PHOTO_POLICY_VERSION'])<=100 and 0<len(values['MVP_PHOTO_NOTICE'])<=10000,
      'approved photo retention of 24 hours and audit of 90 days configured':values['MVP_PHOTO_RETENTION_HOURS']=='24' and values['MVP_PHOTO_AUDIT_RETENTION_DAYS']=='90',
      'verification notice/version structurally configured':0<len(values['MVP_VERIFICATION_POLICY_VERSION'])<=100 and 0<len(values['MVP_VERIFICATION_NOTICE'])<=10000,
      'approved verification evidence retention of 90 days configured':values['MVP_VERIFICATION_RETENTION_DAYS']=='90',
    }
    for label,ready in checks.items():print(service+' '+label+': '+('CONFIGURED' if ready else 'CONFIGURATION_REQUIRED'))
if settings['api']!=settings['worker']:raise SystemExit('Selected API/worker settings differ')
print('Selected API and worker configuration agreement: PASS')
worker=inspect('worker')
queue=[worker['State'].get('Pid',0)]
seen=set()
observed=False
try:
    while queue and len(seen)<20:
        pid=queue.pop()
        if not pid or pid in seen:continue
        seen.add(pid)
        process=pathlib.Path('/proc')/str(pid)
        args=(process/'cmdline').read_bytes().split(b'\0')
        if any(value.endswith(b'dist/worker.js') for value in args) and b'--once' not in args:observed=True
        children=process/'task'/str(pid)/'children'
        queue.extend(int(value) for value in children.read_text().split())
except (OSError,ValueError):pass
print('Long-running worker process observed: '+('PASS' if observed else 'UNVERIFIED')+'; sweep completion is not established')
print('PHOTO/AI ACTIVATION BLOCKED: reviewed identity/contact/notice and provider/policy acceptance remain required')
print('READ ONLY: no account, photo, AI call, database write, service restart or configuration change')
print('Storage/IAM safety, secret binding, cleanup success, recovery and native/photo quality are NOT certified by configuration presence')
PY
