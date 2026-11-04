/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL */
// Provider traffic is intercepted; no real photo, embedding or vision request.
const assert = require("node:assert/strict");
const path = require("node:path");
const { expect, webkit } = require("@playwright/test");
const { main } = require("./orzell-web-server.cjs");

async function scenario(browser, origin, output, engine, mode) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const writes = [],
    unexpected = [],
    errors = [];
  let release,
    capability = true;
  let saved = {
    status: "READY",
    refreshRevision: "a".repeat(64),
    result: { provider: "OPENAI_PGVECTOR", status: "NO_MATCH", items: [] },
  };
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const plan = {
    id: "refresh-session",
    status: "PLAN",
    attempts: 1,
    expiresAt,
    output: {
      status: "PLAN",
      observations: [],
      questions: [],
      steps: ["Existing haircut plan"],
      searchQuery: "saç kesimi",
      limitations: [],
    },
  };
  const matched = {
    status: "READY",
    result: {
      provider: "OPENAI_PGVECTOR",
      status: "MATCHED",
      items: [
        {
          businessId: "new-salon",
          serviceId: "new-cut",
          businessName: "Current salon",
          serviceName: "Saç kesimi",
          similarity: 0.9,
        },
      ],
    },
  };
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
    let status = 200,
      value;
    if (endpoint === "/auth/login") {
      value = {
        accessToken: "synthetic",
        refreshToken: "synthetic-refresh",
        user: { id: "owner", role: "CUSTOMER" },
      };
    } else if (endpoint === "/mvp/v1/visual/sessions") {
      assert.equal(request.method(), "GET");
      value = {
        items: [
          {
            id: plan.id,
            status: "PLAN",
            expiresAt,
            createdAt: new Date().toISOString(),
            intent: "saç kesimi",
            target: "kolay kesim",
            consentId: "refresh-consent",
          },
        ],
      };
    } else if (endpoint === "/mvp/v1/visual/sessions/refresh-session") {
      assert.equal(request.method(), "GET");
      value = plan;
    } else if (endpoint === "/mvp/v1/visual/sessions/refresh-session/matches") {
      assert.equal(request.method(), "GET");
      value = saved;
    } else if (
      endpoint === "/mvp/v1/visual/sessions/refresh-session/matches/refresh"
    ) {
      assert.equal(request.method(), "POST");
      const body = request.postDataJSON();
      assert.equal(body.expectedRevision, "a".repeat(64));
      assert.match(body.requestId, /^[A-Za-z0-9_-]{16,100}$/);
      if (mode === "failure") {
        status = 503;
        saved = { ...saved, status: "FAILED", refreshRevision: "b".repeat(64) };
        value = { message: "Synthetic refresh failure" };
      } else if (mode === "stale") {
        status = 409;
        saved = matched;
        value = { message: "VISUAL_MATCH_CHANGED" };
      } else {
        await new Promise((resolve) => {
          release = resolve;
        });
        saved = matched;
        value = matched;
      }
    } else if (endpoint === "/mvp/v1/capabilities") {
      value = {
        enabled: true,
        matching: { semanticVectorAvailable: capability },
      };
    } else if (
      endpoint === "/mvp/v1/photos/consents/refresh-consent/withdraw"
    ) {
      value = { status: "REVOKED" };
    } else {
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
  const refresh = button("Yeni hizmetlerle tekrar ara");
  const refreshCalls = () =>
    writes.filter((p) => p.endsWith("/matches/refresh")).length;
  const existingPlan = page.getByText("1. Existing haircut plan", {
    exact: true,
  });
  await page.goto(origin);
  await page
    .getByLabel("E-posta", { exact: true })
    .fill("synthetic@example.test");
  await page
    .getByLabel("Parola", { exact: true })
    .fill("Synthetic-password-33");
  await button("Giriş yap").click();
  await button("Fotoğraflı danışmanlık").click();
  await button("Aktif danışmanlıklarımı yükle").click();
  await button("1. danışmanlığı aç").click();
  await expect(refresh).toBeVisible();
  await expect(existingPlan).toBeVisible();
  assert.deepEqual(writes, ["/auth/login"]);
  if (mode === "closed") capability = false;
  if (mode === "success") {
    await refresh.evaluate((element) => {
      element.click();
      element.click();
    });
  } else await refresh.click();
  if (["success", "withdrawal"].includes(mode)) {
    await expect.poll(refreshCalls).toBe(1);
    await expect.poll(() => typeof release).toBe("function");
    await expect(existingPlan).toBeVisible();
    if (mode === "withdrawal") await button("Fotoğraf iznimi geri çek").click();
    release();
  }
  if (["success", "stale"].includes(mode)) {
    await expect(
      page.getByText("Current salon · Saç kesimi", { exact: true }),
    ).toBeVisible();
    await expect(existingPlan).toBeVisible();
    await expect(refresh).toHaveCount(0);
    await button("Analiz durumunu yenile").click();
    await expect(
      page.getByText("Current salon · Saç kesimi", { exact: true }),
    ).toBeVisible();
  } else if (mode === "failure") {
    await expect(refresh).toBeEnabled();
    await expect(existingPlan).toBeVisible();
    await expect(
      page.getByText("Uygun, güncel arama kaydı bulunamadı.", { exact: true }),
    ).toBeVisible();
  } else if (mode === "closed") {
    await expect(refresh).toHaveCount(0);
    await expect(existingPlan).toBeVisible();
  } else {
    await expect(
      page.getByText(
        "İzniniz geri çekildi. Erişim kapatıldı; fotoğrafın fiziksel silinmesi işleniyor.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(existingPlan).toHaveCount(0);
    await expect(
      page.getByText("Current salon · Saç kesimi", { exact: true }),
    ).toHaveCount(0);
  }
  assert.equal(refreshCalls(), mode === "closed" ? 0 : 1);
  assert(
    writes.every(
      (p) =>
        p === "/auth/login" ||
        p.endsWith("/matches/refresh") ||
        p.endsWith("/withdraw"),
    ),
  );
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: path.join(output, `matching-refresh-${engine}-${mode}.png`),
    fullPage: true,
  });
  await page.close();
}
main(async (browser, origin, output) => {
  for (const mode of ["success", "failure", "stale", "closed", "withdrawal"])
    await scenario(browser, origin, output, "chromium", mode);
  const safari = await webkit.launch({ headless: true });
  try {
    for (const mode of ["success", "failure", "stale", "closed", "withdrawal"])
      await scenario(safari, origin, output, "webkit", mode);
  } finally {
    await safari.close();
  }
  console.log(
    "Explicit same-plan refresh: PASS (both engines, no new photo/analysis, no automatic provider retries)",
  );
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
