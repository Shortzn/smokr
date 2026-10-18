"use strict";

const C = window.SmokrCore;
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const LIST_LIMIT = 30;
const COLORS = { public: "#12795c", customers: "#a65c1c", business: "#a65c1c", heated: "#6a4cb8", gone: "#9aa09c" };

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
};
let map = null;
let meMarker = null;
let geoWatch = null;

function savePrefs() { saveStore("kitsuen.prefs", state.prefs); }

// ---------- Text ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function colorOf(s) {
  if (state.reports[s.id]?.s === "gone") return COLORS.gone;
  if (s.heated) return COLORS.heated;
  return COLORS[C.category(s)];
}
function dotClass(s) {
  if (state.reports[s.id]?.s === "gone") return "g";
  if (s.heated) return "h";
  return C.category(s) === "public" ? "p" : "v";
}
function stationText(s, long) {
  if (!s.st) return "";
  const name = s.st.en || s.st.ja;
  if (long) return `Bahnhof ${name}${s.st.en ? ` (${s.st.ja})` : ""}, ${C.fmtDist(s.st.m)} Luftlinie`;
  return s.st.m < 600 ? `nahe Bhf. ${name}` : `Richtung Bhf. ${name}`;
}

// ---------- Bezugspunkt ----------
function mapCenter() {
  if (map) { const c = map.getCenter(); return [c.lng, c.lat]; }
  return C.REGIONS[0].center;
}
function anchor() { return C.anchorOf(state.loc, mapCenter()); }
function currentRegion() { return C.regionFor(anchor()); }

// ---------- Liste ----------
function renderList() {
  const from = anchor();
  const nearby = state.loc.mode === "nearby" && state.loc.pos;
  const region = currentRegion();
  const regionState = region ? state.regions[region.id] : null;

  $("list-title").textContent = nearby ? "In deiner Nähe" : region ? `${region.de}, um die Kartenmitte` : "Um die Kartenmitte";
  let sub = nearby ? "Luftlinie ab deinem Standort" : "Luftlinie ab der Kartenmitte";
  if (state.loc.error === "denied") sub += ". Standort ist nicht freigegeben.";
  else if (state.loc.error === "unavailable") sub += ". Standort gerade nicht verfügbar.";
  else if (state.loc.pendingCenter) sub = "Standort wird gesucht …";
  $("list-sub").textContent = sub;

  const note = region?.note || "";
  $("list-note").hidden = !note;
  $("list-note").textContent = note;

  const list = $("list");
  if (regionState && regionState.status === "error") {
    list.innerHTML = `<li class="empty error">Die Daten für ${esc(region.de)} konnten nicht geladen werden (${esc(regionState.error)}). Die Liste ist deshalb nicht vollständig. <button class="linkish" data-retry="${region.id}">Erneut versuchen</button></li>`;
    return;
  }
  if (regionState && regionState.status === "loading") {
    list.innerHTML = `<li class="empty">Daten für ${esc(region.de)} werden geladen …</li>`;
    return;
  }
  const top = C.rank(state.spots, from, state.prefs, state.reports, LIST_LIMIT);
  if (!top.length || top[0].d > 30000) {
    const nothing = !state.prefs.showPublic && !state.prefs.showBusiness
      ? "Alle Filter sind aus. Schalte oben Öffentlich oder Lokale ein."
      : region ? "In dieser Gegend ist mit den aktuellen Filtern nichts eingetragen."
        : "Hier liegt keiner der Orte der Reise. Wähle oben einen Ort.";
    list.innerHTML = `<li class="empty">${nothing}</li>`;
    return;
  }
  list.innerHTML = top.map(({ d, s }) => {
    const ja = C.jaLine(s);
    const meta = [C.accessLabel(s), s.heated ? "nur Tabakerhitzer" : "", C.placeType(s), stationText(s, false)].filter(Boolean).join(" · ");
    const tr = C.trust(s, state.reports[s.id]);
    return `<li><button class="item" data-id="${esc(s.id)}">
      <span class="dot dot-${dotClass(s)}"></span>
      <span class="t">${esc(C.title(s))}${ja ? ` <span class="ja" style="font-weight:400;color:var(--muted)">${esc(ja)}</span>` : ""}</span>
      <span class="d"><b>${C.fmtDist(d)}</b><span>Luftlinie</span></span>
      <span class="m">${esc(meta)}</span>
      <span class="m src">${esc(tr.short)}${tr.weak ? " · weniger verlässlich" : ""}</span>
    </button></li>`;
  }).join("");
}

// ---------- Detail ----------
function renderDetail(s) {
  const rep = state.reports[s.id];
  const tr = C.trust(s, rep);
  const facts = [];
  if (state.loc.pos) {
    const d = C.distM(state.loc.pos, [s.lon, s.lat]);
    facts.push(["Entfernung", `${C.fmtDist(d)} Luftlinie Richtung ${C.compass(C.bearing(state.loc.pos, [s.lon, s.lat]))}`]);
  }
  facts.push(["Zugang", esc(C.accessExplain(s))]);
  const type = C.placeType(s);
  if (type) facts.push(["Art", esc(type)]);
  const st = stationText(s, true);
  if (st) facts.push(["Bahnhof", esc(st)]);
  const h = C.hours(s.hours);
  facts.push(["Geöffnet", h ? `${esc(h.text)}${h.original ? `<br><span class="ja" style="color:var(--muted);font-size:13px">${esc(h.original)}</span>` : ""}` : "keine Angabe"]);
  if (s.addr) facts.push(["Adresse", `<span class="ja">${esc(s.addr)}</span>`]);

  const src = [];
  if (tr.official) src.push(["Offizielle Liste", `${esc(C.sourceName(s))}${tr.official.date ? `, Stand ${esc(C.fmtMonth(tr.official.date))}` : ", ohne Datum"}`]);
  if (tr.osm) src.push(["OpenStreetMap", tr.osm.checked ? `von Mitwirkenden zuletzt geprüft ${esc(C.fmtMonth(tr.osm.checked))}` : "eingetragen, ohne Prüfdatum"]);
  src.push(["Position", { exact: "genau", address: "aus der Adresse berechnet", area: "nur ungefähr" }[tr.position] || "unbekannt"]);
  src.push(["Du vor Ort", rep ? `${rep.s === "ok" ? "gefunden" : "nicht gefunden"} am ${new Date(rep.t).toLocaleDateString("de-AT")}` : "noch keine Rückmeldung"]);

  const urls = C.routeUrls(s);
  const warn = C.warnings(s, state.prefs);
  $("detail").innerHTML = `
    <div>
      <span class="kind kind-${dotClass(s)}"><span class="dot dot-${dotClass(s)}"></span>${esc(C.accessLabel(s))}${s.heated ? ", nur Tabakerhitzer" : ""}</span>
      <h2 class="d-title">${esc(C.title(s))}</h2>
      ${C.jaLine(s) ? `<p class="d-ja">${esc(C.jaLine(s))}</p>` : ""}
    </div>
    ${s.hint ? `<div class="hint" lang="ja">${esc(s.hint)}</div>` : ""}
    ${warn.map((w) => `<div class="warn">${esc(w.text)}</div>`).join("")}
    <div class="row">
      <a class="btn" href="${urls.apple}" target="_blank" rel="noopener">Route in Apple Karten</a>
      <a class="btn light" href="${urls.google}" target="_blank" rel="noopener">Google Maps</a>
    </div>
    <dl class="facts">${facts.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>
    <h3 class="facts-h">Herkunft der Angaben</h3>
    <dl class="facts">${src.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>
    <div>
      <div class="row">
        <button class="btn ok" data-report="ok">War da</button>
        <button class="btn no" data-report="gone">Nicht gefunden</button>
      </div>
      <p class="mine">${rep ? `<button class="linkish" data-report="clear">Rückmeldung zurücksetzen</button>` : "Deine Rückmeldung bleibt auf diesem Gerät gespeichert."}</p>
    </div>
    <div class="links">
      ${tr.official?.url ? `<a href="${esc(tr.official.url)}" target="_blank" rel="noopener">Offizielle Quelle</a>` : ""}
      ${tr.osm ? `<a href="${esc(tr.osm.url)}" target="_blank" rel="noopener">Auf OpenStreetMap</a>` : ""}
      <button data-open="ask">Auf Japanisch fragen</button>
    </div>`;
}

function select(id, fly) {
  const s = state.byId.get(id);
  if (!s) return;
  state.selected = id;
  renderDetail(s);
  $("list-view").hidden = true;
  $("detail-view").hidden = false;
  $("detail").scrollTop = 0;
  if (document.body.classList.contains("sheet-small")) setSheet("");
  updateMapData();
  if (fly && map) map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 16), offset: [0, -sheetOffset()] });
}
function closeDetail() {
  state.selected = null;
  $("detail-view").hidden = true;
  $("list-view").hidden = false;
  updateMapData();
  renderList();
}
function report(kind) {
  const id = state.selected;
  if (!id) return;
  if (kind === "clear") delete state.reports[id];
  else state.reports[id] = { s: kind, t: new Date().toISOString() };
  saveStore("kitsuen.reports", state.reports);
  updateMapData();
  renderDetail(state.byId.get(id));
}

// ---------- Blatt ----------
function setSheet(size) {
  document.body.classList.remove("sheet-small", "sheet-big");
  if (size) document.body.classList.add(`sheet-${size}`);
}
function sheetOffset() {
  if (window.innerWidth >= 760) return 0;
  return $("sheet").getBoundingClientRect().height / 2;
}

// ---------- Karte ----------
function geojson() {
  return {
    type: "FeatureCollection",
    features: state.spots.filter((s) => C.visible(s, Object.assign({}, state.prefs, { showHidden: true }), state.reports)).map((s) => ({
      type: "Feature",
      id: s.n,
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { id: s.id, c: colorOf(s), k: C.category(s) === "public" ? "p" : "v", sel: s.id === state.selected ? 1 : 0 },
    })),
  };
}
function updateMapData() {
  const src = map && map.getSource && map.getSource("spots");
  if (src) src.setData(geojson());
}

function initMap() {
  if (!window.maplibregl) return;
  const startRegion = C.REGIONS[0];
  try {
    map = new maplibregl.Map({
      container: "map",
      style: MAP_STYLE,
      center: startRegion.center,
      zoom: startRegion.zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
  } catch (e) {
    map = null;
    return;
  }
  map.touchZoomRotate.disableRotation();
  map.on("load", () => {
    map.addSource("spots", { type: "geojson", data: geojson() });
    map.addLayer({
      id: "spots-v", type: "circle", source: "spots", filter: ["==", ["get", "k"], "v"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 15, 6.5, 18, 9],
        "circle-color": ["get", "c"], "circle-stroke-color": "#fff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 15, 1.6],
      },
    });
    map.addLayer({
      id: "spots-p", type: "circle", source: "spots", filter: ["==", ["get", "k"], "p"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4.5, 15, 8.5, 18, 11],
        "circle-color": ["get", "c"], "circle-stroke-color": "#fff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 15, 2.2],
      },
    });
    map.addLayer({
      id: "spots-sel", type: "circle", source: "spots", filter: ["==", ["get", "sel"], 1],
      paint: { "circle-radius": 17, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#1f2421", "circle-stroke-width": 3 },
    });
    for (const layer of ["spots-p", "spots-v"]) {
      map.on("click", layer, (e) => {
        const f = e.features && e.features[0];
        if (f) select(f.properties.id, false);
      });
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
  });
  // Nur Gesten des Nutzers wechseln in den Modus "Kartenmitte"
  map.on("dragstart", (e) => { if (e.originalEvent) dispatchLoc({ type: "userPan" }); });
  map.on("moveend", () => {
    markRegion();
    if (state.loc.mode === "area" && !state.selected) renderList();
  });
}

// ---------- Orte ----------
function renderRegions() {
  $("regions").innerHTML = C.REGIONS.map((r) =>
    `<button class="region" data-region="${r.id}">${r.de}<small lang="ja">${r.ja}</small></button>`).join("");
}
function markRegion() {
  const r = currentRegion();
  for (const b of document.querySelectorAll(".region")) b.classList.toggle("on", !!r && b.dataset.region === r.id);
}
function flyRegion(id) {
  const r = C.REGIONS.find((x) => x.id === id);
  if (!r) return;
  if (state.selected) closeDetail();
  dispatchLoc({ type: "region" });
  if (map) map.flyTo({ center: r.center, zoom: r.zoom, offset: [0, -sheetOffset()] });
}

// ---------- Standort ----------
function dispatchLoc(ev) {
  const { state: next, effects } = C.locationReduce(state.loc, ev);
  state.loc = next;
  for (const fx of effects) {
    if (fx.type === "watch") startWatch();
    if (fx.type === "center" && map) map.easeTo({ center: fx.to, zoom: Math.max(map.getZoom(), 15.5), offset: [0, -sheetOffset()] });
  }
  $("locate").classList.toggle("off", state.loc.mode !== "nearby");
  markRegion();
  if (state.selected) renderDetail(state.byId.get(state.selected));
  else renderList();
}
let lastRankedPos = null;
function startWatch() {
  if (!("geolocation" in navigator)) { dispatchLoc({ type: "unavailable" }); return; }
  if (geoWatch !== null) return;
  geoWatch = navigator.geolocation.watchPosition((p) => {
    const pos = [p.coords.longitude, p.coords.latitude];
    saveStore("kitsuen.geo", true);
    if (map) {
      if (!meMarker) {
        const el = document.createElement("div");
        el.className = "me";
        meMarker = new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map);
      } else meMarker.setLngLat(pos);
    }
    // Liste nur neu sortieren, wenn sich etwas Merkliches bewegt hat
    const moved = !lastRankedPos || C.distM(lastRankedPos, pos) > 20 || state.loc.pendingCenter;
    if (moved) { lastRankedPos = pos; dispatchLoc({ type: "fix", pos, accuracy: p.coords.accuracy }); }
    else state.loc = Object.assign({}, state.loc, { pos, accuracy: p.coords.accuracy });
  }, (err) => {
    navigator.geolocation.clearWatch(geoWatch);
    geoWatch = null;
    if (err.code === 1) { saveStore("kitsuen.geo", false); dispatchLoc({ type: "denied" }); }
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
    return data.spots.map((s, j) => Object.assign(s, { region: r.id, n: i * 100000 + j }));
  } catch (e) {
    state.regions[r.id] = { status: "error", error: e.message === "Failed to fetch" || e.name === "TypeError" ? "keine Verbindung" : e.message };
    return [];
  }
}
function setSpots(spots) {
  state.spots = spots;
  state.byId = new Map(spots.map((s) => [s.id, s]));
  updateMapData();
  renderList();
  renderInfo();
}
async function loadData() {
  const parts = await Promise.all(C.REGIONS.map(loadRegion));
  setSpots(parts.flat());
}
async function retryRegion(id) {
  const i = C.REGIONS.findIndex((r) => r.id === id);
  renderList();
  const spots = await loadRegion(C.REGIONS[i], i);
  setSpots(state.spots.filter((s) => s.region !== id).concat(spots));
}
function renderInfo() {
  $("data-status").innerHTML = C.REGIONS.map((r) => {
    const st = state.regions[r.id] || {};
    const txt = st.status === "ok" ? `${st.count} Orte, Stand ${new Date(st.built).toLocaleDateString("de-AT")}` : st.status === "error" ? `nicht geladen (${st.error})` : "lädt";
    return `<li>${r.de}: ${esc(txt)}</li>`;
  }).join("");
}

// ---------- Bedienung ----------
function syncFilters() {
  const p = state.prefs;
  for (const [id, on] of [["f-public", p.showPublic], ["f-venue", p.showBusiness], ["f-heated", p.tobacco === "cig"]]) {
    $(id).classList.toggle("on", on);
    $(id).setAttribute("aria-pressed", String(on));
  }
  savePrefs();
}
function onFilter(change) {
  change(state.prefs);
  syncFilters();
  updateMapData();
  renderList();
}
function wire() {
  $("f-public").onclick = () => onFilter((p) => { p.showPublic = !p.showPublic; });
  $("f-venue").onclick = () => onFilter((p) => { p.showBusiness = !p.showBusiness; });
  $("f-heated").onclick = () => onFilter((p) => { p.tobacco = p.tobacco === "cig" ? "both" : "cig"; });
  $("locate").onclick = () => dispatchLoc({ type: "locate" });
  $("back").onclick = closeDetail;
  $("handle").onclick = () => {
    const b = document.body.classList;
    setSheet(b.contains("sheet-small") ? "" : b.contains("sheet-big") ? "small" : "big");
  };
  $("regions").onclick = (e) => {
    const b = e.target.closest("[data-region]");
    if (b) flyRegion(b.dataset.region);
  };
  $("list").onclick = (e) => {
    const r = e.target.closest("[data-retry]");
    if (r) { retryRegion(r.dataset.retry); return; }
    const b = e.target.closest("[data-id]");
    if (b) select(b.dataset.id, true);
  };
  $("detail").onclick = (e) => {
    const r = e.target.closest("[data-report]");
    if (r) report(r.dataset.report);
    const o = e.target.closest("[data-open]");
    if (o) $(o.dataset.open).showModal();
  };
  const extra = document.createElement("span");
  extra.style.display = "contents";
  extra.innerHTML = `<button class="chip" data-open="ask" lang="ja">喫煙所？</button><button class="chip" data-open="info" aria-label="Info zur App">Info</button>`;
  document.querySelector(".filters").append(extra);
  extra.onclick = (e) => { const o = e.target.closest("[data-open]"); if (o) $(o.dataset.open).showModal(); };
  for (const d of document.querySelectorAll("dialog")) {
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  }
}

renderRegions();
syncFilters();
wire();
initMap();
loadData();
markRegion();
// Nur wenn der Standort schon einmal erlaubt war, beim Start wieder abfragen
if (loadStore("kitsuen.geo", false)) dispatchLoc({ type: "locate" });

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
