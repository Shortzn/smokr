// Moderationsoberfläche. Alle Nutzertexte werden mit textContent gesetzt, nie als HTML.
export const ADMIN_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Smokr Moderation</title>
<style>
  :root { --fg:#000; --muted:#666; --line:#e2e2e2; --fill:#f3f3f3; --ok:#0b8043; --no:#b3261e; color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--fg); background: #fff; }
  header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid var(--line); padding: 12px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; z-index: 2; }
  header h1 { font-size: 18px; margin: 0; flex: 1; }
  main { max-width: 980px; margin: 0 auto; padding: 16px; display: grid; gap: 24px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  .card { border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: grid; gap: 8px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .meta { color: var(--muted); font-size: 13px; }
  .pill { background: var(--fill); border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 600; }
  .warn { background: #fff3e0; color: #6b3b00; border-radius: 8px; padding: 8px; font-size: 13px; }
  button { font: inherit; border: 0; border-radius: 10px; padding: 8px 12px; background: var(--fill); cursor: pointer; font-weight: 600; }
  button.ok { background: var(--ok); color: #fff; }
  button.no { background: var(--no); color: #fff; }
  button:disabled { opacity: .5; }
  input[type=password], input[type=text] { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
  img.ph { max-width: 100%; max-height: 360px; border-radius: 8px; background: var(--fill); }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .empty { color: var(--muted); }
  #login { max-width: 360px; margin: 15vh auto; display: grid; gap: 12px; padding: 16px; }
  a { color: #276ef1; }
</style>
</head>
<body>
<form id="login" hidden>
  <h1>Smokr Moderation</h1>
  <input type="password" id="pw" autocomplete="current-password" placeholder="Admin-Passwort" required>
  <button class="ok">Anmelden</button>
  <p class="meta" id="login-msg"></p>
</form>
<div id="app" hidden>
  <header>
    <h1>Smokr Moderation</h1>
    <button id="reload">Aktualisieren</button>
    <button id="export">Sicherung herunterladen</button>
    <button id="logout">Abmelden</button>
  </header>
  <main>
    <section><h2 id="h-sub">Neue Plätze</h2><div id="subs"></div></section>
    <section><h2 id="h-rep">Meldungen</h2><div id="reps"></div></section>
    <section><h2 id="h-flag">Gemeldete Fotos</h2><div id="flags"></div></section>
    <section><h2>Ausgeblendete Plätze</h2><div id="hidden"></div></section>
    <section><h2>Letzte Aktionen</h2><div id="audit" class="meta"></div></section>
  </main>
</div>
<script>
"use strict";
const BASE = "https://shortzn.github.io/smokr/data/";
const REGIONS = ["tokyo", "kamakura", "kyoto", "okinawa", "osaka"];
let base = null;
const $ = (id) => document.getElementById(id);
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k) e.append(k);
  return e;
}
async function api(path, opts) {
  const res = await fetch(path, Object.assign({ credentials: "same-origin" }, opts));
  if (res.status === 401) { showLogin(); throw new Error("401"); }
  return res;
}
function post(path, body) {
  return api(path, { method: "POST", headers: { "content-type": "application/json", "x-smokr-admin": "1" }, body: JSON.stringify(body || {}) });
}
function dist(a, b) {
  const r = 6371000, rad = Math.PI / 180;
  const dp = (b[1] - a[1]) * rad, dl = (b[0] - a[0]) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
async function loadBase() {
  if (base) return base;
  base = [];
  for (const r of REGIONS) {
    try { const d = await (await fetch(BASE + r + ".json")).json(); base.push(...d.spots); } catch (e) { /* ohne Basisdaten weiter */ }
  }
  return base;
}
function osmLink(lat, lon) {
  return el("a", { href: "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lon + "#map=19/" + lat + "/" + lon, target: "_blank", rel: "noopener", text: lat + ", " + lon });
}
function photo(id) {
  if (!id) return null;
  const img = el("img", { class: "ph", alt: "Foto " + id });
  api("/admin/api/photos/" + id).then((r) => r.ok ? r.blob() : null).then((b) => { if (b) img.src = URL.createObjectURL(b); });
  return img;
}
function actions(type, id, extra) {
  const note = el("input", { type: "text", placeholder: "Notiz (optional)", maxlength: "300" });
  const go = (action, more) => async () => {
    const r = await post("/admin/api/" + type + "/" + id, Object.assign({ action, note: note.value }, more || {}));
    if (r.ok) load(); else alert("Fehler: " + r.status);
  };
  const row = el("div", { class: "row" }, note,
    el("button", { class: "ok", text: "Freigeben", onclick: go("approve") }),
    el("button", { class: "no", text: "Ablehnen", onclick: go("reject") }));
  for (const [label, action, more] of extra || []) row.append(el("button", { text: label, onclick: go(action, more) }));
  return row;
}
function nearby(lat, lon, list) {
  const out = [];
  for (const s of list) {
    const d = dist([lon, lat], [s.lon, s.lat]);
    if (d <= 60) out.push([d, s]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, 5);
}
function label(s) { return (s.ne || s.nj || s.name || s.id) + " (" + s.id + ")"; }

async function load() {
  const res = await api("/admin/api/queue");
  const q = await res.json();
  const spots = await loadBase();
  const approved = q.approved.map((a) => ({ id: "com-" + a.id, lat: a.lat, lon: a.lon, name: a.name || a.category }));
  $("h-sub").textContent = "Neue Plätze (" + q.submissions.length + ")";
  $("h-rep").textContent = "Meldungen (" + q.reports.length + ")";
  $("h-flag").textContent = "Gemeldete Fotos (" + q.flagged.length + ")";

  const subs = $("subs"); subs.replaceChildren();
  if (!q.submissions.length) subs.append(el("p", { class: "empty", text: "Nichts offen." }));
  for (const s of q.submissions) {
    const near = nearby(s.lat, s.lon, spots.concat(approved));
    const card = el("div", { class: "card" },
      el("div", { class: "row" }, el("b", { text: "#" + s.id + " " + (s.name || "(ohne Namen)") }), el("span", { class: "pill", text: s.category }), el("span", { class: "pill", text: "Tabak: " + s.tobacco }), el("span", { class: "pill", text: "Zugang: " + s.access })),
      el("div", { class: "meta" }, osmLink(s.lat, s.lon), document.createTextNode(" · " + s.created_at + " · " + (s.lang || "?"))),
      s.floor ? el("div", { class: "text", text: "Stockwerk/Ausgang: " + s.floor }) : null,
      s.note ? el("div", { class: "text", text: s.note }) : null,
      photo(s.photo_id),
      near.length ? el("div", { class: "warn", text: "Mögliche Dubletten: " + near.map(([d, n]) => label(n) + " in " + Math.round(d) + " m").join("; ") }) : null,
      actions("submissions", s.id, near.length ? [["Als Dublette ablehnen", "reject", { dup_of: near[0][1].id }]] : []),
      s.photo_id ? el("div", { class: "row" }, el("button", { text: "Freigeben ohne Foto", onclick: async () => { const r = await post("/admin/api/submissions/" + s.id, { action: "approve", photo: "reject" }); if (r.ok) load(); } })) : null);
    subs.append(card);
  }

  const reps = $("reps"); reps.replaceChildren();
  if (!q.reports.length) reps.append(el("p", { class: "empty", text: "Nichts offen." }));
  const byId = new Map(spots.concat(approved).map((s) => [s.id, s]));
  for (const r of q.reports) {
    const s = byId.get(r.spot_id);
    const extra = ["missing", "closed"].includes(r.kind) ? [["Platz ausblenden", "hide_spot"]] : [];
    reps.append(el("div", { class: "card" },
      el("div", { class: "row" }, el("b", { text: "#" + r.id + " " + r.kind }), el("span", { class: "pill", text: r.spot_id })),
      el("div", { class: "meta" }, s ? document.createTextNode(label(s) + " · ") : document.createTextNode("Platz unbekannt · "), s ? osmLink(s.lat, s.lon) : document.createTextNode(""), document.createTextNode(" · " + r.created_at)),
      r.comment ? el("div", { class: "text", text: r.comment }) : null,
      photo(r.photo_id),
      actions("reports", r.id, extra)));
  }

  const flags = $("flags"); flags.replaceChildren();
  if (!q.flagged.length) flags.append(el("p", { class: "empty", text: "Nichts gemeldet." }));
  for (const f of q.flagged) {
    flags.append(el("div", { class: "card" },
      el("div", { class: "row" }, el("b", { text: "Foto " + f.id }), el("span", { class: "pill", text: f.flags + "× gemeldet: " + f.reasons })),
      photo(f.id),
      el("div", { class: "row" },
        el("button", { class: "no", text: "Zurückziehen", onclick: async () => { const r = await post("/admin/api/photos/" + f.id, { action: "withdraw" }); if (r.ok) load(); } }),
        el("button", { text: "Behalten", onclick: async () => { const r = await post("/admin/api/photos/" + f.id, { action: "approve" }); if (r.ok) load(); } }))));
  }

  const hidden = $("hidden"); hidden.replaceChildren();
  if (!q.hidden.length) hidden.append(el("p", { class: "empty", text: "Keine." }));
  for (const h of q.hidden) hidden.append(el("div", { class: "meta", text: h.spot_id + " · " + h.hidden_at + " · " + (h.reason || "") }));

  $("audit").replaceChildren(...q.recent.map((a) => el("div", { text: a.at + " " + a.action + " " + a.target + (a.note ? " (" + a.note + ")" : "") })));
}

function showLogin() { $("app").hidden = true; $("login").hidden = false; $("pw").focus(); }
$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("/admin/login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-smokr-admin": "1" }, body: JSON.stringify({ password: $("pw").value }) });
  $("pw").value = "";
  if (r.ok) { $("login").hidden = true; $("app").hidden = false; load(); }
  else $("login-msg").textContent = r.status === 429 ? "Zu viele Versuche, später erneut." : r.status === 503 ? "Admin ist nicht eingerichtet." : "Falsches Passwort.";
});
$("reload").onclick = () => load();
$("logout").onclick = async () => { await post("/admin/logout"); showLogin(); };
$("export").onclick = async () => {
  const r = await api("/admin/api/export");
  const url = URL.createObjectURL(await r.blob());
  const a = el("a", { href: url, download: "smokr-community-" + new Date().toISOString().slice(0, 10) + ".json" });
  document.body.append(a); a.click(); a.remove();
};
fetch("/admin/api/queue", { credentials: "same-origin" }).then((r) => { if (r.ok) { $("app").hidden = false; load(); } else showLogin(); });
</script>
</body>
</html>`;
