/* Ort finden beim Hinzufügen eines Raucherplatzes: Name, Adresse, Google-Maps-Link oder Koordinaten.
   Läuft im Browser und in Node (Tests).

   Dienste (nur wenn jemand ausdrücklich sucht, kein Autocomplete):
   - Namen (Restaurant, Geschäft, Bahnhof): Nominatim von OpenStreetMap. Höchstens 1 Anfrage pro Sekunde,
     Ergebnisse werden im Speicher behalten. https://operations.osmfoundation.org/policies/nominatim/
   - Japanische Adressen: Geolonia-Adressdaten (Adress-Basisregister der Digital Agency, CC BY 4.0).
     Bis zur Hausnummer, ohne Schlüssel. https://github.com/geolonia/japanese-addresses-v2
   - Google-Maps-Links: Koordinaten stehen im Link selbst. Kurzlinks (maps.app.goo.gl) löst der eigene
     Worker auf, er liest nur die Weiterleitung, keine Inhalte von Google. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmokrLocate = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const NOMINATIM = "https://nominatim.openstreetmap.org/search";
  const ADDR_API = "https://japanese-addresses-v2.geoloniamaps.com/api/ja";

  const inJapan = (lat, lon) => lat >= 24 && lat <= 46 && lon >= 122.9 && lon <= 146;
  const num = (x) => (x == null || x === "" ? NaN : Number(x));

  // ---------- Links und Koordinaten ----------
  const SHORT_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.apple)$/i;
  const GOOGLE = /(^|\.)google\.[a-z.]+$/i;
  const MAP_HOSTS = /(^|\.)google\.[a-z.]+$|^maps\.apple\.com$|^(www\.)?openstreetmap\.org$/i;
  // Parameter, die den Ort beschreiben. Alles andere (ved, sa, entry, ei, hl, ucbcb ...) ist Klick- oder
  // Sitzungsverfolgung und wird nicht gespeichert.
  const KEEP_PARAMS = ["q", "query", "query_place_id", "cid", "ftid", "ll", "daddr", "destination", "coordinate", "address", "name", "place-id", "auid", "mlat", "mlon", "api"];

  /** Liest Position und Namen aus einem Karten-Link oder aus "35.68, 139.76".
      {lat, lon, name, precise}
      {short: url}                                   Kurzlink, muss der Worker auflösen
      {error: "nocoords", name, address, idOnly}     kein Ort im Link; idOnly: nur eine interne Kennung
      {error: "link"|"outside"}                      unbrauchbar
      null                                           gar kein Link */
  function parseLink(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    // iOS kopiert beim Teilen oft "Ortsname" + Zeilenumbruch + Link. Das Suchfeld entfernt den Zeilenumbruch,
    // dann steht "ÅTER Tokyohttps://maps.app.goo.gl/…" im Feld. Den Link herauslösen, den Text davor merken.
    const embedded = raw.match(/https?:\/\/[^\s<>"]+/i);
    const s = embedded ? embedded[0] : raw;
    const textName = embedded && embedded.index > 0 ? raw.slice(0, embedded.index).trim().slice(0, 120) : "";
    const res = parseUrl(s);
    if (res && textName) res.textName = textName;
    return res;
  }
  function parseUrl(s) {
    // Reine Koordinaten, auch aus der Zwischenablage von Google Maps ("35.6812, 139.7671")
    const plain = s.match(/^(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{2,3}\.\d{3,})$/);
    if (plain) return point(+plain[1], +plain[2], "", true);
    let url;
    try { url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch (e) { return null; }
    if (!/^[\w.-]+\.[a-z]{2,}$/i.test(url.hostname) || !/[./]/.test(s)) return null;
    const host = url.hostname.toLowerCase();
    if (SHORT_HOSTS.test(host)) return { short: url.toString() };
    if (!MAP_HOSTS.test(host)) return /^https?:\/\//i.test(s) ? { error: "link" } : null;
    const param = (k) => (url.searchParams.get(k) || "").trim();
    const full = safeDecode(url.pathname + url.search + url.hash);
    let name = "", address = "";
    const place = url.pathname.match(/\/maps\/place\/([^/@]*)/);
    if (place) name = cleanName(place[1]);
    // Routenlink: /maps/dir/<Start>/<Ziel>/@...; das Ziel ist der Ort
    const dir = url.pathname.match(/\/maps\/dir\/(.*)$/);
    if (dir) {
      const parts = dir[1].split("/").filter((p) => p && !p.startsWith("@") && !p.startsWith("data="));
      if (parts.length) name = cleanName(parts[parts.length - 1]);
    }
    // Google-Suche statt Google Maps: die Suchanfrage ist der beste Hinweis
    if (GOOGLE.test(host) && url.pathname.startsWith("/search")) {
      return param("q") ? { error: "nocoords", name: param("q"), address: "", idOnly: false } : { error: "link" };
    }
    // Apple Maps: Name und Adresse stehen in Parametern
    if (host === "maps.apple.com") { name = name || param("name") || param("q"); address = param("address"); }
    // 1. Genaue Ortsmarke eines Eintrags (!3d Breite !4d Länge)
    let m = full.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) return point(+m[1], +m[2], name, true);
    // 2. Routenziel in den Daten (!1d Länge !2d Breite, das letzte Paar ist das Ziel)
    if (dir) {
      const pairs = [...full.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)];
      if (pairs.length) { const p = pairs[pairs.length - 1]; return point(+p[2], +p[1], name, true); }
    }
    // 3. Ausdrückliche Position in Parametern
    for (const key of ["q", "query", "ll", "destination", "daddr", "center", "coordinate", "mlat"]) {
      const v = param(key);
      if (!v) continue;
      if (key === "mlat") {
        if (param("mlon")) return point(num(v), num(param("mlon")), name, true);
        continue;
      }
      m = v.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
      if (m) return point(+m[1], +m[2], name, true);
      if (key === "q" || key === "query" || key === "daddr" || key === "destination") name = name || v;
    }
    // 4. Nur der Kartenausschnitt (@Breite,Länge,Zoom): ungefähr, nicht der Eintrag selbst
    m = full.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return point(+m[1], +m[2], name, false);
    // OpenStreetMap: #map=Zoom/Breite/Länge
    m = (url.hash || "").match(/map=\d+(?:\.\d+)?\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
    if (m) return point(+m[1], +m[2], name, false);
    // Keine Position. Nur eine interne Kennung (Google 0x…:0x…, cid, Apple place-id)? Die lässt sich ohne
    // Google- oder Apple-Dienst nicht in einen Ort umrechnen; das sagen wir offen.
    const idOnly = /0x[0-9a-f]+:0x[0-9a-f]+/i.test(full) || !!param("cid") || !!param("place-id") || !!param("auid") || !!param("query_place_id");
    if (name || address || idOnly) return { error: "nocoords", name, address, idOnly };
    return { error: "link" };
  }
  function safeDecode(x) {
    try { return decodeURIComponent(x); } catch (e) { return x; }
  }
  function cleanName(seg) {
    return safeDecode(String(seg || "").replace(/\+/g, " ")).normalize("NFC").trim();
  }
  /** Link als Referenz für die Moderation: nur Karten-Adressen, ohne Klickverfolgung, höchstens 500 Zeichen. */
  function referenceUrl(text) {
    let url;
    try { url = new URL(String(text || "").trim()); } catch (e) { return ""; }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(SHORT_HOSTS.test(host) || MAP_HOSTS.test(host))) return "";
    const keep = new URLSearchParams();
    for (const k of KEEP_PARAMS) if (url.searchParams.has(k)) keep.set(k, url.searchParams.get(k));
    const q = keep.toString();
    const out = `https://${host}${url.pathname}${q ? `?${q}` : ""}${host.endsWith("openstreetmap.org") ? url.hash : ""}`;
    return out.length <= 500 ? out : "";
  }
  function point(lat, lon, name, precise) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: "link" };
    if (!inJapan(lat, lon)) return { error: "outside" };
    return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), name: name || "", precise: !!precise };
  }

  // ---------- Japanische Adressen ----------
  const PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
    "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県",
    "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県",
    "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];
  const KANJI = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function kanjiNum(s) {
    if (/^\d+$/.test(s)) return +s;
    if (s === "十") return 10;
    const m = s.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
    if (m) return (m[1] ? KANJI[m[1]] : 1) * 10 + (m[2] ? KANJI[m[2]] : 0);
    if ([...s].every((c) => c in KANJI)) return +[...s].map((c) => KANJI[c]).join("");
    return NaN;
  }
  /** Vereinheitlicht Schreibweisen: Vollbreite, Bindestriche, 〒, Leerzeichen, "番地", "号". */
  function normalizeAddress(text) {
    return String(text || "").normalize("NFKC")
      .replace(/^〒?\s*\d{3}-?\d{4}\s*/, "")
      .replace(/^日本[、,\s]*/, "")
      // Striche nur zwischen Zahlen vereinheitlichen; "ー" in Namen wie センター bleibt
      .replace(/(\d)\s*[‐‑‒–—―−ーｰ－]\s*(?=\d)/g, "$1-")
      .replace(/\s+/g, "")
      .replace(/(\d)番地?の?(\d)/g, "$1-$2").replace(/(\d)番地?$/, "$1").replace(/(\d)号/g, "$1")
      .replace(/([一二三四五六七八九十〇\d]+)丁目-?/g, (all, n) => `${kanjiNum(n)}丁目`);
  }
  /** Sieht der Text wie eine japanische Adresse aus (Präfektur, Stadt oder Bezirk mit Hausnummer)? */
  function looksLikeAddress(text) {
    const s = normalizeAddress(text);
    if (PREFS.some((p) => s.startsWith(p))) return true;
    return /[市区町村]/.test(s) && /\d/.test(s) && /[぀-ヿ一-鿿]/.test(s);
  }
  /** Zerlegt den Rest nach dem Ortsteil: "1丁目22-7", "1-22-7", "22-7" */
  function splitNumbers(rest) {
    const m = rest.match(/^(\d+)丁目(\d+)?(?:-(\d+))?/) || rest.match(/^(\d+)(?:-(\d+))?(?:-(\d+))?/);
    if (!m) return { chome: null, blk: null, no: null };
    if (/丁目/.test(m[0])) return { chome: +m[1], blk: m[2] ? +m[2] : null, no: m[3] ? +m[3] : null };
    return { chome: +m[1], blk: m[2] ? +m[2] : null, no: m[3] ? +m[3] : null, ambiguous: true };
  }

  const cache = new Map();
  async function getJson(fetchFn, url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetchFn(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  const enc = (s) => encodeURIComponent(s);

  /** Japanische Adresse in eine Position. {lat, lon, label, level: "house"|"block"|"district"|"city"} oder null */
  async function geocodeAddress(text, fetchFn, near) {
    const f = fetchFn || fetch;
    let s = normalizeAddress(text);
    const ja = await getJson(f, `${ADDR_API}.json`);
    let pref = ja.data.find((p) => s.startsWith(p.pref));
    if (pref) s = s.slice(pref.pref.length);
    // Stadt und, bei Großstädten, Stadtbezirk ("大阪市中央区"); längster Treffer gewinnt
    const cityName = (c) => (c.city || "") + (c.ward || "");
    const candidates = [];
    for (const p of pref ? [pref] : ja.data) {
      for (const c of p.cities) {
        for (const n of [cityName(c), c.ward || null].filter(Boolean)) if (s.startsWith(n)) candidates.push([p, c, n]);
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b[2].length - a[2].length);
    // Ohne Präfektur: "中央区" gibt es in Tokio, Osaka und anderswo. Dann entscheidet die Nähe zur Karte.
    const best = candidates.filter((c) => c[2] === candidates[0][2]);
    if (!pref && best.length > 1) {
      if (!near) return null;
      const d = (c) => (c.point ? (c.point[0] - near[0]) ** 2 + (c.point[1] - near[1]) ** 2 : Infinity);
      best.sort((a, b) => d(a[1]) - d(b[1]));
    }
    let city;
    [pref, city] = best[0];
    s = s.slice(best[0][2].length);
    const label0 = pref.pref + cityName(city);
    const towns = (await getJson(f, `${ADDR_API}/${enc(pref.pref)}/${enc(cityName(city))}.json`)).data;
    // Ortsteil: längster passender Name, bei mehreren Chōme der richtige
    const names = [...new Set(towns.map((t) => t.oaza_cho))].filter((n) => n && s.startsWith(n)).sort((a, b) => b.length - a.length);
    if (!names.length) return pointOf(city.point, label0, "city");
    const oaza = names[0];
    const rest = s.slice(oaza.length);
    const nums = splitNumbers(rest);
    let town = towns.find((t) => t.oaza_cho === oaza && nums.chome != null && t.chome_n === nums.chome);
    let blk = nums.blk, no = nums.no;
    if (!town) {
      // Ortsteil ohne Chōme: die Zahlen sind Block und Hausnummer
      town = towns.find((t) => t.oaza_cho === oaza && !t.chome_n) || towns.find((t) => t.oaza_cho === oaza);
      if (nums.ambiguous && town && !town.chome_n) { blk = nums.chome; no = nums.blk; }
    }
    if (!town) return null;
    const label = `${label0}${town.oaza_cho}${town.chome || ""}`;
    if (blk == null) return pointOf(town.point, label, "district");
    const kind = town.rsdt ? "住居表示" : "地番";
    const range = town.csv_ranges && town.csv_ranges[kind];
    if (!range) return pointOf(town.point, label, "district");
    const rows = await getRows(f, `${ADDR_API}/${enc(pref.pref)}/${enc(`${cityName(city)}-${kind}.txt`)}`, range);
    const key = town.rsdt ? ["blk_num", "rsdt_num"] : ["prc_num1", "prc_num2"];
    const exact = no != null && rows.find((r) => +r[key[0]] === blk && +r[key[1]] === no && r.lat);
    if (exact) return pointOf([+exact.lng, +exact.lat], `${label}${blk}-${no}`, "house");
    const inBlock = rows.filter((r) => +r[key[0]] === blk && r.lat);
    if (inBlock.length) {
      const lon = inBlock.reduce((a, r) => a + +r.lng, 0) / inBlock.length;
      const lat = inBlock.reduce((a, r) => a + +r.lat, 0) / inBlock.length;
      return pointOf([lon, lat], `${label}${blk}`, "block");
    }
    return pointOf(town.point, label, "district");
  }
  function pointOf(lonlat, label, level) {
    if (!lonlat || !inJapan(lonlat[1], lonlat[0])) return null;
    return { lat: +(+lonlat[1]).toFixed(6), lon: +(+lonlat[0]).toFixed(6), label, level };
  }
  async function getRows(fetchFn, url, range) {
    const key = `${url}#${range.start}`;
    if (cache.has(key)) return cache.get(key);
    const p = fetchFn(url, { headers: { Range: `bytes=${range.start}-${range.start + range.length - 1}` } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((text) => {
        const lines = text.split("\n").slice(1).filter(Boolean);
        const head = lines.shift().split(",");
        return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v])));
      });
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    return p;
  }

  // ---------- Namen über Nominatim ----------
  let lastCall = 0;
  /** Sucht Orte in Japan. Höchstens eine Anfrage pro Sekunde, gleiche Suche kommt aus dem Speicher. */
  async function searchPlaces(query, opts, fetchFn) {
    const f = fetchFn || fetch;
    const o = opts || {};
    const q = String(query || "").trim().slice(0, 120);
    if (q.length < 2) return [];
    const p = new URLSearchParams({ q, format: "jsonv2", countrycodes: "jp", limit: "6", addressdetails: "1", "accept-language": acceptLang(o.lang) });
    if (o.near) {
      // Nähe bevorzugen, ohne andere Orte auszuschließen
      const [lon, lat] = o.near, d = 0.25;
      p.set("viewbox", `${lon - d},${lat + d},${lon + d},${lat - d}`);
    }
    const url = `${NOMINATIM}?${p}`;
    if (cache.has(url)) return cache.get(url);
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const res = f(url, { headers: { Accept: "application/json" } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((list) => (Array.isArray(list) ? list : []).map(placeOf).filter(Boolean));
    cache.set(url, res);
    res.catch(() => cache.delete(url));
    return res;
  }
  // Ohne deutschen Namen lieber den englischen als den japanischen zeigen; auf Japanisch das Original
  function acceptLang(lang) {
    if (lang === "ja") return "ja";
    return lang && lang !== "en" ? `${lang},en` : "en";
  }
  const AREA_TYPES = /^(city|town|village|suburb|quarter|neighbourhood|county|state|region|postcode|road|municipality|city_district|district|hamlet|island)$/;
  function placeOf(x) {
    const lat = num(x.lat), lon = num(x.lon);
    if (!inJapan(lat, lon)) return null;
    const a = x.address || {};
    const name = x.name || (x.display_name || "").split(",")[0];
    const area = [a.neighbourhood || a.quarter || a.suburb, a.city_district || a.city || a.town || a.village].filter(Boolean).join(", ");
    // Einzelner Ort (Restaurant, Gebäude, Bahnhof) oder nur eine Gegend?
    const level = AREA_TYPES.test(x.addresstype || "") || AREA_TYPES.test(x.type || "") ? "district" : "building";
    return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), name, area, label: x.display_name || name, level, kind: x.type || "" };
  }

  return { parseLink, referenceUrl, normalizeAddress, looksLikeAddress, geocodeAddress, searchPlaces, kanjiNum, inJapan, _cache: cache };
});
