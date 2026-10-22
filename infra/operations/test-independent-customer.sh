#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json,urllib.request
def exercise_customer_booking(base):
    import urllib.error,urllib.parse,secrets,datetime,json
    sessions=[]
    appointment=None
    business=None
    token=None
    customer=None
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
        customer=expect('Independent customer registration',201,call('/auth/register','POST',{'email':'epifiz-customer-'+suffix+'@example.test','password':secrets.token_urlsafe(24)}))
        sessions.append(customer)
        ct=customer['accessToken']
        appointment=expect('Independent customer booking created',201,call(p+'/appointments','POST',{**payload,'bookForSelf':True},ct))
        assert appointment['status']=='PENDING', 'Invalid initial status'
        path=p+'/appointments/'+appointment['id']
        rows=expect('Independent customer booking list',200,call('/mvp/v1/bookings',auth=ct))['items']
        assert any(x['id']==appointment['id'] for x in rows), 'Customer booking absent'
        other=expect('Unrelated customer registration',201,call('/auth/register','POST',{'email':'epifiz-other-'+suffix+'@example.test','password':secrets.token_urlsafe(24)}))
        sessions.append(other)
        expect('Unrelated customer read denied',404,call(path,auth=other['accessToken']))
        expect('Unrelated customer cancellation denied',403,call(path+'/cancel','POST',{'reason':'Synthetic denied attempt'},other['accessToken']))
        expect('Customer cannot confirm own appointment',403,call(path+'/status','PATCH',{'status':'CONFIRMED'},ct))
        expect('Duplicate slot denied',409,call(p+'/appointments','POST',{**payload,'bookForSelf':True},ct))
        rows=expect('Owner sees independent customer booking',200,call(p+'/appointments',auth=token))
        assert any(x['id']==appointment['id'] for x in rows), 'Owner booking absent'
        cancelled=expect('Customer cancels own appointment',201,call(path+'/cancel','POST',{'reason':'Synthetic acceptance test; no real service'},ct))
        assert cancelled['status']=='CANCELLED', 'Cancellation did not persist'
        appointment=cancelled
        rows=expect('Customer sees cancelled booking',200,call('/mvp/v1/bookings',auth=ct))['items']
        assert any(x['id']==appointment['id'] and x['status']=='CANCELLED' for x in rows), 'Customer cancellation absent'
        current=expect('Owner sees cancelled status',200,call(path,auth=token))
        assert current['status']=='CANCELLED', 'Owner cancellation absent'
        available=expect('Availability after cancellation',200,call(p+'/availability?'+query,auth=ct))
        assert any(x['startsAt']==payload['startsAt'] and x['staffId']==payload['staffMemberId'] for x in available), 'Cancelled slot not released'
        print('Independent customer booking, cancellation, isolation and released slot: PASS',flush=True)
    finally:
        if appointment and token and business and appointment.get('status')!='CANCELLED':
            try:
                result=expect('Synthetic appointment cancelled',200,call('/businesses/'+business['id']+'/appointments/'+appointment['id']+'/status','PATCH',{'status':'CANCELLED'},token))
                if result.get('status')!='CANCELLED': raise RuntimeError('Test cancellation did not persist')
            except Exception: raise RuntimeError('Synthetic appointment cleanup needs review; no real salon was touched')
        if business and token:
            expect('Synthetic salon kept private and deactivated',200,call('/businesses/'+business['id'],'PATCH',{'isPublic':False,'status':'INACTIVE'},token))
        for session in sessions:
            expect('Synthetic refresh session logged out',204,call('/auth/logout','POST',{'refreshToken':session['refreshToken']}))

exercise_customer_booking('https://preview.13-51-112-228.sslip.io/api')
print('INDEPENDENT CUSTOMER ACCEPTANCE: PASS; no deployment or real salon writes')
PY
