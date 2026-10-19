// Eine offene Smokr-Seite (z. B. Home-Bildschirm-App auf iOS, die nicht neu lädt) wechselt selbst auf eine neue Version.
const { test, expect } = require("@playwright/test");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "app");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

function bump(dir, from, to) {
  const edit = (f, a, b) => { const p = path.join(dir, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(a, b)); };
  edit("sw.js", `const VERSION = "smokr-v${from}";`, `const VERSION = "smokr-v${to}";`);
  edit("app.js", `const APP_VERSION = ${from};`, `const APP_VERSION = ${to};`);
  edit("index.html", `name="smokr-version" content="${from}"`, `name="smokr-version" content="${to}"`);
}

test("Offene Seite übernimmt eine neue Version selbst, ohne Neuladen von Hand", async ({ browser }, info) => {
  test.skip(!["desktop-chromium", "desktop-webkit"].includes(info.project.name), "Desktop-Profile reichen");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smokr-selfupdate-"));
  fs.cpSync(SRC, dir, { recursive: true });
  const cur = +fs.readFileSync(path.join(SRC, "app.js"), "utf8").match(/const APP_VERSION = (\d+);/)[1];
  // Wie GitHub Pages: 10 Minuten Zwischenspeicherung erlaubt
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let file = path.join(dir, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith("/")) file = path.join(file, "index.html");
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "max-age=600" }).end(body);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await context.route("https://tiles.openfreemap.org/**", (r) => r.request().url().includes("/styles/")
    ? r.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "bg", type: "background" }] }) })
    : r.fulfill({ status: 200, body: "" }));
  await context.route("https://*.workers.dev/**", (r) => r.fulfill({ status: 503, body: "{}" }));
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
    expect(await page.evaluate(() => document.querySelector('meta[name="smokr-version"]').content)).toBe(String(cur));
    // Neue Version auf dem Server, die Seite bleibt offen
    bump(dir, cur, cur + 1);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    // Die neue Version meldet sich, die Seite lädt selbst neu
    await page.waitForFunction((v) => document.querySelector('meta[name="smokr-version"]')?.content === String(v), cur + 1, { timeout: 20000 });
    const caches = await page.evaluate(() => caches.keys());
    expect(caches.filter((k) => /^smokr-v\d+$/.test(k))).toEqual([`smokr-v${cur + 1}`]);
    // Im neuen Speicher liegen die neuen Dateien
    const appJs = await page.evaluate(() => caches.open(document.querySelector('meta[name="smokr-version"]') && "smokr-v" + document.querySelector('meta[name="smokr-version"]').content).then((c) => c.match("app.js")).then((r) => r.text()));
    expect(appJs).toContain(`const APP_VERSION = ${cur + 1};`);
  } finally {
    await context.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
