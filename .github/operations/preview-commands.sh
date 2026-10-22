#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib, subprocess, sys, hashlib, json, urllib.request, re, time
def run(args, timeout=30):
    result=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if result.returncode: raise RuntimeError('Command failed: '+args[0])
    return result.stdout.strip()
folder=pathlib.Path('/opt/epifiz/operations/auth-ux-20261022')
folder.mkdir(mode=0o700,exist_ok=True)
#!/usr/bin/env python3
"""Apply the narrowly scoped auth UX overlay to the pinned preview source."""
import hashlib, pathlib
SOURCE_BLOB = "54d1dc5cb665ad76036d4ab51ddf1e78dde9f7f1"
def patch(path):
    data=path.read_bytes()
    blob=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if blob!=SOURCE_BLOB: raise SystemExit("Preview App source differs; no patch applied")
    text=data.decode()
    text=text.replace("  async function choose(b: Business) {", "  async function authenticate(mode: \"login\" | \"register\") {\n    const normalizedEmail = email.trim().toLowerCase();\n    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizedEmail)) {\n      setNotice(\"Geçerli bir e-posta adresi girin.\");\n      return;\n    }\n    if (!password || (mode === \"register\" && password.length < 12)) {\n      setNotice(mode === \"register\"\n        ? \"Hesap oluşturmak için şifreniz en az 12 karakter olmalı.\"\n        : \"Şifrenizi girin.\");\n      return;\n    }\n    reset();\n    try {\n      const value = await api.signIn(mode, normalizedEmail, password);\n      setPassword(\"\");\n      setUser(value);\n    } catch (error) {\n      if (error instanceof ApiError && [400, 401, 409, 429].includes(error.status)) {\n        setNotice(error.status === 401\n          ? \"E-posta veya şifre hatalı. Henüz kaydolmadıysanız önce Hesap oluştur seçeneğini kullanın.\"\n          : error.status === 409\n            ? \"Bu e-posta zaten kayıtlı. Şifrenizle Giriş yap seçeneğini kullanın.\"\n            : error.status === 429\n              ? \"Çok fazla deneme yapıldı. Bir dakika bekleyip yeniden deneyin.\"\n              : \"E-posta biçimini kontrol edin. Yeni kayıt için şifre en az 12 karakter olmalı.\");\n        return;\n      }\n      throw error;\n    }\n  }\n"+"  async function choose(b: Business) {", 1)
    before="            {button(\"Giriş yap\", async () => {\n              reset();\n              const u = await api.signIn(\"login\", email, password);\n              setPassword(\"\");\n              setUser(u);\n            })}\n            {button(\"Hesap oluştur\", async () => {\n              reset();\n              const u = await api.signIn(\"register\", email, password);\n              setPassword(\"\");\n              setUser(u);\n            })}"
    after="            <Text style={styles.small}>\n              Yeni hesap için şifre en az 12 karakter olmalı.\n            </Text>\n            {button(\"Giriş yap\", () => authenticate(\"login\"))}\n            {button(\"Hesap oluştur\", () => authenticate(\"register\"))}"
    if text.count(before)!=1: raise SystemExit("Expected auth handlers missing")
    path.write_text(text.replace(before,after,1))

source=pathlib.Path('/opt/epifiz/application-123e7339/apps/mobile/App.tsx')
overlay=folder/'App.tsx'
overlay.write_bytes(source.read_bytes())
patch(overlay)
old='sha256:05686cfe8cee185657590777e7b3b53a28adbd4fdee769095ff6dbb02242391f'
migrate='sha256:9ecf655d9b97645eb91f040489baa1d3da5befb11d6b324a2e539b48fcf19286'
if run(['docker','inspect','beauty-preview-gateway-1','--format','{{.Image}}'])!=old: raise SystemExit('Gateway changed; build blocked')
name='epifiz-auth-ux-build'
log=folder/'build.log'
try:
    run(['docker','create','--name',name,'--user','0:0','--network','none','--memory','640m','--cpus','1','-e','CI=1','-e','EXPO_NO_TELEMETRY=1','-e','NODE_OPTIONS=--max-old-space-size=448','-e','EXPO_PUBLIC_API_URL=https://preview.13-51-112-228.sslip.io/api','--entrypoint','sh',migrate,'-c','cd /repo && pnpm --filter @beauty-platform/mobile typecheck && pnpm --filter @beauty-platform/mobile build'])
    run(['docker','cp',str(overlay),name+':/repo/apps/mobile/App.tsx'])
    with log.open('w') as out:
        built=subprocess.run(['docker','start','-a',name],stdout=out,stderr=subprocess.STDOUT,timeout=720)
    if built.returncode:
        text=log.read_text(errors='replace')
        print('Build failed; raw logs retained on host.')
        for marker in ['error TS','JavaScript heap out of memory','EACCES','ENOTFOUND']:
            print('Build classification '+marker+': '+str(marker in text))
        raise SystemExit(1)
    run(['docker','cp',name+':/repo/apps/mobile/dist',str(folder/'dist')])
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
text=''.join(p.read_text(errors='replace') for p in (folder/'dist').rglob('*.js'))
for marker in ['Yeni hesap için şifre en az 12 karakter olmalı.','Bu e-posta zaten kayıtlı.']:
    if marker not in text: raise SystemExit('Auth UX bundle assertion failed')
(folder/'Dockerfile').write_text('FROM '+old+'\nCOPY dist/ /srv/web/\n')
run(['docker','build','--network','none','--pull=false','-t','epifiz-gateway:auth-ux-20261022',str(folder)],timeout=90)
print('Auth UX typecheck and Expo production export: PASS')
print('Auth UX compiled copy assertions: PASS')
print('Gateway candidate image: '+run(['docker','image','inspect','epifiz-gateway:auth-ux-20261022','--format','{{.Id}}']))
print('Candidate built only. Live gateway unchanged.')
PY
