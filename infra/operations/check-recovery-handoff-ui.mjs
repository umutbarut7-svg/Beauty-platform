import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline";

const root = path.dirname(fileURLToPath(import.meta.url));
const python = process.env.HANDOFF_PYTHON || "python3";
const modulePath = process.env.HANDOFF_PLAYWRIGHT_MODULE;
assert(
  modulePath && path.isAbsolute(modulePath),
  "Explicit local Playwright module required",
);
const playwright = await import(pathToFileURL(modulePath).href);
const output =
  process.env.HANDOFF_UI_OUTPUT ||
  mkdtempSync(path.join(tmpdir(), "synthetic-handoff-ui-"));
mkdirSync(output, { recursive: true });
const reviewPath = path.join(output, "review.html");
const syntheticPath = path.join(output, "synthetic.html");
for (const [flag, destination] of [
  ["--build-preview", reviewPath],
  ["--build-synthetic-fixture-preview", syntheticPath],
]) {
  execFileSync(
    python,
    [path.join(root, "build-recovery-handoff-ui.py"), flag, destination],
    { stdio: "pipe" },
  );
}
const pages = {
  "/review": readFileSync(reviewPath),
  "/synthetic": readFileSync(syntheticPath),
};
const server = createServer((request, response) => {
  const body = pages[new URL(request.url, "http://localhost").pathname];
  if (request.method !== "GET" || !body) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const fixture = spawn(
  python,
  [path.join(root, "synthetic-handoff-ui-fixture.py")],
  {
    env: { ...process.env, ORZELL_SYNTHETIC_HANDOFF_UI: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const pending = [];
let fixtureFailure = "";
fixture.stderr.on("data", (chunk) => {
  fixtureFailure += chunk.toString().slice(0, 2000);
});
readline.createInterface({ input: fixture.stdout }).on("line", (line) => {
  const next = pending.shift();
  if (next) {
    try {
      next.resolve(JSON.parse(line));
    } catch {
      next.reject(new Error("Invalid generated fixture response"));
    }
  }
});
fixture.on("exit", (code) => {
  for (const next of pending.splice(0))
    next.reject(
      new Error(
        `Generated fixture exited ${code}: ${fixtureFailure.slice(0, 1000)}`,
      ),
    );
});
const rpc = (request) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Generated fixture deadline")),
      20000,
    );
    pending.push({
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    fixture.stdin.write(JSON.stringify(request) + "\n");
  });
const engines = (process.env.HANDOFF_BROWSERS || "chromium").split(",");
const evidence = [];
let activeBrowser;
try {
  for (const engine of engines) {
    assert(["chromium", "webkit"].includes(engine), "Unsupported browser");
    const options = { headless: true };
    if (engine === "chromium" && process.env.HANDOFF_CHROMIUM_EXECUTABLE)
      options.executablePath = process.env.HANDOFF_CHROMIUM_EXECUTABLE;
    const browser = (activeBrowser = await playwright[engine].launch(options));
    const cases = [];
    async function pageAt(mode, extra = {}) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        acceptDownloads: true,
        colorScheme: "dark",
        ...extra,
      });
      const external = [];
      const errors = [];
      await context.route("**/*", async (route) => {
        if (
          !route
            .request()
            .url()
            .startsWith(origin + "/")
        ) {
          external.push(route.request().url());
          await route.abort();
        } else await route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.__privateReads = 0;
        window.__privateReadFinished = false;
        window.__revocations = 0;
        window.__violations = [];
        document.addEventListener("securitypolicyviolation", (e) =>
          window.__violations.push(e.violatedDirective),
        );
        const original = File.prototype.arrayBuffer;
        File.prototype.arrayBuffer = async function () {
          if (this.name === "synthetic-key.pem") {
            window.__privateReads += 1;
            if (window.__holdPrivateRead)
              await new Promise((resolve) => {
                window.__releasePrivateRead = resolve;
              });
          }
          const result = await original.call(this);
          if (this.name === "synthetic-key.pem")
            window.__privateReadFinished = true;
          return result;
        };
        const revoke = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = (url) => {
          window.__revocations += 1;
          revoke(url);
        };
      });
      await page.goto(origin + "/" + mode + "?enable-real=1", {
        waitUntil: "load",
      });
      return { page, context, external, errors };
    }
    const status = (page, text) =>
      page.waitForFunction(
        (value) =>
          document.getElementById("status").textContent.includes(value),
        text,
      );
    async function review(page, value, pin = value.pin) {
      await page.locator("#challenge").setInputFiles({
        name: "synthetic-challenge.json",
        mimeType: "application/json",
        buffer: Buffer.from(value.challenge, "base64"),
      });
      await page.locator("#pin").fill(pin);
      await page.locator("#review").click();
    }
    async function ready(page, value) {
      await review(page, value);
      await status(page, "Yapay oturum doğrulandı");
      await page.locator("#synthetic-confirm").check();
      assert.equal(await page.locator("#key-file").isDisabled(), false);
      await page.locator("#key-file").setInputFiles({
        name: "synthetic-key.pem",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(value.key, "base64"),
      });
      await page.locator("#password").fill(value.password);
    }
    async function finish(test) {
      assert.equal(test.external.length, 0, "Unexpected outbound request");
      assert.equal(
        test.errors.length,
        0,
        `Unexpected page error: ${test.errors.join("; ")}`,
      );
      assert.equal(
        await test.page.evaluate(
          () => localStorage.length + sessionStorage.length,
        ),
        0,
      );
      await test.context.close();
    }
    {
      const value = await rpc({ action: "new" });
      const test = await pageAt("review");
      await review(test.page, value);
      await status(test.page, "Ekran inceleme modu");
      assert.equal(await test.page.locator("#key-file").isDisabled(), true);
      await test.page.evaluate(() =>
        document.getElementById("encrypt").click(),
      );
      assert.equal(await test.page.evaluate(() => window.__privateReads), 0);
      await finish(test);
      cases.push("review_default_and_url_cannot_enable_intake");
    }
    {
      const value = await rpc({ action: "new" });
      const test = await pageAt("synthetic");
      await review(test.page, value, "0".repeat(64));
      await status(test.page, "eşleşmiyor");
      assert.equal(await test.page.locator("#key-file").isDisabled(), true);
      const live = await rpc({ action: "new-live-metadata" });
      await review(test.page, live);
      await status(test.page, "yalnız yapay");
      assert.equal(await test.page.evaluate(() => window.__privateReads), 0);
      await finish(test);
      cases.push("bad_pin_and_live_context_rejected_before_private_read");
    }
    {
      const value = await rpc({ action: "new" });
      const test = await pageAt("synthetic");
      await ready(test.page, value);
      await test.page.locator("#encrypt").click();
      await status(test.page, "Şifreli deneme paketi hazır");
      const downloadEvent = test.page.waitForEvent("download");
      await test.page.locator("#download").click();
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), "orzell-deneme-kapsulu.json");
      const stream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      assert.equal(bytes.includes(Buffer.from("PRIVATE KEY")), false);
      assert.equal(bytes.includes(Buffer.from(value.password)), false);
      const result = await rpc({
        action: "unwrap",
        id: value.id,
        envelope: bytes.toString("base64"),
      });
      assert.deepEqual(result, {
        ok: true,
        descriptorsClosed: true,
        productionDataRead: false,
      });
      assert.equal(await test.page.locator("#password").inputValue(), "");
      assert.equal(
        await test.page.evaluate(
          () => document.getElementById("key-file").files.length,
        ),
        0,
      );
      await test.page.screenshot({
        path: path.join(output, engine + "-synthetic-result.png"),
        fullPage: true,
      });
      await finish(test);
      cases.push(
        "real_browser_encrypted_download_matches_bounded_python_receiver",
      );
    }
    {
      const value = await rpc({ action: "new" });
      const test = await pageAt("synthetic");
      await ready(test.page, value);
      await test.page.evaluate(() => {
        window.__holdPrivateRead = true;
      });
      await test.page.locator("#encrypt").click();
      await test.page.waitForFunction(
        () =>
          window.__privateReads === 1 &&
          typeof window.__releasePrivateRead === "function",
      );
      await test.page.locator("#reset").click();
      await test.page.evaluate(() => window.__releasePrivateRead());
      await test.page.waitForFunction(() => window.__privateReadFinished);
      await test.page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.equal(await test.page.locator("#result").isVisible(), false);
      assert.equal(await test.page.locator("#key-file").isDisabled(), true);
      assert.equal(await test.page.locator("#password").inputValue(), "");
      await status(test.page, "temizlendi");
      await finish(test);
      cases.push("reset_cancels_late_private_read_without_stale_output");
    }
    {
      const value = await rpc({ action: "new" });
      const test = await pageAt("synthetic");
      await ready(test.page, value);
      await test.page.locator("#encrypt").click();
      await status(test.page, "Şifreli deneme paketi hazır");
      await test.page.evaluate(() => {
        const actual = Date.now.bind(Date);
        Date.now = () => actual() + 20 * 60 * 1000;
      });
      await status(test.page, "süresi doldu");
      assert.equal(await test.page.locator("#result").isVisible(), false);
      assert.equal(
        await test.page.evaluate(() => window.__revocations > 0),
        true,
      );
      assert.equal(await test.page.locator("#password").inputValue(), "");
      await finish(test);
      cases.push("expiry_revokes_download_and_clears_private_controls");
    }
    {
      const value = await rpc({ action: "new" });
      const test = await pageAt("synthetic");
      await ready(test.page, value);
      await test.page.locator("#pin").fill("f".repeat(64));
      assert.equal(await test.page.locator("#key-file").isDisabled(), true);
      assert.equal(
        await test.page.evaluate(
          () => document.getElementById("key-file").files.length,
        ),
        0,
      );
      assert.equal(await test.page.locator("#password").inputValue(), "");
      assert.equal(await test.page.evaluate(() => window.__privateReads), 0);
      await finish(test);
      cases.push("public_context_edit_invalidates_private_selection");
    }
    {
      const test = await pageAt("synthetic");
      const blocked = await test.page.evaluate(async () => {
        try {
          await fetch("https://example.invalid/never-send");
          return false;
        } catch {
          return true;
        }
      });
      assert.equal(blocked, true);
      await test.page.waitForFunction(() =>
        window.__violations.some((value) => value.startsWith("connect-src")),
      );
      assert.equal(test.external.length, 0);
      await finish(test);
      cases.push("csp_blocks_connections_and_storage_stays_empty");
    }
    {
      for (const colorScheme of ["dark", "light"]) {
        const test = await pageAt("review", { colorScheme });
        for (const width of [320, 390, 1024]) {
          await test.page.setViewportSize({ width, height: 844 });
          assert.equal(
            await test.page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            "Horizontal page overflow",
          );
          assert.equal(
            await test.page
              .locator("#pin")
              .evaluate(
                (el) => parseFloat(getComputedStyle(el).fontSize) >= 16,
              ),
            true,
          );
          if (width === 390)
            await test.page.screenshot({
              path: path.join(output, `${engine}-${colorScheme}-390.png`),
              fullPage: true,
            });
        }
        await finish(test);
      }
      cases.push("dark_light_and_320_390_1024_layouts");
    }
    evidence.push({ engine, cases, caseCount: cases.length });
    await browser.close();
    activeBrowser = null;
  }
  const report = {
    status: "SYNTHETIC_HANDOFF_UI_PASSED",
    browsers: evidence,
    realKeyIntakeEnabled: false,
    ownerKeyRead: false,
    productionDataRead: false,
    deployed: false,
    physicalIphoneVerified: false,
    realRecoveryReady: false,
  };
  writeFileSync(
    path.join(output, "evidence.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify(report) + "\n");
} finally {
  await activeBrowser?.close();
  fixture.stdin.end();
  server.close();
}
