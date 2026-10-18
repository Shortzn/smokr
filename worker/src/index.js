// Smokr Community API und Moderation (Cloudflare Worker mit D1).
//
// Öffentlich:
//   GET  /v1/community            freigegebene Plätze, Bestätigungen, ausgeblendete Plätze
//   GET  /v1/photos/:id           nur freigegebene Fotos
//   POST /v1/submissions          neuer Platz (multipart), Turnstile Pflicht
//   POST /v1/reports              Meldung zu einem Platz (multipart), Turnstile Pflicht
//   POST /v1/photos/:id/flag      Foto melden
//   GET  /v1/status               Modus (off | private | public), damit die App weiß, was sie zeigen darf
//   POST /v1/tester               Testercode prüfen (nur im privaten Modus nötig)
//   POST /v1/resolve-link         Google-Maps-Kurzlink auflösen (nur Weiterleitung, keine Inhalte)
// COMMUNITY_MODE (wrangler.toml): "off" nimmt nichts an, "private" nur mit gültigem Testercode,
// "public" für alle. Die Sperre wirkt hier auf dem Server, nicht nur in der App.
// Admin (Cookie-Sitzung, nur gleicher Ursprung):
//   GET  /admin                   Oberfläche
//   POST /admin/login, /admin/logout
//   GET  /admin/api/queue, /admin/api/photos/:id, /admin/api/export
//   POST /admin/api/<submissions|reports|photos>/:id   {action, note}

import { cleanJpeg, PhotoError } from "./jpeg.js";
import { ADMIN_HTML } from "./admin.js";
import {
  ipHash, verifyTurnstile, takeToken, verifyPassword, makeSession, checkSession, cookie, randomId, sha256Hex,
} from "./security.js";

const MAX_BODY = 2 * 1024 * 1024;
// D1 Free: 500 MB pro Datenbank. Fotos bekommen ein festes Budget darunter, der Rest bleibt für Daten.
const MAX_PHOTO = 1024 * 1024;
const DEFAULT_PHOTO_BUDGET = 300 * 1024 * 1024;
const SESSION_TTL = 12 * 3600;
const DEFAULT_LIMITS = {
  submission: 10, report: 30, photo: 10, flag: 20, login: 8, tester: 20, resolve: 30,
  "global:write": 500, "global:photo": 60,
};
// Grenzen lassen sich für Staging-Tests über LIMIT_<NAME> setzen
function limit(env, name) {
  const key = `LIMIT_${name.replace(/[^a-z]/gi, "_").toUpperCase()}`;
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_LIMITS[name];
}
function mode(env) {
  return ["off", "private", "public"].includes(env.COMMUNITY_MODE) ? env.COMMUNITY_MODE : "off";
}
function photoBudget(env) {
  const v = Number(env.PHOTO_BUDGET_BYTES);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_PHOTO_BUDGET;
}
const DUP_RADIUS_M = 30;
function distM(lat1, lon1, lat2, lon2) {
  const r = 6371000, rad = Math.PI / 180;
  const dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
const CATEGORIES = ["public", "shop", "room"];
const TOBACCO = ["all", "heated", "unknown"];
const ACCESS = ["public", "customers", "unknown"];
const KINDS = ["found", "missing", "closed", "position", "info", "other"];
const LANGS = ["en", "de", "ja"];
const POS_QUALITY = ["exact", "building", "approx"];
const POS_SOURCE = ["gps", "map", "search", "address", "link"];
const SPOT_ID = /^(off|osm|com)-[a-z0-9-]{1,48}$/;
const PHOTO_ID = /^[0-9a-f]{32}$/;

// ---------- Antworten ----------
function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return origin && list.includes(origin) ? origin : null;
}
function cors(request, env, headers) {
  const origin = allowedOrigin(request, env);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }
  return headers;
}
function json(request, env, data, status = 200, extra = {}) {
  const h = cors(request, env, new Headers({ "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...extra }));
  if (!h.has("cache-control")) h.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: h });
}
function fail(request, env, status, error, detail) {
  return json(request, env, { error, detail: detail || "" }, status);
}
class InputError extends Error {}
class GateError extends Error {
  constructor(status, code, detail) { super(code); this.status = status; this.code = code; this.detail = detail || ""; }
}

// ---------- Eingaben ----------
function clean(value, max) {
  if (value == null) return null;
  let s = String(value).normalize("NFC").replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").trim();
  if (!s) return null;
  if (s.length > max) throw new InputError(`too long (max ${max})`);
  // Links sind fast immer Spam
  if (/https?:\/\/|www\.|\.(com|net|xyz|ru)\b/i.test(s)) throw new InputError("links are not allowed");
  return s;
}
function oneOf(value, list, field) {
  if (!list.includes(value)) throw new InputError(`${field} invalid`);
  return value;
}
function coord(value, min, max, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new InputError(`${field} out of range`);
  return Math.round(n * 1e6) / 1e6;
}

async function readForm(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (!len || len > MAX_BODY) throw new InputError("request too large or empty");
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data")) throw new InputError("multipart expected");
  return request.formData();
}

/** Prüft, bereinigt und speichert ein Foto als "pending". Gibt die ID zurück. */
async function storePhoto(env, file, ownerType, consent) {
  if (!file || typeof file === "string") return null;
  if (!consent) throw new InputError("photo consent missing");
  if (file.size > MAX_PHOTO) throw new PhotoError("too large");
  const cleaned = cleanJpeg(new Uint8Array(await file.arrayBuffer()));
  const sha = await sha256Hex(cleaned.bytes);
  // Dasselbe Foto zweimal: nicht noch einmal speichern
  const same = await env.DB.prepare("SELECT id FROM photos WHERE sha256 = ?1 AND bytes IS NOT NULL LIMIT 1").bind(sha).first();
  if (same) throw new GateError(409, "duplicate", "photo already submitted");
  const used = await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS b FROM photos WHERE bytes IS NOT NULL").first();
  if (used.b + cleaned.bytes.length > photoBudget(env)) throw new GateError(507, "storage", "photo storage full");
  const id = randomId(16);
  await env.DB.prepare(
    "INSERT INTO photos (id, owner_type, bytes, size, width, height, sha256, consent) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
  ).bind(id, ownerType, cleaned.bytes, cleaned.bytes.length, cleaned.width, cleaned.height, sha).run();
  return id;
}

/** Im privaten Modus: gültiger, nicht widerrufener Testercode. Gibt die Tester-ID zurück. */
async function checkTester(env, code) {
  if (typeof code !== "string" || code.length > 64) return null;
  // Groß/klein, Leerzeichen und Bindestriche egal: "abcd efgh ..." gilt wie "ABCD-EFGH-..."
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (norm.length !== 16) return null;
  const hash = await sha256Hex(`smokr-tester|${norm.match(/.{4}/g).join("-")}`);
  const row = await env.DB.prepare("SELECT id FROM testers WHERE code_hash = ?1 AND revoked_at IS NULL").bind(hash).first();
  if (!row) return null;
  await env.DB.prepare("UPDATE testers SET last_used_at = ?1, uses = uses + 1 WHERE id = ?2").bind(new Date().toISOString(), row.id).run();
  return row.id;
}

// Testercode prüfen. Gezählt werden nur Fehlversuche, damit echte Tester nicht ins Limit laufen;
// wer das Tageslimit an Fehlversuchen erreicht hat, wird bis zum nächsten Tag abgewiesen.
async function testerGate(env, ip, code) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare("SELECT count FROM rate WHERE key = ?1 AND day = ?2").bind(`testerfail:${ip}`, day).first();
  if (row && row.count >= limit(env, "tester")) return { error: [429, "rate_limited"] };
  const id = await checkTester(env, code);
  if (id) return { id };
  await takeToken(env.DB, `testerfail:${ip}`, limit(env, "tester"));
  return { error: [403, "tester", "private test mode"] };
}

async function guardWrite(request, env, action, form) {
  if (mode(env) === "off" || !env.TURNSTILE_SECRET || !env.IP_SALT) return { error: [503, "disabled"] };
  let testerId = null;
  if (mode(env) === "private") {
    const tg = await testerGate(env, await ipHash(request, env), form.get("tester"));
    if (tg.error) return tg;
    testerId = tg.id;
  }
  // Erst Turnstile, dann zählen: Bots ohne gültigen Token verbrauchen kein Kontingent echter Nutzer
  const ts = await verifyTurnstile(env, form.get("turnstile"), request);
  if (!ts.ok) return { error: [ts.reason === "disabled" ? 503 : 403, ts.reason === "disabled" ? "disabled" : "captcha", ts.reason] };
  const ip = await ipHash(request, env);
  if (!(await takeToken(env.DB, `${action}:${ip}`, limit(env, action)))) return { error: [429, "rate_limited"] };
  if (!(await takeToken(env.DB, "global:write", limit(env, "global:write")))) return { error: [429, "rate_limited"] };
  return { ip, testerId };
}
async function guardPhoto(env, request, ip, form) {
  const photo = form.get("photo");
  if (!photo || typeof photo === "string") return true;
  if (!(await takeToken(env.DB, `photo:${ip}`, limit(env, "photo")))) return false;
  return takeToken(env.DB, "global:photo", limit(env, "global:photo"));
}

// ---------- Öffentliche Endpunkte ----------
async function postSubmission(request, env) {
  const form = await readForm(request);
  const g = await guardWrite(request, env, "submission", form);
  if (g.error) return fail(request, env, g.error[0], g.error[1], g.error[2]);
  const lat = coord(form.get("lat"), 24, 46, "lat");
  const lon = coord(form.get("lon"), 122.9, 146, "lon");
  const row = {
    category: oneOf(form.get("category"), CATEGORIES, "category"),
    tobacco: oneOf(form.get("tobacco"), TOBACCO, "tobacco"),
    access: oneOf(form.get("access"), ACCESS, "access"),
    name: clean(form.get("name"), 80),
    floor: clean(form.get("floor"), 60),
    note: clean(form.get("note"), 500),
    lang: LANGS.includes(form.get("lang")) ? form.get("lang") : null,
    // Ältere App-Versionen schicken das nicht mit: dann unbekannt
    posQuality: form.get("pos_quality") ? oneOf(form.get("pos_quality"), POS_QUALITY, "pos_quality") : null,
    posSource: form.get("pos_source") ? oneOf(form.get("pos_source"), POS_SOURCE, "pos_source") : null,
    address: clean(form.get("address"), 200),
    refUrl: refUrl(form.get("ref_url")),
  };
  // Dasselbe Gerät hat in den letzten 24 Stunden schon einen Platz in 30 m Umkreis eingereicht
  const recent = await env.DB.prepare(
    "SELECT lat, lon FROM submissions WHERE ip_hash = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day') AND status IN ('pending', 'approved') LIMIT 50",
  ).bind(g.ip).all();
  if (recent.results.some((r) => distM(r.lat, r.lon, lat, lon) <= DUP_RADIUS_M)) return fail(request, env, 409, "duplicate", "already submitted");
  if (!(await guardPhoto(env, request, g.ip, form))) return fail(request, env, 429, "rate_limited");
  const photoId = await storePhoto(env, form.get("photo"), "submission", form.get("consent") === "1");
  const res = await env.DB.prepare(
    "INSERT INTO submissions (lat, lon, category, tobacco, access, name, floor, note, lang, photo_id, ip_hash, tester_id, pos_quality, pos_source, address, ref_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16) RETURNING id",
  ).bind(lat, lon, row.category, row.tobacco, row.access, row.name, row.floor, row.note, row.lang, photoId, g.ip, g.testerId, row.posQuality, row.posSource, row.address, row.refUrl).first();
  if (photoId) await env.DB.prepare("UPDATE photos SET owner_id = ?1 WHERE id = ?2").bind(res.id, photoId).run();
  return json(request, env, { ok: true, id: res.id, status: "pending" }, 201);
}

async function postReport(request, env) {
  const form = await readForm(request);
  const g = await guardWrite(request, env, "report", form);
  if (g.error) return fail(request, env, g.error[0], g.error[1], g.error[2]);
  const spotId = String(form.get("spot_id") || "");
  if (!SPOT_ID.test(spotId)) throw new InputError("spot_id invalid");
  const kind = oneOf(form.get("kind"), KINDS, "kind");
  const comment = clean(form.get("comment"), 500);
  const lang = LANGS.includes(form.get("lang")) ? form.get("lang") : null;
  let sugLat = null, sugLon = null;
  if (kind === "position" && form.get("sug_lat") != null && form.get("sug_lat") !== "") {
    sugLat = coord(form.get("sug_lat"), 24, 46, "sug_lat");
    sugLon = coord(form.get("sug_lon"), 122.9, 146, "sug_lon");
  }
  // Gleiches Gerät, gleicher Platz, gleiche Art innerhalb von 24 Stunden: nicht doppelt zählen
  const twice = await env.DB.prepare(
    "SELECT id FROM reports WHERE ip_hash = ?1 AND spot_id = ?2 AND kind = ?3 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day') LIMIT 1",
  ).bind(g.ip, spotId, kind).first();
  if (twice) return fail(request, env, 409, "duplicate", "already reported");
  if (!(await guardPhoto(env, request, g.ip, form))) return fail(request, env, 429, "rate_limited");
  const photoId = await storePhoto(env, form.get("photo"), "report", form.get("consent") === "1");
  const res = await env.DB.prepare(
    "INSERT INTO reports (spot_id, kind, comment, lang, photo_id, ip_hash, sug_lat, sug_lon, tester_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING id",
  ).bind(spotId, kind, comment, lang, photoId, g.ip, sugLat, sugLon, g.testerId).first();
  if (photoId) await env.DB.prepare("UPDATE photos SET owner_id = ?1 WHERE id = ?2").bind(res.id, photoId).run();
  return json(request, env, { ok: true, id: res.id, status: "pending" }, 201);
}

async function flagPhoto(request, env, id) {
  if (mode(env) === "off" || !env.IP_SALT) return fail(request, env, 503, "disabled");
  let body = {};
  try { body = await request.json(); } catch (e) { /* leer */ }
  const ip = await ipHash(request, env);
  if (mode(env) === "private") {
    const tg = await testerGate(env, ip, body.tester);
    if (tg.error) return fail(request, env, ...tg.error);
  }
  const reason = ["privacy", "offensive", "copyright", "wrong", "other"].includes(body.reason) ? body.reason : "other";
  if (!(await takeToken(env.DB, `flag:${ip}`, limit(env, "flag")))) return fail(request, env, 429, "rate_limited");
  const photo = await env.DB.prepare("SELECT id FROM photos WHERE id = ?1 AND status = 'approved'").bind(id).first();
  if (!photo) return fail(request, env, 404, "not_found");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO photo_flags (photo_id, reason, ip_hash) VALUES (?1, ?2, ?3)").bind(id, reason, ip),
    env.DB.prepare("UPDATE photos SET flags = flags + 1 WHERE id = ?1").bind(id),
  ]);
  return json(request, env, { ok: true });
}

const COMMUNITY_CACHE = "https://smokr-cache.internal/v1/community";
async function getCommunity(request, env, ctx) {
  // Bis zu 60 s aus dem Cloudflare-Cache: spart D1-Lesezugriffe (Free: 5 Mio. Zeilen pro Tag)
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(COMMUNITY_CACHE);
    if (hit) {
      const body = await hit.text();
      return json(request, env, JSON.parse(body), 200, { "cache-control": "public, max-age=60" });
    }
  }
  const data = await buildCommunity(env);
  if (cache) {
    const res = new Response(JSON.stringify(data), { headers: { "cache-control": "public, max-age=60", "content-type": "application/json" } });
    const put = cache.put(COMMUNITY_CACHE, res);
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return json(request, env, data, 200, { "cache-control": "public, max-age=60" });
}
async function purgeCommunityCache() {
  if (typeof caches !== "undefined") await caches.default.delete(COMMUNITY_CACHE);
}

async function buildCommunity(env) {
  const places = await env.DB.prepare(
    "SELECT id, lat, lon, category, tobacco, access, name, floor, note, pos_quality, address, reviewed_at AS approved_at FROM submissions WHERE status = 'approved' ORDER BY id",
  ).all();
  const reports = await env.DB.prepare(
    "SELECT spot_id, kind, COUNT(*) AS n, MAX(created_at) AS last FROM reports WHERE status = 'approved' GROUP BY spot_id, kind",
  ).all();
  const photos = await env.DB.prepare(
    `SELECT p.id, p.owner_type, s.id AS sid, r.spot_id FROM photos p
       LEFT JOIN submissions s ON p.owner_type = 'submission' AND s.id = p.owner_id AND s.status = 'approved'
       LEFT JOIN reports r ON p.owner_type = 'report' AND r.id = p.owner_id AND r.status = 'approved'
     WHERE p.status = 'approved' ORDER BY p.created_at DESC`,
  ).all();
  const hidden = await env.DB.prepare("SELECT spot_id FROM hidden_spots").all();

  const bySpot = new Map();
  const spot = (id) => {
    if (!bySpot.has(id)) bySpot.set(id, { spot_id: id, n: 0, last: null, photos: [], issues: {} });
    return bySpot.get(id);
  };
  for (const r of reports.results) {
    const s = spot(r.spot_id);
    if (r.kind === "found") { s.n += r.n; s.last = r.last; }
    else s.issues[r.kind] = { n: r.n, last: r.last };
  }
  const placePhotos = new Map();
  for (const p of photos.results) {
    if (p.sid) { if (!placePhotos.has(p.sid)) placePhotos.set(p.sid, []); placePhotos.get(p.sid).push(p.id); }
    else if (p.spot_id) spot(p.spot_id).photos.push(p.id);
  }
  const out = {
    generated: new Date().toISOString(),
    places: places.results.map((p) => Object.assign(p, { photos: placePhotos.get(p.id) || [] })),
    confirmations: [...bySpot.values()],
    hidden: hidden.results.map((h) => h.spot_id),
  };
  return out;
}

/** Prüft einen Testercode für die App (zeigt dann die Community-Knöpfe). Begrenzt gegen Raten. */
async function testerCheck(request, env) {
  if (mode(env) === "off" || !env.IP_SALT) return fail(request, env, 503, "disabled");
  if (mode(env) === "public") return json(request, env, { ok: true, mode: "public" });
  let body = {};
  try { body = await request.json(); } catch (e) { /* leer */ }
  const tg = await testerGate(env, await ipHash(request, env), body.code);
  return tg.error ? fail(request, env, ...tg.error) : json(request, env, { ok: true, mode: "private" });
}

// ---------- Google-Maps-Kurzlinks ----------
// maps.app.goo.gl/… verrät die Position erst nach der Weiterleitung. Der Worker folgt nur den
// Weiterleitungen (Location-Header) und gibt die Ziel-Adresse zurück. Er liest keine Seiteninhalte von Google.
const SHORT_LINK = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.apple)$/i;
const MAPS_TARGET = /^((www|maps)\.)?google\.[a-z.]+$|^maps\.apple\.com$/i;
const MAP_HOST = /^((www|maps)\.)?google\.[a-z.]+$|^maps\.apple\.com$|^(www\.)?openstreetmap\.org$|^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.apple)$/i;
const KEEP_PARAMS = ["q", "query", "query_place_id", "cid", "ftid", "ll", "daddr", "destination", "coordinate", "address", "name", "place-id", "auid", "mlat", "mlon", "api"];
/** Eingefügter Karten-Link als Referenz für die Moderation: nur Karten-Adressen, ohne Klickverfolgung. */
function refUrl(value) {
  if (value == null || value === "") return null;
  let url;
  try { url = new URL(String(value)); } catch (e) { throw new InputError("ref_url invalid"); }
  if (url.protocol !== "https:" || !MAP_HOST.test(url.hostname)) throw new InputError("ref_url host");
  const keep = new URLSearchParams();
  for (const k of KEEP_PARAMS) if (url.searchParams.has(k)) keep.set(k, url.searchParams.get(k));
  const q = keep.toString();
  const out = `https://${url.hostname.toLowerCase()}${url.pathname}${q ? `?${q}` : ""}${/openstreetmap\.org$/i.test(url.hostname) ? url.hash : ""}`;
  if (out.length > 500) throw new InputError("ref_url too long");
  return out;
}
async function resolveLink(request, env) {
  if (mode(env) === "off" || !env.IP_SALT) return fail(request, env, 503, "disabled");
  let body = {};
  try { body = await request.json(); } catch (e) { /* leer */ }
  const ip = await ipHash(request, env);
  if (mode(env) === "private") {
    const tg = await testerGate(env, ip, body.tester);
    if (tg.error) return fail(request, env, ...tg.error);
  }
  if (!(await takeToken(env.DB, `resolve:${ip}`, limit(env, "resolve")))) return fail(request, env, 429, "rate_limited");
  let url;
  try { url = new URL(String(body.url || "").trim().slice(0, 300)); } catch (e) { return fail(request, env, 400, "link"); }
  if (url.protocol !== "https:" || !SHORT_LINK.test(url.hostname)) return fail(request, env, 400, "link");
  for (let hop = 0; hop < 4; hop++) {
    let res;
    try {
      res = await fetch(url.toString(), { redirect: "manual", headers: { "user-agent": "Smokr link resolver (+https://shortzn.github.io/smokr/)" } });
    } catch (e) {
      return fail(request, env, 502, "link", "unreachable");
    }
    if (res.body) await res.body.cancel();
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) return fail(request, env, 422, "link", "no redirect");
    url = new URL(loc, url);
    // Einwilligungsseite: das eigentliche Ziel steht im Parameter "continue"
    if (/^consent\.google\./i.test(url.hostname) && url.searchParams.get("continue")) url = new URL(url.searchParams.get("continue"));
    if (MAPS_TARGET.test(url.hostname)) return json(request, env, { ok: true, url: url.toString() });
    if (!SHORT_LINK.test(url.hostname)) return fail(request, env, 422, "link", "unexpected target");
  }
  return fail(request, env, 422, "link", "too many redirects");
}

async function getPhoto(request, env, id, admin) {
  const row = await env.DB.prepare(`SELECT bytes FROM photos WHERE id = ?1${admin ? "" : " AND status = 'approved'"}`).bind(id).first();
  if (!row || !row.bytes) return fail(request, env, 404, "not_found");
  const h = new Headers({
    "content-type": "image/jpeg",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "cache-control": admin ? "no-store" : "public, max-age=3600",
    "cross-origin-resource-policy": "cross-origin",
  });
  return new Response(new Uint8Array(row.bytes), { headers: admin ? h : cors(request, env, h) });
}

// ---------- Admin ----------
const ADMIN_HEADERS = {
  "content-security-policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'self' https://shortzn.github.io; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};
function adminJson(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...ADMIN_HEADERS, ...extra } });
}
/** Schreibende Admin-Aufrufe nur vom eigenen Ursprung, mit eigenem Header (gegen CSRF). */
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const self = new URL(request.url).origin;
  return origin === self && request.headers.get("x-smokr-admin") === "1";
}
async function isAdmin(request, env) {
  return checkSession(env, cookie(request, "smokr_admin"));
}
function sessionCookie(value, maxAge) {
  return `smokr_admin=${value}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function adminLogin(request, env) {
  if (!sameOrigin(request)) return adminJson({ error: "forbidden" }, 403);
  if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_KEY || !env.IP_SALT) return adminJson({ error: "disabled" }, 503);
  const ip = await ipHash(request, env);
  if (!(await takeToken(env.DB, `login:${ip}`, limit(env, "login")))) return adminJson({ error: "rate_limited" }, 429);
  let body = {};
  try { body = await request.json(); } catch (e) { /* leer */ }
  if (!(await verifyPassword(body.password, env.ADMIN_PASSWORD_HASH))) {
    await audit(env, "login_failed", "admin", null);
    return adminJson({ error: "wrong" }, 401);
  }
  await audit(env, "login", "admin", null);
  return adminJson({ ok: true }, 200, { "set-cookie": sessionCookie(await makeSession(env, SESSION_TTL), SESSION_TTL) });
}

async function audit(env, action, target, note) {
  await env.DB.prepare("INSERT INTO audit (action, target, note) VALUES (?1, ?2, ?3)").bind(action, target, note || null).run();
}

async function queue(env) {
  const all = (sql) => env.DB.prepare(sql).all().then((r) => r.results);
  return {
    submissions: await all("SELECT id, created_at, status, lat, lon, category, tobacco, access, name, floor, note, lang, photo_id, pos_quality, pos_source, address, ref_url FROM submissions WHERE status = 'pending' ORDER BY id LIMIT 200"),
    reports: await all("SELECT id, created_at, status, spot_id, kind, comment, lang, photo_id, sug_lat, sug_lon FROM reports WHERE status = 'pending' ORDER BY id LIMIT 200"),
    flagged: await all("SELECT p.id, p.status, p.flags, p.owner_type, p.owner_id, GROUP_CONCAT(f.reason) AS reasons FROM photos p JOIN photo_flags f ON f.photo_id = p.id AND f.handled = 0 GROUP BY p.id ORDER BY p.flags DESC LIMIT 100"),
    approved: await all("SELECT id, lat, lon, category, name, reviewed_at FROM submissions WHERE status = 'approved' ORDER BY id DESC LIMIT 300"),
    hidden: await all("SELECT spot_id, hidden_at, reason FROM hidden_spots ORDER BY hidden_at DESC"),
    recent: await all("SELECT at, action, target, note FROM audit ORDER BY id DESC LIMIT 30"),
    testers: await all("SELECT id, created_at, label, revoked_at, last_used_at, uses FROM testers ORDER BY id DESC LIMIT 50"),
    usage: await usage(env),
    mode: mode(env),
  };
}

async function usage(env) {
  const one = (sql) => env.DB.prepare(sql).first();
  const photos = await one("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM photos WHERE bytes IS NOT NULL");
  const subs = await one("SELECT COUNT(*) AS n FROM submissions");
  const reps = await one("SELECT COUNT(*) AS n FROM reports");
  const today = await one("SELECT COALESCE(SUM(count), 0) AS n FROM rate WHERE key = 'global:write' AND day = date('now')");
  const todayPhotos = await one("SELECT COALESCE(SUM(count), 0) AS n FROM rate WHERE key = 'global:photo' AND day = date('now')");
  return {
    photo_count: photos.n, photo_bytes: photos.bytes, photo_budget: photoBudget(env), db_limit: 500 * 1024 * 1024,
    submissions: subs.n, reports: reps.n,
    writes_today: today.n, writes_limit: limit(env, "global:write"), photos_today: todayPhotos.n, photos_limit: limit(env, "global:photo"),
  };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function createTester(request, env) {
  if (!sameOrigin(request)) return adminJson({ error: "forbidden" }, 403);
  let body = {};
  try { body = await request.json(); } catch (e) { /* leer */ }
  const label = typeof body.label === "string" ? body.label.slice(0, 40) : null;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  code = code.match(/.{4}/g).join("-");
  const hash = await sha256Hex(`smokr-tester|${code}`);
  await env.DB.prepare("INSERT INTO testers (label, code_hash) VALUES (?1, ?2)").bind(label, hash).run();
  await audit(env, "tester_create", label || "tester", null);
  // Der Code wird nur dieses eine Mal angezeigt
  return adminJson({ ok: true, code });
}
async function revokeTester(request, env, id) {
  if (!sameOrigin(request)) return adminJson({ error: "forbidden" }, 403);
  await env.DB.prepare("UPDATE testers SET revoked_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), Number(id)).run();
  await audit(env, "tester_revoke", String(id), null);
  return adminJson({ ok: true });
}

const STATUS = { approve: "approved", reject: "rejected", withdraw: "withdrawn" };
async function moderate(request, env, type, id) {
  if (!sameOrigin(request)) return adminJson({ error: "forbidden" }, 403);
  let body = {};
  try { body = await request.json(); } catch (e) { /* leer */ }
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
  const action = body.action;
  const now = new Date().toISOString();
  if (type === "photos") {
    if (!PHOTO_ID.test(id) || !STATUS[action]) return adminJson({ error: "invalid" }, 400);
    await env.DB.batch([
      env.DB.prepare("UPDATE photos SET status = ?1, reviewed_at = ?2 WHERE id = ?3").bind(STATUS[action], now, id),
      env.DB.prepare("UPDATE photo_flags SET handled = 1 WHERE photo_id = ?1").bind(id),
    ]);
    // Abgelehnte Fotos werden sofort gelöscht, nicht nur versteckt
    if (action !== "approve") await env.DB.prepare("UPDATE photos SET bytes = NULL WHERE id = ?1").bind(id).run();
    await audit(env, `photo_${action}`, id, note);
    await purgeCommunityCache();
    return adminJson({ ok: true });
  }
  const table = type === "submissions" ? "submissions" : type === "reports" ? "reports" : null;
  const num = Number(id);
  if (!table || !Number.isInteger(num) || num < 1) return adminJson({ error: "invalid" }, 400);
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?1`).bind(num).first();
  if (!row) return adminJson({ error: "not_found" }, 404);

  if (table === "reports" && (action === "hide_spot" || action === "unhide_spot")) {
    if (action === "hide_spot") {
      await env.DB.prepare("INSERT OR REPLACE INTO hidden_spots (spot_id, reason) VALUES (?1, ?2)").bind(row.spot_id, note || row.kind).run();
      await env.DB.prepare("UPDATE reports SET status = 'approved', reviewed_at = ?1, review_note = ?2 WHERE id = ?3").bind(now, note, num).run();
    } else {
      await env.DB.prepare("DELETE FROM hidden_spots WHERE spot_id = ?1").bind(row.spot_id).run();
    }
    await audit(env, action, row.spot_id, note);
    await purgeCommunityCache();
    return adminJson({ ok: true });
  }
  if (table === "submissions" && action === "edit") {
    // Korrigieren vor oder nach der Freigabe, mit denselben Prüfungen wie öffentliche Eingaben
    const f = body.fields || {};
    try {
      const upd = {
        lat: f.lat != null ? coord(f.lat, 24, 46, "lat") : row.lat,
        lon: f.lon != null ? coord(f.lon, 122.9, 146, "lon") : row.lon,
        category: f.category != null ? oneOf(f.category, CATEGORIES, "category") : row.category,
        tobacco: f.tobacco != null ? oneOf(f.tobacco, TOBACCO, "tobacco") : row.tobacco,
        access: f.access != null ? oneOf(f.access, ACCESS, "access") : row.access,
        name: "name" in f ? clean(f.name, 80) : row.name,
        floor: "floor" in f ? clean(f.floor, 60) : row.floor,
        note: "note" in f ? clean(f.note, 500) : row.note,
        posQuality: f.pos_quality != null ? oneOf(f.pos_quality, POS_QUALITY, "pos_quality") : row.pos_quality,
      };
      await env.DB.prepare("UPDATE submissions SET lat = ?1, lon = ?2, category = ?3, tobacco = ?4, access = ?5, name = ?6, floor = ?7, note = ?8, pos_quality = ?10 WHERE id = ?9")
        .bind(upd.lat, upd.lon, upd.category, upd.tobacco, upd.access, upd.name, upd.floor, upd.note, num, upd.posQuality).run();
    } catch (e) {
      if (e instanceof InputError) return adminJson({ error: "invalid", detail: e.message }, 400);
      throw e;
    }
    await audit(env, "submission_edit", String(num), note);
    await purgeCommunityCache();
    return adminJson({ ok: true });
  }
  if (!STATUS[action]) return adminJson({ error: "invalid" }, 400);
  const dup = table === "submissions" && typeof body.dup_of === "string" ? body.dup_of.slice(0, 60) : null;
  await env.DB.prepare(`UPDATE ${table} SET status = ?1, reviewed_at = ?2, review_note = ?3${table === "submissions" ? ", dup_of = ?5" : ""} WHERE id = ?4`)
    .bind(...(table === "submissions" ? [STATUS[action], now, note, num, dup] : [STATUS[action], now, note, num])).run();
  // Das Foto folgt dem Eintrag, ein abgelehntes Foto wird gelöscht
  if (row.photo_id) {
    const pStatus = action === "approve" && body.photo !== "reject" ? "approved" : action === "approve" ? "rejected" : STATUS[action];
    await env.DB.prepare("UPDATE photos SET status = ?1, reviewed_at = ?2 WHERE id = ?3").bind(pStatus, now, row.photo_id).run();
    if (pStatus !== "approved") await env.DB.prepare("UPDATE photos SET bytes = NULL WHERE id = ?1").bind(row.photo_id).run();
  }
  await audit(env, `${table.slice(0, -1)}_${action}`, String(num), note);
  await purgeCommunityCache();
  return adminJson({ ok: true });
}

async function exportAll(env) {
  const all = (sql) => env.DB.prepare(sql).all().then((r) => r.results);
  return {
    exported: new Date().toISOString(),
    submissions: await all("SELECT id, created_at, status, lat, lon, category, tobacco, access, name, floor, note, lang, photo_id, pos_quality, pos_source, address, ref_url, reviewed_at, review_note, dup_of FROM submissions"),
    reports: await all("SELECT id, created_at, status, spot_id, kind, comment, lang, photo_id, sug_lat, sug_lon, reviewed_at, review_note FROM reports"),
    testers: await all("SELECT id, created_at, label, revoked_at, last_used_at, uses FROM testers"),
    photos: await all("SELECT id, created_at, status, owner_type, owner_id, size, width, height, sha256, flags, reviewed_at FROM photos"),
    hidden: await all("SELECT * FROM hidden_spots"),
    // Moderationsprotokoll: wer hat wann was entschieden (nur Admin-Aktionen, keine IPs)
    audit: await all("SELECT id, at, action, target, note FROM audit ORDER BY id"),
  };
}

async function handleAdmin(request, env, path) {
  if (path === "/admin" || path === "/admin/") {
    return new Response(ADMIN_HTML, { headers: { "content-type": "text/html; charset=utf-8", ...ADMIN_HEADERS } });
  }
  if (path === "/admin/login" && request.method === "POST") return adminLogin(request, env);
  if (path === "/admin/logout" && request.method === "POST") {
    return adminJson({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }
  if (!(await isAdmin(request, env))) return adminJson({ error: "unauthorized" }, 401);
  if (path === "/admin/api/queue" && request.method === "GET") return adminJson(await queue(env));
  if (path === "/admin/api/export" && request.method === "GET") return adminJson(await exportAll(env), 200, { "content-disposition": "attachment; filename=smokr-community.json" });
  let m = path.match(/^\/admin\/api\/photos\/([0-9a-f]{32})$/);
  if (m && request.method === "GET") return getPhoto(request, env, m[1], true);
  if (path === "/admin/api/testers" && request.method === "POST") return createTester(request, env);
  m = path.match(/^\/admin\/api\/testers\/(\d+)\/revoke$/);
  if (m && request.method === "POST") return revokeTester(request, env, m[1]);
  m = path.match(/^\/admin\/api\/(submissions|reports|photos)\/([0-9a-f]{32}|\d+)$/);
  if (m && request.method === "POST") return moderate(request, env, m[1], m[2]);
  return adminJson({ error: "not_found" }, 404);
}

// ---------- Wartung (täglicher Cron) ----------
// Zeitstempel liegen als 2026-10-18T03:17:00Z vor; Vergleiche im selben Format
const AGO = (days) => `strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-${days} days')`;
async function purge(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rate WHERE day < date('now', '-2 days')"),
    env.DB.prepare(`UPDATE submissions SET ip_hash = NULL WHERE created_at < ${AGO(30)}`),
    env.DB.prepare(`UPDATE reports SET ip_hash = NULL WHERE created_at < ${AGO(30)}`),
    env.DB.prepare(`UPDATE photo_flags SET ip_hash = NULL WHERE created_at < ${AGO(30)}`),
    env.DB.prepare("UPDATE photos SET bytes = NULL WHERE status IN ('rejected', 'withdrawn')"),
    // Nie geprüfte Fotos nach 90 Tagen löschen
    env.DB.prepare(`UPDATE photos SET bytes = NULL, status = 'rejected' WHERE status = 'pending' AND created_at < ${AGO(90)}`),
    // Abgelehntes und Zurückgezogenes: Texte nach 30 Tagen löschen. Es bleibt nur, was für Dubletten und das
    // Moderationsprotokoll nötig ist (Position, Art, Entscheidung).
    env.DB.prepare(`UPDATE submissions SET name = NULL, floor = NULL, note = NULL, address = NULL, ref_url = NULL WHERE status IN ('rejected', 'withdrawn') AND reviewed_at < ${AGO(30)}`),
    env.DB.prepare(`UPDATE reports SET comment = NULL, sug_lat = NULL, sug_lon = NULL WHERE status IN ('rejected', 'withdrawn') AND reviewed_at < ${AGO(30)}`),
  ]);
}

// ---------- Router ----------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/admin")) return await handleAdmin(request, env, path);
      if (request.method === "OPTIONS") {
        const h = cors(request, env, new Headers({
          "access-control-allow-methods": "GET, POST",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        }));
        return new Response(null, { status: allowedOrigin(request, env) ? 204 : 403, headers: h });
      }
      if (path === "/v1/community" && request.method === "GET") return await getCommunity(request, env, ctx);
      if (path === "/v1/status" && request.method === "GET") {
        // geocode: Ortssuche über Nominatim abschaltbar ohne neue App-Version (Bedingung der OSMF)
        return json(request, env, { mode: mode(env), photos: true, max_photo_bytes: MAX_PHOTO, geocode: env.GEOCODE !== "off" }, 200, { "cache-control": "public, max-age=60" });
      }
      let m = path.match(/^\/v1\/photos\/([0-9a-f]{32})$/);
      if (m && request.method === "GET") return await getPhoto(request, env, m[1], false);
      if (request.method === "POST") {
        // Schreiben nur von der eigenen App
        if (!allowedOrigin(request, env)) return fail(request, env, 403, "forbidden");
        if (path === "/v1/tester") return await testerCheck(request, env);
        if (path === "/v1/resolve-link") return await resolveLink(request, env);
        if (path === "/v1/submissions") return await postSubmission(request, env);
        if (path === "/v1/reports") return await postReport(request, env);
        m = path.match(/^\/v1\/photos\/([0-9a-f]{32})\/flag$/);
        if (m) return await flagPhoto(request, env, m[1]);
      }
      if (path === "/" || path === "/health") return json(request, env, { ok: true, service: "smokr-community" });
      return fail(request, env, 404, "not_found");
    } catch (e) {
      if (e instanceof GateError) return fail(request, env, e.status, e.code, e.detail);
      if (e instanceof InputError) return fail(request, env, 400, "invalid", e.message);
      if (e instanceof PhotoError) return fail(request, env, 400, "photo", e.message);
      console.error(e && e.stack ? e.stack : e);
      return fail(request, env, 500, "server");
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(purge(env));
  },
};
