#!/bin/bash
set -euo pipefail
stamp=$(date +%s)
admin="epifiz-admin-integration-$stamp"
gateway="epifiz-gateway-integration-$stamp"
existing=$(docker ps -q --filter label=com.docker.compose.project=beauty-preview --filter label=com.docker.compose.service=admin)
test -z "$existing" || { echo 'An admin service already exists; isolated alias test blocked'; exit 1; }
trap 'docker rm -f "$gateway" "$admin" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --name "$admin" --network beauty-preview_default --network-alias admin --init --memory 256m --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges sha256:fc18e8b3deffb8939f8dbd8735ecbc6bb769462138f7a65b9c377c0cc2814b4c >/dev/null
docker run -d --rm --name "$gateway" --network beauty-preview_default --memory 96m --pids-limit 128 --publish 127.0.0.1:18080:8080 --env PREVIEW_HOST=http://preview.example.test:8080 --env ADMIN_HOST=http://admin.example.test:8080 sha256:05686cfe8cee185657590777e7b3b53a28adbd4fdee769095ff6dbb02242391f >/dev/null
python3 - <<'PY'
import urllib.request,urllib.error,time,socket
from html.parser import HTMLParser
class Assets(HTMLParser):
    def __init__(self):
        super().__init__(); self.sources=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='script' and attrs.get('src','').startswith('/') and not attrs['src'].startswith('//'): self.sources.append(attrs['src'])
def fetch(host,path):
    request=urllib.request.Request('http://127.0.0.1:18080'+path,headers={'Host':host+':8080'})
    with urllib.request.urlopen(request,timeout=5) as response:
        return response.status,response.headers.get('Content-Type',''),response.read(200000)
for _ in range(30):
    try:
        if fetch('preview.example.test','/api/health/ready')[0]==200 and fetch('admin.example.test','/')[0]==200: break
    except (OSError,urllib.error.URLError): pass
    time.sleep(2)
else: raise SystemExit('GATEWAY READINESS FAIL')
for host,label in [('preview.example.test','WEB'),('admin.example.test','ADMIN')]:
    status,kind,body=fetch(host,'/')
    html=body.decode(errors='replace')
    if status!=200 or '<html' not in html: raise SystemExit(label+' HTML FAIL')
    parser=Assets();parser.feed(html)
    if not parser.sources: raise SystemExit(label+' ASSET DISCOVERY FAIL')
    status,kind,body=fetch(host,parser.sources[0])
    if status!=200 or 'javascript' not in kind or not body: raise SystemExit(label+' ASSET FAIL')
    if fetch(host,'/api/health/ready')[0]!=200: raise SystemExit(label+' API PROXY FAIL')
    print(label+' INTEGRATION PASS: HTML, JavaScript asset, API readiness proxy')
for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
    if socket.gethostbyname(host)!='13.51.112.228': raise SystemExit('Public preview DNS mismatch')
print('PUBLIC PREVIEW DNS PASS: both names resolve to the existing address')
PY
docker stats --no-stream "$admin" "$gateway" --format 'Integration memory: {{.Name}} {{.MemUsage}}'
docker inspect beauty-preview-api-1 --format 'Existing API health: {{.State.Health.Status}}'
