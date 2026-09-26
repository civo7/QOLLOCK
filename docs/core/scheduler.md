# Scheduler and callback timing

Source: `panorama/scripts/core/ql_scheduler.js`; exports `QOL.core.Scheduler`
and `QOL.core.perf`. Uses namespace, leaf timing utilities and optional EventBus;
performance records live in the existing State.

| API | Contract |
| --- | --- |
| `createPollLoop(callback, rateSec, featureId)` | Starts recurring work; returns `{stop(), reschedule(newRateSec)}`. Use the real feature ID so lifecycle cancellation/error attribution works. |
| `schedule(callback, rateSec, featureId)` | Alias for recurring polling, not a one-shot timeout. |
| `cancelAllForFeature(id)` / `cancelAll(id)` | Cancel managed loops for that one feature. |
| `getTimings(featureId?)`, `resetTimings(featureId?)` | Read/reset recorded per-feature callback statistics. |
| `startBenchmark(durationSec, onComplete)` | Starts callback timing; returns `{stop()}` or null if State is unavailable. Completion receives `(report, stats)`. |
| `isBenchmarkActive()` | Reports the current benchmark flag. |
| `formatBenchmarkReport(stats, durationSec, activeCount)` | Formats recorded benchmark data, not rendered frame timings. |

The first tick has jitter up to half the interval. `reschedule` changes the rate
for subsequent scheduling; it does not cancel and immediately restart a pending
tick. `stop` is idempotent. Nonpositive/invalid rates fall back to the implementation's
rate; callers should pass deliberate valid intervals instead of relying on it.

A loop stops when its captured native context reports invalid. It does not
blanket-skip hideout callbacks. Features own hidden-state work reduction and
cleanup; a callback may be required to restore native UI on transitions.

Thrown callback errors are logged and emitted as `scheduler:error`; polling
continues unless stopped/circuit-broken by FeatureRegistry. Success after an
error emits `scheduler:tick_ok`. Avoid silently swallowing unexpected errors.
The Scheduler does not own unrelated raw `$.Schedule` handles or subscriptions.

High-frequency manifest loops need the existing `rate-exempt` explanation checked
by `tests/manifest_poll_rates.test.js`; prefer event-driven or lower-frequency
work where the native contract permits it.

Timing is recorded only when performance collection/benchmarking is enabled.
The clock is `QOL_UTILS.PerfNowMs` (currently Date-based), so output decimals do
not imply sub-millisecond precision. Stats cover synchronous callback/native
work, not deferred layout, rendering, GPU work or all JS. Benchmark spike counts
currently use a 4ms threshold; historical 8ms descriptions are obsolete.
See [PROFILING.md](../PROFILING.md) for valid comparisons and client verification.
