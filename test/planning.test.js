import test from "node:test";
import assert from "node:assert/strict";
import { totalPlanMinutes, latestStart, analyzeFinish } from "../src/core/planning.js";
import { buildSchedule } from "../src/core/pace.js";
import { buildProfile } from "../src/core/geo.js";
import { makeLineTrack } from "./helpers.js";

const PACE = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };

test("totalPlanMinutes doubles an out-and-back and not a loop", function () {
  const profile = buildProfile(makeLineTrack(5000, { stepM: 100 }));
  const out = buildSchedule(profile, PACE);
  const back = buildSchedule(profile, PACE, { reverse: true });
  assert.ok(Math.abs(totalPlanMinutes(out, back, "out-and-back") - 2 * out.totalMinutes) < 1e-6);
  assert.equal(totalPlanMinutes(out, back, "loop"), out.totalMinutes);
});

test("latestStart backs off the plan duration and the margin", function () {
  const dusk = new Date(2026, 8, 11, 18, 30);
  const start = latestStart(dusk.getTime(), 30, 300);
  // 18:30 minus a 30 minute margin and a 5 hour plan is 13:00.
  assert.equal(start.getHours(), 13);
  assert.equal(start.getMinutes(), 0);
});

test("latestStart returns null without a dusk (polar day)", function () {
  assert.equal(latestStart(null, 30, 300), null);
});

test("analyzeFinish reports time after sunset", function () {
  const start = new Date(2026, 8, 11, 8, 0);
  const sunset = new Date(2026, 8, 11, 18, 0);
  const daylight = analyzeFinish(start.getTime(), 9 * 60, sunset.getTime());
  assert.equal(daylight.needHeadlamp, false);
  assert.equal(daylight.darkMinutes, 0);
  const late = analyzeFinish(start.getTime(), 11 * 60, sunset.getTime());
  assert.equal(late.needHeadlamp, true);
  assert.ok(Math.abs(late.darkMinutes - 60) < 1e-6);
  assert.equal(late.finishAt.getHours(), 19);
});
