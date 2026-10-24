#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib,subprocess,json,time,urllib.request,re
OLD='sha256:00521d1995ea85e58a024c2561195e432e9481c5ce93d029b66eec490130acd2'
NEW='sha256:be20529c1e0c9e1d8ab03109079d8e3c1d6b2acf85374a0e8155b3de2dfdf1a2'
API='sha256:2b21a3c1dfa5f60f07cf04a1d1e741396f40b8ff7a86a79c9e74831810ce8f64'
def run(args,timeout=30):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Reviewed publish command failed: '+args[0])
 return p.stdout.strip()
def inspect(s,fmt):return run(['docker','inspect','beauty-preview-'+s+'-1','--format',fmt])
if inspect('gateway','{{.Image}}')!=OLD or inspect('api','{{.Image}}')!=API:raise SystemExit('Unexpected live images; no changes')
if run(['docker','image','inspect','orzell-gateway:application-20261024','--format','{{.Id}}'])!=NEW:raise SystemExit('Candidate differs from reviewed build')
unchanged=['api','worker','postgres','prepare-secrets','admin']
before={s:inspect(s,'{{.State.StartedAt}}') for s in unchanged}
folder=pathlib.Path('/opt/epifiz/operations/orzell-application-20261024')
candidate=json.loads((folder/'candidate.json').read_text())
if candidate!={'revision':'3be316d1b2458c49fde162147244aa8077a1f614','image':NEW,'previous':OLD}:raise SystemExit('Candidate provenance mismatch')
def get(url,origin=None):
 req=urllib.request.Request(url,headers={'Origin':origin} if origin else {})
 with urllib.request.urlopen(req,timeout=15) as r:return r.read(),r.headers,r.status
def normalize(text):
 return re.sub(r"\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))",lambda m:chr(int(m.group(1) or m.group(2),16)),text)
def check_web(origin):
 html=get(origin+'/')[0].decode()
 if '<title>ORZELL</title>' not in html:raise RuntimeError('ORZELL title absent')
 scripts=re.findall(r'<script[^>]+src="([^"]+)"',html)
 paths=[p for p in scripts if p.startswith('/') and p.endswith('.js')]
 if not paths:raise RuntimeError('Application bundle absent')
 text=normalize(''.join(get(origin+p)[0].decode() for p in paths))
 for marker in ['ORZELL','RZELL','Randevuyu onayla','bookForSelf','Bakımım','İşletme alanına geç','Geçerli bir takvim tarihi girin.']:
  if marker not in text:raise RuntimeError('Candidate UI marker missing')
def health():
 for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
  origin='https://'+host
  data,headers,status=get(origin+'/api/health/ready',origin)
  if status!=200 or headers.get('Access-Control-Allow-Origin')!=origin:raise RuntimeError('Public health/CORS failed')
name='orzell-gateway-local-20261024'
run(['docker','run','-d','--name',name,'--network','bridge','--memory','96m','--cpus','0.5','-p','127.0.0.1:18081:8080','--entrypoint','caddy',NEW,'file-server','--root','/srv/web','--listen',':8080'])
try:
 for attempt in range(10):
  try:check_web('http://127.0.0.1:18081');break
  except OSError:time.sleep(1)
 else:raise RuntimeError('Local candidate unavailable')
finally:subprocess.run(['docker','rm','-f',name],capture_output=True)
print('Local candidate HTML, JavaScript and ORZELL/booking/date markers: PASS',flush=True)
values=dict(line.split('=',1) for line in pathlib.Path('/opt/epifiz/operations/epifiz-brand-20261022/publish.env').read_text().splitlines() if '=' in line)
if values.get('GATEWAY_IMAGE')!=OLD:raise SystemExit('Prior compose image drift')
current=folder/'publish.env';rollback=folder/'rollback.env'
for path,image in [(current,NEW),(rollback,OLD)]:
 path.write_text(''.join(k+'='+v+'\n' for k,v in {**values,'GATEWAY_IMAGE':image}.items()));path.chmod(0o600)
def compose(env):
 return run(['docker','compose','--env-file',str(env),'-f','/opt/epifiz/application-123e7339/infra/preview/compose.yml','-f','/opt/epifiz/operations/booking-context-20261022/mvp.yml','up','-d','--no-deps','--pull','never','gateway'],timeout=120)
try:
 compose(current)
 for attempt in range(12):
  try:check_web('https://preview.13-51-112-228.sslip.io');health();break
  except (OSError,RuntimeError):time.sleep(2)
 else:raise RuntimeError('Public acceptance deadline')
 for service in unchanged:
  if inspect(service,'{{.State.StartedAt}}')!=before[service]:raise RuntimeError('Unrelated service restarted')
 if inspect('gateway','{{.Image}}')!=NEW:raise RuntimeError('New image not active')
except Exception:
 compose(rollback)
 if inspect('gateway','{{.Image}}')!=OLD:raise SystemExit('Rollback needs operator review')
 raise SystemExit('Publication failed; previous gateway restored')
print('Public ORZELL title, application bundle and explicit self-booking markers: PASS')
print('Both API health/CORS checks: PASS')
print('API, worker, database, secret helper and admin restart isolation: PASS')
print('ORZELL PREVIEW PUBLICATION: PASS; physical-device and real-photo acceptance remain open')
PY
