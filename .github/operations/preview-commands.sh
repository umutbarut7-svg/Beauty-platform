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
def overlay(old,new,current):
    if old==new: return current
    if current==old or current==new: return new
    if isinstance(old,dict) and isinstance(new,dict) and isinstance(current,dict) and old.keys()<=new.keys():
        merged=dict(current)
        for key,value in new.items():
            if key not in old:
                if key in current and current[key]!=value: raise ValueError('Conflicting live setting')
                merged[key]=value
            elif old[key]!=value:
                merged[key]=overlay(old[key],value,current[key])
        return merged
    if isinstance(old,list) and isinstance(new,list) and isinstance(current,list) and len(old)==len(new)==len(current):
        return [overlay(a,b,c) for a,b,c in zip(old,new,current)]
    raise ValueError('Conflicting live route')
desired=overlay(prior,desired,active)
reload=docker+['caddy','reload','--config','/dev/stdin']
host='preview.13-51-112-228.sslip.io'
def probe(path):
    return run(['curl','-fsS','--max-time','8','--resolve',host+':443:127.0.0.1','https://'+host+path])
try:
    if active!=desired: run(reload,json.dumps(desired))
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
    if active!=desired: run(reload,json.dumps(active))
    raise
PY
