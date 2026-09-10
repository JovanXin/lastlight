import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip, tripSummary } from "../src/services/storage.js";

test("normalizeTrip fills defaults and coerces numbers", function () {
  const trip = normalizeTrip({
    routeName: "Test",
    track: [{ lat: "1", lon: "2" }, { lat: 3, lon: 4, ele: "120" }],
  });
  assert.equal(trip.mode, "out-and-back");
  assert.equal(trip.track[0].lat, 1);
  assert.equal(trip.track[1].ele, 120);
  assert.equal(trip.pace.speedFactor, 1);
  assert.equal(trip.pace.movingRatio, 0.85);
  assert.equal(trip.safetyMargin, 30);
  assert.equal(trip.groupFactor, 1);
  assert.equal(trip.useCivil, true);
  assert.ok(trip.id);
});

test("normalizeTrip rejects an object without a usable track", function () {
  assert.throws(function () { normalizeTrip({ track: [{ lat: 1, lon: 2 }] }); }, /two track points/);
  assert.throws(function () { normalizeTrip(null); }, TypeError);
});

test("tripSummary measures great-circle-ish distance", function () {
  const s = tripSummary({ track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }] });
  assert.ok(Math.abs(s.distanceM - 111.19) < 1, "distance " + s.distanceM);
  assert.equal(s.points, 2);
});
