import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../database/prisma.service.js";
import type { CustomerActivitySection } from "./customer.dto.js";

export const customerAppointmentSelect = {
  id: true,
  businessId: true,
  businessCustomerId: true,
  status: true,
  startsAt: true,
  endsAt: true,
  price: true,
  currency: true,
  service: { select: { id: true, name: true } },
  location: { select: { name: true } },
  staff: { select: { displayName: true } },
} satisfies Prisma.AppointmentSelect;

export type CustomerAppointment = Prisma.AppointmentGetPayload<{
  select: typeof customerAppointmentSelect;
}>;

export const customerOperationSelect = {
  id: true,
  businessId: true,
  changedAt: true,
  fromStatus: true,
  toStatus: true,
  appointment: {
    select: {
      id: true,
      businessId: true,
      businessCustomerId: true,
      service: { select: { name: true } },
    },
  },
} satisfies Prisma.AppointmentStatusHistorySelect;

export type CustomerOperation = Prisma.AppointmentStatusHistoryGetPayload<{
  select: typeof customerOperationSelect;
}>;

type Scope = [
  businessId: string,
  customerId: string,
  section: CustomerActivitySection,
];

export class CustomerActivityPage {
  readonly anchor?: { at: Date; id: string };

  constructor(
    private readonly scope: Scope,
    readonly limit: number,
    cursor?: string,
  ) {
    if (!cursor) return;
    try {
      const decoded: unknown = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      );
      if (
        !Array.isArray(decoded) ||
        decoded.length !== 5 ||
        scope.some((value, index) => value !== decoded[index])
      )
        throw new Error();
      const [, , , timestamp, id] = decoded;
      if (
        typeof timestamp !== "string" ||
        typeof id !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(id)
      )
        throw new Error();
      const at = new Date(timestamp);
      if (at.toISOString() !== timestamp) throw new Error();
      this.anchor = { at, id };
    } catch {
      throw new BadRequestException("Invalid customer activity cursor");
    }
  }

  get take() {
    return this.limit + 1;
  }

  where(field: "startsAt" | "changedAt") {
    const anchor = this.anchor;
    return anchor
      ? {
          OR: [
            { [field]: { lt: anchor.at } },
            { [field]: anchor.at, id: { lt: anchor.id } },
          ],
        }
      : {};
  }

  result<T extends { id: string }>(rows: T[], date: (item: T) => Date) {
    const items = rows.slice(0, this.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        last && rows.length > this.limit
          ? Buffer.from(
              JSON.stringify([
                ...this.scope,
                date(last).toISOString(),
                last.id,
              ]),
            ).toString("base64url")
          : null,
    };
  }
}

type CustomerPayment = {
  id: string;
  businessId: string;
  businessCustomerId: string;
  appointmentId: string;
  serviceName: string;
  type: "CHARGE" | "REFUND";
  amountMinor: string;
  currency: string;
  minorUnit: number | null;
  createdAt: Date;
};

export async function customerPayments(
  db: Pick<PrismaService, "$queryRawUnsafe">,
  businessId: string,
  customerId: string,
  page: CustomerActivityPage,
) {
  // Ledger references are polymorphic. Verify the source discriminator,
  // the original charge for refunds, and the tenant at every join.
  const rows: CustomerPayment[] = await db.$queryRawUnsafe(
    `SELECT entry.id, entry."businessId", a."businessCustomerId",
            a.id AS "appointmentId", service.name AS "serviceName",
            entry.type::text AS type, entry."amountMinor"::text AS "amountMinor", entry.currency,
            currency."minorUnit", entry."createdAt"
     FROM "Appointment" a
     JOIN "Service" service ON service."businessId" = a."businessId" AND service.id = a."serviceId"
     JOIN "FinancialLedgerEntry" charge ON charge."businessId" = a."businessId"
       AND charge.type = 'CHARGE' AND charge."sourceType" IN ('APPOINTMENT', 'BOOKING')
       AND charge."sourceId" = a.id
     JOIN LATERAL (
       SELECT charge.id, charge."businessId", charge.type, charge."amountMinor",
              charge.currency, charge."createdAt"
       UNION ALL
       SELECT refund.id, refund."businessId", refund.type, refund."amountMinor",
              refund.currency, refund."createdAt"
       FROM "FinancialLedgerEntry" refund
       WHERE refund."businessId" = charge."businessId" AND refund.type = 'REFUND'
         AND refund."sourceType" = 'REFUND' AND refund."sourceId" = charge.id
         AND refund."reversalOfId" = charge.id
     ) entry ON true
     LEFT JOIN "CurrencyDefinition" currency ON currency.code = entry.currency
     WHERE a."businessId" = $1 AND a."businessCustomerId" = $2
       AND ($3::timestamp IS NULL OR (entry."createdAt", entry.id) < ($3::timestamp, $4::text))
     ORDER BY entry."createdAt" DESC, entry.id DESC
     LIMIT $5`,
    businessId,
    customerId,
    page.anchor?.at.toISOString().slice(0, -1) ?? null,
    page.anchor?.id ?? null,
    page.take,
  );
  return page.result(rows, (row) => row.createdAt);
}
