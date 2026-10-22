#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib,subprocess,json,time,urllib.request,re
def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('Reviewed operation failed: '+args[0])
    return p.stdout.strip()
def inspect(service,fmt): return run(['docker','inspect','beauty-preview-'+service+'-1','--format',fmt])
api=run(['docker','image','inspect','epifiz-api:booking-context-20261022','--format','{{.Id}}'])
gateway=run(['docker','image','inspect','epifiz-gateway:booking-context-20261022','--format','{{.Id}}'])
oldapi='sha256:d6f15b40595f4abce6e4c5c185158a292d10dea9b1057288e67dff5049633dfe'
oldgateway='sha256:12795b0505df58bd349a803b76887a2452b77ba15c919a95e541f0f1bee502df'
if inspect('api','{{.Image}}')!=oldapi or inspect('gateway','{{.Image}}')!=oldgateway: raise SystemExit('Unexpected live image; no replacement')
for value in [api,gateway]:
    if not re.fullmatch(r'sha256:[0-9a-f]{64}',value): raise SystemExit('Candidate image invalid')
unchanged=['api','gateway','worker','postgres','prepare-secrets','admin']
before={s:inspect(s,'{{.State.StartedAt}}') for s in unchanged}

def exercise_customer_booking(base):
    import urllib.error,urllib.parse,secrets,datetime,json
    sessions=[]
    appointment=None
    business=None
    token=None
    def call(path,method='GET',body=None,auth=None):
        headers={'Content-Type':'application/json'} if body is not None else {}
        if auth: headers['Authorization']='Bearer '+auth
        q=urllib.request.Request(base+path,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(q,timeout=15) as r: return r.status,r.read()
        except urllib.error.HTTPError as e: return e.code,e.read()
    def expect(label,status,result):
        code,body=result
        if code!=status: raise RuntimeError(label+' FAIL HTTP '+str(code))
        print(label+': PASS',flush=True)
        return json.loads(body) if body else None
    try:
        suffix=secrets.token_hex(8)
        owner=expect('Synthetic owner registration',201,call('/auth/register','POST',{'email':'epifiz-booking-'+suffix+'@example.test','password':secrets.token_urlsafe(24)}))
        sessions.append(owner)
        token=owner['accessToken']
        business=expect('Private synthetic salon creation',201,call('/businesses','POST',{'name':'EPIFIZ private QA '+suffix},token))
        if business.get('isPublic') is not False: raise RuntimeError('Synthetic salon unexpectedly public')
        p='/businesses/'+business['id']
        expect('Fixture booking settings',200,call(p+'/settings','PATCH',{'bookingEnabled':True,'onlinePaymentEnabled':False,'cancellationEnabled':True,'cancellationWindowMinutes':0},token))
        location=expect('Fixture location',201,call(p+'/locations','POST',{'name':'Private QA location','address':'Synthetic address','city':'Test City'},token))
        staff=expect('Fixture professional',201,call(p+'/staff','POST',{'firstName':'Synthetic','lastName':'Professional','displayName':'Private QA','locationIds':[location['id']]},token))
        category=expect('Fixture category',201,call(p+'/service-categories','POST',{'name':'Synthetic QA'},token))
        service=expect('Fixture service',201,call(p+'/services','POST',{'categoryId':category['id'],'name':'Synthetic QA service','price':'10.00','currency':'TRY','durationMinutes':30},token))
        expect('Fixture service assignment',201,call(p+'/staff/'+staff['id']+'/services/'+service['id'],'POST',{},token))
        days=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']
        expect('Fixture business schedule',200,call(p+'/working-hours','PUT',{'hours':[{'dayOfWeek':d,'isOpen':True,'openTime':'09:00','closeTime':'18:00'} for d in days]},token))
        expect('Fixture professional schedule',200,call(p+'/staff/'+staff['id']+'/working-hours','PUT',{'hours':[{'dayOfWeek':d,'isActive':True,'startTime':'09:00','endTime':'18:00'} for d in days]},token))
        date=(datetime.date.today()+datetime.timedelta(days=3)).isoformat()
        query=urllib.parse.urlencode({'locationId':location['id'],'serviceId':service['id'],'staffMemberId':staff['id'],'date':date})
        slots=expect('Synthetic future availability',200,call(p+'/availability?'+query,auth=token))
        if not slots: raise RuntimeError('Synthetic future slots absent')
        payload={'locationId':location['id'],'serviceId':service['id'],'staffMemberId':slots[0]['staffId'],'startsAt':slots[0]['startsAt']}
        expect('Manager context still requires explicit customer',400,call(p+'/appointments','POST',payload,token))
        expect('Self-booking flag rejects string coercion',400,call(p+'/appointments','POST',{**payload,'bookForSelf':'true'},token))
        expect('Owner self-booking cannot spoof customer',403,call(p+'/appointments','POST',{**payload,'bookForSelf':True,'customerId':'not-own-customer'},token))
        appointment=expect('Owner customer-context booking created',201,call(p+'/appointments','POST',{**payload,'bookForSelf':True},token))
        if appointment.get('status')!='PENDING': raise RuntimeError('Appointment initial state invalid')
        bookinglist=expect('Customer booking list read',200,call('/mvp/v1/bookings',auth=token))
        if not any(x['id']==appointment['id'] for x in bookinglist.get('items',[])): raise RuntimeError('Own booking missing from customer list')
        print('Created appointment visible in customer list: PASS',flush=True)
        expect('Same-slot conflict prevents duplicate booking',409,call(p+'/appointments','POST',{**payload,'bookForSelf':True},token))
        other=expect('Separate synthetic customer registration',201,call('/auth/register','POST',{'email':'epifiz-other-'+suffix+'@example.test','password':secrets.token_urlsafe(24)}))
        sessions.append(other)
        expect('Another customer cannot read appointment',404,call(p+'/appointments/'+appointment['id'],auth=other['accessToken']))
        print('Synthetic HTTP booking acceptance: PASS',flush=True)
    finally:
        if appointment and token and business:
            try:
                result=expect('Synthetic appointment cancelled',200,call('/businesses/'+business['id']+'/appointments/'+appointment['id']+'/status','PATCH',{'status':'CANCELLED'},token))
                if result.get('status')!='CANCELLED': raise RuntimeError('Test cancellation did not persist')
            except Exception: raise RuntimeError('Synthetic appointment cleanup needs review; no real salon was touched')
        if business and token:
            expect('Synthetic salon kept private and deactivated',200,call('/businesses/'+business['id'],'PATCH',{'isPublic':False,'status':'INACTIVE'},token))
        for session in sessions:
            expect('Synthetic refresh session logged out',204,call('/auth/logout','POST',{'refreshToken':session['refreshToken']}))

name='epifiz-booking-context-smoke'
environment=json.loads(inspect('api','{{json .Config.Env}}'))
if any(any(word in e.split('=',1)[0] for word in ['PASSWORD','SECRET','TOKEN','API_KEY','DATABASE_URL']) for e in environment): raise SystemExit('Unexpected credential-bearing container settings; no export')
try:
    args=['docker','run','-d','--name',name,'--network','beauty-preview_default','--memory','384m','--cpus','1','-p','127.0.0.1:13001:3001']
    for item in environment: args+=['-e',item]
    args+=[api,'api']
    run(args)
    for _ in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:13001/health/ready',timeout=3) as r:
                if r.status==200: break
        except OSError: time.sleep(2)
    else: raise RuntimeError('Candidate API readiness failed')
    exercise_customer_booking('http://127.0.0.1:13001')
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
for service in unchanged:
    if inspect(service,'{{.State.StartedAt}}')!=before[service]: raise SystemExit('Unexpected live service restart')
print('All existing preview services unchanged: PASS')
print('CANDIDATE BOOKING ACCEPTANCE ONLY: PASS; nothing published')
PY
