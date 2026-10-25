/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, document, innerWidth */
// Synthetic UI contract tests. Every non-local request is intercepted or aborted.
const assert = require("node:assert/strict");
const path = require("node:path");
const { expect } = require("@playwright/test");
const { main } = require("./orzell-web-server.cjs");

main(async (browser, origin, output) => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Istanbul",
  });
  const errors = [],
    unexpected = [],
    calls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let bookings = [],
    deny = false,
    availabilityMode = "slots",
    deletionRequested = false;
  const startsAt =
    new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10) +
    "T10:00:00.000Z";
  const business = {
    id: "business-1",
    name: "Deneme Salonu",
    isVerified: false,
  };
  const service = {
    id: "service-1",
    name: "Saç bakımı",
    price: "250.75",
    currency: "TRY",
    durationMinutes: 45,
  };
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
    const endpoint = url.pathname.replace(/^\/api/, "");
    calls.push({
      endpoint,
      method: request.method(),
      body: request.postDataJSON(),
    });
    let value,
      status = 200;
    if (endpoint === "/auth/login" || endpoint === "/auth/register")
      value = {
        accessToken: "synthetic-token",
        refreshToken: "synthetic-refresh",
        user: { id: "user-1", role: "CUSTOMER" },
      };
    else if (endpoint === "/auth/account-deletion") {
      if (request.method() === "POST") {
        if (request.postDataJSON().password === "wrong-deletion-password")
          return route.fulfill({
            status: 403,
            headers,
            contentType: "application/json",
            body: JSON.stringify({ message: "Invalid password" }),
          });
        assert.deepEqual(request.postDataJSON(), {
          password: "deletion-password",
          confirmation: "HESABIMI SIL",
        });
        deletionRequested = true;
        status = 202;
      }
      value = {
        status: deletionRequested ? "REQUESTED" : "NONE",
        request: deletionRequested
          ? { id: "request-1", requestedAt: "2026-10-25T00:00:00Z" }
          : null,
        deletionCompleted: false,
      };
    } else if (endpoint === "/auth/logout") value = { ok: true };
    else if (endpoint === "/discovery/search")
      value = {
        items:
          url.searchParams.get("query") === "none"
            ? []
            : [
                {
                  businessId: business.id,
                  name: business.name,
                  city: "İstanbul",
                  verified: false,
                },
              ],
      };
    else if (endpoint === "/mvp/v1/catalog/business-1")
      value = {
        ...business,
        services: [service],
        locations: [
          { id: "location-1", name: "Merkez" },
          { id: "location-2", name: "Merkez" },
        ],
        staff: [
          {
            id: "staff-1",
            displayName: "Deneme Uzmanı",
            locations: [{ locationId: "location-2" }],
            services: [{ serviceId: service.id }],
          },
        ],
      };
    else if (endpoint === "/businesses/business-1/availability") {
      assert.equal(url.searchParams.get("locationId"), "location-2");
      if (availabilityMode === "error") {
        status = 404;
        value = {
          message: "Active staff member is not assigned to this location",
        };
      } else
        value =
          availabilityMode === "empty"
            ? []
            : [{ startsAt, staffId: "staff-1" }];
    } else if (
      endpoint === "/businesses/business-1/appointments" &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON();
      assert.deepEqual(
        Object.keys(body).sort(),
        [
          "bookForSelf",
          "locationId",
          "serviceId",
          "staffMemberId",
          "startsAt",
        ].sort(),
      );
      assert.equal(body.bookForSelf, true);
      assert.equal(body.locationId, "location-2");
      assert.equal(body.staffMemberId, "staff-1");
      assert.equal(body.serviceId, service.id);
      value = {
        id: "booking-1",
        businessId: business.id,
        service,
        price: service.price,
        currency: service.currency,
        startsAt,
        status: "PENDING",
      };
      bookings = [value];
    } else if (endpoint === "/mvp/v1/bookings") value = { items: bookings };
    else if (endpoint.endsWith("/result")) value = { result: null };
    else if (endpoint.endsWith("/cancel")) {
      bookings = bookings.map((b) => ({ ...b, status: "CANCELLED" }));
      value = bookings[0];
    } else if (endpoint === "/mvp/v1/passport") value = { items: [] };
    else if (endpoint === "/businesses") {
      value = [business];
      if (deny) {
        status = 403;
        value = { message: "Forbidden" };
      }
    } else if (endpoint === "/businesses/business-1/appointments")
      value = bookings;
    else if (endpoint.endsWith("/financial/summary"))
      value = {
        status: "AVAILABLE",
        currency: "TRY",
        grossRevenueMinor: "25075",
        netRevenueMinor: "20000",
      };
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
  const click = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  const tab = (name) => page.getByRole("tab", { name, exact: true }).click();
  const shot = async (name) => {
    await page.screenshot({ path: path.join(output, name + ".png") });
  };
  await page.goto(origin);
  await click("Giriş yap");
  await expect(page.getByRole("alert")).toHaveText(
    "Geçerli bir e-posta adresi girin.",
  );
  assert.equal(calls.length, 0);
  await click("Hesap oluştur ekranı");
  await page.getByLabel("E-posta", { exact: true }).fill(" TEST@example.test ");
  await page.getByLabel("Parola", { exact: true }).fill("short");
  await click("Hesap oluştur");
  await expect(page.getByRole("alert")).toContainText("en az 12");
  assert.equal(calls.length, 0);
  await page
    .getByLabel("Parola", { exact: true })
    .fill("Synthetic-password-33");
  await click("Hesap oluştur");
  await expect(
    page.getByRole("tab", { name: "Keşfet", exact: true }),
  ).toBeVisible();
  assert.equal(calls[0].body.email, "test@example.test");
  await shot("home");
  const search = page.getByLabel("Hizmet veya işletme ara", { exact: true });
  await search.fill("none");
  await click("Ara");
  await expect(
    page.getByText("Henüz sonuç bulamadık", { exact: true }),
  ).toBeVisible();
  await search.fill("Saç");
  await click("Ara");
  await click("Deneme Salonu hizmetlerini gör");
  await click("Saç bakımı hizmetini seç");
  await click("Merkez · tion-1");
  await expect(
    page.getByText(
      /Bu şubede seçtiğin hizmet için rezervasyona açık profesyonel yok/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Deneme Uzmanı", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Müsait saatleri bul", exact: true }),
  ).toHaveCount(0);
  await click("Merkez · tion-2");
  await click("Deneme Uzmanı");
  await click("Merkez · tion-1");
  await click("Merkez · tion-2");
  await expect(
    page.getByRole("button", { name: "Deneme Uzmanı ✓", exact: true }),
  ).toHaveCount(0);
  await click("Deneme Uzmanı");
  const dateInput = page.getByLabel("Başka tarih (YYYY-MM-DD)", {
    exact: true,
  });
  const availabilityCalls = () =>
    calls.filter((c) => c.endpoint.endsWith("/availability")).length;
  const beforeDates = availabilityCalls();
  for (const [value, message] of [
    ["2099-02-31", "Geçerli bir takvim tarihi girin."],
    ["2000-01-01", "Bugün veya ileri bir tarih seçin."],
  ]) {
    await dateInput.fill(value);
    await click("Müsait saatleri bul");
    await expect(page.getByRole("alert")).toHaveText(message);
    assert.equal(availabilityCalls(), beforeDates);
  }
  await page
    .getByLabel("Başka tarih (YYYY-MM-DD)", { exact: true })
    .fill(startsAt.slice(0, 10));
  availabilityMode = "error";
  await click("Müsait saatleri bul");
  await expect(
    page.getByText(
      "Seçilen şube, hizmet ve profesyonel birlikte rezervasyona açık değil. Başka bir şube veya profesyonel seçebilirsin.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Saat seç:/ })).toHaveCount(0);
  availabilityMode = "empty";
  await click("Müsait saatleri bul");
  await expect(
    page.getByText(
      "Bu tarih için müsait saat bulunamadı. Başka bir gün veya şube seçebilirsin.",
      { exact: true },
    ),
  ).toBeVisible();
  availabilityMode = "slots";
  await click("Müsait saatleri bul");
  await page.getByRole("button", { name: /^Saat seç:/ }).click();
  await expect(page.getByText("Randevun hazır", { exact: true })).toBeVisible();
  assert.equal(
    calls.filter(
      (c) => c.endpoint.endsWith("/appointments") && c.method === "POST",
    ).length,
    0,
  );
  await page
    .getByRole("button", { name: "Randevuyu onayla", exact: true })
    .scrollIntoViewIfNeeded();
  await shot("booking-review");
  await click("Randevuyu onayla");
  await expect(
    page.getByRole("button", { name: /Saç bakımı.*Onay bekliyor/ }),
  ).toBeVisible();
  assert.equal(
    calls.filter(
      (c) => c.endpoint.endsWith("/appointments") && c.method === "POST",
    ).length,
    1,
  );
  await shot("bookings");
  await click("Randevuyu iptal et");
  assert.equal(calls.filter((c) => c.endpoint.endsWith("/cancel")).length, 0);
  await click("Vazgeç");
  await click("Randevuyu iptal et");
  await click("İptali onayla");
  await expect(page.getByRole("alert")).toHaveText("Randevunuz iptal edildi.");
  await expect(
    page.getByRole("button", { name: "Randevuyu iptal et", exact: true }),
  ).toHaveCount(0);
  await tab("Bakımım");
  await expect(
    page.getByText("Hikâyen burada birikecek", { exact: true }),
  ).toBeVisible();
  await tab("Hesabım");
  await click("İşletme alanına geç");
  await expect(
    page.getByRole("button", { name: "Deneme Salonu · Seçili ✓", exact: true }),
  ).toBeVisible();
  await shot("business");
  await tab("Özet");
  await expect(page.getByText("₺250,75", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Net gelir · ₺200,00", { exact: true }),
  ).toBeVisible();
  await shot("business-summary");
  await tab("Randevular");
  await page.getByRole("button", { name: /Saç bakımı.*İptal edildi/ }).click();
  await expect(
    page.getByRole("button", { name: "İşlemi başlat", exact: true }),
  ).toHaveCount(0);
  await tab("İşletmem");
  await click("İşletme ayarları");
  await expect(page.getByText("Profil", { exact: true })).toBeVisible();
  await click("İşletmeme dön");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `overflow ${width}`,
    );
    await expect(
      page.getByRole("tab", { name: "Hesabım", exact: true }),
    ).toBeInViewport();
    await shot(`business-${width}`);
  }
  await tab("Hesabım");
  await click("Hesap silme talebi oluştur");
  await page
    .getByLabel("Hesap silme parolası", { exact: true })
    .fill("deletion-password");
  await page.getByLabel("Hesap silme onayı", { exact: true }).fill("WRONG");
  await expect(
    page.getByRole("button", {
      name: "Hesap silme talebini onayla",
      exact: true,
    }),
  ).toBeDisabled();
  await click("Silme talebinden vazgeç");
  assert.equal(deletionRequested, false);
  await click("Hesap silme talebi oluştur");
  await expect(
    page.getByLabel("Hesap silme parolası", { exact: true }),
  ).toHaveValue("");
  await page
    .getByLabel("Hesap silme parolası", { exact: true })
    .fill("deletion-password");
  await page
    .getByLabel("Hesap silme onayı", { exact: true })
    .fill("HESABIMI SIL");
  await page
    .getByLabel("Hesap silme parolası", { exact: true })
    .fill("wrong-deletion-password");
  await click("Hesap silme talebini onayla");
  await expect(
    page.getByText(
      "Parolan doğrulanamadı. Parolanı yeniden gir; hesabın silinmedi.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Hesap silme parolası", { exact: true }),
  ).toHaveValue("");
  assert.equal(deletionRequested, false);
  await page
    .getByLabel("Hesap silme parolası", { exact: true })
    .fill("deletion-password");
  await click("Hesap silme talebini onayla");
  await expect(
    page.getByText(
      "Silme talebin alındı. Hesabın ve verilerin henüz silinmedi.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Hesap silme parolası", { exact: true }),
  ).toHaveCount(0);
  await click("Silme talebinin durumunu yenile");
  await page.getByRole("tab", { name: "İşletmem", exact: true }).click();
  deny = true;
  await click("İşletmelerimi yenile");
  await expect(page.getByRole("alert")).toHaveText(
    "Bu işlem için yetkiniz yok.",
  );
  await tab("Hesabım");
  await click("Çıkış yap");
  await expect(page.getByLabel("Parola", { exact: true })).toHaveValue("");
  await expect(page.getByRole("tab")).toHaveCount(0);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await page.close();
  console.log(
    "Synthetic application journey: PASS (registration, discovery, explicit booking/cancellation, tabs, business summary, terminal status, authorization, logout)",
  );
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
