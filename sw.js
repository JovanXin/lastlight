// Offline shell for Lastlight: cache-first for the app, stale-while-revalidate
// for map tiles, so the app opens with no signal.
const VERSION = "lastlight-v3";
const SHELL_CACHE = VERSION + "-shell";
// Stable name shared with src/services/offline.js so saved tiles survive app
// version bumps.
const TILE_CACHE = "lastlight-tiles";
// A 1x1 transparent PNG, served in place of a tile that cannot be fetched so
// the map degrades quietly instead of logging errors.
const BLANK_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
let blankResponse = null;
function blankTile() {
  if (!blankResponse) {
    const bytes = Uint8Array.from(atob(BLANK_PNG), function (c) { return c.charCodeAt(0); });
    blankResponse = new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  }
  return blankResponse;
}

const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "src/app.js",
  "src/core/geo.js",
  "src/core/pace.js",
  "src/core/solar.js",
  "src/core/turnaround.js",
  "src/core/planning.js",
  "src/core/calibrate.js",
  "src/core/gpx.js",
  "src/data/sample-routes.js",
  "src/services/storage.js",
  "src/services/weather.js",
  "src/services/location.js",
  "src/ui/store.js",
  "src/ui/map.js",
  "src/ui/profile.js",
  "src/ui/sharecard.js",
  "src/ui/format.js",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      // Add each entry separately: one unreachable file must not abort the
      // whole install and leave the app uncacheable.
      return Promise.all(SHELL.map(function (p) {
        return cache.add(new Request(p, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL_CACHE && k !== TILE_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(function (cache) { cache.put(request, copy); });
          return response;
        }).catch(function () { return caches.match("index.html"); });
      })
    );
    return;
  }

  if (url.hostname.indexOf("tile.openstreetmap.org") !== -1) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        const network = fetch(request).then(function (response) {
          const copy = response.clone();
          caches.open(TILE_CACHE).then(function (cache) { cache.put(request, copy); });
          return response;
        }).catch(function () { return cached || blankTile(); });
        return cached || network;
      })
    );
  }
});
