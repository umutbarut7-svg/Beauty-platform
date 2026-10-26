import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url =
  "postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public";
if (process.env.STAGE32_TEST_DATABASE_URL !== url)
  throw new Error("Stage 33 HTTP tests require the disposable CI database");
if (process.env.STAGE33_TEST_REDIS_URL !== "redis://127.0.0.1:6379")
  throw new Error("Stage 33 HTTP tests require the isolated Redis service");
const db = new PrismaClient({ datasourceUrl: url });
const key = randomUUID();
let app: ChildProcess | undefined;
let admin: ChildProcess | undefined;
let mobile: Server | undefined;
let base = "";
let ownerToken = "";
let customerToken = "";
let strangerToken = "";
let professionalToken = "";
let unassignedToken = "";
let customerId = "";
let completionTrackingToken = "";
let businessId = "";
let otherBusinessId = "";
let staffId = "";
let serviceId = "";
let locationId = "";
let appointmentId = "";
let failure = "";
const environment = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: url,
  STAGE33_MVP_ENABLED: "true",
  MVP_REDIS_ENABLED: "true",
  ACCOUNT_DELETION_PROCESSING_ENABLED: "true",
  ACCOUNT_DELETION_ERASURE_ENABLED: "true",
  MVP_REDIS_URL: process.env.STAGE33_TEST_REDIS_URL,
  JWT_ACCESS_SECRET: "isolated-stage33-test-access-not-production",
  JWT_REFRESH_SECRET: "isolated-stage33-test-refresh-not-production",
  CORS_ORIGINS: "http://localhost:8081,http://localhost:3000",
  RATE_LIMIT_DEFAULT: "10000",
  MVP_VERIFICATION_POLICY_REVIEWED: "true",
  MVP_VERIFICATION_POLICY_VERSION: "synthetic-ci-verification-v1",
  MVP_VERIFICATION_NOTICE:
    "Synthetic test policy; not a real approved product policy",
  MVP_VERIFICATION_RETENTION_DAYS: "30",
  MVP_VERIFICATION_FIELDS_JSON: JSON.stringify([
    { key: "legal_name", label: "İşletme kayıt adı" },
    { key: "registry_reference", label: "Kayıt referansı" },
  ]),
};
async function request(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
  origin = base,
) {
  const r = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
async function create(
  path: string,
  token: string,
  body: unknown,
  method = "POST",
) {
  const r = await request(path, token, method, body);
  expect(
    r.status,
    `${method} ${path}: ${String(r.body?.code ?? r.body?.message ?? "unexpected status")}`,
  ).toBe(method === "POST" && path !== "/auth/login" ? 201 : 200);
  return r.body;
}
async function worker() {
  const process = spawn("node", ["dist/worker.js", "--once"], {
    env: environment,
    stdio: "ignore",
  });
  const [code] = await once(process, "exit");
  expect(code).toBe(0);
}
beforeAll(async () => {
  const listenPort = 3001;
  base = `http://127.0.0.1:${listenPort}`;
  app = spawn("node", ["dist/main.js"], {
    env: { ...environment, PORT: String(listenPort) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  app.stderr?.on("data", (data) => {
    failure = (failure + String(data)).slice(0, 2500);
  });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/health/ready`)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* bounded startup polling */
    }
    if (app.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Real API did not become ready: ${failure}`);
  const owner = await create("/auth/register", "", {
    email: `owner-${key}@example.test`,
    password: "Isolated-strong-password-33",
  });
  ownerToken = owner.accessToken;
  const customer = await create("/auth/register", "", {
    email: `customer-${key}@example.test`,
    password: "Isolated-strong-password-33",
  });
  customerToken = customer.accessToken;
  customerId = customer.user.id;
  strangerToken = (
    await create("/auth/register", "", {
      email: `other-${key}@example.test`,
      password: "Isolated-strong-password-33",
    })
  ).accessToken;
  const professional = await create("/auth/register", "", {
    email: `professional-${key}@example.test`,
    password: "Isolated-strong-password-33",
  });
  professionalToken = professional.accessToken;
  // Keep the real 5/min registration limit intact, including the browser signup.
  await db.user.create({
    data: {
      email: `unassigned-${key}@example.test`,
      passwordHash: await hash("Isolated-strong-password-33", 12),
      customer: { create: {} },
    },
  });
  const unassigned = await create("/auth/login", "", {
    email: `unassigned-${key}@example.test`,
    password: "Isolated-strong-password-33",
  });
  unassignedToken = unassigned.accessToken;
  businessId = (
    await create("/businesses", ownerToken, {
      name: `Stage33-${key}`,
      timezone: "UTC",
    })
  ).id;
  otherBusinessId = (
    await create("/businesses", ownerToken, {
      name: `Other-${key}`,
      timezone: "UTC",
    })
  ).id;
  await create(
    `/businesses/${businessId}`,
    ownerToken,
    { isPublic: true },
    "PATCH",
  );
  const categoryId = (
    await create(`/businesses/${businessId}/service-categories`, ownerToken, {
      name: "Test service category",
    })
  ).id;
  serviceId = (
    await create(`/businesses/${businessId}/services`, ownerToken, {
      categoryId,
      name: "Real booking fixture",
      durationMinutes: 30,
      price: "125.50",
      currency: "TRY",
    })
  ).id;
  locationId = (
    await create(`/businesses/${businessId}/locations`, ownerToken, {
      name: "Test location",
      address: "Test address",
      city: "Test city",
    })
  ).id;
  await create(`/businesses/${businessId}/members`, ownerToken, {
    email: professional.user.email ?? `professional-${key}@example.test`,
    role: "STAFF",
  });
  await create(`/businesses/${businessId}/members`, ownerToken, {
    email: `unassigned-${key}@example.test`,
    role: "STAFF",
  });
  staffId = (
    await create(`/businesses/${businessId}/staff`, ownerToken, {
      userId: professional.user.id,
      firstName: "Test",
      lastName: "Professional",
      displayName: "Test Professional",
      locationIds: [locationId],
    })
  ).id;
  expect(
    await db.staffLocation.count({
      where: { businessId, staffId, locationId },
    }),
  ).toBe(1);
  await create(
    `/businesses/${businessId}/staff/${staffId}/services/${serviceId}`,
    ownerToken,
    {},
  );
  const days = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ];
  await create(
    `/businesses/${businessId}/working-hours`,
    ownerToken,
    {
      hours: days.map((dayOfWeek) => ({
        dayOfWeek,
        isOpen: true,
        openTime: "08:00",
        closeTime: "18:00",
      })),
    },
    "PUT",
  );
  await create(
    `/businesses/${businessId}/staff/${staffId}/working-hours`,
    ownerToken,
    {
      hours: days.map((dayOfWeek) => ({
        dayOfWeek,
        startTime: "08:00",
        endTime: "18:00",
        isActive: true,
      })),
    },
    "PUT",
  );
  await create(
    `/businesses/${businessId}/settings`,
    ownerToken,
    { bookingEnabled: true },
    "PATCH",
  );
}, 45000);
afterAll(async () => {
  if (app && app.exitCode === null) {
    app.kill("SIGTERM");
    await once(app, "exit");
  }
  if (admin && admin.exitCode === null) {
    admin.kill("SIGTERM");
    await once(admin, "exit");
  }
  if (mobile)
    await new Promise<void>((resolve, reject) =>
      mobile!.close((error) => (error ? reject(error) : resolve())),
    );
  await db.$disconnect();
});

describe("Stage 33 real Customer/Business HTTP + PostgreSQL journey", () => {
  it("takes one owner-scoped account deletion request without claiming or performing deletion", async () => {
    const path = "/auth/account-deletion";
    expect((await request(path, "")).status).toBe(401);
    expect((await request(path, customerToken)).body.status).toBe("NONE");
    const before = await db.businessMember.count({ where: { businessId } });
    expect(
      (
        await request(path, customerToken, "POST", {
          password: "wrong",
          confirmation: "HESABIMI SIL",
        })
      ).status,
    ).toBe(403);
    expect((await request(path, customerToken)).body.status).toBe("NONE");
    expect(
      (
        await request(path, customerToken, "POST", {
          password: "Isolated-strong-password-33",
          confirmation: "HESABIMI SIL",
          userId: "someone-else",
        })
      ).status,
    ).toBe(400);
    const results = await Promise.all(
      [1, 2].map(() =>
        request(path, customerToken, "POST", {
          password: "Isolated-strong-password-33",
          confirmation: "HESABIMI SIL",
        }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([202, 202]);
    expect(results[0]!.body.request.id).toBe(results[1]!.body.request.id);
    expect(results[0]!.body).toMatchObject({
      status: "REQUESTED",
      deletionCompleted: false,
    });
    expect(results[0]!.body).not.toHaveProperty("password");
    expect((await request(path, strangerToken)).body).toEqual({
      status: "NONE",
      request: null,
      deletionCompleted: false,
    });
    expect(
      await db.accountDeletionRequest.count({ where: { userId: customerId } }),
    ).toBe(1);
    expect(await db.businessMember.count({ where: { businessId } })).toBe(
      before,
    );
    expect((await request("/auth/me", customerToken)).status).toBe(200);
  });

  it("freezes deletion sessions atomically and never abandons a business during concurrent processing", async () => {
    // Keep the real per-IP login limit intact. This scenario has its own API
    // instance/limiter so its extra logins cannot consume the browser journey's budget.
    const origin = "http://127.0.0.1:3002";
    const isolatedApp = spawn("node", ["dist/main.js"], {
      env: { ...environment, PORT: "3002" },
      stdio: "ignore",
    });
    const processingRequest = (
      path: string,
      token: string,
      method = "GET",
      body?: unknown,
    ) => request(path, token, method, body, origin);
    const processingCreate = async (
      path: string,
      token: string,
      body: unknown,
    ) => {
      const result = await processingRequest(path, token, "POST", body);
      expect(result.status).toBe(200); // This helper is used only for login.
      return result.body;
    };
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          if ((await fetch(`${origin}/health/ready`)).ok) {
            ready = true;
            break;
          }
        } catch {
          /* bounded isolated API startup */
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(ready).toBe(true);
      const password = "Isolated-strong-password-33";
      const makeUser = async (
        label: string,
        role: "CUSTOMER" | "SUPER_ADMIN" = "CUSTOMER",
      ) => {
        const user = await db.user.create({
          data: {
            email: `deletion-${label}-${key}@example.test`,
            passwordHash: await hash(password, 4),
            role,
          },
        });
        const login = await processingCreate("/auth/login", "", {
          email: user.email,
          password,
        });
        return { user, ...login };
      };
      const admin = await makeUser("admin", "SUPER_ADMIN");
      const a = await makeUser("a");
      const b = await makeUser("b");
      const secondA = await processingCreate("/auth/login", "", {
        email: a.user.email,
        password,
      });
      const tenant = await db.business.create({
        data: {
          name: "Deletion ownership fixture",
          slug: `deletion-${key}`,
          memberships: {
            create: [
              { userId: a.user.id, role: "BUSINESS_OWNER" },
              { userId: b.user.id, role: "BUSINESS_OWNER" },
            ],
          },
        },
      });
      const ar = await db.accountDeletionRequest.create({
        data: { userId: a.user.id },
      });
      const br = await db.accountDeletionRequest.create({
        data: { userId: b.user.id },
      });
      const begin = (
        id: string,
        token = admin.accessToken,
        body: unknown = { confirmation: "ISLEME AL" },
      ) =>
        processingRequest(
          `/auth/account-deletion/${id}/begin`,
          token,
          "POST",
          body,
        );
      expect((await begin(ar.id, "")).status).toBe(401);
      expect((await begin(ar.id, a.accessToken)).status).toBe(403);
      expect(
        (await begin(ar.id, admin.accessToken, { confirmation: "wrong" }))
          .status,
      ).toBe(400);
      expect(
        (
          await begin(ar.id, admin.accessToken, {
            confirmation: "ISLEME AL",
            userId: b.user.id,
          })
        ).status,
      ).toBe(400);
      const existingOwner = await db.businessMember.findFirstOrThrow({
        where: { businessId, role: "BUSINESS_OWNER" },
      });
      const sole = await db.accountDeletionRequest.create({
        data: { userId: existingOwner.userId },
      });
      expect((await begin(sole.id)).status).toBe(409);
      expect((await processingRequest("/auth/me", ownerToken)).status).toBe(
        200,
      );
      expect(
        (
          await db.accountDeletionRequest.findUniqueOrThrow({
            where: { id: sole.id },
          })
        ).processingAt,
      ).toBeNull();

      const results = await Promise.all([begin(ar.id), begin(br.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([202, 409]);
      const index = results.findIndex((r) => r.status === 202);
      const winner = index === 0 ? a : b;
      const loser = index === 0 ? b : a;
      const receipt = results[index]!.body;
      expect(receipt).toMatchObject({
        status: "PROCESSING",
        deletionCompleted: false,
      });
      expect((await begin(receipt.request.id)).body).toEqual(receipt);
      expect(
        (await processingRequest("/auth/me", winner.accessToken)).status,
      ).toBe(401);
      expect(
        (await processingRequest("/auth/me", loser.accessToken)).status,
      ).toBe(200);
      expect(
        (
          await processingRequest("/auth/login", "", "POST", {
            email: winner.user.email,
            password,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await processingRequest("/auth/refresh", "", "POST", {
            refreshToken: winner.refreshToken,
          })
        ).status,
      ).toBe(401);
      if (index === 0) {
        expect(
          (await processingRequest("/auth/me", secondA.accessToken)).status,
        ).toBe(401);
        expect(
          (
            await processingRequest("/auth/refresh", "", "POST", {
              refreshToken: secondA.refreshToken,
            })
          ).status,
        ).toBe(401);
      }
      expect(
        await db.refreshSession.count({
          where: { userId: winner.user.id, revokedAt: null },
        }),
      ).toBe(0);
      expect(
        await db.businessMember.count({ where: { businessId: tenant.id } }),
      ).toBe(2);
      expect(
        await db.business.findUnique({ where: { id: tenant.id } }),
      ).not.toBeNull();
      expect(
        await db.user.findUnique({ where: { id: winner.user.id } }),
      ).not.toBeNull();
      expect(
        await db.securityEvent.count({
          where: {
            type: "ACCOUNT_DELETION_PROCESSING_STARTED",
            actorId: admin.user.id,
          },
        }),
      ).toBe(1);
      const finalize = (id: string, token = admin.accessToken) =>
        processingRequest(
          `/auth/account-deletion/${id}/finalize`,
          token,
          "POST",
          { confirmation: "KALICI SIL" },
        );
      // The business-owning subject cannot be silently erased or retained by an unchecked override.
      const domain = await processingRequest(
        `/auth/account-deletion/${receipt.request.id}/inspection`,
        admin.accessToken,
      );
      expect(domain.status).toBe(200);
      expect(domain.body.blockers).toContain("BusinessMember");
      const fresh = await makeUser("fresh");
      await db.customer.create({ data: { userId: fresh.user.id } });
      const intake = await processingRequest(
        "/auth/account-deletion",
        fresh.accessToken,
        "POST",
        { password, confirmation: "HESABIMI SIL" },
      );
      expect(intake.status).toBe(202);
      const freshId = intake.body.request.id;
      expect(
        (
          await processingRequest(
            "/auth/account-deletion/tracking",
            fresh.accessToken,
            "POST",
            { password: "wrong" },
          )
        ).status,
      ).toBe(403);
      const tracking = await processingRequest(
        "/auth/account-deletion/tracking",
        fresh.accessToken,
        "POST",
        { password },
      );
      expect(tracking.status).toBe(201);
      const trackingToken = tracking.body.token;
      completionTrackingToken = trackingToken;
      const publicReceipt = () =>
        processingRequest("/auth/account-deletion/receipt", "", "POST", {
          token: trackingToken,
        });
      expect((await publicReceipt()).body).toMatchObject({
        status: "REQUESTED",
        deletionCompleted: false,
      });
      expect((await processingRequest("/auth/me", trackingToken)).status).toBe(
        401,
      );
      expect(
        (
          await processingRequest(
            "/auth/account-deletion/receipt",
            "",
            "POST",
            { token: `${freshId}.${"A".repeat(43)}` },
          )
        ).status,
      ).toBe(404);
      expect((await finalize(freshId, fresh.accessToken)).status).toBe(403);
      expect((await begin(freshId)).status).toBe(202);
      expect((await publicReceipt()).body).toMatchObject({
        status: "PROCESSING",
        deletionCompleted: false,
      });
      // A loose JSON reference with no FK must block, not disappear under cascade.
      const loose = await db.securityEvent.create({
        data: {
          type: "SYNTHETIC_UNREVIEWED_REFERENCE",
          severity: "INFO",
          metadata: { subject: fresh.user.id },
        },
      });
      const inspection = await processingRequest(
        `/auth/account-deletion/${freshId}/inspection`,
        admin.accessToken,
      );
      expect(inspection.status).toBe(200);
      expect(inspection.body.blockers).toContain("SecurityEvent");
      expect((await finalize(freshId)).status).toBe(409);
      expect(
        await db.user.findUnique({ where: { id: fresh.user.id } }),
      ).not.toBeNull();
      // Fixture-only removal models an independently resolved review; the erasure API cannot bypass it.
      await db.securityEvent.delete({ where: { id: loose.id } });
      const finished = await Promise.all([
        finalize(freshId),
        finalize(freshId),
      ]);
      expect(finished.map((result) => result.status)).toEqual([200, 200]);
      expect(finished[0]!.body).toEqual({
        status: "COMPLETED",
        deletionCompleted: true,
      });
      expect(
        await db.user.findUnique({ where: { id: fresh.user.id } }),
      ).toBeNull();
      expect(
        await db.customer.count({ where: { userId: fresh.user.id } }),
      ).toBe(0);
      expect(
        await db.refreshSession.count({ where: { userId: fresh.user.id } }),
      ).toBe(0);
      expect(
        (
          await db.accountDeletionRequest.findUniqueOrThrow({
            where: { id: freshId },
          })
        ).userId,
      ).toBeNull();
      expect((await publicReceipt()).body).toMatchObject({
        status: "COMPLETED",
        deletionCompleted: true,
        completedAt: expect.any(String),
      });
      expect(Object.keys((await publicReceipt()).body).sort()).toEqual([
        "completedAt",
        "deletionCompleted",
        "requestedAt",
        "status",
      ]);
      expect(
        (await processingRequest("/auth/me", fresh.accessToken)).status,
      ).toBe(401);
      expect(
        (
          await processingRequest("/auth/refresh", "", "POST", {
            refreshToken: fresh.refreshToken,
          })
        ).status,
      ).toBe(401);
      expect(
        await db.securityEvent.count({
          where: {
            type: "ACCOUNT_DELETION_COMPLETED",
            metadata: { path: ["requestId"], equals: freshId },
          },
        }),
      ).toBe(1);
      // Existing signed admin tokens must lose their role as soon as the DB role changes.
      await db.user.update({
        where: { id: admin.user.id },
        data: { role: "CUSTOMER" },
      });
      expect((await begin(receipt.request.id)).status).toBe(403);
    } finally {
      if (isolatedApp.exitCode === null) {
        isolatedApp.kill("SIGTERM");
        await once(isolatedApp, "exit");
      }
    }
  });

  it("keeps owner self-booking explicit and rejects customer impersonation", async () => {
    const date = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
    const path = `/businesses/${businessId}/appointments`;
    const slots = await request(
      `/businesses/${businessId}/availability?${new URLSearchParams({
        locationId,
        serviceId,
        staffMemberId: staffId,
        date,
      })}`,
      ownerToken,
    );
    expect(slots.status).toBe(200);
    expect(slots.body.length).toBeGreaterThan(0);
    const body = {
      locationId,
      serviceId,
      staffMemberId: staffId,
      startsAt: slots.body[0].startsAt,
    };
    expect((await request(path, ownerToken, "POST", body)).status).toBe(400);
    const otherCustomer = await db.customer.findUniqueOrThrow({
      where: { userId: customerId },
    });
    expect(
      (
        await request(path, ownerToken, "POST", {
          ...body,
          bookForSelf: true,
          customerId: otherCustomer.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(path, ownerToken, "POST", {
          ...body,
          bookForSelf: "true",
        })
      ).status,
    ).toBe(400);
    const created = await create(path, ownerToken, {
      ...body,
      bookForSelf: true,
      internalNote: "Must not persist in customer context",
    });
    const saved = await db.appointment.findUniqueOrThrow({
      where: { id: created.id },
      include: { customer: true },
    });
    expect(saved.customer.userId).not.toBe(customerId);
    expect(saved.customer.userId).toBe(
      (await request("/auth/me", ownerToken)).body.id,
    );
    expect(saved.internalNote).toBeNull();
    await create(`${path}/${created.id}/cancel`, ownerToken, {
      reason: "Synthetic self-booking acceptance complete",
    });
  });
  it("requires an independent platform reviewer and atomically audits verification approval/revocation", async () => {
    const path = `/mvp/v1/businesses/${businessId}/verification`;
    const input = {
      policyVersion: "synthetic-ci-verification-v1",
      answers: {
        legal_name: "Synthetic fixture only",
        registry_reference: "SYNTHETIC-NOT-A-REAL-DOCUMENT",
      },
    };
    expect((await request(path, strangerToken, "POST", input)).status).toBe(
      403,
    );
    expect((await request(path, professionalToken)).status).toBe(403);
    expect(
      (
        await request(path, ownerToken, "POST", {
          ...input,
          answers: { guessed: "not allowed" },
        })
      ).status,
    ).toBe(400);
    const submission = await create(path, ownerToken, input);
    expect((await request(path, ownerToken, "POST", input)).status).toBe(409);
    expect(
      (
        await request(`${path}/${submission.id}/review`, ownerToken, "POST", {
          decision: "APPROVED",
          note: "Unauthorized owner",
        })
      ).status,
    ).toBe(403);
    const reviewerEmail = `reviewer-${key}@example.test`;
    const reviewer = await db.user.create({
      data: {
        email: reviewerEmail,
        passwordHash: await hash("Isolated-strong-password-33", 12),
        role: "SUPER_ADMIN",
      },
    });
    const reviewerToken = (
      await create("/auth/login", "", {
        email: reviewerEmail,
        password: "Isolated-strong-password-33",
      })
    ).accessToken;
    expect(
      (await request("/auth/account-deletion/pending", customerToken)).status,
    ).toBe(403);
    expect(
      (await request("/auth/account-deletion/pending", ownerToken)).status,
    ).toBe(403);
    const pending = await request(
      "/auth/account-deletion/pending",
      reviewerToken,
    );
    expect(pending.status).toBe(200);
    expect(
      pending.body.items.some(
        (item: { user: { id: string } }) => item.user.id === customerId,
      ),
    ).toBe(true);

    const decision = {
      decision: "APPROVED",
      note: "Synthetic evidence reviewed under the CI fixture policy",
    };
    await db.businessMember.create({
      data: { userId: reviewer.id, businessId, role: "BUSINESS_ADMIN" },
    });
    expect(
      (
        await request(
          `${path}/${submission.id}/review`,
          reviewerToken,
          "POST",
          decision,
        )
      ).status,
    ).toBe(403);
    await db.businessMember.delete({
      where: { userId_businessId: { userId: reviewer.id, businessId } },
    });
    await create(`${path}/${submission.id}/review`, reviewerToken, decision);
    await create(`${path}/${submission.id}/review`, reviewerToken, decision);
    expect(
      (await db.business.findUniqueOrThrow({ where: { id: businessId } }))
        .isVerified,
    ).toBe(true);
    expect(
      await db.auditLog.count({
        where: { businessId, action: "mvp.verification.approved" },
      }),
    ).toBe(1);
    expect(
      (
        await request(
          `${path}/${submission.id}/review`,
          reviewerToken,
          "POST",
          { decision: "REJECTED", note: "Invalid state" },
        )
      ).status,
    ).toBe(409);
    await create(`${path}/${submission.id}/review`, reviewerToken, {
      decision: "REVOKED",
      note: "End the synthetic verification fixture",
    });
    expect(
      (await db.business.findUniqueOrThrow({ where: { id: businessId } }))
        .isVerified,
    ).toBe(false);
    await db.mvpVerificationRequest.update({
      where: { id: submission.id },
      data: { evidenceExpiresAt: new Date(0) },
    });
    const expiredEvidence = (await request(path, ownerToken)).body.find(
      (row: { id: string }) => row.id === submission.id,
    );
    expect(expiredEvidence.answers).toEqual({});
    expect(expiredEvidence.reviewNote).toBeNull();
    expect(JSON.stringify(expiredEvidence)).not.toContain(
      "SYNTHETIC-NOT-A-REAL-DOCUMENT",
    );
    const hiddenPhotos = await request("/mvp/v1/photos/policy", customerToken);
    expect(hiddenPhotos.body.available).toBe(false);
    expect(
      (
        await request("/mvp/v1/photos/consents", customerToken, "POST", {
          policyVersion: "invented",
          accepted: true,
        })
      ).status,
    ).toBe(503);
  });
  it("registers, books authoritative availability, completes a job, records result and customer satisfaction, publishes passport via real worker", async () => {
    const catalog = await request(
      `/mvp/v1/catalog/${businessId}`,
      customerToken,
    );
    expect(catalog.status).toBe(200);
    expect(
      catalog.body.staff.find((staff: { id: string }) => staff.id === staffId)
        .locations,
    ).toContainEqual({ locationId });
    expect(
      (await request(`/mvp/v1/catalog/${businessId}`, customerToken)).body
        .services[0].id,
    ).toBe(serviceId);
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const slots = await request(
      `/businesses/${businessId}/availability?${new URLSearchParams({ serviceId, locationId, staffMemberId: staffId, date })}`,
      customerToken,
    );
    expect(slots.status).toBe(200);
    expect(slots.body.length).toBeGreaterThan(0);
    const booking = await create(
      `/businesses/${businessId}/appointments`,
      customerToken,
      {
        locationId,
        serviceId,
        staffMemberId: staffId,
        startsAt: slots.body[0].startsAt,
      },
    );
    appointmentId = booking.id;
    expect(String(booking.price)).toBe("125.5");
    const path = `/mvp/v1/businesses/${businessId}/appointments/${appointmentId}`;
    expect(
      (
        await request(`${path}/result`, ownerToken, "POST", {
          summary: "Before completion",
          idempotencyKey: `${key}-early`,
        })
      ).status,
    ).toBe(409);
    for (const status of ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"])
      await create(
        `/businesses/${businessId}/appointments/${appointmentId}/status`,
        ownerToken,
        { status },
        "PATCH",
      );
    const input = {
      summary: "Recorded professional outcome",
      idempotencyKey: `${key}-result`,
    };
    const [a, b] = await Promise.all([
      request(`${path}/result`, professionalToken, "POST", input),
      request(`${path}/result`, professionalToken, "POST", input),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    expect(
      (
        await request(`${path}/result`, ownerToken, "POST", {
          ...input,
          summary: "Changed",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`${path}/satisfaction`, ownerToken, "POST", {
          outcome: "SATISFIED",
          idempotencyKey: `${key}-owner`,
        })
      ).status,
    ).toBe(403);
    const satisfaction = {
      outcome: "SATISFIED",
      idempotencyKey: `${key}-satisfaction`,
    };
    await create(`${path}/satisfaction`, customerToken, satisfaction);
    await create(`${path}/satisfaction`, customerToken, satisfaction);
    expect(
      (await request("/mvp/v1/passport", customerToken)).body.items,
    ).toHaveLength(0);
    await worker();
    const passport = await request("/mvp/v1/passport", customerToken);
    expect(passport.body.items).toHaveLength(1);
    expect(passport.body.items[0].satisfaction.outcome).toBe("SATISFIED");
    expect(JSON.stringify(passport.body)).not.toMatch(
      /internalNote|passwordHash|refreshToken|owner-/,
    );
    await db.backgroundJob.updateMany({
      where: { businessId, type: "MVP_PASSPORT_PUBLISH_V1" },
      data: { status: "PENDING", attempts: 0, availableAt: new Date() },
    });
    await worker();
    expect(
      await db.auditLog.count({
        where: { businessId, action: "mvp.passport.published" },
      }),
    ).toBe(1);
    const revenue = await request(
      `/businesses/${businessId}/financial/summary`,
      ownerToken,
    );
    expect(revenue.status).toBe(200);
    expect(revenue.body.status).toBe("INSUFFICIENT_DATA");
    expect(await db.financialLedgerEntry.count({ where: { businessId } })).toBe(
      0,
    );
    expect(
      await db.beautyJobSatisfaction.count({ where: { businessId } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: {
          businessId,
          action: "mvp.satisfaction.recorded",
          resourceType: "BeautyJobSatisfaction",
        },
      }),
    ).toBe(1);
  }, 45000);
  it("denies missing JWT, cross-tenant, non-owner, invalid DTO and fabricated provider/verification success", async () => {
    const path = `/mvp/v1/businesses/${businessId}/appointments/${appointmentId}`;
    expect((await request("/mvp/v1/passport", "")).status).toBe(401);
    expect((await request(`${path}/result`, strangerToken)).status).toBe(404);
    expect(
      (
        await request(
          `/mvp/v1/businesses/${otherBusinessId}/appointments/${appointmentId}/result`,
          ownerToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`${path}/satisfaction`, strangerToken, "POST", {
          outcome: "SATISFIED",
          idempotencyKey: `${key}-stranger`,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`${path}/result`, ownerToken, "POST", {
          summary: "x",
          idempotencyKey: "bad",
          businessId: otherBusinessId,
        })
      ).status,
    ).toBe(400);
    expect(
      (await request("/mvp/v1/passport", strangerToken)).body.items,
    ).toHaveLength(0);
    expect((await request(`${path}/result`, unassignedToken)).status).toBe(404);
    expect(
      (
        await request(`${path}/result`, unassignedToken, "POST", {
          summary: "Unauthorized professional",
          idempotencyKey: `${key}-unassigned`,
        })
      ).status,
    ).toBe(404);
    const recorded = await db.beautyJobResult.findUniqueOrThrow({
      where: { businessId_appointmentId: { businessId, appointmentId } },
    });
    const forged = await db.backgroundJob.create({
      data: {
        businessId: otherBusinessId,
        type: "MVP_PASSPORT_PUBLISH_V1",
        actorId: customerId,
        correlationId: key,
        idempotencyKey: `${key}-forged`,
        payload: { resultId: recorded.id },
      },
    });
    await worker();
    const rejected = await db.backgroundJob.findUniqueOrThrow({
      where: { id: forged.id },
    });
    expect(rejected.status).toBe("RETRYING");
    expect(rejected.attempts).toBe(1);
    expect(
      await db.auditLog.count({
        where: {
          businessId: otherBusinessId,
          action: "mvp.passport.published",
        },
      }),
    ).toBe(0);
    await db.backgroundJob.update({
      where: { id: forged.id },
      data: { status: "DEAD_LETTER" },
    });
    const capability = (await request("/mvp/v1/capabilities", customerToken))
      .body;
    expect(capability.redis.ready).toBe(true);
    expect(capability.privatePhotos.available).toBe(false);
    expect(capability.visualAnalysis.available).toBe(false);
    expect(capability.verification.automatic).toBe(false);
    const own = await db.customer.findUniqueOrThrow({
      where: { userId: customerId },
    });
    expect(own).toBeTruthy();
  });
  it("serves real scoped demand with observation windows, safe projection and strict query validation", async () => {
    const path = `/businesses/${businessId}/marketplace`;
    const input = {
      businessId,
      signalType: "SEARCH",
      source: "OBSERVED" as const,
      sourceEntityType: "DISCOVERY_SEARCH",
      sourceEntityId: "private-fixture-source",
      timeWindow: "ROLLING_30_DAYS" as const,
      value: "3",
      confidence: "0.8",
      freshness: "1",
      observedAt: new Date(),
      dataState: "AVAILABLE",
      evidence: { privateEvidence: "not-returned" },
      calculationVersion: "stage33-demand-fixture-v1",
    };
    await db.marketplaceDemandSignal.createMany({
      data: [
        { ...input, idempotencyKey: `${key}-demand-current` },
        {
          ...input,
          idempotencyKey: `${key}-demand-predicted`,
          signalType: "PREDICTED_DEMAND",
          source: "PREDICTED",
          value: "2",
        },
        {
          ...input,
          idempotencyKey: `${key}-demand-expired`,
          observedAt: new Date(Date.now() - 31 * 86400000),
        },
        {
          ...input,
          idempotencyKey: `${key}-demand-future`,
          observedAt: new Date(Date.now() + 86400000),
        },
        {
          ...input,
          idempotencyKey: `${key}-demand-other-window`,
          timeWindow: "ROLLING_7_DAYS",
          value: "7",
        },
      ],
    });
    await db.marketplaceLiquiditySnapshot.create({
      data: {
        businessId,
        window: "ROLLING_30_DAYS",
        periodStart: new Date(Date.now() - 90 * 86400000),
        periodEnd: new Date(Date.now() - 60 * 86400000),
        health: "DATA_INSUFFICIENT",
        dataState: "AVAILABLE",
        components: {},
        evidence: {},
        confidence: "0.8",
        observedAt: new Date(Date.now() - 60 * 86400000),
        calculationVersion: "stage33-demand-fixture-v1",
        version: 1,
      },
    });
    const response = await request(
      `${path}/demand?window=ROLLING_30_DAYS&limit=20`,
      ownerToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(
      response.body.map((s: { source: string }) => s.source).sort(),
    ).toEqual(["OBSERVED", "PREDICTED"]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /private-fixture-source|privateEvidence|not-returned|sourceEntityId/,
    );
    expect(
      (await request(`${path}/liquidity?window=ROLLING_30_DAYS`, ownerToken))
        .body.status,
    ).toBe("STALE_DATA");
    expect(
      (
        await request(
          `/businesses/${otherBusinessId}/marketplace/demand?window=ROLLING_30_DAYS`,
          ownerToken,
        )
      ).body,
    ).toEqual([]);
    expect(
      (await request(`${path}/demand?window=ROLLING_30_DAYS`, strangerToken))
        .status,
    ).toBe(403);
    expect(
      (
        await request(
          `${path}/demand?window=ROLLING_30_DAYS`,
          professionalToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (await request(`${path}/demand?window=ROLLING_30_DAYS`, "")).status,
    ).toBe(401);
    expect(
      (
        await request(
          `${path}/demand?window=ROLLING_30_DAYS&limit=101`,
          ownerToken,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request(`${path}/demand?window=FOREVER`, ownerToken)).status,
    ).toBe(400);
  });
  it("runs the real Expo web customer/business journey and the Next.js operator view in Chromium", async () => {
    const root = resolve("../mobile/dist");
    mobile = createServer((req, res) => {
      void (async () => {
        try {
          const pathname = decodeURIComponent(
            new URL(req.url ?? "/", "http://localhost").pathname,
          );
          const file = resolve(
            root,
            `.${pathname === "/" ? "/index.html" : pathname}`,
          );
          if (!file.startsWith(`${root}/`)) {
            res.writeHead(403).end();
            return;
          }
          const data = await readFile(file);
          const types: Record<string, string> = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".png": "image/png",
            ".ttf": "font/ttf",
          };
          res
            .writeHead(200, {
              "content-type":
                types[extname(file)] ?? "application/octet-stream",
            })
            .end(data);
        } catch {
          res.writeHead(404).end();
        }
      })();
    });
    mobile.listen(8081, "127.0.0.1");
    await once(mobile, "listening");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    // Never let a wrongly configured export send synthetic credentials to a remote API.
    await page.route("**/*", (route) =>
      ["localhost", "127.0.0.1"].includes(
        new URL(route.request().url()).hostname,
      )
        ? route.continue()
        : route.abort(),
    );
    try {
      const tab = (name: string) =>
        page.getByRole("tab", { name, exact: true }).click();
      const logout = async () => {
        await tab("Hesabım");
        await page
          .getByRole("button", { name: "Çıkış yap", exact: true })
          .click();
      };
      const login = async (email: string, mobileApp = true) => {
        if (mobileApp)
          await page
            .getByRole("button", { name: "Giriş yap ekranı", exact: true })
            .click();
        await page
          .getByRole("textbox", { name: "E-posta", exact: true })
          .fill(email);
        await page
          .getByLabel("Parola", { exact: true })
          .fill("Isolated-strong-password-33");
        await page
          .getByRole("button", { name: "Giriş yap", exact: true })
          .click();
        await (
          mobileApp
            ? page.getByRole("tab", { name: "Keşfet", exact: true })
            : page.getByRole("button", { name: "Çıkış yap", exact: true })
        ).waitFor();
      };
      await page.goto("http://localhost:8081");
      const browserCustomerEmail = `browser-customer-${key}@example.test`;
      await page
        .getByRole("button", { name: "Hesap oluştur ekranı", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "E-posta", exact: true })
        .fill(browserCustomerEmail);
      await page
        .getByLabel("Parola", { exact: true })
        .fill("Isolated-strong-password-33");
      await page
        .getByRole("button", { name: "Hesap oluştur", exact: true })
        .click();
      await page.getByRole("tab", { name: "Keşfet", exact: true }).waitFor();
      const browserCustomer = await create("/auth/login", "", {
        email: browserCustomerEmail,
        password: "Isolated-strong-password-33",
      });
      await page
        .getByRole("textbox", { name: "Hizmet veya işletme ara", exact: true })
        .fill(`Stage33-${key}`);
      await page.getByRole("button", { name: "Ara", exact: true }).click();
      await page
        .getByRole("button", {
          name: `Stage33-${key} hizmetlerini gör`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: "Real booking fixture hizmetini seç",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: /^Test location(?: ✓)?$/ })
        .click();
      await page
        .getByRole("button", { name: "Test Professional", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Başka tarih (YYYY-MM-DD)", exact: true })
        .fill(new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10));
      await page
        .getByRole("button", { name: "Müsait saatleri bul", exact: true })
        .click();
      await page
        .getByRole("button", { name: /^Saat seç:/ })
        .first()
        .click();
      // Choosing a slot alone must not create a reservation.
      expect(
        (await request("/mvp/v1/bookings", browserCustomer.accessToken)).body
          .items,
      ).toHaveLength(0);
      const bookingCreated = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith(`/businesses/${businessId}/appointments`),
      );
      await page
        .getByRole("button", { name: "Randevuyu onayla", exact: true })
        .click();
      expect((await bookingCreated).status()).toBe(201);
      await page
        .getByRole("button", { name: /Real booking fixture.*Onay bekliyor/ })
        .waitFor();
      await logout();
      await login(`owner-${key}@example.test`);
      await tab("Hesabım");
      await page
        .getByRole("button", { name: "İşletme alanına geç", exact: true })
        .click();
      await page
        .getByRole("button", { name: `Stage33-${key}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: "İşletme ayarları", exact: true })
        .click();
      // Exercise the real setup forms, rather than treating backend fixtures as UI acceptance.
      const field = (name: string) =>
        page.getByRole("textbox", { name, exact: true });
      const click = (name: string) =>
        page.getByRole("button", { name, exact: true }).click();
      await click("Yönetim kayıtlarını yükle");
      await field("Konum adı").fill("Browser location");
      await field("Adres").fill("Synthetic test address");
      await field("Şehir").fill("Test city");
      await click("Konum ekle");
      await page
        .getByRole("button", { name: "Browser location ✓", exact: true })
        .waitFor();
      await field("Ad").fill("Browser");
      await field("Soyad").fill("Professional");
      await field("Görünen ad").fill("Browser Professional");
      await click("Profesyonel ekle");
      await page
        .getByRole("button", { name: "Browser Professional ✓", exact: true })
        .waitFor();
      await click("İşletme üyelerini yükle");
      await click(`unassigned-${key}@example.test`);
      await click("Seçilen profesyoneli hesaba bağla");
      await page
        .getByText("Profesyonel profili seçilen üyeye bağlandı.", {
          exact: true,
        })
        .waitFor();
      await field("Kategori adı").fill("Browser category");
      await click("Kategori ekle");
      await page
        .getByRole("button", { name: "Browser category ✓", exact: true })
        .waitFor();
      await field("Hizmet adı").fill("Browser service");
      await field("Fiyat (ondalık metin)").fill("225.50");
      await field("Para birimi").fill("TRY");
      await field("Süre (dakika)").fill("45");
      await click("Hizmet ekle");
      await page.getByRole("button", { name: /Browser service.*✓/ }).waitFor();
      await field("Fiyat (ondalık metin)").fill("250.75");
      await click("Hizmet fiyatını kaydet");
      await page
        .getByRole("button", {
          name: "Browser service · 250.75 TRY ✓",
          exact: true,
        })
        .waitFor();
      await click("Hizmeti seçilen profesyonele ata");
      await page
        .getByText("Hizmet ataması kaydedildi.", { exact: true })
        .waitFor();
      await click("MONDAY");
      await field("Başlangıç (HH:mm)").fill("09:00");
      await field("Bitiş (HH:mm)").fill("17:00");
      await click("İşletme saatlerini yükle");
      await page
        .getByText("Saatler yüklendi; kaydetmeden önce kontrol edin.", {
          exact: true,
        })
        .waitFor();
      await click("Seçilen işletme gününü kaydet");
      await page
        .getByText("İşletme saatleri kaydedildi.", { exact: true })
        .waitFor();
      await click("Seçilen profesyonel gününü kaydet");
      await page
        .getByText("Profesyonel saatleri kaydedildi.", { exact: true })
        .waitFor();
      const browserStaff = await db.staff.findFirstOrThrow({
        where: { businessId, displayName: "Browser Professional" },
      });
      const browserService = await db.service.findFirstOrThrow({
        where: { businessId, name: "Browser service" },
      });
      expect(String(browserService.price)).toBe("250.75");
      expect(browserService.durationMinutes).toBe(45);
      expect(
        await db.staffProfileService.count({
          where: {
            businessId,
            staffId: browserStaff.id,
            serviceId: browserService.id,
          },
        }),
      ).toBe(1);
      expect(browserStaff.userId).toBe(
        (
          await db.user.findUniqueOrThrow({
            where: { email: `unassigned-${key}@example.test` },
          })
        ).id,
      );
      const browserLocation = await db.location.findFirstOrThrow({
        where: { businessId, name: "Browser location" },
      });
      expect(
        await db.staffLocation.count({
          where: {
            businessId,
            staffId: browserStaff.id,
            locationId: browserLocation.id,
          },
        }),
      ).toBe(1);
      expect(
        await db.workingHour.count({ where: { businessId, branchId: null } }),
      ).toBe(7);
      expect(
        await db.workingHour.findFirstOrThrow({
          where: { businessId, branchId: null, dayOfWeek: "MONDAY" },
        }),
      ).toMatchObject({ openTime: "09:00", closeTime: "17:00" });
      expect(
        await db.staffWorkingHour.findFirstOrThrow({
          where: { businessId, staffId: browserStaff.id, dayOfWeek: "MONDAY" },
        }),
      ).toMatchObject({ startTime: "09:00", endTime: "17:00" });
      await tab("Özet");
      await page
        .getByRole("button", { name: "Talep verilerini yükle", exact: true })
        .click();
      await page
        .getByText("Talep özeti: Veri güncel değil", { exact: true })
        .waitFor();
      await page.getByText("Arama: 3", { exact: true }).waitFor();
      await page
        .getByText("Tahmin; gerçekleşmiş talep değildir", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Talep dönemi: Son 7 gün", exact: true })
        .click();
      expect(await page.getByText("Arama: 3", { exact: true }).count()).toBe(0);
      await page
        .getByRole("button", { name: "Talep verilerini yükle", exact: true })
        .click();
      await page.getByText("Arama: 7", { exact: true }).waitFor();
      const membership = await db.businessMember.findFirstOrThrow({
        where: { businessId, role: "BUSINESS_OWNER" },
      });
      try {
        await db.businessMember.update({
          where: { id: membership.id },
          data: { role: "STAFF" },
        });
        await page
          .getByRole("button", { name: "Talep verilerini yükle", exact: true })
          .click();
        await page
          .getByText(
            "Talep verileri yüklenemedi. Yetkinizi ve bağlantınızı kontrol edip yeniden deneyin.",
            { exact: true },
          )
          .waitFor();
        expect(await page.getByText("Arama: 7", { exact: true }).count()).toBe(
          0,
        );
      } finally {
        await db.businessMember.update({
          where: { id: membership.id },
          data: { role: membership.role },
        });
      }
      await page
        .getByRole("button", { name: "Talep dönemi: Son 90 gün", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Talep verilerini yükle", exact: true })
        .click();
      await page
        .getByText(
          "Bu dönem için kayıtlı talep sinyali yok. Bu, talebin sıfır olduğu anlamına gelmez.",
          { exact: true },
        )
        .waitFor();
      await tab("İşletmem");
      await page
        .getByRole("button", { name: `Other-${key}`, exact: true })
        .click();
      await tab("Özet");
      await page
        .getByText("Seçilen dönem için talep verilerini yükleyin.", {
          exact: true,
        })
        .waitFor();
      expect(await page.getByText("Arama: 3", { exact: true }).count()).toBe(0);
      await page
        .getByRole("button", { name: "Talep verilerini yükle", exact: true })
        .click();
      await page.getByText("Talep özeti: Veri yok", { exact: true }).waitFor();
      await tab("İşletmem");
      await page
        .getByRole("button", { name: `Stage33-${key}`, exact: true })
        .click();
      await tab("Randevular");
      await page
        .getByRole("button", { name: "Randevuları yenile", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Real booking fixture.*Onay bekliyor/ })
        .click();
      for (const label of [
        "Müşteri geldi",
        "İşlemi başlat",
        "İşlemi tamamla",
      ]) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await page
          .getByRole("button", { name: label, exact: true })
          .waitFor({ state: "hidden" });
        await page.waitForFunction(
          () => !document.querySelector('[aria-label="Yükleniyor"]'),
        );
      }
      await page
        .getByRole("textbox", { name: "Yapılan işlemin sonucu", exact: true })
        .fill("Browser recorded outcome");
      await page
        .getByRole("button", { name: "Sonucu kaydet", exact: true })
        .click();
      await page
        .getByText("Browser recorded outcome", { exact: true })
        .waitFor();
      await tab("Özet");
      await page
        .getByText("Henüz kayıtlı tahsilat yok.", {
          exact: true,
        })
        .waitFor();
      await logout();
      await login(browserCustomerEmail);
      await tab("Randevular");
      await page
        .getByRole("button", { name: "Randevuları yenile", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Real booking fixture.*Tamamlandı/ })
        .first()
        .click();
      await page
        .getByText("Browser recorded outcome", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Memnunum", exact: true }).click();
      await page.getByText("Memnuniyet: Memnun", { exact: true }).waitFor();
      await worker();
      await tab("Bakımım");
      await page
        .getByText(/Browser recorded outcome/)
        .first()
        .waitFor();
      expect(
        (await request("/mvp/v1/passport", browserCustomer.accessToken)).body
          .items,
      ).toHaveLength(1);
      await page.screenshot({
        path:
          process.env.STAGE33_SCREENSHOT_PATH ??
          "/tmp/stage33-mobile-passport.png",
        fullPage: true,
      });
      await db.user.update({
        where: { email: `owner-${key}@example.test` },
        data: { role: "SUPER_ADMIN" },
      });
      admin = spawn(
        "node",
        [
          resolve("../admin/node_modules/next/dist/bin/next"),
          "start",
          "-p",
          "3000",
        ],
        { cwd: resolve("../admin"), env: environment, stdio: "ignore" },
      );
      let ready = false;
      for (let i = 0; i < 80; i++) {
        try {
          if ((await fetch("http://localhost:3000")).ok) {
            ready = true;
            break;
          }
        } catch {
          /* bounded startup polling */
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(ready).toBe(true);
      await page.goto("http://localhost:3000");
      await login(`owner-${key}@example.test`, false);
      await page
        .getByRole("button", { name: "İşletmeleri yükle", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: `Stage33-${key} · Doğrulama bekliyor`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Ledger özetini incele", exact: true })
        .click();
      await page
        .getByText(
          "Finansal ledger kaydı yok. Tahsil edilmiş gelir gösterilemiyor.",
          { exact: true },
        )
        .waitFor();
      // UI contract double only. The preceding journey uses real HTTP/DB;
      // this block proves rendering/file upload/questions/withdrawal, NOT live AI acceptance.
      let analyzes = 0;
      let uploadedMultipart = false;
      let withdrawalObserved = false;
      let releaseMatch: (() => void) | undefined;
      const matchGate = new Promise<void>((resolve) => {
        releaseMatch = resolve;
      });
      const expiry = new Date(Date.now() + 3600000).toISOString();
      const visual = {
        id: "synthetic-browser-session",
        status: "CREATED",
        attempts: 0,
        expiresAt: expiry,
        provider: null,
        model: null,
        output: null as unknown,
      };
      const fixtureCors = {
        "access-control-allow-origin": "http://localhost:8081",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
      };
      await page
        .getByRole("button", { name: "Silme taleplerini yükle", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: `customer-${key}@example.test · Talep alındı`,
          exact: true,
        })
        .click();
      await page
        .getByText("Saklama/üyelik incelemesi gereken kayıt sınıfları:", {
          exact: true,
        })
        .waitFor();
      await page.route("**/mvp/v1/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === "OPTIONS") {
          await route.fulfill({ status: 204, headers: fixtureCors });
          return;
        }
        let value: unknown;
        if (path === "/mvp/v1/photos/policy") {
          value = {
            available: true,
            reason: "CI_CONTRACT_ONLY",
            policy: {
              version: "synthetic-browser-v1",
              notice: "Sentetik tarayıcı sözleşme testi izni",
              retentionHours: 24,
            },
          };
        } else if (
          path === "/mvp/v1/photos/consents" &&
          request.method() === "POST"
        ) {
          value = { id: "synthetic-browser-consent" };
        } else if (path === "/mvp/v1/photos/upload/synthetic-browser-consent") {
          const uploadHeaders = request.headers();
          uploadedMultipart =
            Boolean(uploadHeaders["authorization"]?.startsWith("Bearer ")) &&
            Boolean(
              uploadHeaders["content-type"]?.startsWith(
                "multipart/form-data; boundary=",
              ),
            ) &&
            Boolean(
              request.postDataBuffer()?.includes(Buffer.from("photo.png")),
            );
          value = { id: "synthetic-browser-photo" };
        } else if (path === "/mvp/v1/visual/sessions") {
          value = visual;
        } else if (
          path === "/mvp/v1/visual/sessions/synthetic-browser-session/analyze"
        ) {
          const submitted = request.postDataJSON();
          expect(submitted.expectedAttempt).toBe(analyzes);
          expect(submitted.answers).toEqual(
            analyzes === 0 ? [] : ["Haftada iki kez"],
          );
          analyzes++;
          visual.attempts = analyzes;
          visual.status = analyzes === 1 ? "NEEDS_INFORMATION" : "PLAN";
          visual.output = {
            status: visual.status,
            observations: ["Sentetik görsel gözlemi"],
            questions: analyzes === 1 ? ["Bakım sıklığınız nedir?"] : [],
            steps: analyzes === 2 ? ["Sentetik danışmanlık adımı"] : [],
            searchQuery: "saç bakımı",
            limitations: ["Bu yalnızca bir arayüz sözleşme testidir"],
          };
          value = visual;
        } else if (
          path === "/mvp/v1/visual/sessions/synthetic-browser-session/matches"
        ) {
          await matchGate;
          value = {
            provider: "OPENAI_PGVECTOR",
            status: "MATCHED",
            items: [
              {
                businessId,
                serviceId,
                businessName: "Gecikmiş sentetik eşleşme",
                serviceName: "Sentetik hizmet",
                similarity: 0.7,
              },
            ],
          };
        } else if (
          path === "/mvp/v1/photos/consents/synthetic-browser-consent/withdraw"
        ) {
          withdrawalObserved = true;
          value = { status: "REVOKED", physicalErasure: "PENDING_WORKER" };
        } else {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: fixtureCors,
          body: JSON.stringify(value),
        });
      });
      await page.goto("http://localhost:8081");
      await login(browserCustomerEmail);
      await page
        .getByRole("button", { name: "Fotoğraflı danışmanlık", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "İsteğiniz", exact: true })
        .fill("Saç bakımı");
      await page
        .getByRole("textbox", { name: "Hedefiniz", exact: true })
        .fill("Bakım planı");
      await page
        .getByRole("button", {
          name: "Görsel danışmanlık durumunu yükle",
          exact: true,
        })
        .click();
      await page
        .getByText("Sentetik tarayıcı sözleşme testi izni", { exact: true })
        .waitFor();
      await page
        .getByRole("checkbox", {
          name: "Fotoğraf ve AI işlemeye açık izin veriyorum",
          exact: true,
        })
        .click();
      const chooserPromise = page.waitForEvent("filechooser");
      await page
        .getByRole("button", {
          name: "İzinle fotoğraf seç ve yükle",
          exact: true,
        })
        .click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: "photo.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: {
            width: 20,
            height: 20,
            channels: 3,
            background: "#666666",
          },
        })
          .png()
          .toBuffer(),
      });
      await page
        .getByText("Fotoğraf kaydedildi. Analizi başlatabilirsiniz.", {
          exact: true,
        })
        .waitFor();
      expect(uploadedMultipart).toBe(true);
      await page
        .getByRole("button", { name: "Görsel analizi başlat", exact: true })
        .click();
      await page
        .getByText("Bakım sıklığınız nedir?", { exact: true })
        .waitFor();
      await page
        .getByRole("textbox", { name: "Danışmanlık yanıtı 1", exact: true })
        .fill("Haftada iki kez");
      await page
        .getByRole("button", { name: "Yanıtlarla analizi sürdür", exact: true })
        .click();
      await page
        .getByText("Sentetik danışmanlık adımı", { exact: false })
        .waitFor();
      expect(analyzes).toBe(2);
      const delayedRequest = page.waitForRequest((r) =>
        r.url().endsWith("/synthetic-browser-session/matches"),
      );
      const delayedResponse = page.waitForResponse((r) =>
        r.url().endsWith("/synthetic-browser-session/matches"),
      );
      await page
        .getByRole("button", {
          name: "Plana göre profesyonel ara",
          exact: true,
        })
        .click();
      await delayedRequest;
      await page
        .getByRole("button", { name: "Fotoğraf iznimi geri çek", exact: true })
        .click();
      await page
        .getByText(
          "İzniniz geri çekildi. Erişim kapatıldı; fotoğrafın fiziksel silinmesi işleniyor.",
          { exact: true },
        )
        .waitFor();
      expect(withdrawalObserved).toBe(true);
      releaseMatch!();
      await (await delayedResponse).finished();
      await page
        .getByRole("button", {
          name: "Görsel danışmanlık durumunu yükle",
          exact: true,
        })
        .waitFor({ state: "visible" });
      await expect
        .poll(() =>
          page
            .getByRole("button", {
              name: "Görsel danışmanlık durumunu yükle",
              exact: true,
            })
            .isEnabled(),
        )
        .toBe(true);
      expect(
        await page
          .getByText("Gecikmiş sentetik eşleşme", { exact: false })
          .count(),
      ).toBe(0);
      expect(
        await page
          .getByText("Sentetik danışmanlık adımı", { exact: false })
          .count(),
      ).toBe(0);
      await logout();
      await page
        .getByRole("button", {
          name: "Hesap silme durumunu takip et",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Silme takip kodu", { exact: true })
        .fill(completionTrackingToken);
      await page
        .getByRole("button", { name: "Silme sonucunu sorgula", exact: true })
        .click();
      await page
        .getByText("Hesabın kalıcı olarak silindi.", { exact: true })
        .waitFor();
    } catch (error) {
      await page.screenshot({
        path: "/tmp/stage33-failure.png",
        fullPage: true,
      });
      throw error;
    } finally {
      await browser.close();
    }
  }, 120000);
});
