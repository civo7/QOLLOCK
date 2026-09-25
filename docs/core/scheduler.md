# `panorama/scripts/core/ql_scheduler.js`

## Purpose
Provides a cooperative polling scheduler and performance timing harness (`QOL.core.Scheduler` / `QOL.core.perf`). Tracks per-feature tick counts, average/maximum execution time in milliseconds, and frame spike detections.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/core/ql_logger.js` (`QOL.core.Logger`)

## Interface (`QOL.core.Scheduler`)
- `createPollLoop(fn, intervalSec, featureId)`: Creates and starts a managed polling loop ticking at `intervalSec`. Returns a controller object `{ stop(), reschedule(newIntervalSec) }`.
- `schedule(fn, intervalSec, featureId)`: Alias of `createPollLoop`; this is recurring, not one-shot execution.
- `cancelAllForFeature(featureId)` / `cancelAll(featureId)`: Stops the registered polling loops for a feature.
- `getTimings(featureId?)`: Returns recorded timings for one feature or all features while profiling is enabled.
- `resetTimings(featureId?)`: Clears recorded timings.
- `startBenchmark(durationSec, onComplete)`: Initiates a live in-game benchmark over `durationSec` seconds with periodic progress heartbeats, spike detection alerts (>= 8ms), and structured console reporting upon completion. Returns `{ stop() }`.

## Performance & Lifecycle Invariants
- High-frequency polling (< 0.2s / > 5Hz) requires explicit `// rate-exempt: <reason>` documentation enforced by `tests/manifest_poll_rates.test.js`.
- Features that can be event-driven should use native engine events and reduce their idle polling rate to 1.0s or 0.5s.
- Poll loops stop when their owning context panel becomes invalid. This protects callbacks from touching destroyed HUD trees.
- The scheduler does not suppress callbacks based on `.InHideout`. Features need their callbacks to hide stale overlays, restore native UI, or handle lobby controls. The removed blanket gate prevented the custom cursor from clearing `cursor:none` on entry to Hideout.
- Hideout work reduction belongs inside each feature, after required cleanup. Keep probe backoff and style-signature caching where their behavior is understood.
- Source checks and offline scenarios cannot establish FPS improvements, compositor costs, or whether the client preserves a HUD across every transition. Measure those in the game after repacking.

