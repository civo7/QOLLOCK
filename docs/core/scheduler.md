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
- **Persistent HUD & Hideout Lifecycle Gating**: Deadlock's `CitadelHud` persists across match transitions and gains the `.InHideout` class when returning to the main menu lobby (sandbox environment). In this state, native in-game HUD elements are collapsed by Valve's CSS (`opacity: 0; pre-transform-scale2d: 0.9`).
- **Idle Rate Backoff (1.5s)**: In-match polling loops created via `createPollLoop` automatically detect `.InHideout` and back off execution to `1.5s` (skipping DOM traversals and style mutations). This prevents render-thread layout thrashing, avoids resetting CSS transitions, and completely eliminates post-match frame hitching and jitter at 200 FPS. Features requiring hideout execution can specify `options.runsInHideout = true`.
- **Instant Match Wakeup (`wakeAllLoops`)**: Upon receiving `engine:game_state_changed` (e.g. entering a match), `wakeAllLoops()` immediately awakens all backed-off loops, resuming configured polling frequencies (e.g. 50ms) without delay.

