const { expect } = require("@playwright/test");

const SHINJUKU = { latitude: 35.6905, longitude: 139.7003 };
const TOKYO_STATION = { latitude: 35.6812, longitude: 139.7671 };

// Kartenteile durch eine leere Karte ersetzen: Tests hängen nicht vom Kartendienst ab
const STUB_STYLE = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#eceee8" } }],
};
async function stubTiles(context, api) {
  await context.route("https://tiles.openfreemap.org/**", (route) => {
    const url = route.request().url();
    if (url.includes("/styles/")) return route.fulfill({ contentType: "application/json", body: JSON.stringify(STUB_STYLE) });
    return route.fulfill({ status: 200, contentType: "application/x-protobuf", body: "" });
  });
  // Die echte Community-API wird in Tests nie angefragt. Standard: Community aus (wie ohne Server).
  // opts.api ersetzt die Antworten, z. B. für den privaten Testmodus.
  await context.route("https://*.workers.dev/**", (route) => {
    // Community-Test gegen den Staging-Worker: dessen Anfragen echt durchlassen
    if (!api && process.env.SMOKR_API && route.request().url().startsWith(process.env.SMOKR_API)) return route.fallback();
    const r = api && api(route.request());
    const body = r ? r : { status: 503, json: { error: "disabled" } };
    return route.fulfill({ status: body.status || 200, contentType: "application/json", body: JSON.stringify(body.json), headers: { "access-control-allow-origin": "*" } });
  });
}

function trackErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // fehlende Kartenteile im Offline-Test sind erwartet
    if (/tiles\.openfreemap|Failed to load resource|net::ERR_INTERNET_DISCONNECTED|ERR_FAILED/.test(t)) return;
    errors.push(t);
  });
  return errors;
}

async function ready(page) {
  try {
    await page.waitForFunction(() => window.__smokr && window.__smokr.mapReady && window.__smokr.state.spots.length > 1000, null, { timeout: 30000 });
  } catch (e) {
    const diag = await page.evaluate(() => ({
      smokr: !!window.__smokr, mapReady: window.__smokr && window.__smokr.mapReady, map: !!(window.__smokr && window.__smokr.map),
      styleLoaded: window.__smokr && window.__smokr.map && window.__smokr.map.isStyleLoaded(), spots: window.__smokr && window.__smokr.state.spots.length,
      regions: window.__smokr && JSON.stringify(window.__smokr.state.regions),
      scripts: [...document.scripts].map((x) => x.src.split("/").pop()),
    })).catch((x) => String(x));
    throw new Error(`App nicht bereit: ${JSON.stringify(diag)} Fehler: ${JSON.stringify(page.__errors)} Netz: ${JSON.stringify(page.__failed)}`);
  }
}

async function open(page, context, opts = {}) {
  await stubTiles(context, opts.api);
  if (opts.storage) {
    await context.addInitScript((data) => {
      if (sessionStorage.getItem("__seeded")) return;
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
      sessionStorage.setItem("__seeded", "1");
    }, opts.storage);
  }
  const errors = trackErrors(page);
  page.__errors = errors;
  page.__failed = [];
  page.on("requestfailed", (r) => page.__failed.push(`${r.url().split("/").slice(-2).join("/")} ${r.failure() && r.failure().errorText}`));
  await page.goto(opts.path || "/");
  await ready(page);
  return errors;
}

const isPanel = (page) => page.evaluate(() => window.__smokr.sheet.isPanel());
const sheetState = (page) => page.evaluate(() => window.__smokr.sheet.state);
const mapCenter = (page) => page.evaluate(() => { const c = window.__smokr.map.getCenter(); return [c.lng, c.lat]; });
async function waitIdle(page) {
  await page.waitForFunction(() => !window.__smokr.map.isMoving(), null, { timeout: 15000 });
  await page.waitForTimeout(150);
}

/** Echte Touch-Geste über das Chrome-Protokoll (nur Chromium). */
async function touchDrag(page, from, to, steps = 12, ms = 240) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x, y) });
    await page.waitForTimeout(ms / steps);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function noHorizontalOverflow(page) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, sx: window.scrollX, sy: window.scrollY }));
  expect(o.sw).toBeLessThanOrEqual(o.w);
  expect(o.sx).toBe(0);
  expect(o.sy).toBe(0);
}

/** Sichtbare Bedienelemente liegen ganz im Bildschirm. */
async function controlsInViewport(page, selectors) {
  const vp = page.viewportSize();
  for (const sel of selectors) {
    const box = await page.locator(sel).boundingBox();
    expect(box, sel).not.toBeNull();
    expect(box.x, sel).toBeGreaterThanOrEqual(0);
    expect(box.y, sel).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, sel).toBeLessThanOrEqual(vp.width + 0.5);
    expect(box.y + box.height, sel).toBeLessThanOrEqual(vp.height + 0.5);
    expect(box.width, sel).toBeGreaterThanOrEqual(24);
  }
}

module.exports = { SHINJUKU, TOKYO_STATION, open, ready, isPanel, sheetState, mapCenter, waitIdle, touchDrag, noHorizontalOverflow, controlsInViewport, stubTiles };
