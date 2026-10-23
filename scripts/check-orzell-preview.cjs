const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  await fs.mkdir(output, { recursive: true });
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".jpg": "image/jpeg",
    ".css": "text/css",
  };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + path.sep)) throw new Error("Outside export");
      const data = await fs.readFile(file);
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const width of [320, 390, 768]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // This is an offline display check; never contact the live API or provider.
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(origin);
      const brand = page.getByRole("img", {
        name: "ORZELL ön izleme",
        exact: true,
      });
      await brand.waitFor();
      await page.waitForFunction(
        () =>
          [...document.images].length > 0 &&
          [...document.images].every(
            (image) => image.complete && image.naturalWidth > 0,
          ),
      );
      assert.equal(await page.title(), "ORZELL");
      assert.equal(await brand.getByText("RZELL", { exact: true }).count(), 1);
      const box = await brand.boundingBox();
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= width,
        `Brand overflow at ${width}px`,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Page overflow at ${width}px`,
      );
      assert.deepEqual(errors, [], `Runtime errors at ${width}px`);
      await page.screenshot({ path: path.join(output, `orzell-${width}.png`) });
      await page.close();
      console.log(
        `ORZELL header, original image loading, no overflow or runtime errors at ${width}px: PASS`,
      );
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
