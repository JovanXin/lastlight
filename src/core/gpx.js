// Minimal, dependency-free GPX 1.0/1.1 reader and writer.

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function firstTag(xml, tag) {
  const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
  const m = xml.match(re);
  return m ? decodeEntities(m[1].trim()) : null;
}

function attr(tagText, name) {
  const re = new RegExp(name + "\\s*=\\s*\"([^\"]*)\"", "i");
  const m = tagText.match(re);
  return m ? m[1] : null;
}

// Parse track/route/waypoint points into a flat array of samples.
export function parseGpx(xml) {
  if (typeof xml !== "string") throw new TypeError("GPX input must be a string");
  const points = [];
  const re = /<(trkpt|rtept|wpt)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tagText = m[2] || "";
    const inner = m[3] || "";
    const lat = Number(attr(tagText, "lat"));
    const lon = Number(attr(tagText, "lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleMatch = inner.match(/<ele>([\s\S]*?)<\/ele>/i);
    const timeMatch = inner.match(/<time>([\s\S]*?)<\/time>/i);
    const nameMatch = inner.match(/<name>([\s\S]*?)<\/name>/i);
    const point = { lat: lat, lon: lon };
    if (eleMatch) point.ele = Number(eleMatch[1]);
    if (timeMatch) {
      const t = Date.parse(timeMatch[1]);
      if (!Number.isNaN(t)) point.time = new Date(t);
    }
    if (nameMatch) point.name = decodeEntities(nameMatch[1].trim());
    points.push(point);
  }
  return {
    name: firstTag(xml, "name"),
    description: firstTag(xml, "desc"),
    points: points,
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Serialise points to a standards-friendly GPX 1.1 track.
export function toGpx(points, meta) {
  const m = meta || {};
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Lastlight" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    "    <name>" + esc(m.name || "Lastlight route") + "</name>",
    m.description ? "    <desc>" + esc(m.description) + "</desc>" : null,
    "  </metadata>",
  ].filter(Boolean);

  // Waypoints carry the cue sheet: kilometre marks, the turnaround and any
  // escape points, so a watch can show them.
  (m.waypoints || []).forEach(function (w) {
    if (!Number.isFinite(Number(w.lat)) || !Number.isFinite(Number(w.lon))) return;
    lines.push('  <wpt lat="' + w.lat + '" lon="' + w.lon + '">');
    if (Number.isFinite(Number(w.ele))) lines.push("    <ele>" + Number(w.ele) + "</ele>");
    if (w.name) lines.push("    <name>" + esc(w.name) + "</name>");
    if (w.desc) lines.push("    <desc>" + esc(w.desc) + "</desc>");
    lines.push("  </wpt>");
  });

  lines.push("  <trk>", "    <name>" + esc(m.name || "Lastlight route") + "</name>", "    <trkseg>");
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    lines.push('      <trkpt lat="' + p.lat + '" lon="' + p.lon + '">');
    if (Number.isFinite(Number(p.ele))) lines.push("        <ele>" + Number(p.ele) + "</ele>");
    lines.push("      </trkpt>");
  }
  lines.push("    </trkseg>", "  </trk>", "</gpx>", "");
  return lines.join("\n");
}
