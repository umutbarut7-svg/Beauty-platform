#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json, pathlib, re, subprocess, time, urllib.request

OLD = 'sha256:be20529c1e0c9e1d8ab03109079d8e3c1d6b2acf85374a0e8155b3de2dfdf1a2'
NEW = 'sha256:c088ae1f4407caea77d37786265720c0b7302f12ec4b2f68736cd71ac33fa0bc'
REV = 'bef1f8c88547528546955485273bda45a69aad73'
folder = pathlib.Path('/opt/epifiz/operations/photo-picker-20261027')

def run(args, timeout=30):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError('Photo publish command failed: ' + args[0])
    return p.stdout.strip()

def inspect(service, fmt):
    return run(['docker','inspect','beauty-preview-'+service+'-1','--format',fmt])

if inspect('gateway','{{.Image}}') != OLD:
    raise SystemExit('Unexpected live gateway; no changes')
if run(['docker','image','inspect','orzell-gateway:photo-picker-20261027','--format','{{.Id}}']) != NEW:
    raise SystemExit('Candidate image differs from tested build')
if json.loads((folder/'candidate.json').read_text()) != {'revision':REV,'image':NEW,'previous':OLD}:
    raise SystemExit('Candidate provenance mismatch')
unchanged = ['api','worker','postgres','prepare-secrets','admin']
before = {s: inspect(s,'{{.Id}} {{.State.StartedAt}}') for s in unchanged}

def get(url, origin=None):
    request = urllib.request.Request(url,headers={'Origin':origin} if origin else {})
    with urllib.request.urlopen(request,timeout=15) as response:
        return response.read(), response.headers, response.status

def check_web(origin):
    html = get(origin+'/')[0].decode()
    if '<title>ORZELL</title>' not in html:
        raise RuntimeError('ORZELL title absent')
    paths = [p for p in re.findall(r'<script[^>]+src="([^"]+)"',html) if p.startswith('/') and p.endswith('.js')]
    if not paths:
        raise RuntimeError('Application script absent')
    text = ''.join(get(origin+p)[0].decode() for p in paths)
    text = re.sub(r'\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))',lambda m:chr(int(m.group(1) or m.group(2),16)),text)
    for marker in ['ORZELL','RZELL','bookForSelf','Randevuyu onayla','Fotoğraf hazırlanıyor','Fotoğraf yükleniyor','JPEG, PNG veya iPhone HEIC fotoğrafı seçin.']:
        if marker not in text:
            raise RuntimeError('Tested photo/booking marker absent')

def health():
    for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
        origin = 'https://'+host
        _, headers, status = get(origin+'/api/health/ready', origin)
        if status != 200 or headers.get('Access-Control-Allow-Origin') != origin:
            raise RuntimeError('Public health/CORS failed')

name = 'orzell-photo-picker-local-20261027'
run(['docker','run','-d','--name',name,'--network','bridge','--memory','96m','--cpus','0.5','-p','127.0.0.1:18081:8080','--entrypoint','caddy',NEW,'file-server','--root','/srv/web','--listen',':8080'])
try:
    for attempt in range(10):
        try:
            check_web('http://127.0.0.1:18081')
            break
        except OSError:
            time.sleep(1)
    else:
        raise RuntimeError('Local candidate unavailable')
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
print('Local candidate photo progress, normalization and preserved ORZELL/booking bundle: PASS',flush=True)
prior = pathlib.Path('/opt/epifiz/operations/orzell-application-20261024/publish.env')
values = dict(line.split('=',1) for line in prior.read_text().splitlines() if '=' in line)
if values.get('GATEWAY_IMAGE') != OLD:
    raise SystemExit('Prior compose image drift')
current, rollback = folder/'publish.env', folder/'rollback.env'
for path, image in [(current,NEW),(rollback,OLD)]:
    path.write_text(''.join(k+'='+v+'\n' for k,v in {**values,'GATEWAY_IMAGE':image}.items()))
    path.chmod(0o600)

def compose(env):
    return run(['docker','compose','--env-file',str(env),'-f','/opt/epifiz/application-123e7339/infra/preview/compose.yml','-f','/opt/epifiz/operations/booking-context-20261022/mvp.yml','up','-d','--no-deps','--no-build','--pull','never','gateway'],timeout=120)

try:
    if inspect('gateway','{{.Image}}') != OLD:
        raise RuntimeError('Gateway changed before publication')
    compose(current)
    for attempt in range(12):
        try:
            check_web('https://preview.13-51-112-228.sslip.io')
            health()
            break
        except (OSError,RuntimeError):
            time.sleep(2)
    else:
        raise RuntimeError('Public acceptance deadline')
    for service in unchanged:
        if inspect(service,'{{.Id}} {{.State.StartedAt}}') != before[service]:
            raise RuntimeError('Unrelated service restarted')
    if inspect('gateway','{{.Image}}') != NEW:
        raise RuntimeError('New image not active')
except Exception:
    compose(rollback)
    if inspect('gateway','{{.Image}}') != OLD:
        raise SystemExit('Rollback needs operator review')
    raise SystemExit('Publication failed; previous gateway restored')
print('Public photo-fix JavaScript and HTTPS: PASS')
print('Both API readiness/CORS checks: PASS')
print('API/worker/database/secret helper/admin restart isolation: PASS')
print('PHOTO PICKER PREVIEW PUBLICATION: PASS; real iPhone selection pending')
PY
