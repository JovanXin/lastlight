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

// When the plan finishes, and how much of it happens after sunset.
export function analyzeFinish(startMs, planMinutes, sunsetMs) {
  const finishMs = startMs + (Number(planMinutes) || 0) * 60000;
  const darkMinutes = sunsetMs == null ? 0 : Math.max(0, (finishMs - sunsetMs) / 60000);
  return {
    finishMs: finishMs,
    finishAt: new Date(finishMs),
    darkMinutes: darkMinutes,
    needHeadlamp: darkMinutes > 0,
  };
}
