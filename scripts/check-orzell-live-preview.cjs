/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, URL */
// Only the fixed owner-authorized preview; all fixtures are visibly synthetic.
const { chromium, expect } = require("@playwright/test");
const { randomBytes } = require("node:crypto");
const assert = require("node:assert/strict");
const origin = "https://preview.13-51-112-228.sslip.io";
const suffix = randomBytes(8).toString("hex");
const email = `orzell-qa-${suffix}@example.test`;
const password = randomBytes(30).toString("base64url");
const name = `ORZELL Synthetic QA ${suffix}`;
const refreshTokens = [];
let token,
  businessId,
  browser,
  step = "start",
  primaryFailure = false;
async function call(path, method = "GET", body, auth = token) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Preview API status " + response.status);
  return response.status === 204 ? null : response.json();
}
async function main() {
  try {
    step = "create synthetic account";
    const session = await call(
      "/auth/register",
      "POST",
      { email, password },
      null,
    );
    token = session.accessToken;
    refreshTokens.push(session.refreshToken);
    step = "configure private synthetic business";
    const business = await call("/businesses", "POST", {
      name,
      timezone: "UTC",
    });
    businessId = business.id;
    assert.equal(business.isPublic, false);
    const root = `/businesses/${businessId}`;
    await call(root + "/settings", "PATCH", {
      bookingEnabled: true,
      onlinePaymentEnabled: false,
      cancellationEnabled: true,
      cancellationWindowMinutes: 0,
    });
    const location = await call(root + "/locations", "POST", {
      name: "Synthetic QA location",
      address: "Synthetic QA address",
      city: "Test City",
    });
    const staff = await call(root + "/staff", "POST", {
      firstName: "Synthetic",
      lastName: "QA",
      displayName: "Synthetic QA professional",
      locationIds: [location.id],
    });
    const category = await call(root + "/service-categories", "POST", {
      name: "Synthetic QA category",
    });
    const service = await call(root + "/services", "POST", {
      categoryId: category.id,
      name: "Synthetic QA service",
      durationMinutes: 30,
      price: "10.00",
      currency: "TRY",
    });
    await call(root + `/staff/${staff.id}/services/${service.id}`, "POST", {});
    const days = [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ];
    await call(root + "/working-hours", "PUT", {
      hours: days.map((dayOfWeek) => ({
        dayOfWeek,
        isOpen: true,
        openTime: "09:00",
        closeTime: "18:00",
      })),
    });
    await call(root + `/staff/${staff.id}/working-hours`, "PUT", {
      hours: days.map((dayOfWeek) => ({
        dayOfWeek,
        isActive: true,
        startTime: "09:00",
        endTime: "18:00",
      })),
    });
    await call(root, "PATCH", { isPublic: true });
    step = "launch browser";
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      timezoneId: "Europe/Istanbul",
    });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const click = (label) =>
      page.getByRole("button", { name: label, exact: true }).click();
    const tab = (label) =>
      page.getByRole("tab", { name: label, exact: true }).click();
    step = "ORZELL title and sign-in";
    await page.goto(origin);
    await expect(page).toHaveTitle("ORZELL");
    await page.getByLabel("E-posta", { exact: true }).fill(email);
    await page.getByLabel("Parola", { exact: true }).fill(password);
    const login = page.waitForResponse(
      (r) => r.url().endsWith("/auth/login") && r.request().method() === "POST",
    );
    await click("Giriş yap");
    const loginResult = await login;
    assert.equal(loginResult.status(), 200);
    refreshTokens.push((await loginResult.json()).refreshToken);
    await expect(
      page.getByRole("tab", { name: "Keşfet", exact: true }),
    ).toBeVisible();
    console.log("Live ORZELL authentication: PASS");
    step = "live catalogue discovery";
    await page
      .getByLabel("Hizmet veya işletme ara", { exact: true })
      .fill(name);
    await click("Ara");
    await click(name + " hizmetlerini gör");
    await click("Synthetic QA service hizmetini seç");
    await click("Synthetic QA professional");
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await page
      .getByLabel("Başka tarih (YYYY-MM-DD)", { exact: true })
      .fill(date);
    await click("Müsait saatleri bul");
    await page
      .getByRole("button", { name: /^Saat seç:/ })
      .first()
      .click();
    await expect(
      page.getByText("Randevun hazır", { exact: true }),
    ).toBeVisible();
    assert.equal((await call(root + "/appointments")).length, 0);
    step = "explicit owner personal booking";
    const booked = page.waitForResponse(
      (r) =>
        r.url().endsWith(root + "/appointments") &&
        r.request().method() === "POST",
    );
    await click("Randevuyu onayla");
    assert.equal((await booked).status(), 201);
    await expect(
      page.getByRole("button", { name: /Synthetic QA service.*Onay bekliyor/ }),
    ).toBeVisible();
    console.log("Live owner personal booking and explicit confirmation: PASS");
    step = "explicit cancellation";
    await click("Randevuyu iptal et");
    assert.equal((await call(root + "/appointments"))[0].status, "PENDING");
    await click("İptali onayla");
    await expect(page.getByRole("alert")).toHaveText(
      "Randevunuz iptal edildi.",
    );
    assert.equal((await call(root + "/appointments"))[0].status, "CANCELLED");
    console.log("Live explicit cancellation and persisted status: PASS");
    step = "business navigation and logout";
    await tab("Hesabım");
    await click("İşletme alanına geç");
    await expect(
      page.getByRole("button", { name: name + " · Seçili ✓", exact: true }),
    ).toBeVisible();
    await tab("Randevular");
    await expect(
      page.getByRole("button", { name: /Synthetic QA service.*İptal edildi/ }),
    ).toBeVisible();
    await tab("Hesabım");
    await click("Çıkış yap");
    await expect(page.getByLabel("Parola", { exact: true })).toHaveValue("");
    assert.deepEqual(errors, []);
    console.log(
      "Live customer/business navigation, logout and runtime errors: PASS",
    );
  } catch (_) {
    primaryFailure = true;
    console.error("Live acceptance failed at fixed step: " + step);
  } finally {
    let cleanupFailed = false;
    if (browser)
      await browser.close().catch(() => {
        cleanupFailed = true;
      });
    if (businessId && token) {
      const root = `/businesses/${businessId}`;
      try {
        for (const booking of await call(root + "/appointments"))
          if (!["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status))
            await call(root + `/appointments/${booking.id}/status`, "PATCH", {
              status: "CANCELLED",
            });
        await call(root, "PATCH", { isPublic: false, status: "INACTIVE" });
        const value = await call(root);
        assert.equal(value.isPublic, false);
        assert.equal(value.status, "INACTIVE");
      } catch (_) {
        cleanupFailed = true;
      }
    }
    for (const refreshToken of refreshTokens.filter(Boolean))
      try {
        await call("/auth/logout", "POST", { refreshToken }, null);
      } catch (_) {
        cleanupFailed = true;
      }
    if (cleanupFailed)
      console.error(
        "Synthetic cleanup requires review; no real business was touched",
      );
    else
      console.log(
        "Synthetic business private/inactive, appointments cancelled, sessions revoked: PASS",
      );
    if (primaryFailure || cleanupFailed) process.exitCode = 1;
  }
}
main().catch(() => {
  console.error("Acceptance stopped without exposing response or credentials");
  process.exitCode = 1;
});
