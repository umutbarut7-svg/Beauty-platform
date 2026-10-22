#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib,hashlib,json,subprocess,time,urllib.request,urllib.error,secrets,sys,datetime,urllib.parse
def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('Reviewed command failed: '+args[0])
    return p.stdout.strip()
def info(s,field):
    return run(['docker','inspect','beauty-preview-'+s+'-1','--format',field])
root=pathlib.Path('/opt/epifiz/application-123e7339')
base=root/'infra/preview/compose.yml'
data=base.read_bytes()
if hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!='5ccecefa6448197607f8391070549b7829bc6fe0': raise SystemExit('Compose drift; no change')
closed=['MVP_AI_ENABLED','MVP_SEMANTIC_ENABLED','MVP_PHOTO_POLICY_REVIEWED','MVP_VERIFICATION_POLICY_REVIEWED']
def flags(service):
    entries=json.loads(info(service,'{{json .Config.Env}}'))
    # Environment is examined in memory only and never emitted.
    return {k:v for k,v in (e.split('=',1) for e in entries) if k in closed+['STAGE33_MVP_ENABLED']}
for s in ['api','worker']:
    f=flags(s)
    if f.get('STAGE33_MVP_ENABLED')!='false' or any(f.get(k)!='false' for k in closed): raise SystemExit('Unexpected rollout state; no change')
unchanged=['postgres','prepare-secrets','admin','gateway']
before={s:info(s,'{{.State.StartedAt}}') for s in unchanged}
values={s.upper()+'_IMAGE':info(s,'{{.Image}}') for s in ['api','migrate','admin','gateway']}
if values['API_IMAGE']!='sha256:d6f15b40595f4abce6e4c5c185158a292d10dea9b1057288e67dff5049633dfe': raise SystemExit('Unexpected API image')
if values['GATEWAY_IMAGE']!='sha256:12795b0505df58bd349a803b76887a2452b77ba15c919a95e541f0f1bee502df': raise SystemExit('Unexpected gateway image')
values.update(PREVIEW_HOST='preview.13-51-112-228.sslip.io',ADMIN_HOST='admin.13-51-112-228.sslip.io',HTTP_BIND='0.0.0.0:80',HTTPS_BIND='0.0.0.0:443')
folder=pathlib.Path('/opt/epifiz/operations/mvp-test-20261022')
folder.mkdir(mode=0o700,exist_ok=True)
env=folder/'live.env'
env.write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
env.chmod(0o600)
override=folder/'mvp-test.yml'
override.write_text('services:\n  api:\n    environment:\n      STAGE33_MVP_ENABLED: "true"\n  worker:\n    environment:\n      STAGE33_MVP_ENABLED: "true"\n')
override.chmod(0o600)
def compose(enabled,*args,timeout=90):
    return run(['docker','compose','--env-file',str(env),'-f',str(base)]+(['-f',str(override)] if enabled else [])+list(args),timeout)
a=json.loads(compose(False,'config','--format','json'))
b=json.loads(compose(True,'config','--format','json'))
for s in ['api','worker']:
    if b['services'][s]['environment']['STAGE33_MVP_ENABLED']!='true': raise SystemExit('Override invalid')
    b['services'][s]['environment']['STAGE33_MVP_ENABLED']='false'
if a!=b: raise SystemExit('Override changes unrelated configuration; no change')
print('Preflight: only API and worker MVP switch differs; provider/policy flags remain closed.',flush=True)
origin='https://preview.13-51-112-228.sslip.io'
def call(path,method='GET',body=None,token=None):
    headers={'Origin':origin}
    if body is not None: headers['Content-Type']='application/json'
    if token: headers['Authorization']='Bearer '+token
    q=urllib.request.Request(origin+'/api'+path,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(q,timeout=12) as r: return r.status,r.read()
    except urllib.error.HTTPError as e: return e.code,e.read()
def expect(label,status,result):
    code,body=result
    if code!=status: raise RuntimeError(label+' FAIL HTTP '+str(code))
    print(label+': PASS HTTP '+str(code),flush=True)
    return json.loads(body) if body else None
auth=None
try:
    compose(True,'up','-d','--no-deps','--pull','never','api','worker')
    for _ in range(45):
        if info('api','{{.State.Health.Status}}')=='healthy': break
        time.sleep(2)
    else: raise RuntimeError('API readiness timeout')
    expect('API readiness',200,call('/health/ready'))
    email='epifiz-mvp-check-'+secrets.token_hex(8)+'@example.test'
    auth=expect('Isolated synthetic customer registration',201,call('/auth/register','POST',{'email':email,'password':secrets.token_urlsafe(24)}))
    token=auth['accessToken']
    cap=expect('MVP capabilities',200,call('/mvp/v1/capabilities',token=token))
    if cap.get('enabled') is not True or cap.get('privatePhotos',{}).get('available') is not False or cap.get('visualAnalysis',{}).get('available') is not False or cap.get('matching',{}).get('semanticVectorAvailable') is not False: raise RuntimeError('Capability isolation failed')
    print('MVP enabled; private photos, vision and semantic AI unavailable: PASS')
    for s in ['api','worker']:
        f=flags(s)
        if f.get('STAGE33_MVP_ENABLED')!='true' or any(f.get(k)!='false' for k in closed): raise RuntimeError('Rollout isolation failed')
    result=expect('Public business discovery',200,call('/discovery/search?query=restart%20hair%20design&limit=20',token=token))
    matches=[x for x in result.get('items',[]) if x.get('name','').strip().lower()=='restart hair design']
    if len(matches)!=1: raise RuntimeError('Expected exactly one matching public business')
    bid=matches[0]['businessId']
    catalog=expect('Published salon service catalog',200,call('/mvp/v1/catalog/'+bid,token=token))
    if not catalog.get('services') or not catalog.get('staff') or not catalog.get('locations'): raise RuntimeError('Catalog setup missing')
    print('Published salon services, staff and location present: PASS')
    expect('Unauthenticated catalog access denied',401,call('/mvp/v1/catalog/'+bid))
    expect('Customer booking list',200,call('/mvp/v1/bookings',token=token))
    expect('Customer passport list',200,call('/mvp/v1/passport',token=token))
    combinations=[(s,p,l) for s in catalog['services'] for p in catalog['staff'] if any(x['serviceId']==s['id'] for x in p.get('services',[])) for l in catalog['locations']]
    if not combinations: raise RuntimeError('No staff service assignment')
    found=False
    for service,staff,location in combinations[:4]:
        for offset in range(1,8):
            date=(datetime.date.today()+datetime.timedelta(days=offset)).isoformat()
            q=urllib.parse.urlencode({'locationId':location['id'],'serviceId':service['id'],'staffMemberId':staff['id'],'date':date})
            code,body=call('/businesses/'+bid+'/availability?'+q,token=token)
            if code!=200: raise RuntimeError('Availability read FAIL HTTP '+str(code))
            if json.loads(body):
                found=True
                break
        if found: break
    print('Availability endpoint and future bookable slots: '+('PASS' if found else 'NO_SLOTS_REQUIRES_SETUP_REVIEW'),flush=True)
    if not found: raise RuntimeError('Future slots absent')
    for s in unchanged:
        if info(s,'{{.State.StartedAt}}')!=before[s]: raise RuntimeError('Unrelated service restarted')
    print('Database, secret helper, admin and gateway unchanged: PASS')
    print('APPROVED MVP TEST ACTIVATION: PASS. No appointment, payment, owner credential or policy approval was created.')
except Exception as error:
    compose(False,'up','-d','--no-deps','--pull','never','api','worker')
    print('Activation acceptance failed; API and worker MVP switches restored to false.')
    print(str(error) if isinstance(error,RuntimeError) else 'Sanitized activation failure')
    raise SystemExit(1)
finally:
    if auth:
        try:
            code,_=call('/auth/logout','POST',{'refreshToken':auth['refreshToken']})
            print('Synthetic test refresh session logout: '+('PASS' if code==204 else 'NOT_CONFIRMED'))
        except Exception: print('Synthetic session logout not confirmed; normal expiry applies')
PY
