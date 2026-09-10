// Multi-day planning: split a long traverse into stages that each end well
// before dark, with a hut or camp between them.

function dayStartDate(startMs, dayIndex, dayStartMinutes) {
  const base = new Date(startMs + dayIndex * 86400000);
  base.setHours(Math.floor(dayStartMinutes / 60), dayStartMinutes % 60, 0, 0);
  return base;
}

export function splitIntoDays(profile, schedule, options) {
  const opts = options || {};
  const dayLength = opts.dayLengthMinutes == null ? 600 : opts.dayLengthMinutes;
  const margin = opts.marginMinutes == null ? 30 : opts.marginMinutes;
  const dayStartMinutes = opts.dayStartMinutes == null ? 480 : opts.dayStartMinutes;
  const maxDays = opts.maxDays == null ? 60 : opts.maxDays;
  const usable = Math.max(30, dayLength - margin);
  const pts = schedule.points;
  const cum = schedule.cumulativeMinutes;
  const days = [];
  if (pts.length < 2) return days;

  let startIdx = 0;
  while (startIdx < pts.length - 1 && days.length < maxDays) {
    const base = cum[startIdx];
    let endIdx = startIdx;
    while (endIdx + 1 < pts.length && cum[endIdx + 1] - base <= usable) endIdx++;
    if (endIdx === startIdx) endIdx = Math.min(startIdx + 1, pts.length - 1);

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
  return days;
}
