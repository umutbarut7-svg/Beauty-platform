#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import fcntl,json,subprocess,time
from pathlib import Path
gateway='beauty-preview-gateway-1'
docker=['docker','exec','-i',gateway]
def run(args,data=None):
    return subprocess.run(args,input=data,text=True,stdout=subprocess.PIPE,check=True,timeout=30).stdout
lock=Path('/opt/epifiz/operations/saved-matching-release-20261031.lock').open('a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
original=run(docker+['cat','/etc/caddy/Caddyfile'])
marker='  @appleServiceLink {'
if original.count(marker)!=1: raise SystemExit('Unexpected Apple route layout')
block="""  log apple_probe {
    output stderr
    format filter {
      wrap json
      fields {
        request delete
        resp_headers delete
        user_id delete
      }
    }
  }
  @skipAppleLog not path /.well-known/apple-app-site-association
  log_skip @skipAppleLog
"""
candidate=original.replace(marker,block+marker)
adapt=docker+['caddy','adapt','--adapter','caddyfile','--config','/dev/stdin']
prior=json.loads(run(adapt,original))
desired=json.loads(run(adapt,candidate))
active=json.loads(run(docker+['wget','-qO-','http://127.0.0.1:2019/config/']))
if active!=prior and active!=desired: raise SystemExit('Live configuration differs; stopped')
reload=docker+['caddy','reload','--adapter','caddyfile','--config','/dev/stdin']
host='preview.13-51-112-228.sslip.io'
def probe(path):
    return run(['curl','-fsS','--max-time','8','--resolve',host+':443:127.0.0.1','https://'+host+path])
try:
    if active!=desired: run(reload,candidate)
    start=str(int(time.time()) )
    probe('/api/health/ready')
    doc=json.loads(probe('/.well-known/apple-app-site-association'))
    assert doc['applinks']['details'][0]['appIDs']==['CDL78S6U9A.com.orzell.app']
    time.sleep(1)
    logs=subprocess.run(['docker','logs','--since',start,gateway],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=True).stdout
    events=[]
    for line in logs.splitlines():
        try: item=json.loads(line)
        except ValueError: continue
        if isinstance(item,dict) and item.get('logger')=='http.log.access.apple_probe': events.append(item)
    assert events and all('request' not in e and 'resp_headers' not in e for e in events)
    print('Apple route diagnostic active; self-test status:',events[-1]['status'],'events:',len(events))
except BaseException:
    if active!=desired: run(reload,original)
    raise
PY
