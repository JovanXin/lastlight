// Lastlight application controller. Plain ES modules, no framework.
import { buildProfile, resample, pointAtDistance, haversineMeters } from "./core/geo.js";
import { buildSchedule, minutesAtDistance, distanceAtMinutes, sanitizePace } from "./core/pace.js";
import { analyzeOutAndBack, analyzeLoop, analyzeBailouts, returnMinutesAt, VERDICT } from "./core/turnaround.js";
import { sunTimes } from "./core/solar.js";
import { parseGpx, toGpx } from "./core/gpx.js";
import { SAMPLE_ROUTES, findRoute, buildTrack } from "./data/sample-routes.js";
import { createStore } from "./ui/store.js";
import { TrailMap } from "./ui/map.js";
import { ElevationProfile } from "./ui/profile.js";
import {
  fmtKm, fmtMeters, fmtDuration, fmtCountdown, fmtClock, fmtDayMonth,
  dateToInputValue, timeToInputValue, inputValueToDate, verdictLabel,
} from "./ui/format.js";
import { listTrips, saveTrip, deleteTrip, saveSession, loadSession, normalizeTrip, tripSummary } from "./services/storage.js";
import { fetchWeather, summarizeWindow, fetchElevations } from "./services/weather.js";
import { buildPlanText, drawShareCard } from "./ui/sharecard.js";

const $ = (id) => document.getElementById(id);

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function todayAt(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

const DEFAULT_ROUTE = findRoute("holdsworth");

const store = createStore({
  savedId: null,
  routeId: DEFAULT_ROUTE.id,
  routeName: DEFAULT_ROUTE.name,
  track: DEFAULT_ROUTE.track,
  bailoutPoints: DEFAULT_ROUTE.bailouts.slice(),
  mode: DEFAULT_ROUTE.mode,
  startTime: todayAt(8),
  pace: { speedFactor: 1, movingRatio: 0.85 },
  groupFactor: 1,
  safetyMargin: 30,
  useCivil: true,
  distanceNow: 0,
  delay: 0,
  simTime: todayAt(8),
  running: false,
  simSpeed: 60,
  simElapsed: 0,
  drawMode: false,
  weather: null,
  weatherStatus: "idle",
});

let derived = null;
let map = null;
let profileChart = null;
let simRAF = null;
let simLast = 0;
let simPlan = null;

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------
// Pace actually used for planning: the walker\u2019s pace, then scaled down to
// whatever the slowest person in the group can hold.
function effectivePace(s) {
  const base = s.pace || {};
  const factor = (Number(base.speedFactor) || 1) * (s.groupFactor == null ? 1 : Number(s.groupFactor));
  return sanitizePace(Object.assign({}, base, { speedFactor: factor }));
}

function computeDerived(s) {
  const raw = buildProfile(s.track, { smoothWindow: 3 });
  const profile = resample(raw, 20);
  const start = profile.points[0] || { lat: 0, lon: 0, ele: 0 };
  const sun = sunTimes(s.startTime, start.lat, start.lon);
  const dusk = s.useCivil ? (sun.civilDusk || sun.sunset) : (sun.sunset || sun.civilDusk);
  const pace = effectivePace(s);
  const outbound = buildSchedule(profile, pace);
  const inbound = buildSchedule(profile, pace, { reverse: true });

  const now = s.simTime;
  const common = {
    pace: pace,
    startTime: s.startTime,
    now: now,
    dusk: dusk,
    safetyMarginMinutes: s.safetyMargin,
    distanceNowM: s.distanceNow,
  };

  let analysis;
  if (s.mode === "out-and-back") {
    analysis = analyzeOutAndBack(profile, common);
  } else {
    analysis = analyzeLoop(profile, common);
  }

  const current = pointAtDistance(profile, s.distanceNow);
  const turnDist = s.mode === "out-and-back" ? analysis.turnaroundDistanceM : null;
  const turnaroundPoint = turnDist != null && turnDist > 0 && turnDist < profile.distanceM
    ? pointAtDistance(profile, turnDist) : null;

  const bailouts = analyzeBailouts(current || start, s.bailoutPoints || [], {
    pace: pace, now: now, dusk: dusk, safetyMarginMinutes: s.safetyMargin,
  }).map(function (item) {
    return Object.assign({}, item, { routeDist: nearestRouteDist(profile, item.bailout) });
  });

  const oneWay = profile.distanceM;
  const totals = s.mode === "out-and-back"
    ? { distanceM: oneWay * 2, minutes: outbound.totalMinutes + inbound.totalMinutes }
    : { distanceM: oneWay, minutes: outbound.totalMinutes };

  const endOfDay = dusk ? new Date(dusk.getTime() - s.safetyMargin * 60000) : null;

  return {
    raw: raw, profile: profile, sun: sun, dusk: dusk, outbound: outbound, inbound: inbound,
    analysis: analysis, current: current, turnaroundPoint: turnaroundPoint, turnDist: turnDist,
    bailouts: bailouts, totals: totals,
    turnaroundDeadline: analysis.deadlineToReachTurn || null,
    backBy: endOfDay,
  };
}

function nearestRouteDist(profile, point) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < profile.points.length; i++) {
    const p = profile.points[i];
    const d = (p.lat - point.lat) * (p.lat - point.lat) + (p.lon - point.lon) * (p.lon - point.lon);
    if (d < bestD) { bestD = d; best = p.dist; }
  }
  return best;
}

// Scenario clock for a position: the planned arrival time, offset by however
// far behind (or ahead of) schedule the hiker is.
function clockForPosition(s, distanceM) {
  const outbound = buildSchedule(resample(buildProfile(s.track, { smoothWindow: 3 }), 20), effectivePace(s));
  const mins = minutesAtDistance(outbound, distanceM) + (s.delay || 0);
  return new Date(s.startTime.getTime() + mins * 60000);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  const s = store.get();
  derived = computeDerived(s);
  renderHUD(s);
  renderVerdict(s);
  renderTurnaroundCard(s);
  renderStats(s);
  renderBailouts(s);
  renderDaylight(s);
  renderConditions(s);
  renderMap(s);
  renderProfileChart(s);
  renderStatus(s);
}

function renderHUD(s) {
  const a = derived.analysis;
  const hud = $("hud");
  hud.dataset.verdict = a.verdict;
  if (s.mode === "out-and-back") {
    $("hud-label").textContent = a.minutesUntilTurnaround == null ? "Daylight" : (a.minutesUntilTurnaround < 0 ? "Past turnaround" : "Turn in");
    $("hud-time").textContent = a.minutesUntilTurnaround == null ? "\u221e" : fmtCountdown(a.minutesUntilTurnaround);
    $("hud-sub").textContent = derived.turnaroundDeadline
      ? "turn at " + fmtKm(a.turnaroundDistanceM, 1) + " · start back by " + fmtClock(derived.turnaroundDeadline)
      : "no turnaround available";
  } else {
    $("hud-label").textContent = "Slack";
    $("hud-time").textContent = fmtCountdown(a.slackMinutes);
    $("hud-sub").textContent = "finish by " + fmtClock(derived.dusk) + " · " + fmtKm(derived.totals.distanceM, 1) + " route";
  }
  const speedNow = currentSpeed(s);
  $("hud-meta").textContent = fmtKm(s.distanceNow, 1) + " / " + fmtKm(derived.totals.distanceM, 1) +
    " · " + speedNow + " · " + fmtClock(s.simTime);
}

function currentSpeed(s) {
  const grade = derived.outbound.gradeAt ? derived.outbound.gradeAt(s.distanceNow) : 0;
  return (6 * Math.exp(-3.5 * Math.abs(grade + 0.05)) * effectivePace(s).speedFactor).toFixed(1) + " km/h";
}

function renderVerdict(s) {
  const a = derived.analysis;
  const card = $("verdict-card");
  card.dataset.verdict = a.verdict;
  $("verdict-kicker").textContent = s.mode === "out-and-back" ? "Out and back" : "Thru / loop";
  $("verdict-title").textContent = verdictLabel(a.verdict);
  let sub;
  if (s.mode === "out-and-back") {
    if (a.minutesUntilTurnaround == null) {
      sub = "Midnight sun: no darkness to beat today.";
    } else if (a.minutesUntilTurnaround < 0) {
      sub = "You are " + fmtDuration(-a.minutesUntilTurnaround) + " past the latest safe turnaround.";
    } else {
      sub = fmtDuration(a.minutesUntilTurnaround) + " of moving time left before you must turn.";
    }
  } else {
    sub = (a.slackMinutes >= 0 ? fmtDuration(a.slackMinutes) + " of slack" : fmtDuration(-a.slackMinutes) + " short") +
      " against the daylight left.";
  }
  $("verdict-sub").textContent = sub;
  const meter = $("verdict-meter");
  let pct;
  if (s.mode === "out-and-back") {
    pct = a.minutesUntilTurnaround == null ? 100 : clamp((a.minutesUntilTurnaround / Math.max(60, s.safetyMargin * 2)) * 100, 0, 100);
  } else {
    const ref = Math.max(60, derived.totals.minutes * 0.3);
    pct = clamp((a.slackMinutes / ref) * 100, 0, 100);
  }
  meter.style.width = pct.toFixed(0) + "%";
  meter.style.background = "var(--" + (a.verdict === "go" ? "go" : a.verdict === "caution" ? "caution" : a.verdict === "turn" ? "turn" : "past") + ")";
}

function setKV(id, label, value) {
  const dd = $(id);
  dd.textContent = value;
  const dt = dd.previousElementSibling;
  if (dt && label) dt.textContent = label;
}

function renderTurnaroundCard(s) {
  const a = derived.analysis;
  const bigLabel = $("ta-distance").nextElementSibling;
  if (s.mode === "out-and-back") {
    bigLabel.textContent = "furthest safe point";
    $("ta-distance").textContent = fmtKm(a.turnaroundDistanceM, 2);
    setKV("ta-time", "Reach it by", derived.turnaroundDeadline ? fmtClock(derived.turnaroundDeadline) : "\u2014");
    setKV("ta-back", "Back at trailhead", derived.backBy ? fmtClock(derived.backBy) : "\u2014");
  } else {
    bigLabel.textContent = "route length";
    $("ta-distance").textContent = fmtKm(derived.profile.distanceM, 2);
    setKV("ta-time", "Finish by", derived.dusk ? fmtClock(derived.dusk) : "\u2014");
    setKV("ta-back", "Margin", fmtDuration(s.safetyMargin));
  }
  setKV("ta-daylight", "Daylight left", derived.dusk ? fmtDuration((derived.dusk - s.simTime) / 60000) : "polar day");
}

function renderStats(s) {
  $("stat-distance").textContent = fmtKm(derived.totals.distanceM, 2);
  const g = derived.profile;
  const oneGain = sumGain(g);
  const oneLoss = sumLoss(g);
  if (s.mode === "out-and-back") {
    $("stat-ascent").textContent = fmtMeters(oneGain + oneLoss);
    $("stat-descent").textContent = fmtMeters(oneLoss + oneGain);
  } else {
    $("stat-ascent").textContent = fmtMeters(oneGain);
    $("stat-descent").textContent = fmtMeters(oneLoss);
  }
  $("stat-time").textContent = fmtDuration(derived.totals.minutes);
}

let _gainCache = { key: null, gain: 0, loss: 0 };
function gains(profile) {
  if (_gainCache.key === profile) return _gainCache;
  let gain = 0;
  let loss = 0;
  let anchor = profile.points.length ? profile.points[0].ele : 0;
  for (let i = 1; i < profile.points.length; i++) {
    const delta = profile.points[i].ele - anchor;
    if (Math.abs(delta) >= 2) {
      if (delta > 0) gain += delta; else loss += -delta;
      anchor = profile.points[i].ele;
    }
  }
  _gainCache = { key: profile, gain: gain, loss: loss };
  return _gainCache;
}
function sumGain(profile) { return gains(profile).gain; }
function sumLoss(profile) { return gains(profile).loss; }

function renderBailouts(s) {
  const list = $("bailout-list");
  const items = derived.bailouts.slice(0, 7);
  $("bailout-count").textContent = String(derived.bailouts.length);
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<li><span class="bailout-detail">No bailout points for this route yet.</span></li>';
    return;
  }
  items.forEach(function (b) {
    const li = document.createElement("li");
    if (b.reachable === false) li.className = "is-unreachable";
    const name = document.createElement("span");
    name.className = "bailout-name";
    name.textContent = b.bailout.name || "Bailout";
    const eta = document.createElement("span");
    eta.className = "bailout-eta " + (b.reachable ? "ok" : "warn");
    eta.innerHTML = "<b>" + fmtDuration(b.minutes) + "</b><small>" + (b.reachable ? "in time" : "too late") + "</small>";
    const detail = document.createElement("span");
    detail.className = "bailout-detail";
    detail.textContent = fmtKm(b.straightLineM, 2) + " away · " + (b.ascentM > 5 ? "+" + Math.round(b.ascentM) + " m" : "descent") +
      (b.slackMinutes != null ? " · slack " + fmtDuration(b.slackMinutes) : "");
    li.appendChild(name);
    li.appendChild(eta);
    li.appendChild(detail);
    list.appendChild(li);
  });
}

function renderDaylight(s) {
  const sun = derived.sun;
  const badge = $("daylight-text");
  if (!sun.sunrise || !sun.sunset) {
    badge.textContent = sun.polar === "day" ? "midnight sun" : "polar night";
    return;
  }
  const dayLen = (sun.sunset - sun.sunrise) / 60000;
  badge.textContent = fmtClock(sun.sunrise) + " \u2192 " + fmtClock(sun.sunset) + " · " + fmtDuration(dayLen) + " daylight";
}

function renderMap(s) {
  if (!map) return;
  map.setRoute(derived.profile.points, derived.profile);
  map.setPosition(s.distanceNow, derived.profile);
  map.setTurnaround(derived.turnaroundPoint);
  map.setBailouts(derived.bailouts.map(function (b) {
    return { lat: b.bailout.lat, lon: b.bailout.lon, name: b.bailout.name, reachable: b.reachable };
  }));
  map.render();
}

function renderProfileChart(s) {
  if (!profileChart) return;
  profileChart.setData(derived.profile, {
    turnaroundDist: s.mode === "out-and-back" ? derived.turnDist : null,
    bailouts: derived.bailouts.map(function (b) {
      return { routeDist: b.routeDist, reachable: b.reachable, name: b.bailout.name };
    }),
    positionDist: s.distanceNow,
  });
  profileChart.setPosition(s.distanceNow);
  $("profile-meta").textContent = fmtKm(derived.profile.distanceM, 2) + " one way · " +
    fmtMeters(sumGain(derived.profile)) + " up · high point " +
    fmtMeters(Math.max.apply(null, derived.profile.points.map(function (p) { return p.ele; })));
}

let statusFlashUntil = 0;

// Show a temporary message in the status bar without the next render erasing it.
function flashStatus(text) {
  $("status").textContent = text;
  statusFlashUntil = Date.now() + 7000;
}

function shareModel(s) {
  const a = derived.analysis;
  const g = sumGain(derived.profile);
  const l = sumLoss(derived.profile);
  return {
    routeName: s.routeName,
    mode: s.mode,
    distanceM: derived.totals.distanceM,
    ascentM: s.mode === "out-and-back" ? g + l : g,
    startTime: s.startTime,
    sunrise: derived.sun.sunrise,
    sunset: derived.sun.sunset,
    dusk: derived.dusk,
    turnaroundDistanceM: s.mode === "out-and-back" ? a.turnaroundDistanceM : null,
    deadline: derived.turnaroundDeadline,
    backBy: derived.backBy,
    verdict: a.verdict,
    bailouts: derived.bailouts.slice(0, 4).map(function (b) {
      return { name: b.bailout.name, minutes: b.minutes, reachable: b.reachable };
    }),
    profile: derived.profile,
  };
}

function renderStatus(s) {
  if (Date.now() < statusFlashUntil) return;
  const a = derived.analysis;
  const bits = [];
  bits.push(s.routeName);
  bits.push(s.mode === "out-and-back" ? "out and back" : "thru / loop");
  bits.push("scenario " + fmtDayMonth(s.simTime) + " " + fmtClock(s.simTime));
  if (s.mode === "out-and-back" && a.minutesUntilTurnaround != null) {
    bits.push(a.minutesUntilTurnaround >= 0
      ? "reach turnaround by " + fmtClock(derived.turnaroundDeadline)
      : "overdue by " + fmtDuration(-a.minutesUntilTurnaround));
  }
  $("status").textContent = bits.join("  ·  ");
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function startHike() {
  const s = store.get();
  derived = computeDerived(s);
  const a = derived.analysis;
  const turnDist = s.mode === "out-and-back" ? a.turnaroundDistanceM : derived.profile.distanceM;
  simPlan = {
    turnDist: turnDist,
    turnAtMinutes: minutesAtDistance(derived.outbound, turnDist),
    returnMinutes: returnMinutesAt(derived.inbound, turnDist),
  };
  const startMs = s.startTime.getTime();
  store.set({ running: true, simElapsed: 0, distanceNow: 0, simTime: new Date(startMs) });
  simLast = performance.now();
  if (!simRAF) simRAF = requestAnimationFrame(simStep);
  $("hud").dataset.verdict = "go";
}

function stopHike() {
  store.set({ running: false });
  if (simRAF) { cancelAnimationFrame(simRAF); simRAF = null; }
}

function simStep(t) {
  const s = store.get();
  if (!s.running) { simRAF = null; return; }
  const dt = Math.min(0.3, (t - simLast) / 1000);
  simLast = t;
  const elapsed = (s.simElapsed || 0) + (dt * s.simSpeed) / 60;
  const atTurn = simPlan ? simPlan.turnAtMinutes : 0;
  const back = simPlan ? simPlan.returnMinutes : 0;
  const startMs = s.startTime.getTime();
  let distance;
  let done = false;
  if (elapsed <= atTurn) {
    distance = distanceAtMinutes(derived.outbound, elapsed);
  } else if (elapsed <= atTurn + back && back > 0) {
    const f = (elapsed - atTurn) / back;
    distance = simPlan.turnDist * (1 - f);
  } else {
    distance = 0;
    done = true;
  }
  store.set({
    simElapsed: elapsed,
    simTime: new Date(startMs + elapsed * 60000),
    distanceNow: Math.max(0, distance),
  });
  if (done) {
    stopHike();
    store.set({ distanceNow: 0, simElapsed: 0 });
    $("btn-hike").textContent = "\u25b6 Run hike";
    return;
  }
  simRAF = requestAnimationFrame(simStep);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function attachRange(el, out, format, onChange) {
  const update = function (fire) {
    const min = Number(el.min);
    const max = Number(el.max);
    const val = Number(el.value);
    el.style.setProperty("--fill", ((val - min) / (max - min) * 100) + "%");
    out.textContent = format(val);
    if (fire) onChange(val);
  };
  el.addEventListener("input", function () { update(true); });
  update(false);
}

function setMode(mode) {
  store.set({ mode: mode, distanceNow: 0, simElapsed: 0, simTime: store.get().startTime });
  Array.prototype.forEach.call($("mode-buttons").children, function (b) {
    b.classList.toggle("is-active", b.dataset.mode === mode);
  });
}

function loadRoute(route, fit) {
  stopHike();
  store.set({
    savedId: null,
    routeId: route.id, routeName: route.name, track: route.track,
    bailoutPoints: (route.bailouts || []).slice(),
    mode: route.mode || "out-and-back",
    distanceNow: 0, simElapsed: 0, simTime: store.get().startTime, running: false,
  });
  Array.prototype.forEach.call($("mode-buttons").children, function (b) {
    b.classList.toggle("is-active", b.dataset.mode === store.get().mode);
  });
  $("btn-hike").textContent = "\u25b6 Run hike";
  if (fit !== false && map) {
    map.fitTo(route.track);
    map.render();
  }
  scheduleWeather();
}

function wire() {
  const select = $("route-select");
  SAMPLE_ROUTES.forEach(function (r) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name + " — " + r.region;
    select.appendChild(opt);
  });
  select.value = DEFAULT_ROUTE.id;
  select.addEventListener("change", function () {
    loadRoute(findRoute(select.value), true);
  });

  $("start-date").value = dateToInputValue(store.get().startTime);
  $("start-time").value = timeToInputValue(store.get().startTime);
  const onTimeChange = function () {
    const start = inputValueToDate($("start-date").value, $("start-time").value);
    const s = store.get();
    const clock = clockForPosition(s, s.distanceNow);
    store.set({ startTime: start, simTime: clock, simElapsed: 0 });
    scheduleWeather();
  };
  $("start-date").addEventListener("change", onTimeChange);
  $("start-time").addEventListener("change", onTimeChange);

  attachRange($("safety-margin"), $("safety-margin-out"), function (v) { return v + " min"; }, function (v) {
    store.set({ safetyMargin: v });
  });
  $("use-civil").addEventListener("change", function (e) { store.set({ useCivil: e.target.checked }); });

  attachRange($("speed-factor"), $("speed-factor-out"), function (v) { return v.toFixed(2) + "\u00d7"; }, function (v) {
    store.set({ pace: Object.assign({}, store.get().pace, { speedFactor: v }) });
  });
  attachRange($("moving-ratio"), $("moving-ratio-out"), function (v) { return Math.round(v * 100) + "%"; }, function (v) {
    store.set({ pace: Object.assign({}, store.get().pace, { movingRatio: v }) });
  });
  attachRange($("group-factor"), $("group-out"), function (v) {
    return v >= 0.999 ? "solo" : Math.round(v * 100) + "% of best";
  }, function (v) {
    store.set({ groupFactor: v });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".chip[data-pace]"), function (chip) {
    chip.addEventListener("click", function () {
      const v = Number(chip.dataset.pace);
      $("speed-factor").value = String(v);
      $("speed-factor").dispatchEvent(new Event("input"));
    });
  });

  const dist = $("distance-now");
  dist.max = "1000";
  const onScrub = function (val, fire) {
    const s = store.get();
    const total = derived ? derived.profile.distanceM : 0;
    const d = (val / 1000) * total;
    if (fire) {
      stopHike();
      $("btn-hike").textContent = "\u25b6 Run hike";
      store.set({ distanceNow: d, simTime: clockForPosition(s, d), simElapsed: 0 });
    }
  };
  attachRange(dist, $("distance-now-out"), function (v) {
    const total = derived ? derived.profile.distanceM : 0;
    return fmtKm((v / 1000) * total, 1);
  }, function (v) { onScrub(v, true); });

  attachRange($("delay"), $("delay-out"), function (v) {
    if (v === 0) return "on time";
    return v > 0 ? "+" + fmtDuration(v) + " behind" : fmtDuration(-v) + " ahead";
  }, function (v) {
    const s = store.get();
    const next = Object.assign({}, s, { delay: v });
    store.set({ delay: v, simTime: clockForPosition(next, s.distanceNow) });
  });

  $("btn-hike").addEventListener("click", function () {
    if (store.get().running) {
      stopHike();
      $("btn-hike").textContent = "\u25b6 Run hike";
    } else {
      startHike();
      $("btn-hike").textContent = "\u23f8 Pause";
    }
  });
  $("btn-reset").addEventListener("click", function () {
    stopHike();
    store.set({ distanceNow: 0, delay: 0, simElapsed: 0, simTime: store.get().startTime });
    $("delay").value = "0";
    $("delay").dispatchEvent(new Event("input"));
    $("btn-hike").textContent = "\u25b6 Run hike";
  });
  $("sim-speed").addEventListener("change", function (e) { store.set({ simSpeed: Number(e.target.value) }); });

  if (profileChart) {
    profileChart.onScrub = function (d) {
      stopHike();
      $("btn-hike").textContent = "\u25b6 Run hike";
      const s = store.get();
      store.set({ distanceNow: d, simTime: clockForPosition(s, d), simElapsed: 0 });
    };
  }

  // map controls
  $("zoom-in").addEventListener("click", function () { map.zoomBy(1); });
  $("zoom-out").addEventListener("click", function () { map.zoomBy(-1); });
  const fit = function () { map.fitTo(derived ? derived.profile.points : store.get().track); map.render(); };
  $("btn-fit").addEventListener("click", fit);
  $("btn-fit2").addEventListener("click", fit);

  // draw mode
  $("btn-draw").addEventListener("click", function () {
    const next = !store.get().drawMode;
    store.set({ drawMode: next });
    map.drawMode = next;
    map.drawPoints = [];
    map.route = [];
    map.routeProfile = null;
    $("btn-draw").classList.toggle("primary", next);
    $("btn-draw").textContent = next ? "Drawing…" : "Draw on map";
    $("map-hint").hidden = !next;
    $("draw-hint").textContent = next
      ? "Click the map to add points. Double-click to finish."
      : "Click the map to add points. Double-click to finish.";
    map.render();
  });
  map.onMapClick = function (lat, lon) {
    const s = store.get();
    if (!s.drawMode) return;
    map.drawPoints.push({ lat: lat, lon: lon, ele: estimateEle(lat, lon) });
    map.route = map.drawPoints.slice();
    map.routeProfile = null;
    map.render();
  };
  map.onDrawFinish = function () {
    const s = store.get();
    const pts = dedupe(map.drawPoints, 8);
    if (pts.length < 2) { exitDraw(); return; }
    const track = buildTrack(pts, { stepM: 30, wiggleM: 6, seed: 5 });
    exitDraw();
    loadRoute({
      id: "custom", name: "Drawn route", mode: s.mode,
      track: track,
      bailouts: [{ name: "Start", lat: track[0].lat, lon: track[0].lon, ele: track[0].ele }],
    }, true);
  };

  $("btn-elevation").addEventListener("click", async function () {
    const s = store.get();
    if (!s.track || s.track.length < 2) { flashStatus("Draw or import a route first."); return; }
    flashStatus("Looking up real elevations\u2026");
    try {
      const eles = await fetchElevations(s.track);
      const track = s.track.map(function (p, i) {
        return { lat: p.lat, lon: p.lon, ele: Number.isFinite(eles[i]) ? eles[i] : (Number(p.ele) || 0) };
      });
      store.set({ track: track });
      flashStatus("Applied real elevations to " + track.length + " points.");
    } catch (err) {
      flashStatus("Elevation lookup failed: " + err.message);
    }
  });

  // GPX
  $("btn-import").addEventListener("click", function () { $("file-gpx").click(); });
  $("file-gpx").addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const g = parseGpx(String(reader.result));
        if (!g.points.length) throw new Error("No track points found");
        const track = g.points.map(function (p, i) {
          const ele = Number.isFinite(Number(p.ele)) ? Number(p.ele) : fallbackEle(i, g.points.length);
          return { lat: p.lat, lon: p.lon, ele: ele };
        });
        loadRoute({
          id: "imported", name: g.name || file.name.replace(/\.[^.]+$/, ""), mode: store.get().mode,
          track: track,
          bailouts: [{ name: "Start", lat: track[0].lat, lon: track[0].lon, ele: track[0].ele }],
        }, true);
        flashStatus("Imported " + track.length + " points from " + file.name);
      } catch (err) {
        flashStatus("GPX import failed: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });
  $("btn-export").addEventListener("click", function () {
    const s = store.get();
    const xml = toGpx(s.track, { name: s.routeName, description: "Exported from Lastlight" });
    const blob = new Blob([xml], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (s.routeName || "route").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".gpx";
    a.click();
    URL.revokeObjectURL(url);
  });
  $("btn-clear").addEventListener("click", function () {
    stopHike();
    store.set({ routeId: "", routeName: "Untitled route", track: [], bailoutPoints: [], distanceNow: 0, simTime: store.get().startTime });
    flashStatus("Route cleared. Draw one on the map or import a GPX.");
  });

  $("btn-save-trip").addEventListener("click", async function () {
    const s = store.get();
    if (!s.track || s.track.length < 2) { flashStatus("Nothing to save yet."); return; }
    const name = ($("trip-name").value || s.routeName || "Untitled trip").trim();
    try {
      const saved = await saveTrip(Object.assign(snapshotTrip(s), { id: s.savedId || undefined, routeName: name }));
      store.set({ savedId: saved.id, routeName: saved.routeName });
      await renderTripList();
      flashStatus("Saved \"" + saved.routeName + "\".");
    } catch (err) {
      flashStatus("Save failed: " + err.message);
    }
  });
  $("trip-list").addEventListener("click", async function (ev) {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "load") {
      const trip = tripCache.find(function (t) { return t.id === id; });
      if (trip && applyTrip(trip, true)) flashStatus("Loaded \"" + trip.routeName + "\".");
    } else if (btn.dataset.action === "delete") {
      await deleteTrip(id);
      await renderTripList();
      flashStatus("Deleted saved trip.");
    }
  });

  const tripsModal = $("trips-modal");
  const shareModal = $("share-modal");
  let shareData = null;
  $("btn-share").addEventListener("click", function () {
    shareData = shareModel(store.get());
    drawShareCard($("share-canvas"), shareData);
    shareModal.hidden = false;
    if (navigator.share) $("share-native").hidden = false;
  });
  $("share-close").addEventListener("click", function () { shareModal.hidden = true; });
  shareModal.addEventListener("click", function (ev) {
    if (ev.target === shareModal) shareModal.hidden = true;
  });
  $("share-download").addEventListener("click", function () {
    $("share-canvas").toBlob(function (blob) {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (store.get().routeName || "lastlight").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-plan.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  });
  $("share-copy").addEventListener("click", async function () {
    if (!shareData) return;
    try {
      await navigator.clipboard.writeText(buildPlanText(shareData));
      flashStatus("Copied the trip plan to the clipboard.");
    } catch (err) {
      flashStatus("Copy failed: " + err.message);
    }
  });
  $("share-native").addEventListener("click", async function () {
    if (!shareData) return;
    try {
      await navigator.share({ title: shareData.routeName || "Lastlight plan", text: buildPlanText(shareData) });
    } catch (err) { /* cancelled */ }
  });
  $("btn-trips").addEventListener("click", function () {
    tripsModal.hidden = false;
    renderTripList();
    $("trip-name").focus();
  });
  $("trips-close").addEventListener("click", function () { tripsModal.hidden = true; });
  tripsModal.addEventListener("click", function (ev) {
    if (ev.target === tripsModal) tripsModal.hidden = true;
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    tripsModal.hidden = true;
    $("share-modal").hidden = true;
  });

  $("network-pill").hidden = navigator.onLine;
  window.addEventListener("online", function () { $("network-pill").hidden = true; });
  window.addEventListener("offline", function () { $("network-pill").hidden = false; });
}

function exitDraw() {
  store.set({ drawMode: false });
  map.drawMode = false;
  $("btn-draw").classList.remove("primary");
  $("btn-draw").textContent = "Draw on map";
  $("map-hint").hidden = true;
}

function estimateEle(lat, lon) {
  // Offline guess: a gentle deterministic field so a drawn route still has relief.
  return 120 + 80 * Math.sin(lat * 12) + 60 * Math.cos(lon * 9);
}

function dedupe(points, minMeters) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!out.length || haversineMeters(out[out.length - 1], p) >= minMeters) out.push(p);
  }
  return out;
}

// Smooth synthetic relief for a GPX that carries no elevation values.
function fallbackEle(i, n) {
  return 120 + 60 * Math.sin((i / Math.max(1, n)) * Math.PI * 2);
}

// ---------------------------------------------------------------------------
// Optional online data: forecast and real elevations
// ---------------------------------------------------------------------------
let weatherTimer = null;
let weatherToken = 0;

function scheduleWeather() {
  clearTimeout(weatherTimer);
  weatherTimer = setTimeout(loadWeather, 700);
}

async function loadWeather() {
  const s = store.get();
  if (!s.track || s.track.length < 2) {
    store.set({ weather: null, weatherStatus: "idle" });
    return;
  }
  const start = s.track[0];
  const token = ++weatherToken;
  store.set({ weatherStatus: "loading" });
  try {
    const data = await fetchWeather(start.lat, start.lon, s.startTime);
    if (token !== weatherToken) return;
    store.set({ weather: data, weatherStatus: "ready" });
  } catch (err) {
    if (token !== weatherToken) return;
    store.set({ weather: null, weatherStatus: "error" });
  }
}

function conditionNote(summary) {
  if (!summary) return "";
  if (summary.worstCode >= 95) return "Thunderstorms possible \u2014 avoid exposed ridges.";
  if (summary.maxWindKph >= 60) return "Strong wind \u2014 expect difficult travel on exposed tops.";
  if (summary.maxPrecipProb >= 60) return "Rain likely \u2014 pack shells and expect slick rock.";
  if (summary.minTempC != null && summary.minTempC <= 2) return "Near freezing \u2014 watch for ice.";
  if (summary.maxWindKph >= 40) return "Breezy \u2014 a windproof layer will earn its place.";
  return "";
}

function renderConditions(s) {
  const status = $("conditions-status");
  if (s.weatherStatus === "loading") status.textContent = "loading";
  else if (s.weatherStatus === "ready" && s.weather) status.textContent = "live";
  else if (s.weatherStatus === "error") status.textContent = "offline";
  else status.textContent = "\u2014";

  const end = derived.dusk || new Date(s.startTime.getTime() + 12 * 3600000);
  const summary = s.weather && s.weatherStatus === "ready"
    ? summarizeWindow(s.weather.hours, s.startTime.getTime(), end.getTime())
    : null;
  if (!summary) {
    $("cond-icon").textContent = s.weatherStatus === "error" ? "\ud83d\udcf4" : "\u00b7";
    $("cond-temp").textContent = "\u2014";
    $("cond-label").textContent = s.weatherStatus === "error" ? "forecast unavailable offline" : "waiting for a route";
    $("cond-rain").textContent = "\u2014";
    $("cond-wind").textContent = "\u2014";
    $("cond-feels").textContent = "\u2014";
    $("cond-note").textContent = "";
    return;
  }
  $("cond-icon").textContent = summary.worst.icon;
  $("cond-temp").textContent = (summary.minTempC == null ? "?" : Math.round(summary.minTempC)) + "\u00b0 / " +
    (summary.maxTempC == null ? "?" : Math.round(summary.maxTempC)) + "\u00b0";
  $("cond-label").textContent = summary.worst.label;
  $("cond-rain").textContent = Math.round(summary.maxPrecipProb) + "%";
  $("cond-wind").textContent = Math.round(summary.maxWindKph) + " km/h";
  $("cond-feels").textContent = summary.minApparentC == null ? "\u2014"
    : Math.round(summary.minApparentC) + "\u00b0 to " + Math.round(summary.maxApparentC) + "\u00b0";
  $("cond-note").textContent = conditionNote(summary);
}

// ---------------------------------------------------------------------------
// Persistence: saved trips and session restore
// ---------------------------------------------------------------------------
function snapshotTrip(s) {
  return {
    id: s.savedId || undefined,
    routeName: s.routeName,
    mode: s.mode,
    track: s.track,
    bailoutPoints: s.bailoutPoints,
    pace: s.pace,
    groupFactor: s.groupFactor,
    safetyMargin: s.safetyMargin,
    useCivil: s.useCivil,
    startTime: s.startTime.toISOString(),
  };
}

function tripPayload(s) {
  return (s.track || []).map(function (p) { return { lat: p.lat, lon: p.lon, ele: p.ele }; });
}

function setRangeValue(el, value) {
  if (!el) return;
  el.value = String(value);
  el.dispatchEvent(new Event("input"));
}

function syncControlsFromState(s) {
  $("start-date").value = dateToInputValue(s.startTime);
  $("start-time").value = timeToInputValue(s.startTime);
  $("use-civil").checked = s.useCivil;
  setRangeValue($("speed-factor"), s.pace.speedFactor);
  setRangeValue($("moving-ratio"), s.pace.movingRatio);
  setRangeValue($("group-factor"), s.groupFactor == null ? 1 : s.groupFactor);
  setRangeValue($("safety-margin"), s.safetyMargin);
  setRangeValue($("delay"), s.delay || 0);
}

function applyTrip(raw, fit) {
  let trip;
  try { trip = normalizeTrip(raw); } catch (err) {
    flashStatus("Cannot load trip: " + err.message);
    return false;
  }
  stopHike();
  store.set({
    savedId: trip.id,
    routeId: "saved",
    routeName: trip.routeName,
    track: trip.track,
    bailoutPoints: trip.bailoutPoints,
    mode: trip.mode,
    pace: trip.pace,
    groupFactor: trip.groupFactor == null ? 1 : trip.groupFactor,
    safetyMargin: trip.safetyMargin,
    useCivil: trip.useCivil,
    startTime: trip.startTime ? new Date(trip.startTime) : store.get().startTime,
    distanceNow: 0, delay: 0, simElapsed: 0, running: false,
  });
  $("trip-name").value = trip.routeName;
  syncControlsFromState(store.get());
  $("btn-hike").textContent = "\u25b6 Run hike";
  Array.prototype.forEach.call($("mode-buttons").children, function (b) {
    b.classList.toggle("is-active", b.dataset.mode === trip.mode);
  });
  if (fit !== false && map) { map.fitTo(trip.track); map.render(); }
  scheduleWeather();
  return true;
}

let persistTimer = null;
function persistSession(s) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(function () {
    saveSession({
      routeId: s.routeId, routeName: s.routeName, mode: s.mode,
      track: tripPayload(s), bailoutPoints: s.bailoutPoints, pace: s.pace,
      groupFactor: s.groupFactor, safetyMargin: s.safetyMargin, useCivil: s.useCivil,
      startTime: s.startTime.toISOString(),
    });
  }, 500);
}

let tripCache = [];
async function renderTripList() {
  const list = $("trip-list");
  try { tripCache = await listTrips(); } catch (err) { tripCache = []; }
  if (!tripCache.length) {
    list.innerHTML = '<li class="empty">No saved trips yet.</li>';
    return;
  }
  list.innerHTML = "";
  tripCache.forEach(function (t) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "trip-meta";
    const strong = document.createElement("strong");
    strong.textContent = t.routeName;
    const small = document.createElement("small");
    small.textContent = fmtKm(tripSummary(t).distanceM, 1) + " \u00b7 " +
      (t.mode === "loop" ? "thru" : "out & back") + " \u00b7 " +
      String(t.updatedAt || t.createdAt || "").slice(0, 10);
    meta.appendChild(strong);
    meta.appendChild(small);
    const load = document.createElement("button");
    load.className = "btn small";
    load.textContent = "Load";
    load.dataset.action = "load";
    load.dataset.id = t.id;
    const del = document.createElement("button");
    del.className = "btn small danger";
    del.textContent = "\u2715";
    del.dataset.action = "delete";
    del.dataset.id = t.id;
    li.appendChild(meta);
    li.appendChild(load);
    li.appendChild(del);
    list.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  map = new TrailMap($("map"), { center: { lat: -40.88, lon: 175.48 }, zoom: 13 });
  profileChart = new ElevationProfile($("profile"));
  wire();
  const session = loadSession();
  if (!session || !applyTrip(session, true)) {
    loadRoute(DEFAULT_ROUTE, true);
    $("trip-name").value = DEFAULT_ROUTE.name;
  }
  store.subscribe(render);
  store.subscribe(persistSession);
  render();
  renderTripList();
  // Register the service worker for offline use, but never on localhost where
  // it would fight the dev server.
  if ("serviceWorker" in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
}

boot();
