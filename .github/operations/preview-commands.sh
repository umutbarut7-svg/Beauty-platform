#!/bin/bash
set -euo pipefail
exec 9>/var/lock/epifiz-gateway-build.lock
flock -n 9 || { echo "Another managed gateway build is running"; exit 1; }
python3 - <<'PY'
import subprocess,json,pathlib,re
env=json.loads(subprocess.check_output(['docker','inspect','--format','{{json .Config.Env}}','beauty-preview-api-1'],text=True))
origins=next((line.split('=',1)[1] for line in env if line.startswith('CORS_ORIGINS=')), '').split(',')
if len(origins)!=2 or not all(re.fullmatch(r'https://[a-zA-Z0-9.-]+',origin) for origin in origins):
    raise SystemExit('Unexpected public origin settings; build blocked')
if origins[1]!='https://admin.13-51-112-228.sslip.io':
    raise SystemExit('Admin build URL does not match runtime origin; build blocked')
settings={'PREVIEW_HOST':origins[0][8:],'ADMIN_HOST':origins[1][8:]}
path=pathlib.Path('/opt/epifiz/operations')
path.mkdir(mode=0o700,exist_ok=True)
(path/'validated-public-settings.json').write_text(json.dumps(settings))
print('Public preview hosts:',json.dumps(settings),flush=True)
command=['docker','build','--progress=plain','--target','gateway','--build-arg','WEB_API_URL='+origins[0]+'/api','-f','infra/preview/Dockerfile','-t','epifiz-gateway:preview-test','.']
with (path/'gateway-build.log').open('w') as log:
    try:
        result=subprocess.run(command,cwd='/opt/epifiz/application-123e7339',stdout=log,stderr=subprocess.STDOUT,timeout=360)
        code=result.returncode
    except subprocess.TimeoutExpired:
        code=124
text=(path/'gateway-build.log').read_text(errors='replace')
print('Gateway build exit code:',code)
markers={'web_export':'Exported:','bundled':'Bundled','image_export':'exporting to image','heap_oom':'heap out of memory','module_missing':'Unable to resolve module','dns_error':'EAI_AGAIN'}
print('Gateway build phase flags:',json.dumps({k:v in text for k,v in markers.items()}))
print('Cached build steps:',text.count('CACHED'))
if code==0:
    subprocess.run(['docker','image','inspect','epifiz-gateway:preview-test','--format','Gateway image ready: {{.Id}}'],check=True)
raise SystemExit(code)
PY
