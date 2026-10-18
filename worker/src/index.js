// Smokr Community API und Moderation (Cloudflare Worker mit D1).
//
// Öffentlich:
//   GET  /v1/community            freigegebene Plätze, Bestätigungen, ausgeblendete Plätze
//   GET  /v1/photos/:id           nur freigegebene Fotos
//   POST /v1/submissions          neuer Platz (multipart), Turnstile Pflicht
//   POST /v1/reports              Meldung zu einem Platz (multipart), Turnstile Pflicht
//   POST /v1/photos/:id/flag      Foto melden
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
const MAX_PHOTO = 1536 * 1024;
const SESSION_TTL = 12 * 3600;
const LIMITS = {
  submission: 10, report: 30, photo: 10, flag: 20, login: 8,
  "global:write": 1500, "global:photo": 300,
};
const CATEGORIES = ["public", "shop", "room"];
const TOBACCO = ["all", "heated", "unknown"];
const ACCESS = ["public", "customers", "unknown"];
const KINDS = ["found", "missing", "closed", "position", "info", "other"];
const LANGS = ["en", "de", "ja"];
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
  let cleaned;
  cleaned = cleanJpeg(new Uint8Array(await file.arrayBuffer()));
  const id = randomId(16);
  const sha = await sha256Hex(cleaned.bytes);
  await env.DB.prepare(
    "INSERT INTO photos (id, owner_type, bytes, size, width, height, sha256, consent) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
  ).bind(id, ownerType, cleaned.bytes, cleaned.bytes.length, cleaned.width, cleaned.height, sha).run();
  return id;
}

async function guardWrite(request, env, action, form) {
  if (!env.TURNSTILE_SECRET || !env.IP_SALT) return { error: [503, "disabled"] };
  // Erst Turnstile, dann zählen: Bots ohne gültigen Token verbrauchen kein Kontingent echter Nutzer
  const ts = await verifyTurnstile(env, form.get("turnstile"), request);
  if (!ts.ok) return { error: [ts.reason === "disabled" ? 503 : 403, ts.reason === "disabled" ? "disabled" : "captcha", ts.reason] };
  const ip = await ipHash(request, env);
  if (!(await takeToken(env.DB, `${action}:${ip}`, LIMITS[action]))) return { error: [429, "rate_limited"] };
  if (!(await takeToken(env.DB, "global:write", LIMITS["global:write"]))) return { error: [429, "rate_limited"] };
  return { ip };
}
async function guardPhoto(env, request, ip, form) {
  const photo = form.get("photo");
  if (!photo || typeof photo === "string") return true;
  if (!(await takeToken(env.DB, `photo:${ip}`, LIMITS.photo))) return false;
  return takeToken(env.DB, "global:photo", LIMITS["global:photo"]);
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
  };
  if (!(await guardPhoto(env, request, g.ip, form))) return fail(request, env, 429, "rate_limited");
  const photoId = await storePhoto(env, form.get("photo"), "submission", form.get("consent") === "1");
  const res = await env.DB.prepare(
    "INSERT INTO submissions (lat, lon, category, tobacco, access, name, floor, note, lang, photo_id, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) RETURNING id",
  ).bind(lat, lon, row.category, row.tobacco, row.access, row.name, row.floor, row.note, row.lang, photoId, g.ip).first();
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
  if (!(await guardPhoto(env, request, g.ip, form))) return fail(request, env, 429, "rate_limited");
  const photoId = await storePhoto(env, form.get("photo"), "report", form.get("consent") === "1");
  const res = await env.DB.prepare(
    "INSERT INTO reports (spot_id, kind, comment, lang, photo_id, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id",
  ).bind(spotId, kind, comment, lang, photoId, g.ip).first();
  if (photoId) await env.DB.prepare("UPDATE photos SET owner_id = ?1 WHERE id = ?2").bind(res.id, photoId).run();
  return json(request, env, { ok: true, id: res.id, status: "pending" }, 201);
}

async function flagPhoto(request, env, id) {
  if (!env.IP_SALT) return fail(request, env, 503, "disabled");
  let body = {};
  try { body = await request.json(); } catch (e) { /* leer */ }
  const reason = ["privacy", "offensive", "copyright", "wrong", "other"].includes(body.reason) ? body.reason : "other";
  const ip = await ipHash(request, env);
  if (!(await takeToken(env.DB, `flag:${ip}`, LIMITS.flag))) return fail(request, env, 429, "rate_limited");
  const photo = await env.DB.prepare("SELECT id FROM photos WHERE id = ?1 AND status = 'approved'").bind(id).first();
  if (!photo) return fail(request, env, 404, "not_found");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO photo_flags (photo_id, reason, ip_hash) VALUES (?1, ?2, ?3)").bind(id, reason, ip),
    env.DB.prepare("UPDATE photos SET flags = flags + 1 WHERE id = ?1").bind(id),
  ]);
  return json(request, env, { ok: true });
}

async function getCommunity(request, env) {
  const places = await env.DB.prepare(
    "SELECT id, lat, lon, category, tobacco, access, name, floor, note, reviewed_at AS approved_at FROM submissions WHERE status = 'approved' ORDER BY id",
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
  return json(request, env, out, 200, { "cache-control": "public, max-age=60" });
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
  if (!(await takeToken(env.DB, `login:${ip}`, LIMITS.login))) return adminJson({ error: "rate_limited" }, 429);
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
    submissions: await all("SELECT id, created_at, status, lat, lon, category, tobacco, access, name, floor, note, lang, photo_id FROM submissions WHERE status = 'pending' ORDER BY id LIMIT 200"),
    reports: await all("SELECT id, created_at, status, spot_id, kind, comment, lang, photo_id FROM reports WHERE status = 'pending' ORDER BY id LIMIT 200"),
    flagged: await all("SELECT p.id, p.status, p.flags, p.owner_type, p.owner_id, GROUP_CONCAT(f.reason) AS reasons FROM photos p JOIN photo_flags f ON f.photo_id = p.id AND f.handled = 0 GROUP BY p.id ORDER BY p.flags DESC LIMIT 100"),
    approved: await all("SELECT id, lat, lon, category, name, reviewed_at FROM submissions WHERE status = 'approved' ORDER BY id DESC LIMIT 300"),
    hidden: await all("SELECT spot_id, hidden_at, reason FROM hidden_spots ORDER BY hidden_at DESC"),
    recent: await all("SELECT at, action, target, note FROM audit ORDER BY id DESC LIMIT 30"),
  };
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
  return adminJson({ ok: true });
}

async function exportAll(env) {
  const all = (sql) => env.DB.prepare(sql).all().then((r) => r.results);
  return {
    exported: new Date().toISOString(),
    submissions: await all("SELECT id, created_at, status, lat, lon, category, tobacco, access, name, floor, note, lang, photo_id, reviewed_at, review_note, dup_of FROM submissions"),
    reports: await all("SELECT id, created_at, status, spot_id, kind, comment, lang, photo_id, reviewed_at, review_note FROM reports"),
    photos: await all("SELECT id, created_at, status, owner_type, owner_id, size, width, height, sha256, flags, reviewed_at FROM photos"),
    hidden: await all("SELECT * FROM hidden_spots"),
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
  m = path.match(/^\/admin\/api\/(submissions|reports|photos)\/([0-9a-f]{32}|\d+)$/);
  if (m && request.method === "POST") return moderate(request, env, m[1], m[2]);
  return adminJson({ error: "not_found" }, 404);
}

// ---------- Wartung (täglicher Cron) ----------
async function purge(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rate WHERE day < date('now', '-2 days')"),
    env.DB.prepare("UPDATE submissions SET ip_hash = NULL WHERE created_at < datetime('now', '-30 days')"),
    env.DB.prepare("UPDATE reports SET ip_hash = NULL WHERE created_at < datetime('now', '-30 days')"),
    env.DB.prepare("UPDATE photo_flags SET ip_hash = NULL WHERE created_at < datetime('now', '-30 days')"),
    env.DB.prepare("UPDATE photos SET bytes = NULL WHERE status IN ('rejected', 'withdrawn')"),
    // Nie geprüfte Fotos nach 90 Tagen löschen
    env.DB.prepare("UPDATE photos SET bytes = NULL, status = 'rejected' WHERE status = 'pending' AND created_at < datetime('now', '-90 days')"),
  ]);
}

// ---------- Router ----------
export default {
  async fetch(request, env) {
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
      if (path === "/v1/community" && request.method === "GET") return await getCommunity(request, env);
      let m = path.match(/^\/v1\/photos\/([0-9a-f]{32})$/);
      if (m && request.method === "GET") return await getPhoto(request, env, m[1], false);
      if (request.method === "POST") {
        // Schreiben nur von der eigenen App
        if (!allowedOrigin(request, env)) return fail(request, env, 403, "forbidden");
        if (path === "/v1/submissions") return await postSubmission(request, env);
        if (path === "/v1/reports") return await postReport(request, env);
        m = path.match(/^\/v1\/photos\/([0-9a-f]{32})\/flag$/);
        if (m) return await flagPhoto(request, env, m[1]);
      }
      if (path === "/" || path === "/health") return json(request, env, { ok: true, service: "smokr-community" });
      return fail(request, env, 404, "not_found");
    } catch (e) {
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
