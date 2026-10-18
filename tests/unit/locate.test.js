// Ortssuche beim Hinzufügen: Links, Adressen, Namen. Ohne Netz: feste Antworten statt echter Dienste.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../app/locate.js");
const F = require("./locate-fixtures.js");

test("Google-Maps-Links: genaue Ortsmarke, Parameter, nur Ausschnitt, Kurzlink", () => {
  const place = L.parseLink("https://www.google.com/maps/place/A%CC%8ATER+Tokyo/@35.6874623,139.84663,17z/data=!3m1!4b1!4m6!3m5!1s0x6:0xf!8m2!3d35.6874623!4d139.84663!16s");
  assert.deepEqual(place, { lat: 35.687462, lon: 139.84663, name: "ÅTER Tokyo", precise: true });
  assert.equal(L.parseLink("https://maps.google.com/?q=35.6595,139.7005").precise, true);
  assert.equal(L.parseLink("https://www.google.com/maps/search/?api=1&query=35.6812%2C139.7671").lat, 35.6812);
  assert.equal(L.parseLink("https://www.google.com/maps/dir/?api=1&destination=35.68,139.76").lon, 139.76);
  const view = L.parseLink("https://www.google.co.jp/maps/place/一蘭+渋谷店/@35.661,139.700,18z");
  assert.equal(view.precise, false, "nur Kartenausschnitt");
  assert.equal(view.name, "一蘭 渋谷店");
  assert.deepEqual(L.parseLink("https://maps.app.goo.gl/akkoLdQVouxV8ve17"), { short: "https://maps.app.goo.gl/akkoLdQVouxV8ve17" });
  assert.equal(L.parseLink("https://maps.apple.com/?ll=35.6812,139.7671&q=Tokyo").lat, 35.6812);
  assert.equal(L.parseLink("https://www.openstreetmap.org/?mlat=35.68&mlon=139.76#map=18/35.68/139.76").lat, 35.68);
  assert.deepEqual(L.parseLink("35.6812, 139.7671"), { lat: 35.6812, lon: 139.7671, name: "", precise: true });
});

test("Links: ungültig, außerhalb Japans, ohne Position, kein Link", () => {
  assert.deepEqual(L.parseLink("https://www.google.com/maps/place/Paris/@48.85,2.35,12z"), { error: "outside" });
  assert.deepEqual(L.parseLink("https://example.com/foo"), { error: "link" });
  assert.deepEqual(L.parseLink("https://www.google.com/maps/place/Nur+Name"), { name: "Nur Name", error: "nocoords" });
  assert.equal(L.parseLink("Ichiran Shibuya"), null);
  assert.equal(L.parseLink("東京都渋谷区神南1-22-7"), null);
  assert.equal(L.parseLink(""), null);
});

test("Adressen: Schreibweisen werden vereinheitlicht", () => {
  assert.equal(L.normalizeAddress("〒150-0041 東京都渋谷区神南１－２２－７"), "東京都渋谷区神南1-22-7");
  assert.equal(L.normalizeAddress("渋谷区神南一丁目22番7号"), "渋谷区神南1丁目22-7");
  assert.equal(L.normalizeAddress("東京都千代田区外神田1ー17ー6"), "東京都千代田区外神田1-17-6");
  assert.equal(L.normalizeAddress("センター前"), "センター前", "ー in Namen bleibt");
  assert.equal(L.kanjiNum("二十三"), 23);
  assert.equal(L.looksLikeAddress("東京都渋谷区神南1-22-7"), true);
  assert.equal(L.looksLikeAddress("渋谷区神南1-22-7"), true);
  assert.equal(L.looksLikeAddress("Ichiran Shibuya"), false);
  assert.equal(L.looksLikeAddress("一蘭 渋谷店"), false);
});

test("Adressen: bis zur Hausnummer, sonst Block, sonst Ortsteil", async () => {
  L._cache.clear();
  const f = F.fakeFetch();
  const house = await L.geocodeAddress("東京都渋谷区神南1-22-7", f);
  assert.deepEqual(house, { lat: 35.661075, lon: 139.700933, label: "東京都渋谷区神南一丁目22-7", level: "house" });
  const same = await L.geocodeAddress("渋谷区神南一丁目22番7号", f);
  assert.equal(same.level, "house", "ohne Präfektur, eindeutiger Bezirk");
  const block = await L.geocodeAddress("東京都渋谷区神南1-22-99", f);
  assert.equal(block.level, "block");
  const town = await L.geocodeAddress("東京都渋谷区神南1", f);
  assert.equal(town.level, "district");
  assert.equal(await L.geocodeAddress("東京都渋谷区存在しない町1-1-1", f).then((r) => r.level), "city");
  assert.equal(await L.geocodeAddress("Musterstraße 1", f), null);
  // Range-Anfrage statt ganzer Datei
  assert.ok(f.calls.some((c) => c.range && /^bytes=\d+-\d+$/.test(c.range)));
});

test("Adressen: mehrdeutiger Bezirk entscheidet die Nähe zur Karte", async () => {
  L._cache.clear();
  const f = F.fakeFetch();
  assert.equal(await L.geocodeAddress("中央区銀座4-6-16", f), null, "ohne Kartenposition keine Vermutung");
  const tokyo = await L.geocodeAddress("中央区銀座4-6-16", f, [139.76, 35.68]);
  assert.match(tokyo.label, /^東京都中央区/);
});

test("Namen: Nominatim nur für Japan, mit Sprache, ohne Autocomplete, gespeichert", async () => {
  L._cache.clear();
  const f = F.fakeFetch();
  const list = await L.searchPlaces("Ichiran Shibuya", { lang: "de", near: [139.7, 35.66] }, f);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { lat: 35.661023, lon: 139.700911, name: "Ichiran", area: "Jinnan 1, Shibuya", label: "Ichiran, 7, Jinnan 1, Jinnan, Shibuya, Tokyo, Japan", level: "building", kind: "restaurant" });
  assert.equal(list[1].level, "district", "Stadtteil ist nur eine Gegend");
  const url = new URL(f.calls[0].url);
  assert.equal(url.hostname, "nominatim.openstreetmap.org");
  assert.equal(url.searchParams.get("countrycodes"), "jp");
  assert.equal(url.searchParams.get("accept-language"), "de,en", "ohne deutschen Namen lieber Englisch");
  assert.ok(url.searchParams.get("viewbox"));
  await L.searchPlaces("Ichiran Shibuya", { lang: "de", near: [139.7, 35.66] }, f);
  assert.equal(f.calls.filter((c) => /nominatim/.test(c.url)).length, 1, "gleiche Suche nicht noch einmal anfragen");
  assert.deepEqual(await L.searchPlaces("x", {}, f), [], "zu kurz: keine Anfrage");
});
