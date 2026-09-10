// Built-in demo routes. Tracks are generated from a handful of control
// points so the repo ships real geometry without any data files.
import { haversineMeters } from "../core/geo.js";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const METERS_PER_DEG_LAT = 111194.93;

// Smooth a sparse set of control points into a walkable track with a little
// natural wander and fine elevation detail.
export function buildTrack(controls, options) {
  const opts = options || {};
  const stepM = opts.stepM || 30;
  const wiggleM = opts.wiggleM == null ? 15 : opts.wiggleM;
  const rand = mulberry32(opts.seed == null ? 7 : opts.seed);
  const cosLat = Math.cos((controls[0].lat * Math.PI) / 180);

  const segs = [];
  let total = 0;
  for (let i = 0; i < controls.length - 1; i++) {
    const a = controls[i];
    const b = controls[i + 1];
    const len = haversineMeters(a, b);
    segs.push({ a: a, b: b, len: len, start: total });
    total += len;
  }

  const track = [];
  for (let d = 0; d < total; d += stepM) {
    let s = segs[segs.length - 1];
    for (let i = 0; i < segs.length; i++) {
      if (d >= segs[i].start && d <= segs[i].start + segs[i].len) { s = segs[i]; break; }
    }
    const t = s.len > 0 ? (d - s.start) / s.len : 0;
    const dLat = s.b.lat - s.a.lat;
    const dLon = (s.b.lon - s.a.lon) * cosLat;
    const nl = Math.hypot(dLat, dLon) || 1;
    // Two overlapping wavelengths give a naturally wandering line without the
    // high-frequency sawtooth that per-sample randomness produces.
    const wobble = Math.sin(d / 190 + rand() * 0.4) * 0.75 + Math.sin(d / 71 + 1.3) * 0.25;
    const off = wobble * wiggleM;
    let lat = s.a.lat + dLat * t + (off * -dLon) / (nl * METERS_PER_DEG_LAT);
    let lon = s.a.lon + dLon * t / cosLat + (off * dLat) / (nl * METERS_PER_DEG_LAT * cosLat);
    let ele = s.a.ele + (s.b.ele - s.a.ele) * t;
    ele += (Math.sin(d / 137) + 0.6 * Math.sin(d / 61) + 0.4 * Math.sin(d / 311)) * 3.2;
    track.push({ lat: lat, lon: lon, ele: ele });
  }
  const last = controls[controls.length - 1];
  track.push({ lat: last.lat, lon: last.lon, ele: last.ele });
  return track;
}

const RAW = [
  {
    id: "rangitoto",
    name: "Rangitoto Summit Track",
    region: "Auckland, Aotearoa",
    mode: "out-and-back",
    blurb: "A young volcanic cone in the Hauraki Gulf. Exposed lava fields, no water, big views.",
    seed: 11, wiggleM: 22,
    controls: [
      { lat: -36.7970, lon: 174.8790, ele: 0 },
      { lat: -36.7940, lon: 174.8740, ele: 50 },
      { lat: -36.7910, lon: 174.8690, ele: 120 },
      { lat: -36.7890, lon: 174.8650, ele: 180 },
      { lat: -36.7875, lon: 174.8610, ele: 230 },
      { lat: -36.7868, lon: 174.8575, ele: 260 },
    ],
    bailouts: [
      { name: "Islington Bay road end", lat: -36.7800, lon: 174.8550, ele: 8 },
      { name: "Ferry wharf", lat: -36.7895, lon: 174.8695, ele: 2 },
    ],
  },
  {
    id: "tongariro",
    name: "Tongariro Alpine Crossing",
    region: "Tongariro, Aotearoa",
    mode: "loop",
    blurb: "The classic one-way alpine traverse: lava flows, craters and emerald lakes.",
    seed: 23, wiggleM: 26,
    controls: [
      { lat: -39.1517, lon: 175.5936, ele: 1120 },
      { lat: -39.1465, lon: 175.6170, ele: 1270 },
      { lat: -39.1385, lon: 175.6320, ele: 1650 },
      { lat: -39.1339, lon: 175.6419, ele: 1886 },
      { lat: -39.1300, lon: 175.6450, ele: 1700 },
      { lat: -39.1230, lon: 175.6500, ele: 1730 },
      { lat: -39.1080, lon: 175.6530, ele: 1400 },
      { lat: -39.0950, lon: 175.6540, ele: 760 },
    ],
    bailouts: [
      { name: "Oturere Hut", lat: -39.1400, lon: 175.6700, ele: 1400 },
      { name: "Ketetahi car park", lat: -39.0950, lon: 175.6540, ele: 760 },
      { name: "Mangatepopo car park", lat: -39.1517, lon: 175.5936, ele: 1120 },
    ],
  },
  {
    id: "holdsworth",
    name: "Mount Holdsworth to Powell Hut",
    region: "Tararua Range, Aotearoa",
    mode: "out-and-back",
    blurb: "Bush climb to a high hut on the edge of the Tararua tops. Steep and relentless.",
    seed: 37, wiggleM: 18,
    controls: [
      { lat: -40.8833, lon: 175.4833, ele: 290 },
      { lat: -40.8760, lon: 175.4650, ele: 560 },
      { lat: -40.8700, lon: 175.4500, ele: 900 },
      { lat: -40.8667, lon: 175.4333, ele: 1240 },
    ],
    bailouts: [
      { name: "Atiwhakatu Hut", lat: -40.8800, lon: 175.4600, ele: 650 },
      { name: "Holdsworth Lodge", lat: -40.8833, lon: 175.4833, ele: 290 },
    ],
  },
  {
    id: "benlomond",
    name: "Ben Lomond Track",
    region: "Queenstown, Aotearoa",
    mode: "out-and-back",
    blurb: "Up from the gondola to a 1748 m summit above Lake Wakatipu. Big, exposed finish.",
    seed: 53, wiggleM: 20,
    controls: [
      { lat: -45.0312, lon: 168.6570, ele: 320 },
      { lat: -45.0280, lon: 168.6480, ele: 790 },
      { lat: -45.0180, lon: 168.6350, ele: 1100 },
      { lat: -45.0055, lon: 168.6160, ele: 1748 },
    ],
    bailouts: [
      { name: "One Mile Creek track", lat: -45.0250, lon: 168.6450, ele: 600 },
      { name: "Skyline base", lat: -45.0312, lon: 168.6570, ele: 320 },
    ],
  },
];

export const SAMPLE_ROUTES = RAW.map(function (r) {
  return Object.assign({}, r, {
    track: buildTrack(r.controls, { seed: r.seed, wiggleM: r.wiggleM, stepM: 30 }),
  });
});

export function findRoute(id) {
  return SAMPLE_ROUTES.find(function (r) { return r.id === id; }) || SAMPLE_ROUTES[0];
}
