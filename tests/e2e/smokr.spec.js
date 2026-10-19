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
    // Wischen nach unten bis kurz vor den unteren Rastpunkt: zu. Die Strecke reicht auch ohne Schwung,
    // damit der Test unter Last nicht von der Zeitmessung abhängt (Schwung zählt nur bis 120 ms vor dem Loslassen)
    const now = await page.evaluate(() => window.__smokr.sheet.y);
    const low = await page.evaluate(() => window.__smokr.sheet.snaps.collapsed);
    await H.touchDrag(page, { x: vp.width / 2, y: now + 30 }, { x: vp.width / 2, y: now + 30 + (low - now) - 20 }, 4, 50);
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

  test("Privater Testmodus: ohne Code keine Knöpfe, Testlink fragt nach dem Code", async ({ page, context }) => {
    const calls = [];
    const api = (req) => {
      calls.push(new URL(req.url()).pathname);
      return req.url().endsWith("/v1/status") ? { json: { mode: "private", photos: true } } : { status: 403, json: { error: "tester" } };
    };
    const errors = await H.open(page, context, { path: "/#community", api });
    await expect(page.locator("#tester")).toBeVisible();
    await expect(page.locator("#add-btn")).toBeHidden();
    await page.locator("#tester [data-close-dialog]").click();
    await expect(page.locator("#tester")).toBeHidden();
    await page.locator("#list .row").first().click();
    await expect(page.locator("[data-community-report]")).toHaveCount(0);
    expect(calls, "ohne Code wird nur der Status abgefragt").toEqual(["/v1/status"]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Testlink ohne laufende Community sagt Bescheid", async ({ page, context }) => {
    const errors = await H.open(page, context, { path: "/#community" });
    await expect(page.locator("#toast")).toContainText(/available|verfügbar|利用/);
    await expect(page.locator("#tester")).toBeHidden();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Community-Texte vom Server werden nie als HTML ausgeführt", async ({ page, context }) => {
    const evil = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"'&`;
    const community = {
      places: [{ id: "1\"><img src=x onerror=window.__xss=3>", lat: 35.6812, lon: 139.7671, category: "room", tobacco: "all", access: "unknown",
        name: evil, floor: evil, note: evil, approved_at: evil, photos: ["../../evil\" onerror=\"window.__xss=4", "a".repeat(32)] }],
      confirmations: [{ spot_id: "x", n: 1 }], hidden: [],
    };
    const api = (req) => {
      const u = req.url();
      if (u.endsWith("/v1/status")) return { json: { mode: "private" } };
      if (u.endsWith("/v1/community")) return { json: community };
      return { status: 404, json: { error: "not_found" } };
    };
    const errors = await H.open(page, context, { api, storage: { "kitsuen.tester": "TEST-CODE-0000-0000" } });
    const id = await page.waitForFunction(() => [...window.__smokr.state.byId.keys()].find((k) => k.startsWith("com-"))).then((h) => h.jsonValue());
    await page.evaluate((x) => { const s = window.__smokr.state.byId.get(x); window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 19 }); }, id);
    await H.waitIdle(page);
    await page.locator("#list .row").filter({ hasText: "<img" }).first().click();
    await expect(page.locator("#detail")).toContainText("<img src=x");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"], #detail script').count()).toBe(0);
    // Nur die gültige Foto-ID wird geladen
    const srcs = await page.locator("#detail .photos img").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
    expect(srcs.length).toBe(1);
    expect(srcs[0]).toMatch(/\/v1\/photos\/a{32}$/);
    // Unklarer Zugang wird nicht als kostenlos angezeigt
    await expect(page.locator("#detail")).not.toContainText(/Kostenlos|Free of charge/);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Community-Formular: Netzabbruch und fehlendes Turnstile werden verständlich gemeldet", async ({ page, context }, info) => {
    test.skip(!["iphone-15-webkit", "desktop-chromium"].includes(info.project.name), "zwei Profile reichen");
    const api = (req) => req.url().endsWith("/v1/status") ? { json: { mode: "private" } }
      : req.url().endsWith("/v1/community") ? { json: { places: [], confirmations: [], hidden: [] } } : { status: 404, json: {} };
    // Turnstile-Skript nicht erreichbar
    await context.route("https://challenges.cloudflare.com/**", (r) => r.abort());
    const errors = await H.open(page, context, { api, storage: { "kitsuen.tester": "TEST-CODE-0000-0000" } });
    await page.click("#add-btn");
    await expect(page.locator("#form-error")).toContainText(/Verbindung|connection/);
    // Turnstile wieder da, aber die Einsendung bricht im Netz ab
    await context.unroute("https://challenges.cloudflare.com/**");
    await context.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript",
      body: 'window.turnstile={render(el,o){setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"),20);return "w"},reset(){},remove(){}};' }));
    await context.route("https://*.workers.dev/v1/submissions", (r) => r.abort("internetdisconnected"));
    await page.click("#form-back");
    await page.click("#add-btn");
    await page.fill("#f-name", "Mein Platz");
    await page.waitForTimeout(300);
    await page.click("#form-submit");
    await expect(page.locator("#form-error")).toContainText(/Verbindung|connection/);
    await expect(page.locator("#form-submit")).toBeEnabled();
    await expect(page.locator("#f-name")).toHaveValue("Mein Platz");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Platz hinzufügen ohne vor Ort zu sein: Name, Adresse, Google-Maps-Link", async ({ page, context }, info) => {
    const FX = require("../unit/locate-fixtures.js");
    const api = (req) => req.url().endsWith("/v1/status") ? { json: { mode: "private", geocode: true } }
      : req.url().endsWith("/v1/community") ? { json: { places: [], confirmations: [], hidden: [] } } : { status: 404, json: {} };
    await context.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript",
      body: 'window.turnstile={render(el,o){setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"),20);return "w"},reset(){},remove(){}};' }));
    // Externe Dienste mit festen Antworten, damit der Test nichts ins Netz schickt
    const searches = [];
    await context.route("https://nominatim.openstreetmap.org/**", (r) => { searches.push(r.request().url()); r.fulfill({ contentType: "application/json", body: JSON.stringify(FX.NOMINATIM) }); });
    await context.route("https://japanese-addresses-v2.geoloniamaps.com/**", async (r) => {
      const fake = await FX.fakeFetch()(r.request().url(), { headers: { Range: r.request().headers().range } });
      r.fulfill({ status: fake.status, contentType: "text/plain; charset=utf-8", body: await fake.text(), headers: { "access-control-allow-origin": "*" } });
    });
    const errors = await H.open(page, context, { api, storage: { "kitsuen.tester": "TEST-CODE-0000-0000" } });
    let sent = null;
    await context.route("https://*.workers.dev/v1/submissions", (r) => { sent = r.request().postDataBuffer().toString("latin1"); r.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true,"id":1,"status":"pending"}', headers: { "access-control-allow-origin": "*" } }); });
    await context.route("https://*.workers.dev/v1/resolve-link", (r) => {
      const body = JSON.parse(r.request().postData());
      r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body.url.includes("goo.gl") ? { ok: true, url: "https://www.google.com/maps/place/Test+Bar/@35.69,139.70,17z/data=!3d35.6905!4d139.7004" } : { error: "link" }) });
    });
    const center = () => page.evaluate(() => { const c = window.__smokr.map.getCenter(); return [+c.lng.toFixed(4), +c.lat.toFixed(4)]; });
    await page.click("#add-btn");
    await expect(page.locator(".seg-btn[data-loc-mode=search]")).toHaveAttribute("aria-pressed", "true");
    // Erst etwas ins Formular schreiben: darf beim Methodenwechsel nicht verloren gehen
    await page.fill("#f-floor", "2F, hinten links");

    // 1. Name: Treffer zur Auswahl, Nadel auf den gewählten, Name übernommen, Genauigkeit "Gebäude"
    await page.fill("#loc-q", "Ichiran Shibuya");
    await page.locator("#loc-q").press("Enter");
    await expect(page.locator(".loc-result")).toHaveCount(2);
    await expect(page.locator("#view-form")).toBeVisible();
    await page.locator(".loc-result").first().click();
    await expect.poll(center).toEqual([139.7009, 35.661]);
    await expect(page.locator("#f-name")).toHaveValue("Ichiran");
    await expect(page.locator("#loc-label")).toHaveText("Ichiran");
    await expect(page.locator('input[name="posq"][value="building"]')).toBeChecked();
    await expect(page.locator(".loc-attr")).toContainText("OpenStreetMap");
    expect(new URL(searches[0]).searchParams.get("countrycodes")).toBe("jp");

    // 2. Japanische Adresse: direkt übernommen, bis zur Hausnummer
    await page.fill("#loc-q", "東京都渋谷区神南1-22-7");
    await page.click("[data-loc-search]");
    await expect(page.locator("#loc-label")).toHaveText("東京都渋谷区神南一丁目22-7");
    await expect.poll(center).toEqual([139.7009, 35.6611]);
    await expect(page.locator(".loc-card")).toContainText(/Hausnummer|house number/);

    // 3. Google-Maps-Link mit Ortsmarke, dann Kurzlink über den Worker
    await page.fill("#loc-q", "https://www.google.com/maps/place/Bar+X/@35.70,139.77,17z/data=!3d35.7012!4d139.7745");
    await page.click("[data-loc-search]");
    await expect.poll(center).toEqual([139.7745, 35.7012]);
    await expect(page.locator("#loc-label")).toHaveText("Bar X");
    await page.fill("#loc-q", "https://maps.app.goo.gl/AbCdEf123");
    await page.click("[data-loc-search]");
    await expect.poll(center).toEqual([139.7004, 35.6905]);

    // 4. Fehler: Link ohne Position, nichts gefunden
    await page.fill("#loc-q", "https://example.com/irgendwas");
    await page.click("[data-loc-search]");
    await expect(page.locator(".loc-error")).toContainText(/keine Position|no position/);
    await context.unroute("https://nominatim.openstreetmap.org/**");
    await context.route("https://nominatim.openstreetmap.org/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
    await page.fill("#loc-q", "gibt es nicht 12345");
    await page.click("[data-loc-search]");
    await expect(page.locator(".loc-error")).toContainText(/Nichts gefunden|Nothing found/);
    await expect.poll(center).toEqual([139.7004, 35.6905], { message: "Fehlschlag bewegt die Karte nicht" });

    // 5. Methoden wechseln: Eingaben bleiben
    await page.click(".seg-btn[data-loc-mode=map]");
    await page.click(".seg-btn[data-loc-mode=search]");
    await expect(page.locator("#loc-q")).toHaveValue("gibt es nicht 12345");
    await expect(page.locator("#f-floor")).toHaveValue("2F, hinten links");
    await expect(page.locator("#f-name")).toHaveValue("Ichiran");

    // 6. Nadel von Hand verschieben: als selbst gesetzt erkennbar
    if (!info.project.name.startsWith("pixel") && !/iphone/.test(info.project.name)) {
      const box = await page.locator("#map").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 120);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + 160, { steps: 6 });
      await page.mouse.up();
      await expect(page.locator("#loc-label")).toHaveText(/von Hand|by hand/);
    }
    await page.locator('label:has(input[name="posq"][value="exact"])').click();

    // 7. Absenden: Position der Nadel, Genauigkeit, Herkunft und Adresse gehen mit
    const pin = await center();
    await page.click("#form-submit");
    await expect(page.locator(".form-done")).toBeVisible();
    const field = (n) => (sent.match(new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`)) || [])[1];
    expect(+field("lat")).toBeCloseTo(pin[1], 4);
    expect(+field("lon")).toBeCloseTo(pin[0], 4);
    expect(field("pos_quality")).toBe("exact");
    expect(["link", "map"]).toContain(field("pos_source"));
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Google-Link nur mit interner Kennung: ehrlicher Hinweis, Suche nach Name, Link geht mit", async ({ page, context }, info) => {
    test.skip(!["iphone-15-webkit", "desktop-chromium", "iphone-se-webkit"].includes(info.project.name), "drei Profile reichen");
    const FX = require("../unit/locate-fixtures.js");
    const REAL = "https://maps.google.com/maps/place//data=!4m2!3m1!1s0x60188c1d74acd117:0x392ee31a88ad9c56?entry=s&sa=X&ved=2ahUKEwikkoHl08SXAxX5luEIHT1FOHoQ4kB6BAgaEAA&hl=de";
    const api = (req) => req.url().endsWith("/v1/status") ? { json: { mode: "private", geocode: true } }
      : req.url().endsWith("/v1/community") ? { json: { places: [], confirmations: [], hidden: [] } } : { status: 404, json: {} };
    await context.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript",
      body: 'window.turnstile={render(el,o){setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"),20);return "w"},reset(){},remove(){}};' }));
    const searches = [];
    await context.route("https://nominatim.openstreetmap.org/**", (r) => { searches.push(new URL(r.request().url()).searchParams.get("q")); r.fulfill({ contentType: "application/json", body: JSON.stringify(FX.NOMINATIM) }); });
    const googleCalls = [];
    page.on("request", (r) => { if (/google\.com/.test(r.url())) googleCalls.push(r.url()); });
    const errors = await H.open(page, context, { api, storage: { "kitsuen.tester": "TEST-CODE-0000-0000" } });
    let sent = null;
    await context.route("https://*.workers.dev/v1/submissions", (r) => { sent = r.request().postDataBuffer().toString("utf8"); r.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true,"id":1,"status":"pending"}', headers: { "access-control-allow-origin": "*" } }); });
    const center = () => page.evaluate(() => { const c = window.__smokr.map.getCenter(); return [+c.lng.toFixed(4), +c.lat.toFixed(4)]; });
    await page.click("#add-btn");
    const before = await center();

    // Echter Link: kein Ort, offener Hinweis, Karte bleibt, Feld bereit für Name oder Adresse
    await page.fill("#loc-q", REAL);
    await page.locator("#loc-q").press("Enter");
    await expect(page.locator(".loc-info")).toContainText(/keine Position|no position/);
    await expect(page.locator(".loc-error")).toHaveCount(0);
    expect(await center()).toEqual(before);
    await expect(page.locator("#loc-label")).toHaveText(/Kartenmitte|middle of the map/, { message: "nicht behaupten, den Ort gefunden zu haben" });
    await expect(page.locator("#loc-q")).toHaveValue("");
    await expect(page.locator("#loc-q")).toHaveAttribute("placeholder", /Name oder Adresse|Name or address/);
    const href = await page.locator(".loc-info a").getAttribute("href");
    expect(href).toBe("https://maps.google.com/maps/place//data=!4m2!3m1!1s0x60188c1d74acd117:0x392ee31a88ad9c56");
    await expect(page.locator(".loc-ref")).toBeVisible();
    expect(searches).toEqual([], "mit der Kennung allein wird nichts gesucht");
    expect(googleCalls).toEqual([], "die App fragt Google nicht an");

    // Name ergänzen, ohne den Link neu einzugeben
    await page.fill("#loc-q", "Ichiran Shibuya");
    await page.click("[data-loc-search]");
    await page.locator(".loc-result").first().click();
    await expect(page.locator("#loc-label")).toHaveText("Ichiran");
    await expect(page.locator(".loc-ref")).toBeVisible();
    await page.click("#form-submit");
    await expect(page.locator(".form-done")).toBeVisible();
    expect(sent).toContain("https://maps.google.com/maps/place//data=!4m2!3m1!1s0x60188c1d74acd117:0x392ee31a88ad9c56");
    expect(sent).not.toContain("ved=");
    expect(sent).toMatch(/name="pos_source"\r\n\r\nsearch/);

    // Link mit Namen (q=…&ftid=…): sucht direkt mit dem Namen und bittet ums Prüfen
    await page.click("[data-form-close]");
    await page.click("#add-btn");
    await page.fill("#loc-q", "https://maps.google.com/?q=Ichiran+Shibuya&ftid=0x60188ca8b7b3a1b1:0x22ae3f2c5d4f3e1a");
    await page.click("[data-loc-search]");
    await expect(page.locator(".loc-result")).toHaveCount(2);
    expect(searches.at(-1)).toBe("Ichiran Shibuya");
    await page.locator(".loc-result").first().click();
    await expect(page.locator(".loc-card")).toContainText(/Namen aus dem Link|name from the link/);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Geteilter Text aus Google Maps auf iOS (Name, Zeilenumbruch, Kurzlink) und Diagnose", async ({ page, context }, info) => {
    test.skip(!["iphone-15-webkit", "desktop-chromium"].includes(info.project.name), "zwei Profile reichen");
    const api = (req) => req.url().endsWith("/v1/status") ? { json: { mode: "private", geocode: true } }
      : req.url().endsWith("/v1/community") ? { json: { places: [], confirmations: [], hidden: [] } } : { status: 404, json: {} };
    await context.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript",
      body: 'window.turnstile={render(el,o){setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"),20);return "w"},reset(){},remove(){}};' }));
    const errors = await H.open(page, context, { api, storage: { "kitsuen.tester": "SECRET-CODE-1234-5678" } });
    const resolved = [];
    await context.route("https://*.workers.dev/v1/resolve-link", (r) => {
      resolved.push(JSON.parse(r.request().postData()).url);
      r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: true, url: "https://www.google.com/maps/place/A%CC%8ATER+Tokyo/@35.6874623,139.84663,17z/data=!3m1!4b1!8m2!3d35.6874623!4d139.84663?entry=tts&g_ep=abc" }) });
    });
    await page.click("#add-btn");
    // Einfügen wie aus der iOS-Zwischenablage; das Feld entfernt den Zeilenumbruch selbst
    await page.evaluate(() => { const el = document.getElementById("loc-q"); el.value = "ÅTER Tokyo\nhttps://maps.app.goo.gl/akkoLdQVouxV8ve17?g_st=ic"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.click("[data-loc-search]");
    await expect(page.locator("#loc-label")).toHaveText("ÅTER Tokyo");
    expect(resolved).toEqual(["https://maps.app.goo.gl/akkoLdQVouxV8ve17?g_st=ic"]);
    await expect.poll(() => page.evaluate(() => { const c = window.__smokr.map.getCenter(); return [+c.lng.toFixed(3), +c.lat.toFixed(3)]; })).toEqual([139.847, 35.687]);
    // Diagnose: Schritte sichtbar, keine Geheimnisse
    await page.click("[data-loc-diag]");
    const diag = await page.locator("#loc-diag").textContent();
    expect(diag).toMatch(/Version: App 21, Seite 21/);
    expect(diag).toContain("Link mit Text davor");
    expect(diag).toContain("1 Erkannt: Kurzlink maps.app.goo.gl");
    expect(diag).toContain("2 Weiterleitung aufgelöst: www.google.com, Position im Link (Ortsmarke)");
    expect(diag).toContain('Ergebnis: Position "ÅTER Tokyo"');
    expect(diag).toContain("Testcode vorhanden");
    expect(diag).not.toContain("SECRET-CODE");
    expect(diag).not.toContain("g_ep=");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Normale Besucher fragen die Community-API gar nicht an", async ({ page, context }) => {
    const calls = [];
    const errors = await H.open(page, context, { api: (req) => { calls.push(req.url()); return { json: { mode: "public" } }; } });
    await page.waitForTimeout(500);
    expect(calls).toEqual([]);
    await expect(page.locator("#add-btn")).toBeHidden();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Ohne Backend gibt es keine Community-Knöpfe, aber Rückmeldung per E-Mail", async ({ page, context }) => {
    const errors = await H.open(page, context);
    await expect(page.locator("#add-btn")).toBeHidden();
    await page.locator("#list .row").first().click();
    await expect(page.locator("[data-community-report]")).toHaveCount(0);
    const id = await page.evaluate(() => window.__smokr.state.selected);
    const href = await page.locator('#detail a[href^="mailto:"]').getAttribute("href");
    expect(href).toMatch(/^mailto:mail@sthb\.me\?subject=/);
    expect(decodeURIComponent(href)).toContain(id);
    const color = await page.locator('#detail a[href^="mailto:"]').evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(color).toBe("none");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
