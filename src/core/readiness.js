// Pre-trip readiness: one judgement that pulls the separate signals together
// into a single answer, with the reasoning attached.

export const READINESS = { GO: "go", CAUTION: "caution", NOGO: "no-go" };

export const THRESHOLDS = Object.freeze({
  severeWindKph: 80,
  strongWindKph: 45,
  likelyRainPercent: 60,
  freezingTempC: 2,
  twilightMinutes: 30,
  thunderstormCode: 95,
});

export function assessReadiness(input) {
  const i = input || {};
  const T = THRESHOLDS;
  const reasons = [];
  let level = READINESS.GO;

  const raise = function (next, text) {
    if (next === READINESS.NOGO) level = READINESS.NOGO;
    else if (next === READINESS.CAUTION && level !== READINESS.NOGO) level = READINESS.CAUTION;
    reasons.push({ level: next, text: text });
  };

  if (i.verdict === "past") {
    raise(READINESS.NOGO, "The turnaround window has already closed.");
  }
  if (typeof i.worstCode === "number" && i.worstCode >= T.thunderstormCode) {
    raise(READINESS.NOGO, "Thunderstorms are forecast in the plan window.");
  }
  if (typeof i.maxWindKph === "number" && i.maxWindKph >= T.severeWindKph) {
    raise(READINESS.NOGO, "Severe wind, up to " + Math.round(i.maxWindKph) + " km/h.");
  } else if (typeof i.maxWindKph === "number" && i.maxWindKph >= T.strongWindKph) {
    raise(READINESS.CAUTION, "Strong wind, up to " + Math.round(i.maxWindKph) + " km/h.");
  }
  if (typeof i.maxPrecipProb === "number" && i.maxPrecipProb >= T.likelyRainPercent) {
    raise(READINESS.CAUTION, "Rain is likely (" + Math.round(i.maxPrecipProb) + "%).");
  }
  if (typeof i.minTempC === "number" && i.minTempC <= T.freezingTempC) {
    raise(READINESS.CAUTION, "Near freezing at " + Math.round(i.minTempC) + "\u00b0C; watch for ice.");
  }
  if (typeof i.darkMinutes === "number" && i.darkMinutes >= T.twilightMinutes) {
    raise(READINESS.CAUTION, "The plan finishes after sunset; take a headlamp.");
  }
  if (i.wholeTripFits === false) {
    raise(READINESS.CAUTION, "The full route does not fit in daylight; plan to turn around early.");
  }
  if (i.verdict === "turn") {
    raise(READINESS.CAUTION, "You are at the turnaround point now.");
  }

  if (!reasons.length) {
    reasons.push({ level: READINESS.GO, text: "Daylight, weather and turnaround all look workable." });
  }

  const penalty = reasons.reduce(function (sum, r) {
    return sum + (r.level === READINESS.NOGO ? 60 : r.level === READINESS.CAUTION ? 20 : 0);
  }, 0);

  return {
    level: level,
    score: Math.max(0, 100 - penalty),
    reasons: reasons,
  };
}
