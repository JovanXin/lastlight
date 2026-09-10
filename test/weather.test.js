import test from "node:test";
import assert from "node:assert/strict";
import { describeCode, summarizeWindow, forecastUrl } from "../src/services/weather.js";

test("describeCode maps WMO codes to labels", function () {
  assert.equal(describeCode(0).label, "Clear");
  assert.equal(describeCode(65).label, "Heavy rain");
  assert.equal(describeCode(95).label, "Thunderstorm");
  assert.equal(describeCode(1234).label, "Mixed");
});

test("summarizeWindow reports the worst case inside the window", function () {
  const hours = [];
  for (let i = 0; i < 24; i++) {
    hours.push({ atMs: i * 3600000, tempC: 10 + i, precipProb: i, windKph: 5 + i, code: i === 12 ? 95 : 1 });
  }
  const s = summarizeWindow(hours, 6 * 3600000, 12 * 3600000);
  assert.equal(s.hours, 7);
  assert.equal(s.minTempC, 16);
  assert.equal(s.maxTempC, 22);
  assert.equal(s.maxPrecipProb, 12);
  assert.equal(s.maxWindKph, 17);
  assert.equal(s.worstCode, 95);
  assert.equal(s.worst.label, "Thunderstorm");
});

test("summarizeWindow falls back to all hours when the window is empty", function () {
  const hours = [{ atMs: 0, tempC: 5, precipProb: 10, windKph: 8, code: 2 }];
  const s = summarizeWindow(hours, 999999, 1000000);
  assert.equal(s.hours, 1);
  assert.equal(s.inWindow, 0);
});

test("forecastUrl requests the start day and the next", function () {
  const url = forecastUrl(-36.8, 174.8, new Date(2026, 0, 5));
  assert.ok(url.includes("start_date=2026-01-05"));
  assert.ok(url.includes("end_date=2026-01-06"));
  assert.ok(url.includes("precipitation_probability"));
});
