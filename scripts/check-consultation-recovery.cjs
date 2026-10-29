/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL */
// All external requests are intercepted. Recovery must never start paid work.
const assert = require("node:assert/strict");
const path = require("node:path");
const { expect, webkit } = require("@playwright/test");
const { main } = require("./orzell-web-server.cjs");

async function journey(browser, origin, output, engine) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const unexpected = [], errors = [], writes = [];
  let listMode = "empty", restoreMode = "plan", releaseRestore;
  const expiry = new Date(Date.now() + 3600000).toISOString();
  const summary = {
    id: "synthetic-session", status: "PLAN", expiresAt: expiry,
    createdAt: new Date().toISOString(), intent: "Saved care",
    target: "Saved target", consentId: "synthetic-consent",
  };
  const plan = {
    id: summary.id, status: "PLAN", attempts: 1, expiresAt: expiry,
    provider: "SYNTHETIC", model: "contract-only",
    output: {
      status: "PLAN", observations: [], questions: [],
      steps: ["Recovered synthetic plan"], limitations: [],
      searchQuery: "Synthetic care",
    },
  };
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
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
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const endpoint = url.pathname.replace(/^\/api/, "");
    if (request.method() === "POST") writes.push(endpoint);
    let value, status = 200;
    if (endpoint === "/auth/login") value = {
      accessToken: "synthetic-token", refreshToken: "synthetic-refresh",
      user: { id: "synthetic-owner", role: "CUSTOMER" },
    };
    else if (endpoint === "/mvp/v1/visual/sessions" && request.method() === "GET") {
      if (listMode === "unauthorized") status = 401;
      value = { items: listMode === "empty" ? [] : [
        summary,
        { ...summary, id: "unavailable-session", intent: "Unavailable care", target: "Unavailable target" },
      ] };
    } else if (endpoint === "/mvp/v1/visual/sessions/unavailable-session") {
      status = 404; value = {};
    } else if (endpoint === "/mvp/v1/visual/sessions/synthetic-session") {
      if (restoreMode === "late") await new Promise(resolve => { releaseRestore = resolve; });
      value = restoreMode === "questions" ? {
        ...plan, status: "NEEDS_INFORMATION",
        output: { ...plan.output, status: "NEEDS_INFORMATION", steps: [], questions: ["Synthetic saved question?"] },
      } : plan;
    } else if (endpoint === "/mvp/v1/capabilities") value = {
      enabled: true, matching: { semanticVectorAvailable: true },
    };
    else if (endpoint === "/mvp/v1/photos/consents/synthetic-consent/withdraw") value = { status: "REVOKED" };
    else {
      unexpected.push(request.method() + " " + endpoint);
      return route.abort();
    }
    return route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(value) });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const savedPlan = page.getByText("1. Recovered synthetic plan", { exact: true });
  async function login() {
    await page.getByLabel("E-posta", { exact: true }).fill("synthetic@example.test");
    await page.getByLabel("Parola", { exact: true }).fill("Synthetic-password-33");
    await button("Giriş yap").click();
    await button("Fotoğraflı danışmanlık").click();
  }
  async function recover() {
    await button("Aktif danışmanlıklarımı yükle").click();
    await button("1. danışmanlığı aç").click();
  }
  await page.goto(origin);
  await login();
  await button("Aktif danışmanlıklarımı yükle").click();
  await expect(page.getByText(
    "Aktif danışmanlığın bulunmuyor. Süresi dolan veya izni geri çekilen danışmanlıklar gösterilmez.",
    { exact: true },
  )).toBeVisible();
  listMode = "available";
  await recover();
  await expect(savedPlan).toBeVisible();
  await expect(page.getByLabel("İsteğiniz", { exact: true })).toHaveValue("Saved care");
  await expect(page.getByLabel("Hedefiniz", { exact: true })).toHaveValue("Saved target");
  await expect(button("Plana göre profesyonel ara")).toBeVisible();
  assert.deepEqual(writes, ["/auth/login"]);
  await page.screenshot({ path: path.join(output, "consultation-recovered-" + engine + ".png"), fullPage: true });

  // A stale list entry is not authority to reopen a withdrawn/expired record.
  await button("2. danışmanlığı aç").click();
  await expect(savedPlan).toBeVisible();
  await expect(page.getByLabel("İsteğiniz", { exact: true })).toHaveValue("Saved care");
  await button("Keşfete dön").click();
  await button("Fotoğraflı danışmanlık").click();
  await expect(savedPlan).toHaveCount(0);
  await recover();
  await expect(savedPlan).toBeVisible();

  // Tokens and plans remain memory-only; recovery after restart uses owner GETs.
  await page.reload();
  await expect(button("Giriş yap")).toBeVisible();
  await expect(savedPlan).toHaveCount(0);
  await login();
  await recover();
  await expect(savedPlan).toBeVisible();
  restoreMode = "questions";
  await button("1. danışmanlığı aç").click();
  await expect(page.getByText("Synthetic saved question?", { exact: true })).toBeVisible();
  await expect(button("Yanıtlarla analizi sürdür")).toBeVisible();
  assert.equal(writes.filter(p => p !== "/auth/login").length, 0);

  restoreMode = "late";
  await button("1. danışmanlığı aç").click();
  await expect.poll(() => typeof releaseRestore).toBe("function");
  await button("Fotoğraf iznimi geri çek").click();
  releaseRestore();
  await expect(page.getByText(
    "İzniniz geri çekildi. Erişim kapatıldı; fotoğrafın fiziksel silinmesi işleniyor.",
    { exact: true },
  )).toBeVisible();
  await expect(savedPlan).toHaveCount(0);
  await expect(page.getByText("Synthetic saved question?", { exact: true })).toHaveCount(0);
  await expect(button("Plana göre profesyonel ara")).toHaveCount(0);
  listMode = "unauthorized";
  await button("Aktif danışmanlıklarımı yükle").click();
  await expect(button("Giriş yap")).toBeVisible();
  await expect(page.getByText("Saved care · Saved target", { exact: true })).toHaveCount(0);
  assert.deepEqual(writes.filter(p => p !== "/auth/login"), ["/mvp/v1/photos/consents/synthetic-consent/withdraw"]);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await page.close();
  console.log(engine + " consultation recovery: PASS (owner reads, reload, stale/401/withdrawal, zero analysis/matching/upload calls)");
}
main(async (browser, origin, output) => {
  await journey(browser, origin, output, "chromium");
  const safari = await webkit.launch({ headless: true });
  try { await journey(safari, origin, output, "webkit"); }
  finally { await safari.close(); }
}).catch(error => { console.error(error); process.exitCode = 1; });
