/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, document, innerWidth */
const assert = require("node:assert/strict");
const path = require("node:path");
const { expect, webkit } = require("@playwright/test");
const { main } = require("./orzell-web-server.cjs");

const services = [
  { id: "cut", name: "Saç kesimi", price: "2000.00", durationMinutes: 30 },
  {
    id: "extensions",
    name: "Mikro kaynak",
    price: "20000.00",
    durationMinutes: 120,
  },
  {
    id: "color",
    name: "Kişiye özel renklendirme ve uzun saç balayaj uygulaması",
    price: "1234567.89",
    durationMinutes: 180,
  },
  {
    id: "style",
    name: "Fön ve şekillendirme",
    price: "750.50",
    durationMinutes: 45,
  },
  { id: "care", name: "Keratin bakımı", price: "0.00", durationMinutes: 60 },
  { id: "other", name: "Özel uygulama", price: "500.00" },
].map((s) => ({ ...s, currency: "TRY" }));

async function journey(browser, origin, output, engine) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [],
    unexpected = [],
    writes = [];
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
    let body;
    if (endpoint === "/auth/login")
      body = {
        accessToken: "synthetic",
        refreshToken: "synthetic",
        user: { id: "user-1", role: "CUSTOMER" },
      };
    else if (request.method() !== "GET") {
      writes.push(endpoint);
      return route.abort();
    } else if (endpoint === "/discovery/search")
      body = {
        items: [
          { businessId: "business-1", name: "Deneme Salonu", verified: false },
        ],
      };
    else if (endpoint === "/mvp/v1/catalog/business-1")
      body = {
        id: "business-1",
        name: "Deneme Salonu",
        isVerified: false,
        services,
        locations: [],
        staff: [],
      };
    else if (endpoint === "/businesses")
      body = [{ id: "business-1", name: "Deneme Salonu", isVerified: false }];
    else if (endpoint === "/businesses/business-1/services") body = services;
    else if (
      /\/businesses\/business-1\/(locations|staff|service-categories)$/.test(
        endpoint,
      )
    )
      body = [];
    else {
      unexpected.push(endpoint);
      return route.abort();
    }
    return route.fulfill({
      headers,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(origin);
  await page.getByLabel("E-posta", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Parola", { exact: true })
    .fill("Synthetic-password-33");
  await button("Giriş yap").click();
  await page.getByLabel("Hizmet veya işletme ara").fill("Saç");
  await button("Ara").click();
  await button("Deneme Salonu hizmetlerini gör").click();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const service of services) {
      const card = button(`${service.name} hizmetini seç`);
      await expect(card).toContainText(service.name);
      const price = new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: "TRY",
      }).format(Number(service.price));
      await expect(card).toContainText(price);
      if (service.durationMinutes)
        await expect(card).toContainText(`${service.durationMinutes} dakika`);
      else await expect(card).not.toContainText("dakika");
      await card.click();
      await expect(card).toHaveAttribute("aria-pressed", "true");
      assert.equal(
        await page.getByRole("button").filter({ hasText: "✓" }).count(),
        1,
      );
      const fits = await card.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return [...node.querySelectorAll("div")].every((child) => {
          const childBox = child.getBoundingClientRect();
          return (
            childBox.left >= box.left - 1 && childBox.right <= box.right + 1
          );
        });
      });
      assert.equal(fits, true, `card child overflow: ${service.id}/${width}`);
    }
    await button("Saç kesimi hizmetini seç").click();
    await expect(button("Özel uygulama hizmetini seç")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await button("Saç kesimi hizmetini seç").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, `service-catalog-${width}-${engine}.png`),
    });
  }
  await page.getByRole("tab", { name: "Hesabım", exact: true }).click();
  await button("İşletme alanına geç").click();
  await button("İşletme ayarları").click();
  await button("Yönetim kayıtlarını yükle").click();
  for (const service of [services[0], services[1], services[2]]) {
    const card = button(`${service.name} · ${service.price} TRY`);
    await card.click();
    await expect(page.getByLabel("Hizmet adı", { exact: true })).toHaveValue(
      service.name,
    );
    await expect(page.getByLabel("Fiyat (ondalık metin)")).toHaveValue(
      service.price,
    );
    await expect(
      button(`${service.name} · ${service.price} TRY ✓`),
    ).toHaveAttribute("aria-pressed", "true");
  }
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await button("Saç kesimi · 2000.00 TRY").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(output, `service-management-${width}-${engine}.png`),
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(writes, []);
  await page.close();
  console.log(
    `${engine}: service prices, durations, selection, narrow/long-name layouts and management selection PASS; all APIs intercepted, no catalog writes or AI calls`,
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
