// Abnahmetests für Smokr. Prüfen Abläufe und Zustände, nicht nur Bilder.
const { test, expect } = require("@playwright/test");
const H = require("./helpers");

const KYOTO = [135.7681, 35.0045];

async function tapOrClick(page, x, y) {
  const touch = await page.evaluate(() => matchMedia("(hover: none)").matches && "ontouchstart" in window);
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
function distM(a, b) {
  const r = 6371000, rad = Math.PI / 180;
  const dp = (b[1] - a[1]) * rad, dl = (b[0] - a[0]) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

test.describe("Erststart", () => {
  test("ohne Standortfreigabe bleibt alles benutzbar", async ({ page, context }) => {
    const errors = await H.open(page, context);
    await expect(page.locator("#list-title")).toHaveText("In Tokio");
    await expect(page.locator("#list-sub")).toContainText("Ab Kartenmitte, Luftlinie");
    await expect(page.locator("#list .row").first()).toBeVisible();
    await expect(page.locator("#list .row-dist span").first()).toHaveText("Luftlinie");
    await expect(page.locator("body")).not.toContainText("Min. zu Fuß");
    // Standort anfragen ohne Erlaubnis
    await page.click("#locate");
    await expect(page.locator("#banner")).toContainText("Standort nicht freigegeben", { timeout: 10000 });
    await expect(page.locator("#list .row").first()).toBeVisible();
    await expect(page.locator("#locate")).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("kitsuen.geo"))).not.toBe("true");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Layout: nichts ragt aus dem Bildschirm, kein seitliches Scrollen", async ({ page, context }) => {
    const errors = await H.open(page, context);
    await H.noHorizontalOverflow(page);
    await H.controlsInViewport(page, ["#city-btn", "#search-btn", "#filter-btn", "#locate"]);
    const sheet = await page.locator("#sheet").boundingBox();
    const vp = page.viewportSize();
    expect(sheet.y).toBeLessThan(vp.height - 100);
    // Kopfzeile verdeckt das Blatt nicht
    const bar = await page.locator(".bar").boundingBox();
    expect(bar.y + bar.height).toBeLessThanOrEqual(sheet.y + 1);
    // Ergebniszeilen sind groß genug zum Antippen
    const row = await page.locator("#list .row").first().boundingBox();
    expect(row.height).toBeGreaterThanOrEqual(44);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("Standort und Stadtwechsel", () => {
  test.use({ geolocation: H.SHINJUKU, permissions: ["geolocation"] });

  test("Stadtwechsel löst die Liste vom GPS, Standort-Knopf holt sie zurück", async ({ page, context }) => {
    const errors = await H.open(page, context);
    await page.click("#locate");
    await expect(page.locator("#list-title")).toHaveText("In deiner Nähe");
    await expect(page.locator("#locate")).toHaveAttribute("aria-pressed", "true");
    await H.waitIdle(page);
    expect(distM(await H.mapCenter(page), [H.SHINJUKU.longitude, H.SHINJUKU.latitude])).toBeLessThan(200);
    const firstDist = await page.locator("#list .row-dist b").first().textContent();
    expect(firstDist).toMatch(/^\d+ m$/);

    // Nach Kyoto
    await page.click("#city-btn");
    await page.click('#city-menu [data-region="kyoto"]');
    await H.waitIdle(page);
    await expect(page.locator("#list-title")).toHaveText("In Kyoto");
    await expect(page.locator("#city-name")).toHaveText("Kyoto");
    await expect(page.locator("#locate")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#rules")).toBeVisible();
    // GPS meldet sich in Tokio: Liste und Karte bleiben in Kyoto
    await context.setGeolocation({ latitude: 35.6911, longitude: 139.7011 });
    await page.waitForTimeout(1200);
    await expect(page.locator("#list-title")).toHaveText("In Kyoto");
    expect(distM(await H.mapCenter(page), KYOTO)).toBeLessThan(3000);

    // Zurück zum Standort
    await page.click("#locate");
    await H.waitIdle(page);
    await expect(page.locator("#list-title")).toHaveText("In deiner Nähe");
    expect(distM(await H.mapCenter(page), [139.7011, 35.6911])).toBeLessThan(300);
    expect(await page.evaluate(() => localStorage.getItem("kitsuen.geo"))).toBe("true");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Kartenschwenk mit der Hand sucht in der sichtbaren Gegend", async ({ page, context }, info) => {
    test.skip(!/desktop|pixel/.test(info.project.name), "Ziehen auf der Karte braucht Maus oder Chrome-Touch");
    const errors = await H.open(page, context);
    await page.click("#locate");
    await expect(page.locator("#list-title")).toHaveText("In deiner Nähe");
    await H.waitIdle(page);
    const before = await page.locator("#list .row").first().getAttribute("data-id");
    const vp = page.viewportSize();
    const panel = await H.isPanel(page);
    const from = { x: panel ? vp.width * 0.75 : vp.width / 2, y: panel ? vp.height / 2 : vp.height * 0.3 };
    const to = { x: from.x - 260, y: from.y + 60 };
    if (info.project.name.startsWith("pixel")) await H.touchDrag(page, from, to);
    else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up(); }
    await H.waitIdle(page);
    await expect(page.locator("#list-title")).toHaveText("In Tokio");
    await expect(page.locator("#list-sub")).toContainText("Ab Kartenmitte");
    await expect(page.locator("#locate")).toHaveAttribute("aria-pressed", "false");
    // weiteres GPS-Update setzt die Karte nicht zurück
    const center = await H.mapCenter(page);
    await context.setGeolocation({ latitude: 35.6906, longitude: 139.7004 });
    await page.waitForTimeout(1000);
    expect(distM(await H.mapCenter(page), center)).toBeLessThan(5);
    // Liste ist jetzt nach Nähe zur neuen Kartenmitte sortiert
    const expected = await page.evaluate(() => {
      const st = window.__smokr.state;
      const c = window.__smokr.map.getCenter();
      return window.SmokrCore.rank(st.spots, [c.lng, c.lat], st.prefs, st.reports, 1)[0].s.id;
    });
    await expect(page.locator("#list .row").first()).toHaveAttribute("data-id", expected);
    void before;
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("Marker, Blatt und Detail", () => {
  test("Marker antippen zeigt die Vorschau im Blatt, Marker bleibt sichtbar", async ({ page, context }) => {
    const errors = await H.open(page, context);
    const target = await page.evaluate(() => {
      const s = window.__smokr.state.byId.get("off-chiyoda-1") || window.__smokr.state.spots.find((x) => x.off && x.k === "p");
      window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 17.5 });
      return s.id;
    });
    await H.waitIdle(page);
    const pt = await page.evaluate((id) => {
      const s = window.__smokr.state.byId.get(id);
      const p = window.__smokr.map.project([s.lon, s.lat]);
      const r = window.__smokr.map.getCanvas().getBoundingClientRect();
      return { x: p.x + r.left, y: p.y + r.top };
    }, target);
    await tapOrClick(page, pt.x, pt.y);
    await expect(page.locator("#view-detail")).toBeVisible();
    await expect(page.locator("#d-title")).not.toBeEmpty();
    await expect(page.locator("#route-main")).toBeVisible();
    await H.waitIdle(page);
    // Ausgewählter Platz liegt im sichtbaren Kartenbereich über dem Blatt
    const pos = await page.evaluate((id) => {
      const s = window.__smokr.state.byId.get(id);
      const p = window.__smokr.map.project([s.lon, s.lat]);
      const sheet = document.getElementById("sheet").getBoundingClientRect();
      return { y: p.y, x: p.x, sheetTop: sheet.top, sheetRight: sheet.right, panel: window.__smokr.sheet.isPanel() };
    }, target);
    if (pos.panel) expect(pos.x).toBeGreaterThan(pos.sheetRight);
    else expect(pos.y).toBeLessThan(pos.sheetTop);
    expect(await page.evaluate(() => window.__smokr.state.selected)).toBe(target);
    // zurück
    await page.click("#back");
    await expect(page.locator("#view-list")).toBeVisible();
    expect(await page.evaluate(() => window.__smokr.state.selected)).toBeNull();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Blatt: Griff, Tastatur und kein Seiten-Scrollen", async ({ page, context }) => {
    const errors = await H.open(page, context);
    test.skip(await H.isPanel(page), "Seitenpanel hat keine Rastpunkte");
    expect(await H.sheetState(page)).toBe("half");
    await page.click("#grab");
    await expect.poll(() => H.sheetState(page)).toBe("expanded");
    await expect(page.locator(".topbar")).toHaveCSS("opacity", "0");
    await page.click("#grab");
    await expect.poll(() => H.sheetState(page)).toBe("collapsed");
    await page.focus("#grab");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => H.sheetState(page)).toBe("half");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => H.sheetState(page)).toBe("expanded");
    // Liste scrollt innen, die Seite nicht
    await page.locator("#list-scroll").evaluate((el) => { el.scrollTop = 600; });
    expect(await page.locator("#list-scroll").evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    await H.noHorizontalOverflow(page);
    // Unterkante des Blatts schließt mit dem Bildschirm ab, sobald die Bewegung fertig ist
    await expect.poll(async () => {
      const box = await page.locator("#sheet").boundingBox();
      return Math.round(Math.abs(box.y + box.height - page.viewportSize().height));
    }).toBeLessThan(2);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Blatt: echte Touch-Gesten (Chrome)", async ({ page, context }, info) => {
    test.skip(!info.project.name.startsWith("pixel"), "nur mit Chrome-Touch");
    const errors = await H.open(page, context);
    const vp = page.viewportSize();
    const half = await page.evaluate(() => window.__smokr.sheet.snaps.half);
    // Hochwischen am Kopf: ganz auf
    await H.touchDrag(page, { x: vp.width / 2, y: half + 40 }, { x: vp.width / 2, y: half - 200 }, 10, 150);
    await expect.poll(() => H.sheetState(page)).toBe("expanded");
    // In der offenen Liste scrollen: Blatt bleibt offen
    const listBox = await page.locator("#list-scroll").boundingBox();
    await H.touchDrag(page, { x: vp.width / 2, y: listBox.y + 400 }, { x: vp.width / 2, y: listBox.y + 100 }, 10, 300);
    await page.waitForTimeout(600);
    expect(await H.sheetState(page)).toBe("expanded");
    expect(await page.locator("#list-scroll").evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
    // Liste nach oben zurück, dann zieht die nächste Abwärtsbewegung das Blatt herunter
    await page.locator("#list-scroll").evaluate((el) => { el.scrollTop = 0; });
    await H.touchDrag(page, { x: vp.width / 2, y: listBox.y + 60 }, { x: vp.width / 2, y: listBox.y + 380 }, 10, 300);
    await expect.poll(() => H.sheetState(page)).not.toBe("expanded");
    // Schnelles Wischen nach unten: zu
    const now = await page.evaluate(() => window.__smokr.sheet.y);
    await H.touchDrag(page, { x: vp.width / 2, y: now + 30 }, { x: vp.width / 2, y: now + 140 }, 4, 50);
    await expect.poll(() => H.sheetState(page)).toBe("collapsed");
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Detail: Route, Herkunft und Rückmeldung", async ({ page, context }, info) => {
    const errors = await H.open(page, context);
    await page.evaluate(() => {
      const s = window.__smokr.state.byId.get("off-chiyoda-26");
      window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 16 });
    });
    await H.waitIdle(page);
    await page.locator('#list .row[data-id="off-chiyoda-26"]').click();
    const main = page.locator("#route-main");
    await expect(main).toContainText("Route starten");
    const href = await main.getAttribute("href");
    if (/iphone|webkit/.test(info.project.name)) expect(href).toMatch(/^https:\/\/maps\.apple\.com\/\?daddr=[\d.]+,[\d.]+&dirflg=w$/);
    else expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=[\d.]+,[\d.]+&travelmode=walking$/);
    await expect(main).toHaveAttribute("target", "_blank");
    const detail = page.locator("#detail");
    await expect(detail).toContainText("Offizielle Liste");
    await expect(detail).toContainText("Bezirk Chiyoda, Stand");
    await expect(detail).toContainText("Nur ungefähr");
    await expect(detail).toContainText("Die Position ist nur ungefähr bekannt");
    await expect(detail).toContainText("7:00–20:00");
    await expect(detail).not.toContainText("Geprüft");
    // Rückmeldung: nicht gefunden blendet aus und überlebt einen Neustart
    await page.click('[data-report="gone"]');
    await expect(page.locator('[data-report="gone"]')).toHaveAttribute("aria-pressed", "true");
    await page.click("#back");
    await expect(page.locator('#list .row[data-id="off-chiyoda-26"]')).toHaveCount(0);
    await page.reload();
    await H.ready(page);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kitsuen.reports"))["off-chiyoda-26"].s)).toBe("gone");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("Suche und Filter", () => {
  test("Suche nach Bahnhof", async ({ page, context }) => {
    const errors = await H.open(page, context);
    await page.click("#search-btn");
    await expect(page.locator("#q")).toBeFocused();
    await expect(page.locator("#search-results")).toContainText("Orte der Reise");
    await page.keyboard.type("Shinjuku");
    const first = page.locator("#search-results .row[data-id]").first();
    await expect(first.locator(".row-src")).toContainText("bei Shinjuku");
    await first.click();
    await expect(page.locator("#view-detail")).toBeVisible();
    await expect(page.locator("#list-title")).toBeHidden();
    // Stadt über die Suche
    await page.click("#search-btn");
    await page.keyboard.type("osa");
    await page.click('#search-results [data-region="osaka"]');
    await H.waitIdle(page);
    await expect(page.locator("#list-title")).toHaveText("In Osaka");
    await expect(page.locator("#rules-title")).toHaveText("Regeln in Osaka");
    // Leere Suche erklärt sich
    await page.click("#search-btn");
    await page.keyboard.type("xyzxyz");
    await expect(page.locator("#search-results")).toContainText("Nichts gefunden");
    await page.click("#search-cancel");
    await expect(page.locator("#view-list")).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Filter: Tabakart und Zugang, gespeichert", async ({ page, context }) => {
    const errors = await H.open(page, context);
    const heatedVisible = () => page.evaluate(() => window.__smokr.map.getSource("spots")._data.features.some((f) => f.properties.icon.startsWith("m-heated")));
    expect(await heatedVisible()).toBe(true);
    await page.click("#filter-btn");
    await expect(page.locator("#filters")).toBeVisible();
    await page.locator('label:has(#t-cig)').click();
    await expect(page.locator("#tobacco-hint")).toContainText("ausgeblendet");
    await page.locator('label:has(#s-business)').click();
    await page.locator("#filters .btn.primary").click();
    await expect(page.locator("#filters")).toBeHidden();
    expect(await heatedVisible()).toBe(false);
    await expect(page.locator("#q-business")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#q-tobacco-label")).toHaveText("Nur Zigaretten");
    await expect(page.locator("#filter-badge")).toBeVisible();
    await page.reload();
    await H.ready(page);
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("kitsuen.prefs")));
    expect(prefs.tobacco).toBe("cig");
    expect(prefs.showBusiness).toBe(true);
    await expect(page.locator("#q-business")).toHaveAttribute("aria-pressed", "true");
    // Schnellfilter: alles aus erklärt sich
    await page.click("#q-public");
    await page.click("#q-business");
    await expect(page.locator("#list")).toContainText("Alle Arten sind ausgeblendet");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Alte Einstellungen und Rückmeldungen werden übernommen", async ({ page, context }) => {
    const errors = await H.open(page, context, {
      storage: {
        "kitsuen.filters": { public: true, venue: true, noHeated: true },
        "kitsuen.reports": { "off-chiyoda-1": { s: "ok", t: "2026-10-18T05:00:00.000Z" } },
        "kitsuen.geo": false,
      },
    });
    await expect(page.locator("#q-business")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#q-tobacco-label")).toHaveText("Nur Zigaretten");
    await page.evaluate(() => {
      const s = window.__smokr.state.byId.get("off-chiyoda-1");
      window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 17 });
    });
    await H.waitIdle(page);
    await page.locator('#list .row[data-id="off-chiyoda-1"]').click();
    await expect(page.locator("#detail")).toContainText("Du hast ihn gefunden");
    expect(await page.evaluate(() => localStorage.getItem("kitsuen.filters"))).not.toBeNull();
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("Datenfehler und Offline", () => {
  test("fehlende Stadtdatei wird gemeldet, nicht als leer verkauft", async ({ page, context }) => {
    await context.route("**/data/kyoto.json", (r) => r.fulfill({ status: 500, body: "kaputt" }));
    await context.route("**/data/osaka.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{" }));
    const errors = await H.open(page, context);
    await page.click("#city-btn");
    await expect(page.locator('#city-menu [data-region="kyoto"]')).toContainText("Daten fehlen");
    await page.click('#city-menu [data-region="kyoto"]');
    await H.waitIdle(page);
    await expect(page.locator("#banner")).toContainText("Daten für Kyoto fehlen (HTTP 500)");
    await expect(page.locator("#list")).toContainText("keine Daten");
    await expect(page.locator("#list")).not.toContainText("nichts eingetragen");
    // Reparatur und erneut laden
    await context.unroute("**/data/kyoto.json");
    await page.click("#banner [data-retry]");
    await expect(page.locator("#list .row").first()).toBeVisible();
    await expect(page.locator("#banner")).toBeHidden();
    // kaputtes JSON in Osaka
    await page.click("#city-btn");
    await page.click('#city-menu [data-region="osaka"]');
    await H.waitIdle(page);
    await expect(page.locator("#banner")).toContainText("Daten für Osaka fehlen");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test.describe("mit Service Worker", () => {
  test.use({ serviceWorkers: "allow" });
  test("offline starten und wieder online", async ({ page, context }, info) => {
    test.skip(!info.project.name.includes("chromium"), "Service-Worker-Test mit Chromium");
    const errors = await H.open(page, context);
    await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
    await page.reload();
    await H.ready(page);
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      const c = await caches.open(keys.find((k) => k.startsWith("smokr-v")));
      return !!(await c.match("data/osaka.json"));
    }, null, { timeout: 15000 });
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.__smokr && window.__smokr.state.spots.length > 1000, null, { timeout: 20000 });
    await expect(page.locator("#list .row").first()).toBeVisible();
    await expect(page.locator("#banner")).toContainText("Offline");
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator("#banner")).toBeHidden();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  });

  test("Manifest und Icons für den Home-Bildschirm", async ({ page, context }) => {
    await H.open(page, context);
    const m = await page.evaluate(async () => (await fetch("manifest.webmanifest")).json());
    expect(m.name).toBe("Smokr");
    expect(m.display).toBe("standalone");
    for (const icon of m.icons) {
      const ok = await page.evaluate(async (src) => (await fetch(src)).ok, icon.src);
      expect(ok, icon.src).toBe(true);
    }
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "icons/icon-180.png");
  });
});

test.describe("Tastatur und Bewegung", () => {
  test("Tastatur: Suche, Liste, Detail, zurück", async ({ page, context }, info) => {
    test.skip(!info.project.name.startsWith("desktop"), "Tastatur auf dem Desktop");
    const errors = await H.open(page, context);
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("/");
    await expect(page.locator("#q")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#view-list")).toBeVisible();
    await page.locator("#list .row").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#view-detail")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#view-list")).toBeVisible();
    await expect(page.locator("#list .row").first()).toBeFocused();
    // Stadtmenü mit Pfeiltasten
    await page.locator("#city-btn").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#city-menu")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await H.waitIdle(page);
    await expect(page.locator("#city-name")).toHaveText("Kamakura");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Reduzierte Bewegung: Blatt springt ohne Animation", async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = await H.open(page, context);
    test.skip(await H.isPanel(page), "Seitenpanel");
    await page.click("#grab");
    expect(await page.locator("#sheet").evaluate((el) => el.classList.contains("anim"))).toBe(false);
    expect(await H.sheetState(page)).toBe("expanded");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("Sprachen und Konbinis", () => {
  test.use({ locale: "en-US" });

  test("Englisch als Standard, Wechsel auf Japanisch bleibt gespeichert", async ({ page, context }) => {
    const errors = await H.open(page, context);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#list-title")).toHaveText("In Tokyo");
    await expect(page.locator("#list-sub")).toHaveText("From the map center, straight-line distance");
    await expect(page.locator("#search-btn")).toContainText("Search");
    await page.click("#filter-btn");
    await page.locator("label:has(#l-ja)").click();
    await expect(page.locator("#filters-title")).toHaveText("フィルター");
    await page.locator("#filters .btn.primary").click();
    await expect(page.locator("#list-title")).toHaveText("東京");
    await expect(page.locator("#list .row-dist span").first()).toHaveText("直線距離");
    await page.reload();
    await H.ready(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.locator("#city-name")).toHaveText("東京");
    // Japanische Ortsbeschreibungen bleiben Original, auch auf Englisch
    await page.click("#filter-btn");
    await page.locator("label:has(#l-en)").click();
    await page.locator("#filters .btn.primary").click();
    await page.evaluate(() => {
      const s = window.__smokr.state.byId.get("off-chiyoda-26");
      window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 16 });
    });
    await H.waitIdle(page);
    await page.locator('#list .row[data-id="off-chiyoda-26"]').click();
    await expect(page.locator("#detail .hint")).toHaveAttribute("lang", "ja");
    await expect(page.locator("#detail")).toContainText("7:00–20:00");
    await expect(page.locator("#detail")).toContainText("Chiyoda City, as of");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Unbestätigte Konbinis sind aus und nur per Filter sichtbar", async ({ page, context }) => {
    const errors = await H.open(page, context);
    const unv = await page.evaluate(() => window.__smokr.state.spots.filter((s) => s.unv).map((s) => s.id));
    expect(unv.length).toBeGreaterThan(40);
    const onMap = () => page.evaluate((ids) => window.__smokr.map.getSource("spots")._data.features.filter((f) => ids.includes(f.properties.id)).length, unv);
    await page.click("#q-business");
    expect(await onMap()).toBe(0);
    await page.click("#filter-btn");
    await page.locator("label:has(#s-unverified)").click();
    await page.locator("#filters .btn.primary").click();
    expect(await onMap()).toBe(unv.length);
    // Detail warnt deutlich
    await page.evaluate((id) => { const s = window.__smokr.state.byId.get(id); window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 18 }); }, unv[0]);
    await H.waitIdle(page);
    await page.locator(`#list .row[data-id="${unv[0]}"]`).click();
    await expect(page.locator("#detail")).toContainText("Unconfirmed");
    await expect(page.locator("#detail .callout").first()).toContainText("ashtrays at convenience stores have been removed");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Ohne Backend gibt es keine Community-Knöpfe", async ({ page, context }) => {
    const errors = await H.open(page, context);
    await expect(page.locator("#add-btn")).toBeHidden();
    await page.locator("#list .row").first().click();
    await expect(page.locator("[data-community-report]")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
