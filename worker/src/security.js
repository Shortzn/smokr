// Hilfen für Sicherheit: Hashes, Admin-Passwort, Sitzungs-Cookie, Turnstile, Zähler.

const enc = new TextEncoder();

export function b64(bytes) {
  let s = "";
  for (const x of new Uint8Array(bytes)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export async function sha256Hex(data) {
  const buf = await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function today() { return new Date().toISOString().slice(0, 10); }

/** IP nur als täglich wechselnder, gesalzener Hash. Ohne Salz kein Betrieb. */
export async function ipHash(request, env) {
  if (!env.IP_SALT) throw new Error("IP_SALT missing");
  const ip = request.headers.get("cf-connecting-ip") || "local";
  return (await sha256Hex(`${env.IP_SALT}|${today()}|${ip}`)).slice(0, 32);
}

// ---------- Admin-Passwort (PBKDF2, Format pbkdf2$<iter>$<salt>$<hash>) ----------
export async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}
export async function verifyPassword(password, stored) {
  if (!stored || typeof password !== "string" || password.length < 1 || password.length > 256) return false;
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(iter));
  return timingSafeEqual(got, unb64(hash));
}

// ---------- Sitzung: <ablauf>.<hmac>, nur im HttpOnly-Cookie ----------
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function makeSession(env, ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_KEY), enc.encode(`admin.${exp}`));
  return `${exp}.${b64(sig)}`;
}
export async function checkSession(env, token) {
  if (!token || !env.SESSION_KEY) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(env.SESSION_KEY), unb64(sig), enc.encode(`admin.${exp}`));
  } catch (e) {
    return false;
  }
}
export function cookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// ---------- Turnstile ----------
export async function verifyTurnstile(env, token, request) {
  if (!env.TURNSTILE_SECRET) return { ok: false, reason: "disabled" };
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return { ok: false, reason: "missing" };
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.append("remoteip", ip);
  let data;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    data = await res.json();
  } catch (e) {
    return { ok: false, reason: "unreachable" };
  }
  if (!data.success) return { ok: false, reason: (data["error-codes"] || []).join(",") || "failed" };
  // Testschlüssel melden "example.com"; echte Antworten müssen von erlaubten Seiten kommen
  const allowed = String(env.TURNSTILE_HOSTNAMES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length && data.hostname && !allowed.includes(data.hostname)) return { ok: false, reason: "hostname" };
  return { ok: true };
}

// ---------- Zähler gegen Massenmeldungen ----------
/** Erhöht den Zähler und gibt false zurück, wenn das Limit schon erreicht war. */
export async function takeToken(db, key, limit) {
  const day = today();
  const row = await db.prepare(
    "INSERT INTO rate (key, day, count) VALUES (?1, ?2, 1) ON CONFLICT (key, day) DO UPDATE SET count = count + 1 RETURNING count",
  ).bind(key, day).first();
  return row.count <= limit;
}
