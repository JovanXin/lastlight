// Optional online enrichment: mountain weather and real elevations from
// Open-Meteo (no API key, CORS-friendly). Every call fails soft so the app
// keeps working offline.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_PREFIX = "lastlight:cache:";

const memory = new Map();

function cacheGet(key) {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.at < CACHE_TTL_MS) {
        memory.set(key, parsed);
        return parsed.value;
      }
    }
  } catch (err) { /* ignore */ }
  return null;
}

function cacheSet(key, value) {
  const entry = { at: Date.now(), value: value };
  memory.set(key, entry);
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)); } catch (err) { /* ignore */ }
}

// WMO weather interpretation codes.
const WMO = {
  0: { label: "Clear", icon: "\u2600\ufe0f" },
  1: { label: "Mainly clear", icon: "\ud83c\udf24\ufe0f" },
  2: { label: "Partly cloudy", icon: "\u26c5" },
  3: { label: "Overcast", icon: "\u2601\ufe0f" },
  45: { label: "Fog", icon: "\ud83c\udf2b\ufe0f" },
  48: { label: "Rime fog", icon: "\ud83c\udf2b\ufe0f" },
  51: { label: "Light drizzle", icon: "\ud83c\udf26\ufe0f" },
  53: { label: "Drizzle", icon: "\ud83c\udf26\ufe0f" },
  55: { label: "Heavy drizzle", icon: "\ud83c\udf26\ufe0f" },
  56: { label: "Freezing drizzle", icon: "\ud83c\udf28\ufe0f" },
  57: { label: "Freezing drizzle", icon: "\ud83c\udf28\ufe0f" },
  61: { label: "Light rain", icon: "\ud83c\udf27\ufe0f" },
  63: { label: "Rain", icon: "\ud83c\udf27\ufe0f" },
  65: { label: "Heavy rain", icon: "\ud83c\udf27\ufe0f" },
  66: { label: "Freezing rain", icon: "\ud83c\udf28\ufe0f" },
  67: { label: "Freezing rain", icon: "\ud83c\udf28\ufe0f" },
  71: { label: "Light snow", icon: "\ud83c\udf28\ufe0f" },
  73: { label: "Snow", icon: "\u2744\ufe0f" },
  75: { label: "Heavy snow", icon: "\u2744\ufe0f" },
  77: { label: "Snow grains", icon: "\ud83c\udf28\ufe0f" },
  80: { label: "Rain showers", icon: "\ud83c\udf26\ufe0f" },
  81: { label: "Rain showers", icon: "\ud83c\udf26\ufe0f" },
  82: { label: "Violent showers", icon: "\u26c8\ufe0f" },
  85: { label: "Snow showers", icon: "\ud83c\udf28\ufe0f" },
  86: { label: "Snow showers", icon: "\ud83c\udf28\ufe0f" },
  95: { label: "Thunderstorm", icon: "\u26c8\ufe0f" },
  96: { label: "Storm with hail", icon: "\u26c8\ufe0f" },
  99: { label: "Severe storm", icon: "\u26c8\ufe0f" },
};

export function describeCode(code) {
  return WMO[code] || { label: "Mixed", icon: "\ud83c\udf21\ufe0f" };
}

function toInstant(localTime, utcOffsetSeconds) {
  const ms = Date.parse(localTime + ":00Z");
  if (Number.isNaN(ms)) return NaN;
  return ms - utcOffsetSeconds * 1000;
}

// Reduce hourly data to the worst case inside the hike window.
export function summarizeWindow(hours, startMs, endMs) {
  const inWindow = hours.filter(function (h) {
    return h.atMs >= startMs && h.atMs <= endMs;
  });
  const use = inWindow.length ? inWindow : hours;
  if (!use.length) return null;
  let minTemp = Infinity;
  let maxTemp = -Infinity;
  let maxPrecip = 0;
  let maxWind = 0;
  let worst = 0;
  for (let i = 0; i < use.length; i++) {
    const h = use[i];
    if (Number.isFinite(h.tempC)) { minTemp = Math.min(minTemp, h.tempC); maxTemp = Math.max(maxTemp, h.tempC); }
    if (Number.isFinite(h.precipProb)) maxPrecip = Math.max(maxPrecip, h.precipProb);
    if (Number.isFinite(h.windKph)) maxWind = Math.max(maxWind, h.windKph);
    if (h.code > worst) worst = h.code;
  }
  return {
    hours: use.length,
    inWindow: inWindow.length,
    minTempC: minTemp === Infinity ? null : minTemp,
    maxTempC: maxTemp === -Infinity ? null : maxTemp,
    maxPrecipProb: maxPrecip,
    maxWindKph: maxWind,
    worstCode: worst,
    worst: describeCode(worst),
  };
}

function ymd(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + m + "-" + d;
}

export function forecastUrl(lat, lon, date) {
  const params = [
    "latitude=" + lat.toFixed(4),
    "longitude=" + lon.toFixed(4),
    "hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code",
    "timezone=auto",
    "start_date=" + ymd(date),
    "end_date=" + ymd(new Date(date.getTime() + 86400000)),
  ];
  return FORECAST_URL + "?" + params.join("&");
}

export async function fetchWeather(lat, lon, date) {
  const key = "w:" + lat.toFixed(3) + "," + lon.toFixed(3) + ":" + ymd(date);
  const cached = cacheGet(key);
  if (cached) return cached;
  const response = await fetch(forecastUrl(lat, lon, date));
  if (!response.ok) throw new Error("weather HTTP " + response.status);
  const data = await response.json();
  const offset = data.utc_offset_seconds || 0;
  const hourly = data.hourly || {};
  const times = hourly.time || [];
  const hours = times.map(function (t, i) {
    return {
      atMs: toInstant(t, offset),
      localTime: t,
      tempC: hourly.temperature_2m ? hourly.temperature_2m[i] : null,
      apparentC: hourly.apparent_temperature ? hourly.apparent_temperature[i] : null,
      precipProb: hourly.precipitation_probability ? hourly.precipitation_probability[i] : null,
      windKph: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
      code: hourly.weather_code ? hourly.weather_code[i] : 0,
    };
  });
  const result = { hours: hours, timezone: data.timezone, utcOffsetSeconds: offset };
  cacheSet(key, result);
  return result;
}

// Look up real terrain elevations for a list of points, in chunks.
export async function fetchElevations(points) {
  if (!points || !points.length) return [];
  const out = new Array(points.length);
  const chunk = 100;
  for (let start = 0; start < points.length; start += chunk) {
    const slice = points.slice(start, start + chunk);
    const key = "e:" + slice.map(function (p) { return p.lat.toFixed(3) + "," + p.lon.toFixed(3); }).join(";");
    let values = cacheGet(key);
    if (!values) {
      const url = ELEVATION_URL +
        "?latitude=" + slice.map(function (p) { return p.lat.toFixed(5); }).join(",") +
        "&longitude=" + slice.map(function (p) { return p.lon.toFixed(5); }).join(",");
      const response = await fetch(url);
      if (!response.ok) throw new Error("elevation HTTP " + response.status);
      const data = await response.json();
      values = data.elevation || [];
      cacheSet(key, values);
    }
    for (let i = 0; i < slice.length; i++) {
      out[start + i] = Number(values[i]);
    }
  }
  return out;
}
