#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import subprocess,json,time,urllib.request
EXPECTED='sha256:d6f15b40595f4abce6e4c5c185158a292d10dea9b1057288e67dff5049633dfe'
NAME='beauty-preview-worker-1'
def run(args,timeout=20):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Reviewed recovery command failed: '+args[0])
 return p.stdout.strip()
def inspect(service):
 return json.loads(run(['docker','inspect','beauty-preview-'+service+'-1']))[0]
worker=inspect('worker')
if worker['Image']!=EXPECTED or not worker['State']['Running']:raise SystemExit('Unexpected worker; recovery test blocked')
if worker['HostConfig']['RestartPolicy']['Name']!='unless-stopped':raise SystemExit('Restart policy differs; no crash induced')
values=dict(item.split('=',1) for item in worker['Config']['Env'] if '=' in item)
for key in ['MVP_AI_ENABLED','MVP_SEMANTIC_ENABLED','MVP_PHOTO_POLICY_REVIEWED','MVP_VERIFICATION_POLICY_REVIEWED']:
 if values.get(key)!='false':raise SystemExit('Policy/provider state differs; no crash induced')
others=['api','gateway','postgres','prepare-secrets','admin']
before={s:(inspect(s)['Image'],inspect(s)['State']['StartedAt']) for s in others}
old_started=worker['State']['StartedAt'];old_count=worker.get('RestartCount',0)
def health():
 for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
  origin='https://'+host
  with urllib.request.urlopen(urllib.request.Request(origin+'/api/health/ready',headers={'Origin':origin}),timeout=10) as r:
   if r.status!=200 or r.headers.get('Access-Control-Allow-Origin')!=origin:raise RuntimeError('Public API health/CORS failed')
health()
probe="""const fs=require('node:fs');const matches=fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)).filter(x=>{try{return fs.readFileSync('/proc/'+x+'/cmdline','utf8').split('\\0')[1]==='dist/worker.js'}catch{return false}});if(matches.length!==1)process.exit(2);"""
run(['docker','exec',NAME,'node','-e',probe])
# Kill only the exact worker child, not Docker's init or any other container.
run(['docker','exec',NAME,'node','-e',probe+"process.kill(Number(matches[0]),'SIGKILL');"])
print('Exact worker child crash induced; no database/API/gateway action',flush=True)
automatic=False
for attempt in range(40):
 time.sleep(2)
 current=inspect('worker')
 if current['Image']!=EXPECTED:raise SystemExit('Unexpected worker image after crash')
 if current['State']['Running'] and current['State']['StartedAt']!=old_started and current.get('RestartCount',0)>old_count:
  try:
   run(['docker','exec',NAME,'node','-e',probe])
   automatic=True;break
  except RuntimeError:pass
if not automatic:
 # Restore availability without recreating or changing configuration.
 run(['docker','start',NAME])
 raise SystemExit('Automatic recovery not proven; worker start requested for availability')
recovered_started=current['State']['StartedAt']
time.sleep(10)
current=inspect('worker')
if not current['State']['Running'] or current['State'].get('OOMKilled') or current['State']['StartedAt']!=recovered_started:raise SystemExit('Recovered worker unstable')
run(['docker','exec',NAME,'node','-e',probe])
health()
for s in others:
 value=inspect(s)
 if (value['Image'],value['State']['StartedAt'])!=before[s]:raise SystemExit('Unrelated service changed')
print('Docker automatic worker restart and live worker child restored: PASS')
print('Recovered worker survived observation window; no OOM: PASS')
print('Other five services unchanged and both public API health/CORS: PASS')
print('No migration, database restart, data deletion, backup or policy change')
print('This proves process restart only; not real-photo erasure, host reboot or disaster recovery')
PY
