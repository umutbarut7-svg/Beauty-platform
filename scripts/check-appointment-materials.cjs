/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, document, innerWidth */
const assert = require("node:assert/strict");
const path = require("node:path");
const { expect, webkit } = require("@playwright/test");
const { main } = require("./orzell-web-server.cjs");
async function journey(browser, origin, output, engine) {
  const page = await browser.newPage({
    viewport: { width: engine === "webkit" ? 320 : 390, height: 844 },
  });
  const unexpected = [],
    errors = [],
    writes = [],
    receipts = new Map();
  let failRead = true,
    ambiguousWrite = true;
  const products = [
    {
      id: "material-a",
      name: "Uzun isimli profesyonel sarf ürünü",
      sku: "S-1",
      unit: "UNIT",
      stockQuantity: "3",
      isActive: true,
    },
    {
      id: "material-b",
      name: "Bakım kremi",
      sku: "S-2",
      unit: "ML",
      stockQuantity: "0.375",
      isActive: true,
    },
  ];
  const bookings = ["a", "b"].map((id) => ({
    id: `appointment-${id}`,
    businessId: "business-1",
    status: "COMPLETED",
    startsAt: "2026-10-01T10:00:00Z",
    endsAt: "2026-10-01T11:00:00Z",
    price: "2000",
    currency: "TRY",
    service: { name: `Bakım ${id.toUpperCase()}` },
  }));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method();
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
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    const endpoint = url.pathname.replace(/^\/api/, "");
    let value,
      status = 200;
    if (endpoint === "/auth/login")
      value = {
        accessToken: "synthetic",
        refreshToken: "synthetic",
        user: { id: "user", role: "CUSTOMER" },
      };
    else if (endpoint === "/businesses")
      value = [{ id: "business-1", name: "Deneme Salonu", isVerified: false }];
    else if (endpoint === "/businesses/business-1/appointments")
      value = bookings;
    else if (endpoint.endsWith("/result") && method === "GET")
      value = { result: null };
    else if (endpoint.endsWith("/materials")) {
      const id = endpoint.split("/").at(-2);
      if (method === "GET") {
        if (failRead) {
          failRead = false;
          status = 503;
          value = {};
        } else value = { consumption: receipts.get(id) ?? null };
      } else {
        const body = request.postDataJSON();
        writes.push({ id, body });
        if (!receipts.has(id)) {
          const receipt = {
            appointmentId: id,
            serviceId: "service",
            serviceName: "Bakım A",
            operationId: "receipt-a",
            reason: body.reason,
            createdAt: new Date().toISOString(),
            items: body.items.map((item) => {
              const product = products.find((p) => p.id === item.productId);
              product.stockQuantity = String(
                Number(product.stockQuantity) - Number(item.quantity),
              );
              return {
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                unit: product.unit,
                quantity: item.quantity,
                quantityAfter: product.stockQuantity,
                movementId: "movement-" + product.id,
              };
            }),
          };
          receipts.set(id, receipt);
        }
        value = receipts.get(id);
        status = 201;
        if (ambiguousWrite) {
          ambiguousWrite = false;
          value = {};
          status = 503;
        }
      }
    } else if (
      endpoint === "/businesses/business-1/products" &&
      method === "GET"
    )
      value = { items: products, nextCursor: null };
    else {
      unexpected.push(`${method} ${endpoint}`);
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
  const booking = (letter) =>
    page.getByRole("button", { name: new RegExp(`^Bakım ${letter} ·`) });
  await page.goto(origin);
  await page.getByLabel("E-posta", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Parola", { exact: true })
    .fill("Synthetic-password-33");
  await button("Giriş yap").click();
  await page.getByRole("tab", { name: "Hesabım", exact: true }).click();
  await button("İşletme alanına geç").click();
  await button("İşletme randevularını gör").click();
  await booking("A").click();
  assert.equal(writes.length, 0);
  await button("Randevu sarf kaydını yükle").click();
  await expect(button("Sarf için güncel ürünleri yükle")).toHaveCount(0);
  await button("Randevu sarf kaydını yükle").click();
  await button("Sarf için güncel ürünleri yükle").click();
  await button(`${products[0].name} sarf olarak seç`).click();
  await page.getByLabel("Kullanılan sarf miktarı").fill("0,5");
  await button("Sarf listesine ekle").click();
  await expect(
    page.getByText(/Stok miktarını aşmayan pozitif miktar/),
  ).toBeVisible();
  await page.getByLabel("Kullanılan sarf miktarı").fill("1");
  await button("Sarf listesine ekle").click();
  // Opening a different appointment clears all staged amounts and confirmation.
  await booking("B").click();
  await expect(
    page.getByText("1 ürün sarf listesinde", { exact: true }),
  ).toHaveCount(0);
  await expect(button("Sarfı onayla ve stoktan düş")).toHaveCount(0);
  await booking("A").click();
  await button("Randevu sarf kaydını yükle").click();
  await button("Sarf için güncel ürünleri yükle").click();
  for (const [product, quantity] of [
    [products[0], "1"],
    [products[1], "0,125"],
  ]) {
    await button(`${product.name} sarf olarak seç`).click();
    await page.getByLabel("Kullanılan sarf miktarı").fill(quantity);
    await button("Sarf listesine ekle").click();
  }
  await page.getByLabel("Sarf kaydı açıklaması").fill("Ortak bakım sarfı");
  await button("Sarf listesini önizle").click();
  assert.equal(writes.length, 0, "preview never changes stock");
  await page.screenshot({
    path: path.join(output, `appointment-materials-preview-${engine}.png`),
    fullPage: true,
  });
  await button("Sarfı onayla ve stoktan düş").click();
  await expect(button("Aynı sarf listesini tekrar gönder")).toBeVisible();
  await expect(button("Sarf listesini düzenle")).toHaveCount(0);
  await button("Aynı sarf listesini tekrar gönder").click();
  await expect(page.getByText("Kayıtlı sarf", { exact: true })).toBeVisible();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(
    products.map((product) => product.stockQuantity),
    ["2", "0.25"],
  );
  await button("Randevu sarf kaydını yükle").click();
  assert.equal(writes.length, 2, "receipt reads never submit again");
  await page.screenshot({
    path: path.join(output, `appointment-materials-receipt-${engine}.png`),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await page.close();
  console.log(
    `${engine}: shared appointment material preview, isolation, exact measured quantity, ambiguous same-batch retry and private receipt PASS`,
  );
}
main(async (browser, origin, output) => {
  await journey(browser, origin, output, "chromium");
  const second = await webkit.launch({ headless: true });
  try {
    await journey(second, origin, output, "webkit");
  } finally {
    await second.close();
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
