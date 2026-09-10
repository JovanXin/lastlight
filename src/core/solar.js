// Daylight and twilight engine. Implements the standard low-precision solar
// position algorithm (NOAA / Astronomical Almanac), accurate to about a
// minute at mid-latitudes. Zero dependencies, works fully offline.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

// Apparent altitudes (degrees) that define each event. Sunrise/sunset use the
// standard -0.833 deg to account for refraction and the solar disc radius.
export const SOLAR_ALTITUDES = Object.freeze({
  sunrise: -0.833,
  civil: -6,
  nautical: -12,
  astronomical: -18,
});

function toJulian(date) { return date.valueOf() / DAY_MS - 0.5 + J1970; }
function fromJulian(j) { return new Date((j + 0.5 - J1970) * DAY_MS); }
function toDays(date) { return toJulian(date) - J2000; }

function solarMeanAnomaly(d) { return RAD * (357.5291 + 0.98560028 * d); }

function eclipticLongitude(m) {
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const perihelion = RAD * 102.9372;
  return m + c + perihelion + Math.PI;
}

function declination(lambda) {
  return Math.asin(Math.sin(OBLIQUITY) * Math.sin(lambda));
}

function julianCycle(d, lw) { return Math.round(d - 0.0009 - lw / (2 * Math.PI)); }
function approxTransit(ht, lw, n) { return 0.0009 + (ht + lw) / (2 * Math.PI) + n; }
function solarTransitJ(ds, m, l) { return J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l); }

function hourAngle(altitudeRad, latRad, decRad) {
  const cosH = (Math.sin(altitudeRad) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));
  if (cosH > 1 || cosH < -1) return null; // polar day or night
  return Math.acos(cosH);
}

// Returns every daylight event for one calendar instant at a location.
// Times are JS Dates (UTC instants). null means the event does not occur.
export function sunTimes(date, lat, lon) {
  const d = toDays(date);
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const jNoon = solarTransitJ(ds, m, l);

  const events = { solarNoon: fromJulian(jNoon) };
  const keys = [
    ["sunrise", SOLAR_ALTITUDES.sunrise, "sunset"],
    ["civilDawn", SOLAR_ALTITUDES.civil, "civilDusk"],
    ["nauticalDawn", SOLAR_ALTITUDES.nautical, "nauticalDusk"],
    ["astronomicalDawn", SOLAR_ALTITUDES.astronomical, "astronomicalDusk"],
  ];
  let polar = null;
  for (let i = 0; i < keys.length; i++) {
    const riseName = keys[i][0];
    const altRad = keys[i][1] * RAD;
    const setName = keys[i][2];
    const w = hourAngle(altRad, phi, dec);
    if (w === null) {
      events[riseName] = null;
      events[setName] = null;
      if (i === 0) {
        // Sun stays above or below the horizon all day.
        polar = Math.sin(altRad) - Math.sin(phi) * Math.sin(dec) < 0 ? "day" : "night";
      }
      continue;
    }
    const a = approxTransit(w, lw, n);
    const jSet = solarTransitJ(a, m, l);
    const jRise = jNoon - (jSet - jNoon);
    events[riseName] = fromJulian(jRise);
    events[setName] = fromJulian(jSet);
  }
  events.polar = polar;
  return events;
}

// The instant usable daylight ends for a hiker: sunset unless a twilight
// buffer is requested. Returns null during polar day.
export function usableDusk(date, lat, lon, bufferMinutes) {
  const t = sunTimes(date, lat, lon);
  const buffer = bufferMinutes || 0;
  if (t.polar === "day") return null;
  const base = t.sunset;
  if (!base) return null;
  return new Date(base.getTime() + buffer * 60000);
}

// Continuous estimate of sunrise/sunset for any moment (no Date rounding),
// used to show the shrinking daylight window day by day on a plan.
export function dayLengthMinutes(date, lat, lon) {
  const t = sunTimes(date, lat, lon);
  if (t.polar === "day") return 1440;
  if (t.polar === "night" || !t.sunrise || !t.sunset) return 0;
  return (t.sunset.getTime() - t.sunrise.getTime()) / 60000;
}
