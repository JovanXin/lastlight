import test from "node:test";
import assert from "node:assert/strict";
import { sampleLine, terrainLegMinutes } from "../src/core/terrain.js";
import { haversineMeters } from "../src/core/geo.js";

const PACE = { speedFactor: 1, movingRatio: 1, minSpeedKph: 0.3 };

test("sampleLine spans the endpoints evenly", function () {
  const pts = sampleLine({ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, 5);
  assert.equal(pts.length, 5);
  assert.equal(pts[0].lon, 0);
  assert.equal(pts[4].lon, 0.01);
  assert.ok(Math.abs(pts[1].lon - 0.0025) < 1e-9);
  assert.equal(pts[0].t, 0);
  assert.equal(pts[4].t, 1);
});

test("a flat transect matches the flat single-grade estimate", function () {
  const line = sampleLine({ lat: 0, lon: 0 }, { lat: 0, lon: 0.009 }, 10);
  const transect = line.map(function (p) { return { lat: p.lat, lon: p.lon, ele: 100 }; });
  const t = terrainLegMinutes(transect, PACE, 1);
  const straight = haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0.009 });
  const expected = (straight / 1000) / 5.037 * 60;
  assert.ok(Math.abs(t.minutes - expected) < 0.5, "minutes " + t.minutes + " expected " + expected);
  assert.equal(t.ascentM, 0);
});

test("a hump costs more time than the same flat distance", function () {
  const line = sampleLine({ lat: 0, lon: 0 }, { lat: 0, lon: 0.009 }, 9);
  const hump = line.map(function (p, i) { return { lat: p.lat, lon: p.lon, ele: 100 + 200 * Math.sin((i / 8) * Math.PI) }; });
  const flat = line.map(function (p) { return { lat: p.lat, lon: p.lon, ele: 100 }; });
  const hilly = terrainLegMinutes(hump, PACE, 1);
  const level = terrainLegMinutes(flat, PACE, 1);
  assert.ok(hilly.minutes > level.minutes * 1.15, "hilly " + hilly.minutes + " flat " + level.minutes);
  assert.ok(hilly.ascentM > 150 && hilly.descentM > 150);
});

test("the detour factor lengthens the leg", function () {
  const line = sampleLine({ lat: 0, lon: 0 }, { lat: 0, lon: 0.009 }, 8);
  const transect = line.map(function (p) { return { lat: p.lat, lon: p.lon, ele: 100 }; });
  const direct = terrainLegMinutes(transect, PACE, 1);
  const winding = terrainLegMinutes(transect, PACE, 1.5);
  assert.ok(Math.abs(winding.distanceM / direct.distanceM - 1.5) < 0.01);
  assert.ok(winding.minutes > direct.minutes);
});
