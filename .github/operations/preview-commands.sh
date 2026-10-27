#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json, subprocess
selected = ['STAGE33_MVP_ENABLED','MVP_AI_ENABLED','MVP_SEMANTIC_ENABLED','MVP_PHOTO_POLICY_REVIEWED','MVP_S3_ENABLED','MVP_PHOTO_RETENTION_HOURS','MVP_PHOTO_AUDIT_RETENTION_DAYS','MVP_AI_DAILY_REQUEST_LIMIT','MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT']
for service in ['api','worker']:
    result = subprocess.run(['docker','inspect','beauty-preview-'+service+'-1'],capture_output=True,text=True,timeout=20)
    if result.returncode:
        raise SystemExit('Required service inspection failed: '+service)
    value = json.loads(result.stdout)[0]
    state = value['State']
    print(service+' running='+str(bool(state.get('Running')))+' oom='+str(bool(state.get('OOMKilled'))))
    env = dict(item.split('=',1) for item in value.get('Config',{}).get('Env',[]) if '=' in item)
    for name in selected:
        raw = env.get(name,'')
        # Emit only booleans and bounded numeric configuration, never arbitrary strings.
        safe = raw if raw in ['true','false'] or (raw.isascii() and raw.isdigit() and len(raw)<=6) else 'UNSET_OR_INVALID'
        print(service+' '+name+'='+safe)
    for name in ['MVP_PHOTO_POLICY_VERSION','MVP_PHOTO_NOTICE','MVP_S3_BUCKET','OPENAI_VISION_MODEL']:
        print(service+' '+name+'_CONFIGURED='+str(bool(env.get(name,'').strip())))
    print(service+' image='+str(value.get('Image','')))
print('READ_ONLY_COMPLETE: no secret retrieval, photo, AI call, configuration change, restart or database write')
PY
