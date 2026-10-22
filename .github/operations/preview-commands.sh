#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json, urllib.request, urllib.error, secrets, sys, subprocess
base='https://preview.13-51-112-228.sslip.io/api'
def call(path, method='GET', data=None, token=None):
    headers={'Origin':base[:-4]}
    if data is not None: headers['Content-Type']='application/json'
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+path,method=method,headers=headers,data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=15) as r: return r.status,r.read(),r.headers
    except urllib.error.HTTPError as e: return e.code,e.read(),e.headers
def expect(label,expected,result):
    code,body,headers=result
    print(label+': '+('PASS' if code==expected else 'FAIL')+' HTTP '+str(code),flush=True)
    if code!=expected: raise SystemExit(1)
    return json.loads(body) if body else None
try:
    expect('Unauthenticated identity denied',401,call('/auth/me'))
    email='epifiz-acceptance-'+secrets.token_hex(8)+'@example.test'
    password=secrets.token_urlsafe(24)
    expect('Short password rejected',400,call('/auth/register','POST',{'email':email,'password':'short'}))
    result=expect('Synthetic customer registration',201,call('/auth/register','POST',{'email':email,'password':password}))
    if result['user']['role']!='CUSTOMER': raise SystemExit('Role isolation FAIL')
    print('Default CUSTOMER role: PASS')
    expect('Duplicate email rejected',409,call('/auth/register','POST',{'email':email,'password':password}))
    expect('Incorrect password denied',401,call('/auth/login','POST',{'email':email,'password':password+'x'}))
    auth=expect('Customer login',200,call('/auth/login','POST',{'email':email,'password':password}))
    me=expect('Authenticated identity',200,call('/auth/me',token=auth['accessToken']))
    if me['id']!=result['user']['id']: raise SystemExit('Identity mismatch')
    expect('Closed MVP booking gate',503,call('/mvp/v1/bookings',token=auth['accessToken']))
    expect('Closed MVP passport gate',503,call('/mvp/v1/passport',token=auth['accessToken']))
    policy=expect('Photo policy capability',200,call('/mvp/v1/photos/policy',token=auth['accessToken']))
    if policy.get('available') is not False: raise SystemExit('Photo policy gate FAIL')
    print('Photo feature remains closed: PASS')
    rotated=expect('Refresh rotation',200,call('/auth/refresh','POST',{'refreshToken':auth['refreshToken']}))
    expect('Rotated token reuse denied',401,call('/auth/refresh','POST',{'refreshToken':auth['refreshToken']}))
    expect('Logout',204,call('/auth/logout','POST',{'refreshToken':rotated['refreshToken']}))
    expect('Logged out refresh denied',401,call('/auth/refresh','POST',{'refreshToken':rotated['refreshToken']}))
    expect('Initial registration session logout',204,call('/auth/logout','POST',{'refreshToken':result['refreshToken']}))
    print('Synthetic customer retained without privileges; all test refresh sessions revoked.')
except SystemExit: raise
except Exception:
    raise SystemExit('Acceptance transport or schema check failed; request and response withheld')
PY
docker inspect beauty-preview-api-1 beauty-preview-gateway-1 beauty-preview-migrate-1 --format '{{.Name}} {{.Image}} {{.State.Status}}'
