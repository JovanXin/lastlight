// Save the map tiles around a route for offline use, into the same cache the
// service worker reads.
export const TILE_CACHE = "lastlight-tiles";

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function latToTileY(lat, zoom) {
  const r = (lat * Math.PI) / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, zoom));
}

// Bounding box of a profile, padded in metres.
export function routeBounds(profile, padM) {
  const pad = padM == null ? 1000 : padM;
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  const pts = profile.points;
  for (let i = 0; i < pts.length; i++) {
    minLat = Math.min(minLat, pts[i].lat);
    maxLat = Math.max(maxLat, pts[i].lat);
    minLon = Math.min(minLon, pts[i].lon);
    maxLon = Math.max(maxLon, pts[i].lon);
  }
  const dLat = pad / 111194.93;
  const dLon = pad / (111194.93 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return {
    minLat: minLat - dLat, maxLat: maxLat + dLat,
    minLon: minLon - dLon, maxLon: maxLon + dLon,
  };
}

export function tilesForBounds(bounds, zoom) {
  const n = Math.pow(2, zoom);
  const minX = clamp(lonToTileX(bounds.minLon, zoom), 0, n - 1);
  const maxX = clamp(lonToTileX(bounds.maxLon, zoom), 0, n - 1);
  const minY = clamp(latToTileY(bounds.maxLat, zoom), 0, n - 1);
  const maxY = clamp(latToTileY(bounds.minLat, zoom), 0, n - 1);
  const list = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) list.push({ z: zoom, x: x, y: y });
  }
  return list;
}

export function tileUrl(z, x, y) {
  return "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png";
}

// Fetch and store each tile. Progress is reported per tile so the UI can show
// how far along a save is.
export async function cacheTiles(tiles, onProgress) {
  const cache = await caches.open(TILE_CACHE);
  let saved = 0;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const url = tileUrl(t.z, t.x, t.y);
    try {
      const res = await fetch(url, { mode: "no-cors", cache: "reload" });
      await cache.put(url, res);
      saved++;
    } catch (err) { /* skip unreachable tiles */ }
    if (onProgress) onProgress(i + 1, tiles.length, saved);
  }
  return saved;
}

export async function cachedTileCount() {
  try {
    const cache = await caches.open(TILE_CACHE);
    return (await cache.keys()).length;
  } catch (err) {
    return 0;
  }
}
