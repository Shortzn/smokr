"use strict";

// Reihenfolge = Reiseroute
const REGIONS = [
  { id: "tokyo", de: "Tokio", ja: "東京", center: [139.767, 35.681], zoom: 12.3 },
  { id: "kamakura", de: "Kamakura", ja: "鎌倉", center: [139.5505, 35.3192], zoom: 13.6 },
  { id: "kyoto", de: "Kyoto", ja: "京都", center: [135.7681, 35.0045], zoom: 12.8 },
  { id: "okinawa", de: "Okinawa", ja: "沖縄", center: [127.6809, 26.2124], zoom: 12.4 },
  { id: "osaka", de: "Osaka", ja: "大阪", center: [135.5023, 34.6937], zoom: 12.4 },
];
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const WALK_M_PER_MIN = 75;
const LIST_LIMIT = 30;
const GENERIC_NAMES = /^(喫煙所|喫煙場所|喫煙コーナー|喫煙スペース|喫煙エリア|指定喫煙所|公衆喫煙所|smoking area)$/i;
const COLORS = { p: "#12795c", v: "#a65c1c", h: "#6a4cb8", g: "#9aa09c" };

const $ = (id) => document.getElementById(id);
const state = {
  spots: [],
  byId: new Map(),
  pos: null,
  filters: { public: true, venue: false, noHeated: false },
  selected: null,
  reports: loadStore("kitsuen.reports", {}),
  built: null,
};
let map = null;
let meMarker = null;
let geoWatch = null;

// ---------- Speicher ----------
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
const savedFilters = loadStore("kitsuen.filters", null);
if (savedFilters) Object.assign(state.filters, savedFilters);

// ---------- Geometrie ----------
function distM(a, b) {
  const r = 6371000, rad = Math.PI / 180;
  const dp = (b[1] - a[1]) * rad, dl = (b[0] - a[0]) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad);
  const x = Math.cos(a[1] * rad) * Math.sin(b[1] * rad) - Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos((b[0] - a[0]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
const COMPASS = ["Norden", "Nordosten", "Osten", "Südosten", "Süden", "Südwesten", "Westen", "Nordwesten"];
function compass(deg) { return COMPASS[Math.round(deg / 45) % 8]; }
function fmtDist(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",")} km`;
}
function fmtWalk(m) {
  const min = Math.max(1, Math.round(m / WALK_M_PER_MIN));
  return min > 90 ? "" : `${min} Min. zu Fuß`;
}

// ---------- Texte ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function kindOf(s) {
  if (state.reports[s.id]?.s === "gone") return "g";
  if (s.heated) return "h";
  return s.k;
}
function title(s) {
  if (s.ne) return s.ne;
  if (s.nj && !GENERIC_NAMES.test(s.nj.trim())) return s.nj;
  return s.k === "p" ? "Raucherplatz" : s.vt || "Lokal";
}
function jaLine(s) {
  return s.nj && s.nj !== title(s) ? s.nj : "";
}
function stationText(s, long) {
  if (!s.st) return "";
  const name = s.st.en || s.st.ja;
  if (long) return `Bahnhof ${name}${s.st.en ? ` (${s.st.ja})` : ""}, ${fmtDist(s.st.m)} entfernt`;
  return s.st.m < 600 ? `nahe Bhf. ${name}` : `Richtung Bhf. ${name}`;
}
function kindLabel(s) {
  const k = kindOf(s);
  if (k === "g") return "Von dir nicht gefunden";
  if (k === "h") return s.k === "p" ? "Nur Tabakerhitzer, öffentlich" : "Nur Tabakerhitzer, Lokal";
  if (k === "p") return s.cust ? "Raucherplatz, nur für Kunden" : "Öffentlicher Raucherplatz";
  return `${s.vt || "Lokal"} mit Raucherbereich`;
}
function metaLine(s) {
  const parts = [];
  if (s.k === "v") parts.push(s.vt, s.sd, "Kaufpflicht");
  else {
    if (s.heated) parts.push("nur Tabakerhitzer");
    if (s.cust) parts.push("nur für Kunden");
    if (s.ind) parts.push("drinnen");
    else if (s.cov) parts.push("überdacht");
  }
  const st = stationText(s, false);
  if (st) parts.push(st);
  return parts.filter(Boolean).join(" · ");
}
function sourceText(s) {
  const out = [];
  if (s.src.includes("official")) out.push(s.ward ? `Bezirk ${s.ward}` : "offizielle Liste");
  if (s.src.includes("osm")) out.push("OpenStreetMap");
  return out.join(" und ");
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString("de-AT", { month: "short", year: "numeric" });
}
const JA_WORDS = [
  [/24時間/g, "rund um die Uhr"], [/平日/g, "Mo–Fr"], [/土曜日?/g, "Sa"], [/日曜日?/g, "So"],
  [/祝日|祝祭日/g, "Feiertage"], [/年末年始/g, "Jahreswechsel"], [/お盆/g, "Obon"],
  [/を除く/g, " ausgenommen"], [/のみ/g, " nur"], [/から/g, " bis "], [/まで/g, ""], [/毎日/g, "täglich"], [/[～〜]/g, "–"],
  [/・/g, ", "], [/（/g, " ("], [/）/g, ")"],
];
function fmtHours(h) {
  if (!h) return "";
  if (h === "24/7") return "rund um die Uhr";
  if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(h)) return esc(h.replace(/Mo-Su/g, "täglich"));
  let t = h.replace(/午前(\d{1,2})時(\d{1,2})?分?/g, (_, a, b) => `${a}:${(b || "00").padStart(2, "0")}`)
    .replace(/午後(\d{1,2})時(\d{1,2})?分?/g, (_, a, b) => `${(+a % 12) + 12}:${(b || "00").padStart(2, "0")}`)
    .replace(/(\d{1,2})時(\d{1,2})分/g, "$1:$2").replace(/(\d{1,2})時/g, "$1:00");
  for (const [re, de] of JA_WORDS) t = t.replace(re, de);
  // Wenn noch viel Japanisch übrig ist, zusätzlich das Original zeigen
  const rest = (t.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
  return rest > 3 ? `${esc(t)}<br><span class="ja" style="color:var(--muted);font-size:13px">${esc(h)}</span>` : esc(t);
}

// ---------- Filter ----------
function visible(s) {
  if (s.k === "p" && !state.filters.public) return false;
  if (s.k === "v" && !state.filters.venue) return false;
  if (state.filters.noHeated && s.heated) return false;
  return true;
}
function origin() {
  if (state.pos) return state.pos;
  if (map) { const c = map.getCenter(); return [c.lng, c.lat]; }
  return REGIONS[0].center;
}

// ---------- Liste ----------
function renderList() {
  const from = origin();
  const cand = [];
  for (const s of state.spots) {
    if (!visible(s)) continue;
    if (state.reports[s.id]?.s === "gone") continue;
    cand.push([distM(from, [s.lon, s.lat]), s]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  const top = cand.slice(0, LIST_LIMIT);

  $("list-title").textContent = state.pos ? "In deiner Nähe" : "Rund um die Kartenmitte";
  if (!state.spots.length) {
    $("list-sub").textContent = "Daten werden geladen …";
  } else if (state.pos) {
    $("list-sub").textContent = "Sortiert nach Entfernung von dir";
  } else {
    $("list-sub").textContent = geoWatch === null ? "Tippe auf das Standort-Symbol für Plätze bei dir" : "Standort wird gesucht …";
  }

  const list = $("list");
  if (!top.length || top[0][0] > 30000) {
    const nothing = state.filters.public || state.filters.venue
      ? "Hier in der Nähe ist nichts eingetragen. Wähle oben einen Ort der Reise."
      : "Alle Filter sind aus. Schalte oben Öffentlich oder Lokale ein.";
    list.innerHTML = `<li class="empty">${nothing}</li>`;
    return;
  }
  list.innerHTML = top.map(([d, s]) => {
    const deg = bearing(from, [s.lon, s.lat]);
    const ja = jaLine(s);
    return `<li><button class="item" data-id="${esc(s.id)}">
      <span class="dot dot-${kindOf(s)}"></span>
      <span class="t">${esc(title(s))}${ja ? ` <span class="ja" style="font-weight:400;color:var(--muted)">${esc(ja)}</span>` : ""}</span>
      <span class="d"><b>${fmtDist(d)}</b><span>${state.pos ? arrow(deg) : ""}${esc(fmtWalk(d))}</span></span>
      <span class="m">${esc(metaLine(s))}</span>
    </button></li>`;
  }).join("");
}
function arrow(deg) {
  return `<svg viewBox="0 0 12 12" width="11" height="11" style="transform:rotate(${Math.round(deg)}deg);vertical-align:-1px;margin-right:3px" aria-label="Richtung ${compass(deg)}"><path d="M6 1l4 9-4-2.4L2 10z" fill="currentColor"/></svg>`;
}

// ---------- Detail ----------
function renderDetail(s) {
  const from = state.pos;
  const d = from ? distM(from, [s.lon, s.lat]) : null;
  const k = kindOf(s);
  const rep = state.reports[s.id];
  const facts = [];
  if (d !== null) facts.push(["Entfernung", `${fmtDist(d)} Richtung ${compass(bearing(from, [s.lon, s.lat]))}${fmtWalk(d) ? `, ${fmtWalk(d)}` : ""}`]);
  const st = stationText(s, true);
  if (st) facts.push(["Bahnhof", st]);
  if (s.k === "v") facts.push(["Rauchen", `${s.sd}. Du musst etwas kaufen.`]);
  if (s.hours) facts.push(["Geöffnet", fmtHours(s.hours)]);
  if (s.ind) facts.push(["Lage", "drinnen"]);
  else if (s.cov) facts.push(["Lage", "überdacht"]);
  if (s.addr) facts.push(["Adresse", `<span class="ja">${esc(s.addr)}</span>`]);
  facts.push(["Quelle", esc(sourceText(s))]);
  facts.push(["Geprüft", s.chk ? fmtDate(s.chk) : "Datum unbekannt"]);

  const apple = `https://maps.apple.com/?daddr=${s.lat},${s.lon}&dirflg=w`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking`;
  const warnings = [];
  if (s.heated) warnings.push("Nur für Tabakerhitzer wie IQOS, glo oder Ploom. Zigaretten sind hier nicht erlaubt.");
  if (s.unk) warnings.push("Die Stadt gibt den Status als unklar an. Vielleicht ist er gerade geschlossen.");
  if (s.geo === "area") warnings.push("Die Position ist nur ungefähr bekannt, auf Ebene des Stadtteils. Halte dich an die Beschreibung oder frag vor Ort.");
  if (s.geo === "address") warnings.push("Die Position wurde aus der Adresse berechnet und kann etwas danebenliegen. Halte dich an die Beschreibung.");
  if (!s.src.includes("official") && !s.chk && s.k === "p") warnings.push("Nur von Freiwilligen auf OpenStreetMap eingetragen, ohne Prüfdatum. Kann veraltet sein.");

  $("detail").innerHTML = `
    <div>
      <span class="kind kind-${k === "g" ? "p" : k}"><span class="dot dot-${k}"></span>${esc(kindLabel(s))}</span>
      <h2 class="d-title">${esc(title(s))}</h2>
      ${jaLine(s) ? `<p class="d-ja">${esc(jaLine(s))}</p>` : ""}
    </div>
    ${s.hint ? `<div class="hint" lang="ja">${esc(s.hint)}</div>` : ""}
    ${warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join("")}
    <div class="row">
      <a class="btn" href="${apple}" target="_blank" rel="noopener">Route in Apple Karten</a>
      <a class="btn light" href="${google}" target="_blank" rel="noopener">Google Maps</a>
    </div>
    <dl class="facts">${facts.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>
    <div>
      <div class="row">
        <button class="btn ok" data-report="ok">War da</button>
        <button class="btn no" data-report="gone">Nicht gefunden</button>
      </div>
      <p class="mine">${rep ? `${rep.s === "ok" ? "Von dir bestätigt" : "Von dir als nicht gefunden markiert"} am ${new Date(rep.t).toLocaleDateString("de-AT")}. <button class="linkish" data-report="clear" style="color:var(--focus);background:none;border:0;padding:0;text-decoration:underline">Zurücksetzen</button>` : "Deine Rückmeldung bleibt auf diesem Gerät gespeichert."}</p>
    </div>
    <div class="links">
      ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${s.src.includes("official") ? "Offizielle Quelle" : "Auf OpenStreetMap"}</a>` : ""}
      ${s.osm ? `<a href="${esc(s.osm)}" target="_blank" rel="noopener">Auf OpenStreetMap</a>` : ""}
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
  updateSelection();
  if (fly && map) map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 16), offset: [0, -sheetOffset()] });
}
function closeDetail() {
  state.selected = null;
  $("detail-view").hidden = true;
  $("list-view").hidden = false;
  updateSelection();
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
    features: state.spots.filter(visible).map((s) => ({
      type: "Feature",
      id: s.n,
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { id: s.id, c: COLORS[kindOf(s)], k: s.k, sel: s.id === state.selected ? 1 : 0 },
    })),
  };
}
function updateMapData() {
  const src = map && map.getSource && map.getSource("spots");
  if (src) src.setData(geojson());
}
function updateSelection() {
  updateMapData();
}

function initMap() {
  if (!window.maplibregl) return;
  const startRegion = REGIONS[0];
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
  map.on("moveend", () => {
    markRegion();
    if (!state.pos && !state.selected) renderList();
  });
}

// ---------- Orte ----------
function renderRegions() {
  $("regions").innerHTML = REGIONS.map((r) =>
    `<button class="region" data-region="${r.id}">${r.de}<small lang="ja">${r.ja}</small></button>`).join("");
}
function markRegion() {
  if (!map) return;
  const c = map.getCenter();
  let best = null, bd = Infinity;
  for (const r of REGIONS) {
    const d = distM([c.lng, c.lat], r.center);
    if (d < bd) { bd = d; best = r; }
  }
  for (const b of document.querySelectorAll(".region")) {
    b.classList.toggle("on", bd < 40000 && b.dataset.region === best.id);
  }
}
function flyRegion(id) {
  const r = REGIONS.find((x) => x.id === id);
  if (!r || !map) return;
  if (state.selected) closeDetail();
  map.flyTo({ center: r.center, zoom: r.zoom, offset: [0, -sheetOffset()] });
}

// ---------- Standort ----------
function startGeo(recenter) {
  if (!("geolocation" in navigator)) {
    $("list-sub").textContent = "Dieses Gerät gibt keinen Standort her.";
    return;
  }
  if (geoWatch !== null) {
    if (state.pos && map && recenter) map.easeTo({ center: state.pos, zoom: Math.max(map.getZoom(), 15.5), offset: [0, -sheetOffset()] });
    return;
  }
  let first = true;
  geoWatch = navigator.geolocation.watchPosition((p) => {
    state.pos = [p.coords.longitude, p.coords.latitude];
    $("locate").classList.remove("off");
    if (map) {
      if (!meMarker) {
        const el = document.createElement("div");
        el.className = "me";
        meMarker = new maplibregl.Marker({ element: el }).setLngLat(state.pos).addTo(map);
      } else {
        meMarker.setLngLat(state.pos);
      }
      if (first && recenter) map.jumpTo({ center: state.pos, zoom: 15.5, offset: [0, -sheetOffset()] });
    }
    first = false;
    if (!state.selected) renderList();
    else renderDetail(state.byId.get(state.selected));
  }, (err) => {
    navigator.geolocation.clearWatch(geoWatch);
    geoWatch = null;
    $("locate").classList.add("off");
    $("list-sub").textContent = err.code === 1
      ? "Standort ist nicht erlaubt. In den Einstellungen unter Safari > Standort freigeben."
      : "Standort gerade nicht verfügbar. Die Liste zeigt Plätze um die Kartenmitte.";
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  saveStore("kitsuen.geo", true);
  renderList();
}

// ---------- Daten ----------
async function loadData() {
  const results = await Promise.allSettled(REGIONS.map((r) =>
    fetch(`data/${r.id}.json`).then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })));
  let n = 0;
  const spots = [];
  results.forEach((res, i) => {
    if (res.status !== "fulfilled") return;
    if (!state.built || res.value.built > state.built) state.built = res.value.built;
    for (const s of res.value.spots) { s.region = REGIONS[i].id; s.n = n++; spots.push(s); }
  });
  state.spots = spots;
  state.byId = new Map(spots.map((s) => [s.id, s]));
  $("built").textContent = state.built ? new Date(state.built).toLocaleDateString("de-AT") : "unbekannt";
  updateMapData();
  renderList();
}

// ---------- Bedienung ----------
function syncFilters() {
  const f = state.filters;
  for (const [id, on] of [["f-public", f.public], ["f-venue", f.venue], ["f-heated", f.noHeated]]) {
    $(id).classList.toggle("on", on);
    $(id).setAttribute("aria-pressed", String(on));
  }
  saveStore("kitsuen.filters", f);
}
function wire() {
  $("f-public").onclick = () => { state.filters.public = !state.filters.public; syncFilters(); updateMapData(); renderList(); };
  $("f-venue").onclick = () => { state.filters.venue = !state.filters.venue; syncFilters(); updateMapData(); renderList(); };
  $("f-heated").onclick = () => { state.filters.noHeated = !state.filters.noHeated; syncFilters(); updateMapData(); renderList(); };
  $("locate").onclick = () => startGeo(true);
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
    const b = e.target.closest("[data-id]");
    if (b) select(b.dataset.id, true);
  };
  $("detail").onclick = (e) => {
    const r = e.target.closest("[data-report]");
    if (r) report(r.dataset.report);
    const o = e.target.closest("[data-open]");
    if (o) $(o.dataset.open).showModal();
  };
  // Zusätzliche Knöpfe in der Filterzeile
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
if (loadStore("kitsuen.geo", false)) startGeo(true);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
