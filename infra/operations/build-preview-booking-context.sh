#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import subprocess,pathlib,time,shutil,json,re
def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('Reviewed build command failed: '+args[0])
    return p.stdout.strip()
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

#!/usr/bin/env python3
"""Pinned preview correction: customer booking intent stays explicit for owners."""
import pathlib,hashlib
EDITS = [{"path":"apps/api/src/appointments/appointments.service.ts","sha":"9136204f485430d2db6884027a5d98a341d1fb4e","changes":[["    const customerId = actor.manages ? dto.customerId : actor.customer?.id;","    const customerId = dto.bookForSelf\n      ? actor.customer?.id\n      : actor.manages ? dto.customerId : actor.customer?.id;"],["      !actor.manages &&\n      dto.customerId &&","      (!actor.manages || dto.bookForSelf) &&\n      dto.customerId &&"],["              internalNote: actor.manages ? dto.internalNote : undefined,","              internalNote: actor.manages && !dto.bookForSelf ? dto.internalNote : undefined,"]]},{"path":"apps/api/src/appointments/appointment.dto.ts","sha":"96e85d7dc7513012db3dd920b1b7b9beb2cf5dda","changes":[["  @IsOptional() @IsString() @Matches(ID) customerId?: string;","  @IsOptional() @IsBoolean() bookForSelf?: boolean;\n  @IsOptional() @IsString() @Matches(ID) customerId?: string;"]]},{"path":"apps/mobile/App.tsx","changes":[["                              staffMemberId: slot.staffId,\n                              startsAt: slot.startsAt,","                              staffMemberId: slot.staffId,\n                              bookForSelf: true,\n                              startsAt: slot.startsAt,"]]}]
def apply_booking(root):
    root=pathlib.Path(root)
    for edit in EDITS:
        path=root/edit['path']
        data=path.read_bytes()
        if 'sha' in edit:
            blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
            if blob!=edit['sha']: raise SystemExit('Preview source drift; booking patch blocked')
        content=data.decode()
        for before,after in edit['changes']:
            if content.count(before)!=1: raise SystemExit('Expected booking source missing')
            content=content.replace(before,after,1)
        path.write_text(content)
def add_regressions(root):
    path=pathlib.Path(root)/'apps/api/src/appointments/appointments.service.test.ts'
    content=path.read_text()
    before='function fixture(options: { overlap?: boolean; unavailable?: boolean } = {})'
    after='function fixture(options: { overlap?: boolean; unavailable?: boolean; ownerCustomer?: boolean } = {})'
    if content.count(before)!=1: raise SystemExit('Appointment fixture changed')
    content=content.replace(before,after,1)
    before='      findUnique: async ({ where }: any) =>\n        where.userId === "customer-user" || where.id === "customer"'
    after='      findUnique: async ({ where }: any) =>\n        options.ownerCustomer && (where.userId === "owner-user" || where.id === "owner-customer")\n          ? { id: "owner-customer" }\n          : where.userId === "customer-user" || where.id === "customer"'
    if content.count(before)!=1: raise SystemExit('Customer fixture changed')
    path.write_text(content.replace(before,after,1)+"\ndescribe(\"Explicit customer booking context for dual-role users\", () => {\n  const booking = {\n    serviceId: \"service\", locationId: \"location\", staffMemberId: \"staff-member\",\n    startsAt: \"2030-01-07T10:00:00.000Z\",\n  };\n  it(\"books for the owner's own customer only when explicitly requested\", async () => {\n    await expect(fixture({ ownerCustomer: true }).service.create(owner, \"business\", {\n      ...booking, bookForSelf: true, internalNote: \"must not persist\",\n    })).resolves.toMatchObject({ customerId: \"owner-customer\", internalNote: undefined, status: \"PENDING\" });\n  });\n  it(\"keeps manager booking without a selected customer rejected\", async () => {\n    await expect(fixture({ ownerCustomer: true }).service.create(owner, \"business\", booking))\n      .rejects.toThrow(\"A customer is required\");\n  });\n  it(\"preserves manager booking for an explicitly selected customer\", async () => {\n    await expect(fixture({ ownerCustomer: true }).service.create(owner, \"business\", {\n      ...booking, customerId: \"customer\",\n    })).resolves.toMatchObject({ customerId: \"customer\" });\n  });\n  it(\"rejects a different customer ID in self-booking context even for owners\", async () => {\n    await expect(fixture({ ownerCustomer: true }).service.create(owner, \"business\", {\n      ...booking, bookForSelf: true, customerId: \"customer\",\n    })).rejects.toBeInstanceOf(ForbiddenException);\n  });\n  it(\"does not invent a customer profile when the owner has none\", async () => {\n    await expect(fixture().service.create(owner, \"business\", {\n      ...booking, bookForSelf: true,\n    })).rejects.toThrow(\"A customer is required\");\n  });\n  it(\"preserves the existing staff booking restriction\", async () => {\n    await expect(fixture().service.create(staffUser, \"business\", {\n      ...booking, bookForSelf: true,\n    })).rejects.toBeInstanceOf(ForbiddenException);\n  });\n  it(\"keeps normal customers scoped to their own profile\", async () => {\n    await expect(fixture().service.create(customerUser, \"business\", {\n      ...booking, bookForSelf: true,\n    })).resolves.toMatchObject({ customerId: \"customer\" });\n  });\n});\n")

root=pathlib.Path('/opt/epifiz/application-123e7339')
folder=pathlib.Path('/opt/epifiz/operations/booking-context-20261022')
folder.mkdir(mode=0o700,exist_ok=True)
source=folder/'source'
for rel in ['apps/api/src/appointments/appointments.service.ts','apps/api/src/appointments/appointment.dto.ts','apps/api/src/appointments/appointments.service.test.ts','apps/mobile/App.tsx']:
    target=source/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes((root/rel).read_bytes())
patch(source/'apps/mobile/App.tsx')
apply_booking(source)
add_regressions(source)
name='epifiz-booking-context-build'
migrate='sha256:9ecf655d9b97645eb91f040489baa1d3da5befb11d6b324a2e539b48fcf19286'
command='cd /repo && pnpm --filter @beauty-platform/api exec vitest run src/appointments/appointments.service.test.ts && pnpm --filter @beauty-platform/api build && pnpm --filter @beauty-platform/mobile typecheck && pnpm --filter @beauty-platform/mobile build'
try:
    run(['docker','create','--name',name,'--user','0:0','--network','none','--memory','1024m','--cpus','1','-e','CI=1','-e','EXPO_NO_TELEMETRY=1','-e','NODE_OPTIONS=--max-old-space-size=768','-e','EXPO_PUBLIC_API_URL=https://preview.13-51-112-228.sslip.io/api','--entrypoint','sh',migrate,'-c',command])
    for rel in ['apps/api/src/appointments/appointments.service.ts','apps/api/src/appointments/appointment.dto.ts','apps/api/src/appointments/appointments.service.test.ts','apps/mobile/App.tsx']:
        run(['docker','cp',str(source/rel),name+':/repo/'+rel])
    with (folder/'build.log').open('w') as out:
        p=subprocess.run(['docker','start','-a',name],stdout=out,stderr=subprocess.STDOUT,timeout=720)
    if p.returncode:
        log=(folder/'build.log').read_text(errors='replace')
        for marker in ['FAIL','error TS','JavaScript heap out of memory','EACCES','ENOTFOUND']:
            print('Build classification '+marker+': '+str(marker in log))
        raise SystemExit('Booking regression/build failed; raw output retained locally')
    (folder/'api').mkdir(exist_ok=True)
    (folder/'web').mkdir(exist_ok=True)
    for rel in ['appointments.service.js','appointment.dto.js']:
        run(['docker','cp',name+':/repo/apps/api/dist/appointments/'+rel,str(folder/'api'/rel)])
    run(['docker','cp',name+':/repo/apps/mobile/dist/.',str(folder/'web')])
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
api='sha256:d6f15b40595f4abce6e4c5c185158a292d10dea9b1057288e67dff5049633dfe'
gateway='sha256:12795b0505df58bd349a803b76887a2452b77ba15c919a95e541f0f1bee502df'
for service,expected in [('api',api),('gateway',gateway)]:
    if run(['docker','inspect','beauty-preview-'+service+'-1','--format','{{.Image}}'])!=expected: raise SystemExit('Live image changed; candidate packaging blocked')
    run(['docker','tag',expected,'epifiz-'+service+':booking-base-20261022'])
(folder/'Api.Dockerfile').write_text('FROM epifiz-api:booking-base-20261022\nCOPY --chown=node:node api/ /application/dist/appointments/\n')
(folder/'Gateway.Dockerfile').write_text('FROM epifiz-gateway:booking-base-20261022\nCOPY web/ /srv/web/\n')
for service in ['api','gateway']:
    run(['docker','build','--network','none','--pull=false','-f',str(folder/('Api.Dockerfile' if service=='api' else 'Gateway.Dockerfile')),'-t','epifiz-'+service+':booking-context-20261022',str(folder)],timeout=90)
print('Existing appointment tests plus explicit owner-context regressions: PASS')
print('API production build, mobile typecheck and web export: PASS')
for service in ['api','gateway']:
    print(service+' candidate: '+run(['docker','image','inspect','epifiz-'+service+':booking-context-20261022','--format','{{.Id}}']))
print('Candidates only; no running container changed.')
PY
