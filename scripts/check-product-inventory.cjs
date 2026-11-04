/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, document, innerWidth */
const assert = require("node:assert/strict");
const path = require("node:path");
const { expect, webkit } = require("@playwright/test");
const { main } = require("./orzell-web-server.cjs");
async function journey(browser, origin, output, engine) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [],
    unexpected = [],
    importAttempts = [],
    movementAttempts = [],
    movements = [],
    receipts = new Map();
  let products = [],
    failImport = true,
    failMovement = true,
    closed = true;
  page.on("pageerror", (e) => errors.push(e.message));
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
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const endpoint = url.pathname.replace(/^\/api/, ""),
      method = request.method();
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
    else if (
      endpoint === "/businesses/business-1/products" &&
      method === "GET"
    ) {
      if (closed) {
        closed = false;
        status = 503;
        value = {};
      } else value = { items: products, nextCursor: null };
    } else if (endpoint.endsWith("/products/import") && method === "POST") {
      const body = request.postDataJSON();
      importAttempts.push(body);
      if (!receipts.has(body.idempotencyKey)) {
        products = body.products.map((p, i) => ({
          ...p,
          id: `product-${i}`,
          brand: p.brand ?? null,
          description: null,
          stockQuantity: "0",
          revision: 0,
          isActive: true,
          isPublic: false,
        }));
        receipts.set(body.idempotencyKey, { ids: products.map((p) => p.id) });
      }
      value = receipts.get(body.idempotencyKey);
      status = 201;
      if (failImport) {
        failImport = false;
        status = 503;
        value = {};
      }
    } else if (endpoint.endsWith("/movements") && method === "POST") {
      const body = request.postDataJSON();
      movementAttempts.push(body);
      if (receipts.has(body.idempotencyKey)) {
        value = receipts.get(body.idempotencyKey);
        status = 201;
      } else {
        const p = products[0],
          next =
            Number(p.stockQuantity) +
            (body.direction === "IN" ? 1 : -1) * Number(body.quantity);
        if (next < 0) {
          status = 409;
          value = {};
        } else {
          p.stockQuantity = String(next);
          // A concurrent metadata edit must appear after the stock read refresh.
          if (failMovement) p.price = "2100.00";
          p.revision++;
          const movement = {
            id: `movement-${movements.length}`,
            direction: body.direction,
            quantity: body.quantity,
            quantityAfter: p.stockQuantity,
            reason: body.reason,
            createdAt: new Date().toISOString(),
          };
          movements.push(movement);
          value = {
            movementId: movement.id,
            productId: p.id,
            quantityAfter: p.stockQuantity,
            unit: p.unit,
          };
          receipts.set(body.idempotencyKey, value);
          status = 201;
          if (failMovement) {
            failMovement = false;
            status = 503;
            value = {};
          }
        }
      }
    } else if (endpoint.endsWith("/movements") && method === "GET")
      value = movements;
    else if (
      endpoint === "/businesses/business-1/products/product-0" &&
      method === "PATCH"
    ) {
      const body = request.postDataJSON(),
        p = products[0];
      if (p.revision !== body.expectedRevision) {
        status = 409;
        value = {};
      } else {
        Object.assign(p, body, { revision: p.revision + 1 });
        delete p.expectedRevision;
        value = { id: p.id };
      }
    } else if (endpoint === "/discovery/search")
      value = {
        items: [
          { businessId: "business-1", name: "Deneme Salonu", verified: false },
        ],
      };
    else if (endpoint === "/mvp/v1/catalog/business-1")
      value = {
        id: "business-1",
        name: "Deneme Salonu",
        isVerified: false,
        inventoryAvailable: true,
        services: [],
        locations: [],
        staff: [],
      };
    else if (endpoint === "/mvp/v1/catalog/business-1/products")
      value = {
        items: products
          .filter((p) => p.isActive && p.isPublic)
          .map(
            ({
              id,
              name,
              sku,
              brand,
              price,
              currency,
              unit,
              stockQuantity,
            }) => ({
              id,
              name,
              sku,
              brand,
              description: null,
              price,
              currency,
              unit,
              availability:
                Number(stockQuantity) > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
            }),
          ),
        nextCursor: null,
      };
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
  await page.goto(origin);
  await page.getByLabel("E-posta", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Parola", { exact: true })
    .fill("Synthetic-password-33");
  await button("Giriş yap").click();
  await page.getByRole("tab", { name: "Hesabım", exact: true }).click();
  await button("İşletme alanına geç").click();
  await button("Ürünler ve stok").click();
  await button("Ürün ve stok kayıtlarını yükle").click();
  await expect(page.getByRole("alert")).toContainText(
    "Bu özellik şu anda kullanılamıyor.",
  );
  await button("Ürün ve stok kayıtlarını yükle").click();
  await page
    .getByLabel("Toplu ürün satırları")
    .fill(
      "S-1\tŞampuan\tTest marka\t2000,50\tTRY\tUNIT\t2\nM-1\tMaske\tTest marka\t750\tTRY\tML\t10",
    );
  await button("Ürün listesini önizle").click();
  await expect(
    page.getByText("2 ürün eklenmeye hazır", { exact: true }),
  ).toBeVisible();
  await button("Önizlenen ürünleri toplu kaydet").click();
  await expect(button("Önizlenen ürünleri toplu kaydet")).toBeVisible();
  await button("Önizlenen ürünleri toplu kaydet").click();
  await expect(button("Şampuan ürününü yönet")).toBeVisible();
  assert.equal(importAttempts.length, 2);
  assert.equal(
    importAttempts[0].idempotencyKey,
    importAttempts[1].idempotencyKey,
  );
  assert.equal(products.length, 2);
  await button("Şampuan ürününü yönet").click();
  await page.getByLabel("Miktar (adet)", { exact: true }).fill("3");
  await page.getByLabel("Stok hareketi açıklaması").fill("Açılış sayımı");
  await button("Stok hareketini kaydet").click();
  await expect(page.getByLabel("Miktar (adet)", { exact: true })).toHaveValue(
    "3",
  );
  await button("Stok hareketini kaydet").click();
  await expect(page.getByLabel("Miktar (adet)", { exact: true })).toHaveValue(
    "",
  );
  assert.equal(
    movementAttempts[0].idempotencyKey,
    movementAttempts[1].idempotencyKey,
  );
  assert.equal(products[0].stockQuantity, "3");
  await expect(page.getByLabel("Ürün fiyatı", { exact: true })).toHaveValue(
    "2100.00",
  );
  await page.getByLabel("Miktar (adet)", { exact: true }).fill("3");
  await page.getByLabel("Stok hareketi açıklaması").fill("Açılış sayımı");
  await button("Stok hareketini kaydet").click();
  await expect(page.getByLabel("Miktar (adet)", { exact: true })).toHaveValue(
    "",
  );
  assert.notEqual(
    movementAttempts[2].idempotencyKey,
    movementAttempts[1].idempotencyKey,
  );
  assert.equal(products[0].stockQuantity, "6");
  await button("Stok çıkışı").click();
  await page.getByLabel("Miktar (adet)", { exact: true }).fill("7");
  await page.getByLabel("Stok hareketi açıklaması").fill("Kullanım");
  await button("Stok hareketini kaydet").click();
  await expect(page.getByLabel("Miktar (adet)", { exact: true })).toHaveValue(
    "7",
  );
  assert.equal(products[0].stockQuantity, "6");
  await page.getByLabel("Miktar (adet)", { exact: true }).fill("1");
  await button("Stok hareketini kaydet").click();
  await expect(page.getByLabel("Miktar (adet)", { exact: true })).toHaveValue(
    "",
  );
  assert.equal(products[0].stockQuantity, "5");
  await page.getByLabel("Ürün fiyatı", { exact: true }).fill("2200,50");
  await button("Ürün bilgilerini kaydet").click();
  await expect(
    page.getByText("Ürün bilgileri kaydedildi.", { exact: true }),
  ).toBeVisible();
  assert.equal(products[0].price, "2200.50");
  await button("Ürünü müşteri kataloğunda göster").click();
  await expect(button("Ürünü müşterilerden gizle")).toBeVisible();
  await button("Son stok hareketlerini yükle").click();
  assert.equal(movements.length, 3);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await button("Şampuan ürününü yönet").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(output, `inventory-${width}-${engine}.png`),
    });
  }
  await page.getByRole("tab", { name: "Hesabım", exact: true }).click();
  await button("Kişisel hesabıma geç").click();
  await page.getByLabel("Hizmet veya işletme ara").fill("Salon");
  await button("Ara").click();
  await button("Deneme Salonu hizmetlerini gör").click();
  await button("İşletmenin ürünlerini gör").click();
  await expect(page.getByText("Şampuan", { exact: true })).toBeVisible();
  await expect(page.getByText("Maske", { exact: true })).toHaveCount(0);
  await expect(page.getByText("₺2.200,50", { exact: true })).toBeVisible();
  await expect(page.getByText("Stokta mevcut", { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(output, `product-customer-${engine}.png`),
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await page.close();
  console.log(
    `${engine} shared inventory flow PASS: batch import, response-loss retries, fresh intent keys, stock limit, edits, visibility and customer catalog; all requests intercepted`,
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
