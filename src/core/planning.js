// Planning aids that sit between the pace model and the daylight engine:
// how late you can start, and whether the plan finishes in the dark.

export function totalPlanMinutes(outbound, inbound, mode) {
  if (!outbound) return 0;
  if (mode === "loop") return outbound.totalMinutes || 0;
  return (outbound.totalMinutes || 0) + (inbound ? inbound.totalMinutes || 0 : 0);
}

// Latest clock time you can leave the trailhead and still finish in daylight.
export function latestStart(duskMs, marginMinutes, planMinutes) {
  if (duskMs == null) return null;
  return new Date(duskMs - (Number(marginMinutes) || 0) * 60000 - (Number(planMinutes) || 0) * 60000);
}

// The finish time you will actually experience. If the whole route fits, that
// is start plus the full plan; if it does not, good practice is to turn at the
// safe point and be back by dusk minus the margin.
export function feasibleFinish(startMs, planMinutes, fits, duskMs, marginMinutes) {
  const full = startMs + (Number(planMinutes) || 0) * 60000;
  if (fits !== false || duskMs == null) return full;
  return duskMs - (Number(marginMinutes) || 0) * 60000;
}

// How much of a finish happens after sunset.
export function darknessAt(finishMs, sunsetMs) {
  const darkMinutes = sunsetMs == null ? 0 : Math.max(0, (finishMs - sunsetMs) / 60000);
  return {
    finishMs: finishMs,
    finishAt: new Date(finishMs),
    darkMinutes: darkMinutes,
    needHeadlamp: darkMinutes > 0,
  };
}

export function analyzeFinish(startMs, planMinutes, sunsetMs) {
  return darknessAt(startMs + (Number(planMinutes) || 0) * 60000, sunsetMs);
}
