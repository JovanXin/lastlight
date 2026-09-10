import test from "node:test";
import assert from "node:assert/strict";
import { calibrateSpeedFactor, plannedMinutes, paceDelta } from "../src/core/calibrate.js";
import { buildProfile } from "../src/core/geo.js";
import { makeLineTrack } from "./helpers.js";

const PACE = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };
const profile = buildProfile(makeLineTrack(5000, { stepM: 100 }));

test("plannedMinutes uses the configured mode", function () {
  const outAndBack = plannedMinutes(profile, PACE, "out-and-back");
  const loop = plannedMinutes(profile, PACE, "loop");
  assert.ok(Math.abs(outAndBack - 119.1) < 1, "out and back " + outAndBack);
  assert.ok(Math.abs(loop - 59.56) < 0.6, "loop " + loop);
  assert.ok(Math.abs(outAndBack - 2 * loop) < 0.5);
});

test("calibrating to a slower round trip lowers the speed factor", function () {
  // The 5 km route takes 59.56 min each way at factor 1, so 140 min total
  // implies about 0.85x the model's speed.
  const res = calibrateSpeedFactor(profile, PACE, 140, { mode: "out-and-back" });
  assert.equal(res.matched, true);
  assert.ok(Math.abs(res.speedFactor - 0.851) < 0.02, "factor " + res.speedFactor);
});

test("calibrating to the planned time returns roughly one", function () {
  const planned = plannedMinutes(profile, PACE, "out-and-back");
  const res = calibrateSpeedFactor(profile, PACE, planned, { mode: "out-and-back" });
  assert.equal(res.matched, true);
  assert.ok(Math.abs(res.speedFactor - 1) < 0.01, "factor " + res.speedFactor);
});

test("an impossible target is reported rather than faked", function () {
  assert.equal(calibrateSpeedFactor(profile, PACE, 10).matched, false);
  assert.equal(calibrateSpeedFactor(profile, PACE, 10000).matched, false);
  assert.equal(calibrateSpeedFactor(profile, PACE, -1).matched, false);
});

test("paceDelta describes how far off the plan a hike was", function () {
  assert.ok(Math.abs(paceDelta(70, 60) - 0.1667) < 0.001);
  assert.equal(paceDelta(60, 0), null);
});
