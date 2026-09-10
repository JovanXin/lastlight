import test from "node:test";
import assert from "node:assert/strict";
import { splitIntoDays } from "../src/core/multiday.js";
import { buildProfile } from "../src/core/geo.js";
import { buildSchedule } from "../src/core/pace.js";
import { makeLineTrack } from "./helpers.js";

const PACE = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };
const profile = buildProfile(makeLineTrack(5000, { stepM: 100 }));
const schedule = buildSchedule(profile, PACE);

test("a route that fits in a day is one stage", function () {
  const days = splitIntoDays(profile, schedule, { dayLengthMinutes: 600, marginMinutes: 30 });
  assert.equal(days.length, 1);
  assert.ok(Math.abs(days[0].distanceM - profile.distanceM) < 5);
});

test("a long route splits into stages that cover the whole route", function () {
  // 5 km takes about 60 minutes, so 30 usable minutes per day needs two days.
  const days = splitIntoDays(profile, schedule, { dayLengthMinutes: 60, marginMinutes: 30 });
  assert.equal(days.length, 2);
  assert.ok(Math.abs(days[0].distanceM + days[1].distanceM - profile.distanceM) < 5);
  assert.ok(days[0].endDistM <= days[1].startDistM + 0.01);
  assert.equal(days[0].day, 1);
  assert.equal(days[1].day, 2);
});

test("stages carry their own ascent and clock times", function () {
  const climbing = buildProfile(makeLineTrack(5000, { stepM: 100, gainM: 800 }));
  const sched = buildSchedule(climbing, PACE);
  // Smoothing shaves a little off a synthetic ramp, so compare against the
  // profile's own ascent rather than the nominal gain.
  let profileAscent = 0;
  for (let i = 1; i < climbing.points.length; i++) {
    const d = climbing.points[i].ele - climbing.points[i - 1].ele;
    if (d > 0) profileAscent += d;
  }
  const startMs = new Date(2026, 8, 11, 8, 0).getTime();
  const days = splitIntoDays(climbing, sched, { dayLengthMinutes: 120, marginMinutes: 30, startMs: startMs });
  assert.ok(days.length >= 2);
  const totalAscent = days.reduce(function (sum, d) { return sum + d.ascentM; }, 0);
  assert.ok(Math.abs(totalAscent - profileAscent) < 1, "ascent " + totalAscent + " vs " + profileAscent);
  assert.equal(days[0].startAt.getHours(), 8);
  assert.equal(days[1].startAt.getHours(), 8);
});

test("an empty profile produces no stages", function () {
  assert.deepEqual(splitIntoDays({ points: [], distanceM: 0 }, { points: [], cumulativeMinutes: [], totalMinutes: 0 }, {}), []);
});
