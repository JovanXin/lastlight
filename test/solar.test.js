import test from "node:test";
import assert from "node:assert/strict";
import { sunTimes, dayLengthMinutes } from "../src/core/solar.js";

function minutesBetween(a, b) { return Math.abs(a.getTime() - b.getTime()) / 60000; }

test("London sunrise/sunset on the 2024 summer solstice", function () {
  const t = sunTimes(new Date(Date.UTC(2024, 5, 21, 12)), 51.5074, -0.1278);
  // Published values: 03:43 UTC sunrise, 20:21 UTC sunset.
  assert.ok(minutesBetween(t.sunrise, new Date(Date.UTC(2024, 5, 21, 3, 43))) < 6, "sunrise " + t.sunrise.toISOString());
  assert.ok(minutesBetween(t.sunset, new Date(Date.UTC(2024, 5, 21, 20, 21))) < 6, "sunset " + t.sunset.toISOString());
  assert.ok(t.sunrise < t.solarNoon && t.solarNoon < t.sunset);
});

test("Auckland winter sunrise/sunset", function () {
  const t = sunTimes(new Date(Date.UTC(2024, 5, 21, 0)), -36.8485, 174.7633);
  assert.ok(minutesBetween(t.sunrise, new Date(Date.UTC(2024, 5, 20, 19, 35))) < 8, "sunrise " + t.sunrise.toISOString());
  assert.ok(minutesBetween(t.sunset, new Date(Date.UTC(2024, 5, 21, 5, 11))) < 8, "sunset " + t.sunset.toISOString());
});

test("twilight events bracket sunrise and sunset", function () {
  const t = sunTimes(new Date(Date.UTC(2024, 2, 20, 12)), 51.5074, -0.1278);
  assert.ok(t.civilDawn < t.sunrise);
  assert.ok(t.sunset < t.civilDusk);
  assert.ok(t.nauticalDawn < t.civilDawn);
  assert.ok(t.civilDusk < t.nauticalDusk);
});

test("polar day in Tromso in June and polar night in December", function () {
  const june = sunTimes(new Date(Date.UTC(2024, 5, 21, 12)), 69.6492, 18.9553);
  assert.equal(june.polar, "day");
  assert.equal(june.sunrise, null);
  const dec = sunTimes(new Date(Date.UTC(2024, 11, 21, 12)), 69.6492, 18.9553);
  assert.equal(dec.polar, "night");
  assert.equal(dec.sunrise, null);
});

test("day length increases toward summer in the northern hemisphere", function () {
  const spring = dayLengthMinutes(new Date(Date.UTC(2024, 2, 20, 12)), 51.5, -0.12);
  const summer = dayLengthMinutes(new Date(Date.UTC(2024, 5, 21, 12)), 51.5, -0.12);
  assert.ok(summer > spring + 120, "spring " + spring + " summer " + summer);
});
