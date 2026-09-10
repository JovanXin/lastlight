// Shared fixtures for the test suite.

const METERS_PER_DEG_LAT = 111194.93;

// A dead-straight north-south track with optional elevation ramp.
export function makeLineTrack(lengthM, options) {
  const opts = options || {};
  const step = opts.stepM == null ? 100 : opts.stepM;
  const baseLat = opts.lat == null ? -36.8 : opts.lat;
  const lon = opts.lon == null ? 174.7 : opts.lon;
  const gain = opts.gainM || 0;
  const track = [];
  for (let d = 0; d <= lengthM + 0.001; d += step) {
    const frac = lengthM > 0 ? Math.min(1, d / lengthM) : 0;
    track.push({ lat: baseLat + d / METERS_PER_DEG_LAT, lon: lon, ele: gain * frac });
  }
  return track;
}
