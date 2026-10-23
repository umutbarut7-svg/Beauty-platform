// Offline browser UX test. All account, policy, photo and model responses are synthetic.
const assert = require("node:assert/strict");
const path = require("node:path");
const { main } = require("./check-orzell-preview.cjs");

main(async (browser, origin, output) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [],
    unexpected = [],
    calls = [];
  let available = false,
    attempts = 0,
    uploads = 0,
    withdrawals = 0;
  let delayAnalysis = false,
    heldAnalysis,
    receivedAnalysis;
  const pendingAnalysis = new Promise((resolve) => {
    receivedAnalysis = resolve;
  });
  const plan = {
    status: "PLAN",
    observations: ["Sentetik gözlem"],
    questions: [],
    steps: ["Sentetik plan adımı"],
    searchQuery: "synthetic",
    limitations: ["Yalnızca otomatik test"],
  };
  const session = (status, sessionOutput = null) => ({
    id: "synthetic-session",
    status,
    attempts,
    expiresAt: "2099-01-01T00:00:00Z",
    provider: "SYNTHETIC",
    model: "SYNTHETIC",
    output: sessionOutput,
  });
  const fulfill = (route, body, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    // No network request to this host is sent: fulfill only known fake API routes.
    if (
      url.origin !== "https://preview.13-51-112-228.sslip.io" ||
      !url.pathname.startsWith("/api/")
    ) {
      unexpected.push(url.pathname);
      return route.abort();
    }
    if (request.method() === "OPTIONS") return fulfill(route, {}, 204);
    const endpoint = url.pathname.slice(4);
    calls.push(endpoint);
    if (endpoint === "/auth/login")
      return fulfill(route, {
        accessToken: "synthetic-access",
        refreshToken: "synthetic-refresh",
        user: { id: "synthetic-customer", role: "CUSTOMER" },
      });
    if (endpoint === "/mvp/v1/photos/policy")
      return fulfill(route, {
        available,
        reason: available ? "SYNTHETIC_TEST" : "UNAVAILABLE",
        policy: available
          ? {
              version: "synthetic-only",
              notice: "Sentetik test izin metni; gerçek politika değildir.",
              retentionHours: 24,
            }
          : null,
      });
    if (endpoint === "/mvp/v1/photos/consents" && request.method() === "POST") {
      assert.deepEqual(request.postDataJSON(), {
        policyVersion: "synthetic-only",
        accepted: true,
      });
      return fulfill(route, { id: "synthetic-consent" });
    }
    if (endpoint === "/mvp/v1/photos/upload/synthetic-consent") {
      assert.match(
        request.headers()["content-type"],
        /^multipart\/form-data; boundary=/,
      );
      assert.ok(request.postDataBuffer().includes(Buffer.from("photo.png")));
      uploads++;
      return fulfill(route, { id: "synthetic-photo" });
    }
    if (endpoint === "/mvp/v1/visual/sessions") {
      assert.deepEqual(request.postDataJSON(), {
        photoId: "synthetic-photo",
        intent: "Sentetik bakım isteği",
        target: "Sentetik hedef",
      });
      return fulfill(route, session("CREATED"));
    }
    if (endpoint === "/mvp/v1/visual/sessions/synthetic-session/analyze") {
      if (delayAnalysis) {
        heldAnalysis = route;
        receivedAnalysis();
        return;
      }
      assert.deepEqual(request.postDataJSON(), {
        answers: attempts ? ["Sentetik yanıt"] : [],
        expectedAttempt: attempts,
      });
      attempts++;
      return fulfill(
        route,
        attempts === 1
          ? session("NEEDS_INFORMATION", {
              status: "NEEDS_INFORMATION",
              observations: ["Sentetik gözlem"],
              questions: ["Sentetik ek soru?"],
              steps: [],
              searchQuery: "",
              limitations: [],
            })
          : session("PLAN", plan),
      );
    }
    if (endpoint === "/mvp/v1/visual/sessions/synthetic-session/matches")
      return fulfill(route, {
        provider: "OPENAI_PGVECTOR",
        status: "MATCHED",
        items: [
          {
            businessId: "synthetic-business",
            serviceId: "synthetic-service",
            businessName: "Sentetik Salon",
            serviceName: "Sentetik Hizmet",
            similarity: 0.8,
          },
        ],
      });
    if (endpoint === "/mvp/v1/visual/sessions/synthetic-session")
      return fulfill(route, session("CREATED"));
    if (endpoint === "/mvp/v1/photos/consents/synthetic-consent/withdraw") {
      withdrawals++;
      return fulfill(route, {});
    }
    unexpected.push(endpoint);
    return route.abort();
  });
  const click = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  const visible = (text) => page.getByText(text, { exact: true }).waitFor();
  try {
    await page.goto(origin);
    await page
      .getByRole("textbox", { name: "E-posta", exact: true })
      .fill("synthetic@example.test");
    await page
      .getByLabel("Parola", { exact: true })
      .fill("synthetic-test-password");
    await click("Giriş yap");
    await click("Görsel danışmanlık durumunu yükle");
    await visible(
      "Fotoğraf yükleme ve görsel analiz şu anda kullanılamıyor. Katalogdan hizmet ve randevu seçebilirsiniz.",
    );
    assert.equal(
      await page
        .getByRole("button", {
          name: "İzinle fotoğraf seç ve yükle",
          exact: true,
        })
        .count(),
      0,
    );
    console.log(
      "Unavailable photo policy hides upload: PASS (synthetic browser)",
    );

    available = true;
    await click("Görsel danışmanlık durumunu yükle");
    await page
      .getByLabel("İsteğiniz", { exact: true })
      .fill("Sentetik bakım isteği");
    await page.getByLabel("Hedefiniz", { exact: true }).fill("Sentetik hedef");
    await click("İzinle fotoğraf seç ve yükle");
    await visible("İsteğinizi ve hedefinizi yazıp izin metnini onaylayın.");
    assert.equal(calls.includes("/mvp/v1/photos/consents"), false);
    console.log(
      "Missing explicit consent prevents photo/consent requests: PASS (synthetic browser)",
    );

    await page
      .getByRole("checkbox", {
        name: "Fotoğraf ve AI işlemeye açık izin veriyorum",
      })
      .click();
    const chooser = page.waitForEvent("filechooser");
    await click("İzinle fotoğraf seç ve yükle");
    await (
      await chooser
    ).setFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
        "base64",
      ),
    });
    await visible("Fotoğraf kaydedildi. Analizi başlatabilirsiniz.");
    assert.equal(uploads, 1);
    await click("Görsel analizi başlat");
    await visible("Sentetik ek soru?");
    await page
      .getByLabel("Danışmanlık yanıtı 1", { exact: true })
      .fill("Sentetik yanıt");
    await click("Yanıtlarla analizi sürdür");
    await visible("Önerilen danışmanlık planı");
    await visible("1. Sentetik plan adımı");
    await click("Plana göre profesyonel ara");
    await visible("Sentetik Salon · Sentetik Hizmet");
    await page.screenshot({
      path: path.join(output, "synthetic-photo-plan.png"),
      fullPage: true,
    });
    console.log(
      "File chooser, multipart upload, follow-up answers, PLAN and matches render: PASS (synthetic browser)",
    );

    // Revoke while an analysis response is in flight; the late plan must stay hidden.
    await click("Analiz durumunu yenile");
    delayAnalysis = true;
    await click("Görsel analizi başlat");
    const timeout = setTimeout(() => receivedAnalysis(), 10000);
    await pendingAnalysis;
    clearTimeout(timeout);
    assert.ok(heldAnalysis, "Expected a held synthetic analysis request");
    await click("Fotoğraf iznimi geri çek");
    await visible(
      "İzniniz geri çekildi. Erişim kapatıldı; fotoğrafın fiziksel silinmesi işleniyor.",
    );
    await fulfill(heldAnalysis, session("PLAN", plan));
    await page
      .getByRole("button", {
        name: "Görsel danışmanlık durumunu yükle",
        exact: true,
      })
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      () => !document.querySelector('[role="progressbar"]'),
    );
    assert.equal(
      await page
        .getByText("Önerilen danışmanlık planı", { exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByText("Sentetik Salon · Sentetik Hizmet", { exact: true })
        .count(),
      0,
    );
    assert.equal(withdrawals, 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await page.screenshot({
      path: path.join(output, "synthetic-photo-withdrawn.png"),
      fullPage: true,
    });
    console.log(
      "Withdrawal clears photo results and ignores late analysis: PASS (synthetic browser)",
    );
  } finally {
    await page.close();
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
