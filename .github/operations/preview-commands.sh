#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib, subprocess, re
folder=pathlib.Path('/opt/epifiz/operations/auth-ux-20261022')
text=''.join(p.read_text(errors='replace') for p in (folder/'dist').rglob('*.js'))
text=re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m.group(1),16)),text)
text=re.sub(r'\\x([0-9a-fA-F]{2})',lambda m:chr(int(m.group(1),16)),text)
for marker in ['Yeni hesap için şifre en az 12 karakter olmalı.','Bu e-posta zaten kayıtlı.']:
    if marker not in text: raise SystemExit('Auth UX compiled copy check failed')
old='sha256:05686cfe8cee185657590777e7b3b53a28adbd4fdee769095ff6dbb02242391f'
subprocess.run(['docker','tag',old,'epifiz-gateway:auth-ux-base-20261022'],check=True,capture_output=True)
(folder/'Dockerfile').write_text('FROM epifiz-gateway:auth-ux-base-20261022'+'\nCOPY dist/ /srv/web/\n')
result=subprocess.run(['docker','build','--network','none','--pull=false','-t','epifiz-gateway:auth-ux-20261022',str(folder)],capture_output=True,text=True,timeout=90)
if result.returncode:
    output=result.stdout+result.stderr
    for key in ['failed to resolve','pull access denied','permission denied','COPY','invalid reference','not found']:
        print('Candidate build classification '+key+': '+str(key in output))
    raise SystemExit('Gateway candidate build failed; output withheld')
print('Auth UX typecheck and Expo export completed in prior build: PASS')
print('Unicode-normalized compiled copy assertions: PASS')
print('Gateway candidate image: '+subprocess.check_output(['docker','image','inspect','epifiz-gateway:auth-ux-20261022','--format','{{.Id}}'],text=True).strip())
PY
