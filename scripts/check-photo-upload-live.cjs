/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, URL, Buffer */
// Fixed owner-authorized preview. Synthetic pixels only; never starts analysis.
const { chromium, expect } = require("@playwright/test");
const { randomBytes } = require("node:crypto");
const { deflateSync } = require("node:zlib");
const assert = require("node:assert/strict");
const origin = "https://preview.13-51-112-228.sslip.io";
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}
function png(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = 1 + width * 3;
  const pixels = randomBytes(stride * height);
  for (let y = 0; y < height; y++) pixels[y * stride] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from("Comment\0SYNTHETIC_PRIVATE_GPS_MARKER")),
    chunk("IDAT", deflateSync(pixels, { level: 0 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const email =
  "orzell-photo-qa-" + randomBytes(8).toString("hex") + "@example.test";
const password = randomBytes(30).toString("base64url");
const refreshTokens = [],
  consents = [];
let token,
  browser,
  step = "start",
  failed = false,
  visualId;
async function call(path, method = "GET", body, auth = token) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(auth ? { Authorization: "Bearer " + auth } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error("Synthetic preview API status " + response.status);
  return response.status === 204 ? null : response.json();
}
async function main() {
  try {
    step = "create synthetic customer";
    const account = await call(
      "/auth/register",
      "POST",
      { email, password },
      null,
    );
    token = account.accessToken;
    refreshTokens.push(account.refreshToken);
    step = "verify enabled photo policy";
    assert.equal((await call("/mvp/v1/photos/policy")).available, true);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.setDefaultTimeout(30000);
    const errors = [],
      analyzes = [];
    page.on("pageerror", () => errors.push("pageerror"));
    page.on("request", (r) => {
      if (r.url().includes("/analyze")) analyzes.push(true);
    });
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    step = "synthetic customer login";
    await page.goto(origin);
    const click = (name) =>
      page.getByRole("button", { name, exact: true }).click();
    await page.getByLabel("E-posta", { exact: true }).fill(email);
    await page.getByLabel("Parola", { exact: true }).fill(password);
    const login = page.waitForResponse(
      (r) => r.url().endsWith("/auth/login") && r.request().method() === "POST",
    );
    await click("Giriş yap");
    const loginResponse = await login;
    assert.equal(loginResponse.status(), 200);
    refreshTokens.push((await loginResponse.json()).refreshToken);
    await click("Fotoğraflı danışmanlık");
    await page
      .getByLabel("İsteğiniz", { exact: true })
      .fill("Synthetic upload acceptance");
    await page
      .getByLabel("Hedefiniz", { exact: true })
      .fill("Synthetic pixels; no consultation requested");
    await click("Görsel danışmanlık durumunu yükle");
    await page.getByRole("checkbox").click();
    step = "synthetic large photo preparation and private upload";
    const consent = page.waitForResponse(
      (r) =>
        r.url().endsWith("/photos/consents") && r.request().method() === "POST",
    );
    const photo = page.waitForResponse(
      (r) =>
        r.url().includes("/photos/upload/") && r.request().method() === "POST",
    );
    const visual = page.waitForResponse(
      (r) =>
        r.url().endsWith("/visual/sessions") && r.request().method() === "POST",
    );
    const fileChooser = page.waitForEvent("filechooser");
    await click("İzinle fotoğraf seç ve yükle");
    const bytes = png(2560, 1920);
    assert.ok(bytes.length > 5 * 1024 * 1024);
    await (
      await fileChooser
    ).setFiles({
      name: "synthetic-large.png",
      mimeType: "image/png",
      buffer: bytes,
    });
    const consentResponse = await consent;
    assert.equal(consentResponse.status(), 201);
    consents.push((await consentResponse.json()).id);
    assert.equal((await photo).status(), 201);
    const visualResponse = await visual;
    assert.equal(visualResponse.status(), 201);
    const session = await visualResponse.json();
    visualId = session.id;
    assert.equal(session.status, "CREATED");
    await expect(
      page.getByText("Fotoğraf kaydedildi. Analizi başlatabilirsiniz.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Görsel analizi başlat", exact: true }),
    ).toBeVisible();
    assert.deepEqual(analyzes, []);
    assert.deepEqual(errors, []);
    console.log(
      "Live browser large synthetic photo -> private upload -> CREATED session: PASS",
    );
    console.log(
      "Explicit analysis boundary; zero analysis requests or browser errors: PASS",
    );
  } catch (_) {
    failed = true;
    console.error("Synthetic live photo acceptance failed at: " + step);
  } finally {
    if (browser)
      await browser.close().catch(() => {
        failed = true;
      });
    for (const id of consents)
      try {
        await call("/mvp/v1/photos/consents/" + id + "/withdraw", "POST");
      } catch (_) {
        failed = true;
        console.error("Synthetic photo withdrawal needs review");
      }
    if (visualId)
      try {
        const response = await fetch(
          origin + "/api/mvp/v1/visual/sessions/" + visualId,
          {
            headers: { Authorization: "Bearer " + token },
            signal: AbortSignal.timeout(20000),
          },
        );
        if (![403, 404, 410].includes(response.status))
          throw new Error("Access still present");
        console.log(
          "Synthetic photo consent withdrawn and consultation access denied: PASS; physical erasure pending worker",
        );
      } catch (_) {
        failed = true;
        console.error("Synthetic consultation access cleanup needs review");
      }
    for (const refreshToken of refreshTokens.filter(Boolean))
      try {
        await call("/auth/logout", "POST", { refreshToken }, null);
      } catch (_) {
        failed = true;
        console.error("Synthetic session cleanup needs review");
      }
    if (!failed)
      console.log(
        "Synthetic refresh sessions revoked: PASS; no real photo or paid AI call",
      );
    if (failed) process.exitCode = 1;
  }
}
main().catch(() => {
  console.error("Photo acceptance stopped without exposing private responses");
  process.exitCode = 1;
});
