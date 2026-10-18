/* Verbindung zum Community-Backend (Cloudflare Worker). Ohne konfigurierte API ist alles aus.
   Fotos werden im Browser neu als JPEG kodiert: Das entfernt EXIF- und GPS-Daten schon vor dem Upload.
   Der Server prüft und bereinigt trotzdem noch einmal. */
(function (root) {
  "use strict";

  const cfg = root.SMOKR_CONFIG || {};
  // Server nimmt höchstens 1 MB; etwas Luft für den Formular-Overhead
  const MAX_UPLOAD = 900 * 1024;
  const MAX_EDGE = 1600;

  // Ob die Community sichtbar ist, entscheidet der Server (GET /v1/status), nicht ein Link:
  //   public  = für alle; private = nur mit gültigem Testercode; off oder nicht erreichbar = aus
  const runtime = { mode: null, tester: null };
  try { runtime.tester = JSON.parse(localStorage.getItem("kitsuen.tester") || "null"); } catch (e) { runtime.tester = null; }
  function configured() { return !!(cfg.api && cfg.turnstileSiteKey); }
  function enabled() {
    if (!configured()) return false;
    if (runtime.mode === "public") return true;
    return runtime.mode === "private" && !!runtime.tester;
  }
  async function fetchStatus() {
    if (!configured()) return null;
    try {
      const res = await fetch(`${base()}/v1/status`, { cache: "no-cache", mode: "cors", credentials: "omit" });
      if (!res.ok) { runtime.mode = null; return null; }
      const j = await res.json();
      runtime.mode = ["off", "private", "public"].includes(j.mode) ? j.mode : null;
      runtime.geocode = j.geocode !== false;
      return runtime.mode;
    } catch (e) {
      runtime.mode = null;
      return null;
    }
  }
  function setTester(code) {
    runtime.tester = code || null;
    try {
      if (code) localStorage.setItem("kitsuen.tester", JSON.stringify(code));
      else localStorage.removeItem("kitsuen.tester");
    } catch (e) { /* privater Modus */ }
  }
  /** Google-Maps-Kurzlink über den eigenen Worker auflösen (liest nur die Weiterleitung). */
  async function resolveLink(url) {
    return request("/v1/resolve-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, tester: runtime.tester || undefined }) });
  }
  async function checkTester(code) {
    return request("/v1/tester", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
  }
  function base() { return String(cfg.api || "").replace(/\/+$/, ""); }

  class CommunityError extends Error {
    constructor(code, detail) { super(code); this.code = code; this.detail = detail || ""; }
  }

  async function request(path, init) {
    let res;
    try {
      res = await fetch(base() + path, Object.assign({ mode: "cors", credentials: "omit" }, init));
    } catch (e) {
      throw new CommunityError("network");
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* kein JSON */ }
    if (!res.ok) {
      const code = body && body.error ? body.error : res.status === 429 ? "rate_limited" : "server";
      throw new CommunityError(code, body && body.detail);
    }
    return body;
  }

  async function fetchCommunity() {
    if (!enabled()) return null;
    return request("/v1/community", { method: "GET", cache: "no-cache" });
  }
  function photoUrl(id) { return `${base()}/v1/photos/${encodeURIComponent(id)}`; }

  // ---------- Turnstile (wird erst geladen, wenn jemand ein Formular öffnet) ----------
  let tsLoading = null;
  function loadTurnstile() {
    if (root.turnstile) return Promise.resolve(root.turnstile);
    if (!tsLoading) {
      tsLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.onload = () => resolve(root.turnstile);
        s.onerror = () => { tsLoading = null; reject(new CommunityError("network")); };
        document.head.appendChild(s);
      });
    }
    return tsLoading;
  }
  async function mountTurnstile(el, lang) {
    const ts = await loadTurnstile();
    let token = null;
    const id = ts.render(el, {
      sitekey: cfg.turnstileSiteKey,
      language: lang,
      size: "flexible",
      appearance: "interaction-only",
      callback: (tok) => { token = tok; },
      "expired-callback": () => { token = null; },
      "error-callback": () => { token = null; },
    });
    return {
      get token() { return token; },
      reset() { token = null; try { ts.reset(id); } catch (e) { /* schon entfernt */ } },
      remove() { try { ts.remove(id); } catch (e) { /* schon entfernt */ } },
    };
  }

  // ---------- Fotos ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new CommunityError("photo_read")); };
      img.src = url;
    });
  }
  function toBlob(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }
  /** Verkleinert und kodiert neu als JPEG. Gibt {blob, width, height} zurück. */
  async function preparePhoto(file) {
    const okType = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
    if (!okType) throw new CommunityError("photo_type");
    if (file.size > 30 * 1024 * 1024) throw new CommunityError("photo_big");
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      src = await loadImage(file);
    }
    const w0 = src.width, h0 = src.height;
    if (!w0 || !h0) throw new CommunityError("photo_read");
    let scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
    for (let attempt = 0; attempt < 4; attempt++) {
      const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(src, 0, 0, w, h);
      for (const q of [0.82, 0.72, 0.62]) {
        const blob = await toBlob(canvas, q);
        if (blob && blob.size <= MAX_UPLOAD) return { blob, width: w, height: h };
      }
      scale *= 0.75;
    }
    throw new CommunityError("photo_big");
  }

  function form(fields, photo) {
    const fd = new FormData();
    if (runtime.tester) fd.append("tester", runtime.tester);
    for (const [k, v] of Object.entries(fields)) if (v != null && v !== "") fd.append(k, String(v));
    if (photo) fd.append("photo", photo, "photo.jpg");
    return fd;
  }
  async function submitPlace(fields, photo) {
    return request("/v1/submissions", { method: "POST", body: form(fields, photo) });
  }
  async function submitReport(fields, photo) {
    return request("/v1/reports", { method: "POST", body: form(fields, photo) });
  }
  async function flagPhoto(id, reason) {
    return request(`/v1/photos/${encodeURIComponent(id)}/flag`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: reason || "other", tester: runtime.tester || undefined }),
    });
  }

  /** Fehlercode des Servers in einen Textschlüssel übersetzen. */
  function errorKey(e) {
    const c = e && e.code;
    if (c === "network") return "err.network";
    if (c === "rate_limited") return "err.rate";
    if (c === "invalid") return "err.invalid";
    if (c === "captcha") return "err.captcha";
    if (c === "photo") return "err.photo";
    if (c === "disabled") return "err.disabled";
    if (c === "tester") return "err.tester";
    if (c === "storage") return "err.storage";
    if (c === "duplicate") return "err.duplicate";
    if (c === "link") return "loc.badLink";
    if (c === "photo_type") return "photo.type";
    if (c === "photo_big") return "photo.tooBig";
    if (c === "photo_read") return "photo.read";
    return "err.server";
  }

  root.SmokrCommunity = { enabled, configured, runtime, fetchStatus, setTester, checkTester, resolveLink, fetchCommunity, photoUrl, mountTurnstile, preparePhoto, submitPlace, submitReport, flagPhoto, errorKey, CommunityError };
})(window);
