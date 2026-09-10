import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanText } from "../src/ui/sharecard.js";

test("buildPlanText summarises an out-and-back plan", function () {
  const text = buildPlanText({
    routeName: "Mount Holdsworth to Powell Hut",
    mode: "out-and-back",
    distanceM: 9270,
    ascentM: 931,
    startTime: new Date(2026, 8, 11, 8, 0),
    sunrise: new Date(2026, 8, 11, 6, 28),
    sunset: new Date(2026, 8, 11, 18, 4),
    dusk: new Date(2026, 8, 11, 18, 34),
    turnaroundDistanceM: 4630,
    deadline: new Date(2026, 8, 11, 16, 14),
    backBy: new Date(2026, 8, 11, 18, 1),
    bailouts: [{ name: "Holdsworth Lodge", minutes: 60, reachable: true }],
  });
  assert.ok(text.includes("Mount Holdsworth to Powell Hut"));
  assert.ok(text.includes("4.63 km"));
  assert.ok(text.includes("reach it by 16:14"));
  assert.ok(text.includes("Holdsworth Lodge"));
});

test("buildPlanText handles a loop with no turnaround", function () {
  const text = buildPlanText({
    routeName: "Tongariro Alpine Crossing",
    mode: "loop",
    distanceM: 9200,
    ascentM: 800,
    startTime: new Date(2026, 8, 11, 7, 0),
    sunrise: new Date(2026, 8, 11, 6, 0),
    sunset: new Date(2026, 8, 11, 18, 0),
    dusk: new Date(2026, 8, 11, 18, 30),
  });
  assert.ok(text.includes("thru / loop"));
  assert.ok(text.includes("Must finish by"));
  assert.ok(!text.includes("Turnaround:"));
});
