#!/bin/bash
set -euo pipefail
image=sha256:fc18e8b3deffb8939f8dbd8735ecbc6bb769462138f7a65b9c377c0cc2814b4c
name="epifiz-admin-smoke-$(date +%s)"
docker run -d --rm --name "$name" --label epifiz.operation=admin-smoke --init --memory 256m --cpus 0.5 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --publish 127.0.0.1:13000:3000 "$image" > /dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
python3 - <<'PY'
import urllib.request,urllib.error,time,json,pathlib,re
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:13000/',timeout=3) as response:
            body=response.read(200000).decode(errors='replace')
            if response.status==200 and '<html' in body and '/_next/' in body:
                print('ADMIN HTTP SMOKE PASS: 200, HTML and Next assets confirmed')
                break
    except (OSError,urllib.error.URLError):
        pass
    time.sleep(2)
else:
    raise SystemExit('ADMIN HTTP SMOKE FAIL')
allowed={'API_IMAGE','MIGRATE_IMAGE','ADMIN_IMAGE','GATEWAY_IMAGE','PREVIEW_HOST','ADMIN_HOST','HTTP_BIND','HTTPS_BIND'}
files=[p for p in pathlib.Path('/opt/epifiz').rglob('*') if p.is_file() and (p.name=='.env' or p.suffix=='.env') and 'node_modules' not in p.parts]
for path in files:
    values={}
    for line in path.read_text(errors='replace').splitlines():
        key,sep,value=line.partition('=')
        if sep and key.strip() in allowed:
            value=value.strip().strip('"').strip("'")
            if re.fullmatch(r'[a-zA-Z0-9._:/@-]+',value):
                values[key.strip()]=value
    if values: print('Non-secret preview settings:',json.dumps(values))
PY
docker inspect "$name" --format 'Smoke container state: {{.State.Status}}; OOM killed: {{.State.OOMKilled}}'
docker stats --no-stream "$name" --format 'Smoke container memory: {{.MemUsage}}'
