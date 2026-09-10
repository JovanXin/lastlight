// A cue sheet: the planned points along a route with distance, elevation and
// arrival time, ready to print or load onto a GPS device.
import { pointAtDistance } from "./geo.js";
import { minutesAtDistance } from "./pace.js";

export function buildCueSheet(profile, schedule, options) {
  const opts = options || {};
  const intervalM = opts.intervalM == null ? 1000 : opts.intervalM;
  const startMs = opts.startMs == null ? null : opts.startMs;
  const cues = [];
  if (!profile.points.length) return cues;

  const add = function (dist, kind, name) {
    const p = pointAtDistance(profile, dist);
    const minutes = schedule ? minutesAtDistance(schedule, dist) : null;
    cues.push({
      distanceM: p.dist,
      lat: p.lat,
      lon: p.lon,
      ele: p.ele,
      minutes: minutes,
      at: startMs != null && minutes != null ? new Date(startMs + minutes * 60000) : null,
      kind: kind || "km",
      name: name || null,
    });
  };

  add(0, "start", "Start");
  for (let d = intervalM; d < profile.distanceM - intervalM * 0.25; d += intervalM) add(d, "km", null);
  add(profile.distanceM, "finish", "Finish");

  if (opts.turnaroundDistanceM != null &&
      opts.turnaroundDistanceM > 0 &&
      opts.turnaroundDistanceM < profile.distanceM) {
    add(opts.turnaroundDistanceM, "turnaround", "Turnaround");
  }
  (opts.bailouts || []).forEach(function (b) {
    if (b.routeDist == null) return;
    add(b.routeDist, "bailout", b.name || "Bailout");
  });

  cues.sort(function (a, b) { return a.distanceM - b.distanceM; });
  return cues;
}

function clock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return " --:--";
  return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
}

export function formatCueSheetText(cues, meta) {
  const m = meta || {};
  const lines = [];
  lines.push("LASTLIGHT CUE SHEET");
  lines.push((m.routeName || "Route") + " \u2014 " + (m.mode === "loop" ? "thru / loop" : "out and back"));
  lines.push("");
  lines.push("  Dist      Elev     Time    Note");
  cues.forEach(function (c) {
    const dist = (c.distanceM / 1000).toFixed(2).padStart(5) + " km";
    const ele = (c.ele == null ? "--" : String(Math.round(c.ele))).padStart(5) + " m";
    lines.push("  " + dist + "  " + ele + "  " + clock(c.at) + "   " + (c.name || ""));
  });
  lines.push("");
  lines.push(m.note || "Planned times only. Conditions change.");
  return lines.join("\n");
}
