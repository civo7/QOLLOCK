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

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q?.core) {
        $.Msg("[QOLLock] core/ql_scheduler: QOL.core not found — aborting. Is core/ql_namespace.js loaded first?");
        return;
    }

    const loops = new Map();

    // Optional EventBus for error reporting (loaded before us by ql_event_bus.js)
    const EventBus = Q.core.EventBus || null;

    // Date.now() for per-tick elapsed measurement (sub-frame precision).
    const nowMs = () => (Date.now ? Date.now() : (new Date()).getTime());

    const getState = () => {
        if (Q.state) return Q.state;
        if (typeof State !== "undefined" && State) return State;
        if (typeof globalThis !== "undefined" && globalThis.State) return globalThis.State;
        return null;
    };

    // Unified perf recording — writes directly to State.perfStats with "mf." prefix
    const recordTiming = (featureId, elapsedMs) => {
        try {
            const state = getState();
            if (!state?.perfEnabled) return;
            const stats = state.perfStats;
            if (!stats) return;
            const key = `mf.${featureId}`;
            let entry = stats[key];
            if (!entry) {
                entry = { count: 0, total: 0, max: 0, slow: 0 };
                stats[key] = entry;
            }
            entry.count += 1;
            entry.total += elapsedMs;
            if (elapsedMs > entry.max) entry.max = elapsedMs;
            if (elapsedMs >= 8) entry.slow += 1;
        } catch (_) { /* best-effort — perf tracking is non-critical */ }
    };

    const removeRegisteredLoop = (featureId, loop) => {
        if (typeof featureId !== "string" || !featureId || !loop) return;
        const list = loops.get(featureId);
        if (!list) return;
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i] === loop) list.splice(i, 1);
        }
        if (list.length === 0) loops.delete(featureId);
    };

    // -- Public API --
    const createPollLoop = (callback, rateSec, featureId) => {
        if (typeof callback !== "function") {
            $.Msg("[QOLLock][WARN][Scheduler] createPollLoop requires a function callback");
            return { stop: () => {}, reschedule: () => {} };
        }

        let stopped = false;
        let rate = (typeof rateSec === "number" && rateSec > 0) ? rateSec : 0.2;
        let handle = null;
        let hadError = false;
        let loop = null;

        const tick = () => {
            if (stopped) return;
            let perfActive = false;
            try {
                const s = getState();
                perfActive = !!(s && s.perfEnabled);
            } catch (_) {}
            const t0 = perfActive ? nowMs() : 0;
            let threw = false;
            try {
                callback();
            } catch (e) {
                threw = true;
                hadError = true;
                const errMsg = (e && e.message ? e.message : String(e));
                if (EventBus && typeof featureId === "string" && featureId) {
                    try { EventBus.emit("scheduler:error", { featureId, message: errMsg, timestamp: nowMs() }); } catch (_) { /* best-effort */ }
                }
                $.Msg(`[QOLLock][ERROR][Scheduler] poll loop threw — ${errMsg} (continuing)`);
            }
            if (!threw && hadError && EventBus && typeof featureId === "string" && featureId) {
                try { EventBus.emit("scheduler:tick_ok", { featureId }); } catch (_) { /* best-effort */ }
                hadError = false;
            }
            if (perfActive && typeof featureId === "string" && featureId) {
                const elapsed = nowMs() - t0;
                recordTiming(featureId, elapsed);
            }
            if (!stopped) {
                handle = $.Schedule(rate, tick);
            }
        };

        // Jitter first tick (0-50% of rate) to prevent frame-aligned spikes
        const jitter = (typeof Math !== "undefined" && Math.random) ? Math.random() * rate * 0.5 : 0;
        handle = $.Schedule(jitter, tick);

        loop = {
            stop: () => {
                if (stopped) return;
                stopped = true;
                if (handle !== null) {
                    $.CancelScheduled(handle);
                    handle = null;
                }
                removeRegisteredLoop(featureId, loop);
            },
            reschedule: (newRateSec) => {
                if (typeof newRateSec === "number" && newRateSec > 0) {
                    rate = newRateSec;
                }
            }
        };

        if (typeof featureId === "string" && featureId) {
            if (!loops.has(featureId)) {
                loops.set(featureId, []);
            }
            loops.get(featureId).push(loop);
        }

        return loop;
    };

    const cancelAllForFeature = (featureId) => {
        const list = loops.get(featureId);
        if (!list) return;
        loops.delete(featureId);
        for (let i = 0; i < list.length; i++) {
            try { list[i].stop(); } catch (_) { /* best-effort */ }
        }
    };

    const getTimings = (featureId) => {
        const state = getState();
        const stats = state?.perfStats || {};
        if (featureId) {
            const key = `mf.${featureId}`;
            const e = stats[key];
            if (!e || e.count <= 0) return null;
            return { avgMs: e.total / e.count, maxMs: e.max, calls: e.count, totalMs: e.total, lastMs: 0, lastAt: 0 };
        }
        const result = {};
        for (const k in stats) {
            if (Object.prototype.hasOwnProperty.call(stats, k) && k.startsWith("mf.")) {
                const ee = stats[k];
                if (ee.count <= 0) continue;
                const id = k.substring(3);
                result[id] = { avgMs: ee.total / ee.count, maxMs: ee.max, calls: ee.count, totalMs: ee.total, lastMs: 0, lastAt: 0 };
            }
        }
        return result;
    };

    const resetTimings = (featureId) => {
        try {
            const state = getState();
            const stats = state?.perfStats;
            if (!stats) return;
            if (featureId) {
                delete stats[`mf.${featureId}`];
            } else {
                for (const k in stats) {
                    if (Object.prototype.hasOwnProperty.call(stats, k) && k.startsWith("mf.")) delete stats[k];
                }
            }
        } catch (_) { /* best-effort */ }
    };

    const perfApi = {
        schedule: createPollLoop,
        createPollLoop,
        cancelAll: cancelAllForFeature,
        cancelAllForFeature,
        getTimings,
        resetTimings
    };

    Q.core.perf = perfApi;
    Q.core.Scheduler = perfApi;

    $.Msg("[QOLLock] core/ql_scheduler: attached to QOL.core.perf and QOL.core.Scheduler");
})();
