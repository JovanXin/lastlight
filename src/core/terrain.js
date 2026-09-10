// Terrain along an off-trail line. When elevation samples are available the
// bailout estimate integrates Tobler's function over the real profile instead of
// assuming one average grade.
import { haversineMeters } from "./geo.js";
import { sanitizePace, toblerSpeedKph, elapsedMinutes } from "./pace.js";

// Evenly spaced points along the straight line from a to b.
export function sampleLine(from, to, count) {
  const n = Math.max(2, Math.round(count) || 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lon: from.lon + (to.lon - from.lon) * t,
      t: t,
    });
  }
  return out;
}

// Walk the sampled profile, applying the detour factor to each segment so the
// grade matches the ground actually covered.
export function terrainLegMinutes(transect, pace, detourFactor) {
  const p = sanitizePace(pace);
  const factor = detourFactor == null ? 1.35 : detourFactor;
  let moving = 0;
  let distanceM = 0;
  let ascentM = 0;
  let descentM = 0;
  for (let i = 1; i < transect.length; i++) {
    const a = transect[i - 1];
    const b = transect[i];
    const segment = haversineMeters(a, b) * factor;
    const change = (Number(b.ele) || 0) - (Number(a.ele) || 0);
    const grade = segment > 0 ? change / segment : 0;
    const speedKph = Math.max(p.minSpeedKph, toblerSpeedKph(grade) * p.speedFactor);
    if (segment > 0) moving += (segment / 1000) / speedKph * 60;
    distanceM += segment;
    if (change > 0) ascentM += change; else descentM += -change;
  }
  return { distanceM: distanceM, ascentM: ascentM, descentM: descentM, minutes: elapsedMinutes(moving, p) };
}
