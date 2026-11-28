import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { PermissionsService } from "../src/auth/permissions.service.js";
import { CustomersService } from "../src/customers/customers.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";

const url =
  "postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public";
if (process.env.STAGE32_TEST_DATABASE_URL !== url)
  throw new Error("CRM activity tests require the disposable CI database");
const prisma = new PrismaClient({ datasourceUrl: url });
afterAll(() => prisma.$disconnect());

describe("customer card on PostgreSQL", () => {
  it("paginates past 200 with scoped links, recorded charges and status history", async () => {
    const ownerId = randomUUID();
    const staffId = randomUUID();
    const businessId = randomUUID();
    const otherId = randomUUID();
    const startsAt = new Date("2030-03-10T13:00:00.123Z");
    const owner = {
      id: ownerId,
      email: `${ownerId}@example.test`,
      role: "BUSINESS_OWNER" as const,
    };
    const staff = {
      id: staffId,
      email: `${staffId}@example.test`,
      role: "STAFF" as const,
    };
    const rollback = new Error("discard CRM fixture transaction");
    try {
      await prisma.$transaction(
        async (tx) => {
          const database = tx as unknown as PrismaService;
          const service = new CustomersService(
            database,
            new PermissionsService(database),
          );
          await tx.user.createMany({
            data: [owner, staff].map(({ id, email }) => ({
              id,
              email,
              passwordHash: "fixture-not-a-credential",
            })),
          });
          const account = await tx.customer.create({
            data: { userId: ownerId },
          });
          await tx.business.createMany({
            data: [businessId, otherId].map((id) => ({
              id,
              name: id,
              slug: id,
            })),
          });
          await tx.businessMember.createMany({
            data: [
              { businessId, userId: ownerId, role: "BUSINESS_OWNER" },
              { businessId, userId: staffId, role: "STAFF" },
              { businessId: otherId, userId: ownerId, role: "BUSINESS_OWNER" },
            ],
          });
          const salon = await tx.serviceCategory.create({
            data: { businessId, name: "Saç", slug: "hair" },
          });
          const offering = await tx.service.create({
            data: {
              businessId,
              name: "Kesim",
              slug: "cut",
              categoryId: salon.id,
              durationMinutes: 30,
              price: "100",
            },
          });
          const profile = await tx.businessCustomer.create({
            data: {
              businessId,
              userCustomerId: account.id,
              bookingProfile: true,
            },
          });
          const manual = await tx.businessCustomer.create({
            data: { businessId, firstName: "Ada", lastName: "Fixture" },
          });
          const other = await tx.businessCustomer.create({
            data: {
              businessId: otherId,
              userCustomerId: account.id,
              bookingProfile: true,
            },
          });
          const ids = Array.from(
            { length: 207 },
            (_, index) => `${businessId}-${String(index).padStart(3, "0")}`,
          );
          await tx.appointment.createMany({
            data: ids.map((id, index) => ({
              id,
              businessId,
              serviceId: offering.id,
              customerId: account.id,
              businessCustomerId: profile.id,
              startsAt,
              endsAt: new Date(startsAt.getTime() + 1800_000),
              status: index === 0 ? "PENDING" : "COMPLETED",
              price: "100.00",
              currency: "TRY",
            })),
          });

          const appointmentId = ids[206]!;
          await tx.appointmentStatusHistory.create({
            data: {
              businessId,
              appointmentId,
              toStatus: "COMPLETED",
              changedById: ownerId,
            },
          });
          const ledger = {
            businessId,
            currency: "TRY",
            amountMinor: 1025n,
            reason: "fixture",
            createdAt: startsAt,
          };
          const charge = await tx.financialLedgerEntry.create({
            data: {
              ...ledger,
              type: "CHARGE",
              sourceType: "BOOKING",
              sourceId: appointmentId,
              idempotencyKey: "charge",
            },
          });
          const refund = await tx.financialLedgerEntry.create({
            data: {
              ...ledger,
              type: "REFUND",
              sourceType: "REFUND",
              sourceId: charge.id,
              reversalOfId: charge.id,
              amountMinor: 25n,
              idempotencyKey: "refund",
            },
          });
          await tx.financialLedgerEntry.createMany({
            data: [
              {
                ...ledger,
                businessId: otherId,
                type: "CHARGE",
                sourceType: "BOOKING",
                sourceId: appointmentId,
                idempotencyKey: "foreign",
              },
              {
                ...ledger,
                type: "CHARGE",
                sourceType: "SUBSCRIPTION",
                sourceId: appointmentId,
                idempotencyKey: "unrelated",
              },
              {
                ...ledger,
                type: "REFUND",
                sourceType: "REFUND",
                sourceId: appointmentId,
                idempotencyKey: "unlinked-refund",
              },
            ],
          });

          const list = await service.list(owner, businessId, {
            page: 1,
            limit: 25,
            sort: "name",
            direction: "asc",
            archived: false,
          });
          expect(list.items.map((item: { id: string }) => item.id)).toEqual([
            manual.id,
            profile.id,
          ]);

          const found: string[] = [];
          const first = await service.activity(owner, businessId, profile.id, {
            section: "appointments",
            limit: 50,
          });
          for (let current = first; ;) {
            found.push(...current.items.map(({ id }) => id));
            if (!current.nextCursor) break;
            current = await service.activity(owner, businessId, profile.id, {
              section: "appointments",
              limit: 50,
              cursor: current.nextCursor,
            });
          }
          expect(found).toEqual([...ids].reverse());
          const cursor = first.nextCursor!;
          await expect(
            service.activity(owner, businessId, manual.id, {
              section: "appointments",
              limit: 50,
              cursor,
            }),
          ).rejects.toThrow("cursor");
          await expect(
            service.activity(owner, otherId, other.id, {
              section: "appointments",
              limit: 50,
              cursor,
            }),
          ).rejects.toThrow("cursor");
          await expect(
            service.activity(owner, businessId, profile.id, {
              section: "services",
              limit: 50,
              cursor,
            }),
          ).rejects.toThrow("cursor");
          await expect(
            service.activity(owner, otherId, profile.id, {
              section: "appointments",
              limit: 50,
            }),
          ).rejects.toThrow("not found");
          await expect(
            service.appointment(owner, businessId, manual.id, appointmentId),
          ).rejects.toThrow("not found");
          await expect(
            service.appointment(owner, businessId, profile.id, appointmentId),
          ).resolves.toMatchObject({ service: { name: "Kesim" } });

          const completed = await service.activity(
            owner,
            businessId,
            profile.id,
            { section: "services", limit: 50 },
          );
          expect(completed.items).toHaveLength(50);
          expect(
            completed.items.every(
              (row) => "status" in row && row.status === "COMPLETED",
            ),
          ).toBe(true);

          await expect(
            service.activity(staff, businessId, profile.id, {
              section: "payments",
              limit: 1,
            }),
          ).rejects.toThrow("Insufficient permission");
          await expect(
            service.activity(staff, businessId, profile.id, {
              section: "operations",
              limit: 1,
            }),
          ).rejects.toThrow("Insufficient permission");
          await expect(
            service.activity(owner, businessId, profile.id, {
              section: "operations",
              limit: 1,
            }),
          ).resolves.toMatchObject({
            items: [
              { toStatus: "COMPLETED", appointment: { id: appointmentId } },
            ],
            nextCursor: null,
          });
          const money = await service.activity(owner, businessId, profile.id, {
            section: "payments",
            limit: 1,
          });
          expect(money.items).toHaveLength(1);
          expect(money.nextCursor).not.toBeNull();
          const more = await service.activity(owner, businessId, profile.id, {
            section: "payments",
            limit: 1,
            cursor: money.nextCursor!,
          });
          expect(more.nextCursor).toBeNull();
          expect([...money.items, ...more.items]).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: charge.id,
                type: "CHARGE",
                amountMinor: "1025",
                appointmentId,
              }),
              expect.objectContaining({
                id: refund.id,
                type: "REFUND",
                amountMinor: "25",
                appointmentId,
              }),
            ]),
          );
          throw rollback;
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }, 30_000);
});
