// Geodesy and route-profile helpers. Pure ES module, zero dependencies.

export const EARTH_RADIUS_M = 6371008.8;

export function toRadians(deg) { return (deg * Math.PI) / 180; }
export function toDegrees(rad) { return (rad * 180) / Math.PI; }
export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

// Great-circle distance in metres between two { lat, lon } points.
export function haversineMeters(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Moving-average smoothing keeps elevation gain/loss from being inflated by
// GPS noise. Window is the number of samples on each side (0 disables).
export function smoothElevation(track, window) {
  const w = window == null ? 3 : window | 0;
  if (w <= 0) return track.map(function (p) { return Number(p.ele) || 0; });
  return track.map(function (_, i) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(track.length - 1, i + w); j++) {
      const e = Number(track[j].ele);
      if (Number.isFinite(e)) { sum += e; n += 1; }
    }
    return n > 0 ? sum / n : 0;
  });
}

// Build a linear-referenced profile: every point carries cumulative distance.
export function buildProfile(track, options) {
  const opts = options || {};
  if (!Array.isArray(track) || track.length === 0) {
    return { points: [], distanceM: 0 };
  }
  const ele = smoothElevation(track, opts.smoothWindow == null ? 3 : opts.smoothWindow);
  const points = track.map(function (p, i) {
    return { lat: p.lat, lon: p.lon, ele: ele[i], dist: 0, index: i };
  });
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversineMeters(points[i - 1], points[i]);
    points[i].dist = d;
  }
  return { points: points, distanceM: d };
}

// Interpolate a profile point at an arbitrary distance along the route.
export function pointAtDistance(profile, distanceM) {
  const pts = profile.points;
  if (pts.length === 0) return null;
  const target = clamp(distanceM, 0, profile.distanceM);
  if (target <= 0) return Object.assign({}, pts[0]);
  if (target >= profile.distanceM) return Object.assign({}, pts[pts.length - 1]);
  let lo = 0;
  let hi = pts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].dist <= target) lo = mid; else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const span = b.dist - a.dist;
  const t = span > 0 ? (target - a.dist) / span : 0;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    ele: a.ele + (b.ele - a.ele) * t,
    dist: target,
    index: a.index,
  };
}

// Local grade (rise/run, dimensionless) sampled with a fixed half-window in
// metres. Returns a function of distance so pace models can query any point.
export function gradeSampler(profile, halfWindowM) {
  const hw = halfWindowM == null ? 100 : halfWindowM;
  return function (distanceM) {
    const a = pointAtDistance(profile, distanceM - hw);
    const b = pointAtDistance(profile, distanceM + hw);
    if (!a || !b) return 0;
    const run = b.dist - a.dist;
    if (run <= 0) return 0;
    return (b.ele - a.ele) / run;
  };
}

// Total ascent/descent, ignoring changes smaller than the threshold (metres).
export function elevationGainLoss(profile, threshold) {
  const t = threshold == null ? 2 : threshold;
  const pts = profile.points;
  let gain = 0;
  let loss = 0;
  let anchor = pts.length ? pts[0].ele : 0;
  for (let i = 1; i < pts.length; i++) {
    const delta = pts[i].ele - anchor;
    if (Math.abs(delta) >= t) {
      if (delta > 0) gain += delta; else loss += -delta;
      anchor = pts[i].ele;
    }
  }
  return { gainM: gain, lossM: loss };
}

// Resample a profile to roughly even spacing; useful for charting and for
// keeping schedule maths O(n) regardless of the source point density.
export function resample(profile, spacingM) {
  const spacing = spacingM && spacingM > 0 ? spacingM : 25;
  if (profile.points.length < 2 || profile.distanceM <= 0) {
    return { points: profile.points.slice(), distanceM: profile.distanceM };
  }
  const out = [];
  for (let d = 0; d < profile.distanceM; d += spacing) {
    out.push(pointAtDistance(profile, d));
  }
  out.push(pointAtDistance(profile, profile.distanceM));
  return { points: out, distanceM: profile.distanceM };
}
