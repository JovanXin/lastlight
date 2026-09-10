// The heart of Lastlight: given where you are, what time it is, and when the
// light runs out, decide how much further you can safely go and where your
// nearest bailout is.

import { haversineMeters, clamp } from "./geo.js";
import { buildSchedule, minutesAtDistance, sanitizePace, elapsedMinutes, toblerSpeedKph } from "./pace.js";

export const VERDICT = Object.freeze({
  GO: "go",
  CAUTION: "caution",
  TURN: "turn",
  PAST: "past",
});

// Time to walk from a point at `distanceM` back to the trailhead. The inbound
// schedule walks from the far end towards the start, so its remaining time is
// the total minus the time already spent reaching that distance.
export function returnMinutesAt(inbound, distanceM) {
  return Math.max(0, inbound.totalMinutes - minutesAtDistance(inbound, distanceM));
}

function toMs(value, fallback) {
  if (value == null) return fallback;
  if (value instanceof Date) return value.getTime();
  return Number(value);
}

// Scan the outbound schedule for the furthest point you can still reach and
// return from before (dusk - margin). O(n), monotone by construction.
export function findTurnaroundDistance(outbound, inbound, options) {
  const opts = options || {};
  const budget = opts.budgetMinutes;
  const pts = outbound.points;
  let best = { distanceM: 0, outboundMinutes: 0, returnMinutes: returnMinutesAt(inbound, 0) };
  for (let i = 0; i < pts.length; i++) {
    const d = pts[i].dist;
    const out = outbound.cumulativeMinutes[i];
    const back = returnMinutesAt(inbound, d);
    if (out + back <= budget) {
      best = { distanceM: d, outboundMinutes: out, returnMinutes: back };
    } else {
      break;
    }
  }
  return best;
}

// Full out-and-back assessment used by the live HUD.
export function analyzeOutAndBack(profile, options) {
  const opts = options || {};
  const pace = sanitizePace(opts.pace);
  const startMs = toMs(opts.startTime, Date.now());
  const nowMs = toMs(opts.now, startMs);
  const duskMs = toMs(opts.dusk, null);
  const margin = opts.safetyMarginMinutes == null ? 30 : Number(opts.safetyMarginMinutes);
  const distanceNowM = clamp(Number(opts.distanceNowM) || 0, 0, profile.distanceM);

  const outbound = buildSchedule(profile, pace);
  const inbound = buildSchedule(profile, pace, { reverse: true });

  const availableMinutes = duskMs == null ? Infinity : Math.max(0, (duskMs - startMs) / 60000);
  const budget = availableMinutes - margin;
  const turnaround = duskMs == null
    ? { distanceM: profile.distanceM, outboundMinutes: outbound.totalMinutes, returnMinutes: inbound.totalMinutes }
    : findTurnaroundDistance(outbound, inbound, { budgetMinutes: budget });

  const outboundAtNow = minutesAtDistance(outbound, distanceNowM);
  const returnFromNow = returnMinutesAt(inbound, distanceNowM);
  const elapsedNow = (nowMs - startMs) / 60000;
  const projectedFinishMinutes = outbound.totalMinutes + inbound.totalMinutes;

  const returnFromTurn = returnMinutesAt(inbound, turnaround.distanceM);

  // Strategic deadline: the clock time by which you must reach the furthest
  // safe point, because after it the return leg no longer fits before dusk.
  const deadlineToReachTurnMs = duskMs == null ? null : duskMs - margin * 60000 - returnFromTurn * 60000;
  const minutesUntilTurn = deadlineToReachTurnMs == null ? null : (deadlineToReachTurnMs - nowMs) / 60000;

  // Tactical deadline: the last moment you may start back from where you stand
  // right now. Missing this one is what turns a long day into a night out.
  const latestTurnFromNowMs = duskMs == null ? null : duskMs - margin * 60000 - returnFromNow * 60000;
  const minutesUntilMustTurn = latestTurnFromNowMs == null ? null : (latestTurnFromNowMs - nowMs) / 60000;

  let verdict = VERDICT.GO;
  if (minutesUntilMustTurn != null && minutesUntilMustTurn <= 0) {
    verdict = VERDICT.PAST;
  } else if (minutesUntilTurn != null && minutesUntilTurn <= 0) {
    verdict = VERDICT.TURN;
  } else if (minutesUntilTurn != null && minutesUntilTurn <= Math.max(15, margin / 2)) {
    verdict = VERDICT.CAUTION;
  }

  // If the whole trip cannot fit in the day from the start, say so.
  const wholeTripFits = duskMs == null ? true : projectedFinishMinutes + margin <= availableMinutes;

  return {
    pace: pace,
    distanceNowM: distanceNowM,
    distanceTotalM: profile.distanceM,
    outboundMinutesAtNow: outboundAtNow,
    returnMinutesFromNow: returnFromNow,
    elapsedMinutes: elapsedNow,
    remainingOutboundMinutes: outbound.totalMinutes - outboundAtNow,
    projectedFinishMinutes: projectedFinishMinutes,
    availableMinutes: availableMinutes,
    budgetMinutes: budget,
    travelBudgetMinutes: projectedFinishMinutes + margin,
    turnaroundDistanceM: turnaround.distanceM,
    turnaroundFromStartM: turnaround.distanceM,
    returnMinutesFromTurn: returnFromTurn,
    deadlineToReachTurn: deadlineToReachTurnMs == null ? null : new Date(deadlineToReachTurnMs),
    minutesUntilTurnaround: minutesUntilTurn,
    latestTurnFromNow: latestTurnFromNowMs == null ? null : new Date(latestTurnFromNowMs),
    minutesUntilMustTurn: minutesUntilMustTurn,
    turnaroundTime: latestTurnFromNowMs == null ? null : new Date(latestTurnFromNowMs),
    verdict: verdict,
    wholeTripFits: wholeTripFits,
    schedules: { outbound: outbound, inbound: inbound },
  };
}

// Estimate time to leave the route for an off-trail bailout point. A detour
// factor inflates straight-line distance to account for terrain and finding a
// line, and the signed elevation change feeds Tobler's function so a steep
// scramble down is realistically slower than an easy traverse.
export function estimateBailoutMinutes(fromPoint, bailout, pace, detourFactor) {
  const p = sanitizePace(pace);
  const factor = detourFactor == null ? 1.35 : detourFactor;
  const straight = haversineMeters(fromPoint, bailout);
  const distanceM = straight * factor;
  const changeM = (Number(bailout.ele) || 0) - (Number(fromPoint.ele) || 0);
  const grade = distanceM > 0 ? changeM / distanceM : 0;
  const speedKph = Math.max(p.minSpeedKph, toblerSpeedKph(grade) * p.speedFactor);
  const moving = distanceM > 0 ? (distanceM / 1000) / speedKph * 60 : 0;
  return {
    distanceM: distanceM,
    straightLineM: straight,
    ascentM: changeM > 0 ? changeM : 0,
    descentM: changeM < 0 ? -changeM : 0,
    grade: grade,
    minutes: elapsedMinutes(moving, p),
  };
}

// Rank bailout options by whether they can be reached before dusk.
export function analyzeBailouts(fromPoint, bailouts, options) {
  const opts = options || {};
  const pace = sanitizePace(opts.pace);
  const nowMs = toMs(opts.now, Date.now());
  const duskMs = toMs(opts.dusk, null);
  const margin = opts.safetyMarginMinutes == null ? 30 : Number(opts.safetyMarginMinutes);
  const deadlineMs = duskMs == null ? Infinity : duskMs - margin * 60000;
  const list = (bailouts || []).map(function (b) {
    const est = estimateBailoutMinutes(fromPoint, b, pace, opts.detourFactor);
    const arriveMs = nowMs + est.minutes * 60000;
    const slackMinutes = (deadlineMs - arriveMs) / 60000;
    return Object.assign({ bailout: b }, est, {
      arriveAt: new Date(arriveMs),
      slackMinutes: isFinite(slackMinutes) ? slackMinutes : null,
      reachable: arriveMs <= deadlineMs,
    });
  });
  list.sort(function (a, b) { return a.minutes - b.minutes; });
  return list;
}

// Loop / thru-hike assessment: there is no turn-around, only a required pace.
export function analyzeLoop(profile, options) {
  const opts = options || {};
  const pace = sanitizePace(opts.pace);
  const startMs = toMs(opts.startTime, Date.now());
  const nowMs = toMs(opts.now, startMs);
  const duskMs = toMs(opts.dusk, null);
  const margin = opts.safetyMarginMinutes == null ? 30 : Number(opts.safetyMarginMinutes);
  const distanceNowM = clamp(Number(opts.distanceNowM) || 0, 0, profile.distanceM);

  const schedule = buildSchedule(profile, pace);
  const plannedMinutes = schedule.totalMinutes;
  const remainingDistance = Math.max(0, profile.distanceM - distanceNowM);
  const remainingMinutes = Math.max(0, plannedMinutes - minutesAtDistance(schedule, distanceNowM));
  const elapsedNow = (nowMs - startMs) / 60000;
  const daylightLeft = duskMs == null ? Infinity : (duskMs - nowMs) / 60000 - margin;
  const slackMinutes = daylightLeft - remainingMinutes;
  // Required moving speed to finish inside the remaining daylight.
  const requiredMoving = remainingMinutes > 0 ? pace.movingRatio : 0;
  const requiredSpeedup = remainingMinutes > 0 && daylightLeft > 0 ? remainingMinutes / daylightLeft : Infinity;

  let verdict = VERDICT.GO;
  if (slackMinutes < 0) verdict = VERDICT.PAST;
  else if (slackMinutes < plannedMinutes * 0.1) verdict = VERDICT.TURN;
  else if (slackMinutes < plannedMinutes * 0.2) verdict = VERDICT.CAUTION;

  return {
    pace: pace,
    plannedMinutes: plannedMinutes,
    elapsedMinutes: elapsedNow,
    remainingMinutes: remainingMinutes,
    remainingDistanceM: remainingDistance,
    daylightLeftMinutes: daylightLeft,
    slackMinutes: slackMinutes,
    requiredPaceFactor: requiredSpeedup,
    requiredMovingRatio: requiredMoving,
    verdict: verdict,
    schedule: schedule,
  };
}
