// =============================================================================
// QOLLOCK — core/ql_scheduler.js
// =============================================================================
// OWNS:        Self-cancelling $.Schedule poll loops for features.
//              createPollLoop(cb, rateSec, featureId) → {stop, reschedule}.
//              cancelAllForFeature(id). Observational perf tracking.
//              Internal phase staggering. Zero-handle safety.
// DOES NOT OWN: Feature lifecycle (FeatureRegistry), panel access (PanelCache),
//               config (ConfigStore), logging (Logger).
// DEPENDS ON:  core/ql_namespace.js (QOL.core)
// USED BY:     Feature manifests (via QOL.core.Scheduler)
// GOTCHAS:     $.Schedule returns a number handle. $.CancelScheduled is safe with
//              already-fired handles (no-throw). Raw $.Schedule() is BANNED
//              in feature code — use createPollLoop().
// LOAD ORDER:  4th — after ql_event_bus.js
//
// Boundary validation: Checks QOL.core exists. Aborts with message if not.
// =============================================================================

(function () {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_scheduler: QOL.core not found — aborting. " +
              "Is core/ql_namespace.js loaded first?");
        return;
    }

    var _loops = {};

    // Optional EventBus for error reporting (loaded before us by ql_event_bus.js)
    var EventBus = (QOL.core && QOL.core.EventBus) ? QOL.core.EventBus : null;

    // Date.now() for per-tick elapsed measurement (sub-frame precision).
    // $.FrameTime() is monotonic but only updates once per frame (~16ms),
    // so fast callbacks always show 0 elapsed. Date.now() has ~1ms precision.
    // Clock changes don't matter here — we're measuring a <1ms delta.
    function _nowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }

    function _getState() {
        if (typeof QOL !== "undefined" && QOL.state) return QOL.state;
        if (typeof State !== "undefined" && State) return State;
        if (typeof globalThis !== "undefined" && globalThis.State) return globalThis.State;
        return null;
    }

    // Unified perf recording — writes directly to State.perfStats with "mf." prefix,
    // same accumulator that PerfRecord uses. ResetPerfWindow() naturally gives both
    // dispatch features and manifest poll loops the same rolling window.
    function _recordTiming(featureId, elapsedMs) {
        try {
            var state = _getState();
            if (!state || !state.perfEnabled) return;
            var stats = state.perfStats;
            if (!stats) return;
            var key = "mf." + featureId;
            var entry = stats[key];
            if (!entry) {
                entry = { count: 0, total: 0, max: 0, slow: 0 };
                stats[key] = entry;
            }
            entry.count += 1;
            entry.total += elapsedMs;
            if (elapsedMs > entry.max) entry.max = elapsedMs;
            if (elapsedMs >= 8) entry.slow += 1;
        } catch(e) { /* best-effort — perf tracking is non-critical */ }
    }

    function _removeRegisteredLoop(featureId, loop) {
        if (typeof featureId !== "string" || !featureId || !loop) return;
        var list = _loops[featureId];
        if (!list) return;
        for (var i = list.length - 1; i >= 0; i--) {
            if (list[i] === loop) list.splice(i, 1);
        }
        if (list.length === 0) delete _loops[featureId];
    }

    // -- Public API --
    function createPollLoop(callback, rateSec, featureId) {
        if (typeof callback !== "function") {
            $.Msg("[QOLLock][WARN][Scheduler] createPollLoop requires a function callback");
            return { stop: function () {}, reschedule: function () {} };
        }

        var _stopped = false;
        var _rate = (typeof rateSec === "number" && rateSec > 0) ? rateSec : 0.2;
        var _handle = null;
        var _hadError = false;
        var loop = null;

        function tick() {
            if (_stopped) return;
            var perfActive = false;
            try {
                var s = _getState();
                perfActive = !!(s && s.perfEnabled);
            } catch(ePerf) {}
            var t0 = perfActive ? _nowMs() : 0;
            var _threw = false;
            try {
                callback();
            } catch (e) {
                _threw = true;
                _hadError = true;
                var _errMsg = (e && e.message ? e.message : String(e));
                // P2: emit event so FeatureRegistry can track error streaks and auto-disable
                if (EventBus && typeof featureId === "string" && featureId) {
                    try { EventBus.emit("scheduler:error", { featureId: featureId, message: _errMsg, timestamp: _nowMs() }); } catch(_evErr) { /* best-effort */ }
                }
                $.Msg("[QOLLock][ERROR][Scheduler] poll loop threw — " + _errMsg + " (continuing)");
            }
            // A success event is only useful after this loop has failed. Avoid an
            // allocation + EventBus dispatch on every healthy poll tick.
            if (!_threw && _hadError && EventBus && typeof featureId === "string" && featureId) {
                try { EventBus.emit("scheduler:tick_ok", { featureId: featureId }); } catch(_evOkErr) { /* best-effort */ }
                _hadError = false;
            }
            if (perfActive && typeof featureId === "string" && featureId) {
                var elapsed = _nowMs() - t0;
                _recordTiming(featureId, elapsed);
            }
            if (!_stopped) {
                _handle = $.Schedule(_rate, tick);
            }
        }

        // Jitter first tick (0-50% of rate) to prevent frame-aligned spikes
        var jitter = (typeof Math !== "undefined" && Math.random) ? Math.random() * _rate * 0.5 : 0;
        _handle = $.Schedule(jitter, tick);

        loop = {
            stop: function () {
                if (_stopped) return;
                _stopped = true;
                if (_handle !== null) { $.CancelScheduled(_handle); _handle = null; }
                _removeRegisteredLoop(featureId, loop);
            },
            reschedule: function (newRateSec) {
                if (typeof newRateSec === "number" && newRateSec > 0) { _rate = newRateSec; }
            }
        };

        if (typeof featureId === "string" && featureId) {
            if (!_loops[featureId]) { _loops[featureId] = []; }
            _loops[featureId].push(loop);
        }

        return loop;
    }

    function cancelAllForFeature(featureId) {
        var list = _loops[featureId];
        if (!list) return;
        // Delete first because stop() unregisters itself. This keeps iteration
        // stable and makes cancelAll safe for one or many loops.
        delete _loops[featureId];
        for (var i = 0; i < list.length; i++) {
            try { list[i].stop(); } catch (e) { /* best-effort */ }
        }
    }

    function getTimings(featureId) {
        var state = _getState();
        var stats = (state && state.perfStats) || {};
        if (featureId) {
            var key = "mf." + featureId;
            var e = stats[key];
            if (!e || e.count <= 0) return null;
            return { avgMs: e.total / e.count, maxMs: e.max, calls: e.count,
                     totalMs: e.total, lastMs: 0, lastAt: 0 };
        }
        var result = {};
        for (var k in stats) {
            if (stats.hasOwnProperty(k) && k.indexOf("mf.") === 0) {
                var ee = stats[k];
                if (ee.count <= 0) continue;
                var id = k.substring(3);
                result[id] = { avgMs: ee.total / ee.count, maxMs: ee.max, calls: ee.count,
                               totalMs: ee.total, lastMs: 0, lastAt: 0 };
            }
        }
        return result;
    }

    function resetTimings(featureId) {
        try {
            var state = _getState();
            var stats = state && state.perfStats;
            if (!stats) return;
            if (featureId) { delete stats["mf." + featureId]; }
            else {
                for (var k in stats) {
                    if (stats.hasOwnProperty(k) && k.indexOf("mf.") === 0) delete stats[k];
                }
            }
        } catch(e) { /* best-effort */ }
    }

    var perfApi = {
        schedule: createPollLoop,
        createPollLoop: createPollLoop,
        cancelAll: cancelAllForFeature,
        cancelAllForFeature: cancelAllForFeature,
        getTimings: getTimings,
        resetTimings: resetTimings
    };

    QOL.core.perf = perfApi;
    QOL.core.Scheduler = perfApi;

    $.Msg("[QOLLock] core/ql_scheduler: attached to QOL.core.perf and QOL.core.Scheduler");
})();
