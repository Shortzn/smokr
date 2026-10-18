// Tests für die Community-API gegen einen lokal laufenden Worker (wrangler dev, lokale D1).
// Aufruf: sh tests/tools/worker-test.sh
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const API = process.env.SMOKR_API || "http://127.0.0.1:8787";
const ORIGIN = "http://127.0.0.1:4181";
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX"; // Cloudflare-Testschlüssel akzeptiert diesen Token
// Lokal fest, in der Staging-Umgebung (GitHub Actions) ein zufälliges Passwort pro Lauf
const PASSWORD = process.env.SMOKR_ADMIN_PASSWORD || "test-admin-password-123";
// Bei Cloudflare setzt Cloudflare die IP selbst; Tests, die verschiedene Geräte brauchen, laufen nur lokal
const REMOTE = process.env.SMOKR_REMOTE === "1";
const localOnly = REMOTE ? { skip: "braucht verschiedene IP-Adressen (nur lokal)" } : {};
const fixture = (n) => fs.readFileSync(path.join(__dirname, "fixtures", n));

function form(fields, photo) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  if (photo) fd.append("photo", new Blob([photo], { type: "image/jpeg" }), "photo.jpg");
  return fd;
}
// Privater Testmodus: jede Einsendung braucht einen Testercode, den nur der Admin erzeugt
let TESTER = null;
// Varianten eines Fotos: ein Byte in den Bilddaten ändern, damit der Server sie nicht als Dublette abweist
function variant(buf, n) {
  const b = Buffer.from(buf);
  let sos = b.indexOf(Buffer.from([0xff, 0xda]));
  let i = sos + 2 + b.readUInt16BE(sos + 2) + 20 + n * 7;
  while (b[i - 1] === 0xff || b[i] >= 0xf0) i++;
  b[i] ^= 0x01;
  return b;
}
const place = (over) => Object.assign({ tester: TESTER, turnstile: TOKEN, lat: "35.6812", lon: "139.7671", category: "public", tobacco: "all", access: "public", lang: "en" }, over);
// Lokal reicht wrangler den Header durch; in Produktion setzt ihn Cloudflare selbst
let ip = "203.0.113.1";
function post(p, body, headers) {
  // Cloudflare weist Anfragen ab, die diesen Header selbst setzen (403); bei Cloudflare setzt er ihn selbst
  const fake = REMOTE ? {} : { "cf-connecting-ip": ip };
  return fetch(API + p, { method: "POST", body, headers: Object.assign({ origin: ORIGIN }, fake, headers) });
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

async function adminLogin() {
  const login = await admin("/admin/login", { password: PASSWORD });
  assert.equal(login.status, 200);
  adminCookie = login.headers.get("set-cookie").split(";")[0];
}

test("Privater Modus: ohne gültigen Testercode keine Einsendung", async () => {
  ip = "203.0.113.20";
  const st = await (await fetch(API + "/v1/status", { headers: { origin: ORIGIN } })).json();
  assert.equal(st.mode, "private");
  let r = await post("/v1/submissions", form(place()));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "tester");
  r = await post("/v1/submissions", form(place({ tester: "ABCD-EFGH-JKLM-NPQR" })));
  assert.equal((await r.json()).error, "tester", "erfundener Code");
  // Codes erzeugt nur der Admin; gespeichert wird nur der Hash
  assert.equal((await admin("/admin/api/testers", { label: "x" })).status, 401);
  await adminLogin();
  r = await admin("/admin/api/testers", { label: "Stefan iPhone" });
  const created = await r.json();
  assert.match(created.code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  TESTER = created.code;
  const exp = await (await admin("/admin/api/export")).json();
  assert.ok(!JSON.stringify(exp).includes(TESTER), "Klartext-Code nirgends gespeichert");
  // Prüfung in der App: Groß/klein und Bindestriche egal
  r = await post("/v1/tester", JSON.stringify({ code: TESTER.toLowerCase().replace(/-/g, " ") }), { "content-type": "application/json" });
  assert.equal(r.status, 200);
  r = await post("/v1/tester", JSON.stringify({ code: "nope" }), { "content-type": "application/json" });
  assert.equal(r.status, 403);
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
  r = await post("/v1/reports", form({ tester: TESTER, turnstile: TOKEN, spot_id: "../../etc", kind: "found" }));
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
  adminCookie = null;
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
  let r = await post("/v1/reports", form({ tester: TESTER, turnstile: TOKEN, spot_id: "off-chiyoda-1", kind: "found", comment: "Still there", lang: "de" }));
  assert.equal(r.status, 201);
  const found = (await r.json()).id;
  r = await post("/v1/reports", form({ tester: TESTER, turnstile: TOKEN, spot_id: "osm-n123", kind: "missing", lang: "en" }));
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
  let r = await post(`/v1/photos/${photoId}/flag`, JSON.stringify({ reason: "privacy" }), { "content-type": "application/json" });
  assert.equal(r.status, 403, "auch Melden braucht im Testmodus einen Code");
  r = await post(`/v1/photos/${photoId}/flag`, JSON.stringify({ reason: "privacy", tester: TESTER }), { "content-type": "application/json" });
  assert.equal(r.status, 200);
  const q = await (await admin("/admin/api/queue")).json();
  assert.equal(q.flagged[0].id, photoId);
  await admin(`/admin/api/photos/${photoId}`, { action: "withdraw" });
  assert.equal((await fetch(`${API}/v1/photos/${photoId}`)).status, 404);
  assert.equal((await admin(`/admin/api/photos/${photoId}`)).status, 404, "Bilddaten gelöscht");
  const c = await (await fetch(API + "/v1/community")).json();
  assert.deepEqual(c.places[0].photos, []);
});

test("Manipulierte Fotos und zu große Anfragen werden abgewiesen", async () => {
  ip = "203.0.113.40";
  const plain = fixture("plain.jpg");
  const cases = [
    [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(500, 0x41)]), "JPEG-Kopf mit Müll"],
    [plain.subarray(0, Math.floor(plain.length / 2)), "abgeschnittenes JPEG"],
    [Buffer.concat([Buffer.from("<?php echo 1; ?>"), plain]), "Skript vor dem Bild"],
  ];
  for (const [buf, why] of cases) {
    const r = await post("/v1/submissions", form(place({ lat: "35.75", lon: "139.75", consent: "1" }), buf));
    assert.equal(r.status, 400, why);
    assert.equal((await r.json()).error, "photo", why);
  }
  // Anfrage über 2 MB: abgewiesen, bevor etwas gespeichert wird
  const big = await post("/v1/submissions", form(place({ lat: "35.76", lon: "139.75", consent: "1" }), Buffer.alloc(2.5 * 1024 * 1024, 0xff)));
  assert.equal(big.status, 400);
  // Kein Foto aus diesen Versuchen gespeichert
  const q = await (await admin("/admin/api/queue")).json();
  assert.ok(!q.submissions.some((x) => Math.abs(x.lat - 35.75) < 0.001 || Math.abs(x.lat - 35.76) < 0.001));
});

test("Abgelehnt heißt gelöscht: Foto ist danach auch für den Admin weg", async () => {
  ip = "203.0.113.41";
  const r = await post("/v1/submissions", form(place({ lat: "35.77", lon: "139.75", name: "[TEST] reject me", consent: "1" }), variant(fixture("plain.jpg"), 30)));
  assert.equal(r.status, 201);
  const id = (await r.json()).id;
  const sub = (await (await admin("/admin/api/queue")).json()).submissions.find((x) => x.id === id);
  assert.match(sub.photo_id, /^[0-9a-f]{32}$/);
  assert.equal((await admin(`/admin/api/photos/${sub.photo_id}`)).status, 200);
  assert.equal((await admin(`/admin/api/submissions/${id}`, { action: "reject", note: "test" })).status, 200);
  assert.equal((await admin(`/admin/api/photos/${sub.photo_id}`)).status, 404, "Bilddaten gelöscht");
  assert.equal((await fetch(`${API}/v1/photos/${sub.photo_id}`)).status, 404);
  const c = await (await fetch(API + "/v1/community")).json();
  assert.ok(!c.places.some((p) => p.name === "[TEST] reject me"));
  const exp = await (await admin("/admin/api/export")).json();
  assert.ok(exp.audit.some((a) => a.target === String(id) && /reject/.test(a.action)), "Entscheidung protokolliert");
});

test("Doppelte Einsendungen werden abgewiesen", async () => {
  ip = "203.0.113.30";
  let r = await post("/v1/submissions", form(place({ lat: "35.6900", lon: "139.7000", name: "Dup A" })));
  assert.equal(r.status, 201);
  r = await post("/v1/submissions", form(place({ lat: "35.69005", lon: "139.70005", name: "Dup B" })));
  assert.equal(r.status, 409, "gleiches Gerät, 7 m daneben");
  assert.equal((await r.json()).error, "duplicate");
  r = await post("/v1/submissions", form(place({ lat: "35.6950", lon: "139.7000", name: "Elsewhere" })));
  assert.equal(r.status, 201, "550 m weiter ist kein Duplikat");
  r = await post("/v1/reports", form({ tester: TESTER, turnstile: TOKEN, spot_id: "off-chiyoda-2", kind: "missing" }));
  assert.equal(r.status, 201);
  r = await post("/v1/reports", form({ tester: TESTER, turnstile: TOKEN, spot_id: "off-chiyoda-2", kind: "missing" }));
  assert.equal(r.status, 409, "dieselbe Meldung zweimal");
});

test("Falsche Position: Vorschlag kommt mit, Admin kann korrigieren", async () => {
  ip = "203.0.113.31";
  let r = await post("/v1/reports", form({ tester: TESTER, turnstile: TOKEN, spot_id: "off-chiyoda-3", kind: "position", sug_lat: "35.681234", sug_lon: "139.767123" }));
  assert.equal(r.status, 201);
  const id = (await r.json()).id;
  r = await post("/v1/reports", form({ tester: TESTER, turnstile: TOKEN, spot_id: "off-chiyoda-4", kind: "position", sug_lat: "48.2", sug_lon: "16.37" }));
  assert.equal(r.status, 400, "Vorschlag außerhalb Japans");
  const q = await (await admin("/admin/api/queue")).json();
  const rep = q.reports.find((x) => x.id === id);
  assert.equal(rep.sug_lat, 35.681234);
  assert.equal(rep.sug_lon, 139.767123);
  // Eintrag korrigieren
  const sub = q.submissions.find((x) => x.name === "Elsewhere");
  r = await admin(`/admin/api/submissions/${sub.id}`, { action: "edit", fields: { name: "Corrected name", floor: "B1", lat: "35.6951" } });
  assert.equal(r.status, 200);
  r = await admin(`/admin/api/submissions/${sub.id}`, { action: "edit", fields: { category: "bar" } });
  assert.equal(r.status, 400, "gleiche Prüfungen wie öffentlich");
  await admin(`/admin/api/submissions/${sub.id}`, { action: "approve" });
  const c = await (await fetch(API + "/v1/community")).json();
  const p = c.places.find((x) => x.name === "Corrected name");
  assert.ok(p, "korrigierter Name ist öffentlich");
  assert.equal(p.floor, "B1");
});

test("Fotos: Dubletten abgewiesen, Speicherbudget wird eingehalten und angezeigt", async () => {
  ip = "203.0.113.32";
  const base = fixture("plain.jpg");
  let r = await post("/v1/submissions", form(place({ lat: "35.70", lon: "139.71", consent: "1" }), variant(base, 0)));
  assert.equal(r.status, 201);
  r = await post("/v1/submissions", form(place({ lat: "35.71", lon: "139.71", consent: "1" }), variant(base, 0)));
  assert.equal(r.status, 409, "dasselbe Foto noch einmal");
  assert.equal((await r.json()).error, "duplicate");
  // Budget im Test: 20 000 Bytes, ein Foto hat gut 5 000
  let last, n = 1;
  for (; n < 8; n++) {
    last = await post("/v1/submissions", form(place({ lat: String(35.70 + n * 0.01), lon: "139.72", consent: "1" }), variant(base, n)));
    if (last.status !== 201) break;
  }
  assert.equal(last.status, 507);
  assert.equal((await last.json()).error, "storage");
  const r2 = await post("/v1/submissions", form(place({ lat: "35.80", lon: "139.80" })));
  assert.equal(r2.status, 201, "ohne Foto geht es weiter");
  const u = (await (await admin("/admin/api/queue")).json()).usage;
  assert.equal(u.photo_budget, 20000);
  assert.ok(u.photo_bytes <= 20000 && u.photo_bytes > 10000);
  assert.ok(u.photo_count >= 3);
  assert.equal(u.db_limit, 500 * 1024 * 1024);
  assert.ok(u.writes_today > 0);
});

test("Widerrufene Codes gelten sofort nicht mehr", async () => {
  ip = "203.0.113.33";
  const code = (await (await admin("/admin/api/testers", { label: "revoke me" })).json()).code;
  let r = await post("/v1/reports", form({ tester: code, turnstile: TOKEN, spot_id: "off-chiyoda-5", kind: "found" }));
  assert.equal(r.status, 201);
  const q = await (await admin("/admin/api/queue")).json();
  const t = q.testers.find((x) => x.label === "revoke me");
  assert.equal(t.uses, 1);
  assert.ok(!("code_hash" in t), "Hash wird nicht ausgeliefert");
  assert.equal((await admin(`/admin/api/testers/${t.id}/revoke`, {})).status, 200);
  r = await post("/v1/reports", form({ tester: code, turnstile: TOKEN, spot_id: "off-chiyoda-6", kind: "found" }));
  assert.equal(r.status, 403);
});

test("Zu viele Fehlversuche sperren nur dieses Gerät", localOnly, async () => {
  let r;
  // Raten: nach 20 Fehlversuchen ist für dieses Gerät Schluss, auch mit gültigem Code
  ip = "203.0.113.34";
  for (let i = 0; i < 20; i++) {
    r = await post("/v1/tester", JSON.stringify({ code: `WRNG-CODE-AAAA-${String(i).padStart(4, "2").replace(/[01]/g, "2")}` }), { "content-type": "application/json" });
    assert.equal(r.status, 403);
  }
  r = await post("/v1/tester", JSON.stringify({ code: TESTER }), { "content-type": "application/json" });
  assert.equal(r.status, 429);
  ip = "203.0.113.35";
  r = await post("/v1/tester", JSON.stringify({ code: TESTER }), { "content-type": "application/json" });
  assert.equal(r.status, 200, "anderes Gerät nicht betroffen");
});

test("Nächtliches Aufräumen löscht Texte abgelehnter Beiträge nach 30 Tagen", localOnly, async () => {
  ip = "203.0.113.50";
  const r = await post("/v1/submissions", form(place({ lat: "35.81", lon: "139.70", name: "[TEST] old rejected", note: "private text" })));
  const id = (await r.json()).id;
  const keep = await post("/v1/submissions", form(place({ lat: "35.82", lon: "139.70", name: "[TEST] fresh rejected" })));
  const keepId = (await keep.json()).id;
  await admin(`/admin/api/submissions/${id}`, { action: "reject" });
  await admin(`/admin/api/submissions/${keepId}`, { action: "reject" });
  // Entscheidung 31 Tage zurückdatieren (nur in der lokalen Testdatenbank)
  require("node:child_process").execFileSync("npx", ["wrangler", "d1", "execute", "smokr-community", "--local", "--command",
    `UPDATE submissions SET reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-31 days') WHERE id = ${Number(id)}`],
  { cwd: path.join(__dirname, "..", "..", "worker"), stdio: "ignore" });
  assert.equal((await fetch(API + "/__scheduled?cron=17+3+*+*+*")).status, 200);
  const subs = (await (await admin("/admin/api/export")).json()).submissions;
  const old = subs.find((x) => x.id === id), fresh = subs.find((x) => x.id === keepId);
  assert.equal(old.name, null);
  assert.equal(old.note, null);
  assert.equal(old.status, "rejected", "Entscheidung bleibt nachvollziehbar");
  assert.equal(fresh.name, "[TEST] fresh rejected", "jüngere Ablehnungen bleiben 30 Tage");
});

test("Sicherung enthält alles außer Bilddaten", async () => {
  const r = await admin("/admin/api/export");
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.submissions.length >= 1);
  assert.ok(!JSON.stringify(d).includes("ip_hash"));
  assert.ok(!JSON.stringify(d).includes("code_hash"));
  assert.ok(d.testers.length >= 2);
});

test("Ratenbegrenzung stoppt Massenmeldungen", localOnly, async () => {
  ip = "203.0.113.9";
  let last;
  for (let i = 0; i < 14; i++) {
    last = await post("/v1/submissions", form(place({ name: `Spam ${i}`, lat: String(35.6 + i * 0.01) })));
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
