import test from "node:test";
import assert from "node:assert/strict";
import { assessReadiness, READINESS, THRESHOLDS } from "../src/core/readiness.js";

test("a clean plan is ready to go", function () {
  const r = assessReadiness({ wholeTripFits: true, verdict: "go", darkMinutes: 0, maxWindKph: 10, maxPrecipProb: 5, worstCode: 0, minTempC: 14 });
  assert.equal(r.level, READINESS.GO);
  assert.equal(r.score, 100);
  assert.equal(r.reasons.length, 1);
});

test("a thunderstorm is a no-go", function () {
  const r = assessReadiness({ wholeTripFits: true, verdict: "go", worstCode: 95 });
  assert.equal(r.level, READINESS.NOGO);
  assert.ok(r.reasons.some(function (x) { return x.level === READINESS.NOGO; }));
});

test("severe wind is a no-go, strong wind is a caution", function () {
  assert.equal(assessReadiness({ maxWindKph: THRESHOLDS.severeWindKph }).level, READINESS.NOGO);
  assert.equal(assessReadiness({ maxWindKph: THRESHOLDS.strongWindKph }).level, READINESS.CAUTION);
});

test("a closed turnaround window is a no-go", function () {
  assert.equal(assessReadiness({ verdict: "past" }).level, READINESS.NOGO);
});

test("rain, cold and darkness each raise a caution", function () {
  assert.equal(assessReadiness({ maxPrecipProb: 80 }).level, READINESS.CAUTION);
  assert.equal(assessReadiness({ minTempC: 1 }).level, READINESS.CAUTION);
  assert.equal(assessReadiness({ darkMinutes: 45 }).level, READINESS.CAUTION);
  assert.equal(assessReadiness({ wholeTripFits: false }).level, READINESS.CAUTION);
});

test("a no-go dominates cautions and lowers the score", function () {
  const r = assessReadiness({ worstCode: 99, maxWindKph: 50, maxPrecipProb: 90 });
  assert.equal(r.level, READINESS.NOGO);
  assert.ok(r.score < 60, "score " + r.score);
  assert.ok(r.reasons.length >= 3);
});

test("missing weather does not fabricate a warning", function () {
  const r = assessReadiness({ wholeTripFits: true, verdict: "go" });
  assert.equal(r.level, READINESS.GO);
});
