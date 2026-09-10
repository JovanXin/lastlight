import test from "node:test";
import assert from "node:assert/strict";
import { parseGpx, toGpx } from "../src/core/gpx.js";

const SAMPLE = [
  '<?xml version="1.0"?>',
  '<gpx version="1.1" creator="tester">',
  '  <metadata><name>Ridgeline &amp; Tarn</name></metadata>',
  '  <trk><trkseg>',
  '    <trkpt lat="-36.8" lon="174.7"><ele>120</ele><time>2024-01-01T00:00:00Z</time></trkpt>',
  '    <trkpt lat="-36.81" lon="174.71"><ele>180</ele></trkpt>',
  '    <trkpt lat="-36.82" lon="174.72"/>',
  '  </trkseg></trk>',
  '  <wpt lat="-36.9" lon="174.8"><name>Trailhead</name></wpt>',
  '</gpx>',
].join("\n");

test("parseGpx reads track points, waypoints, elevation and time", function () {
  const g = parseGpx(SAMPLE);
  assert.equal(g.name, "Ridgeline & Tarn");
  assert.equal(g.points.length, 4);
  assert.equal(g.points[0].ele, 120);
  assert.equal(g.points[0].time.toISOString(), "2024-01-01T00:00:00.000Z");
  assert.equal(g.points[2].ele, undefined);
  assert.equal(g.points[3].name, "Trailhead");
});

test("toGpx round-trips through parseGpx", function () {
  const points = [
    { lat: -36.8, lon: 174.7, ele: 120 },
    { lat: -36.81, lon: 174.71, ele: 180 },
  ];
  const xml = toGpx(points, { name: "Test route" });
  const back = parseGpx(xml);
  assert.equal(back.points.length, 2);
  assert.equal(back.name, "Test route");
  assert.equal(back.points[1].ele, 180);
});

test("toGpx writes waypoints and parseGpx reads them back", function () {
  const points = [{ lat: -36.8, lon: 174.7, ele: 120 }, { lat: -36.81, lon: 174.71, ele: 180 }];
  const xml = toGpx(points, {
    name: "Cue test",
    waypoints: [
      { lat: -36.805, lon: 174.705, ele: 150, name: "1.0 km", desc: "Planned 09:12" },
      { lat: -36.81, lon: 174.71, ele: 180, name: "Turnaround" },
    ],
  });
  assert.ok(xml.includes("<wpt lat=\"-36.805\" lon=\"174.705\">"));
  assert.ok(xml.includes("<name>Turnaround</name>"));
  const back = parseGpx(xml);
  assert.equal(back.points.length, 4);
  assert.ok(back.points.some(function (p) { return p.name === "1.0 km"; }));
});

test("parseGpx rejects non-string input", function () {
  assert.throws(function () { parseGpx(null); }, TypeError);
});
