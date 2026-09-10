// Human hiking pace models: Tobler (1993) walking function blended with a
// moving-ratio to turn moving time into elapsed clock time.

import { gradeSampler, elevationGainLoss } from "./geo.js";

// Tobler: km/h as a function of grade (rise/run). Peak ~5.04 km/h at -5% grade.
export function toblerSpeedKph(grade) {
  return 6 * Math.exp(-3.5 * Math.abs(grade + 0.05));
}

// Naismith-style cross-check: 5 km/h plus 1 minute per 10 m of ascent.
export function naismithMinutes(distanceM, ascentM) {
  return (distanceM / 1000) * 12 + ascentM / 10;
}

export const DEFAULT_PACE = Object.freeze({
  speedFactor: 1,
  movingRatio: 0.85,
  minSpeedKph: 0.3,
  restMinutesPerHour: 0,
});

export function sanitizePace(pace) {
  const p = Object.assign({}, DEFAULT_PACE, pace || {});
  p.speedFactor = Math.max(0.2, Math.min(3, Number(p.speedFactor) || 1));
  p.movingRatio = Math.max(0.3, Math.min(1, Number(p.movingRatio) || 0.85));
  p.minSpeedKph = Math.max(0.05, Number(p.minSpeedKph) || 0.3);
  p.restMinutesPerHour = Math.max(0, Number(p.restMinutesPerHour) || 0);
  return p;
}

// Moving minutes for one leg, ignoring stops.
export function movingMinutes(distanceM, ascentM, pace) {
  const p = sanitizePace(pace);
  if (distanceM <= 0) return 0;
  const grade = ascentM / distanceM;
  const speed = Math.max(p.minSpeedKph, toblerSpeedKph(grade) * p.speedFactor);
  return (distanceM / 1000) / speed * 60;
}

// Elapsed minutes including rests and stops.
export function elapsedMinutes(moving, pace) {
  const p = sanitizePace(pace);
  const base = moving / p.movingRatio;
  return base + (base / 60) * p.restMinutesPerHour;
}

// Walk a profile (forward, or reversed for a return leg) and return a
// cumulative-time schedule plus distance/gain/loss totals.
export function buildSchedule(profile, pace, options) {
  const opts = options || {};
  const p = sanitizePace(pace);
  const src = profile.points;
  const pts = opts.reverse ? src.slice().reverse() : src;
  const cumulative = [0];
  let moving = 0;
  let dist = 0;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < pts.length; i++) {
    const dd = Math.abs(pts[i].dist - pts[i - 1].dist);
    const de = pts[i].ele - pts[i - 1].ele;
    const ascent = de > 0 ? de : 0;
    moving += movingMinutes(dd, ascent, p);
    dist += dd;
    if (de > 0) gain += de; else loss += -de;
    cumulative.push(elapsedMinutes(moving, p));
  }
  const sampler = gradeSampler(profile, 100);
  return {
    points: pts,
    cumulativeMinutes: cumulative,
    totalMinutes: cumulative[cumulative.length - 1] || 0,
    distanceM: dist,
    ascentM: gain,
    descentM: loss,
    gradeAt: sampler,
  };
}

// Overall route statistics independent of pacing.
export function routeStats(profile) {
  const g = elevationGainLoss(profile);
  return { distanceM: profile.distanceM, ascentM: g.gainM, descentM: g.lossM };
}

// Minutes elapsed from the start of a schedule to the point at a given route
// distance. Schedules may run forward (distance increasing) or reversed
// (distance decreasing); both are monotone, so we binary-search in O(log n).
export function minutesAtDistance(schedule, distanceM) {
  const pts = schedule.points;
  const cum = schedule.cumulativeMinutes;
  const n = pts.length;
  if (!n) return 0;
  const first = pts[0].dist;
  const last = pts[n - 1].dist;
  const ascending = last >= first;
  if (ascending) {
    if (distanceM <= first) return cum[0];
    if (distanceM >= last) return cum[n - 1];
  } else {
    if (distanceM >= first) return cum[0];
    if (distanceM <= last) return cum[n - 1];
  }
  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    const v = pts[mid].dist;
    if (ascending ? v <= distanceM : v >= distanceM) lo = mid; else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const span = b.dist - a.dist;
  const t = span !== 0 ? (distanceM - a.dist) / span : 0;
  return cum[lo] + (cum[hi] - cum[lo]) * t;
}
