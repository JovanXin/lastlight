import test from "node:test";
import assert from "node:assert/strict";
import { buildCueSheet, formatCueSheetText } from "../src/core/cuesheet.js";
import { buildProfile } from "../src/core/geo.js";
import { buildSchedule } from "../src/core/pace.js";
import { makeLineTrack } from "./helpers.js";

const PACE = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };
const profile = buildProfile(makeLineTrack(3000, { stepM: 100 }));
const schedule = buildSchedule(profile, PACE);

test("buildCueSheet emits start, kilometre marks and finish in order", function () {
  const cues = buildCueSheet(profile, schedule, { intervalM: 1000, startMs: new Date(2026, 8, 11, 8, 0).getTime() });
  const dists = cues.map(function (c) { return Math.round(c.distanceM); });
  assert.deepEqual(dists, [0, 1000, 2000, 3000]);
  assert.equal(cues[0].kind, "start");
  assert.equal(cues[cues.length - 1].kind, "finish");
  assert.ok(cues[1].minutes > 0 && cues[1].at instanceof Date);
});

test("buildCueSheet inserts turnaround and bailout cues in place", function () {
  const cues = buildCueSheet(profile, schedule, {
    intervalM: 1000,
    turnaroundDistanceM: 2500,
    bailouts: [{ name: "Hut", routeDist: 1500 }],
  });
  const kinds = cues.map(function (c) { return c.kind; });
  assert.ok(kinds.includes("turnaround"));
  assert.ok(kinds.includes("bailout"));
  const dists = cues.map(function (c) { return c.distanceM; });
  assert.deepEqual(dists, dists.slice().sort(function (a, b) { return a - b; }));
  const names = cues.map(function (c) { return c.name; });
  assert.ok(names.includes("Hut"));
  assert.ok(names.includes("Turnaround"));
});

test("formatCueSheetText produces a readable sheet", function () {
  const cues = buildCueSheet(profile, schedule, { intervalM: 1000, startMs: new Date(2026, 8, 11, 8, 0).getTime() });
  const text = formatCueSheetText(cues, { routeName: "Test ridge", mode: "out-and-back" });
  assert.ok(text.includes("LASTLIGHT CUE SHEET"));
  assert.ok(text.includes("Test ridge"));
  assert.ok(text.includes("1.00 km"));
  assert.ok(text.includes("08:"));
});

test("buildCueSheet is empty without a profile", function () {
  assert.deepEqual(buildCueSheet({ points: [], distanceM: 0 }, null, {}), []);
});
