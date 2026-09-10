// Personal pace calibration. From one recorded hike we can only identify the
// effective product of speed factor and moving ratio, so calibration adjusts
// the speed factor and leaves the moving ratio to the user.
import { buildSchedule, sanitizePace } from "./pace.js";

export function plannedMinutes(profile, pace) {
  return buildSchedule(profile, sanitizePace(pace)).totalMinutes;
}

// Find the speed factor whose planned elapsed time matches an actual elapsed
// time. Returns matched: false when the target is outside the search range.
export function calibrateSpeedFactor(profile, pace, actualMinutes, options) {
  const opts = options || {};
  const base = sanitizePace(pace);
  const target = Number(actualMinutes);
  const lo = opts.minFactor == null ? 0.2 : Number(opts.minFactor);
  const hi = opts.maxFactor == null ? 3 : Number(opts.maxFactor);
  if (!Number.isFinite(target) || target <= 0) {
    return { speedFactor: base.speedFactor, matched: false, reason: "invalid" };
  }
  const elapsedAt = function (k) {
    return buildSchedule(profile, Object.assign({}, base, { speedFactor: k })).totalMinutes;
  };
  if (elapsedAt(hi) > target) return { speedFactor: hi, matched: false, reason: "too-fast" };
  if (elapsedAt(lo) < target) return { speedFactor: lo, matched: false, reason: "too-slow" };
  let a = lo;
  let b = hi;
  for (let i = 0; i < 48; i++) {
    const mid = (a + b) / 2;
    if (elapsedAt(mid) > target) a = mid; else b = mid;
  }
  return { speedFactor: (a + b) / 2, matched: true, reason: "ok" };
}

// How far off the plan a hike was, as a fraction (positive means slower).
export function paceDelta(actualMinutes, planned) {
  if (!Number.isFinite(actualMinutes) || !Number.isFinite(planned) || planned <= 0) return null;
  return (actualMinutes - planned) / planned;
}
