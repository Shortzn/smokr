/* Smokr Kernlogik: reine Funktionen ohne DOM, im Browser als window.SmokrCore,
   in Node über require() für die Tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmokrCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DATA_SCHEMA = 2;

  // Reihenfolge = Reiseroute
  const REGIONS = [
    { id: "tokyo", de: "Tokio", ja: "東京", center: [139.767, 35.681], zoom: 12.3 },
    { id: "kamakura", de: "Kamakura", ja: "鎌倉", center: [139.5505, 35.3192], zoom: 13.6,
      note: "Am Bahnhof Kamakura gibt es nur den Raucherraum im 3. Stock des Aiza-Gebäudes an der Komachi-dori, offen 9 bis 17 Uhr. Rund um Enoshima gibt es keinen offiziellen Platz." },
    { id: "kyoto", de: "Kyoto", ja: "京都", center: [135.7681, 35.0045], zoom: 12.8,
      note: "In der Innenstadt, am Bahnhof und in Kiyomizu und Gion kostet Rauchen auf der Straße 1.000 Yen. In Arashiyama und Fushimi Inari gibt es keinen städtischen Raucherplatz." },
    { id: "okinawa", de: "Okinawa", ja: "沖縄", center: [127.6809, 26.2124], zoom: 12.4,
      note: "In Naha ist Rauchen auf der Kokusai-dori und der Okiei-dori verboten. Dort gibt es keinen offiziellen Platz. In den Seitenstraßen ist Rauchen draußen nicht verboten. Am Flughafen gibt es viele Raucherräume." },
    { id: "osaka", de: "Osaka", ja: "大阪", center: [135.5023, 34.6937], zoom: 12.4,
      note: "Seit Januar 2025 ist Rauchen auf der Straße in ganz Osaka verboten, auch mit IQOS. Strafe 1.000 Yen, sofort zu zahlen. Erlaubt nur an ausgewiesenen Plätzen oder bei Aschenbechern auf Privatgrund." },
  ];
  // Fujisawa und Ōfuna gehören zu "Kamakura", das Okinawa-Gebiet ist groß
  const REGION_RADIUS_M = { tokyo: 60000, kamakura: 20000, kyoto: 30000, okinawa: 120000, osaka: 30000 };

  const GENERIC_NAMES = /^(喫煙所|喫煙場所|喫煙コーナー|喫煙スペース|喫煙エリア|指定喫煙所|公衆喫煙所|smoking area)$/i;

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

  /** Luftlinie, bewusst ohne Gehzeit: Wir kennen den Fußweg nicht. */
  function fmtDist(m) {
    if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
    return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",")} km`;
  }

  function regionFor(point) {
    let best = null, bd = Infinity;
    for (const r of REGIONS) {
      const d = distM(point, r.center);
      if (d < bd) { bd = d; best = r; }
    }
    return best && bd <= REGION_RADIUS_M[best.id] ? best : null;
  }

  // ---------- Einordnung eines Platzes ----------
  /** "public" | "customers" | "business": was die Daten über den Zugang belegen. */
  function category(s) {
    if (s.acc === "customers") return "customers";
    if (s.k === "v") return "business";
    return "public";
  }
  const ACCESS_LABEL = {
    public: "Öffentlich",
    customers: "Nur für Kunden",
    business: "Zugang unklar",
  };
  function accessLabel(s) { return ACCESS_LABEL[category(s)]; }
  function accessExplain(s) {
    const c = category(s);
    if (c === "public") {
      return s.off ? "Öffentlicher Raucherplatz, von der Stadt gelistet. Keine Kaufpflicht."
        : "Laut OpenStreetMap ein öffentlicher Raucherplatz.";
    }
    if (c === "customers") {
      return s.off ? "Laut Stadt nur für Kunden. Du musst dort etwas kaufen."
        : "Laut OpenStreetMap nur für Kunden.";
    }
    return "Raucherbereich bei einem Geschäft oder Lokal. Ob du als Nicht-Kunde rauchen darfst, ist nicht angegeben.";
  }

  function title(s) {
    if (s.ne) return s.ne;
    if (s.nj && !GENERIC_NAMES.test(s.nj.trim())) return s.nj;
    if (s.k === "v") return s.vt || "Lokal";
    return "Raucherplatz";
  }
  function jaLine(s) {
    return s.nj && s.nj !== title(s) ? s.nj : "";
  }
  function placeType(s) {
    if (s.k === "v") return [s.vt, s.sd].filter(Boolean).join(", ");
    const bits = [];
    if (s.ind) bits.push("drinnen");
    else if (s.cov) bits.push("überdacht");
    if (s.sd) bits.push(s.sd);
    return bits.join(", ");
  }

  /** Probleme und Unsicherheiten, die vor Ort wichtig sind. */
  function warnings(s, prefs) {
    const out = [];
    if (s.heated && (!prefs || prefs.tobacco !== "heated")) out.push({ id: "heated", text: "Nur für Tabakerhitzer wie IQOS, glo oder Ploom. Zigaretten sind hier nicht erlaubt." });
    if (s.unk) out.push({ id: "status", text: "Die Stadt gibt den Status als unklar an. Der Platz ist vielleicht geschlossen." });
    if (s.pos === "area") out.push({ id: "pos", text: "Die Position ist nur ungefähr bekannt. Halte dich an die Beschreibung." });
    if (s.pos === "address") out.push({ id: "pos", text: "Die Position ist aus der Adresse berechnet und kann einige Dutzend Meter danebenliegen." });
    return out;
  }

  /** Herkunft und Verlässlichkeit, getrennt nach Eigenschaften. Datumsangaben bleiben, was sie sind. */
  function trust(s, report) {
    const t = {
      official: s.off ? { ward: s.off.ward || "", date: s.off.date || null, url: s.off.url || null } : null,
      osm: s.osm ? { url: s.osm.url, checked: s.osm.chk || null } : null,
      position: s.pos || "exact",
      mine: report && report.s ? { status: report.s, at: report.t } : null,
    };
    // Kurzfassung für die Liste: eine Zeile, ohne Wertung in Prozent oder Sternen
    if (t.official) t.short = "Offizielle Liste";
    else if (t.osm && t.osm.checked) t.short = "OpenStreetMap, geprüft";
    else t.short = "OpenStreetMap";
    // "weniger verlässlich": nur OSM ohne Prüfdatum, oder Position nur ungefähr
    t.weak = (!t.official && !(t.osm && t.osm.checked)) || t.position === "area";
    return t;
  }

  function sourceName(s) {
    if (!s.off) return "";
    const w = s.off.ward || "";
    if (!w) return "Offizielle Liste";
    if (s.region === "tokyo") return `Bezirk ${w}`;
    return w;
  }

  // ---------- Einstellungen ----------
  const DEFAULT_PREFS = { tobacco: "both", showPublic: true, showBusiness: false, showHidden: false, route: null };

  /** Übernimmt die alten Filter (kitsuen.filters) in das neue Format. */
  function migratePrefs(saved, oldFilters) {
    const p = Object.assign({}, DEFAULT_PREFS);
    if (saved && typeof saved === "object") {
      for (const k of Object.keys(DEFAULT_PREFS)) if (k in saved) p[k] = saved[k];
      if (!["cig", "heated", "both"].includes(p.tobacco)) p.tobacco = "both";
      return p;
    }
    if (oldFilters && typeof oldFilters === "object") {
      if (typeof oldFilters.public === "boolean") p.showPublic = oldFilters.public;
      if (typeof oldFilters.venue === "boolean") p.showBusiness = oldFilters.venue;
      if (oldFilters.noHeated === true) p.tobacco = "cig";
    }
    return p;
  }

  function visible(s, prefs, reports) {
    const c = category(s);
    if (c === "public" && !prefs.showPublic) return false;
    if (c !== "public" && !prefs.showBusiness) return false;
    if (prefs.tobacco === "cig" && s.heated) return false;
    if (!prefs.showHidden && reports && reports[s.id] && reports[s.id].s === "gone") return false;
    return true;
  }

  /** Reihenfolge: nur Luftlinie ab dem Bezugspunkt. Keine versteckte Gewichtung. */
  function rank(spots, anchor, prefs, reports, limit) {
    const out = [];
    for (const s of spots) {
      if (!visible(s, prefs, reports)) continue;
      out.push({ d: distM(anchor, [s.lon, s.lat]), s });
    }
    out.sort((a, b) => a.d - b.d || (a.s.id < b.s.id ? -1 : 1));
    return limit ? out.slice(0, limit) : out;
  }

  // ---------- Suche ----------
  function norm(str) {
    return String(str || "")
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[\s\-ー・]+/g, "");
  }
  function searchText(s) {
    if (!s._q) {
      s._q = norm([s.ne, s.nj, s.st && s.st.en, s.st && s.st.ja, s.off && s.off.ward, s.hint, s.addr, s.vt].filter(Boolean).join("|"));
    }
    return s._q;
  }
  function search(spots, query, anchor, prefs, reports, limit) {
    const q = norm(query);
    if (!q) return [];
    const hits = [];
    for (const s of spots) {
      if (!visible(s, prefs, reports)) continue;
      if (searchText(s).includes(q)) hits.push({ d: distM(anchor, [s.lon, s.lat]), s });
    }
    hits.sort((a, b) => a.d - b.d);
    return hits.slice(0, limit || 40);
  }
  function searchRegions(query) {
    const q = norm(query);
    if (!q) return REGIONS.slice();
    return REGIONS.filter((r) => norm(r.de).includes(q) || norm(r.id).includes(q) || norm(r.ja).includes(q));
  }

  // ---------- Standort-Zustand ----------
  /* mode "nearby": Liste ab GPS-Standort. mode "area": Liste ab Kartenmitte.
     GPS-Updates bewegen die Karte nie, außer beim ersten Fix nach "Standort" (pendingCenter). */
  function initialLocation() {
    return { mode: "area", pos: null, accuracy: null, perm: "unknown", pendingCenter: false, error: null };
  }
  function locationReduce(st, ev) {
    const s = Object.assign({}, st);
    const effects = [];
    switch (ev.type) {
      case "locate":
        s.mode = "nearby";
        s.error = null;
        if (s.pos) effects.push({ type: "center", to: s.pos });
        else { s.pendingCenter = true; effects.push({ type: "watch" }); }
        break;
      case "fix":
        s.pos = ev.pos;
        s.accuracy = ev.accuracy == null ? null : ev.accuracy;
        s.perm = "granted";
        s.error = null;
        if (s.pendingCenter) { s.pendingCenter = false; effects.push({ type: "center", to: s.pos }); }
        break;
      case "denied":
        s.perm = "denied";
        s.mode = "area";
        s.pendingCenter = false;
        s.error = "denied";
        break;
      case "unavailable":
        s.mode = s.pos ? s.mode : "area";
        s.pendingCenter = false;
        s.error = "unavailable";
        break;
      case "userPan":
      case "region":
      case "pick":
        s.mode = "area";
        s.pendingCenter = false;
        break;
      default:
        break;
    }
    return { state: s, effects };
  }
  function anchorOf(loc, mapCenter) {
    return loc.mode === "nearby" && loc.pos ? loc.pos : mapCenter;
  }

  // ---------- Öffnungszeiten ----------
  const JA_WORDS = [
    [/24時間/g, "rund um die Uhr"], [/平日/g, "Mo–Fr"], [/土曜日?/g, "Sa"], [/日曜日?/g, "So"],
    [/祝日|祝祭日/g, "Feiertage"], [/年末年始/g, "Jahreswechsel"], [/お盆/g, "Obon"],
    [/を除く/g, " ausgenommen"], [/のみ/g, " nur"], [/から/g, " bis "], [/まで/g, ""], [/毎日/g, "täglich"], [/[～〜~]/g, "–"],
    [/・/g, ", "], [/（/g, " ("], [/）/g, ")"],
  ];
  const JA_CHAR = /[぀-ヿ一-鿿]/;
  /** Übersetzt nur bekannte Muster. Gibt {text, original} zurück; original nur, wenn Reste unübersetzt bleiben. */
  function hours(h) {
    if (!h) return null;
    if (h === "24/7") return { text: "rund um die Uhr", original: null };
    if (!JA_CHAR.test(h)) return { text: h.replace(/Mo-Su/g, "täglich"), original: null };
    let t = h.replace(/午前(\d{1,2})時(\d{1,2})?分?/g, (_, a, b) => `${a}:${(b || "00").padStart(2, "0")}`)
      .replace(/午後(\d{1,2})時(\d{1,2})?分?/g, (_, a, b) => `${(+a % 12) + 12}:${(b || "00").padStart(2, "0")}`)
      .replace(/(\d{1,2})時(\d{1,2})分/g, "$1:$2").replace(/(\d{1,2})時/g, "$1:00");
    for (const [re, de] of JA_WORDS) t = t.replace(re, de);
    t = t.replace(/\s{2,}/g, " ").trim();
    const rest = (t.match(/[぀-ヿ一-鿿]/g) || []).length;
    return { text: t, original: rest > 3 ? h : null };
  }

  function fmtMonth(iso) {
    if (!iso) return "";
    if (/^\d{4}$/.test(iso)) return iso;
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString("de-AT", { month: "short", year: "numeric" });
  }

  // ---------- Route ----------
  function routeUrls(s) {
    return {
      apple: `https://maps.apple.com/?daddr=${s.lat},${s.lon}&dirflg=w`,
      google: `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking`,
    };
  }
  function defaultRouteApp(userAgent) {
    return /iPhone|iPad|Macintosh/.test(userAgent || "") ? "apple" : "google";
  }

  // ---------- Daten ----------
  /** Prüft eine Stadtdatei. Wirft mit verständlicher Meldung, statt halbe Daten zu liefern. */
  function validateRegionData(data, regionId) {
    if (!data || typeof data !== "object") throw new Error("leer");
    if (data.schema !== DATA_SCHEMA) throw new Error(`Datenformat ${data.schema || 1} statt ${DATA_SCHEMA}`);
    if (data.region !== regionId) throw new Error("falsche Stadt");
    if (!Array.isArray(data.spots)) throw new Error("keine Liste");
    for (const s of data.spots) {
      if (typeof s.id !== "string" || typeof s.lat !== "number" || typeof s.lon !== "number") throw new Error("fehlerhafter Eintrag");
    }
    return data;
  }

  return {
    DATA_SCHEMA, REGIONS, DEFAULT_PREFS,
    distM, bearing, compass, fmtDist, regionFor,
    category, accessLabel, accessExplain, title, jaLine, placeType, warnings, trust, sourceName,
    migratePrefs, visible, rank, norm, search, searchRegions,
    initialLocation, locationReduce, anchorOf,
    hours, fmtMonth, routeUrls, defaultRouteApp, validateRegionData,
  };
});
