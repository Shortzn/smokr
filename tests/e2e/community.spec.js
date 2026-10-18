// Community-Abläufe gegen einen lokal laufenden Worker. Aufruf: sh tests/tools/community-e2e.sh
const { test, expect } = require("@playwright/test");
const path = require("node:path");
const H = require("./helpers");

const API = process.env.SMOKR_API;
const PASSWORD = process.env.SMOKR_ADMIN_PASSWORD || "test-admin-password-123";
test.skip(!API, "SMOKR_API nicht gesetzt");

const TURNSTILE_STUB = `window.turnstile = {
  render(el, o) { const d = document.createElement("div"); d.className = "ts-stub"; d.textContent = "Turnstile (Test)"; el.append(d); setTimeout(() => o.callback("XXXX.DUMMY.TOKEN.XXXX"), 20); return "w" + Math.random(); },
  reset() {}, remove() {},
};`;

async function withCommunity(context) {
  await context.route("**/config.js", (r) => r.fulfill({
    contentType: "text/javascript",
    body: `window.SMOKR_CONFIG = { api: ${JSON.stringify(API)}, turnstileSiteKey: "1x00000000000000000000AA", contactUrl: "https://github.com/Shortzn/smokr/issues", legalUrl: "" };`,
  }));
  await context.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB }));
}
// Eine Sitzung für alle Aufrufe: der Login ist pro Gerät und Tag begrenzt
let cookie = null;
async function adminCall(p, body) {
  if (!cookie) {
    const login = await fetch(API + "/admin/login", { method: "POST", headers: { origin: API, "x-smokr-admin": "1", "content-type": "application/json" }, body: JSON.stringify({ password: PASSWORD }) });
    cookie = login.headers.get("set-cookie").split(";")[0];
  }
  const res = await fetch(API + p, { method: body ? "POST" : "GET", headers: { cookie, origin: API, "x-smokr-admin": "1", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

test.describe.configure({ mode: "serial" });

// Privater Testmodus: Codes erzeugt nur der Admin. Jeder Lauf bekommt einen eigenen.
let TESTER = null;
async function tester() {
  if (!TESTER) TESTER = (await adminCall("/admin/api/testers", { label: "e2e" })).code;
  return TESTER;
}
const unlocked = async () => ({ storage: { "kitsuen.tester": await tester() } });
// Jede Geräteprofil-Variante schickt ein anderes Foto (gleiche Fotos weist der Server ab)
function photoVariant(n) {
  const b = require("node:fs").readFileSync(path.join(__dirname, "..", "worker", "fixtures", "with-metadata.jpg"));
  const sos = b.indexOf(Buffer.from([0xff, 0xda]));
  let i = sos + 2 + b.readUInt16BE(sos + 2) + 20 + n * 7;
  while (b[i - 1] === 0xff || b[i] >= 0xf0) i++;
  b[i] ^= 0x01;
  return { name: "photo.jpg", mimeType: "image/jpeg", buffer: b };
}
const PROFILES = ["desktop-chromium", "iphone-15-webkit", "iphone-se-webkit"];

test("Ohne Testercode bleibt die Community zu, der Testlink schaltet sie frei", async ({ page, context }, info) => {
  test.skip(!["desktop-chromium", "iphone-15-webkit"].includes(info.project.name), "zwei Profile reichen");
  await withCommunity(context);
  const errors = await H.open(page, context);
  await page.waitForTimeout(300);
  await expect(page.locator("#add-btn")).toBeHidden();
  await page.goto("/#community");
  await H.ready(page);
  await expect(page.locator("#tester")).toBeVisible();
  await page.fill("#tester-input", "ABCD-EFGH-JKLM-NPQR");
  await page.click("#tester-submit");
  await expect(page.locator("#tester-error")).toBeVisible();
  await expect(page.locator("#add-btn")).toBeHidden();
  await page.fill("#tester-input", (await tester()).toLowerCase());
  await page.click("#tester-submit");
  await expect(page.locator("#tester")).toBeHidden();
  await expect(page.locator("#add-btn")).toBeVisible();
  expect(page.url()).not.toContain("#community");
  // "+" schiebt den Standort-Knopf nicht auf das Blatt
  if (!(await page.evaluate(() => window.__smokr.sheet.isPanel()))) {
    const loc = await page.locator("#locate").boundingBox();
    const add = await page.locator("#add-btn").boundingBox();
    const sheetY = await page.evaluate(() => window.__smokr.sheet.y);
    expect(loc.y + loc.height).toBeLessThanOrEqual(sheetY + 1);
    expect(add.y + add.height).toBeLessThanOrEqual(loc.y + 1);
  }
  // bleibt nach dem Neuladen frei
  await page.reload();
  await H.ready(page);
  await expect(page.locator("#add-btn")).toBeVisible();
  // und lässt sich in der Info wieder beenden
  await page.evaluate(() => document.getElementById("info").showModal());
  await page.click("#tester-leave");
  await expect(page.locator("#add-btn")).toBeHidden();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Platz hinzufügen mit Foto, erst nach Freigabe sichtbar", async ({ page, context }, info) => {
  test.skip(!PROFILES.includes(info.project.name), "drei Profile reichen");
  await withCommunity(context);
  const errors = await H.open(page, context, await unlocked());
  await expect(page.locator("#add-btn")).toBeVisible();
  const name = `Test spot ${info.project.name}`;
  // pro Profil ein anderer Ort: zweimal derselbe Ort vom selben Gerät gilt als Dublette
  const n = PROFILES.indexOf(info.project.name);
  const lat0 = 35.6906 + n * 0.002;
  await page.evaluate((lat) => window.__smokr.map.jumpTo({ center: [139.7006, lat], zoom: 17 }), lat0);
  await page.click("#add-btn");
  await expect(page.locator("#view-form")).toBeVisible();
  await expect(page.locator("#add-pin")).toBeVisible();
  await page.locator('#community-form label:has(input[value="room"])').click();
  await page.locator('#community-form label:has(input[value="heated"])').click();
  await page.fill("#f-name", name);
  await page.fill("#f-floor", "B1, exit 3");
  await page.setInputFiles("#f-photo", photoVariant(n));
  await expect(page.locator(".photo-preview img")).toBeVisible();
  // ohne Zustimmung geht es nicht
  await page.click("#form-submit");
  await expect(page.locator("#form-error")).toBeVisible();
  await page.locator("label.check-row").click();
  await expect(page.locator(".ts-stub")).toBeVisible();
  await page.click("#form-submit");
  await expect(page.locator(".form-done")).toContainText("geprüft");
  await H.noHorizontalOverflow(page);

  // Noch nicht öffentlich
  const before = await (await fetch(API + "/v1/community")).json();
  expect(before.places.find((p) => p.name === name)).toBeUndefined();
  const q = await adminCall("/admin/api/queue");
  const sub = q.submissions.find((s) => s.name === name);
  expect(sub.category).toBe("room");
  expect(sub.tobacco).toBe("heated");
  expect(Math.abs(sub.lat - lat0)).toBeLessThan(0.001);
  expect(sub.photo_id).toMatch(/^[0-9a-f]{32}$/);
  await adminCall(`/admin/api/submissions/${sub.id}`, { action: "approve" });

  await page.reload();
  await H.ready(page);
  await page.waitForFunction((id) => window.__smokr.state.byId.has(id), `com-${sub.id}`);
  await page.evaluate((id) => { const s = window.__smokr.state.byId.get(id); window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 18 }); }, `com-${sub.id}`);
  await H.waitIdle(page);
  await page.locator(`#list .row[data-id="com-${sub.id}"]`).click();
  await expect(page.locator("#detail")).toContainText(name);
  await expect(page.locator("#detail")).toContainText("Community");
  await expect(page.locator("#detail")).toContainText("Nur Tabakerhitzer");
  const img = page.locator("#detail .photos img").first();
  await expect(img).toBeVisible();
  // Fotos laden "lazy": auf kleinen Bildschirmen erst, wenn sie ins Bild kommen
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el) => el.naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Meldung: nicht vorhanden, Admin blendet aus", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "ein Profil reicht");
  await withCommunity(context);
  const errors = await H.open(page, context, await unlocked());
  const id = "osm-n1376452307";
  const exists = await page.evaluate((x) => window.__smokr.state.byId.has(x), id);
  const target = exists ? id : await page.evaluate(() => window.__smokr.state.spots.find((s) => s.id.startsWith("osm-") && s.k === "p").id);
  await page.evaluate((x) => { const s = window.__smokr.state.byId.get(x); window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 18 }); }, target);
  await H.waitIdle(page);
  await page.locator(`#list .row[data-id="${target}"]`).click();
  await page.click("[data-community-report]");
  await page.locator('#community-form label:has(input[value="missing"])').click();
  await page.fill("#f-comment", "Only a construction site now");
  await expect(page.locator(".ts-stub")).toBeVisible();
  await page.click("#form-submit");
  await expect(page.locator(".form-done")).toBeVisible();
  const q = await adminCall("/admin/api/queue");
  const rep = q.reports.find((r) => r.spot_id === target && r.kind === "missing");
  expect(rep.comment).toBe("Only a construction site now");
  // Eine Meldung allein ändert nichts
  await page.reload();
  await H.ready(page);
  expect(await page.evaluate((x) => window.__smokr.state.byId.has(x), target)).toBe(true);
  await adminCall(`/admin/api/reports/${rep.id}`, { action: "hide_spot", note: "e2e" });
  await page.reload();
  await H.ready(page);
  await page.waitForFunction(() => window.__smokr.state.community);
  expect(await page.evaluate((x) => window.__smokr.state.byId.has(x), target)).toBe(false);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Fehler vom Server werden verständlich angezeigt", async ({ page, context }, info) => {
  test.skip(info.project.name !== "iphone-15-webkit", "ein Profil reicht");
  await withCommunity(context);
  await context.route(`${API}/v1/submissions`, (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "rate_limited" }), headers: { "access-control-allow-origin": "*" } }));
  const errors = await H.open(page, context, await unlocked());
  await page.click("#add-btn");
  await expect(page.locator(".ts-stub")).toBeVisible();
  await page.click("#form-submit");
  await expect(page.locator("#form-error")).toContainText("Zu viele Einsendungen");
  await expect(page.locator("#form-submit")).toBeEnabled();
  await page.click("#form-back");
  await expect(page.locator("#view-list")).toBeVisible();
  await expect(page.locator("#add-pin")).toBeHidden();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Meldung: falsche Position schickt den Vorschlag aus der Kartenmitte", async ({ page, context }, info) => {
  test.skip(info.project.name !== "iphone-15-webkit", "ein Profil reicht");
  await withCommunity(context);
  const errors = await H.open(page, context, await unlocked());
  const target = await page.evaluate(() => window.__smokr.state.spots.find((s) => s.id.startsWith("off-")).id);
  await page.evaluate((x) => { const s = window.__smokr.state.byId.get(x); window.__smokr.map.jumpTo({ center: [s.lon, s.lat], zoom: 18 }); }, target);
  await H.waitIdle(page);
  await page.locator(`#list .row[data-id="${target}"]`).click();
  await page.click("[data-community-report]");
  await expect(page.locator("#add-pin")).toBeHidden();
  await page.locator('#community-form label:has(input[value="position"])').click();
  await expect(page.locator("#add-pin")).toBeVisible();
  await expect(page.locator("#pos-hint")).toBeVisible();
  const c = await page.evaluate(() => { const m = window.__smokr.map; m.jumpTo({ center: [m.getCenter().lng + 0.0003, m.getCenter().lat] }); const x = m.getCenter(); return [x.lng, x.lat]; });
  await expect(page.locator(".ts-stub")).toBeVisible();
  await page.click("#form-submit");
  await expect(page.locator(".form-done")).toBeVisible();
  const q = await adminCall("/admin/api/queue");
  const rep = q.reports.find((r) => r.spot_id === target && r.kind === "position");
  expect(Math.abs(rep.sug_lon - c[0])).toBeLessThan(0.00001);
  expect(Math.abs(rep.sug_lat - c[1])).toBeLessThan(0.00001);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Platz per Namenssuche: Genauigkeit und Herkunft kommen in der Moderation an", async ({ page, context }, info) => {
  test.skip(info.project.name !== "iphone-15-webkit", "ein Profil reicht");
  const FX = require("../unit/locate-fixtures.js");
  await withCommunity(context);
  await context.route("https://nominatim.openstreetmap.org/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(FX.NOMINATIM) }));
  const errors = await H.open(page, context, await unlocked());
  await page.click("#add-btn");
  await page.fill("#loc-q", "Ichiran Shibuya");
  await page.click("[data-loc-search]");
  await page.locator(".loc-result").first().click();
  await expect(page.locator("#loc-label")).toHaveText("Ichiran");
  await page.fill("#f-floor", "B1");
  await expect(page.locator(".ts-stub")).toBeVisible();
  await page.click("#form-submit");
  await expect(page.locator(".form-done")).toBeVisible();
  const q = await adminCall("/admin/api/queue");
  const sub = q.submissions.find((s) => s.name === "Ichiran" && s.floor === "B1");
  expect(sub.pos_quality).toBe("building");
  expect(sub.pos_source).toBe("search");
  expect(sub.address).toBe("Ichiran, Jinnan 1, Shibuya");
  expect(Math.abs(sub.lat - 35.6610233)).toBeLessThan(0.0002);
  expect(errors, errors.join("\n")).toEqual([]);
});
