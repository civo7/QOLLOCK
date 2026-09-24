# `panorama/scripts/core/ql_scheduler.js`

## Purpose
Provides a cooperative polling scheduler and performance timing harness (`QOL.core.Scheduler` / `QOL.core.perf`). Tracks per-feature tick counts, average/maximum execution time in milliseconds, and frame spike detections.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/core/ql_logger.js` (`QOL.core.Logger`)

## Interface (`QOL.core.Scheduler`)
- `createPollLoop(fn, intervalSec, featureId)`: Creates and starts a managed polling loop ticking at `intervalSec`. Returns a controller object `{ stop(), reschedule(newIntervalSec) }`.
- `schedule(delaySec, fn, featureId)`: One-shot delayed execution wrapped with error isolation and timing metrics.
- `cancel(handle)`: Cancels a pending scheduled handle.
- `cancelAllForFeature(featureId)`: Cancels all active timers and loops associated with a given feature.
- `getStats()`: Returns execution metrics dictionary `{ <featureId>: { count, total, max, slow } }`.
- `resetStats()`: Resets all benchmark counters.
- `startBenchmark(durationSec, onComplete)`: Initiates a live in-game benchmark over `durationSec` seconds with periodic progress heartbeats, spike detection alerts (>= 8ms), and structured console reporting upon completion. Returns `{ stop() }`.

## Performance & Lifecycle Invariants
- High-frequency polling (< 0.2s / > 5Hz) requires explicit `// rate-exempt: <reason>` documentation enforced by `tests/manifest_poll_rates.test.js`.
- Features that can be event-driven should use native engine events and reduce their idle polling rate to 1.0s or 0.5s.
- Polling loops created via `createPollLoop` verify the validity of their owner panel context (`$.GetContextPanel()`). If the owner panel is destroyed (such as when leaving a match back to the lobby), the loop automatically self-terminates (`loop.stop()`), eliminating orphaned background timers and post-match stuttering/hitching.
