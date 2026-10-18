// Community-Abläufe gegen einen lokal laufenden Worker. Aufruf: sh tests/tools/community-e2e.sh
const { test, expect } = require("@playwright/test");
const path = require("node:path");
const H = require("./helpers");

const API = process.env.SMOKR_API;
const PASSWORD = "test-admin-password-123";
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
async function adminCall(p, body) {
  const login = await fetch(API + "/admin/login", { method: "POST", headers: { origin: API, "x-smokr-admin": "1", "content-type": "application/json" }, body: JSON.stringify({ password: PASSWORD }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const res = await fetch(API + p, { method: body ? "POST" : "GET", headers: { cookie, origin: API, "x-smokr-admin": "1", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

test.describe.configure({ mode: "serial" });

test("Platz hinzufügen mit Foto, erst nach Freigabe sichtbar", async ({ page, context }, info) => {
  test.skip(!["desktop-chromium", "iphone-15-webkit", "iphone-se-webkit"].includes(info.project.name), "drei Profile reichen");
  await withCommunity(context);
  const errors = await H.open(page, context);
  await expect(page.locator("#add-btn")).toBeVisible();
  const name = `Test spot ${info.project.name}`;
  await page.evaluate(() => window.__smokr.map.jumpTo({ center: [139.7006, 35.6906], zoom: 17 }));
  await page.click("#add-btn");
  await expect(page.locator("#view-form")).toBeVisible();
  await expect(page.locator("#add-pin")).toBeVisible();
  await page.locator('#community-form label:has(input[value="room"])').click();
  await page.locator('#community-form label:has(input[value="heated"])').click();
  await page.fill("#f-name", name);
  await page.fill("#f-floor", "B1, exit 3");
  await page.setInputFiles("#f-photo", path.join(__dirname, "..", "worker", "fixtures", "with-metadata.jpg"));
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
  expect(Math.abs(sub.lat - 35.6906)).toBeLessThan(0.002);
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
  await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Meldung: nicht vorhanden, Admin blendet aus", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "ein Profil reicht");
  await withCommunity(context);
  const errors = await H.open(page, context);
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
  const errors = await H.open(page, context);
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
