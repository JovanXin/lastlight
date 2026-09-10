# Concepts

This is the reasoning behind the numbers, in one place. If you disagree with a
constant, this is the file to argue with.

## The turnaround clock

Most apps assume the plan is the plan. Lastlight assumes the plan is a starting
point and keeps answering one question: *given where I am and what time it is,
how much further can I safely go?*

There are two deadlines, and they are different:

- **Strategic deadline** — the clock time by which you must reach the furthest
  safe point. `dusk - margin - returnTime(furthestPoint)`. Miss it and the
  furthest point is no longer reachable within daylight.
- **Tactical deadline** — the last clock time you may start back *from where you
  stand now*. `dusk - margin - returnTime(currentPosition)`. Miss this one and
  even turning immediately lands you in the dark.

The HUD shows the strategic countdown, because that is the decision you are
actually making while walking. The verdict switches to *turn around now* once
the strategic deadline passes, and to *past turnaround* only when the tactical
deadline has also gone.

## The furthest safe point

Walking the profile from the start, the app finds the greatest distance `d` such
that

```
outboundTime(d) + returnTime(d) + margin <= minutesUntilDusk
```

Because both schedules are monotone in distance, this is a single scan, not a
search. If the whole route satisfies it, the furthest safe point is simply the
end of the route — the app says so rather than inventing a limit.

## Pace

Segment speed comes from **Tobler's hiking function**:

```
speed_kmh(grade) = 6 * exp(-3.5 * |grade + 0.05|)
```

which peaks around 5 km/h on a gentle descent and collapses on steep ground.
Three adjustments sit on top:

- **speed factor** — the walker's own multiplier against the model.
- **moving ratio** — the share of elapsed time actually spent walking. Breaks,
  photos and route-finding live in the remainder, so elapsed = moving / ratio.
- **group factor** — plans for the slowest member, because a party is only as
  fast as the person at the back.

## Daylight

Sunrise, sunset and civil, nautical and astronomical twilight are computed
on-device from latitude, longitude and date using the standard low-precision
solar position algorithm, accurate to about a minute at mid-latitudes.

The default is the **end of civil twilight**, not sunset, because a surprising
number of epics are completed in the half hour after the sun goes down. The
**safety margin** is subtracted from that; the default is 30 minutes.

## The feasibility distinction

A late start creates a subtle trap. The full route may finish after sunset,
but the correct response is to turn around early, not to walk into the dark.
So the darkness warning is based on the **feasible** finish:

- if the whole route fits in the day, the finish is the full plan;
- if it does not, the finish is dusk minus the margin, because following the
  turnaround advice brings you back by then.

That is why a late start with a healthy margin shows no headlamp warning, while
the same start with no margin does.

## Bailouts

Each escape point is scored by estimating time to reach it off-trail: straight
line distance inflated by a detour factor, with any climb fully penalised. It is
then compared against dusk minus the margin. The result answers a different
question from the turnaround: not "how far can I go?" but "where can I get off
the hill from here?"

## Units and conventions

- Distances are metres internally, kilometres in the UI.
- Times are JavaScript `Date` instants; the UI formats them in local time.
- Grades are rise over run, dimensionless.
- Verdicts are `go`, `caution`, `turn`, `past`, with `idle` for no route.
