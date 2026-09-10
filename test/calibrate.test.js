import test from "node:test";
import assert from "node:assert/strict";
import { calibrateSpeedFactor, plannedMinutes, paceDelta } from "../src/core/calibrate.js";
import { buildProfile } from "../src/core/geo.js";
import { makeLineTrack } from "./helpers.js";

const PACE = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };
const profile = buildProfile(makeLineTrack(5000, { stepM: 100 }));

test("plannedMinutes matches the schedule", function () {
  const planned = plannedMinutes(profile, PACE);
  assert.ok(Math.abs(planned - 59.56) < 0.6, "planned " + planned);
});

test("calibrating to a slower hike lowers the speed factor", function () {
  const res = calibrateSpeedFactor(profile, PACE, 70);
  assert.equal(res.matched, true);
  // 5 km in 70 min implies about 0.85x the model's speed.
  assert.ok(Math.abs(res.speedFactor - 0.851) < 0.02, "factor " + res.speedFactor);
});

test("calibrating to the planned time returns roughly one", function () {
  const planned = plannedMinutes(profile, PACE);
  const res = calibrateSpeedFactor(profile, PACE, planned);
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
