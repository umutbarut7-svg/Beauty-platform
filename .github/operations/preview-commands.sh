#!/bin/bash
set -euo pipefail
exec 9>/var/lock/epifiz-admin-build.lock
flock -n 9 || { echo "Another managed admin build is running"; exit 1; }
cd /opt/epifiz/application-123e7339
test -f infra/preview/Dockerfile.dockerignore
install -d -m 700 /opt/epifiz/operations
python3 - <<'PY'
import pathlib
source=pathlib.Path('infra/preview/Dockerfile').read_text()
old='RUN pnpm --filter @beauty-platform/admin build'
new='RUN NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @beauty-platform/admin exec next build --webpack'
if source.count(old)!=1: raise SystemExit('Unexpected Dockerfile; no build started')
pathlib.Path('/tmp/epifiz-admin-webpack-managed.Dockerfile').write_text(source.replace(old,new))
pathlib.Path('/tmp/epifiz-admin-webpack-managed.Dockerfile.dockerignore').write_bytes(pathlib.Path('infra/preview/Dockerfile.dockerignore').read_bytes())
print('Isolated Dockerfile and original context exclusions prepared')
PY
set +e
timeout --signal=TERM --kill-after=15s 360 docker build --progress=plain --target admin --build-arg ADMIN_API_URL=https://admin.13-51-112-228.sslip.io/api -f /tmp/epifiz-admin-webpack-managed.Dockerfile -t epifiz-admin:webpack-test . > /opt/epifiz/operations/admin-webpack-managed.log 2>&1
rc=$?
set -e
printf 'Admin build exit code: %s\n' "$rc"
python3 - <<'PY'
import pathlib,re,json
text=pathlib.Path('/opt/epifiz/operations/admin-webpack-managed.log').read_text(errors='replace')
markers={'next_started':'Next.js 16','compiled':'Compiled successfully','page_data':'Collecting page data','image_export':'exporting to image','heap_oom':'heap out of memory','killed':'Killed','dns_error':'EAI_AGAIN','module_missing':'Module not found','typescript_error':'Type error:','tls_error':'certificate','dependency_retry':'Will retry'}
print('Managed build phase flags:',json.dumps({k:v in text for k,v in markers.items()}))
print('Cached build steps:',text.count('CACHED'))
allowed={'builder','tls-base','admin-build','admin','internal'}
stages=[]
for stage,step,total in re.findall(r'\[([a-z-]+) ([0-9]+)/([0-9]+)\]',text):
    if stage in allowed:
        entry=[stage,int(step),int(total)]
        if not stages or stages[-1]!=entry: stages.append(entry)
print('Build stages reached:',json.dumps(stages[-12:]))
PY
if [ "$rc" -eq 0 ]; then
  docker image inspect epifiz-admin:webpack-test --format 'Admin image ready: {{.Id}}'
fi
exit "$rc"
