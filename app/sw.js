// Offline-Betrieb: App und Daten vorab, Kartenteile beim Ansehen zwischenspeichern.
const VERSION = "smokr-v21";
const SHELL = [
  "./", "index.html", "style.css", "config.js", "legal.html", "i18n.js", "core.js", "markers.js", "sheet.js", "community.js", "locate.js", "app.js", "manifest.webmanifest",
  "vendor/maplibre-gl.js", "vendor/maplibre-gl.css", "icons/icon-180.png", "icons/icon-192.png",
  "data/tokyo.json", "data/kamakura.json", "data/kyoto.json", "data/okinawa.json", "data/osaka.json",
];
const TILE_CACHE = "smokr-tiles";
const TILE_LIMIT = 4000;
// Bei schlechtem Netz nicht ewig warten: danach gilt der gespeicherte Stand
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener("install", (e) => {
  // cache: "reload": nie aus dem HTTP-Cache des Browsers übernehmen. GitHub Pages erlaubt 10 Minuten
  // Zwischenspeicherung; sonst könnte eine neue Version alte Dateien in ihren Speicher legen.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
function removeOldCaches() {
  return caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== VERSION && k !== TILE_CACHE).map((k) => caches.delete(k))
  ));
}
self.addEventListener("activate", (e) => {
  // Offene Fenster erfahren, dass eine neue Version übernommen hat (iOS-Home-Bildschirm lädt sonst nicht neu)
  e.waitUntil(removeOldCaches().then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: "window" }))
    .then((list) => list.forEach((c) => c.postMessage({ type: "smokr-version", version: VERSION }))));
});
// Eine ältere Version kann kurz nach dem Wechsel noch in ihren Cache schreiben.
// Darum gelegentlich nachräumen, höchstens alle 10 Sekunden.
let lastSweep = 0;
function sweepLater(e) {
  const now = Date.now();
  if (now - lastSweep < 10000) return;
  lastSweep = now;
  e.waitUntil(new Promise((r) => setTimeout(r, 3000)).then(removeOldCaches));
}

let trimTimer = null;
function scheduleTrim() {
  if (trimTimer) return;
  trimTimer = setTimeout(async () => {
    trimTimer = null;
    const c = await caches.open(TILE_CACHE);
    const keys = await c.keys();
    for (let i = 0; i < keys.length - TILE_LIMIT; i++) await c.delete(keys[i]);
  }, 10000);
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  // "no-cache": beim Server nachfragen (304, wenn unverändert), statt bis zu 10 Minuten alte Dateien zu nehmen
  const network = fetch(request, { cache: "no-cache" }).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
  } catch (e) { /* offline: weiter unten aus dem Speicher */ }
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  return network; // nichts gespeichert: auf das Netz warten, Fehler durchreichen
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  if (url.origin === location.origin) {
    sweepLater(e);
    e.respondWith(networkFirst(e.request));
    return;
  }

  if (url.hostname === "tiles.openfreemap.org") {
    const versioned = !url.pathname.startsWith("/styles/") && url.pathname !== "/planet";
    e.respondWith(caches.open(TILE_CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      // Kartenteile mit Versionspfad ändern sich nicht: Speicher zuerst
      if (hit && versioned) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok) { c.put(e.request, res.clone()); scheduleTrim(); }
        return res;
      } catch (err) {
        if (hit) return hit;
        throw err;
      }
    }));
  }
});
