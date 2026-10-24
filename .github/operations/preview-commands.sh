#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib,subprocess,hashlib,urllib.request,json
REV='3be316d1b2458c49fde162147244aa8077a1f614'
MANIFEST={"App.tsx":"efb1f2725ae8fa4ba071d1f1ddcb35f7f0bc0b8e519085cacd74f84f9061fec4","BusinessDemand.tsx":"afe7190a5b09ee61686a62699ab29d53f83761e79df3e263aa74fd404c4519cf","BusinessIntelligenceSetup.tsx":"924c52843827acd1bb1b982ed600b1f7b0b3c68cb6ba2cdd8e63ed7cb2fd0231","BusinessSetup.tsx":"ba4097f58c4461f038ebb881cf18c59f32754e4ded11f6cc9928d484a72b2e88","VisualJourney.tsx":"9fbcf49340816c17590741940d977243f363e6434a844d04cd0ada1d23152afb","OrzellBrand.tsx":"1202455be84abfc139e4748216c3a74a66295115f0385e87b433aabdae428c07","presentation.ts":"197f85db3a2e7a4433589e91d00715a8985e5e2dac897e42d5bfd327749a3519","ui.tsx":"1c1baaab1027af9129570d4cbb524698a185c0c80f7f74c293d026afade5e31f","app.json":"949f11fef113928b5b73958e79d36a833bad6ffade967afeec505595dc5b0fc7","assets/orzell-original-reference.jpg":"16ad3fabe252740fb9ec97316ac63a4b1c4c4648ef333e0a08027c3430bc0fa4"}
OLD='sha256:00521d1995ea85e58a024c2561195e432e9481c5ce93d029b66eec490130acd2'
BASE='sha256:9ecf655d9b97645eb91f040489baa1d3da5befb11d6b324a2e539b48fcf19286'
def run(args,timeout=30):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Reviewed build command failed: '+args[0])
 return p.stdout.strip()
def inspect(s,fmt):return run(['docker','inspect','beauty-preview-'+s+'-1','--format',fmt])
if inspect('gateway','{{.Image}}')!=OLD:raise SystemExit('Unexpected live gateway; build blocked')
run(['docker','image','inspect',BASE,'--format','{{.Id}}'])
services=['gateway','api','worker','postgres','prepare-secrets','admin']
before={s:inspect(s,'{{.State.StartedAt}}') for s in services}
folder=pathlib.Path('/opt/epifiz/operations/orzell-application-20261024');folder.mkdir(mode=0o700,exist_ok=True)
src=folder/'mobile';src.mkdir(exist_ok=True)
for name,digest in MANIFEST.items():
 with urllib.request.urlopen('https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/'+REV+'/apps/mobile/'+name,timeout=30) as response:data=response.read()
 if hashlib.sha256(data).hexdigest()!=digest:raise SystemExit('Source hash mismatch; build blocked')
 dest=src/name;dest.parent.mkdir(exist_ok=True);dest.write_bytes(data)
print('Pinned ORZELL sources and original emblem hashes: PASS',flush=True)
name='orzell-application-build-20261024'
run(['docker','create','--name',name,'--user','0:0','--network','none','--memory','896m','--cpus','1','-e','CI=1','-e','EXPO_NO_TELEMETRY=1','-e','NODE_OPTIONS=--max-old-space-size=640','-e','EXPO_PUBLIC_API_URL=https://preview.13-51-112-228.sslip.io/api','--entrypoint','sh',BASE,'-c','cd /repo && pnpm --filter @beauty-platform/mobile typecheck && pnpm --filter @beauty-platform/mobile exec expo export --platform web --output-dir dist --max-workers 1'])
try:
 run(['docker','cp',str(src)+'/.',name+':/repo/apps/mobile/'])
 with (folder/'build.log').open('w') as out:
  result=subprocess.run(['docker','start','-a',name],stdout=out,stderr=subprocess.STDOUT,timeout=600)
 if result.returncode:raise SystemExit('UI typecheck/export failed; raw output retained privately')
 web=folder/'web';web.mkdir(exist_ok=True)
 run(['docker','cp',name+':/repo/apps/mobile/dist/.',str(web)])
finally:subprocess.run(['docker','rm','-f',name],capture_output=True)
if '<title>ORZELL</title>' not in (web/'index.html').read_text():raise SystemExit('Candidate title failed')
if inspect('gateway','{{.Image}}')!=OLD:raise SystemExit('Gateway changed while building; packaging blocked')
run(['docker','tag',OLD,'epifiz-gateway:orzell-base-20261024'])
(folder/'Gateway.Dockerfile').write_text('FROM epifiz-gateway:orzell-base-20261024\nCOPY web/ /srv/web/\n')
run(['docker','build','--network','none','--pull=false','-f',str(folder/'Gateway.Dockerfile'),'-t','orzell-gateway:application-20261024',str(folder)],timeout=90)
for s in services:
 if inspect(s,'{{.State.StartedAt}}')!=before[s]:raise SystemExit('Live restart detected')
candidate=run(['docker','image','inspect','orzell-gateway:application-20261024','--format','{{.Id}}'])
(folder/'candidate.json').write_text(json.dumps({'revision':REV,'image':candidate,'previous':OLD}))
print('ORZELL typecheck and offline web export: PASS')
print('Existing services unchanged: PASS')
print('Candidate gateway: '+candidate)
print('BUILD ONLY; no publication or policy changes')
PY
