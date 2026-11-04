/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, document, innerWidth */
const assert = require("node:assert/strict"),
  path = require("node:path");
const { expect, webkit } = require("@playwright/test"),
  { main } = require("./orzell-web-server.cjs");
async function journey(browser, origin, output, engine) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [],
    unexpected = [],
    requests = [];
  let lostResponse = true,
    profile = null,
    outgoing = [];
  const incoming = {
    id: "quote-in",
    buyerBusinessId: "buyer-2",
    supplierBusinessId: "business-1",
    productId: "our-product",
    productName: "Temsilî B2B ürünü",
    sku: "B2B-1",
    unit: "UNIT",
    quantity: "5",
    buyerNote: "Alıcı isteği",
    supplierNote: null,
    status: "REQUESTED",
    quotedUnitPrice: null,
    currency: null,
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    buyer: { name: "Alıcı işletme" },
    supplier: { name: "Deneme Salonu" },
  };
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
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
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const endpoint = url.pathname.replace(/^\/api/, ""),
      method = req.method();
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
    else if (endpoint.endsWith("/b2b/suppliers"))
      value = {
        items: [
          {
            id: "supplier-1",
            name: "Temsilî tedarikçi",
            isVerified: false,
            supplierProfile: {
              kind: "WHOLESALER",
              description: "Toptan ürün kataloğu",
            },
          },
        ],
        nextCursor: null,
      };
    else if (endpoint.endsWith("/b2b/suppliers/supplier-1/products"))
      value = {
        items: [
          {
            id: "supplier-product",
            name: "Temsilî B2B ürünü",
            sku: "V-1",
            brand: "Test",
            description: null,
            price: "100.50",
            currency: "TRY",
            unit: "UNIT",
          },
        ],
        nextCursor: null,
      };
    else if (endpoint.endsWith("/b2b/quotes") && method === "POST") {
      const body = req.postDataJSON();
      requests.push(body);
      assert.equal(body.supplierBusinessId, "supplier-1");
      assert.equal(body.productId, "supplier-product");
      if (!outgoing.length)
        outgoing = [
          {
            ...incoming,
            id: "quote-out",
            buyerBusinessId: "business-1",
            supplierBusinessId: "supplier-1",
            productId: body.productId,
            quantity: body.quantity,
            buyerNote: body.note,
            buyer: { name: "Deneme Salonu" },
            supplier: { name: "Temsilî tedarikçi" },
          },
        ];
      value = { id: "quote-out" };
      status = 201;
      if (lostResponse) {
        lostResponse = false;
        status = 503;
        value = {};
      }
    } else if (endpoint.endsWith("/b2b/quotes") && method === "GET")
      value = {
        items: url.searchParams.get("side") === "BUYER" ? outgoing : [incoming],
        nextCursor: null,
      };
    else if (endpoint.endsWith("/quotes/quote-out/cancel")) {
      assert.equal(req.postDataJSON().expectedRevision, 0);
      outgoing[0].status = "CANCELLED";
      outgoing[0].revision++;
      value = { id: "quote-out" };
      status = 201;
    } else if (endpoint.endsWith("/quotes/quote-in/reply")) {
      const body = req.postDataJSON();
      assert.equal(body.action, "QUOTE");
      assert.equal(body.unitPrice, "90.50");
      assert.equal(body.currency, "TRY");
      assert.equal(body.expectedRevision, 0);
      incoming.status = "QUOTED";
      incoming.quotedUnitPrice = body.unitPrice;
      incoming.currency = body.currency;
      incoming.supplierNote = body.note;
      incoming.revision++;
      value = { id: incoming.id };
      status = 201;
    } else if (endpoint.endsWith("/b2b/profile") && method === "GET")
      value = profile;
    else if (endpoint.endsWith("/b2b/profile") && method === "PATCH") {
      const body = req.postDataJSON();
      assert.equal(body.kind, "MANUFACTURER");
      assert.equal(body.isListed, true);
      assert.equal(body.expectedRevision, undefined);
      profile = { ...body, businessId: "business-1", revision: 0 };
      value = profile;
    } else {
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
  await button("Tedarikçiler ve B2B").click();
  await page.getByLabel("Tedarikçi veya marka ara").fill("tedarikçi");
  await button("Tedarikçileri ara").click();
  await button("Temsilî tedarikçi B2B ürünlerini gör").click();
  await button("Temsilî B2B ürünü için teklif iste").click();
  await page.getByLabel("Talep miktarı (adet)").fill("5");
  await page.getByLabel("Tedarikçi veya marka ara").fill("başka");
  await expect(button("Teklif talebini gönder")).toHaveCount(0);
  await button("Tedarikçileri ara").click();
  await button("Temsilî tedarikçi B2B ürünlerini gör").click();
  await button("Temsilî B2B ürünü için teklif iste").click();
  await page.getByLabel("Talep miktarı (adet)").fill("5");
  await page.getByLabel("Tedarikçiye not").fill("Temsilî alım isteği");
  await button("Teklif talebini gönder").click();
  await expect(page.getByLabel("Talep miktarı (adet)")).toHaveValue("5");
  await button("Teklif talebini gönder").click();
  await expect(page.getByLabel("Talep miktarı (adet)")).toHaveValue("");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
  assert.equal(outgoing.length, 1);
  await button("1. Temsilî B2B ürünü talebini aç").click();
  await expect(button("Fiyat teklifini kaydet")).toHaveCount(0);
  await button("Teklif talebini iptal et").click();
  await expect(page.getByText(/İptal edildi/, { exact: false })).toBeVisible();
  await button("Gelen teklif taleplerini yükle").click();
  await button("1. Temsilî B2B ürünü talebini aç").click();
  await page.getByLabel("Teklif birim fiyatı (adet)").fill("90,50");
  await page.getByLabel("Teklif para birimi").fill("TRY");
  await page.getByLabel("Alıcıya yanıt notu").fill("Temsilî fiyat");
  await button("Fiyat teklifini kaydet").click();
  await button("1. Temsilî B2B ürünü talebini aç").click();
  await expect(page.getByText(/Teklif edilen birim fiyat:/)).toContainText(
    "₺90,50",
  );
  await expect(button("Teklif talebini iptal et")).toHaveCount(0);
  await button("Tedarikçi profilimi yükle").click();
  await button("Üretici").click();
  await page
    .getByLabel("Tedarikçi profil açıklaması")
    .fill("Temsilî üretici profili");
  await button("Listede göster: Hayır").click();
  assert.equal(profile, null);
  await button("Tedarikçi profilini kaydet").click();
  await expect(page.getByText(/Tedarikçi profili kaydedildi\./)).toBeVisible();
  assert.equal(profile.kind, "MANUFACTURER");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await button("Tedarikçileri ara").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(output, `b2b-${width}-${engine}.png`),
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await page.close();
  console.log(
    `${engine} common B2B journey PASS: supplier/product selection reset, request replay, buyer cancel, supplier quote, explicit profile publish; all APIs intercepted, no order/payment/stock writes`,
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
}).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
