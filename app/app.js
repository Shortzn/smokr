"use strict";

const C = window.SmokrCore;
const M = window.SmokrMarkers;
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

const state = {
  spots: [],
  byId: new Map(),
  regions: {}, // id -> {status: "loading"|"ok"|"error", error, built, count}
  prefs: C.migratePrefs(loadStore("kitsuen.prefs", null), loadStore("kitsuen.filters", null)),
  reports: loadStore("kitsuen.reports", {}),
  loc: C.initialLocation(),
  selected: null,
  view: "list",
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
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
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
  const name = s.st.en || s.st.ja;
  return s.st.m < 600 ? `bei ${name}` : `Richtung ${name}`;
}
function accessHtml(s) {
  const cat = C.category(s);
  return `<span class="acc acc-${cat}">${esc(C.accessLabel(s))}</span>`;
}

// ---------- Liste ----------
function renderHeader(top) {
  const region = C.regionFor(anchor());
  const nearby = isNearby();
  let title = nearby ? "In deiner Nähe" : region ? `In ${region.de}` : "Auf der Karte";
  let sub;
  if (state.loc.pendingCenter) sub = "Standort wird gesucht …";
  else if (top.length) {
    sub = `${nearby ? "Ab deinem Standort" : "Ab Kartenmitte"}, Luftlinie`;
  } else sub = nearby ? "Ab deinem Standort" : "Ab Kartenmitte";
  $("list-title").textContent = title;
  $("list-sub").textContent = sub;

  const banner = $("banner");
  const rs = region ? state.regions[region.id] : null;
  let html = "", cls = "";
  if (rs && rs.status === "error") {
    cls = "error";
    html = `<span>Daten für ${esc(region.de)} fehlen (${esc(rs.error)}). Die Liste ist nicht vollständig.</span><button class="text-btn" data-retry="${region.id}">Erneut laden</button>`;
  } else if (state.loc.error === "denied" && state.loc.perm === "denied") {
    cls = "";
    html = `<span>Standort nicht freigegeben. Die Liste zeigt Plätze um die Kartenmitte.</span>`;
  } else if (state.loc.error === "unavailable") {
    cls = "";
    html = `<span>Standort gerade nicht verfügbar.</span><button class="text-btn" data-locate>Erneut</button>`;
  } else if (!state.online) {
    cls = "warn";
    html = `<span>Offline. Gespeicherte Daten, Karte nur wo du schon warst.</span>`;
  }
  banner.className = `banner ${cls}`;
  banner.innerHTML = html;
  banner.hidden = !html;

  const rules = $("rules");
  rules.hidden = !(region && region.note);
  if (region && region.note) {
    $("rules-title").textContent = `Regeln in ${region.de}`;
    $("rules-text").textContent = region.note;
  }
}

function rowHtml(d, s, opts) {
  const kind = kindOf(s);
  const ja = C.jaLine(s);
  const meta = [accessHtml(s)];
  if (s.heated) meta.push(`<span class="acc acc-heated">nur Tabakerhitzer</span>`);
  const type = C.placeType(s);
  if (type) meta.push(esc(type));
  const tr = C.trust(s, state.reports[s.id]);
  const src = [tr.short];
  if (tr.position === "area") src.push("Position ungefähr");
  else if (tr.position === "address") src.push("Position aus Adresse");
  if (tr.mine) src.push(tr.mine.status === "ok" ? "von dir gefunden" : "von dir nicht gefunden");
  const st = stationLine(s);
  if (st) src.unshift(esc(st));
  return `<li><button class="row${kind === "gone" ? " gone" : ""}" data-id="${esc(s.id)}">
    ${M.svg(kind, weak(s), 28)}
    <span class="row-title">${esc(C.title(s))}${ja && !opts?.noJa ? `<span class="ja" lang="ja">${esc(ja)}</span>` : ""}</span>
    <span class="row-meta">${meta.join(" · ")}</span>
    <span class="row-src">${src.map((x) => x).join(" · ")}</span>
    ${d == null ? "" : `<span class="row-dist"><b>${C.fmtDist(d)}</b><span>Luftlinie</span></span>`}
  </button></li>`;
}

function renderList() {
  const from = anchor();
  const region = C.regionFor(from);
  const rs = region ? state.regions[region.id] : null;
  const list = $("list");
  if (!state.spots.length && Object.values(state.regions).some((r) => r.status === "loading")) {
    renderHeader([]);
    list.innerHTML = `<li class="empty">Daten werden geladen …</li>`;
    return;
  }
  const top = C.rank(state.spots, from, state.prefs, state.reports, LIST_LIMIT).filter((x) => x.d <= 30000);
  renderHeader(top);
  if (rs && rs.status === "error" && !top.length) {
    list.innerHTML = `<li class="empty">Für ${esc(region.de)} sind gerade keine Daten da. Prüfe die Verbindung und lade erneut.</li>`;
    return;
  }
  if (!top.length) {
    let msg;
    if (!state.prefs.showPublic && !state.prefs.showBusiness) msg = "Alle Arten sind ausgeblendet. Schalte oben „Öffentlich“ oder „Geschäfte“ ein.";
    else if (!region) msg = "Hier liegt keiner der Orte eurer Reise. Wähle oben einen Ort.";
    else if (!state.prefs.showBusiness) msg = "In dieser Gegend ist kein öffentlicher Platz eingetragen. Schalte „Geschäfte“ ein, um Lokale mit Raucherbereich zu sehen.";
    else msg = "In dieser Gegend ist mit diesen Filtern nichts eingetragen.";
    list.innerHTML = `<li class="empty">${msg}</li>`;
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
function renderDetail(s) {
  const rep = state.reports[s.id];
  const tr = C.trust(s, rep);
  const kind = kindOf(s);
  const cat = C.category(s);
  const tags = [`<span class="tag ${cat}">${M.svg(cat === "public" ? "public" : "business", weak(s), 16)}${esc(C.accessLabel(s))}</span>`];
  if (s.heated) tags.push(`<span class="tag heated">${M.svg("heated", false, 16)}Nur Tabakerhitzer</span>`);
  if (state.loc.pos) {
    const d = C.distM(state.loc.pos, [s.lon, s.lat]);
    if (d < 50000) tags.push(`<span class="tag dist">${C.fmtDist(d)} Luftlinie</span>`);
  }

  const app = routeApp();
  const urls = C.routeUrls(s);
  const appName = { apple: "Apple Karten", google: "Google Maps" };
  const other = app === "apple" ? "google" : "apple";

  const warn = C.warnings(s, state.prefs);
  const find = [];
  if (s.hint) find.push(`<p class="hint" lang="ja">${esc(s.hint)}</p>`);
  const where = [];
  if (s.st) where.push(["Bahnhof", `${esc(s.st.en || s.st.ja)}${s.st.en ? ` <span class="ja">${esc(s.st.ja)}</span>` : ""}, ${C.fmtDist(s.st.m)} Luftlinie`]);
  if (s.addr) where.push(["Adresse", `<span class="ja">${esc(s.addr)}</span>`]);

  const info = [];
  info.push(["Zugang", esc(C.accessExplain(s))]);
  const type = C.placeType(s);
  if (type) info.push(["Art", esc(type)]);
  const h = C.hours(s.hours);
  info.push(["Geöffnet", h ? `${esc(h.text)}${h.original ? `<span class="orig ja">${esc(h.original)}</span>` : ""}` : "keine Angabe"]);

  const src = [];
  if (tr.official) {
    src.push(["Offizielle Liste", `${esc(C.sourceName(s))}, ${tr.official.date ? `Stand ${esc(C.fmtMonth(tr.official.date))}` : "ohne Datum"}${tr.official.url ? `. <a href="${esc(tr.official.url)}" target="_blank" rel="noopener">Quelle öffnen</a>` : ""}`]);
  }
  if (tr.osm) {
    src.push(["OpenStreetMap", `${tr.osm.checked ? `Zuletzt von Mitwirkenden geprüft ${esc(C.fmtMonth(tr.osm.checked))}` : "Eingetragen, ohne Prüfdatum"}. <a href="${esc(tr.osm.url)}" target="_blank" rel="noopener">Eintrag öffnen</a>`]);
  }
  src.push(["Position", { exact: "Genau", address: "Aus der Adresse berechnet", area: "Nur ungefähr" }[tr.position] || "Unbekannt"]);

  $("detail").innerHTML = `
    <div class="d-head">
      <h2 class="d-title${C.title(s).length > 16 ? " long" : ""}" id="d-title">${esc(C.title(s))}</h2>
      ${C.jaLine(s) ? `<p class="d-ja" lang="ja">${esc(C.jaLine(s))}</p>` : ""}
      <div class="tags">${tags.join("")}</div>
    </div>
    <div class="route">
      <a class="btn primary btn-col" id="route-main" href="${urls[app]}" target="_blank" rel="noopener" data-route="${app}">Route starten<small>Fußweg in ${appName[app]}</small></a>
      <a class="text-btn alt" href="${urls[other]}" target="_blank" rel="noopener" data-route="${other}">Stattdessen in ${appName[other]} öffnen</a>
    </div>
    ${warn.map((w) => `<div class="callout">${esc(w.text)}</div>`).join("")}
    ${find.length || where.length ? `<div class="section"><h3>So findest du ihn</h3>${find.join("")}${where.length ? `<dl class="facts">${where.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>` : ""}</div>` : ""}
    <div class="section"><h3>Infos</h3><dl class="facts">${info.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl></div>
    <div class="section"><h3>Herkunft der Angaben</h3><dl class="facts">${src.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl></div>
    <div class="section">
      <h3>Warst du dort?</h3>
      <div class="feedback">
        <button class="btn" data-report="ok" aria-pressed="${rep?.s === "ok"}">Gefunden</button>
        <button class="btn" data-report="gone" aria-pressed="${rep?.s === "gone"}">Nicht gefunden</button>
      </div>
      <p class="mine">${rep ? `${rep.s === "ok" ? "Du hast ihn gefunden" : "Du hast ihn nicht gefunden"}, ${esc(new Date(rep.t).toLocaleDateString("de-AT"))}. <button class="text-btn" data-report="clear">Zurücksetzen</button>` : "Bleibt nur auf diesem Gerät. „Nicht gefunden“ blendet den Platz für dich aus."}</p>
    </div>
    <div class="section"><button class="btn secondary wide" data-open="ask"><span lang="ja">喫煙所？</span> Auf Japanisch fragen</button></div>`;
}

// ---------- Ansichten ----------
function setView(name) {
  state.view = name;
  for (const v of ["list", "detail", "search"]) {
    const el = $(`view-${v}`);
    const show = v === name;
    if (show && el.hidden) { el.hidden = false; el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
    else if (!show) el.hidden = true;
  }
}

function select(id, opts) {
  const s = state.byId.get(id);
  if (!s) return;
  const o = Object.assign({ fly: true }, opts);
  const keyboard = document.activeElement && document.activeElement.closest && document.activeElement.closest("#sheet") && document.activeElement.matches(":focus-visible");
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
  if (kind === "gone") toast("Ausgeblendet. Unter Filter wieder einblenden.");
  if (kind === "ok") toast("Danke, gespeichert");
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
function renderSearch(query) {
  const out = [];
  const regions = C.searchRegions(query);
  if (regions.length) {
    out.push(`<h3 class="group-h">Orte der Reise</h3><ol class="results">${regions.map((r) => {
      const st = state.regions[r.id];
      const count = st && st.status === "ok" ? `${st.count} Einträge` : st && st.status === "error" ? "Daten fehlen" : "";
      return `<li><button class="row city-row" data-region="${r.id}"><span class="mk-city" lang="ja">${r.ja.slice(0, 1)}</span><span class="row-title">${esc(r.de)}<span class="ja" lang="ja">${esc(r.ja)}</span></span><span class="row-meta">${esc(count)}</span></button></li>`;
    }).join("")}</ol>`);
  }
  if (query.trim()) {
    const hits = C.search(state.spots, query, anchor(), state.prefs, state.reports, 40);
    out.push(`<h3 class="group-h">Plätze</h3>`);
    out.push(hits.length ? `<ol class="results">${hits.map(({ d, s }) => rowHtml(d, s)).join("")}</ol>`
      : `<p class="empty">Nichts gefunden für „${esc(query)}“. Suche nach einem Bahnhof wie „Shinjuku“, „Namba“ oder „Kawaramachi“. Ausgeblendete Arten werden nicht durchsucht.</p>`);
  } else {
    out.push(`<p class="empty">Tipp: Suche nach einem Bahnhof, zum Beispiel „Shibuya“ oder „Kyoto“. Japanische Namen gehen auch.</p>`);
  }
  $("search-results").innerHTML = out.join("");
}

// ---------- Orte ----------
function currentMapRegion() { return C.regionFor(mapCenter()); }
function updateCityPill() {
  const r = currentMapRegion();
  $("city-name").textContent = r ? r.de : "Japan";
}
function renderCityMenu() {
  const cur = currentMapRegion();
  $("city-menu").innerHTML = C.REGIONS.map((r) => {
    const st = state.regions[r.id];
    const info = st && st.status === "ok" ? `${st.count} Einträge` : st && st.status === "error" ? "Daten fehlen" : "";
    return `<button role="menuitemradio" aria-checked="${cur && cur.id === r.id}" data-region="${r.id}"><b>${esc(r.de)} <span class="ja" lang="ja">${esc(r.ja)}</span></b><small>${esc(info)}</small><span class="check" aria-hidden="true">${cur && cur.id === r.id ? "✓" : ""}</span></button>`;
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
  if (state.view !== "list") setView("list");
  dispatchLoc({ type: "region" });
  if (sheet && !sheet.isPanel() && sheet.state === "expanded") sheet.snap("half");
  if (map) map.flyTo({ center: r.center, zoom: r.zoom, padding: mapPadding(), essential: false }, { smokr: "region" });
  else renderList();
}

// ---------- Karte ----------
function featureCollection() {
  const prefs = Object.assign({}, state.prefs);
  return {
    type: "FeatureCollection",
    features: state.spots.filter((s) => C.visible(s, prefs, state.reports)).map((s) => {
      const kind = kindOf(s);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id,
          icon: `m-${kind}${weak(s) ? "-weak" : ""}`,
          pub: C.category(s) === "public" ? 1 : 0,
          // öffentlich und verlässlich oben
          rank: (C.category(s) === "public" ? 0 : 2) + (weak(s) ? 1 : 0),
        },
      };
    }),
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

function initMap() {
  if (!window.maplibregl) { $("map").textContent = ""; return; }
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
  map.keyboard.disableRotation && map.keyboard.disableRotation();
  map.on("load", () => {
    M.addImages(map);
    map.addSource("spots", {
      type: "geojson",
      data: featureCollection(),
      cluster: true,
      clusterRadius: 56,
      clusterMaxZoom: 14,
      clusterProperties: { pub: ["+", ["get", "pub"]] },
    });
    map.addSource("sel", { type: "geojson", data: selectedCollection() });
    map.addLayer({
      id: "clusters", type: "circle", source: "spots", filter: ["has", "point_count"],
      paint: {
        "circle-color": ["case", [">", ["get", "pub"], 0], "#000000", "#6b6b6b"],
        "circle-radius": ["step", ["get", "point_count"], 12, 10, 14, 50, 17],
        "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "spots", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: "spots", type: "symbol", source: "spots", filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.75, 15, 1, 18, 1.25],
        "icon-allow-overlap": true,
        "icon-padding": 0,
        "symbol-sort-key": ["-", 10, ["get", "rank"]],
      },
    });
    map.addLayer({
      id: "selected", type: "symbol", source: "sel",
      layout: { "icon-image": ["get", "icon"], "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true },
    });
    map.on("click", "spots", (e) => {
      const f = e.features && e.features[0];
      if (f) select(f.properties.id, { fly: false });
    });
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
    // Quellenangabe zuerst eingeklappt, sie steht vollständig unter "Info und Quellen"
    document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    map.on("click", (e) => {
      // Tipp auf freie Karte schließt die Detailansicht
      if (state.view !== "detail") return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ["spots", "clusters", "selected"] });
      if (!hit.length) closeDetail();
    });
    mapReady = true;
    updateMapData();
    applyPadding();
  });
  map.on("error", (e) => {
    // Kartenteile fehlen (offline): die Liste funktioniert trotzdem
    if (e && e.error && /Failed to fetch|NetworkError|Load failed/i.test(String(e.error.message))) state.mapOffline = true;
  });
  map.on("dragstart", (e) => { if (e.originalEvent) dispatchLoc({ type: "userPan" }); });
  map.on("zoomstart", (e) => { if (e.originalEvent && e.originalEvent.type === "wheel") dispatchLoc({ type: "userPan" }); });
  map.on("moveend", () => {
    if (paddingPending) setTimeout(applyPadding, 0);
    updateCityPill();
    const c = map.getCenter();
    saveStore("kitsuen.view", { c: [+c.lng.toFixed(5), +c.lat.toFixed(5)], z: +map.getZoom().toFixed(2) });
    if (state.loc.mode === "area") renderListSoon();
  });
}
let paddingPending = false;
function applyPadding() {
  if (!map || !sheet) return;
  // setPadding springt sofort und würde einen laufenden Kartenflug abbrechen
  if (map.isMoving()) { paddingPending = true; return; }
  paddingPending = false;
  map.setPadding(mapPadding());
}

// ---------- Standort ----------
function dispatchLoc(ev) {
  const { state: next, effects } = C.locationReduce(state.loc, ev);
  state.loc = next;
  for (const fx of effects) {
    if (fx.type === "watch") startWatch();
    if (fx.type === "center" && map) {
      if (state.selected) { state.selected = null; updateSelection(); setView("list"); }
      map.easeTo({ center: fx.to, zoom: Math.max(map.getZoom(), 15.5), padding: mapPadding(), duration: 500 });
    }
  }
  const btn = $("locate");
  btn.setAttribute("aria-pressed", String(isNearby()));
  btn.classList.toggle("busy", state.loc.pendingCenter);
  btn.setAttribute("aria-label", isNearby() ? "Liste ab meinem Standort (aktiv)" : "Zu meinem Standort");
  if (state.view === "detail" && state.selected) renderDetail(state.byId.get(state.selected));
  else if (state.view === "list") renderList();
}
function placeMe(pos, accuracy) {
  if (!map) return;
  if (!meMarker) {
    const el = document.createElement("div");
    el.className = "me";
    el.setAttribute("aria-label", "Dein Standort");
    meMarker = new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map);
  } else meMarker.setLngLat(pos);
  void accuracy;
}
function startWatch() {
  if (!("geolocation" in navigator)) { dispatchLoc({ type: "unavailable" }); return; }
  if (geoWatch !== null) return;
  geoWatch = navigator.geolocation.watchPosition((p) => {
    const pos = [p.coords.longitude, p.coords.latitude];
    saveStore("kitsuen.geo", true);
    placeMe(pos, p.coords.accuracy);
    // Liste nur neu sortieren, wenn sich etwas Merkliches bewegt hat
    const moved = !lastRankedPos || C.distM(lastRankedPos, pos) > 20 || state.loc.pendingCenter || state.loc.perm !== "granted";
    if (moved) { lastRankedPos = pos; dispatchLoc({ type: "fix", pos, accuracy: p.coords.accuracy }); }
    else state.loc = Object.assign({}, state.loc, { pos, accuracy: p.coords.accuracy });
  }, (err) => {
    navigator.geolocation.clearWatch(geoWatch);
    geoWatch = null;
    if (err.code === 1) { saveStore("kitsuen.geo", false); dispatchLoc({ type: "denied" }); toast("Standort nicht freigegeben"); }
    else dispatchLoc({ type: "unavailable" });
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}

// ---------- Daten ----------
async function loadRegion(r, i) {
  state.regions[r.id] = { status: "loading" };
  try {
    const res = await fetch(`data/${r.id}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = C.validateRegionData(await res.json(), r.id);
    state.regions[r.id] = { status: "ok", built: data.built, count: data.spots.length };
    return data.spots.map((s) => Object.assign(s, { region: r.id }));
  } catch (e) {
    const offline = e.name === "TypeError";
    state.regions[r.id] = { status: "error", error: offline ? "keine Verbindung" : e.message };
    void i;
    return [];
  }
}
function setSpots(spots) {
  state.spots = spots;
  state.byId = new Map(spots.map((s) => [s.id, s]));
  updateMapData();
  if (state.view === "list") renderList();
  renderInfo();
}
async function loadData() {
  renderList();
  const parts = await Promise.all(C.REGIONS.map(loadRegion));
  setSpots(parts.flat());
}
async function retryRegion(id) {
  const i = C.REGIONS.findIndex((r) => r.id === id);
  state.regions[id] = { status: "loading" };
  renderList();
  const spots = await loadRegion(C.REGIONS[i], i);
  setSpots(state.spots.filter((s) => s.region !== id).concat(spots));
  toast(state.regions[id].status === "ok" ? "Daten geladen" : "Laden fehlgeschlagen");
}
function renderInfo() {
  $("data-status").innerHTML = C.REGIONS.map((r) => {
    const st = state.regions[r.id] || {};
    const txt = st.status === "ok" ? `${st.count} Einträge, gebaut am ${new Date(st.built).toLocaleDateString("de-AT")}` : st.status === "error" ? `nicht geladen (${st.error})` : "lädt";
    return `<li>${esc(r.de)}: ${esc(txt)}</li>`;
  }).join("");
}

// ---------- Filter ----------
const TOBACCO_LABEL = { cig: "Nur Zigaretten", heated: "Tabakerhitzer", both: "Zigarette & IQOS" };
const TOBACCO_HINT = {
  cig: "Plätze nur für Tabakerhitzer werden ausgeblendet.",
  heated: "Alle Plätze werden gezeigt. Plätze nur für Tabakerhitzer gelten für dich nicht als Einschränkung.",
  both: "Alle Plätze werden gezeigt. Plätze nur für Tabakerhitzer sind markiert.",
};
function syncFilters() {
  const p = state.prefs;
  $("q-public").setAttribute("aria-pressed", String(p.showPublic));
  $("q-business").setAttribute("aria-pressed", String(p.showBusiness));
  $("q-tobacco-label").textContent = TOBACCO_LABEL[p.tobacco];
  $(`t-${p.tobacco}`).checked = true;
  $(`r-${routeApp()}`).checked = true;
  $("s-public").checked = p.showPublic;
  $("s-business").checked = p.showBusiness;
  $("s-hidden").checked = p.showHidden;
  $("tobacco-hint").textContent = TOBACCO_HINT[p.tobacco];
  const changed = p.tobacco !== C.DEFAULT_PREFS.tobacco || p.showPublic !== C.DEFAULT_PREFS.showPublic || p.showBusiness !== C.DEFAULT_PREFS.showBusiness || p.showHidden;
  $("filter-badge").hidden = !changed;
}
function setPref(change) {
  change(state.prefs);
  savePrefs();
  syncFilters();
  updateMapData();
  if (state.view === "list") renderList();
  if (state.view === "detail" && state.selected) renderDetail(state.byId.get(state.selected));
  if (state.view === "search") renderSearch($("q").value);
}
function renderLegend() {
  const items = [
    ["public", false, "Öffentlicher Raucherplatz", "Ohne Einkauf nutzbar"],
    ["business", false, "Geschäft oder Lokal", "Nur für Kunden, oder Zugang unklar"],
    ["heated", false, "Nur Tabakerhitzer", "IQOS, glo, Ploom. Keine Zigaretten"],
    ["public", true, "Weniger verlässlich", "Hohl: nur OpenStreetMap ohne Prüfdatum, oder Position ungefähr"],
    ["gone", false, "Von dir nicht gefunden", "Nur sichtbar, wenn eingeblendet"],
  ];
  $("legend-list").innerHTML = items.map(([k, hollow, t, d]) => `<li>${M.svg(k, hollow, 32)}<span><b>${t}</b>${d}</span></li>`).join("")
    + `<li><svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="#000" stroke="#fff" stroke-width="2"/><text x="16" y="20.5" font-size="12" font-weight="700" text-anchor="middle" fill="#fff" font-family="-apple-system,sans-serif">12</text></svg><span><b>Gruppe</b>Mehrere Plätze, antippen zum Vergrößern. Grau: nur Geschäfte</span></li>`;
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
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("q").blur(); }
  });
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
    const t = e.target;
    if (t.name === "tobacco") setPref((p) => { p.tobacco = t.value; });
    if (t.name === "route") setPref((p) => { p.route = t.value; });
    if (t.id === "s-public") setPref((p) => { p.showPublic = t.checked; });
    if (t.id === "s-business") setPref((p) => { p.showBusiness = t.checked; });
    if (t.id === "s-hidden") setPref((p) => { p.showHidden = t.checked; });
  });
  $("locate").onclick = () => dispatchLoc({ type: "locate" });
  $("back").onclick = closeDetail;
  $("list").onclick = (e) => {
    const b = e.target.closest("[data-id]");
    if (b) select(b.dataset.id, { fly: true });
  };
  $("banner").onclick = (e) => {
    const r = e.target.closest("[data-retry]");
    if (r) retryRegion(r.dataset.retry);
    if (e.target.closest("[data-locate]")) dispatchLoc({ type: "locate" });
  };
  $("detail").onclick = (e) => {
    const r = e.target.closest("[data-report]");
    if (r) report(r.dataset.report);
  };
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
    }
    if (e.key === "/" && state.view !== "search" && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); openSearch(); }
  });
  window.addEventListener("online", () => { state.online = true; if (state.view === "list") renderList(); retryFailed(); });
  window.addEventListener("offline", () => { state.online = false; if (state.view === "list") renderList(); });

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
    onSettle: (name) => {
      document.body.dataset.sheet = name;
      applyPadding();
      // Fokus nicht im verdeckten Teil lassen
      if (name === "collapsed" && document.activeElement && document.activeElement.closest(".scroll")) $("grab").focus({ preventScroll: true });
    },
  });
  document.body.dataset.sheet = sheet.state;
  // Tastaturfokus im Blatt: Blatt öffnen, damit das Ziel sichtbar ist
  $("sheet").addEventListener("focusin", (e) => {
    if (sheet.isPanel() || sheet.state !== "collapsed") return;
    if (e.target.closest(".scroll")) sheet.snap("half");
  });
}

// ---------- Start ----------
for (const el of document.querySelectorAll("[data-mk]")) el.innerHTML = M.svg(el.dataset.mk, false, 18);
renderLegend();
syncFilters();
wire();
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
window.__smokr = { state, get map() { return map; }, get sheet() { return sheet; }, get mapReady() { return mapReady; } };
