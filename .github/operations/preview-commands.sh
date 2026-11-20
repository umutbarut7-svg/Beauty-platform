#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import copy,fcntl,json,pathlib,subprocess,time
from urllib.request import urlopen
from urllib.error import HTTPError
primary='preview.13-51-112-228.sslip.io'
alias='orzell.13-51-112-228.traefik.me'
path='/.well-known/apple-app-site-association'
docker=['docker','exec','-i','beauty-preview-gateway-1']
def run(cmd,data=None):
    return subprocess.run(cmd,text=True,input=data,capture_output=True,check=True,timeout=35).stdout
def active():
    return json.loads(run(docker+['wget','-qO-','http://127.0.0.1:2019/config/']))
def reload(config):
    run(docker+['caddy','reload','--config','/dev/stdin'],json.dumps(config))
def get(host):
    return run(['curl','--noproxy','*','--resolve',host+':443:127.0.0.1','-fsS','--max-time','5','https://'+host+path])
def apple(host):
    try:
        with urlopen('https://app-site-association.cdn-apple.com/a/v1/'+host,timeout=35) as r:
            print('Apple',host,r.status,'same declaration',json.load(r)==doc,flush=True)
    except HTTPError as e:
        print('Apple',host,e.code,e.headers.get('Apple-Failure-Reason'),e.headers.get('Apple-Failure-Details'),flush=True)
lock=pathlib.Path('/opt/epifiz/operations/saved-matching-release-20261031.lock').open('a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
before=active()
doc=json.loads(get(primary))
assert doc=={'applinks':{'details':[{'appIDs':['CDL78S6U9A.com.orzell.app'],'components':[{'/':'/discover/service'}]}]}}
candidate=copy.deepcopy(before)
servers=candidate['apps']['http']['servers']
server,=[s for s in servers.values() if primary in s.get('logs',{}).get('logger_names',{})]
assert alias not in json.dumps(before)
def respond(status,body):
    return {'handler':'static_response','status_code':status,'headers':{'Content-Type':['application/json']},'body':body}
routes=[{'match':[{'path':[path]}],'handle':[respond(200,json.dumps(doc,separators=(',',':')))],'terminal':True},{'handle':[respond(404,'{}')],'terminal':True}]
server['routes'].insert(0,{'match':[{'host':[alias]}],'handle':[{'handler':'subroute','routes':routes}],'terminal':True})
try:
    reload(candidate)
    for _ in range(35):
        try:
            if json.loads(get(alias))==doc: break
        except (subprocess.SubprocessError,ValueError): pass
        time.sleep(3)
    else: raise RuntimeError('Alias TLS was not ready; could not compare Apple responses')
    print('Secondary host trusted TLS and identical AASA verified',flush=True)
    apple(alias)
    apple(primary)
finally:
    current=active()
    if current==candidate: reload(before)
    elif current!=before: raise RuntimeError('Concurrent gateway update; review required')
    assert json.loads(get(primary))==doc
    print('Original preview configuration verified',flush=True)
PY
