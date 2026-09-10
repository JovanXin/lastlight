import test from "node:test";
import assert from "node:assert/strict";
import { toblerSpeedKph, naismithMinutes, movingMinutes, buildSchedule, minutesAtDistance, sanitizePace } from "../src/core/pace.js";
import { buildProfile } from "../src/core/geo.js";
import { makeLineTrack } from "./helpers.js";

test("Tobler speed peaks near a 5% descent and matches the known value", function () {
  const flat = toblerSpeedKph(0);
  assert.ok(Math.abs(flat - 5.037) < 0.01, "flat speed " + flat);
  assert.ok(toblerSpeedKph(-0.05) > toblerSpeedKph(0));
  assert.ok(toblerSpeedKph(0.5) < 1);
});

test("movingMinutes for 5 km flat is close to an hour", function () {
  const pace = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };
  const m = movingMinutes(5000, 0, pace);
  assert.ok(Math.abs(m - 59.56) < 0.5, "minutes " + m);
});

test("movingMinutes punishes ascent", function () {
  const pace = { speedFactor: 1, movingRatio: 1 };
  const flat = movingMinutes(5000, 0, pace);
  const hilly = movingMinutes(5000, 600, pace);
  assert.ok(hilly > flat * 1.4, "hilly " + hilly + " vs flat " + flat);
});

test("Naismith cross-check stays in the same neighbourhood as Tobler", function () {
  const flatNaismith = naismithMinutes(5000, 0);
  assert.equal(flatNaismith, 60);
});

test("sanitizePace clamps unsafe values", function () {
  const p = sanitizePace({ speedFactor: 99, movingRatio: 0, minSpeedKph: -5 });
  assert.equal(p.speedFactor, 3);
  assert.equal(p.movingRatio, 0.85);
  assert.ok(p.minSpeedKph > 0);
});

test("buildSchedule accumulates time and returns a reversed schedule too", function () {
  const profile = buildProfile(makeLineTrack(2000, { stepM: 100 }));
  const pace = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };
  const fwd = buildSchedule(profile, pace);
  const rev = buildSchedule(profile, pace, { reverse: true });
  assert.ok(Math.abs(fwd.totalMinutes - rev.totalMinutes) < 1e-6);
  assert.equal(fwd.cumulativeMinutes.length, fwd.points.length);
  assert.ok(Math.abs(fwd.totalMinutes - (2 / 5.037) * 60) < 0.5);
});

test("minutesAtDistance works in both orientations", function () {
  const profile = buildProfile(makeLineTrack(2000, { stepM: 100 }));
  const pace = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };
  const fwd = buildSchedule(profile, pace);
  const rev = buildSchedule(profile, pace, { reverse: true });
  const half = minutesAtDistance(fwd, 1000);
  assert.ok(Math.abs(half - fwd.totalMinutes / 2) < 0.5, "half " + half);
  const back = minutesAtDistance(rev, 1000);
  assert.ok(Math.abs(back - half) < 0.5, "back " + back);
  assert.ok(Math.abs(minutesAtDistance(rev, 2000)) < 0.01);
});
