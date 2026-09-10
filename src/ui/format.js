// Small formatting helpers shared by the UI. Pure, no dependencies.

export function pad2(value) { return String(value).padStart(2, "0"); }

export function fmtKm(meters, digits) {
  const d = digits == null ? 2 : digits;
  return (meters / 1000).toFixed(d) + " km";
}

export function fmtMeters(meters) {
  return Math.round(meters).toLocaleString() + " m";
}

export function fmtElevation(meters) {
  return Math.round(meters).toLocaleString() + " m";
}

// Human duration: 4h 58m, 42m, 1h 05m. Accepts negative values.
export function fmtDuration(minutes) {
  if (!Number.isFinite(minutes)) return "\u2014";
  const neg = minutes < 0;
  const total = Math.abs(minutes);
  let h = Math.floor(total / 60);
  let m = Math.round(total % 60);
  if (m === 60) { h += 1; m = 0; }
  const body = h > 0 ? h + "h " + pad2(m) + "m" : m + "m";
  return (neg ? "-" : "") + body;
}

// Countdown: shows h:mm:ss style only when the horizon is close.
export function fmtCountdown(minutes) {
  if (!Number.isFinite(minutes)) return "\u2014";
  const neg = minutes < 0;
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const body = h > 0 ? pad2(h) + ":" + pad2(m) : pad2(m) + "m";
  return (neg ? "+" : "") + body;
}

export function fmtClock(date, withSeconds) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "\u2014";
  const base = pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  return withSeconds ? base + ":" + pad2(date.getSeconds()) : base;
}

export function fmtDayMonth(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return date.getDate() + " " + months[date.getMonth()];
}

export function dateToInputValue(date) {
  return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
}

export function timeToInputValue(date) {
  return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
}

export function inputValueToDate(dateStr, timeStr) {
  const d = dateStr ? dateStr.split("-").map(Number) : [];
  const t = timeStr ? timeStr.split(":").map(Number) : [];
  const now = new Date();
  return new Date(
    d[0] || now.getFullYear(),
    (d[1] ? d[1] - 1 : now.getMonth()),
    d[2] || now.getDate(),
    t[0] || 0,
    t[1] || 0,
    0, 0
  );
}

export function verdictLabel(verdict) {
  switch (verdict) {
    case "go": return "On track";
    case "caution": return "Start heading back soon";
    case "turn": return "Turn around now";
    case "past": return "Past turnaround";
    default: return "\u2014";
  }
}
