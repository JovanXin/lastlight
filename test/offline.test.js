import test from "node:test";
import assert from "node:assert/strict";
import { tilesForBounds, routeBounds, lonToTileX, latToTileY } from "../src/services/offline.js";
import { buildProfile } from "../src/core/geo.js";
import { makeLineTrack } from "./helpers.js";

test("tile coordinates match the known Web Mercator origin", function () {
  assert.equal(lonToTileX(0, 1), 1);
  assert.equal(latToTileY(0, 1), 1);
  assert.equal(lonToTileX(-180, 4), 0);
  assert.equal(lonToTileX(180, 4), 16);
});

test("tilesForBounds returns a contiguous grid", function () {
  const tiles = tilesForBounds({ minLat: 0, maxLat: 0.1, minLon: 0, maxLon: 0.1 }, 10);
  assert.ok(tiles.length >= 1);
  for (const t of tiles) { assert.equal(t.z, 10); assert.ok(t.x >= 0 && t.y >= 0); }
  const seen = new Set(tiles.map(function (t) { return t.x + "," + t.y; }));
  assert.equal(seen.size, tiles.length);
});

test("routeBounds pads the profile bbox", function () {
  const profile = buildProfile(makeLineTrack(2000, { stepM: 100, lat: -40.88, lon: 175.48 }));
  const b = routeBounds(profile, 1000);
  assert.ok(b.minLat < profile.points[0].lat);
  assert.ok(b.maxLat > profile.points[profile.points.length - 1].lat);
  assert.ok(b.maxLat - b.minLat > 2000 / 111194.93);
});
