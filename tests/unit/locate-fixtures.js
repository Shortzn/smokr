// Feste Antworten für die Ortssuche-Tests (Ausschnitte im Format der echten Dienste).
const API = "https://japanese-addresses-v2.geoloniamaps.com/api/ja";

function csv(title, rows) {
  return `住居表示,${title}\nblk_num,rsdt_num,rsdt_num2,lng,lat\n` + rows.map((r) => r.join(",")).join("\n") + "\n";
}
// Zwei Ortsteile hintereinander in einer Datei, abgerufen per Range wie beim echten Dienst
function file(parts) {
  let text = "", ranges = [];
  for (const p of parts) {
    const start = Buffer.byteLength(text);
    text += p;
    ranges.push({ start, length: Buffer.byteLength(p) });
  }
  return { text, ranges };
}
const shibuya = file([
  csv("神宮前一丁目", [[1, 1, "", "139.70530", "35.67155"]]),
  csv("神南一丁目", [[1, 2, "", "139.700688658", "35.666325003"], [22, 7, "", "139.700933", "35.661075"], [22, 8, "", "139.701", "35.6612"]]),
]);
const chuo = file([csv("銀座四丁目", [[6, 16, "", "139.765599", "35.671579"]])]);

const DATA = {
  [`${API}.json`]: { data: [
    { pref: "東京都", point: [139.69, 35.69], cities: [
      { city: "渋谷区", point: [139.7036, 35.6618] },
      { city: "中央区", point: [139.772, 35.6705] },
    ] },
    { pref: "大阪府", point: [135.52, 34.68], cities: [{ city: "大阪市", ward: "中央区", point: [135.5098, 34.6813] }] },
  ] },
  [`${API}/${encodeURIComponent("東京都")}/${encodeURIComponent("渋谷区")}.json`]: { data: [
    { oaza_cho: "神宮前", chome: "一丁目", chome_n: 1, rsdt: true, point: [139.705302, 35.671552], csv_ranges: { 住居表示: shibuya.ranges[0] } },
    { oaza_cho: "神南", chome: "一丁目", chome_n: 1, rsdt: true, point: [139.700363, 35.663127], csv_ranges: { 住居表示: shibuya.ranges[1] } },
  ] },
  [`${API}/${encodeURIComponent("東京都")}/${encodeURIComponent("中央区")}.json`]: { data: [
    { oaza_cho: "銀座", chome: "四丁目", chome_n: 4, rsdt: true, point: [139.7657, 35.6717], csv_ranges: { 住居表示: chuo.ranges[0] } },
  ] },
};
const FILES = {
  [`${API}/${encodeURIComponent("東京都")}/${encodeURIComponent("渋谷区-住居表示.txt")}`]: shibuya.text,
  [`${API}/${encodeURIComponent("東京都")}/${encodeURIComponent("中央区-住居表示.txt")}`]: chuo.text,
};
const NOMINATIM = [
  { lat: "35.6610233", lon: "139.7009111", name: "Ichiran", type: "restaurant", addresstype: "amenity",
    display_name: "Ichiran, 7, Jinnan 1, Jinnan, Shibuya, Tokyo, Japan", address: { neighbourhood: "Jinnan 1", city: "Shibuya" } },
  { lat: "35.6618", lon: "139.7036", name: "Shibuya", type: "administrative", addresstype: "city", display_name: "Shibuya, Tokyo, Japan", address: {} },
  { lat: "48.85", lon: "2.35", name: "Paris", type: "city", addresstype: "city", display_name: "Paris, France", address: {} },
];

function fakeFetch() {
  const calls = [];
  const f = async (url, init) => {
    const range = init && init.headers && init.headers.Range;
    calls.push({ url, range });
    if (url.startsWith("https://nominatim.openstreetmap.org/")) return response(JSON.stringify(NOMINATIM));
    if (DATA[url]) return response(JSON.stringify(DATA[url]));
    if (FILES[url]) {
      const buf = Buffer.from(FILES[url]);
      const m = range && range.match(/bytes=(\d+)-(\d+)/);
      return response(m ? buf.subarray(+m[1], +m[2] + 1).toString() : buf.toString(), m ? 206 : 200);
    }
    return response("not found", 404);
  };
  f.calls = calls;
  return f;
}
function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body), text: async () => body };
}
module.exports = { fakeFetch, DATA, FILES, NOMINATIM, API };
