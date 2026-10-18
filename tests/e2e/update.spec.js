// Update von der veröffentlichten Alpha (main) auf diese Version, am selben Ort.
// Aufruf mit OLD_APP=<Pfad zum app-Ordner von main>, sonst übersprungen.
const { test, expect } = require("@playwright/test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const OLD = process.env.OLD_APP;
const NEW = path.join(__dirname, "..", "..", "app");
const CURRENT = fs.readFileSync(path.join(NEW, "sw.js"), "utf8").match(/VERSION = "([^"]+)"/)[1];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

test.skip(!OLD, "OLD_APP nicht gesetzt");

test("Update von der Alpha: neuer Service Worker, alte Caches weg, Rückmeldungen bleiben", async ({ browser }, info) => {
  test.skip(!info.project.name.includes("chromium") || info.project.name.startsWith("pixel"), "nur Desktop-Chromium");
  let root = OLD;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let file = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith("/")) file = path.join(file, "index.html");
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" }).end(body);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await context.route("https://tiles.openfreemap.org/**", (r) => r.request().url().includes("/styles/")
    ? r.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "bg", type: "background" }] }) })
    : r.fulfill({ status: 200, body: "" }));
  const page = await context.newPage();
  try {
    // 1. Alpha laden, wie ein Nutzer sie heute hat
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => document.querySelectorAll("#list .item, #list .row").length > 0, null, { timeout: 20000 });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem("kitsuen.reports", JSON.stringify({ "osm-n1": { s: "gone", t: "2026-10-18T03:00:00Z" } }));
      localStorage.setItem("kitsuen.filters", JSON.stringify({ public: true, venue: true, noHeated: true }));
      localStorage.setItem("kitsuen.geo", "false");
    });
    const oldCaches = await page.evaluate(() => caches.keys());
    expect(oldCaches.some((k) => /^(smokr|kitsuen)-v\d+$/.test(k) && k !== CURRENT)).toBe(true);

    // 2. Neue Version am selben Ort ausliefern
    root = NEW;
    await page.reload();
    // Spätestens beim zweiten Laden läuft die neue Version
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForFunction(() => window.__smokr && window.__smokr.state.spots.length > 1000, null, { timeout: 20000 });
    await page.waitForFunction(async (current) => {
      await fetch("index.html");
      const reg = await navigator.serviceWorker.getRegistration();
      const versions = (await caches.keys()).filter((k) => /-v\d+$/.test(k));
      return reg && reg.active && versions.length === 1 && versions[0] === current;
    }, CURRENT, { timeout: 30000, polling: 1000 });
    // Eine ältere Version kann kurz danach noch einmal schreiben; spätestens beim nächsten Aufräumen ist es weg
    await page.waitForTimeout(4000);
    await expect.poll(async () => {
      await page.evaluate(() => fetch("index.html"));
      const keys = await page.evaluate(() => caches.keys());
      return keys.filter((k) => /-v\d+$/.test(k));
    }, { timeout: 30000, intervals: [2000] }).toEqual([CURRENT]);
    const st = await page.evaluate(() => ({ prefs: window.__smokr.state.prefs, reports: window.__smokr.state.reports }));
    expect(st.reports["osm-n1"].s).toBe("gone");
    expect(st.prefs.tobacco).toBe("cig");
    expect(st.prefs.showBusiness).toBe(true);
    // neue Oberfläche, neues Datenformat
    await expect(page.locator("#sheet")).toBeVisible();
    expect(await page.evaluate(() => window.SmokrCore.DATA_SCHEMA)).toBe(3);
  } finally {
    await context.close();
    server.close();
  }
});
