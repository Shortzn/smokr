// Offline-Betrieb: App und Daten vorab, Kartenteile beim Ansehen zwischenspeichern.
const VERSION = "kitsuen-v3";
const SHELL = [
  "./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "vendor/maplibre-gl.js", "vendor/maplibre-gl.css", "icons/icon-180.png", "icons/icon-192.png",
  "data/tokyo.json", "data/kamakura.json", "data/kyoto.json", "data/okinawa.json", "data/osaka.json",
];
const TILE_CACHE = "kitsuen-tiles";
const TILE_LIMIT = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== VERSION && k !== TILE_CACHE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_LIMIT; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  if (url.origin === location.origin) {
    // Eigene Dateien: Netz zuerst (damit neue Daten ankommen), offline aus dem Speicher
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
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
        if (res.ok) { c.put(e.request, res.clone()); trimTiles(); }
        return res;
      } catch (err) {
        if (hit) return hit;
        throw err;
      }
    }));
  }
});
