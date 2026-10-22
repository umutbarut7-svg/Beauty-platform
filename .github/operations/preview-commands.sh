#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib,subprocess,urllib.request,urllib.error,re,time,os,json
def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('Reviewed operation failed: '+args[0])
    return p.stdout.strip()
def inspect(name,template): return run(['docker','inspect',name,'--format',template])
old='sha256:05686cfe8cee185657590777e7b3b53a28adbd4fdee769095ff6dbb02242391f'
if inspect('beauty-preview-gateway-1','{{.Image}}')!=old: raise SystemExit('Unexpected live gateway; no replacement')
candidate=run(['docker','image','inspect','epifiz-gateway:auth-ux-20261022','--format','{{.Id}}'])
if candidate!='sha256:12795b0505df58bd349a803b76887a2452b77ba15c919a95e541f0f1bee502df': raise SystemExit('Candidate image invalid')
services=['api','worker','postgres','admin','prepare-secrets']
before={s:inspect('beauty-preview-'+s+'-1','{{.State.StartedAt}}') for s in services}
def get(url,host=None):
    q=urllib.request.Request(url,headers={'Host':host} if host else {})
    with urllib.request.urlopen(q,timeout=15) as r:
        if r.status!=200: raise RuntimeError('HTTP acceptance failed')
        return r.read().decode()
def check_ui(origin,host=None):
    html=get(origin+'/',host)
    assets=re.findall(r'<script[^>]+src="([^"]+)"',html)
    if not assets: raise RuntimeError('JS asset absent')
    script=''.join(get(origin+('/' if not p.startswith('/') else '')+p,host) for p in assets if p.endswith('.js'))
    script=re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m.group(1),16)),script)
    script=re.sub(r'\\x([0-9a-fA-F]{2})',lambda m:chr(int(m.group(1),16)),script)
    if 'Yeni hesap için şifre en az 12 karakter olmalı.' not in script: raise RuntimeError('New copy absent')
smoke='epifiz-auth-ux-smoke'
try:
    run(['docker','run','-d','--name',smoke,'--network','beauty-preview_default','--memory','96m','-p','127.0.0.1:18081:8080','-e','PREVIEW_HOST=http://preview.example.test:8080','-e','ADMIN_HOST=http://admin.example.test:8080',candidate])
    for _ in range(15):
        try:
            check_ui('http://127.0.0.1:18081','preview.example.test')
            get('http://127.0.0.1:18081/api/health/ready','preview.example.test')
            break
        except (OSError,ValueError,RuntimeError): time.sleep(1)
    else: raise RuntimeError('Isolated gateway acceptance failed')
    print('Isolated candidate HTML, JS, auth copy and API proxy: PASS',flush=True)
finally:
    subprocess.run(['docker','rm','-f',smoke],capture_output=True)
folder=pathlib.Path('/opt/epifiz/operations/auth-ux-20261022')
values={s.upper()+'_IMAGE':inspect('beauty-preview-'+s+'-1','{{.Image}}') for s in ['api','migrate','admin']}
values.update(GATEWAY_IMAGE=candidate,PREVIEW_HOST='preview.13-51-112-228.sslip.io',ADMIN_HOST='admin.13-51-112-228.sslip.io',HTTP_BIND='0.0.0.0:80',HTTPS_BIND='0.0.0.0:443')
def envfile(path,values):
    path.write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
    path.chmod(0o600)
current=folder/'live.env'
rollback=folder/'rollback.env'
envfile(current,values)
envfile(rollback,{**values,'GATEWAY_IMAGE':old})
def compose(path):
    run(['docker','compose','--env-file',str(path),'-f','/opt/epifiz/application-123e7339/infra/preview/compose.yml','up','-d','--no-deps','--pull','never','gateway'],timeout=90)
try:
    compose(current)
    for _ in range(15):
        try:
            check_ui('https://preview.13-51-112-228.sslip.io')
            for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
                get('https://'+host+'/api/health/ready')
                get('https://'+host+'/')
            break
        except (OSError,ValueError,RuntimeError): time.sleep(2)
    else: raise RuntimeError('Public gateway acceptance failed')
except Exception:
    compose(rollback)
    raise SystemExit('New gateway acceptance failed; previous gateway image restored')
for s in services:
    if inspect('beauty-preview-'+s+'-1','{{.State.StartedAt}}')!=before[s]: raise SystemExit('Unexpected service restart')
print('Public HTTPS, updated auth bundle, both API proxies: PASS')
print('API, worker, database, admin and secret helper restart isolation: PASS')
print('Active gateway image: '+candidate)
PY
