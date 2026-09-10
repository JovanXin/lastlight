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
- 28 unit tests covering every core module.
- MIT license, README and project scaffolding.
