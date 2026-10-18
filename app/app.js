"use strict";

const C = window.SmokrCore;
const M = window.SmokrMarkers;
const COM = window.SmokrCommunity;
const CFG = window.SMOKR_CONFIG || {};
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const LIST_LIMIT = 40;
const PANEL_QUERY = "(min-width: 900px), (orientation: landscape) and (max-height: 520px) and (min-width: 560px)";

const $ = (id) => document.getElementById(id);

// ---------- Speicher (Schlüssel bleiben "kitsuen.*", damit Rückmeldungen erhalten bleiben) ----------
function loadStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privater Modus */ }
}

let t = C.setLang(C.I18N.pick(navigator.languages || [navigator.language], loadStore("kitsuen.lang", null)));

const state = {
  base: [],
  spots: [],
  byId: new Map(),
  regions: {}, // id -> {status: "loading"|"ok"|"error", error, built, count}
  community: null,
  prefs: C.migratePrefs(loadStore("kitsuen.prefs", null), loadStore("kitsuen.filters", null)),
  reports: loadStore("kitsuen.reports", {}),
  loc: C.initialLocation(),
  selected: null,
  view: "list",
  form: null,
  online: navigator.onLine !== false,
};
let map = null;
let mapReady = false;
let sheet = null;
let meMarker = null;
let geoWatch = null;
let lastRankedPos = null;
let returnFocusId = null;

function savePrefs() { saveStore("kitsuen.prefs", state.prefs); }
function routeApp() { return state.prefs.route || C.defaultRouteApp(navigator.userAgent); }

// ---------- Hilfen ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let toastTimer = 0;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function mapCenter() {
  if (map) { const c = map.getCenter(); return [c.lng, c.lat]; }
  const v = loadStore("kitsuen.view", null);
  return v && Array.isArray(v.c) ? v.c : C.REGIONS[0].center;
}
function anchor() { return C.anchorOf(state.loc, mapCenter()); }
function isNearby() { return state.loc.mode === "nearby" && !!state.loc.pos; }
function kindOf(s) { return M.markerKind(s, state.reports); }
function weak(s) { return C.trust(s, null).weak; }
function stationLine(s) {
  if (!s.st) return "";
  const name = t.lang === "ja" ? s.st.ja : s.st.en || s.st.ja;
  return t(s.st.m < 600 ? "near.station" : "toward.station", { station: name });
}
function accessHtml(s) {
  const cat = s.unv ? "unverified" : C.category(s);
  return `<span class="acc acc-${cat}">${esc(C.accessLabel(s))}</span>`;
}

// ---------- Sprache ----------
function applyStatic() {
  document.documentElement.lang = t.lang;
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":");
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
  $("contact-link").href = CFG.contactUrl || "https://github.com/Shortzn/smokr/issues";
  $("contact-link").textContent = (CFG.contactUrl || "https://github.com/Shortzn/smokr/issues").replace(/^https:\/\//, "");
  $("legal-row").hidden = !CFG.legalUrl;
  if (CFG.legalUrl) $("legal-link").href = CFG.legalUrl;
  $(`l-${t.lang}`).checked = true;
}
function setLang(lang) {
  t = C.setLang(lang);
  saveStore("kitsuen.lang", lang);
  applyStatic();
  renderLegend();
  syncFilters();
  updateCityPill();
  renderInfo();
  rerender();
}
function rerender() {
  if (state.view === "list") renderList();
  else if (state.view === "detail" && state.selected) renderDetail(state.byId.get(state.selected));
  else if (state.view === "search") renderSearch($("q").value);
  else if (state.view === "form") renderForm();
  if (sheet) sheet.layout();
}

// ---------- Liste ----------
function renderHeader(top) {
  const region = C.regionFor(anchor());
  const nearby = isNearby();
  $("list-title").textContent = nearby ? t("list.near") : region ? t("list.in", { city: C.regionName(region) }) : t("list.map");
  let sub;
  if (state.loc.pendingCenter) sub = t("list.locating");
  else sub = nearby ? t("list.fromYou") : t("list.fromCenter");
  void top;
  $("list-sub").textContent = sub;

  const banner = $("banner");
  const rs = region ? state.regions[region.id] : null;
  let html = "", cls = "";
  if (rs && rs.status === "error") {
    cls = "error";
    html = `<span>${esc(t("banner.dataError", { city: C.regionName(region), error: rs.error }))}</span><button class="text-btn" data-retry="${region.id}">${esc(t("banner.reload"))}</button>`;
  } else if (state.loc.error === "denied" && state.loc.perm === "denied") {
    html = `<span>${esc(t("banner.denied"))}</span>`;
  } else if (state.loc.error === "unavailable") {
    html = `<span>${esc(t("banner.unavailable"))}</span><button class="text-btn" data-locate>${esc(t("banner.retry"))}</button>`;
  } else if (!state.online) {
    cls = "warn";
    html = `<span>${esc(t("banner.offline"))}</span>`;
  }
  banner.className = `banner ${cls}`;
  banner.innerHTML = html;
  banner.hidden = !html;

  const rules = $("rules");
  const note = C.regionNote(region);
  rules.hidden = !note;
  if (note) {
    $("rules-title").textContent = t("rules.title", { city: C.regionName(region) });
    $("rules-text").textContent = note;
  }
}

function rowHtml(d, s) {
  const kind = kindOf(s);
  const ja = C.jaLine(s);
  // Zeile 2: was für ein Ort, Zugang, Stockwerk. Zeile 3: Bahnhof und Herkunft der Angaben.
  const parts = C.summary(s).map(esc);
  parts[0] = `<span class="acc mk-${kind}">${parts[0]}</span>`;
  if (s.heated) parts.push(`<span class="acc acc-heated">${esc(t("heatedOnly"))}</span>`);
  const tr = C.trust(s, state.reports[s.id]);
  const src = [];
  const st = stationLine(s);
  if (st) src.push(st);
  src.push(tr.short);
  if (tr.community && tr.community.confirmed) src.push(`✓ ${tr.community.confirmed}`);
  if (tr.position === "area") src.push(t("src.posArea"));
  else if (tr.position === "address") src.push(t("src.posAddress"));
  if (tr.mine) src.push(t(tr.mine.status === "ok" ? "src.mineOk" : "src.mineGone"));
  return `<li><button class="row${kind === "gone" ? " gone" : ""}" data-id="${esc(s.id)}">
    ${M.svg(kind, null, 30)}
    <span class="row-title">${esc(C.title(s))}${ja ? `<span class="ja" lang="ja">${esc(ja)}</span>` : ""}</span>
    <span class="row-meta">${parts.join(" · ")}</span>
    <span class="row-src">${src.map(esc).join(" · ")}</span>
    ${d == null ? "" : `<span class="row-dist"><b>${C.fmtDist(d)}</b><span>${esc(t("list.straight"))}</span></span>`}
  </button></li>`;
}

function renderList() {
  const from = anchor();
  const region = C.regionFor(from);
  const rs = region ? state.regions[region.id] : null;
  const list = $("list");
  if (!state.spots.length && Object.values(state.regions).some((r) => r.status === "loading")) {
    renderHeader([]);
    list.innerHTML = `<li class="empty">${esc(t("list.loading"))}</li>`;
    return;
  }
  const top = C.rank(state.spots, from, state.prefs, state.reports, LIST_LIMIT).filter((x) => x.d <= 30000);
  renderHeader(top);
  if (rs && rs.status === "error" && !top.length) {
    list.innerHTML = `<li class="empty">${esc(t("list.empty.dataMissing", { city: C.regionName(region) }))}</li>`;
    return;
  }
  if (!top.length) {
    let key;
    if (!state.prefs.showPublic && !state.prefs.showBusiness) key = "list.empty.allOff";
    else if (!region) key = "list.empty.noRegion";
    else if (!state.prefs.showBusiness) key = "list.empty.onlyPublic";
    else key = "list.empty.filtered";
    list.innerHTML = `<li class="empty">${esc(t(key))}</li>`;
    return;
  }
  list.innerHTML = top.map(({ d, s }) => rowHtml(d, s)).join("");
}
let listTimer = 0;
function renderListSoon() {
  clearTimeout(listTimer);
  listTimer = setTimeout(() => { if (state.view === "list") renderList(); }, 60);
}

// ---------- Detail ----------
function factsHtml(rows) {
  return `<dl class="facts">${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${b}</dd>`).join("")}</dl>`;
}
function renderDetail(s) {
  if (!s) return;
  const rep = state.reports[s.id];
  const tr = C.trust(s, rep);
  const cat = C.category(s);
  const tags = [`<span class="tag mk-${kindOf(s)}">${M.svg(kindOf(s), null, 18)}${esc(C.areaLabel(s))}</span>`,
    `<span class="tag">${esc(C.accessShort(s))}</span>`];
  if (s.heated) tags.push(`<span class="tag heated">${esc(t("heatedOnly.tag"))}</span>`);
  if (state.loc.pos) {
    const d = C.distM(state.loc.pos, [s.lon, s.lat]);
    if (d < 50000) tags.push(`<span class="tag dist">${C.fmtDist(d)} ${esc(t("list.straight"))}</span>`);
  }

  const app = routeApp();
  const urls = C.routeUrls(s);
  const other = app === "apple" ? "google" : "apple";

  const warn = C.warnings(s, state.prefs);
  const find = [];
  if (s.hint) find.push(`<p class="hint"${/[぀-ヿ一-鿿]/.test(s.hint) ? ' lang="ja"' : ""}>${esc(s.hint)}</p>`);
  const where = [];
  const ex = C.exitText(s);
  if (ex) where.push([t("detail.exit"), esc(ex)]);
  if (s.fl) where.push([t("detail.floor"), esc(C.floorText(s.fl))]);
  if (s.dir) where.push([t("detail.side"), esc(C.dirText(s))]);
  if (s.floor) where.push([t("detail.floor"), esc(s.floor)]);
  if (s.st) {
    const name = t.lang === "ja" ? s.st.ja : s.st.en || s.st.ja;
    where.push([t("detail.station"), `${esc(name)}${s.st.en && t.lang !== "ja" ? ` <span class="ja" lang="ja">${esc(s.st.ja)}</span>` : ""}, ${C.fmtDist(s.st.m)} ${esc(t("list.straight"))}`]);
  }
  if (s.addr) where.push([t("detail.address"), `<span class="ja" lang="ja">${esc(s.addr)}</span>`]);

  const info = [];
  info.push([t("detail.place"), esc(C.placeType(s) || t("tob.none"))]);
  info.push([t("detail.area"), esc(C.areaLabel(s) + (s.io ? `, ${t(`io.${s.io}`)}` : ""))]);
  info.push([t("detail.access"), esc(C.accessExplain(s) + (s.tk ? ` ${t("detail.ticketHint")}` : ""))]);
  info.push([t("detail.tobacco"), esc(C.tobaccoText(s))]);
  const h = C.hours(s.hours);
  info.push([t("detail.hours"), h ? `${esc(h.text)}${h.original ? `<span class="orig ja" lang="ja">${esc(h.original)}</span>` : ""}` : esc(t("detail.hoursNone"))]);

  const src = [];
  if (tr.official) {
    const val = tr.official.date ? t("detail.officialVal", { source: C.sourceName(s), date: C.fmtMonth(tr.official.date) }) : t("detail.officialNoDate", { source: C.sourceName(s) });
    src.push([t("detail.official"), `${esc(val)}${tr.official.url ? `. <a href="${esc(tr.official.url)}" target="_blank" rel="noopener">${esc(t("detail.openSource"))}</a>` : ""}`]);
  }
  if (tr.osm) {
    const val = tr.osm.checked ? t("detail.osmChecked", { date: C.fmtMonth(tr.osm.checked) }) : t("detail.osmUnchecked");
    src.push([t("src.osm"), `${esc(val)}. <a href="${esc(tr.osm.url)}" target="_blank" rel="noopener">${esc(t("detail.openOsm"))}</a>`]);
  }
  if (tr.community) {
    const bits = [];
    if (tr.community.added) bits.push(t("detail.communityAdded", { date: C.fmtMonth(tr.community.added) }));
    if (tr.community.confirmed) bits.push(t("detail.communityVal", { n: tr.community.confirmed, date: C.fmtMonth(tr.community.last) }));
    if (bits.length) src.push([t("detail.community"), esc(bits.join(". "))]);
  }
  src.push([t("detail.position"), esc(t(`pos.${tr.position}`))]);

  const photos = (s.com && s.com.photos) || [];
  const photoHtml = photos.length && COM.enabled() ? `<div class="section"><h3>${esc(t("detail.photos"))}</h3><div class="photos">${photos.slice(0, 6).map((id) => `
      <figure><img src="${esc(COM.photoUrl(id))}" alt="${esc(t("detail.photoBy"))}" loading="lazy" decoding="async"><figcaption><button class="text-btn" data-flag="${esc(id)}">${esc(t("detail.photoReport"))}</button></figcaption></figure>`).join("")}</div></div>` : "";

  const mine = rep
    ? `${esc(t(rep.s === "ok" ? "detail.mineOk" : "detail.mineGone", { date: C.fmtDay(rep.t) }))} <button class="text-btn" data-report="clear">${esc(t("detail.reset"))}</button>`
    : esc(t("detail.mineHint"));

  $("detail").innerHTML = `
    <div class="d-head">
      <h2 class="d-title${C.title(s).length > 16 ? " long" : ""}" id="d-title">${esc(C.title(s))}</h2>
      ${C.jaLine(s) ? `<p class="d-ja" lang="ja">${esc(C.jaLine(s))}</p>` : ""}
      ${C.translatedName(s) ? `<p class="d-note">${esc(t("detail.nameNote"))}${s.lr ? ` ${esc(t("detail.reading"))}: ${esc(s.lr)}.` : ""}</p>` : ""}
      <div class="tags">${tags.join("")}</div>
    </div>
    <div class="route">
      <a class="btn primary btn-col" id="route-main" href="${urls[app]}" target="_blank" rel="noopener" data-route="${app}">${esc(t("detail.route"))}<small>${esc(t("detail.routeSub", { app: t(`app.${app}`) }))}</small></a>
      <a class="text-btn alt" href="${urls[other]}" target="_blank" rel="noopener" data-route="${other}">${esc(t("detail.routeAlt", { app: t(`app.${other}`) }))}</a>
    </div>
    ${warn.map((w) => `<div class="callout">${esc(w.text)}</div>`).join("")}
    ${find.length || where.length ? `<div class="section"><h3>${esc(t("detail.findIt"))}</h3>${find.join("")}${where.length ? factsHtml(where) : ""}</div>` : ""}
    ${photoHtml}
    <div class="section"><h3>${esc(t("detail.info"))}</h3>${factsHtml(info)}</div>
    <div class="section"><h3>${esc(t("detail.origin"))}</h3>${factsHtml(src)}</div>
    <div class="section">
      <h3>${esc(t("detail.wereYou"))}</h3>
      <div class="feedback">
        <button class="btn" data-report="ok" aria-pressed="${rep?.s === "ok"}">${esc(t("detail.found"))}</button>
        <button class="btn" data-report="gone" aria-pressed="${rep?.s === "gone"}">${esc(t("detail.notFound"))}</button>
      </div>
      <p class="mine">${mine}</p>
      ${COM.enabled() ? `<button class="btn secondary wide" data-community-report>${esc(t("detail.report"))}</button>` : ""}
    </div>
    <div class="section"><button class="btn secondary wide" data-open="ask"><span lang="ja">喫煙所？</span> ${esc(t("detail.askJa"))}</button></div>`;
}

// ---------- Ansichten ----------
function setView(name) {
  state.view = name;
  for (const v of ["list", "detail", "search", "form"]) {
    const el = $(`view-${v}`);
    const show = v === name;
    if (show && el.hidden) { el.hidden = false; el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
    else if (!show) el.hidden = true;
  }
  $("add-pin").hidden = !(name === "form" && state.form && (state.form.type === "place" || state.form.kind === "position"));
  document.body.dataset.view = name;
  if (name === "form") positionPin();
}

function select(id, opts) {
  const s = state.byId.get(id);
  if (!s) return;
  const o = Object.assign({ fly: true }, opts);
  const a = document.activeElement;
  const keyboard = a && a.closest && a.closest("#sheet") && a.matches(":focus-visible");
  state.selected = id;
  returnFocusId = id;
  renderDetail(s);
  setView("detail");
  $("detail").scrollTop = 0;
  updateSelection();
  if (sheet && !sheet.isPanel() && sheet.state !== "half") sheet.snap("half");
  if (o.fly) focusOn(s);
  if (o.focus || keyboard) $("detail").focus({ preventScroll: true });
}
function focusOn(s) {
  if (!map) return;
  map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 16), padding: mapPadding(), duration: 450 });
}
function closeDetail() {
  state.selected = null;
  updateSelection();
  setView("list");
  renderList();
  if (returnFocusId) {
    const row = document.querySelector(`.row[data-id="${CSS.escape(returnFocusId)}"]`);
    const a = document.activeElement;
    if (row && (!a || a === document.body || a.closest("#sheet"))) row.focus({ preventScroll: false });
  }
}
function report(kind) {
  const id = state.selected;
  if (!id) return;
  if (kind === "clear") delete state.reports[id];
  else state.reports[id] = { s: kind, t: new Date().toISOString() };
  saveStore("kitsuen.reports", state.reports);
  updateMapData();
  renderDetail(state.byId.get(id));
  if (kind === "gone") toast(t("toast.hidden"));
  if (kind === "ok") toast(t("toast.saved"));
}

// ---------- Suche ----------
function openSearch() {
  setView("search");
  const q = $("q");
  q.value = "";
  renderSearch("");
  q.focus(); // im selben Tipp, sonst zeigt iOS keine Tastatur
  if (sheet && !sheet.isPanel()) sheet.snap("expanded");
}
function closeSearch() {
  $("q").blur();
  setView(state.selected ? "detail" : "list");
  if (!state.selected) renderList();
  if (sheet && !sheet.isPanel()) sheet.snap("half");
}
function cityCount(r) {
  const st = state.regions[r.id];
  if (st && st.status === "ok") return t("search.entries", { n: st.count });
  if (st && st.status === "error") return t("search.dataMissing");
  return "";
}
function renderSearch(query) {
  const out = [];
  const regions = C.searchRegions(query);
  if (regions.length) {
    out.push(`<h3 class="group-h">${esc(t("search.cities"))}</h3><ol class="results">${regions.map((r) =>
      `<li><button class="row city-row" data-region="${r.id}"><span class="mk-city" lang="ja">${r.ja.slice(0, 1)}</span><span class="row-title">${esc(C.regionName(r))}${t.lang !== "ja" ? `<span class="ja" lang="ja">${esc(r.ja)}</span>` : ""}</span><span class="row-meta">${esc(cityCount(r))}</span></button></li>`).join("")}</ol>`);
  }
  if (query.trim()) {
    const hits = C.search(state.spots, query, anchor(), state.prefs, state.reports, 40);
    out.push(`<h3 class="group-h">${esc(t("search.places"))}</h3>`);
    out.push(hits.length ? `<ol class="results">${hits.map(({ d, s }) => rowHtml(d, s)).join("")}</ol>`
      : `<p class="empty">${esc(t("search.none", { q: query }))}</p>`);
  } else {
    out.push(`<p class="empty">${esc(t("search.tip"))}</p>`);
  }
  $("search-results").innerHTML = out.join("");
}

// ---------- Orte ----------
function currentMapRegion() { return C.regionFor(mapCenter()); }
function updateCityPill() {
  $("city-name").textContent = C.regionName(currentMapRegion());
}
function renderCityMenu() {
  const cur = currentMapRegion();
  $("city-menu").innerHTML = C.REGIONS.map((r) => {
    const on = cur && cur.id === r.id;
    return `<button role="menuitemradio" aria-checked="${on}" data-region="${r.id}"><b>${esc(C.regionName(r))}${t.lang !== "ja" ? ` <span class="ja" lang="ja">${esc(r.ja)}</span>` : ""}</b><small>${esc(cityCount(r))}</small><span class="check" aria-hidden="true">${on ? "✓" : ""}</span></button>`;
  }).join("");
}
function toggleCityMenu(open) {
  const menu = $("city-menu");
  const show = open == null ? menu.hidden : open;
  if (show) renderCityMenu();
  menu.hidden = !show;
  $("city-btn").setAttribute("aria-expanded", String(show));
  if (show) menu.querySelector("button")?.focus();
}
function flyRegion(id) {
  const r = C.REGIONS.find((x) => x.id === id);
  if (!r) return;
  toggleCityMenu(false);
  if (state.selected) { state.selected = null; updateSelection(); }
  if (state.view !== "list" && state.view !== "form") setView("list");
  dispatchLoc({ type: "region" });
  if (sheet && !sheet.isPanel() && sheet.state === "expanded") sheet.snap("half");
  if (map) map.flyTo({ center: r.center, zoom: r.zoom, padding: mapPadding(), essential: false });
  else renderList();
}

// ---------- Karte ----------
function featureCollection() {
  return {
    type: "FeatureCollection",
    features: state.spots.filter((s) => C.visible(s, state.prefs, state.reports)).map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: {
        id: s.id,
        icon: `m-${kindOf(s)}`,
        pub: C.category(s) === "public" && !s.unv ? 1 : 0,
        // öffentliche Plätze liegen oben
        rank: C.category(s) === "public" ? 0 : 1,
      },
    })),
  };
}
function selectedCollection() {
  const s = state.selected && state.byId.get(state.selected);
  if (!s) return { type: "FeatureCollection", features: [] };
  return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { icon: `pin-${kindOf(s)}` } }] };
}
function updateMapData() {
  if (!mapReady) return;
  map.getSource("spots").setData(featureCollection());
  updateSelection();
}
function updateSelection() {
  if (!mapReady) return;
  map.getSource("sel").setData(selectedCollection());
  // Der normale Marker verschwindet unter der Nadel, sonst sieht man ihn doppelt
  map.setFilter("spots", state.selected
    ? ["all", ["!", ["has", "point_count"]], ["!=", ["get", "id"], state.selected]]
    : ["!", ["has", "point_count"]]);
}
function mapPadding() {
  if (!sheet) return { top: 0, bottom: 0, left: 0, right: 0 };
  if (sheet.isPanel()) {
    const r = $("sheet").getBoundingClientRect();
    return { top: 16, bottom: 16, left: Math.round(r.right + 16), right: 16 };
  }
  const top = Math.round($("topbar").getBoundingClientRect().bottom + 8);
  const h = window.innerHeight;
  // Ganz offen verdeckt das Blatt die Karte: dann gilt der Zustand "halb"
  const visible = sheet.state === "expanded" ? h - sheet.snaps.half : sheet.visibleHeight();
  return { top, bottom: Math.round(Math.min(visible, h * 0.62)), left: 0, right: 0 };
}
/** Die Nadel für "Platz hinzufügen" sitzt genau auf der Kartenmitte (mit Rand). */
function positionPin() {
  const pin = $("add-pin");
  if (pin.hidden || !map) return;
  const p = map.project(map.getCenter());
  const r = map.getCanvas().getBoundingClientRect();
  pin.style.transform = `translate(${Math.round(r.left + p.x - 20)}px, ${Math.round(r.top + p.y - 50)}px)`;
}

function initMap() {
  if (!window.maplibregl) return;
  const saved = loadStore("kitsuen.view", null);
  const start = saved && Array.isArray(saved.c) ? saved : { c: C.REGIONS[0].center, z: C.REGIONS[0].zoom };
  try {
    map = new maplibregl.Map({
      container: "map",
      style: MAP_STYLE,
      center: start.c,
      zoom: start.z,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      fadeDuration: 0,
    });
  } catch (e) {
    map = null;
    return;
  }
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
  map.touchZoomRotate.disableRotation();
  if (map.keyboard.disableRotation) map.keyboard.disableRotation();
  map.on("load", () => {
    M.addImages(map);
    map.addSource("spots", {
      type: "geojson",
      data: featureCollection(),
      cluster: true,
      clusterRadius: 60,
      clusterMaxZoom: 14,
      clusterProperties: { pub: ["+", ["get", "pub"]] },
    });
    map.addSource("sel", { type: "geojson", data: selectedCollection() });
    map.addLayer({
      id: "clusters", type: "circle", source: "spots", filter: ["has", "point_count"],
      paint: {
        "circle-color": ["case", [">", ["get", "pub"], 0], "#000000", "#6b6b6b"],
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 18, 50, 22],
        "circle-stroke-width": 3, "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "spots", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13, "text-allow-overlap": true },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: "spots", type: "symbol", source: "spots", filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.72, 15, 0.92, 18, 1.08],
        "icon-allow-overlap": true,
        "icon-padding": 0,
        "symbol-sort-key": ["-", 10, ["get", "rank"]],
      },
    });
    map.addLayer({
      id: "selected", type: "symbol", source: "sel",
      layout: { "icon-image": ["get", "icon"], "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true },
    });
    // Grundkarte ruhiger: Geschäfts- und Freizeit-Symbole der Karte ausblenden, Bahnhöfe bleiben
    for (const layer of map.getStyle().layers) {
      if (/^poi_r\d+/.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
    }
    map.on("click", "clusters", async (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      try {
        const zoom = await map.getSource("spots").getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom + 0.2, 17), padding: mapPadding() });
      } catch (err) { /* Cluster schon aufgelöst */ }
    });
    for (const layer of ["spots", "clusters"]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
    // Quellenangabe zuerst eingeklappt, sie steht vollständig unter "Info"
    document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    map.on("click", (e) => {
      if (state.view === "form") return;
      // Großzügige Trefferfläche für Finger: nächster Marker in 22 px Umkreis
      const p = e.point, pad = 22;
      const hits = map.queryRenderedFeatures([[p.x - pad, p.y - pad], [p.x + pad, p.y + pad]], { layers: ["spots", "clusters", "selected"] });
      const spot = hits.filter((f) => f.layer.id === "spots")
        .map((f) => { const q = map.project(f.geometry.coordinates); return [Math.hypot(q.x - p.x, q.y - p.y), f]; })
        .sort((a, b) => a[0] - b[0])[0];
      if (spot && spot[0] <= pad) { select(spot[1].properties.id, { fly: false }); return; }
      if (hits.some((f) => f.layer.id === "clusters" || f.layer.id === "selected")) return;
      // Tipp auf freie Karte schließt die Detailansicht
      if (state.view === "detail") closeDetail();
    });
    mapReady = true;
    updateMapData();
    applyPadding();
  });
  map.on("dragstart", (e) => { if (e.originalEvent) dispatchLoc({ type: "userPan" }); });
  map.on("zoomstart", (e) => { if (e.originalEvent && e.originalEvent.type === "wheel") dispatchLoc({ type: "userPan" }); });
  map.on("move", () => { if (state.view === "form") positionPin(); });
  map.on("moveend", () => {
    if (paddingPending) setTimeout(applyPadding, 0);
    updateCityPill();
    const c = map.getCenter();
    saveStore("kitsuen.view", { c: [+c.lng.toFixed(5), +c.lat.toFixed(5)], z: +map.getZoom().toFixed(2) });
    if (state.loc.mode === "area") renderListSoon();
    if (state.view === "form") positionPin();
  });
}
let paddingPending = false;
function applyPadding() {
  if (!map || !sheet) return;
  // setPadding springt sofort und würde einen laufenden Kartenflug abbrechen
  if (map.isMoving()) { paddingPending = true; return; }
  paddingPending = false;
  map.setPadding(mapPadding());
  positionPin();
}

// ---------- Standort ----------
function dispatchLoc(ev) {
  const { state: next, effects } = C.locationReduce(state.loc, ev);
  state.loc = next;
  for (const fx of effects) {
    if (fx.type === "watch") startWatch();
    if (fx.type === "center" && map) {
      if (state.selected && state.view === "detail") { state.selected = null; updateSelection(); setView("list"); }
      map.easeTo({ center: fx.to, zoom: Math.max(map.getZoom(), 15.5), padding: mapPadding(), duration: 500 });
    }
  }
  const btn = $("locate");
  btn.setAttribute("aria-pressed", String(isNearby()));
  btn.classList.toggle("busy", state.loc.pendingCenter);
  btn.setAttribute("aria-label", t(isNearby() ? "locate.aria.active" : "locate.aria"));
  if (state.view === "detail" && state.selected) renderDetail(state.byId.get(state.selected));
  else if (state.view === "list") renderList();
}
function placeMe(pos) {
  if (!map) return;
  if (!meMarker) {
    const el = document.createElement("div");
    el.className = "me";
    meMarker = new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map);
  } else meMarker.setLngLat(pos);
}
function startWatch() {
  if (!("geolocation" in navigator)) { dispatchLoc({ type: "unavailable" }); return; }
  if (geoWatch !== null) return;
  geoWatch = navigator.geolocation.watchPosition((p) => {
    const pos = [p.coords.longitude, p.coords.latitude];
    saveStore("kitsuen.geo", true);
    placeMe(pos);
    // Liste nur neu sortieren, wenn sich etwas Merkliches bewegt hat
    const moved = !lastRankedPos || C.distM(lastRankedPos, pos) > 20 || state.loc.pendingCenter || state.loc.perm !== "granted";
    if (moved) { lastRankedPos = pos; dispatchLoc({ type: "fix", pos, accuracy: p.coords.accuracy }); }
    else state.loc = Object.assign({}, state.loc, { pos, accuracy: p.coords.accuracy });
  }, (err) => {
    navigator.geolocation.clearWatch(geoWatch);
    geoWatch = null;
    if (err.code === 1) { saveStore("kitsuen.geo", false); dispatchLoc({ type: "denied" }); toast(t("toast.denied")); }
    else dispatchLoc({ type: "unavailable" });
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}

// ---------- Daten ----------
async function loadRegion(r) {
  state.regions[r.id] = { status: "loading" };
  try {
    const res = await fetch(`data/${r.id}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = C.validateRegionData(await res.json(), r.id);
    state.regions[r.id] = { status: "ok", built: data.built, count: data.spots.length };
    return data.spots.map((s) => Object.assign(s, { region: r.id }));
  } catch (e) {
    state.regions[r.id] = { status: "error", error: e.name === "TypeError" ? t("error.offline") : e.message };
    return [];
  }
}
function rebuildSpots() {
  for (const s of state.base) delete s.com;
  state.spots = C.mergeCommunity(state.base, state.community);
  state.byId = new Map(state.spots.map((s) => [s.id, s]));
  updateMapData();
  if (state.view === "list") renderList();
  if (state.view === "detail" && state.selected && state.byId.has(state.selected)) renderDetail(state.byId.get(state.selected));
  renderInfo();
}
async function loadData() {
  renderList();
  const parts = await Promise.all(C.REGIONS.map(loadRegion));
  state.base = parts.flat();
  rebuildSpots();
  loadCommunity();
}
async function loadCommunity() {
  if (!COM.enabled()) { state.community = null; rebuildSpots(); return; }
  try {
    state.community = await COM.fetchCommunity();
    saveStore("kitsuen.community", state.community);
  } catch (e) {
    // offline: letzter bekannter Stand
    state.community = loadStore("kitsuen.community", null);
  }
  rebuildSpots();
}
async function retryRegion(id) {
  const r = C.REGIONS.find((x) => x.id === id);
  state.regions[id] = { status: "loading" };
  renderList();
  const spots = await loadRegion(r);
  state.base = state.base.filter((s) => s.region !== id).concat(spots);
  rebuildSpots();
  toast(t(state.regions[id].status === "ok" ? "toast.dataLoaded" : "toast.dataFailed"));
}
function renderInfo() {
  $("data-status").innerHTML = C.REGIONS.map((r) => {
    const st = state.regions[r.id] || {};
    const txt = st.status === "ok" ? t("info.dataOk", { n: st.count, date: C.fmtDay(st.built) })
      : st.status === "error" ? t("info.dataError", { error: st.error }) : t("info.loading");
    return `<li>${esc(C.regionName(r))}: ${esc(txt)}</li>`;
  }).join("");
}

// ---------- Community-Formulare ----------
function openForm(type) {
  if (!COM.enabled()) return;
  state.form = { type, spotId: type === "report" ? state.selected : null, photo: null, sending: false, done: false, error: "", ts: null };
  renderForm();
  setView("form");
  if (sheet && !sheet.isPanel()) sheet.snap(type === "place" ? "half" : "expanded");
}
function closeForm() {
  if (state.form && state.form.ts) state.form.ts.remove();
  if (state.form && state.form.photo) URL.revokeObjectURL(state.form.photo.url);
  const back = state.form && state.form.spotId;
  state.form = null;
  $("add-pin").hidden = true;
  if (back && state.byId.has(back)) { select(back, { fly: false }); return; }
  setView("list");
  renderList();
}
/** Turnstile genau einmal im aktuellen Formular. Ein neu gezeichnetes Formular bekommt ein neues Feld. */
async function mountCaptcha() {
  const f = state.form;
  const el = document.getElementById("ts-box");
  if (!f || !el || f.tsEl === el) return;
  if (f.ts) f.ts.remove();
  f.ts = null;
  f.tsEl = el;
  try {
    const ts = await COM.mountTurnstile(el, t.lang);
    if (state.form === f && f.tsEl === el) f.ts = ts;
    else ts.remove();
  } catch (e) {
    f.error = t("err.network");
    renderFormError();
  }
}
function radios(name, options, value) {
  return `<div class="choice">${options.map(([v, key]) => `<label><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}><span>${esc(t(key))}</span></label>`).join("")}</div>`;
}
function renderForm() {
  const f = state.form;
  if (!f) return;
  const box = $("form-scroll");
  if (f.done) {
    box.innerHTML = `<div class="form-done"><h2>${esc(t(f.type === "place" ? "add.thanks" : "report.thanks"))}</h2><button class="btn primary wide" data-form-close>${esc(t("close"))}</button></div>`;
    return;
  }
  const keep = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  const vals = { name: keep("f-name"), floor: keep("f-floor"), note: keep("f-note"), comment: keep("f-comment") };
  const photo = `<fieldset id="photo-box"></fieldset>`;
  let body;
  if (f.type === "place") {
    body = `<h2 class="form-title">${esc(t("add.title"))}</h2>
      <fieldset><legend>${esc(t("add.step.position"))}</legend>
        <p class="hint-text">${esc(t("add.pinHint"))}</p>
        <button type="button" class="btn secondary wide" data-form-gps>${esc(t("add.useGps"))}</button>
      </fieldset>
      <fieldset><legend>${esc(t("add.category"))}</legend>${radios("category", [["public", "add.cat.public"], ["shop", "add.cat.shop"], ["room", "add.cat.room"]], f.category || "public")}</fieldset>
      <fieldset><legend>${esc(t("add.tobacco"))}</legend>${radios("tobacco", [["all", "add.tob.all"], ["heated", "add.tob.heated"], ["unknown", "add.tob.unknown"]], f.tobacco || "unknown")}</fieldset>
      <fieldset><legend>${esc(t("add.access"))}</legend>${radios("access", [["public", "add.acc.public"], ["customers", "add.acc.customers"], ["unknown", "add.acc.unknown"]], f.access || "unknown")}</fieldset>
      <label class="field-row"><span>${esc(t("add.name"))}</span><input id="f-name" maxlength="80" autocomplete="off" value="${esc(vals.name)}"></label>
      <label class="field-row"><span>${esc(t("add.floor"))}</span><input id="f-floor" maxlength="60" autocomplete="off" value="${esc(vals.floor)}"></label>
      <label class="field-row"><span>${esc(t("add.note"))}</span><textarea id="f-note" maxlength="500" rows="3">${esc(vals.note)}</textarea></label>
      ${photo}`;
  } else {
    const s = state.byId.get(f.spotId);
    body = `<h2 class="form-title">${esc(t("report.title"))}</h2>
      <p class="form-sub">${esc(s ? C.title(s) : "")}</p>
      <fieldset><legend>${esc(t("report.kind"))}</legend>${radios("kind", [["found", "report.found"], ["missing", "report.missing"], ["closed", "report.closed"], ["position", "report.position"], ["info", "report.info"], ["other", "report.other"]], f.kind || "found")}
        <p class="hint-text" id="pos-hint"${f.kind === "position" ? "" : " hidden"}>${esc(t("report.positionHint"))}</p></fieldset>
      <label class="field-row"><span>${esc(t("report.comment"))}</span><textarea id="f-comment" maxlength="500" rows="3">${esc(vals.comment)}</textarea></label>
      ${photo}`;
  }
  box.innerHTML = `<form id="community-form" novalidate>${body}
      <div id="ts-box" class="ts-box"></div>
      <p class="fine">${esc(t("add.privacy"))}</p>
      <p class="form-error" id="form-error" role="alert"${f.error ? "" : " hidden"}>${esc(f.error)}</p>
      <button class="btn primary wide" id="form-submit"${f.sending ? " disabled" : ""}>${esc(t(f.sending ? "add.sending" : f.type === "place" ? "add.submit" : "report.submit"))}</button>
    </form>`;
  renderPhotoBox();
  mountCaptcha();
}
/** Nur der Fotobereich wird neu gezeichnet, damit Eingaben und Turnstile erhalten bleiben. */
function renderPhotoBox() {
  const f = state.form;
  const box = document.getElementById("photo-box");
  if (!f || !box) return;
  const consent = document.getElementById("f-consent");
  const agreed = consent ? consent.checked : false;
  box.innerHTML = `<legend>${esc(t("add.photo"))}</legend>
      <p class="hint-text">${esc(t("add.photoHint"))}</p>
      ${f.photo ? `<div class="photo-preview"><img src="${f.photo.url}" alt=""><button type="button" class="text-btn" data-photo-remove>${esc(t("add.photoRemove"))}</button></div>`
        : `<label class="btn secondary wide file-btn"><input type="file" id="f-photo" accept="image/*" hidden>${esc(t("add.photoPick"))}</label>`}
      ${f.photo ? `<label class="check-row"><input type="checkbox" id="f-consent"${agreed ? " checked" : ""}><span>${esc(t("add.consent"))}</span></label>` : ""}`;
}
function renderFormError() {
  const el = document.getElementById("form-error");
  if (!el || !state.form) return;
  el.textContent = state.form.error;
  el.hidden = !state.form.error;
}
async function onPhoto(file) {
  const f = state.form;
  if (!f || !file) return;
  try {
    const p = await COM.preparePhoto(file);
    if (f.photo) URL.revokeObjectURL(f.photo.url);
    f.photo = { blob: p.blob, url: URL.createObjectURL(p.blob) };
    f.error = "";
  } catch (e) {
    f.error = t(COM.errorKey(e));
  }
  renderPhotoBox();
  renderFormError();
}
function captureChoices() {
  const f = state.form;
  const val = (n) => document.querySelector(`#community-form input[name="${n}"]:checked`)?.value;
  if (!f) return;
  for (const n of ["category", "tobacco", "access", "kind"]) { const v = val(n); if (v) f[n] = v; }
}
async function submitForm() {
  const f = state.form;
  if (!f || f.sending) return;
  captureChoices();
  f.error = "";
  if (f.photo && !$("f-consent").checked) { f.error = t("add.consent"); renderFormError(); return; }
  const token = f.ts && f.ts.token;
  if (!token) { f.error = t("err.captcha"); renderFormError(); return; }
  const common = { turnstile: token, lang: t.lang, consent: f.photo ? "1" : "" };
  let fields;
  if (f.type === "place") {
    if (!map) { f.error = t("add.needPosition"); renderFormError(); return; }
    const c = map.getCenter();
    if (!C.inJapan(c.lat, c.lng)) { f.error = t("add.outside"); renderFormError(); return; }
    fields = Object.assign(common, {
      lat: c.lat.toFixed(6), lon: c.lng.toFixed(6), category: f.category || "public", tobacco: f.tobacco || "unknown", access: f.access || "unknown",
      name: $("f-name").value.trim(), floor: $("f-floor").value.trim(), note: $("f-note").value.trim(),
    });
  } else {
    fields = Object.assign(common, { spot_id: f.spotId, kind: f.kind || "found", comment: $("f-comment").value.trim() });
    if (fields.kind === "position" && map) {
      const c = map.getCenter();
      fields.sug_lat = c.lat.toFixed(6);
      fields.sug_lon = c.lng.toFixed(6);
    }
  }
  f.sending = true;
  $("form-submit").disabled = true;
  $("form-submit").textContent = t("add.sending");
  try {
    if (f.type === "place") await COM.submitPlace(fields, f.photo && f.photo.blob);
    else await COM.submitReport(fields, f.photo && f.photo.blob);
    f.done = true;
    if (f.ts) { f.ts.remove(); f.ts = null; }
    $("add-pin").hidden = true;
    renderForm();
  } catch (e) {
    f.sending = false;
    const key = COM.errorKey(e);
    f.error = t(key, { detail: e.detail || "" });
    if (e.code === "tester") { COM.setTester(null); refreshCommunityUI(); }
    if (f.ts) f.ts.reset();
    $("form-submit").disabled = false;
    $("form-submit").textContent = t(f.type === "place" ? "add.submit" : "report.submit");
    renderFormError();
  }
}

// ---------- Community-Freischaltung ----------
/* Der Server sagt, was gilt (GET /v1/status). Der Link #community öffnet nur die Code-Eingabe;
   die eigentliche Sperre ist der Testercode, den der Server bei jeder Einsendung prüft. */
async function initCommunity() {
  // Solange die Community nicht öffentlich ist, fragen nur Geräte mit Testercode oder Testlink beim Server nach.
  // Alle anderen Besucher nehmen keinen Kontakt zu Cloudflare auf.
  const cfg = window.SMOKR_CONFIG || {};
  const ask = cfg.communityPublic || COM.runtime.tester || /community/.test(location.hash);
  if (ask) await COM.fetchStatus();
  refreshCommunityUI();
  communityLink();
  if (COM.enabled()) loadCommunity();
  // Link auch erkennen, wenn Smokr schon offen ist
  window.addEventListener("hashchange", async () => {
    if (!/community/.test(location.hash)) return;
    if (!COM.runtime.mode) { await COM.fetchStatus(); refreshCommunityUI(); }
    communityLink();
  });
}
function communityLink() {
  if (!/community/.test(location.hash)) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (COM.runtime.mode === "private" && !COM.runtime.tester) openDialog("tester");
  else if (COM.enabled()) toast(t("tester.ok"));
  else toast(t("tester.unavailable"));
}
function refreshCommunityUI() {
  $("add-btn").hidden = !COM.enabled();
  $("tester-row").hidden = !COM.runtime.tester;
  if (state.view === "detail" && state.selected) renderDetail(state.byId.get(state.selected));
}
async function submitTester(e) {
  e.preventDefault();
  const code = $("tester-input").value.trim().toUpperCase();
  const err = $("tester-error");
  err.hidden = true;
  if (code.length < 8) { err.textContent = t("err.tester"); err.hidden = false; return; }
  $("tester-submit").disabled = true;
  try {
    await COM.checkTester(code);
    COM.setTester(code);
    $("tester-input").value = "";
    $("tester").close();
    toast(t("tester.ok"));
    refreshCommunityUI();
    loadCommunity();
  } catch (x) {
    err.textContent = t(COM.errorKey(x), { detail: x.detail || "" });
    err.hidden = false;
  } finally {
    $("tester-submit").disabled = false;
  }
}

// ---------- Filter ----------
function syncFilters() {
  const p = state.prefs;
  $("q-public").setAttribute("aria-pressed", String(p.showPublic));
  $("q-business").setAttribute("aria-pressed", String(p.showBusiness));
  $("q-tobacco-label").textContent = t(`tobacco.${p.tobacco}.short`);
  $(`t-${p.tobacco}`).checked = true;
  $(`r-${routeApp()}`).checked = true;
  $("s-public").checked = p.showPublic;
  $("s-business").checked = p.showBusiness;
  $("s-unverified").checked = p.showUnverified;
  $("s-hidden").checked = p.showHidden;
  $("tobacco-hint").textContent = t(`filters.hint.${p.tobacco}`);
  const d = C.DEFAULT_PREFS;
  const changed = p.tobacco !== d.tobacco || p.showPublic !== d.showPublic || p.showBusiness !== d.showBusiness || p.showHidden || p.showUnverified;
  $("filter-badge").hidden = !changed;
}
function setPref(change) {
  change(state.prefs);
  savePrefs();
  syncFilters();
  updateMapData();
  rerender();
}
function renderLegend() {
  const items = [
    ["public", "legend.public", "legend.publicSub"],
    ["food", "legend.food", "legend.foodSub"],
    ["shop", "legend.shop", "legend.shopSub"],
    ["heated", "legend.heated", "legend.heatedSub"],
  ];
  $("legend-list").innerHTML = items.map(([k, a, b]) => `<li>${M.svg(k, null, 34)}<span><b>${esc(t(a))}</b>${esc(t(b))}</span></li>`).join("")
    + `<li><svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><circle cx="17" cy="17" r="14" fill="#000" stroke="#fff" stroke-width="2.5"/><text x="17" y="21.5" font-size="12" font-weight="700" text-anchor="middle" fill="#fff" font-family="-apple-system,sans-serif">12</text></svg><span><b>${esc(t("legend.cluster"))}</b>${esc(t("legend.clusterSub"))}</span></li>`
    + `<li class="legend-note">${esc(t("legend.reliability"))}</li>`;
}

// ---------- Verdrahtung ----------
function openDialog(id) {
  const d = $(id);
  if (!d.open) d.showModal();
}
function wire() {
  $("city-btn").onclick = (e) => { e.stopPropagation(); toggleCityMenu(); };
  $("city-menu").onclick = (e) => { const b = e.target.closest("[data-region]"); if (b) flyRegion(b.dataset.region); };
  $("city-menu").onkeydown = (e) => {
    const items = [...$("city-menu").querySelectorAll("button")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  };
  document.addEventListener("click", (e) => {
    if (!$("city-menu").hidden && !e.target.closest("#city-menu") && !e.target.closest("#city-btn")) toggleCityMenu(false);
  });
  $("search-btn").onclick = openSearch;
  $("search-cancel").onclick = closeSearch;
  $("q").addEventListener("input", (e) => renderSearch(e.target.value));
  $("q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("q").blur(); } });
  $("search-results").onclick = (e) => {
    const r = e.target.closest("[data-region]");
    if (r) { $("q").blur(); flyRegion(r.dataset.region); return; }
    const b = e.target.closest("[data-id]");
    if (b) { $("q").blur(); dispatchLoc({ type: "pick" }); select(b.dataset.id, { fly: true }); }
  };
  $("filter-btn").onclick = () => openDialog("filters");
  $("q-tobacco").onclick = () => openDialog("filters");
  $("q-public").onclick = () => setPref((p) => { p.showPublic = !p.showPublic; });
  $("q-business").onclick = () => setPref((p) => { p.showBusiness = !p.showBusiness; });
  $("filters").addEventListener("change", (e) => {
    const el = e.target;
    if (el.name === "tobacco") setPref((p) => { p.tobacco = el.value; });
    if (el.name === "route") setPref((p) => { p.route = el.value; });
    if (el.name === "lang") setLang(el.value);
    if (el.id === "s-public") setPref((p) => { p.showPublic = el.checked; });
    if (el.id === "s-business") setPref((p) => { p.showBusiness = el.checked; });
    if (el.id === "s-unverified") setPref((p) => { p.showUnverified = el.checked; });
    if (el.id === "s-hidden") setPref((p) => { p.showHidden = el.checked; });
  });
  $("locate").onclick = () => dispatchLoc({ type: "locate" });
  $("add-btn").onclick = () => openForm("place");
  $("tester-form").addEventListener("submit", submitTester);
  $("tester-leave").onclick = () => { COM.setTester(null); refreshCommunityUI(); loadCommunity(); $("info").close(); };
  for (const b of document.querySelectorAll("[data-close-dialog]")) b.onclick = () => b.closest("dialog").close();
  $("back").onclick = closeDetail;
  $("form-back").onclick = closeForm;
  $("list").onclick = (e) => {
    const b = e.target.closest("[data-id]");
    if (b) select(b.dataset.id, { fly: true });
  };
  $("banner").onclick = (e) => {
    const r = e.target.closest("[data-retry]");
    if (r) retryRegion(r.dataset.retry);
    if (e.target.closest("[data-locate]")) dispatchLoc({ type: "locate" });
  };
  $("detail").onclick = async (e) => {
    const r = e.target.closest("[data-report]");
    if (r) report(r.dataset.report);
    if (e.target.closest("[data-community-report]")) openForm("report");
    const fl = e.target.closest("[data-flag]");
    if (fl) {
      fl.disabled = true;
      try { await COM.flagPhoto(fl.dataset.flag, "other"); toast(t("toast.photoReported")); }
      catch (err) { toast(t(COM.errorKey(err), { detail: err.detail || "" })); fl.disabled = false; }
    }
  };
  $("form-scroll").addEventListener("change", (e) => {
    if (e.target.id === "f-photo" && e.target.files && e.target.files[0]) onPhoto(e.target.files[0]);
    if (e.target.type === "radio") {
      captureChoices();
      if (e.target.name === "kind" && state.form) {
        const pos = state.form.kind === "position";
        $("add-pin").hidden = !pos;
        $("pos-hint").hidden = !pos;
        if (pos) {
          if (sheet && !sheet.isPanel()) sheet.snap("half");
          positionPin();
        }
      }
    }
  });
  $("form-scroll").addEventListener("click", (e) => {
    if (e.target.closest("[data-photo-remove]") && state.form) { URL.revokeObjectURL(state.form.photo.url); state.form.photo = null; renderPhotoBox(); }
    if (e.target.closest("[data-form-close]")) closeForm();
    if (e.target.closest("[data-form-gps]")) {
      if (state.loc.pos && map) map.easeTo({ center: state.loc.pos, zoom: Math.max(map.getZoom(), 17), padding: mapPadding() });
      else dispatchLoc({ type: "locate" });
    }
  });
  $("form-scroll").addEventListener("submit", (e) => { e.preventDefault(); submitForm(); });
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) { e.preventDefault(); openDialog(o.dataset.open); }
  });
  for (const d of document.querySelectorAll("dialog")) {
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  }
  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("dialog")) return;
    if (e.key === "Escape") {
      if (!$("city-menu").hidden) { toggleCityMenu(false); $("city-btn").focus(); return; }
      if (state.view === "search") { closeSearch(); return; }
      if (state.view === "detail") { closeDetail(); return; }
      if (state.view === "form") { closeForm(); return; }
    }
    if (e.key === "/" && state.view !== "search" && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); openSearch(); }
  });
  window.addEventListener("online", () => { state.online = true; rerender(); retryFailed(); loadCommunity(); });
  window.addEventListener("offline", () => { state.online = false; rerender(); });

  // Tastatur auf dem iPhone: Inhalt bleibt über der Tastatur scrollbar
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onVV = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(kb)}px`);
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
  }
}
function retryFailed() {
  for (const [id, st] of Object.entries(state.regions)) if (st.status === "error") retryRegion(id);
}

function initSheet() {
  sheet = window.SmokrSheet.createSheet($("sheet"), {
    panelQuery: PANEL_QUERY,
    initial: "half",
    peek: () => 150,
    labels: () => ({ grow: t("sheet.grow"), shrink: t("sheet.shrink") }),
    onSettle: (name) => {
      document.body.dataset.sheet = name;
      applyPadding();
      if (name === "collapsed" && document.activeElement && document.activeElement.closest(".scroll")) $("grab").focus({ preventScroll: true });
    },
  });
  document.body.dataset.sheet = sheet.state;
  $("sheet").addEventListener("focusin", (e) => {
    if (sheet.isPanel() || sheet.state !== "collapsed") return;
    if (e.target.closest(".scroll")) sheet.snap("half");
  });
}

// ---------- Start ----------
for (const el of document.querySelectorAll("[data-mk]")) el.innerHTML = M.svg(el.dataset.mk === "business" ? "shop" : el.dataset.mk, null, 20);
applyStatic();
renderLegend();
syncFilters();
wire();
$("add-btn").hidden = true;
initCommunity();
initSheet();
initMap();
updateCityPill();
loadData();
// Nur wenn der Standort schon einmal erlaubt war, beim Start wieder abfragen
if (loadStore("kitsuen.geo", false)) dispatchLoc({ type: "locate" });

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Für automatische Tests (nur lesend gedacht)
window.__smokr = { state, get map() { return map; }, get sheet() { return sheet; }, get mapReady() { return mapReady; }, get t() { return t; } };
