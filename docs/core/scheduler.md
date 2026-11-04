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
| `startBenchmark(durationSec, onComplete, options?)` | Starts callback timing; returns `{stop()}` or null if State is unavailable. Completion receives `(report, stats)`. The optional current-config `capturePanelLookups` diagnostic probes `FindChildTraverse` calls from `panelRoot`; it does not count native traversal steps. |
| `isBenchmarkActive()` | Reports the current benchmark flag. |
| `formatBenchmarkReport(stats, durationSec, activeCount)` | Formats recorded benchmark data, not rendered frame timings. |
| `getWorkSnapshot()` | Read-only array of `{id, polls, once}` outstanding managed tasks, without panel handles. |
| `startWorkObservation()` | Opt-in bounded observation; returns `{sample(), stop(), pausePolling(ids), isPollPaused(id), isActive()}`. Replacement retires the previous observer and releases its diagnostic poll pause. |

The first tick has jitter up to half the interval. Subsequent client poll delays
vary randomly by up to ten percent around the requested rate, including while
diagnostically paused, to spread recurring work after late deliveries. Virtual-clock
regressions retain exact recurring intervals; separate controlled-random tests
exercise the client path, rate changes and cancellation. This spreads scheduling
requests, not guaranteed native frame delivery or measured FPS.
`reschedule` changes the rate
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
The optional lookup probe temporarily wraps each writable `FindChildTraverse`
instance binding found in the starting HUD tree. October 17 native client
capability evidence showed these are own panel properties, so prototype-only
hooks miss them. The bounded census runs before timing; completion/stop restores
original own descriptors or removes only the observer's inherited shadow.
Bindings replaced by someone else are preserved and reported as displaced.
Readonly bindings remain uncovered; cleanup failures are counted. Retained
wrapper aliases stop recording after the session stops.

`panelsCovered` describes successfully wrapped bindings at the initial census,
not all native calls. Earlier aliases, panels created later and other JS realms
remain unobserved. A successful hook reports `partial-tree`, `fullModCoverage`
remains false, and no visits/s or FPS estimate is derived from these counts.
The legacy `prototypesHooked` field stays zero. This diagnostic runs only in the
current-config Dev benchmark, not normal polling or the expanded-config run.

Native configuration investigations use `startBenchmark` with `quiet: true` to
retain the same callback accounting while suppressing startup, heartbeat and
completion console output. The handle, timing and completion semantics are
unchanged. This does not suppress feature-owned perf logging or overlays.

## Managed one-shot callbacks

`scheduleOnce(callback, delaySec, featureId)` returns an idempotent `{stop()}`.
It removes itself before invoking the callback; feature cancellation and native
owner invalidation suppress pending work. Zero delay is valid; negative/nonfinite
delays normalize to zero. Errors are logged and emitted as `scheduler:error`.
One-shots do not record polling timings or emit `scheduler:tick_ok`.
Owner validity exceptions also stop recurring loops safely.

## Transition work observation

The HUD state recorder uses `startWorkObservation()` independently of the
benchmark. `sample()` drains interval counters (completed callbacks, summed and
maximum elapsed milliseconds, slowest owner, maximum delivery delay and errors)
and counts outstanding managed polls/one-shots. `stop()` detaches observation
and returns per-owner totals plus sampled start/peak/end outstanding counts.
Repeated stop calls return stable copies; an old stop cannot stop a newer observer.
There are at most 128 owner rows; overflow is aggregated under `<other>`.

The active observation may lease a diagnostic pause with `pausePolling(ids)`;
an empty list resumes all its selected owners. Only managed recurring callbacks
are skipped: tasks remain registered and scheduled at their normal cadence, and
native context validity checks still run. Skipped callbacks do not count as
executed work. One-shots, event/settings hooks and other owners continue. Stop
or replacement releases the pause automatically; a retired observer cannot
pause work again. `isActive()` lets the diagnostic reject superseded observation.
This is for brief controlled comparisons with retained panels, not production
work reduction: source discovery and lifecycle reconciliation are paused too.

Observation creates no timers and performs no panel traversal or logging. The
caller owns sampling and cancellation. Timing and per-callback aggregation only
run while observation is active. The census sees feature-owned managed work;
unowned tasks have callback timing but no registered outstanding-task count.
Peaks between samples can be missed. A poll finishing after a capture is stopped
is not added to that capture (including its final recorder callback).

Delivery delay is `callback start - scheduled due time`, clamped to zero. The
first pending delivery scheduled before observation has no due-time measurement.
It can reflect loading, focus throttling, other engine work or clock adjustments;
it does not identify a guilty callback. Elapsed callback time uses Date-based
milliseconds and includes synchronous native work/error handling, not deferred
layout or rendering. Raw schedules, event handlers, separate quickbuy/settings/
profile contexts, GPU and FPS remain outside coverage. Zero values do not
exonerate those paths. See [HUD recording](../ui/hud_state_recording.md).
