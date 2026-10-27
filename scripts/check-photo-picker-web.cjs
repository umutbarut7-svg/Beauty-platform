/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, Buffer */
// All API traffic is mocked. Only synthetic pixels enter the browser.
const assert = require("node:assert/strict");
const { deflateSync } = require("node:zlib");
const { randomBytes } = require("node:crypto");
const { webkit, expect } = require("@playwright/test");
const { main } = require("./orzell-web-server.cjs");

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}
function png(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
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
function jpegSize(data) {
  assert.equal(data[0], 0xff); assert.equal(data[1], 0xd8);
  for (let offset = 2; offset < data.length - 8;) {
    assert.equal(data[offset], 0xff);
    const marker = data[offset + 1], length = data.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2].includes(marker))
      return [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)];
    offset += 2 + length;
  }
  throw new Error("JPEG dimensions absent");
}
const largePhoto = png(2560, 1920);
assert.ok(largePhoto.length > 5 * 1024 * 1024);
const smallPhoto = png(32, 32);

async function journey(browser, origin, label) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], unexpected = [], writes = [];
  let count = 0, uploadRejected = false;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== "https://preview.13-51-112-228.sslip.io") {
      unexpected.push(url.origin); return route.abort();
    }
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const endpoint = url.pathname.replace(/^\/api/, "");
    let value, status = 200;
    if (request.method() === "POST") writes.push(endpoint);
    if (endpoint === "/auth/login") value = {
      accessToken: "synthetic-token", refreshToken: "synthetic-refresh",
      user: { id: "synthetic-user", role: "CUSTOMER" },
    };
    else if (endpoint === "/mvp/v1/photos/policy") value = {
      available: true,
      policy: { version: "synthetic-v1", notice: "Synthetic consent notice", retentionHours: 24 },
    };
    else if (endpoint === "/mvp/v1/photos/consents") {
      assert.deepEqual(request.postDataJSON(), { policyVersion: "synthetic-v1", accepted: true });
      value = { id: "consent-" + ++count };
    } else if (endpoint.startsWith("/mvp/v1/photos/upload/")) {
      const data = request.postDataBuffer();
      const boundary = request.headers()["content-type"].split("boundary=")[1];
      const start = data.indexOf("\r\n\r\n") + 4;
      const end = data.lastIndexOf(Buffer.from("\r\n--" + boundary));
      const photo = data.subarray(start, end);
      assert.ok(data.subarray(0, start).includes(Buffer.from('filename="photo.jpg"')));
      assert.ok(data.subarray(0, start).includes(Buffer.from("image/jpeg")));
      assert.ok(photo.length <= 5 * 1024 * 1024);
      assert.ok(!photo.includes(Buffer.from("SYNTHETIC_PRIVATE_GPS_MARKER")));
      assert.deepEqual(jpegSize(photo), count === 1 ? [1600, 1200] : [32, 32]);
      value = { id: "synthetic-photo" };
      if (uploadRejected) { status = 503; value = { code: "UNAVAILABLE", message: "Synthetic unavailable" }; }
    } else if (endpoint === "/mvp/v1/visual/sessions") {
      assert.equal(request.postDataJSON().photoId, "synthetic-photo");
      value = { id: "synthetic-session", status: "CREATED", attempts: 0 };
    } else if (endpoint.endsWith("/withdraw")) value = { status: "REVOKED", physicalErasure: "PENDING_WORKER" };
    else { unexpected.push(request.method() + " " + endpoint); return route.abort(); }
    return route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(value) });
  });
  const click = (name) => page.getByRole("button", { name, exact: true }).click();
  await page.goto(origin);
  await page.getByLabel("E-posta", { exact: true }).fill("synthetic-photo@example.test");
  await page.getByLabel("Parola", { exact: true }).fill("Synthetic-password-33");
  await click("Giriş yap");
  await click("Fotoğraflı danışmanlık");
  await page.getByLabel("İsteğiniz", { exact: true }).fill("Synthetic hair consultation");
  await page.getByLabel("Hedefiniz", { exact: true }).fill("Synthetic daily care");
  await click("Görsel danışmanlık durumunu yükle");
  await click("İzinle fotoğraf seç ve yükle");
  await expect(page.getByText("İsteğinizi ve hedefinizi yazıp izin metnini onaylayın.", { exact: true })).toBeVisible();
  assert.equal(writes.length, 1); // Only synthetic login, no consent/upload.
  await page.getByRole("checkbox").click();
  async function pick(file) {
    const chooser = page.waitForEvent("filechooser");
    await click("İzinle fotoğraf seç ve yükle");
    await (await chooser).setFiles(file);
  }
  await pick({ name: "disguised.jpg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>') });
  await expect(page.getByText("JPEG, PNG veya iPhone HEIC fotoğrafı seçin.", { exact: true })).toBeVisible();
  assert.equal(count, 0);
  await pick({ name: "large.png", mimeType: "image/png", buffer: largePhoto });
  await expect(page.getByText("Fotoğraf kaydedildi. Analizi başlatabilirsiniz.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Görsel analizi başlat", exact: true })).toBeVisible();
  assert.equal(count, 1);
  assert.equal(writes.filter((p) => p.endsWith("/analyze")).length, 0);
  // A rejected replacement must leave the existing photo/session usable.
  await pick({ name: "invalid.png", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>') });
  await expect(page.getByText("JPEG, PNG veya iPhone HEIC fotoğrafı seçin.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Görsel analizi başlat", exact: true })).toBeVisible();
  assert.equal(count, 1);
  await click("Fotoğraf iznimi geri çek");
  await expect(page.getByRole("button", { name: "Görsel analizi başlat", exact: true })).toHaveCount(0);
  await expect(page.getByText("Fotoğraf kaydedildi. Analizi başlatabilirsiniz.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("checkbox").click();
  uploadRejected = true;
  await pick({ name: "small.png", mimeType: "", buffer: smallPhoto });
  await expect(page.getByText("Fotoğraf yüklenemedi. Yeniden deneyin.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Görsel analizi başlat", exact: true })).toHaveCount(0);
  assert.equal(writes.filter((p) => p === "/mvp/v1/visual/sessions").length, 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await page.close();
  console.log(label + " local resize, JPEG conversion/metadata stripping, consent gate, upload result, replacement and withdrawal: PASS");
}

main(async (browser, origin) => {
  await journey(browser, origin, "Chromium");
  const safari = await webkit.launch({ headless: true });
  try { await journey(safari, origin, "WebKit"); }
  finally { await safari.close(); }
}).catch((error) => { console.error(error); process.exitCode = 1; });
