import test from "node:test";
import assert from "node:assert/strict";
import { projectOnRoute } from "../src/services/location.js";
import { buildProfile } from "../src/core/geo.js";
import { makeLineTrack } from "./helpers.js";

const profile = buildProfile(makeLineTrack(1000, { stepM: 100 }));
const METERS_PER_DEG_LAT = 111194.93;

test("a fix on the route projects to its own distance", function () {
  const p = profile.points[5];
  const proj = projectOnRoute(profile, { lat: p.lat, lon: p.lon });
  assert.ok(Math.abs(proj.distanceM - p.dist) < 1, "distance " + proj.distanceM);
  assert.ok(proj.offsetM < 1, "offset " + proj.offsetM);
});

test("an off-route fix reports its perpendicular offset", function () {
  const p = profile.points[5];
  const east = p.lon + 50 / (METERS_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180));
  const proj = projectOnRoute(profile, { lat: p.lat, lon: east });
  assert.ok(Math.abs(proj.offsetM - 50) < 2, "offset " + proj.offsetM);
  assert.ok(Math.abs(proj.distanceM - p.dist) < 2, "distance " + proj.distanceM);
});

test("a fix past the end clamps to the route ends", function () {
  const last = profile.points[profile.points.length - 1];
  const beyond = projectOnRoute(profile, { lat: last.lat + 0.01, lon: last.lon });
  assert.ok(Math.abs(beyond.distanceM - profile.distanceM) < 1, "distance " + beyond.distanceM);
  const before = projectOnRoute(profile, { lat: profile.points[0].lat - 0.01, lon: profile.points[0].lon });
  assert.ok(before.distanceM < 1);
});
