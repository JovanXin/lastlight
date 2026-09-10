// Offline shell for Lastlight: cache-first for the app, stale-while-revalidate
// for map tiles, so the app opens with no signal.
const VERSION = "lastlight-v1";
const SHELL_CACHE = VERSION + "-shell";
const TILE_CACHE = VERSION + "-tiles";
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
  "src/core/gpx.js",
  "src/data/sample-routes.js",
  "src/ui/store.js",
  "src/ui/map.js",
  "src/ui/profile.js",
  "src/ui/format.js",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL.map(function (p) { return new Request(p, { cache: "reload" }); }));
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
        }).catch(function () { return cached; });
        return cached || network;
      })
    );
  }
});
