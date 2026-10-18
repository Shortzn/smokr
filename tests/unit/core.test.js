// Logiktests für app/core.js. Aufruf: node --test tests/unit
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../app/core.js");

const TOKYO_STATION = [139.7671, 35.6812];
const SHINJUKU = [139.7005, 35.6909];

function spot(over) {
  return Object.assign({ id: "x", k: "p", acc: "public", lat: 35.68, lon: 139.76, pos: "exact", osm: { url: "u" } }, over);
}

test("Entfernung ist Luftlinie ohne Gehzeit", () => {
  assert.equal(C.fmtDist(4), "10 m");
  assert.equal(C.fmtDist(218), "220 m");
  assert.equal(C.fmtDist(1530), "1,5 km");
  assert.equal(C.fmtDist(23400), "23 km");
  assert.ok(!/Min/.test(C.fmtDist(600)));
});

test("Zugang: nur Belegtes wird als Tatsache ausgegeben", () => {
  const konbini = spot({ k: "v", acc: "unknown", vt: "Konbini", sd: "Aschenbecher vor dem Laden" });
  assert.equal(C.category(konbini), "business");
  assert.equal(C.accessLabel(konbini), "Zugang unklar");
  assert.ok(!/kaufen/.test(C.accessExplain(konbini)), "kein Kaufzwang ohne Beleg");
  const osakaShop = spot({ k: "v", acc: "customers", vt: "Geschäft", off: { ward: "Osaka Kita" } });
  assert.equal(C.category(osakaShop), "customers");
  assert.match(C.accessExplain(osakaShop), /etwas kaufen/);
  assert.equal(C.accessLabel(spot({})), "Öffentlich");
});

test("Herkunft: Listendatum ist keine Vor-Ort-Prüfung", () => {
  const off = spot({ off: { ward: "Chiyoda", date: "2026-09-11", url: "x" }, osm: undefined });
  const t = C.trust(off, null);
  assert.equal(t.official.date, "2026-09-11");
  assert.equal(t.osm, null);
  assert.equal(t.mine, null);
  assert.equal(t.weak, false);
  const osmOnly = C.trust(spot({}), null);
  assert.equal(osmOnly.weak, true);
  assert.equal(osmOnly.short, "OpenStreetMap");
  const checked = C.trust(spot({ osm: { url: "u", chk: "2026-05-10" } }), { s: "ok", t: "2026-10-18T00:00:00Z" });
  assert.equal(checked.osm.checked, "2026-05-10");
  assert.equal(checked.mine.status, "ok");
  assert.equal(checked.weak, false);
  assert.equal(C.trust(spot({ off: { ward: "Naha Airport" }, pos: "area" }), null).weak, true);
});

test("Warnungen: Position und Tabakerhitzer", () => {
  assert.deepEqual(C.warnings(spot({ pos: "address" })).map((w) => w.id), ["pos"]);
  assert.deepEqual(C.warnings(spot({ heated: true }), { tobacco: "both" }).map((w) => w.id), ["heated"]);
  assert.deepEqual(C.warnings(spot({ heated: true }), { tobacco: "heated" }), []);
});

test("Einstellungen: alte Filter werden übernommen", () => {
  assert.deepEqual(C.migratePrefs(null, null), C.DEFAULT_PREFS);
  const m = C.migratePrefs(null, { public: true, venue: true, noHeated: true });
  assert.equal(m.showBusiness, true);
  assert.equal(m.tobacco, "cig");
  const keep = C.migratePrefs({ tobacco: "heated", showPublic: false }, { noHeated: true });
  assert.equal(keep.tobacco, "heated");
  assert.equal(keep.showPublic, false);
  assert.equal(C.migratePrefs({ tobacco: "pipe" }, null).tobacco, "both");
});

test("Filter: Zigaretten blendet Nur-Tabakerhitzer aus, Ausgeblendetes bleibt verborgen", () => {
  const heated = spot({ id: "h", heated: true });
  const prefs = Object.assign({}, C.DEFAULT_PREFS, { tobacco: "cig" });
  assert.equal(C.visible(heated, prefs, {}), false);
  assert.equal(C.visible(heated, Object.assign({}, prefs, { tobacco: "heated" }), {}), true);
  const gone = { h: { s: "gone", t: "x" } };
  assert.equal(C.visible(heated, Object.assign({}, prefs, { tobacco: "both" }), gone), false);
  assert.equal(C.visible(heated, Object.assign({}, prefs, { tobacco: "both", showHidden: true }), gone), true);
  const biz = spot({ k: "v", acc: "unknown" });
  assert.equal(C.visible(biz, C.DEFAULT_PREFS, {}), false);
});

test("Reihenfolge: nur Luftlinie, stabil", () => {
  const near = spot({ id: "near", lat: 35.6815, lon: 139.7672 });
  const far = spot({ id: "far", lat: 35.69, lon: 139.70 });
  const r = C.rank([far, near], TOKYO_STATION, C.DEFAULT_PREFS, {}, 10);
  assert.deepEqual(r.map((x) => x.s.id), ["near", "far"]);
});

test("Standort: Stadtwechsel löst Liste vom GPS", () => {
  let st = C.initialLocation();
  let out = C.locationReduce(st, { type: "locate" });
  assert.deepEqual(out.effects, [{ type: "watch" }]);
  st = out.state;
  assert.equal(st.mode, "nearby");
  out = C.locationReduce(st, { type: "fix", pos: TOKYO_STATION });
  assert.deepEqual(out.effects, [{ type: "center", to: TOKYO_STATION }]);
  st = out.state;
  assert.deepEqual(C.anchorOf(st, SHINJUKU), TOKYO_STATION);
  // Weitere GPS-Updates bewegen die Karte nicht
  out = C.locationReduce(st, { type: "fix", pos: [139.768, 35.682] });
  assert.deepEqual(out.effects, []);
  st = out.state;
  // Stadtwechsel: Bezugspunkt ist die Kartenmitte, obwohl GPS bekannt ist
  st = C.locationReduce(st, { type: "region" }).state;
  const kyoto = C.REGIONS.find((r) => r.id === "kyoto").center;
  assert.deepEqual(C.anchorOf(st, kyoto), kyoto);
  // GPS-Update danach holt die Liste nicht zurück
  st = C.locationReduce(st, { type: "fix", pos: TOKYO_STATION }).state;
  assert.deepEqual(C.anchorOf(st, kyoto), kyoto);
  // Standort-Knopf: sofort zurück, ohne neue Abfrage
  out = C.locationReduce(st, { type: "locate" });
  assert.deepEqual(out.effects, [{ type: "center", to: TOKYO_STATION }]);
  assert.equal(out.state.mode, "nearby");
});

test("Standort: Kartenschwenk und Ablehnung", () => {
  let st = C.locationReduce(C.initialLocation(), { type: "locate" }).state;
  st = C.locationReduce(st, { type: "fix", pos: TOKYO_STATION }).state;
  st = C.locationReduce(st, { type: "userPan" }).state;
  assert.equal(st.mode, "area");
  const denied = C.locationReduce(C.locationReduce(C.initialLocation(), { type: "locate" }).state, { type: "denied" }).state;
  assert.equal(denied.mode, "area");
  assert.equal(denied.perm, "denied");
  assert.equal(denied.pendingCenter, false);
  assert.deepEqual(C.anchorOf(denied, SHINJUKU), SHINJUKU);
});

test("Stadt zum Punkt", () => {
  assert.equal(C.regionFor(SHINJUKU).id, "tokyo");
  assert.equal(C.regionFor([139.4875, 35.3386]).id, "kamakura"); // Fujisawa
  assert.equal(C.regionFor([127.65, 26.21]).id, "okinawa");
  assert.equal(C.regionFor([138.2, 36.6]), null); // Nagano
});

test("Suche: Bahnhof und Umlaute", () => {
  const a = spot({ id: "a", st: { en: "Shinjuku", ja: "新宿", m: 100 } });
  const b = spot({ id: "b", nj: "大船駅東口", st: { en: "Ōfuna", ja: "大船", m: 50 } });
  const prefs = C.DEFAULT_PREFS;
  assert.deepEqual(C.search([a, b], "shinjuku", TOKYO_STATION, prefs, {}).map((x) => x.s.id), ["a"]);
  assert.deepEqual(C.search([a, b], "Ofuna", TOKYO_STATION, prefs, {}).map((x) => x.s.id), ["b"]);
  assert.deepEqual(C.search([a, b], "大船", TOKYO_STATION, prefs, {}).map((x) => x.s.id), ["b"]);
  assert.deepEqual(C.search([a, b], "", TOKYO_STATION, prefs, {}), []);
  assert.deepEqual(C.searchRegions("kyo").map((r) => r.id), ["tokyo", "kyoto"]);
  // Bahnhof genau getroffen schlägt Bezirkstreffer, auch wenn der näher an der Kartenmitte liegt
  const ward = spot({ id: "ward", lat: 35.6815, lon: 139.7672, off: { ward: "Shinjuku" }, st: { en: "Yotsuya", ja: "四ツ谷", m: 100 } });
  const far = spot({ id: "station-far", lat: 35.69, lon: 139.70, st: { en: "Shinjuku", ja: "新宿", m: 300 } });
  const near = spot({ id: "station-near", lat: 35.691, lon: 139.701, st: { en: "Shinjuku", ja: "新宿", m: 50 } });
  assert.deepEqual(C.search([ward, far, near], "Shinjuku", TOKYO_STATION, prefs, {}).map((x) => x.s.id), ["station-near", "station-far", "ward"]);
});

test("Öffnungszeiten: nur bekannte Muster übersetzt", () => {
  assert.equal(C.hours("午前7時～午後8時（土曜日・日曜日・祝日・お盆・年末年始を除く）").text,
    "7:00–20:00 (Sa, So, Feiertage, Obon, Jahreswechsel ausgenommen)");
  assert.equal(C.hours("24/7").text, "rund um die Uhr");
  assert.equal(C.hours(null), null);
  const odd = C.hours("店舗営業時間に準ずる");
  assert.ok(odd.original, "Unübersetztes Original wird mitgeliefert");
});

test("Routen: Fußweg in beiden Apps", () => {
  const u = C.routeUrls(spot({ lat: 35.1, lon: 139.2 }));
  assert.match(u.apple, /dirflg=w/);
  assert.match(u.google, /travelmode=walking/);
  assert.equal(C.defaultRouteApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "apple");
  assert.equal(C.defaultRouteApp("Mozilla/5.0 (Linux; Android 14)"), "google");
});

test("Datenprüfung erkennt kaputte und alte Dateien", () => {
  assert.throws(() => C.validateRegionData({ region: "tokyo", spots: [] }, "tokyo"), /Datenformat/);
  assert.throws(() => C.validateRegionData({ schema: 2, region: "kyoto", spots: [] }, "tokyo"), /falsche Stadt/);
  assert.throws(() => C.validateRegionData({ schema: 2, region: "tokyo", spots: [{ id: 1 }] }, "tokyo"), /fehlerhaft/);
  assert.ok(C.validateRegionData({ schema: 2, region: "tokyo", spots: [] }, "tokyo"));
});
