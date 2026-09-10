# Lastlight

**Know your turnaround before the mountain decides for you.**

Lastlight is an offline-first hiking companion built around a single question that
every other trail app answers badly: *given where I am right now, how much further
can I safely go and still get back before dark?*

Existing apps show you a line on a map. Lastlight runs a live **turnaround clock**
that folds together the terrain still ahead, your actual pace, the daylight left,
your safety margin, and the nearest way out.

![Lastlight showing a live turnaround](docs/screens/app-initial.png)

---

## The idea

Most incidents on day hikes are not navigational. They are timing failures: a late
start, a slower-than-planned climb, a wrong turn, a sunset that arrives sooner than
the summit did. Turnaround time is taught in every hiking book and practised by
almost nobody, because working it out mid-hike is hard.

Lastlight makes it a number you can glance at.

## What it does

- **Live turnaround clock** - the latest time you may keep going, recomputed from
  your real position and pace, not a static plan.
- **Go / caution / turn verdict** - one glanceable state for the current moment.
- **Bailout radar** - nearby fire roads, huts and trailheads, ranked by whether you
  can actually reach them before the light goes, including off-trail detours.
- **Terrain-aware pacing** - Tobler’s hiking function blended with a moving ratio,
  so a 20% grade costs what it should.
- **Real daylight** - sunrise, sunset and civil/nautical/astronomical twilight
  computed on-device for your exact latitude and longitude. No API, no network.
- **Offline first** - a service worker and local storage keep it working with no
  signal, because that is exactly where it matters.

## Architecture

The safety-critical maths lives in small, dependency-free, unit-tested modules under
`src/core/`. The UI is plain ES modules, so there is no build step and no supply
chain to trust on a mountain.

| Module | Responsibility |
| --- | --- |
| `src/core/geo.js` | Haversine distance, linear-referenced route profiles, elevation gain/loss |
| `src/core/pace.js` | Tobler hiking function, moving-ratio scheduling, cumulative time |
| `src/core/solar.js` | NOAA solar position, sunrise/sunset and twilight, polar day/night |
| `src/core/turnaround.js` | Turnaround distance, live clock, verdicts, bailout ranking |
| `src/core/gpx.js` | Dependency-free GPX 1.1 import and export |

## Develop

```sh
npm test      # 28 unit tests, no dependencies
npm start     # serve the app locally on http://localhost:5173
```

Requires Node 20 or newer. There are no runtime dependencies.

## Roadmap

- [x] Core geodesy, pacing, solar and turnaround engines with tests
- [x] Canvas map engine, route drawing, GPX import/export
- [x] Elevation profile with live position scrubbing
- [x] Live turnaround HUD, verdicts and the "behind schedule" stress test
- [x] Bailout radar on the map
- [x] Offline PWA shell (service worker, tile caching)
- [ ] Local route store and trip history (IndexedDB)
- [ ] Weather window and elevation lookups
- [ ] Personal pace calibration from recorded hikes
- [ ] Group mode: pace to the slowest member
- [ ] Shareable safety check-in card

## License

MIT © Jovan Xin
