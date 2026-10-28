/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, Buffer */
// Synthetic UI acceptance: every API request is intercepted; no provider calls.
const assert = require("node:assert/strict");
const path = require("node:path");
const { expect, webkit } = require("@playwright/test");
const { main } = require("./orzell-web-server.cjs");

async function journey(browser, origin, output, engine) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [],
    unexpected = [],
    writes = [];
  let capability = "closed",
    match = "unavailable",
    releaseMatch;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== "https://preview.13-51-112-228.sslip.io") {
      unexpected.push(url.origin);
      return route.abort();
    }
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const endpoint = url.pathname.replace(/^\/api/, "");
    if (request.method() === "POST") writes.push(endpoint);
    let value,
      status = 200;
    if (endpoint === "/auth/login")
      value = {
        accessToken: "synthetic-token",
        refreshToken: "synthetic-refresh",
        user: { id: "synthetic-user", role: "CUSTOMER" },
      };
    else if (endpoint === "/mvp/v1/photos/policy")
      value = {
        available: true,
        policy: {
          version: "synthetic-v1",
          notice: "Synthetic photo notice",
          retentionHours: 24,
        },
      };
    else if (endpoint === "/mvp/v1/photos/consents")
      value = { id: "synthetic-consent" };
    else if (endpoint === "/mvp/v1/photos/upload/synthetic-consent")
      value = { id: "synthetic-photo" };
    else if (endpoint === "/mvp/v1/visual/sessions")
      value = { id: "synthetic-session", status: "CREATED", attempts: 0 };
    else if (endpoint.endsWith("/analyze"))
      value = {
        id: "synthetic-session",
        status: "PLAN",
        attempts: 1,
        output: {
          observations: [],
          questions: [],
          steps: ["Synthetic saved plan"],
          limitations: [],
          searchQuery: "Synthetic care",
        },
      };
    else if (endpoint === "/mvp/v1/capabilities") {
      if (capability === "error") status = 503;
      if (capability === "expired") status = 401;
      value = {
        enabled: true,
        matching: { semanticVectorAvailable: capability === "open" },
      };
    } else if (endpoint.endsWith("/matches")) {
      if (match === "late")
        await new Promise((resolve) => {
          releaseMatch = resolve;
        });
      status = match === "unavailable" ? 503 : 201;
      value = {
        status: match === "empty" ? "NO_MATCH" : "MATCHED",
        items:
          match === "empty"
            ? []
            : [
                {
                  businessId: "synthetic-business",
                  serviceId: "synthetic-service",
                  businessName: "Late synthetic salon",
                  serviceName: "Late synthetic service",
                },
              ],
      };
    } else if (endpoint.endsWith("/withdraw")) value = { status: "REVOKED" };
    else {
      unexpected.push(request.method() + " " + endpoint);
      return route.abort();
    }
    return route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const countMatches = () =>
    writes.filter((endpoint) => endpoint.endsWith("/matches")).length;
  const unavailable = page.getByText(
    "Planına göre profesyonel arama şu anda kullanılamıyor. Planını inceleyebilir veya Keşfet’ten hizmet ve randevu seçebilirsin.",
    { exact: true },
  );
  await page.goto(origin);
  await page
    .getByLabel("E-posta", { exact: true })
    .fill("synthetic@example.test");
  await page
    .getByLabel("Parola", { exact: true })
    .fill("Synthetic-password-33");
  await button("Giriş yap").click();
  await button("Fotoğraflı danışmanlık").click();
  await page.getByLabel("İsteğiniz", { exact: true }).fill("Synthetic care");
  await page.getByLabel("Hedefiniz", { exact: true }).fill("Synthetic plan");
  await button("Görsel danışmanlık durumunu yükle").click();
  await page.getByRole("checkbox").click();
  const chooser = page.waitForEvent("filechooser");
  await button("İzinle fotoğraf seç ve yükle").click();
  await (
    await chooser
  ).setFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await button("Görsel analizi başlat").click();
  await expect(unavailable).toBeVisible();
  await expect(button("Plana göre profesyonel ara")).toHaveCount(0);
  await expect(
    page.getByText("1. Synthetic saved plan", { exact: true }),
  ).toBeVisible();
  assert.equal(countMatches(), 0);
  await page.screenshot({
    path: path.join(output, `matching-closed-${engine}.png`),
    fullPage: true,
  });

  capability = "error";
  await button("Eşleştirme durumunu yenile").click();
  await expect(
    page.getByText(
      "Eşleştirme durumu kontrol edilemedi. Planın bu ekranda duruyor; yeniden deneyebilirsin.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(button("Plana göre profesyonel ara")).toHaveCount(0);
  assert.equal(countMatches(), 0);

  capability = "open";
  await button("Eşleştirme durumunu yenile").click();
  await expect(button("Plana göre profesyonel ara")).toBeVisible();
  assert.equal(countMatches(), 0); // Availability alone never starts paid matching.
  capability = "error";
  await button("Plana göre profesyonel ara").click();
  await expect(
    page.getByText(
      "Eşleştirme durumu kontrol edilemedi. Planın bu ekranda duruyor; yeniden deneyebilirsin.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.equal(countMatches(), 0);
  capability = "open";
  await button("Eşleştirme durumunu yenile").click();
  await expect(button("Plana göre profesyonel ara")).toBeVisible();
  capability = "closed";
  await button("Plana göre profesyonel ara").click();
  await expect(unavailable).toBeVisible();
  assert.equal(countMatches(), 0); // Gate closed between PLAN load and explicit action.

  capability = "open";
  await button("Eşleştirme durumunu yenile").click();
  await button("Plana göre profesyonel ara").click();
  await expect(unavailable).toBeVisible();
  assert.equal(countMatches(), 1); // A race-time server 503 preserves the plan.
  await expect(
    page.getByText("1. Synthetic saved plan", { exact: true }),
  ).toBeVisible();

  match = "empty";
  await button("Eşleştirme durumunu yenile").click();
  await button("Plana göre profesyonel ara").click();
  await expect(
    page.getByText("Uygun, güncel arama kaydı bulunamadı.", { exact: true }),
  ).toBeVisible();
  assert.equal(countMatches(), 2);

  match = "late";
  await button("Plana göre profesyonel ara").click();
  await expect.poll(countMatches).toBe(3);
  await button("Fotoğraf iznimi geri çek").click();
  releaseMatch();
  await expect(
    page.getByText(
      "İzniniz geri çekildi. Erişim kapatıldı; fotoğrafın fiziksel silinmesi işleniyor.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Late synthetic salon · Late synthetic service", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(button("Plana göre profesyonel ara")).toHaveCount(0);
  // A failed authenticated capability read must use the parent's sign-out path.
  await page.getByRole("checkbox").click();
  const nextChooser = page.waitForEvent("filechooser");
  await button("İzinle fotoğraf seç ve yükle").click();
  await (
    await nextChooser
  ).setFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  capability = "expired";
  await button("Görsel analizi başlat").click();
  await expect(button("Giriş yap")).toBeVisible();
  await expect(
    page.getByText("1. Synthetic saved plan", { exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await page.close();
  console.log(
    engine +
      " closed/failed capability, refresh, preflight race, server 503, real NO_MATCH and withdrawal race: PASS (mock APIs)",
  );
}
main(async (browser, origin, output) => {
  await journey(browser, origin, output, "chromium");
  const safari = await webkit.launch({ headless: true });
  try {
    await journey(safari, origin, output, "webkit");
  } finally {
    await safari.close();
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
