#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import subprocess,json,urllib.request

def inspect(service):
    p=subprocess.run(['docker','inspect','beauty-preview-'+service+'-1'],capture_output=True,text=True,timeout=15)
    if p.returncode:raise SystemExit('Required preview service unavailable: '+service)
    return json.loads(p.stdout)[0]
services=['api','worker','postgres','admin','gateway']
for service in services:
    value=inspect(service)
    state=value['State']
    if not state.get('Running') or state.get('OOMKilled'):raise SystemExit('Service running/OOM check failed: '+service)
    if value.get('HostConfig',{}).get('RestartPolicy',{}).get('Name')!='unless-stopped':raise SystemExit('Restart policy failed: '+service)
    if service in ['api','postgres'] and state.get('Health',{}).get('Status')!='healthy':raise SystemExit('Healthcheck failed: '+service)
    print(service+' running, no OOM, restart policy configured: PASS')
    print(service+' restart count: '+str(value.get('RestartCount',0)))
    if service=='postgres' and not any(m.get('Type')=='volume' and m.get('Destination')=='/var/lib/postgresql/data' for m in value.get('Mounts',[])):raise SystemExit('PostgreSQL named volume absent')
print('PostgreSQL named volume configured: PASS')
expected={'api':'sha256:2b21a3c1dfa5f60f07cf04a1d1e741396f40b8ff7a86a79c9e74831810ce8f64','gateway':'sha256:be20529c1e0c9e1d8ab03109079d8e3c1d6b2acf85374a0e8155b3de2dfdf1a2'}
for service,digest in expected.items():
    if inspect(service)['Image']!=digest:raise SystemExit('Tested image mismatch: '+service)
print('Tested booking API and ORZELL gateway active: PASS')
for service in ['api','worker']:
    values=dict(item.split('=',1) for item in inspect(service).get('Config',{}).get('Env',[]) if '=' in item)
    if values.get('STAGE33_MVP_ENABLED')!='true':raise SystemExit('Core rollout unexpectedly closed: '+service)
    for name in ['MVP_AI_ENABLED','MVP_SEMANTIC_ENABLED','MVP_PHOTO_POLICY_REVIEWED','MVP_VERIFICATION_POLICY_REVIEWED']:
        if values.get(name)!='false':raise SystemExit('Policy/provider flag differs from reviewed state: '+service)
print('Core enabled and unreviewed AI/photo/verification flags closed: PASS')
for host in ['preview.13-51-112-228.sslip.io','admin.13-51-112-228.sslip.io']:
    origin='https://'+host
    with urllib.request.urlopen(urllib.request.Request(origin+'/api/health/ready',headers={'Origin':origin}),timeout=10) as r:
        if r.status!=200 or r.headers.get('Access-Control-Allow-Origin')!=origin:raise SystemExit('Public health/CORS failed')
print('Both public API health and CORS: PASS')
print('READ-ONLY SNAPSHOT COMPLETE; no restart, reboot, deletion, migration or new resources')
print('Live production recovery and continuous cleanup correctness remain unproven')
PY
python3 - <<'PY'
import pathlib,re,subprocess
def probe(args):
    try:
        r=subprocess.run(args,capture_output=True,text=True,timeout=15)
        return r.stdout if r.returncode==0 else None
    except (OSError,subprocess.TimeoutExpired):
        return None
timers=probe(['systemctl','list-timers','--all','--no-pager','--no-legend'])
units=probe(['systemctl','list-unit-files','--no-pager','--no-legend'])
pattern=re.compile(r'backup|pg.dump|snapshot',re.I)
print('Backup-related systemd timer entries: '+('UNVERIFIED' if timers is None else str(sum(bool(pattern.search(line)) for line in timers.splitlines()))))
print('Backup-related systemd unit entries: '+('UNVERIFIED' if units is None else str(sum(bool(pattern.search(line)) for line in units.splitlines()))))
cron=probe(['crontab','-l'])
print('Root cron database-backup commands observed: '+('UNVERIFIED' if cron is None else str(sum(bool(re.search(r'pg_dump|pg_basebackup',line)) for line in cron.splitlines() if line.strip() and not line.lstrip().startswith('#')))))
for location in ['/opt/epifiz/backups','/var/backups/epifiz','/var/backups/beauty-platform']:
    folder=pathlib.Path(location)
    print('Conventional application-backup directory present: '+str(folder.is_dir()))
print('Backup audit is metadata only. Timer names or files do not prove encryption, durability, retention or successful recovery.')
print('No database dump, S3 operation, scheduler change, secret output or service restart.')
PY
