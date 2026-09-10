// Live location: project a GPS fix onto the planned route, and wrap the
// browser geolocation API. The projection is pure and unit tested.

const METERS_PER_DEG_LAT = 111194.93;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function toMeters(origin, point) {
  const latRad = (origin.lat * Math.PI) / 180;
  return {
    x: (point.lon - origin.lon) * METERS_PER_DEG_LAT * Math.cos(latRad),
    y: (point.lat - origin.lat) * METERS_PER_DEG_LAT,
  };
}

// Nearest point on the route to a GPS fix. Returns the distance along the route,
// how far off-route the fix is, and the index of the segment start.
export function projectOnRoute(profile, point) {
  const pts = profile.points;
  if (!pts.length) return { distanceM: 0, offsetM: 0, index: 0 };
  if (pts.length === 1) {
    const only = toMeters(pts[0], point);
    return { distanceM: pts[0].dist, offsetM: Math.hypot(only.x, only.y), index: 0 };
  }
  let best = { distanceM: pts[0].dist, offsetM: Infinity, index: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = toMeters(point, pts[i]);
    const b = toMeters(point, pts[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(a.x * dx + a.y * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const offset = Math.hypot(px, py);
    if (offset < best.offsetM) {
      best = {
        distanceM: pts[i].dist + t * (pts[i + 1].dist - pts[i].dist),
        offsetM: offset,
        index: i,
      };
    }
  }
  return best;
}

export function isSupported() {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

// Start watching the device position. Returns a stop function.
export function watchLocation(onUpdate, onError, options) {
  if (!isSupported()) {
    if (onError) onError(new Error("Geolocation is not available"));
    return function () {};
  }
  const opts = options || { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 };
  const id = navigator.geolocation.watchPosition(function (pos) {
    onUpdate({
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      heading: pos.coords.heading,
      speedMps: pos.coords.speed,
      at: new Date(pos.timestamp),
    });
  }, function (err) {
    if (onError) onError(err);
  }, opts);
  return function () { navigator.geolocation.clearWatch(id); };
}
