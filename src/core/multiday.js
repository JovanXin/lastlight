// Multi-day planning: split a long traverse into stages that each end well
// before dark, with a hut or camp between them.

function dayStartDate(startMs, dayIndex, dayStartMinutes) {
  const base = new Date(startMs + dayIndex * 86400000);
  base.setHours(Math.floor(dayStartMinutes / 60), dayStartMinutes % 60, 0, 0);
  return base;
}

function nearestIndex(pts, dist) {
  let lo = 0;
  let hi = pts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].dist <= dist) lo = mid; else hi = mid;
  }
  return Math.abs(pts[lo].dist - dist) <= Math.abs(pts[hi].dist - dist) ? lo : hi;
}

// Split a schedule into days. Days end at the last named stopping point (a hut
// or camp) that still fits inside the day, so stages land where a walker would
// actually stop rather than wherever the clock happens to run out.
export function splitIntoDays(profile, schedule, options) {
  const opts = options || {};
  const dayLength = opts.dayLengthMinutes == null ? 600 : opts.dayLengthMinutes;
  const margin = opts.marginMinutes == null ? 30 : opts.marginMinutes;
  const dayStartMinutes = opts.dayStartMinutes == null ? 480 : opts.dayStartMinutes;
  const maxDays = opts.maxDays == null ? 60 : opts.maxDays;
  const mergeBelow = opts.mergeFinalDayBelow == null ? 90 : opts.mergeFinalDayBelow;
  const usable = Math.max(30, dayLength - margin);
  const pts = schedule.points;
  const cum = schedule.cumulativeMinutes;
  const days = [];
  if (pts.length < 2) return days;

  const stopIdx = new Set((opts.stopDistances || []).map(function (d) { return nearestIndex(pts, d); })
    .filter(function (i) { return i > 0 && i < pts.length - 1; }));

  let startIdx = 0;
  while (startIdx < pts.length - 1 && days.length < maxDays) {
    const base = cum[startIdx];
    let endIdx = startIdx;
    while (endIdx + 1 < pts.length && cum[endIdx + 1] - base <= usable) endIdx++;
    if (endIdx === startIdx) endIdx = Math.min(startIdx + 1, pts.length - 1);
    // Prefer the furthest hut or camp that still fits within the day.
    let chosen = -1;
    for (let i = startIdx + 1; i <= endIdx; i++) if (stopIdx.has(i)) chosen = i;
    if (chosen > startIdx) endIdx = chosen;

    let ascent = 0;
    for (let i = startIdx + 1; i <= endIdx; i++) {
      const d = pts[i].ele - pts[i - 1].ele;
      if (d > 0) ascent += d;
    }
    const walking = cum[endIdx] - base;
    const dayStart = opts.startMs != null
      ? (days.length === 0 ? new Date(opts.startMs) : dayStartDate(opts.startMs, days.length, dayStartMinutes))
      : null;
    days.push({
      day: days.length + 1,
      startDistM: pts[startIdx].dist,
      endDistM: pts[endIdx].dist,
      distanceM: pts[endIdx].dist - pts[startIdx].dist,
      minutes: walking,
      ascentM: ascent,
      startAt: dayStart,
      endAt: dayStart ? new Date(dayStart.getTime() + walking * 60000) : null,
    });

    if (endIdx >= pts.length - 1) break;
    startIdx = endIdx;
  }

  // Fold a trivially short final day into the one before it: a 30 minute last
  // leg means you would have simply kept walking.
  if (days.length > 1 && days[days.length - 1].minutes < mergeBelow) {
    const last = days.pop();
    const prev = days[days.length - 1];
    prev.distanceM += last.distanceM;
    prev.ascentM += last.ascentM;
    prev.minutes += last.minutes;
    prev.endDistM = last.endDistM;
    // Recompute the clock: keeping the discarded day's end time would be wrong.
    prev.endAt = prev.startAt ? new Date(prev.startAt.getTime() + prev.minutes * 60000) : null;
  }
  return days;
}
