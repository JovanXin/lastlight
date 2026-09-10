import test from "node:test";
import assert from "node:assert/strict";
import { analyzeOutAndBack, analyzeLoop, analyzeBailouts, findTurnaroundDistance, VERDICT } from "../src/core/turnaround.js";
import { buildSchedule } from "../src/core/pace.js";
import { buildProfile } from "../src/core/geo.js";
import { makeLineTrack } from "./helpers.js";

const PACE = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };

function flat10k() { return buildProfile(makeLineTrack(10000, { stepM: 100 })); }

test("findTurnaroundDistance respects the time budget", function () {
  const profile = flat10k();
  const out = buildSchedule(profile, PACE);
  const back = buildSchedule(profile, PACE, { reverse: true });
  const t = findTurnaroundDistance(out, back, { budgetMinutes: 210 });
  // 2 * (d/1000)/5.037*60 <= 210  =>  d <= ~8.82 km
  assert.ok(t.distanceM > 8600 && t.distanceM < 9100, "distance " + t.distanceM);
});

test("out-and-back assessment computes a live turnaround clock", function () {
  const profile = flat10k();
  const a = analyzeOutAndBack(profile, {
    pace: PACE, startTime: 0, now: 0, dusk: 240 * 60000,
    safetyMarginMinutes: 30, distanceNowM: 3000,
  });
  assert.equal(a.turnaroundDistanceM > 8600 && a.turnaroundDistanceM < 9100, true);
  assert.ok(a.minutesUntilTurnaround > 100, "minutesLeft " + a.minutesUntilTurnaround);
  assert.equal(a.verdict, VERDICT.GO);
  // Full 10 km out-and-back needs ~4h58m, so it cannot fit in a 4h day; the
  // app still reports the furthest point you can reach and return from.
  assert.equal(a.wholeTripFits, false);
});

test("you are PAST turnaround once the clock runs out", function () {
  const profile = flat10k();
  const a = analyzeOutAndBack(profile, {
    pace: PACE, startTime: 0, now: 200 * 60000, dusk: 240 * 60000,
    safetyMarginMinutes: 30, distanceNowM: 3000,
  });
  assert.equal(a.verdict, VERDICT.PAST);
  assert.ok(a.minutesUntilTurnaround < 0);
});

test("a trip too long for the day is flagged even before it starts", function () {
  const profile = flat10k();
  const a = analyzeOutAndBack(profile, {
    pace: PACE, startTime: 0, now: 0, dusk: 120 * 60000,
    safetyMarginMinutes: 30, distanceNowM: 0,
  });
  assert.equal(a.wholeTripFits, false);
  assert.ok(a.turnaroundDistanceM < 4000, "distance " + a.turnaroundDistanceM);
});

test("loop analysis reports slack and a required pace", function () {
  const profile = flat10k();
  const a = analyzeLoop(profile, {
    pace: PACE, startTime: 0, now: 0, dusk: 180 * 60000,
    safetyMarginMinutes: 30, distanceNowM: 0,
  });
  assert.ok(a.remainingMinutes > 100);
  assert.ok(a.slackMinutes > 0);
  assert.equal(a.verdict, VERDICT.GO);
});

test("bailouts are ranked and marked reachable before dusk", function () {
  const from = { lat: 0, lon: 0, ele: 1000 };
  const options = {
    pace: PACE, now: 0, dusk: 60 * 60000, safetyMarginMinutes: 10, detourFactor: 1.35,
  };
  const near = { name: "Fire road", lat: 1000 / 111194.93, lon: 0, ele: 900 };
  const far = { name: "Valley hut", lat: 10000 / 111194.93, lon: 0, ele: 400 };
  const list = analyzeBailouts(from, [far, near], options);
  assert.equal(list[0].bailout.name, "Fire road");
  assert.equal(list[0].reachable, true);
  assert.equal(list[1].reachable, false);
  assert.ok(list[0].slackMinutes > 20 && list[0].slackMinutes < 50);
});
