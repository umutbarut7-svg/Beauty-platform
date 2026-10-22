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
if __name__=='__main__':
    import sys
    apply_booking(sys.argv[1])
    add_regressions(sys.argv[1])
