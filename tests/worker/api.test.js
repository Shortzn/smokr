// Tests für die Community-API gegen einen lokal laufenden Worker (wrangler dev, lokale D1).
// Aufruf: sh tests/tools/worker-test.sh
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const API = process.env.SMOKR_API || "http://127.0.0.1:8787";
const ORIGIN = "http://127.0.0.1:4181";
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX"; // Cloudflare-Testschlüssel akzeptiert diesen Token
const PASSWORD = "test-admin-password-123";
const fixture = (n) => fs.readFileSync(path.join(__dirname, "fixtures", n));

function form(fields, photo) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  if (photo) fd.append("photo", new Blob([photo], { type: "image/jpeg" }), "photo.jpg");
  return fd;
}
const place = (over) => Object.assign({ turnstile: TOKEN, lat: "35.6812", lon: "139.7671", category: "public", tobacco: "all", access: "public", lang: "en" }, over);
// Lokal reicht wrangler den Header durch; in Produktion setzt ihn Cloudflare selbst
let ip = "203.0.113.1";
function post(p, body, headers) {
  return fetch(API + p, { method: "POST", body, headers: Object.assign({ origin: ORIGIN, "cf-connecting-ip": ip }, headers) });
}
let adminCookie = null;
async function admin(p, body, extra) {
  return fetch(API + p, {
    method: body === undefined ? "GET" : "POST",
    headers: Object.assign({ cookie: adminCookie || "", origin: API, "x-smokr-admin": "1", "content-type": "application/json" }, extra),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("Gesundheit und leere Community", async () => {
  const h = await (await fetch(API + "/health")).json();
  assert.equal(h.ok, true);
  const c = await (await fetch(API + "/v1/community", { headers: { origin: ORIGIN } })).json();
  assert.deepEqual(c.places, []);
  assert.deepEqual(c.hidden, []);
});

test("Schreiben nur von erlaubtem Ursprung und mit Turnstile", async () => {
  let r = await post("/v1/submissions", form(place()), { origin: "https://evil.example" });
  assert.equal(r.status, 403);
  r = await post("/v1/submissions", form(place({ turnstile: "" })));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "captcha");
  r = await fetch(API + "/v1/submissions", { method: "OPTIONS", headers: { origin: "https://evil.example" } });
  assert.equal(r.status, 403);
  r = await fetch(API + "/v1/submissions", { method: "OPTIONS", headers: { origin: ORIGIN } });
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
});

test("Eingaben werden serverseitig geprüft", async () => {
  ip = "203.0.113.2";
  for (const [over, why] of [
    [{ lat: "48.2", lon: "16.37" }, "außerhalb Japans"],
    [{ category: "bar" }, "falsche Kategorie"],
    [{ note: "cheap pills at https://spam.example" }, "Link"],
    [{ name: "x".repeat(81) }, "zu lang"],
  ]) {
    const r = await post("/v1/submissions", form(place(over)));
    assert.equal(r.status, 400, why);
    assert.equal((await r.json()).error, "invalid", why);
  }
  let r = await post("/v1/submissions", form(place(), fixture("plain.jpg")));
  assert.equal((await r.json()).error, "invalid", "Foto ohne Zustimmung");
  r = await post("/v1/submissions", form(place({ consent: "1" }), fs.readFileSync(path.join(__dirname, "..", "..", "app", "icons", "icon-192.png"))));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "photo", "PNG statt JPEG");
  r = await post("/v1/reports", form({ turnstile: TOKEN, spot_id: "../../etc", kind: "found" }));
  assert.equal(r.status, 400);
});

let subId, photoId;
test("Einreichung bleibt privat bis zur Freigabe, Metadaten sind entfernt", async () => {
  ip = "203.0.113.3";
  const r = await post("/v1/submissions", form(place({ name: "Test Smoking Area", note: "Behind the police box", consent: "1" }), fixture("with-metadata.jpg")));
  assert.equal(r.status, 201);
  const body = await r.json();
  subId = body.id;
  assert.equal(body.status, "pending");
  const c = await (await fetch(API + "/v1/community")).json();
  assert.equal(c.places.length, 0, "nicht öffentlich vor Freigabe");

  // Admin
  assert.equal((await admin("/admin/api/queue")).status, 401);
  let login = await fetch(API + "/admin/login", { method: "POST", headers: { origin: API, "content-type": "application/json" }, body: JSON.stringify({ password: PASSWORD }) });
  assert.equal(login.status, 403, "ohne Admin-Header");
  login = await admin("/admin/login", { password: "wrong" });
  assert.equal(login.status, 401);
  login = await admin("/admin/login", { password: PASSWORD });
  assert.equal(login.status, 200);
  const set = login.headers.get("set-cookie");
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  assert.match(set, /Secure/);
  adminCookie = set.split(";")[0];
  const q = await (await admin("/admin/api/queue")).json();
  const sub = q.submissions.find((s) => s.id === subId);
  assert.ok(sub, "in der Warteschlange");
  photoId = sub.photo_id;
  assert.match(photoId, /^[0-9a-f]{32}$/);

  // Direkte URL vor Freigabe: nicht abrufbar
  assert.equal((await fetch(`${API}/v1/photos/${photoId}`)).status, 404);
  // Admin sieht das bereinigte Foto
  const raw = Buffer.from(await (await admin(`/admin/api/photos/${photoId}`)).arrayBuffer());
  assert.equal(raw[0], 0xff);
  assert.ok(!raw.includes("SECRET"), "Metadaten entfernt");
  assert.ok(!raw.includes("Exif"), "EXIF entfernt");
  assert.equal(raw.slice(-2).toString("hex"), "ffd9", "endet mit Bildende, ohne Anhang");

  // CSRF: Moderation ohne Admin-Header geht nicht
  const csrf = await fetch(`${API}/admin/api/submissions/${subId}`, { method: "POST", headers: { cookie: adminCookie, origin: API, "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
  assert.equal(csrf.status, 403);
  const fake = await fetch(`${API}/admin/api/queue`, { headers: { cookie: "smokr_admin=9999999999.AAAA" } });
  assert.equal(fake.status, 401, "gefälschte Sitzung");

  assert.equal((await admin(`/admin/api/submissions/${subId}`, { action: "approve", note: "ok" })).status, 200);
  const c2 = await (await fetch(API + "/v1/community")).json();
  assert.equal(c2.places.length, 1);
  assert.equal(c2.places[0].name, "Test Smoking Area");
  assert.deepEqual(c2.places[0].photos, [photoId]);
  const pub = await fetch(`${API}/v1/photos/${photoId}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get("content-type"), "image/jpeg");
  assert.equal(pub.headers.get("x-content-type-options"), "nosniff");
});

test("Meldungen: Bestätigung zählt erst nach Freigabe, Ausblenden nur durch Admin", async () => {
  ip = "203.0.113.4";
  let r = await post("/v1/reports", form({ turnstile: TOKEN, spot_id: "off-chiyoda-1", kind: "found", comment: "Still there", lang: "de" }));
  assert.equal(r.status, 201);
  const found = (await r.json()).id;
  r = await post("/v1/reports", form({ turnstile: TOKEN, spot_id: "osm-n123", kind: "missing", lang: "en" }));
  const missing = (await r.json()).id;
  let c = await (await fetch(API + "/v1/community")).json();
  assert.equal(c.confirmations.length, 0, "anonyme Meldung wirkt nicht sofort");
  assert.deepEqual(c.hidden, []);
  await admin(`/admin/api/reports/${found}`, { action: "approve" });
  await admin(`/admin/api/reports/${missing}`, { action: "hide_spot", note: "checked on site" });
  c = await (await fetch(API + "/v1/community")).json();
  const conf = c.confirmations.find((x) => x.spot_id === "off-chiyoda-1");
  assert.equal(conf.n, 1);
  assert.deepEqual(c.hidden, ["osm-n123"]);
});

test("Foto melden und zurückziehen", async () => {
  const r = await post(`/v1/photos/${photoId}/flag`, JSON.stringify({ reason: "privacy" }), { "content-type": "application/json" });
  assert.equal(r.status, 200);
  const q = await (await admin("/admin/api/queue")).json();
  assert.equal(q.flagged[0].id, photoId);
  await admin(`/admin/api/photos/${photoId}`, { action: "withdraw" });
  assert.equal((await fetch(`${API}/v1/photos/${photoId}`)).status, 404);
  assert.equal((await admin(`/admin/api/photos/${photoId}`)).status, 404, "Bilddaten gelöscht");
  const c = await (await fetch(API + "/v1/community")).json();
  assert.deepEqual(c.places[0].photos, []);
});

test("Sicherung enthält alles außer Bilddaten", async () => {
  const r = await admin("/admin/api/export");
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.submissions.length >= 1);
  assert.ok(!JSON.stringify(d).includes("ip_hash"));
});

test("Ratenbegrenzung stoppt Massenmeldungen", async () => {
  ip = "203.0.113.9";
  let last;
  for (let i = 0; i < 14; i++) {
    last = await post("/v1/submissions", form(place({ name: `Spam ${i}` })));
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429);
  assert.equal((await last.json()).error, "rate_limited");
});

test("Admin-Seite ist abgesichert", async () => {
  const r = await fetch(API + "/admin");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("cache-control"), "no-store");
  const out = await admin("/admin/logout", {});
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
});
