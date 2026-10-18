/* Smokr Kernlogik: reine Funktionen ohne DOM, im Browser als window.SmokrCore,
   in Node über require() für die Tests. Texte kommen aus i18n.js (setLang). */
(function (root, factory) {
  const i18n = typeof module === "object" && module.exports ? require("./i18n.js") : root.SmokrI18n;
  const api = factory(i18n);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmokrCore = api;
})(typeof self !== "undefined" ? self : this, function (I18N) {
  "use strict";

  const DATA_SCHEMA = 4;
  let t = I18N.make("en");
  function setLang(lang) { t = I18N.make(I18N.LANGS.includes(lang) ? lang : "en"); return t; }
  function tr() { return t; }

  // Reihenfolge = Reiseroute. Namen und Hinweise kommen aus i18n.js.
  const REGIONS = [
    { id: "tokyo", ja: "東京", center: [139.767, 35.681], zoom: 12.3 },
    { id: "kamakura", ja: "鎌倉", center: [139.5505, 35.3192], zoom: 13.6, note: true },
    { id: "kyoto", ja: "京都", center: [135.7681, 35.0045], zoom: 12.8, note: true },
    { id: "okinawa", ja: "沖縄", center: [127.6809, 26.2124], zoom: 12.4, note: true },
    { id: "osaka", ja: "大阪", center: [135.5023, 34.6937], zoom: 12.4, note: true },
  ];
  // Fujisawa und Ōfuna gehören zu "Kamakura", das Okinawa-Gebiet ist groß
  const REGION_RADIUS_M = { tokyo: 60000, kamakura: 20000, kyoto: 30000, okinawa: 120000, osaka: 30000 };
  function regionName(r) { return r ? t(`region.${r.id}`) : t("region.none"); }
  function regionNote(r) { return r && r.note ? t(`note.${r.id}`) : ""; }

  // Bezirksnamen auf Japanisch, für die japanische Oberfläche
  const WARD_JA = {
    Shinjuku: "新宿区", Shibuya: "渋谷区", Chiyoda: "千代田区", Minato: "港区", Chuo: "中央区", Taito: "台東区",
    Toshima: "豊島区", Bunkyo: "文京区", Meguro: "目黒区", Koto: "江東区", Shinagawa: "品川区", Sumida: "墨田区", Kamakura: "鎌倉市", Fujisawa: "藤沢市",
    "Naha Airport": "那覇空港", Motobu: "本部町（海洋博公園）",
  };

  const GENERIC_NAMES = /^(喫煙所|喫煙場所|喫煙コーナー|喫煙スペース|喫煙エリア|指定喫煙所|公衆喫煙所|smoking area)$/i;

  // ---------- Geometrie ----------
  function distM(a, b) {
    const r = 6371000, rad = Math.PI / 180;
    const dp = (b[1] - a[1]) * rad, dl = (b[0] - a[0]) * rad;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dl / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(h));
  }

  /** Luftlinie, bewusst ohne Gehzeit: Wir kennen den Fußweg nicht. */
  function fmtDist(m) {
    if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
    const km = (m / 1000).toFixed(m < 10000 ? 1 : 0);
    return `${t.lang === "de" ? km.replace(".", ",") : km} km`;
  }

  function regionFor(point) {
    let best = null, bd = Infinity;
    for (const r of REGIONS) {
      const d = distM(point, r.center);
      if (d < bd) { bd = d; best = r; }
    }
    return best && bd <= REGION_RADIUS_M[best.id] ? best : null;
  }
  // Japan grob als Rechteck: Einreichungen außerhalb werden abgelehnt
  function inJapan(lat, lon) {
    return lat >= 24 && lat <= 46 && lon >= 122.9 && lon <= 146;
  }

  // ---------- Einordnung eines Platzes ----------
  /** "public" | "customers" | "business": was die Daten über den Zugang belegen. */
  function category(s) {
    if (s.acc === "customers") return "customers";
    if (s.k === "v") return "business";
    return "public";
  }
  function accessLabel(s) {
    if (s.unv) return t("access.unverified");
    return t(`access.${category(s)}`);
  }
  function accessExplain(s) {
    const c = category(s);
    if (c === "business") return t("access.explain.business");
    return t(`access.explain.${c}.${s.off ? "official" : "osm"}`);
  }

  // Lokalisierte Namen kommen aus dem Build (scripts/localize.py): le = Englisch, ld = Deutsch
  function title(s) {
    if (t.lang === "ja") {
      if (s.nj && !GENERIC_NAMES.test(s.nj.trim())) return s.nj;
      return s.ne || s.le || fallbackTitle(s);
    }
    const local = t.lang === "de" ? s.ld || s.le : s.le;
    if (local) return local;
    if (s.ne) return s.ne;
    return fallbackTitle(s);
  }
  /** Ohne verlässliche Übersetzung: beschreiben statt raten. */
  function fallbackTitle(s) {
    let what;
    if (s.k === "v" || category(s) !== "public") {
      if (s.pk && s.pk !== "unknown") what = t(`pk.${s.pk}`);
      else what = s.vt ? t(`vt.${s.vt}`) : t("place.fallback.venue");
    } else {
      what = t(`ak.${["room", "booth", "outdoor"].includes(s.ak) ? s.ak : "area"}`);
    }
    // Beschreiben statt übersetzen: Art des Ortes und der nächste Bahnhof aus unseren eigenen Daten
    if (s.st && s.st.m <= 800) {
      const station = t.lang === "ja" ? s.st.ja : s.st.en || s.st.ja;
      return t("title.near", { what, station });
    }
    return what;
  }
  function jaLine(s) {
    return s.nj && s.nj !== title(s) ? s.nj : "";
  }
  /** Wurde der Titel aus dem Japanischen übertragen (nicht aus einer englischen Quelle)? */
  function translatedName(s) {
    return t.lang !== "ja" && !!s.nj && ["composed", "romaji", "brand"].includes(s.lq);
  }
  function placeType(s) {
    if (s.pk && s.pk !== "unknown") return t(`pk.${s.pk}`);
    if (s.k === "v") return s.vt ? t(`vt.${s.vt}`) : "";
    return "";
  }
  /** Art des Rauchbereichs, für öffentliche Plätze mit "öffentlich" im Namen. */
  function areaLabel(s) {
    const ak = s.ak || (s.k === "v" ? "unknown" : "area");
    if (category(s) === "public" && !s.unv && ["room", "booth", "outdoor", "area"].includes(ak)) return t(`akpub.${ak}`);
    return t(`ak.${ak}`);
  }
  /** Kurzer Zugang: kostenlos, öffentlich, Kunden, Ticket, unklar. Nur Belegtes. */
  function accessShort(s) {
    if (s.unv) return t("acc2.unverified");
    if (s.tk) return t("acc2.ticket");
    const c = category(s);
    if (c === "customers") return t("acc2.customers");
    if (c === "business") return t("acc2.unknown");
    return s.free || (s.off && s.acc === "public") ? t("acc2.free") : t("acc2.public");
  }
  /** Zeile unter dem Namen: was für ein Ort, Zugang, Stockwerk. */
  function summary(s) {
    const parts = [];
    if (category(s) === "public" && !s.unv) {
      parts.push(areaLabel(s));
      if (s.pk && !["unknown", "street"].includes(s.pk)) parts.push(t(`pk.${s.pk}`));
    } else {
      const type = placeType(s);
      if (type) parts.push(type);
      parts.push(areaLabel(s));
    }
    const acc = accessShort(s);
    // "Öffentlicher Raucherplatz · Öffentlich" wäre doppelt
    if (!(category(s) === "public" && !s.unv && acc === t("acc2.public"))) parts.push(acc);
    if (s.fl) parts.push(s.fl);
    if (s.dir) parts.push(dirText(s));
    return parts;
  }
  /** Lage im Gebäude, z. B. "Südwestseite" (aus "（南西）" im Originalnamen) */
  function dirText(s) {
    return s && s.dir && /^(n|s|e|w|ne|nw|se|sw|c)$/.test(s.dir) ? t(`dir.${s.dir}`) : "";
  }
  function floorText(fl) {
    if (!fl) return "";
    if (fl === "1F") return t("floor.ground", { fl });
    if (/^B/.test(fl)) return t("floor.basement", { fl });
    return t("floor.upper", { fl });
  }
  function tobaccoText(s) {
    if (s.heated) return t("tob.heated");
    if (s.tob === "both") return t("tob.both");
    return t("tob.none");
  }
  function exitText(s) {
    if (!s.ex) return "";
    return t.lang === "de" ? s.ex[1] : t.lang === "ja" ? "" : s.ex[0];
  }

  /** Probleme und Unsicherheiten, die vor Ort wichtig sind. */
  function warnings(s, prefs) {
    const out = [];
    if (s.unv) out.push({ id: "unverified", text: t("warn.unverified") });
    if (s.heated && (!prefs || prefs.tobacco !== "heated")) out.push({ id: "heated", text: t("warn.heated") });
    if (s.unk) out.push({ id: "status", text: t("warn.status") });
    if (s.pos === "area") out.push({ id: "pos", text: t("warn.posArea") });
    if (s.pos === "address") out.push({ id: "pos", text: t("warn.posAddress") });
    const issues = (s.com && s.com.issues) || {};
    if (issues.missing) out.push({ id: "comMissing", text: t("warn.communityMissing", { date: fmtMonth(issues.missing.last) }) });
    if (issues.closed) out.push({ id: "comClosed", text: t("warn.communityClosed", { date: fmtMonth(issues.closed.last) }) });
    return out;
  }

  /** Herkunft und Verlässlichkeit, getrennt nach Eigenschaften. Datumsangaben bleiben, was sie sind. */
  function trust(s, report) {
    const out = {
      official: s.off ? { ward: s.off.ward || "", date: s.off.date || null, url: s.off.url || null } : null,
      osm: s.osm ? { url: s.osm.url, checked: s.osm.chk || null } : null,
      community: s.com ? { confirmed: s.com.n || 0, last: s.com.last || null, added: s.com.added || null } : null,
      position: s.pos || "exact",
      mine: report && report.s ? { status: report.s, at: report.t } : null,
    };
    if (out.official) out.short = t("src.official");
    else if (out.community && out.community.added) out.short = t("src.community");
    else if (out.osm && out.osm.checked) out.short = t("src.osmChecked");
    else out.short = t("src.osm");
    // "weniger verlässlich": nur OSM ohne Prüfdatum, Position ungefähr, oder unbestätigt
    const byCommunity = !!(out.community && (out.community.confirmed > 0 || out.community.added));
    out.weak = !!s.unv || out.position === "area" || (!out.official && !(out.osm && out.osm.checked) && !byCommunity);
    return out;
  }

  function sourceName(s) {
    if (!s.off) return "";
    const w = s.off.ward || "";
    if (!w) return t("src.official");
    if (t.lang === "ja" && WARD_JA[w]) return WARD_JA[w];
    if (s.region === "tokyo") return t("src.ward.tokyo", { ward: w });
    return w;
  }

  // ---------- Einstellungen ----------
  const DEFAULT_PREFS = { tobacco: "both", showPublic: true, showBusiness: false, showUnverified: false, showHidden: false, route: null };

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
    if (s.unv) {
      if (!prefs.showUnverified) return false;
    } else {
      if (c === "public" && !prefs.showPublic) return false;
      if (c !== "public" && !prefs.showBusiness) return false;
    }
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
      const kinds = s.pk ? I18N.LANGS.map((l) => I18N.DICTS[l][`pk.${s.pk}`]) : [];
      s._q = norm([s.ne, s.nj, s.le, s.ld, s.lr, s.st && s.st.en, s.st && s.st.ja, s.off && s.off.ward, s.off && WARD_JA[s.off.ward], s.hint, s.addr, ...kinds].filter(Boolean).join("|"));
    }
    return s._q;
  }
  /* Reihenfolge der Suche, offen und einfach:
     1. Bahnhof heißt genau so: sortiert nach Nähe zu diesem Bahnhof
     2. Bahnhof beginnt so, oder der Name enthält den Suchbegriff: nach Luftlinie
     3. Treffer nur in Bezirk, Beschreibung oder Adresse: nach Luftlinie */
  function searchScore(s, q) {
    const st = s.st ? [norm(s.st.en), norm(s.st.ja)] : [];
    if (st.includes(q)) return 0;
    if (st.some((x) => x && x.startsWith(q))) return 1;
    if ([s.ne, s.nj, s.le, s.ld, s.lr].some((x) => norm(x).includes(q))) return 1;
    return 2;
  }
  function search(spots, query, anchor, prefs, reports, limit) {
    const q = norm(query);
    if (!q) return [];
    const hits = [];
    for (const s of spots) {
      if (!visible(s, prefs, reports)) continue;
      if (!searchText(s).includes(q)) continue;
      const score = searchScore(s, q);
      const d = distM(anchor, [s.lon, s.lat]);
      hits.push({ d, s, score, key: score === 0 ? s.st.m : d });
    }
    hits.sort((a, b) => a.score - b.score || a.key - b.key);
    return hits.slice(0, limit || 40);
  }
  function searchRegions(query) {
    const q = norm(query);
    if (!q) return REGIONS.slice();
    return REGIONS.filter((r) => I18N.LANGS.some((l) => norm(I18N.DICTS[l][`region.${r.id}`]).includes(q)) || norm(r.id).includes(q) || norm(r.ja).includes(q));
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
  const JA_WORDS = {
    de: [
      [/土日祝日?(休所|休み|休業)/g, "Sa, So und Feiertage geschlossen"], [/翌/g, ""],
      [/24時間/g, "rund um die Uhr"], [/平日/g, "Mo–Fr"], [/土曜日?/g, "Sa"], [/日曜日?/g, "So"],
      [/祝日|祝祭日/g, "Feiertage"], [/年末年始/g, "Jahreswechsel"], [/お盆/g, "Obon"],
      [/を除く/g, " ausgenommen"], [/のみ/g, " nur"], [/から/g, " bis "], [/まで/g, ""], [/毎日/g, "täglich"],
    ],
    en: [
      [/土日祝日?(休所|休み|休業)/g, "closed Sat, Sun and holidays"], [/翌/g, ""],
      [/24時間/g, "24 hours"], [/平日/g, "Mon–Fri"], [/土曜日?/g, "Sat"], [/日曜日?/g, "Sun"],
      [/祝日|祝祭日/g, "public holidays"], [/年末年始/g, "New Year holidays"], [/お盆/g, "Obon"],
      [/を除く/g, " excluded"], [/のみ/g, " only"], [/から/g, " to "], [/まで/g, ""], [/毎日/g, "daily"],
    ],
  };
  const JA_PUNCT = [[/[～〜~]/g, "–"], [/・/g, ", "], [/（/g, " ("], [/）/g, ")"], [/(\S)\(/g, "$1 ("]];
  const JA_CHAR = /[぀-ヿ一-鿿]/;
  /** Übersetzt nur bekannte Muster. {text, original}: original nur, wenn Reste unübersetzt bleiben.
      Auf Japanisch bleibt der Text der Quelle unverändert. */
  function hours(h) {
    if (!h) return null;
    const lang = t.lang;
    if (h === "24/7") return { text: lang === "de" ? "rund um die Uhr" : lang === "ja" ? "24時間" : "24 hours", original: null };
    if (!JA_CHAR.test(h)) {
      const daily = { de: "täglich", en: "daily", ja: "毎日" }[lang];
      return { text: h.replace(/Mo-Su/g, daily), original: null };
    }
    if (lang === "ja") return { text: h, original: null };
    let s = h.replace(/午前(\d{1,2})時(\d{1,2})?分?/g, (_, a, b) => `${a}:${(b || "00").padStart(2, "0")}`)
      .replace(/午後(\d{1,2})時(\d{1,2})?分?/g, (_, a, b) => `${(+a % 12) + 12}:${(b || "00").padStart(2, "0")}`)
      .replace(/(\d{1,2})時(\d{1,2})分/g, "$1:$2").replace(/(\d{1,2})時/g, "$1:00");
    for (const [re, rep] of JA_WORDS[lang] || JA_WORDS.en) s = s.replace(re, rep);
    for (const [re, rep] of JA_PUNCT) s = s.replace(re, rep);
    s = s.replace(/\s{2,}/g, " ").trim();
    const rest = (s.match(/[぀-ヿ一-鿿]/g) || []).length;
    return { text: s, original: rest > 3 ? h : null };
  }

  function fmtMonth(iso) {
    if (!iso) return "";
    if (/^\d{4}$/.test(iso)) return iso;
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString(t.locale, { month: "short", year: "numeric" });
  }
  // Ein Formatierer pro Sprache statt bei jedem Aufruf ein neuer (toLocaleDateString ist teuer)
  const dayFmt = new Map();
  function fmtDay(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    if (!dayFmt.has(t.locale)) dayFmt.set(t.locale, new Intl.DateTimeFormat(t.locale));
    return dayFmt.get(t.locale).format(d);
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
    if (!data || typeof data !== "object") throw new Error("empty");
    if (data.schema !== DATA_SCHEMA) throw new Error(`format ${data.schema || 1} ≠ ${DATA_SCHEMA}`);
    if (data.region !== regionId) throw new Error("wrong city");
    if (!Array.isArray(data.spots)) throw new Error("no list");
    for (const s of data.spots) {
      if (typeof s.id !== "string" || typeof s.lat !== "number" || typeof s.lon !== "number") throw new Error("broken entry");
    }
    return data;
  }

  /** Freigegebene Community-Daten mit den Basisdaten zusammenführen.
      Bestätigungen hängen sich an vorhandene Plätze, neue Plätze kommen dazu. */
  // Foto-IDs vergibt der Server (32 Hex-Zeichen); alles andere wird ignoriert
  function photoIds(list) {
    return Array.isArray(list) ? list.filter((x) => typeof x === "string" && /^[0-9a-f]{32}$/.test(x)) : [];
  }
  function mergeCommunity(spots, community) {
    if (!community || !Array.isArray(community.places)) return spots;
    const hidden = new Set(Array.isArray(community.hidden) ? community.hidden : []);
    const out = spots.filter((s) => !hidden.has(s.id));
    const byId = new Map(out.map((s) => [s.id, s]));
    for (const p of community.places) {
      if (typeof p.lat !== "number" || typeof p.lon !== "number" || !inJapan(p.lat, p.lon)) continue;
      const id = `com-${p.id}`;
      if (byId.has(id) || hidden.has(id)) continue;
      const k = p.category === "shop" ? "v" : "p";
      const spot = {
        // Zugang nur so, wie er gemeldet und geprüft wurde; "unklar" bleibt unklar
        id, k, acc: p.access === "customers" ? "customers" : p.access === "public" ? "public" : "unknown",
        lat: p.lat, lon: p.lon, nj: "", ne: String(p.name || ""), pos: "exact",
        com: { added: p.approved_at || null, n: 0, last: null, photos: photoIds(p.photos) },
        region: (regionFor([p.lon, p.lat]) || {}).id || null,
      };
      if (p.note) spot.hint = String(p.note);
      if (p.floor) spot.floor = String(p.floor);
      if (p.tobacco === "heated") spot.heated = true;
      if (k === "v") spot.vt = "shop";
      if (p.category === "room") { spot.ind = true; spot.sd = "room"; }
      out.push(spot);
      byId.set(id, spot);
    }
    // Bestätigungen und geprüfte Hinweise hängen sich an Basis- und Community-Plätze
    for (const c of community.confirmations || []) {
      const s = byId.get(c.spot_id);
      if (!s) continue;
      const prev = s.com || { photos: [] };
      s.com = Object.assign({}, prev, {
        n: c.n || 0, last: c.last || null,
        photos: (prev.photos || []).concat(photoIds(c.photos)),
        issues: c.issues || {},
      });
    }
    return out;
  }

  return {
    DATA_SCHEMA, REGIONS, DEFAULT_PREFS, I18N,
    setLang, tr, regionName, regionNote, inJapan,
    distM, fmtDist, regionFor,
    category, accessLabel, accessExplain, title, jaLine, placeType, warnings, trust, sourceName,
    translatedName, areaLabel, accessShort, summary, floorText, dirText, tobaccoText, exitText,
    migratePrefs, visible, rank, norm, search, searchRegions,
    initialLocation, locationReduce, anchorOf,
    hours, fmtMonth, fmtDay, routeUrls, defaultRouteApp, validateRegionData, mergeCommunity,
  };
});
