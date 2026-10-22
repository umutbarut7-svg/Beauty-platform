#!/bin/bash
set -euo pipefail
python3 - <<'PY'
EXPECTED_SOURCE='a9acff34e35bd9a108876581de37923387eae7aa88a4933c1faedea62f8cda11'
HELPER_SOURCE='#!/usr/bin/env python3\n"""Add explicit customer cancellation confirmation to the pinned preview UI."""\nimport pathlib\nEDITS = [(\'  const [selected, setSelected] = useState<MvpBooking | null>(null);\', \'  const [selected, setSelected] = useState<MvpBooking | null>(null);\\n  const [cancelTarget, setCancelTarget] = useState<string | null>(null);\'), (\'    keys.current.clear();\', \'    setCancelTarget(null);\\n    keys.current.clear();\'), (\'                    setSelected(b);\', \'                    setCancelTarget(null);\\n                    setSelected(b);\'), (\'  async function loadBookings() {\', \'  async function cancelSelectedAppointment() {\\n    if (mode !== "customer" || !selected || cancelTarget !== selected.id ||\\n        !["PENDING", "CONFIRMED", "CHECKED_IN"].includes(selected.status) ||\\n        Date.parse(selected.startsAt) <= Date.now()) return;\\n    const cancelled = await api.request<MvpBooking>(\\n      `/businesses/${selected.businessId}/appointments/${selected.id}/cancel`,\\n      "POST",\\n      { reason: "Müşteri tarafından iptal edildi." },\\n    );\\n    if (cancelled.id !== selected.id || cancelled.status !== "CANCELLED")\\n      throw new Error("Unexpected cancellation response");\\n    setSelected(cancelled);\\n    setBookings((current) => current.map((item) => item.id === cancelled.id ? cancelled : item));\\n    setCancelTarget(null);\\n    setSlots([]);\\n    setNotice("Randevunuz iptal edildi. Güncel saatler için müsaitlik aramasını yenileyin.");\\n  }\\n  async function loadBookings() {\'), (\'                {mode === "business" && (\\n                  <>\\n                    {[\', \'                {mode === "customer" &&\\n                  ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(selected.status) &&\\n                  Date.parse(selected.startsAt) > Date.now() && (\\n                    <>\\n                      {cancelTarget === selected.id ? (\\n                        <>\\n                          <Text style={styles.body}>Bu randevuyu iptal etmek istiyor musunuz? İptal koşulları işletme tarafından kontrol edilir.</Text>\\n                          {button("İptali onayla", cancelSelectedAppointment)}\\n                          {button("Vazgeç", async () => { setCancelTarget(null); })}\\n                        </>\\n                      ) : button("Randevuyu iptal et", async () => { setCancelTarget(selected.id); })}\\n                    </>\\n                  )}\\n                {mode === "business" && (\\n                  <>\\n                    {[\')]\ndef patch(path):\n    path=pathlib.Path(path)\n    text=path.read_text()\n    if "async function cancelSelectedAppointment()" in text: raise SystemExit("Cancellation already patched; no repeat")\n    for before,after in EDITS:\n        if text.count(before)!=1: raise SystemExit("Cancellation source drift; patch blocked")\n        text=text.replace(before,after,1)\n    path.write_text(text)\n'
TEST_SOURCE="const fs = require('node:fs');\nconst assert = require('node:assert/strict');\nconst { stripTypeScriptTypes } = require('node:module');\nconst app = fs.readFileSync(process.argv[2], 'utf8');\nconst handler = app.slice(app.indexOf('  async function cancelSelectedAppointment()'), app.indexOf('  async function loadBookings()'));\nassert.ok(handler.length > 300);\nasync function check(label, options = {}) {\n  let calls=0, selected={id:'own',businessId:'private',status:'PENDING',startsAt:'2099-01-01T09:00:00Z',...options.booking};\n  let rows=[selected,{id:'other',status:'CONFIRMED'}], notice='', cleared=false;\n  const api={request:async(path,method,body)=>{\n    calls++; assert.equal(path,'/businesses/private/appointments/own/cancel');assert.equal(method,'POST');assert.ok(body.reason);\n    if(options.reject) throw new Error('API rejected');\n    return {...selected,status:options.badResponse?'PENDING':'CANCELLED'};\n  }};\n  const fn=new Function('api','mode','selected','cancelTarget','setSelected','setBookings','setCancelTarget','setSlots','setNotice',stripTypeScriptTypes(handler)+';return cancelSelectedAppointment;')(\n    api,options.mode||'customer',selected,options.unconfirmed?null:'own',x=>selected=x,fn=>rows=fn(rows),()=>{},()=>cleared=true,x=>notice=x);\n  if(options.reject||options.badResponse) await assert.rejects(fn()); else await fn();\n  if(options.blocked){assert.equal(calls,0);assert.equal(notice,'');}\n  else if(options.reject||options.badResponse){assert.equal(selected.status,'PENDING');assert.equal(notice,'');assert.equal(cleared,false);}\n  else {assert.equal(calls,1);assert.equal(selected.status,'CANCELLED');assert.equal(rows[0].status,'CANCELLED');assert.equal(rows[1].status,'CONFIRMED');assert.equal(cleared,true);assert.ok(notice.includes('iptal edildi'));}\n  console.log(label+': PASS');\n}\n(async()=>{\n await check('Confirmed customer cancellation updates detail/list and clears stale slots');\n await check('Cancellation requires explicit confirmation',{unconfirmed:true,blocked:true});\n await check('Business mode cannot call customer action',{mode:'business',blocked:true});\n for(const status of ['IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW']) await check('Cancellation blocked for '+status,{booking:{status},blocked:true});\n await check('Past appointment cancellation blocked',{booking:{startsAt:'2000-01-01T09:00:00Z'},blocked:true});\n await check('API rejection preserves detail and list',{reject:true});\n await check('Unexpected response cannot claim success',{badResponse:true});\n})().catch(e=>{console.error(e.message);process.exitCode=1;});\n"
import pathlib,subprocess,hashlib,json

def run(args,timeout=30):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode: raise RuntimeError('Build command failed: '+args[0])
 return p.stdout.strip()
def image(service):return run(['docker','inspect','beauty-preview-'+service+'-1','--format','{{.Image}}'])
expected_gateway='sha256:7a7f80f9184476c9855a3e21ba8f3697dec28e92fa40ace802c50a32a8e28394'
if image('gateway')!=expected_gateway: raise SystemExit('Unexpected gateway; build blocked')
services=['api','gateway','worker','postgres','prepare-secrets','admin']
before={s:run(['docker','inspect','beauty-preview-'+s+'-1','--format','{{.State.StartedAt}}']) for s in services}
folder=pathlib.Path('/opt/epifiz/operations/customer-cancellation-20261022');folder.mkdir(mode=0o700,exist_ok=True)
source=pathlib.Path('/opt/epifiz/operations/booking-context-20261022/source/apps/mobile/App.tsx').read_bytes()
if hashlib.sha256(source).hexdigest()!=EXPECTED_SOURCE: raise SystemExit('Booking UI source drift; build blocked')
app=folder/'App.tsx';app.write_bytes(source)
namespace={};exec(HELPER_SOURCE,namespace);namespace['patch'](app)
(folder/'cancellation.test.cjs').write_text(TEST_SOURCE)
name='epifiz-cancellation-build'
try:
 run(['docker','create','--name',name,'--user','0:0','--network','none','--memory','896m','--cpus','1','-e','CI=1','-e','EXPO_NO_TELEMETRY=1','-e','NODE_OPTIONS=--max-old-space-size=640','-e','EXPO_PUBLIC_API_URL=https://preview.13-51-112-228.sslip.io/api','--entrypoint','sh','sha256:9ecf655d9b97645eb91f040489baa1d3da5befb11d6b324a2e539b48fcf19286','-c','cd /repo && node cancellation.test.cjs apps/mobile/App.tsx && pnpm --filter @beauty-platform/mobile typecheck && pnpm --filter @beauty-platform/mobile build'])
 run(['docker','cp',str(app),name+':/repo/apps/mobile/App.tsx'])
 run(['docker','cp',str(folder/'cancellation.test.cjs'),name+':/repo/cancellation.test.cjs'])
 with (folder/'build.log').open('w') as out: result=subprocess.run(['docker','start','-a',name],stdout=out,stderr=subprocess.STDOUT,timeout=600)
 log=(folder/'build.log').read_text(errors='replace')
 for line in log.splitlines():
  if line.endswith(': PASS'):print(line,flush=True)
 if result.returncode:raise SystemExit('UI typecheck/export failed; raw build output retained privately on host')
 (folder/'web').mkdir(exist_ok=True)
 run(['docker','cp',name+':/repo/apps/mobile/dist/.',str(folder/'web')])
finally:subprocess.run(['docker','rm','-f',name],capture_output=True)
if image('gateway')!=expected_gateway:raise SystemExit('Gateway changed; packaging blocked')
run(['docker','tag',expected_gateway,'epifiz-gateway:cancellation-base-20261022'])
(folder/'Gateway.Dockerfile').write_text('FROM epifiz-gateway:cancellation-base-20261022\nCOPY web/ /srv/web/\n')
run(['docker','build','--network','none','--pull=false','-f',str(folder/'Gateway.Dockerfile'),'-t','epifiz-gateway:customer-cancellation-20261022',str(folder)],timeout=90)
for s in services:
 if run(['docker','inspect','beauty-preview-'+s+'-1','--format','{{.State.StartedAt}}'])!=before[s]:raise SystemExit('Unexpected live restart')
print('Customer cancellation UI typecheck and production export: PASS')
print('Candidate gateway: '+run(['docker','image','inspect','epifiz-gateway:customer-cancellation-20261022','--format','{{.Id}}']))
print('BUILD ONLY; existing preview unchanged; no publication')
PY
