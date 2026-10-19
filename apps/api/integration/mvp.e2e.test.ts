import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url =
  "postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public";
if (process.env.STAGE32_TEST_DATABASE_URL !== url)
  throw new Error("Stage 33 HTTP tests require the disposable CI database");
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
  JWT_ACCESS_SECRET: "isolated-stage33-test-access-not-production",
  JWT_REFRESH_SECRET: "isolated-stage33-test-refresh-not-production",
  CORS_ORIGINS: "http://localhost:8081,http://localhost:3000",
  RATE_LIMIT_DEFAULT: "10000",
};
async function request(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(`${base}${path}`, {
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
  expect(r.status, `${method} ${path}: ${JSON.stringify(r.body)}`).toBe(
    method === "POST" ? 201 : 200,
  );
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
  const unassigned = await create("/auth/register", "", {
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
  it("registers, books authoritative availability, completes a job, records result and customer satisfaction, publishes passport via real worker", async () => {
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
    expect(capability.privatePhotos.available).toBe(false);
    expect(capability.visualAnalysis.available).toBe(false);
    expect(capability.verification.automatic).toBe(false);
    const own = await db.customer.findUniqueOrThrow({
      where: { userId: customerId },
    });
    expect(own).toBeTruthy();
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
    try {
      const page = await browser.newPage();
      const login = async (email: string) => {
        await page
          .getByRole("textbox", { name: "E-posta", exact: true })
          .fill(email);
        await page
          .getByLabel("Parola", { exact: true })
          .fill("Isolated-strong-password-33");
        await page
          .getByRole("button", { name: "Giriş yap", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Çıkış yap", exact: true })
          .waitFor();
      };
      await page.goto("http://localhost:8081");
      await login(`customer-${key}@example.test`);
      await page
        .getByRole("textbox", { name: "İsteğiniz", exact: true })
        .fill(`Stage33-${key}`);
      await page
        .getByRole("textbox", { name: "Hedefiniz", exact: true })
        .fill("Test care goal");
      await page
        .getByRole("button", { name: "Katalogda ara", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: `Stage33-${key} hizmetlerini gör`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: /Real booking fixture ·/ })
        .click();
      await page
        .getByRole("button", { name: "Test location", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Test Professional", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Tarih (YYYY-MM-DD)", exact: true })
        .fill(new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10));
      await page
        .getByRole("button", { name: "Müsait saatleri bul", exact: true })
        .click();
      await page
        .getByRole("button", { name: /^Rezerve et:/ })
        .first()
        .click();
      await page
        .getByRole("button", { name: /Real booking fixture.*PENDING/ })
        .waitFor();
      await page
        .getByRole("button", { name: "Çıkış yap", exact: true })
        .click();
      await login(`owner-${key}@example.test`);
      await page.getByRole("button", { name: "İşletme", exact: true }).click();
      await page
        .getByRole("button", { name: "İşletmelerimi yükle", exact: true })
        .click();
      await page
        .getByRole("button", { name: `Stage33-${key}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: "Randevuları yenile", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Real booking fixture.*PENDING/ })
        .click();
      for (const status of ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"]) {
        await page
          .getByRole("button", { name: `Durum: ${status}`, exact: true })
          .click();
        await page
          .getByRole("button", { name: `Durum: ${status}`, exact: true })
          .waitFor({ state: "visible" });
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
      await page
        .getByRole("button", { name: "Gelir özetini yükle", exact: true })
        .click();
      await page
        .getByText("Ledger kaydı yok; tahsil edilmiş gelir iddiası yok.", {
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("button", { name: "Çıkış yap", exact: true })
        .click();
      await login(`customer-${key}@example.test`);
      await page
        .getByRole("button", { name: "Randevuları yenile", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Real booking fixture.*COMPLETED/ })
        .first()
        .click();
      await page
        .getByText("Browser recorded outcome", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Memnunum", exact: true }).click();
      await page.getByText("Memnuniyet: SATISFIED", { exact: true }).waitFor();
      await worker();
      await page
        .getByRole("button", { name: "Bakım geçmişimi yükle", exact: true })
        .click();
      await page
        .getByText(/Browser recorded outcome/)
        .first()
        .waitFor();
      expect(
        (await request("/mvp/v1/passport", customerToken)).body.items,
      ).toHaveLength(2);
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
      await login(`owner-${key}@example.test`);
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
    } finally {
      await browser.close();
    }
  }, 120000);
});
