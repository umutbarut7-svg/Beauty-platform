#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import subprocess,json,re
env=json.loads(subprocess.check_output(['docker','inspect','--format','{{json .Config.Env}}','beauty-preview-api-1'],text=True))
origins=next((line.split('=',1)[1] for line in env if line.startswith('CORS_ORIGINS=')), '').split(',')
if not all(re.fullmatch(r'https?://[a-zA-Z0-9.:-]+',origin) for origin in origins): raise SystemExit('Unexpected origin format')
print('Runtime public CORS origins:',json.dumps(origins))
labels=json.loads(subprocess.check_output(['docker','inspect','--format','{{json .Config.Labels}}','beauty-preview-api-1'],text=True))
for key in ['com.docker.compose.project.working_dir','com.docker.compose.project.config_files','com.docker.compose.project.environment_file']:
    print(key,labels.get(key,'unset'))
PY
