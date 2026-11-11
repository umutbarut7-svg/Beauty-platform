/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console, URL, document, getComputedStyle, localStorage, sessionStorage, fetch, setTimeout */
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const { chromium, webkit, expect } = require("@playwright/test");
const origin = "http://127.0.0.1:3106";
const apiOrigin = "https://api.example.test";
const accountDeletion = process.env.ORZELL_REVIEW_ACCOUNT_DELETION === "true";
const output = process.argv[2] ?? "/tmp/orzell-admin-entry";
async function review(engine, name) {
  const browser = await engine.launch({
    headless: true,
    ...(name === "chromium" && process.env.ORZELL_ADMIN_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.ORZELL_ADMIN_CHROMIUM_EXECUTABLE }
      : {}),
  });
  try {
    for (const colorScheme of ["light", "dark"]) {
      for (const width of [320, 390, 1024]) {
        const page = await browser.newPage({
          viewport: { width, height: 844 },
          colorScheme,
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const unexpected = [];
        let role = "CUSTOMER",
          expired = false,
          financialReady = false;
        await page.route("**/*", async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (url.origin === origin) return route.continue();
          if (url.origin !== apiOrigin) {
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
          let value,
            status = 200;
          if (url.pathname === "/auth/login") {
            value = {
              accessToken: "synthetic-token",
              refreshToken: "synthetic-refresh",
              user: { id: "synthetic-user", role },
            };
          } else if (
            accountDeletion &&
            url.pathname === "/auth/account-deletion/pending"
          ) {
            assert.equal(request.method(), "GET");
            assert.equal(
              request.headers().authorization,
              "Bearer synthetic-token",
            );
            status = expired ? 401 : 200;
            value = expired
              ? {}
              : {
                  items: [
                    {
                      id: "synthetic-deletion",
                      requestedAt: "2026-11-11T00:00:00Z",
                      processingAt: null,
                      user: {
                        id: "synthetic-account",
                        email: "delete-me@example.test",
                      },
                    },
                  ],
                  nextCursor: null,
                };
          } else if (
            accountDeletion &&
            url.pathname ===
              "/auth/account-deletion/synthetic-deletion/inspection"
          ) {
            assert.equal(request.method(), "GET");
            value = {
              status: "REQUESTED",
              blockers: ["InventoryOperation"],
              pendingPhotos: 1,
            };
          } else if (url.pathname === "/businesses") {
            assert.equal(
              request.headers().authorization,
              "Bearer synthetic-token",
            );
            status = expired ? 401 : 200;
            value = expired
              ? {}
              : [
                  {
                    id: "synthetic-business",
                    name: "Temsilî işletme",
                    isVerified: false,
                  },
                ];
          } else if (url.pathname.endsWith("/financial/summary")) {
            value = financialReady
              ? {
                  status: "AVAILABLE",
                  currency: "TRY",
                  grossRevenueMinor: "900719925474099199",
                  netRevenueMinor: "-1",
                }
              : { status: "INSUFFICIENT_DATA" };
          } else {
            unexpected.push(url.pathname);
            return route.abort();
          }
          return route.fulfill({
            status,
            headers,
            contentType: "application/json",
            body: JSON.stringify(value),
          });
        });
        const response = await page.goto(origin + "/login");
        assert.equal(response.status(), 200);
        await expect(page).toHaveTitle("ORZELL · Yönetim merkezi");
        await expect(
          page.getByRole("img", { name: "ORZELL", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Giriş yap", exact: true }),
        ).toBeVisible();
        const layout = await page.evaluate(() => ({
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
          background: getComputedStyle(document.documentElement)
            .backgroundColor,
        }));
        assert.equal(layout.overflow, false);
        assert.equal(
          layout.background,
          colorScheme === "dark" ? "rgb(11, 9, 15)" : "rgb(246, 241, 233)",
        );
        if (width === 390) {
          const login = async () => {
            await page
              .getByLabel("E-posta", { exact: true })
              .fill("synthetic@example.test");
            await page
              .getByLabel("Parola", { exact: true })
              .fill("Synthetic-password-33");
            await page
              .getByRole("button", { name: "Giriş yap", exact: true })
              .click();
          };
          await login();
          await expect(page.getByRole("main").getByRole("alert")).toContainText(
            "Platform yöneticisi yetkisi gerekiyor",
          );
          await expect(
            page.getByRole("button", {
              name: "İşletmeleri yükle",
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("region", {
              name: "Hesap silme kuyruğu",
              exact: true,
            }),
          ).toHaveCount(0);
          role = "SUPER_ADMIN";
          await login();
          const load = page.getByRole("button", {
            name: "İşletmeleri yükle",
            exact: true,
          });
          await load.click();
          await page
            .getByRole("button", {
              name: "Temsilî işletme · Doğrulama bekliyor",
              exact: true,
            })
            .click();
          await page
            .getByRole("button", { name: "Ledger özetini incele", exact: true })
            .click();
          await expect(
            page.getByText(
              "Finansal ledger kaydı yok. Tahsil edilmiş gelir gösterilemiyor.",
              { exact: true },
            ),
          ).toBeVisible();
          financialReady = true;
          await page
            .getByRole("button", { name: "Ledger özetini incele", exact: true })
            .click();
          await expect(
            page.getByText("₺9.007.199.254.740.991,99", { exact: true }),
          ).toBeVisible();
          await expect(page.getByText("-₺0,01", { exact: true })).toBeVisible();
          if (accountDeletion) {
            await page
              .getByRole("button", {
                name: "Silme taleplerini yükle",
                exact: true,
              })
              .click();
            await page
              .getByRole("button", {
                name: "delete-me@example.test · Talep alındı",
                exact: true,
              })
              .click();
            await expect(
              page.getByText("InventoryOperation", { exact: true }),
            ).toBeVisible();
            await expect(
              page.getByRole("button", {
                name: "Silme işlemini başlat",
                exact: true,
              }),
            ).toBeDisabled();
            expired = true;
            await page
              .getByRole("button", {
                name: "Silme taleplerini yükle",
                exact: true,
              })
              .click();
          } else {
            expired = true;
            await load.click();
          }
          await expect(
            page.getByRole("button", { name: "Giriş yap", exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("heading", { name: "Temsilî işletme", exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("region", {
              name: "Hesap silme kuyruğu",
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            page.getByText("delete-me@example.test · Talep alındı", {
              exact: true,
            }),
          ).toHaveCount(0);
          const storage = await page.evaluate(() => [
            localStorage.length,
            sessionStorage.length,
          ]);
          assert.deepEqual(storage, [0, 0]);
        }
        await page.screenshot({
          path: path.join(output, `${name}-${colorScheme}-${width}.png`),
          fullPage: true,
        });
        assert.deepEqual(unexpected, []);
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
    const page = await browser.newPage();
    assert.equal((await page.goto(origin)).status(), 200);
    await expect(
      page.getByRole("button", { name: "Giriş yap", exact: true }),
    ).toBeVisible();
    await page.close();
  } finally {
    await browser.close();
  }
}
async function main() {
  await mkdir(output, { recursive: true });
  const server = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next", {
        paths: [path.resolve("apps/admin")],
      }),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3106",
    ],
    {
      cwd: path.resolve("apps/admin"),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null)
        throw new Error("Admin server exited before readiness");
      try {
        if ((await fetch(origin)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* bounded startup polling */
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(ready, true, "Admin server readiness");
    await review(chromium, "chromium");
    if (!process.argv.includes("--chromium-only"))
      await review(webkit, "webkit");
    console.log(
      `ADMIN_ENTRY_PASSED (${process.argv.includes("--chromium-only") ? "Chromium only" : "Chromium and WebKit"}): both entry routes, two themes, three widths, role denial, admin session and 401 cleanup; synthetic API only.`,
    );
  } finally {
    server.kill("SIGTERM");
    if (server.exitCode === null)
      await new Promise((resolve) => server.once("exit", resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
