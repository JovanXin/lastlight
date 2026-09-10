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
  const days = splitIntoDays(profile, schedule, { dayLengthMinutes: 60, marginMinutes: 30, mergeFinalDayBelow: 0 });
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
  const days = splitIntoDays(climbing, sched, { dayLengthMinutes: 120, marginMinutes: 30, startMs: startMs, mergeFinalDayBelow: 0 });
  assert.ok(days.length >= 2);
  const totalAscent = days.reduce(function (sum, d) { return sum + d.ascentM; }, 0);
  assert.ok(Math.abs(totalAscent - profileAscent) < 1, "ascent " + totalAscent + " vs " + profileAscent);
  assert.equal(days[0].startAt.getHours(), 8);
  assert.equal(days[1].startAt.getHours(), 8);
});

test("stages prefer a named stopping point inside the day", function () {
  const days = splitIntoDays(profile, schedule, {
    dayLengthMinutes: 60, marginMinutes: 30,
    stopDistances: [2000, 4000],
    mergeFinalDayBelow: 0,
  });
  assert.equal(days.length, 3);
  assert.ok(Math.abs(days[0].endDistM - 2000) < 1, "day 1 end " + days[0].endDistM);
  assert.ok(Math.abs(days[1].endDistM - 4000) < 1, "day 2 end " + days[1].endDistM);
  assert.ok(Math.abs(days[2].endDistM - profile.distanceM) < 1);
});

test("a trivially short final day is merged into the previous one", function () {
  const days = splitIntoDays(profile, schedule, { dayLengthMinutes: 60, marginMinutes: 30 });
  // 5 km takes ~60 min, so short daily budgets would leave a tiny last day;
  // the merge keeps the final stage substantive.
  assert.ok(days.length >= 1);
  if (days.length > 1) {
    assert.ok(days[days.length - 1].minutes >= 90, "last day " + days[days.length - 1].minutes);
  }
  const covered = days.reduce(function (sum, d) { return sum + d.distanceM; }, 0);
  assert.ok(Math.abs(covered - profile.distanceM) < 5);
  // A merged day must end when its full walking time says, not when the day it
  // absorbed used to end.
  const last = days[days.length - 1];
  if (last.startAt && last.endAt) {
    const implied = (last.endAt - last.startAt) / 60000;
    assert.ok(Math.abs(implied - last.minutes) < 0.01, "implied " + implied + " vs " + last.minutes);
  }
});

test("an empty profile produces no stages", function () {
  assert.deepEqual(splitIntoDays({ points: [], distanceM: 0 }, { points: [], cumulativeMinutes: [], totalMinutes: 0 }, {}), []);
});
