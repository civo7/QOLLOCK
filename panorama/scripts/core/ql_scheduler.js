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
    var _timings = {};
    var _lastManifestPerfSync = 0;
    var _MAX_TIMING_SAMPLES = 120;

    function _syncManifestPerfToState() {
        try {
            if (typeof QOL === "undefined" || !QOL.state) return;
            var snapshot = {};
            for (var id in _timings) {
                if (_timings.hasOwnProperty(id)) {
                    var t = _timings[id];
                    // Only include features that have actually run (calls > 0)
                    if (t.calls > 0) {
                        snapshot[id] = { count: t.calls, total: t.totalMs, max: t.maxMs,
                                         avg: t.avgMs, lastMs: t.lastMs };
                    }
                }
            }
            QOL.state.manifestPerfStats = snapshot;
        } catch(e) { /* best-effort — perf tracking is non-critical */ }
    }

    // $.FrameTime() is monotonic (seconds since Panorama init).
    // Date.now() is NOT — system clock changes corrupt timing data.
    function _nowMs() {
        return $.FrameTime() * 1000;
    }

    function _recordTiming(featureId, elapsedMs) {
        if (!_timings[featureId]) {
            _timings[featureId] = { avgMs: elapsedMs, maxMs: elapsedMs,
                totalMs: elapsedMs, calls: 0, lastMs: elapsedMs, lastAt: $.FrameTime() };
        }
        var t = _timings[featureId];
        t.calls++;
        t.lastMs = elapsedMs;
        t.lastAt = $.FrameTime();
        t.totalMs += elapsedMs;
        if (elapsedMs > t.maxMs) { t.maxMs = elapsedMs; }
        var alpha = Math.min(1.0, 2.0 / Math.min(t.calls, _MAX_TIMING_SAMPLES));
        t.avgMs = t.avgMs + alpha * (elapsedMs - t.avgMs);
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

        function tick() {
            if (_stopped) return;
            var t0 = _nowMs();
            try {
                callback();
            } catch (e) {
                $.Msg("[QOLLock][ERROR][Scheduler] poll loop threw — " +
                      (e && e.message ? e.message : String(e)) + " (continuing)");
            }
            var elapsed = _nowMs() - t0;
            if (typeof featureId === "string" && featureId) {
                _recordTiming(featureId, elapsed);
                // Publish to State.manifestPerfStats for perf overlay visibility.
                // Debounced: only sync every ~1s to avoid per-tick State writes.
                var now = $.FrameTime();
                if (!_lastManifestPerfSync || now - _lastManifestPerfSync > 1.0) {
                    _lastManifestPerfSync = now;
                    _syncManifestPerfToState();
                }
            }
            if (!_stopped) {
                _handle = $.Schedule(_rate, tick);
            }
        }

        // Jitter first tick (0-50% of rate) to prevent frame-aligned spikes
        var jitter = (typeof Math !== "undefined" && Math.random) ? Math.random() * _rate * 0.5 : 0;
        _handle = $.Schedule(jitter, tick);

        var loop = {
            stop: function () { _stopped = true; if (_handle !== null) { $.CancelScheduled(_handle); _handle = null; } },
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
        for (var i = 0; i < list.length; i++) {
            try { list[i].stop(); } catch (e) { /* best-effort */ }
        }
        delete _loops[featureId];
    }

    function getTimings(featureId) {
        if (featureId) {
            var t = _timings[featureId];
            return t ? { avgMs: t.avgMs, maxMs: t.maxMs, calls: t.calls,
                         totalMs: t.totalMs, lastMs: t.lastMs, lastAt: t.lastAt } : null;
        }
        var result = {};
        for (var id in _timings) {
            if (_timings.hasOwnProperty(id)) {
                var tt = _timings[id];
                result[id] = { avgMs: tt.avgMs, maxMs: tt.maxMs, calls: tt.calls,
                               totalMs: tt.totalMs, lastMs: tt.lastMs, lastAt: tt.lastAt };
            }
        }
        return result;
    }

    function resetTimings(featureId) {
        if (featureId) { delete _timings[featureId]; }
        else { _timings = {}; }
    }

    QOL.core.Scheduler = {
        createPollLoop: createPollLoop,
        cancelAllForFeature: cancelAllForFeature,
        getTimings: getTimings,
        resetTimings: resetTimings
    };

    $.Msg("[QOLLock] core/ql_scheduler: attached to QOL.core.Scheduler");
})();
