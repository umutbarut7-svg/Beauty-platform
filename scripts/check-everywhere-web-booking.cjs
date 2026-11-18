/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, fetch, setTimeout, document, localStorage, sessionStorage */
const assert = require("node:assert/strict");
const https = require("node:https");
const { Buffer } = require("node:buffer");
const { spawn, execFileSync } = require("node:child_process");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { chromium, webkit, expect } = require("@playwright/test");
const origin = "http://127.0.0.1:3107";
const target = "?businessId=salon&serviceId=color&professionalId=staff";
const published = {
  business: { id: "salon", name: "Synthetic salon", timezone: "UTC" },
  locations: [{ id: "location", name: "Synthetic location" }],
  service: {
    id: "color",
    name: "Balayage",
    price: "1500",
    currency: "TRY",
    durationMinutes: 90,
  },
  professionals: [
    {
      id: "staff",
      displayName: "Synthetic stylist",
      price: "1700.25",
      durationMinutes: 120,
    },
  ],
};
const slot = {
  startsAt: "2030-01-07T10:00:00.000Z",
  endsAt: "2030-01-07T12:00:00.000Z",
  staffId: "staff",
};
let scenario = "normal",
  attempts = 0,
  record = null;
const unexpected = [];

async function review(engine, name, apiOrigin) {
  const browser = await engine.launch({
    headless: true,
    ...(name === "chromium" && process.env.ORZELL_ADMIN_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.ORZELL_ADMIN_CHROMIUM_EXECUTABLE }
      : {}),
  });
  try {
    // Only this generated loopback fixture uses a temporary self-signed test CA.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true,
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if ([origin, apiOrigin].includes(url.origin)) return route.continue();
      unexpected.push(url.origin);
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const load = async () => {
      scenario = "normal";
      attempts = 0;
      record = null;
      await page.goto(origin + "/discover/service" + target);
      await expect(
        page.getByRole("heading", { name: "Balayage", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Uygun saatleri göster",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByLabel("E-posta", { exact: true })
        .fill("synthetic@example.test");
      await page
        .getByLabel("Parola", { exact: true })
        .fill("Synthetic-password-33");
      await page
        .getByRole("button", { name: "Giriş yap", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Uygun saatleri göster",
          exact: true,
        }),
      ).toBeVisible();
      await page.getByLabel("Konum", { exact: true }).selectOption("location");
      await page.getByLabel("Gün", { exact: true }).fill("2030-01-07");
    };
    const quote = async () => {
      await page
        .getByRole("button", { name: "Uygun saatleri göster", exact: true })
        .click();
      await page
        .getByLabel("Uygun saat", { exact: true })
        .selectOption(slot.startsAt);
    };
    await load();
    await quote();
    await page
      .getByRole("button", { name: "Randevu talebini gönder", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "İşletme onayı bekleniyor",
    );
    assert.equal(attempts, 1);
    assert.equal(record.status, "PENDING");
    await expect(
      page.getByText("İşletme tarafından onaylandı", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Bu randevuyu iptal et", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Randevunuz iptal edildi",
    );
    assert.equal(record.status, "CANCELLED");
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
      false,
    );
    assert.deepEqual(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
      [0, 0],
    );

    await load();
    await quote();
    scenario = "changed";
    await page
      .getByRole("button", { name: "Randevu talebini gönder", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Kayıt değişti",
    );
    assert.equal(record, null);
    assert.equal(attempts, 1);
    await expect(
      page.getByRole("button", {
        name: "Randevu talebini gönder",
        exact: true,
      }),
    ).toHaveCount(0);

    await load();
    await quote();
    scenario = "lost-response";
    await page
      .getByRole("button", { name: "Randevu talebini gönder", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "İşlem sonucu doğrulanamadı",
    );
    assert.equal(attempts, 1);
    assert.equal(record.status, "PENDING");
    await page
      .getByRole("button", { name: "Randevularımı kontrol et", exact: true })
      .click();
    await expect(
      page.getByRole("article", { name: "Randevu kaydı", exact: true }),
    ).toContainText("İşletme onayı bekleniyor");
    assert.equal(attempts, 1);

    await load();
    scenario = "foreign-quote";
    await page
      .getByRole("button", { name: "Uygun saatleri göster", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Uygun saat", { exact: true })).toHaveCount(0);
    assert.equal(attempts, 0);

    await load();
    await quote();
    scenario = "expired";
    await page
      .getByRole("button", { name: "Randevularımı kontrol et", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Giriş yap", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Uygun saat", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("article", { name: "Randevu kaydı", exact: true }),
    ).toHaveCount(0);
    assert.equal(attempts, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), "orzell-web-booking-"));
  let server, api;
  try {
    const certificate = path.join(directory, "fixture-ca.pem"),
      key = path.join(directory, "fixture-key.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-keyout",
        key,
        "-out",
        certificate,
      ],
      { stdio: "ignore" },
    );
    api = https.createServer(
      { key: await readFile(key), cert: await readFile(certificate) },
      async (request, response) => {
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader(
          "access-control-allow-headers",
          "authorization,content-type",
        );
        response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
        if (request.method === "OPTIONS") {
          response.writeHead(204);
          response.end();
          return;
        }
        const url = new URL(request.url, "https://127.0.0.1"),
          route = url.pathname;
        const send = (status, body) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(body));
        };
        try {
          const chunks = [];
          for await (const chunk of request) chunks.push(chunk);
          const body = chunks.length
            ? JSON.parse(Buffer.concat(chunks).toString())
            : null;
          if (route === "/api/discovery/shared-service")
            return send(200, published);
          if (route === "/api/auth/login")
            return send(200, {
              accessToken: "synthetic-local-token",
              refreshToken: "synthetic-local-refresh",
              user: { id: "synthetic-customer", role: "CUSTOMER" },
            });
          if (route === "/api/auth/logout") {
            response.writeHead(204);
            response.end();
            return;
          }
          assert.equal(
            request.headers.authorization,
            "Bearer synthetic-local-token",
          );
          if (scenario === "expired") return send(401, {});
          if (route === "/api/discovery/shared-service/availability") {
            assert.equal(url.searchParams.get("locationId"), "location");
            assert.equal(url.searchParams.get("professionalId"), "staff");
            return send(200, {
              published:
                scenario === "foreign-quote"
                  ? {
                      ...published,
                      business: { ...published.business, id: "other" },
                    }
                  : published,
              slots: [slot],
            });
          }
          if (
            route === "/api/discovery/shared-service/bookings" &&
            request.method === "POST"
          ) {
            attempts++;
            assert.equal(body.expectedPrice, "1700.25");
            assert.equal(body.expectedCurrency, "TRY");
            assert.equal(body.expectedDurationMinutes, 120);
            assert.equal(body.customerId, undefined);
            if (scenario === "changed") return send(409, {});
            if (record) return send(409, {});
            record = {
              id: "synthetic-booking",
              businessId: "salon",
              serviceId: "color",
              professionalId: "staff",
              locationId: "location",
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              price: "1700.25",
              currency: "TRY",
              status: "PENDING",
            };
            if (scenario === "lost-response") {
              response.destroy();
              return;
            }
            return send(201, record);
          }
          if (
            route === "/api/discovery/shared-service/bookings" &&
            request.method === "GET"
          )
            return send(200, { items: record ? [record] : [] });
          if (
            route ===
              "/api/discovery/shared-service/bookings/synthetic-booking/cancel" &&
            request.method === "POST"
          ) {
            assert.equal(body.businessId, "salon");
            record.status = "CANCELLED";
            return send(201, record);
          }
          unexpected.push(route);
          send(404, {});
        } catch (error) {
          unexpected.push(error.message);
          send(500, {});
        }
      },
    );
    await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
    const apiOrigin = `https://127.0.0.1:${api.address().port}`;
    server = spawn(
      process.execPath,
      [
        require.resolve("next/dist/bin/next", {
          paths: [path.resolve("apps/admin")],
        }),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3107",
      ],
      {
        cwd: path.resolve("apps/admin"),
        stdio: "ignore",
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          NODE_EXTRA_CA_CERTS: certificate,
          ORZELL_PUBLIC_ORIGIN: "https://share.example.test",
          ORZELL_PUBLIC_API_ORIGIN: apiOrigin,
          ORZELL_PUBLIC_API_PATH_PREFIX: "/api",
          ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED: "true",
        },
      },
    );
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null)
        throw new Error("Booking web server exited before readiness");
      try {
        if ((await fetch(origin)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* bounded startup */
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(ready, true);
    const entry = await fetch(origin + "/discover/service" + target);
    assert.equal(entry.status, 200);
    const html = await entry.text();
    assert.ok(html.includes("Balayage"));
    assert.ok(html.includes("Web randevusu"));
    assert.deepEqual(unexpected, []);
    if (process.argv.includes("--server-only")) {
      console.log(
        "EVERYWHERE_SSR_PASSED: dynamic published-service page, trusted generated CA and /api mount; no browser or booking write claimed.",
      );
      return;
    }
    await review(chromium, "chromium", apiOrigin);
    if (!process.argv.includes("--chromium-only"))
      await review(webkit, "webkit", apiOrigin);
    console.log(
      "EVERYWHERE_WEB_BOOKING_PASSED: progressive sign-in, current quote, pending receipt/cancel, changed-price denial, lost-response reconciliation, tenant mismatch and 401 cleanup; generated loopback fixtures only.",
    );
  } finally {
    if (server) {
      server.kill("SIGTERM");
      if (server.exitCode === null)
        await new Promise((resolve) => server.once("exit", resolve));
    }
    if (api) await new Promise((resolve) => api.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
