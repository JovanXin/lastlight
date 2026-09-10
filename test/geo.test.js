import test from "node:test";
import assert from "node:assert/strict";
import { haversineMeters, buildProfile, pointAtDistance, elevationGainLoss, resample } from "../src/core/geo.js";
import { makeLineTrack } from "./helpers.js";

test("haversine matches the known one-degree arc at the equator", function () {
  const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  assert.ok(Math.abs(d - 111194.9) < 1, "expected ~111194.9 m, got " + d);
});

test("haversine is symmetric and zero for identical points", function () {
  const a = { lat: -36.85, lon: 174.76 };
  const b = { lat: -36.9, lon: 174.8 };
  assert.equal(haversineMeters(a, a), 0);
  assert.ok(Math.abs(haversineMeters(a, b) - haversineMeters(b, a)) < 1e-6);
});

test("buildProfile accumulates distance along the line", function () {
  const profile = buildProfile(makeLineTrack(1000, { stepM: 100 }));
  assert.ok(Math.abs(profile.distanceM - 1000) < 5, "distance " + profile.distanceM);
  assert.equal(profile.points.length, 11);
  assert.equal(profile.points[0].dist, 0);
});

test("pointAtDistance interpolates between samples", function () {
  const profile = buildProfile(makeLineTrack(1000, { stepM: 100 }));
  const mid = pointAtDistance(profile, 250);
  assert.ok(Math.abs(mid.dist - 250) < 1e-6);
  assert.ok(Math.abs(mid.lat - profile.points[2].lat) < 1e-9 || mid.lat > profile.points[2].lat);
  const clamped = pointAtDistance(profile, -50);
  assert.equal(clamped.dist, 0);
  const over = pointAtDistance(profile, 99999);
  assert.ok(Math.abs(over.dist - profile.distanceM) < 1e-6);
});

test("elevationGainLoss ignores sub-threshold noise", function () {
  const noisy = [];
  for (let i = 0; i < 200; i++) {
    noisy.push({ lat: i / 100000, lon: 0, ele: (i % 2) * 1 + (i >= 100 ? 100 : 0) });
  }
  const g = elevationGainLoss(buildProfile(noisy, { smoothWindow: 0 }), 5);
  assert.ok(g.gainM > 50 && g.gainM < 150, "gain " + g.gainM);
});

test("resample produces roughly even spacing and keeps the end point", function () {
  const profile = buildProfile(makeLineTrack(1000, { stepM: 500 }));
  const r = resample(profile, 25);
  assert.ok(r.points.length >= 40);
  assert.ok(Math.abs(r.points[r.points.length - 1].dist - profile.distanceM) < 1e-6);
});
