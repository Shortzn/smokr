// Offline-Betrieb: App und Daten vorab, Kartenteile beim Ansehen zwischenspeichern.
const VERSION = "smokr-v5";
const SHELL = [
  "./", "index.html", "style.css", "core.js", "app.js", "manifest.webmanifest",
  "vendor/maplibre-gl.js", "vendor/maplibre-gl.css", "icons/icon-180.png", "icons/icon-192.png",
  "data/tokyo.json", "data/kamakura.json", "data/kyoto.json", "data/okinawa.json", "data/osaka.json",
];
const TILE_CACHE = "smokr-tiles";
const TILE_LIMIT = 4000;
// Bei schlechtem Netz nicht ewig warten: danach gilt der gespeicherte Stand
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== VERSION && k !== TILE_CACHE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

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
  const network = fetch(request).then((res) => {
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
