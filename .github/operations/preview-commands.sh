#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import subprocess,pathlib,hashlib,urllib.request,importlib.util,json,re
def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('Reviewed build command failed: '+args[0])
    return p.stdout.strip()
folder=pathlib.Path('/opt/epifiz/operations/booking-context-20261022')
folder.mkdir(mode=0o700,exist_ok=True)
helpers=[["infra/operations/preview-auth-ux-overlay.py","721de4991acd38a89d8154ebdc2c790a8f858f70"],["infra/operations/preview-booking-context-overlay.py","7945048d38e0ed464050ca11307962102f1b454c"],["infra/operations/check-preview-booking-context.cjs","6cc1ea963222f726b3502b95ef6803f02fd6d8c8"]]
loaded=[]
for index,(rel,expected) in enumerate(helpers):
    with urllib.request.urlopen('https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/f6b570200f703367db2a1b2dc6106a0980b5297f/'+rel,timeout=20) as response: data=response.read(20000)
    actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    if actual!=expected: raise SystemExit('Pinned test helper integrity mismatch')
    path=folder/pathlib.Path(rel).name
    path.write_bytes(data)
    if path.suffix=='.py':
        spec=importlib.util.spec_from_file_location('booking_helper_'+str(index),path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        loaded.append(module)
root=pathlib.Path('/opt/epifiz/application-123e7339')
source=folder/'source'
rels=['apps/api/src/appointments/appointments.service.ts','apps/api/src/appointments/appointment.dto.ts','apps/api/src/appointments/appointments.service.test.ts','apps/mobile/App.tsx']
for rel in rels:
    target=source/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((root/rel).read_bytes())
loaded[0].patch(source/'apps/mobile/App.tsx')
loaded[1].apply_booking(source)
loaded[1].add_regressions(source)
name='epifiz-booking-context-build'
migrate='sha256:9ecf655d9b97645eb91f040489baa1d3da5befb11d6b324a2e539b48fcf19286'
command='cd /repo && node check-booking.cjs && pnpm --filter @beauty-platform/mobile typecheck && pnpm --filter @beauty-platform/mobile build'
try:
    run(['docker','create','--name',name,'--user','0:0','--network','none','--memory','896m','--cpus','1','-e','CI=1','-e','EXPO_NO_TELEMETRY=1','-e','NODE_OPTIONS=--max-old-space-size=640','-e','EXPO_PUBLIC_API_URL=https://preview.13-51-112-228.sslip.io/api','--entrypoint','sh',migrate,'-c',command])
    for rel in rels: run(['docker','cp',str(source/rel),name+':/repo/'+rel])
    run(['docker','cp',str(folder/'check-preview-booking-context.cjs'),name+':/repo/check-booking.cjs'])
    with (folder/'build.log').open('w') as out:
        result=subprocess.run(['docker','start','-a',name],stdout=out,stderr=subprocess.STDOUT,timeout=600)
    log=(folder/'build.log').read_text(errors='replace')
    for line in log.splitlines():
        if line.endswith(': PASS'): print(line,flush=True)
    if result.returncode:
        for marker in ['regression failed','JavaScript heap out of memory','error TS','EACCES']:
            print('Build classification '+marker+': '+str(marker in log))
        raise SystemExit('Focused candidate build failed; raw output retained on host')
    (folder/'api').mkdir(exist_ok=True);(folder/'web').mkdir(exist_ok=True)
    for filename in ['appointments.service.js','appointment.dto.js']:
        run(['docker','cp',name+':/repo/apps/api/dist/appointments/'+filename,str(folder/'api'/filename)])
    run(['docker','cp',name+':/repo/apps/mobile/dist/.',str(folder/'web')])
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
for service,expected in [('api','sha256:d6f15b40595f4abce6e4c5c185158a292d10dea9b1057288e67dff5049633dfe'),('gateway','sha256:12795b0505df58bd349a803b76887a2452b77ba15c919a95e541f0f1bee502df')]:
    if run(['docker','inspect','beauty-preview-'+service+'-1','--format','{{.Image}}'])!=expected: raise SystemExit('Live image changed; packaging blocked')
    run(['docker','tag',expected,'epifiz-'+service+':booking-base-20261022'])
(folder/'Api.Dockerfile').write_text('FROM epifiz-api:booking-base-20261022\nCOPY --chown=node:node api/ /application/dist/appointments/\n')
(folder/'Gateway.Dockerfile').write_text('FROM epifiz-gateway:booking-base-20261022\nCOPY web/ /srv/web/\n')
for service in ['api','gateway']:
    run(['docker','build','--network','none','--pull=false','-f',str(folder/('Api.Dockerfile' if service=='api' else 'Gateway.Dockerfile')),'-t','epifiz-'+service+':booking-context-20261022',str(folder)],timeout=90)
print('Changed API modules compiled; focused compiled regressions: PASS')
print('Mobile typecheck and production Expo export: PASS')
print('Full API typecheck and full Vitest suite were not completed on this bounded host.')
for service in ['api','gateway']:
    print(service+' candidate: '+run(['docker','image','inspect','epifiz-'+service+':booking-context-20261022','--format','{{.Id}}']))
print('CANDIDATES ONLY; nothing published.')
PY
