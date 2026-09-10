// Offline persistence: saved trips in IndexedDB, the last session in
// localStorage. Every call degrades gracefully when storage is unavailable.

const DB_NAME = "lastlight";
const DB_VERSION = 1;
const TRIPS = "trips";
const SESSION_KEY = "lastlight:session";

function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function openDB() {
  return new Promise(function (resolve, reject) {
    if (!hasIndexedDB()) { reject(new Error("IndexedDB unavailable")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRIPS)) db.createObjectStore(TRIPS, { keyPath: "id" });
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

function tx(db, mode, fn) {
  return new Promise(function (resolve, reject) {
    const transaction = db.transaction(TRIPS, mode);
    const store = transaction.objectStore(TRIPS);
    let result;
    try { result = fn(store); } catch (err) { reject(err); return; }
    transaction.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : result); };
    transaction.onerror = function () { reject(transaction.error); };
  });
}

// ---- pure helpers (unit tested) ----

// Coerce an arbitrary object into a valid trip record, or throw.
export function normalizeTrip(raw) {
  if (!raw || typeof raw !== "object") throw new TypeError("trip must be an object");
  const track = Array.isArray(raw.track) ? raw.track.filter(function (p) {
    return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon));
  }).map(function (p) {
    return { lat: Number(p.lat), lon: Number(p.lon), ele: Number(p.ele) || 0 };
  }) : [];
  if (track.length < 2) throw new Error("trip needs at least two track points");
  const pace = raw.pace && typeof raw.pace === "object" ? raw.pace : {};
  return {
    id: String(raw.id || ("trip-" + Date.now().toString(36))),
    routeName: String(raw.routeName || "Untitled trip").slice(0, 120),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mode: raw.mode === "loop" ? "loop" : "out-and-back",
    track: track,
    bailoutPoints: Array.isArray(raw.bailoutPoints) ? raw.bailoutPoints : [],
    pace: {
      speedFactor: Number(pace.speedFactor) || 1,
      movingRatio: Number(pace.movingRatio) || 0.85,
    },
    safetyMargin: raw.safetyMargin == null ? 30 : Number(raw.safetyMargin),
    useCivil: raw.useCivil !== false,
    startTime: raw.startTime ? new Date(raw.startTime).toISOString() : null,
  };
}

export function tripSummary(trip) {
  let distanceM = 0;
  for (let i = 1; i < trip.track.length; i++) {
    const a = trip.track[i - 1];
    const b = trip.track[i];
    const dLat = (b.lat - a.lat) * 111194.93;
    const dLon = (b.lon - a.lon) * 111194.93 * Math.cos((a.lat * Math.PI) / 180);
    distanceM += Math.hypot(dLat, dLon);
  }
  return { points: trip.track.length, distanceM: distanceM };
}

// ---- session (last open trip) ----

export function saveSession(state) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch (err) { /* ignore */ }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) { return null; }
}

// ---- saved trips ----

export async function listTrips() {
  if (hasIndexedDB()) {
    try {
      const db = await openDB();
      const all = await tx(db, "readonly", function (store) { return store.getAll(); });
      db.close();
      return (all || []).sort(function (a, b) {
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      });
    } catch (err) { /* fall through to localStorage */ }
  }
  return legacyList();
}

export async function saveTrip(raw) {
  const trip = normalizeTrip(raw);
  if (hasIndexedDB()) {
    try {
      const db = await openDB();
      await tx(db, "readwrite", function (store) { return store.put(trip); });
      db.close();
      return trip;
    } catch (err) { /* fall through */ }
  }
  const list = legacyList().filter(function (t) { return t.id !== trip.id; });
  list.push(trip);
  try { localStorage.setItem(SESSION_KEY + ":trips", JSON.stringify(list)); } catch (err) { /* ignore */ }
  return trip;
}

export async function deleteTrip(id) {
  if (hasIndexedDB()) {
    try {
      const db = await openDB();
      await tx(db, "readwrite", function (store) { return store.delete(id); });
      db.close();
      return true;
    } catch (err) { /* fall through */ }
  }
  const list = legacyList().filter(function (t) { return t.id !== id; });
  try { localStorage.setItem(SESSION_KEY + ":trips", JSON.stringify(list)); } catch (err) { /* ignore */ }
  return true;
}

function legacyList() {
  try {
    const raw = localStorage.getItem(SESSION_KEY + ":trips");
    return raw ? JSON.parse(raw) : [];
  } catch (err) { return []; }
}
