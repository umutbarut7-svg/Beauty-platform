/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { PublicApiService } from "./public-api.service.js";
const principal = {
  applicationId: "app",
  clientId: "client",
  credentialId: "key",
  businessId: "tenant-a",
  userId: "owner",
  scopes: [
    "business.read",
    "services.read",
    "professionals.read",
    "booking.write",
    "booking.read",
    "discovery.read",
    "result.read",
  ] as any,
};
function setup() {
  const db: any = {
    business: {
      findFirst: vi.fn().mockResolvedValue({
        id: "tenant-a",
        name: "Salon",
        passwordHash: "leak",
      }),
    },
    service: { findMany: vi.fn() },
    staff: { findMany: vi.fn() },
    apiUsageRecord: { create: vi.fn() },
  };
  const credentials: any = {
    assertScope: vi.fn((p: any, s: string) => {
      if (!p.scopes.includes(s)) throw new Error("scope");
    }),
  };
  const appointments: any = {
    create: vi.fn().mockResolvedValue({
      id: "booking",
      status: "PENDING",
      serviceId: "s",
      staffMemberId: "p",
      locationId: "l",
      startsAt: new Date(),
      endsAt: new Date(),
      currency: "USD",
      price: 50,
    }),
    get: vi.fn(),
    cancel: vi.fn(),
    availabilityFor: vi.fn(),
  };
  const discovery: any = {
    search: vi.fn().mockResolvedValue({
      items: [
        {
          businessId: "tenant-a",
          name: "Salon",
          ranking: { score: 99 },
          services: [],
          professionals: [],
          verified: true,
        },
      ],
      nextCursor: null,
      hasMore: false,
    }),
  };
  const idempotency: any = {
    reserve: vi.fn().mockResolvedValue({ id: "reservation" }),
    complete: vi.fn(),
  };
  return {
    db,
    credentials,
    appointments,
    discovery,
    idempotency,
    service: new PublicApiService(
      db,
      credentials,
      appointments,
      discovery,
      idempotency,
    ),
  };
}
describe("PublicApiService", () => {
  it("returns minimized business DTOs without internal fields", async () => {
    const { service } = setup();
    const result = await service.business(principal);
    expect(result.data).not.toHaveProperty("passwordHash");
  });
  it("binds discovery to the credential tenant and hides ranking internals", async () => {
    const { service, discovery } = setup();
    const result = await service.discovery(principal, {});
    expect(discovery.search).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "tenant-a" }),
    );
    expect(result.data[0]).not.toHaveProperty("ranking");
    expect(result.data[0]).toMatchObject({
      sponsored: false,
      sponsorshipLabel: null,
    });
  });
  it("requires idempotency and reuses completed booking responses", async () => {
    const { service, idempotency, appointments } = setup();
    const dto: any = {
      serviceId: "s",
      professionalId: "p",
      locationId: "l",
      customerId: "c",
      startsAt: "2030-01-01T00:00:00Z",
    };
    await expect(service.createBooking(principal, dto, "")).rejects.toThrow(
      "Idempotency",
    );
    idempotency.reserve.mockResolvedValue({
      id: "r",
      response: { data: { id: "existing" } },
    });
    await expect(
      service.createBooking(principal, dto, "valid-key"),
    ).resolves.toEqual({ data: { id: "existing" } });
    expect(appointments.create).not.toHaveBeenCalled();
  });
  it("does not claim unavailable result capability", () => {
    expect(setup().service.result(principal, "r")).toMatchObject({
      data: null,
      status: "NOT_AVAILABLE",
    });
  });
  it("records usage metadata without credentials or payloads", async () => {
    const { db, service } = setup();
    await service.recordUsage(principal, "GET /business", 200, 8);
    const data = db.apiUsageRecord.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      applicationId: "app",
      clientId: "client",
      businessId: "tenant-a",
      operation: "GET /business",
    });
    expect(JSON.stringify(data)).not.toContain("apiKey");
    expect(JSON.stringify(data)).not.toContain("secret");
  });
});
