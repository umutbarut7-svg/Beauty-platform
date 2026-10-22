#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib,subprocess,json,time,urllib.request,re

def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('Reviewed command failed: '+args[0])
    return p.stdout.strip()
def inspect(service,fmt):return run(['docker','inspect','beauty-preview-'+service+'-1','--format',fmt])
old='sha256:f69ee2a5ed267d2c5d8701466c87671a6c9af5b9569977354ba7a4d4281ac9db'
new='sha256:00521d1995ea85e58a024c2561195e432e9481c5ce93d029b66eec490130acd2'
if inspect('gateway','{{.Image}}')!=old:raise SystemExit('Unexpected live gateway; no change')
if run(['docker','image','inspect','epifiz-gateway:epifiz-brand-20261022','--format','{{.Id}}'])!=new:raise SystemExit('Candidate differs from tested image')
unchanged=['api','worker','postgres','prepare-secrets','admin']
before={s:inspect(s,'{{.State.StartedAt}}') for s in unchanged}
folder=pathlib.Path('/opt/epifiz/operations/epifiz-brand-20261022')
previous=pathlib.Path('/opt/epifiz/operations/booking-context-20261022')
values=dict(line.split('=',1) for line in (pathlib.Path('/opt/epifiz/operations/business-selection-20261022/publish.env')).read_text().splitlines() if '=' in line)
if values.get('GATEWAY_IMAGE')!=old:raise SystemExit('Unexpected prior compose image')
current=folder/'publish.env';rollback=folder/'rollback.env'
for path,image in [(current,new),(rollback,old)]:
    path.write_text(''.join(k+'='+v+'\n' for k,v in {**values,'GATEWAY_IMAGE':image}.items()));path.chmod(0o600)
def compose(env):return run(['docker','compose','--env-file',str(env),'-f','/opt/epifiz/application-123e7339/infra/preview/compose.yml','-f',str(previous/'mvp.yml'),'up','-d','--no-deps','--pull','never','gateway'],timeout=120)
def normalize(text):
    return re.sub(r"\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))", lambda match: chr(int(match.group(1) or match.group(2), 16)), text)
preflight=normalize(''.join(path.read_text() for path in (folder/'web').rglob('*.js')))
if not all(marker in preflight for marker in ['EPIFIZ', 'Seçili', 'Randevuyu iptal et', 'İptali onayla', 'bookForSelf']):raise SystemExit('Candidate UI preflight failed; live gateway unchanged')
print('Candidate bundle selection and cancellation markers: PASS',flush=True)
def check():
    origin='https://preview.13-51-112-228.sslip.io'
    with urllib.request.urlopen(origin+'/',timeout=10) as r:html=r.read().decode()
    if '<title>EPIFIZ</title>' not in html:raise RuntimeError('EPIFIZ page title absent')
    scripts=re.findall(r'<script[^>]+src="([^"]+)"',html)
    bodies=[]
    for path in scripts:
        if path.endswith('.js') and path.startswith('/'):
            with urllib.request.urlopen(origin+path,timeout=10) as r:bodies.append(r.read().decode())
    text=normalize(''.join(bodies))
    if not all(marker in text for marker in ['Randevuyu iptal et','ptali onayla','bookForSelf']):raise RuntimeError('Customer cancellation/booking UI markers absent')
    if 'EPIFIZ' not in text:raise RuntimeError('EPIFIZ brand marker absent')
    if 'Seçili' not in text:raise RuntimeError('Business selection marker absent')
    for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
        origin='https://'+host
        with urllib.request.urlopen(urllib.request.Request(origin+'/api/health/ready',headers={'Origin':origin}),timeout=10) as r:
            if r.status!=200 or r.headers.get('Access-Control-Allow-Origin')!=origin:raise RuntimeError('Public API health/CORS check failed')
try:
    compose(current)
    for attempt in range(12):
        try:check();break
        except (OSError,RuntimeError):time.sleep(2)
    else:raise RuntimeError('Public acceptance deadline')
    for service in unchanged:
        if inspect(service,'{{.State.StartedAt}}')!=before[service]:raise RuntimeError('Unrelated service restarted')
except Exception as error:
    if isinstance(error, RuntimeError) and str(error) in ['EPIFIZ page title absent','EPIFIZ brand marker absent','Business selection marker absent','Customer cancellation/booking UI markers absent','Public API health/CORS check failed','Public acceptance deadline','Unrelated service restarted']: print(str(error),flush=True)
    compose(rollback)
    if inspect('gateway','{{.Image}}')!=old:raise SystemExit('Rollback needs operator review')
    raise SystemExit('Publication failed; previous gateway restored')
print('Public EPIFIZ title/branding, business selection and cancellation UI: PASS')
print('Public API health/CORS and unrelated service restart isolation: PASS')
print('EPIFIZ BRAND UI PUBLICATION: PASS; browser acceptance pending')
PY
