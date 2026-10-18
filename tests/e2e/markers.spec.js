// Marker: Sichtbarkeit, Auswahl, Trefferfläche, Cluster, Leistung, Vergleichsbilder.
const { test, expect } = require("@playwright/test");
const H = require("./helpers");

async function spotPoint(page, id) {
  return page.evaluate((x) => {
    const s = window.__smokr.state.byId.get(x);
    const p = window.__smokr.map.project([s.lon, s.lat]);
    const r = window.__smokr.map.getCanvas().getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top };
  }, id);
}
async function tap(page, x, y) {
  const touch = await page.evaluate(() => "ontouchstart" in window);
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}

test("Vergleichsbild: Markerarten", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Vergleichsbilder nur auf einem Profil");
  await H.open(page, context);
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "mk-sheet";
    box.style.cssText = "position:fixed;left:0;top:0;z-index:99;background:#f2efe9;display:inline-flex;gap:18px;padding:24px;align-items:center";
    box.innerHTML = window.SmokrMarkers.KINDS.map((k) => window.SmokrMarkers.svg(k, null, 34)).join("");
    document.body.append(box);
  });
  await page.waitForTimeout(200);
  await expect(page.locator("#mk-sheet")).toHaveScreenshot("marker-kinds.png", { maxDiffPixelRatio: 0.02 });
});

test("Antippen neben dem Marker wählt ihn aus, Nadel ersetzt den Marker", async ({ page, context }) => {
  const errors = await H.open(page, context);
  const id = "off-chiyoda-5";
  await page.evaluate((x) => { const s = window.__smokr.state.byId.get(x); window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 18 }); }, id);
  await H.waitIdle(page);
  const p = await spotPoint(page, id);
  // 14 px daneben: die Trefferfläche ist größer als der sichtbare Marker
  await tap(page, p.x + 14, p.y + 6);
  await expect(page.locator("#view-detail")).toBeVisible();
  expect(await page.evaluate(() => window.__smokr.state.selected)).toBe(id);
  const sel = await page.evaluate(() => ({
    pins: window.__smokr.map.getSource("sel")._data.features.length,
    filter: JSON.stringify(window.__smokr.map.getFilter("spots")),
  }));
  expect(sel.pins).toBe(1);
  expect(sel.filter).toContain(id);
  await expect(page.locator("#d-title")).toHaveText("Raucherplatz Akihabara – Showa-dori-Ausgang");
  await expect(page.locator("#detail .d-ja")).toHaveText("秋葉原昭和通り口喫煙所（区営）");
  await expect(page.locator("#detail .d-note")).toBeVisible();
  // Tipp auf freie Fläche schließt
  const box = await page.locator("#map").boundingBox();
  await tap(page, box.x + box.width - 40, box.y + 140);
  await expect(page.locator("#view-list")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Cluster bei niedriger Zoomstufe, Antippen vergrößert", async ({ page, context }, info) => {
  test.skip(!/desktop|iphone-15-webkit/.test(info.project.name), "zwei Profile reichen");
  const errors = await H.open(page, context);
  await page.evaluate(() => window.__smokr.map.jumpTo({ center: [139.767, 35.681], zoom: 12 }));
  await H.waitIdle(page);
  const cluster = await page.evaluate(() => {
    const m = window.__smokr.map;
    const f = m.queryRenderedFeatures({ layers: ["clusters"] })
      .map((x) => ({ x, p: m.project(x.geometry.coordinates) }))
      .filter(({ p }) => p.y > 150 && p.y < window.innerHeight * 0.45 && p.x > 30 && p.x < window.innerWidth - 30)[0];
    const r = m.getCanvas().getBoundingClientRect();
    return f && { x: f.p.x + r.left, y: f.p.y + r.top, n: f.x.properties.point_count };
  });
  expect(cluster).toBeTruthy();
  expect(cluster.n).toBeGreaterThan(1);
  const z0 = await page.evaluate(() => window.__smokr.map.getZoom());
  await tap(page, cluster.x, cluster.y);
  await H.waitIdle(page);
  expect(await page.evaluate(() => window.__smokr.map.getZoom())).toBeGreaterThan(z0 + 0.5);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Leistung: alle Arten eingeblendet, Karte bleibt flüssig", async ({ page, context }, info) => {
  test.skip(!/desktop-chromium|iphone-15-webkit/.test(info.project.name), "zwei Profile reichen");
  await H.open(page, context);
  const t = await page.evaluate(async () => {
    const S = window.__smokr;
    S.state.prefs.showBusiness = true; S.state.prefs.showUnverified = true;
    const t0 = performance.now();
    document.getElementById("q-business").click();
    document.getElementById("q-business").click();
    S.map.jumpTo({ center: [139.70, 35.69], zoom: 15 });
    await new Promise((r) => S.map.once("idle", r));
    const t1 = performance.now();
    S.map.jumpTo({ center: [139.77, 35.70], zoom: 17 });
    await new Promise((r) => S.map.once("idle", r));
    return { first: t1 - t0, second: performance.now() - t1, features: S.map.getSource("spots")._data.features.length };
  });
  expect(t.features).toBeGreaterThan(2000);
  expect(t.first).toBeLessThan(3000);
  expect(t.second).toBeLessThan(3000);
});

test("Liste: Typ, Zugang und Stockwerk auf einen Blick", async ({ page, context }) => {
  const errors = await H.open(page, context);
  await page.evaluate(() => { const s = window.__smokr.state.byId.get("off-osaka-1"); window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 18 }); }).catch(() => {});
  const id = await page.evaluate(() => window.__smokr.state.spots.find((s) => s.region === "osaka" && s.pk === "mall" && s.fl && s.free).id);
  await page.evaluate((x) => { const s = window.__smokr.state.byId.get(x); window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 18 }); }, id);
  await H.waitIdle(page);
  const meta = page.locator(`#list .row[data-id="${id}"] .row-meta`);
  await expect(meta).toContainText("Einkaufszentrum");
  await expect(meta).toContainText("Kostenlos");
  await expect(meta).toContainText(/\dF|B\d/);
  expect(errors, errors.join("\n")).toEqual([]);
});
