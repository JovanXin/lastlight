# Changelog

All notable changes to Lastlight are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Core geodesy module: haversine distance, linear-referenced profiles,
  elevation gain/loss with noise thresholding, and resampling.
- Pace module implementing Tobler’s hiking function with a moving-ratio
  model and cumulative schedules in both directions.
- Offline solar engine for sunrise, sunset and civil/nautical/astronomical
  twilight, including polar day/night handling.
- Turnaround engine: furthest safe distance, live turnaround clock,
  go/caution/turn verdicts, loop slack analysis and bailout ranking.
- Dependency-free GPX 1.1 import/export.
- 54 unit tests covering every core and service module.
- MIT license, README, concepts, architecture and contributing docs.

### Added (application)
- Zero-dependency canvas slippy-map engine with OpenStreetMap tiles, panning,
  pinch zoom, route drawing, click-to-position and escape lines.
- Night map style produced by filtering the tiles on the canvas, so there is no
  tile provider key, plus a terrain toggle.
- Elevation profile with gradient area fill, bailout ticks, a turnaround marker,
  planned clock times, and pointer scrubbing to move the hiker.
- Live HUD, verdict card, turnaround card and bailout radar wired to the core
  engines, including a "behind schedule" control for stress-testing.
- Strategic vs tactical turnaround deadlines: how long until the furthest safe
  point becomes unreachable, versus the last moment to start back from here.
- Latest-start planning and a headlamp warning based on the feasible finish.
- Group pace for the slowest member, and pace calibration from a recorded hike.
- Live GPS tracking that projects each fix onto the route and shows fix quality.
- Optional Open-Meteo weather window and real terrain elevations, cached and
  failed soft offline.
- Saved trips in IndexedDB with session restore, and a shareable safety card
  (PNG plus check-in text).
- A printable trip plan sheet.
- Offline PWA: web manifest, a complete service-worker shell cache, saved map
  tiles for the route area, and quiet degradation with no network.
- GPX 1.1 import and export from the UI.
- Keyboard shortcuts and a screen-reader pass (labels, live region, focus
  management).
