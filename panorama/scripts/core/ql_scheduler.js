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
//              already-fired handles (no-throw). Use scheduleOnce for owned
//              deferred work and createPollLoop for recurring observations.
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
    let workObservation = null;

    // Opt-in, bounded counters. No timer, panel traversal or console output.
    const getWorkSnapshot = () => {
        const rows = [];
        for (const [id, tasks] of loops) {
            let polls = 0;
            let once = 0;
            for (const task of tasks) {
                if (task.kind === "once") once++;
                else polls++;
            }
            rows.push({ id, polls, once });
        }
        return rows;
    };

    const startWorkObservation = () => {
        if (workObservation) workObservation.stop();
        const rows = new Map();
        const emptyWindow = () => ({ callbacks: 0, callbackMs: 0, maxCallbackMs: 0,
            slowestFeature: "", maxDelayMs: 0, errors: 0 });
        let window = emptyWindow();
        let stopped = false;
        const entry = id => {
            const key = rows.has(id) || rows.size < 127 ? (id || "<anonymous>") : "<other>";
            if (!rows.has(key)) rows.set(key, { id: key, polls: 0, once: 0, callbackMs: 0,
                maxCallbackMs: 0, maxDelayMs: 0, errors: 0, startPolls: 0, peakPolls: 0,
                endPolls: 0, startOnce: 0, peakOnce: 0, endOnce: 0 });
            return rows.get(key);
        };
        const census = initial => {
            let activePolls = 0;
            let pendingOnce = 0;
            for (const row of rows.values()) { row.endPolls = 0; row.endOnce = 0; }
            for (const task of getWorkSnapshot()) {
                const row = entry(task.id);
                row.endPolls += task.polls;
                row.endOnce += task.once;
                if (initial) { row.startPolls += task.polls; row.startOnce += task.once; }
                row.peakPolls = Math.max(row.peakPolls, row.endPolls);
                row.peakOnce = Math.max(row.peakOnce, row.endOnce);
                activePolls += task.polls;
                pendingOnce += task.once;
            }
            return { activePolls, pendingOnce };
        };
        const session = {
            record: (id, kind, elapsed, delay, threw) => {
                if (stopped) return;
                const row = entry(id);
                row[kind]++;
                row.callbackMs += elapsed;
                row.maxCallbackMs = Math.max(row.maxCallbackMs, elapsed);
                row.maxDelayMs = Math.max(row.maxDelayMs, delay);
                row.errors += threw ? 1 : 0;
                window.callbacks++;
                window.callbackMs += elapsed;
                if (elapsed > window.maxCallbackMs) {
                    window.maxCallbackMs = elapsed;
                    window.slowestFeature = id || "<anonymous>";
                }
                window.maxDelayMs = Math.max(window.maxDelayMs, delay);
                window.errors += threw ? 1 : 0;
            },
            sample: () => {
                const sample = { ...window, ...census(false) };
                window = emptyWindow();
                return sample;
            },
            stop: () => {
                if (!stopped) census(false);
                stopped = true;
                if (workObservation === session) workObservation = null;
                return Array.from(rows.values(), row => ({ ...row }));
            }
        };
        census(true);
        workObservation = session;
        return session;
    };

    // Optional EventBus for error reporting (loaded before us by ql_event_bus.js)
    const EventBus = Q.core.EventBus || null;

    // Measure callback elapsed time with the available PerfNowMs clock.
    const nowMs = QOL_UTILS.PerfNowMs;

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
            if (!state) return;

            if (state.perfEnabled && state.perfStats) {
                const stats = state.perfStats;
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
            }

            if (state.benchmarkActive && state.benchmarkStats) {
                const bm = state.benchmarkStats;
                bm.totalJsMs += elapsedMs;
                bm.totalTicks += 1;
                if (elapsedMs > bm.maxTickMs) {
                    bm.maxTickMs = elapsedMs;
                    bm.maxTickFeature = featureId;
                }
                let feat = bm.byFeature[featureId];
                if (!feat) {
                    feat = { count: 0, totalMs: 0, maxMs: 0, spikes: 0, spikeWarns: 0 };
                    bm.byFeature[featureId] = feat;
                }
                feat.count += 1;
                feat.totalMs += elapsedMs;
                if (elapsedMs > feat.maxMs) feat.maxMs = elapsedMs;
                if (elapsedMs >= 4) {
                    bm.spikeCount += 1;
                    feat.spikes += 1;
                }
                if (elapsedMs >= 8) {
                    feat.spikeWarns = (feat.spikeWarns || 0) + 1;
                    if (feat.spikeWarns <= 3) {
                        $.Msg(`[QOLLock][WARN][Benchmark] Execution spike: ${elapsedMs.toFixed(2)}ms in ${featureId}`);
                    }
                }
            }
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
        const owner = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
        let loop = null;
        let dueMs = null;
        const scheduleTick = delay => {
            dueMs = workObservation ? nowMs() + delay * 1000 : null;
            return $.Schedule(delay, tick);
        };

        const tick = () => {
            if (stopped) return;
            if (owner && !QOL_UTILS.IsPanelValid(owner)) {
                loop.stop();
                return;
            }


            let perfActive = false;
            try {
                const s = getState();
                perfActive = !!(s && (s.perfEnabled || s.benchmarkActive));
            } catch (_) {}
            const observation = workObservation;
            const t0 = (perfActive || observation) ? nowMs() : 0;
            const delayMs = observation && dueMs !== null ? Math.max(0, t0 - dueMs) : 0;
            let threw = false;
            const lookup = lookupObservation;
            if (lookup) lookup.enter(featureId);
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
            } finally {
                if (lookup) lookup.leave();
            }
            if (!threw && hadError && EventBus && typeof featureId === "string" && featureId) {
                try { EventBus.emit("scheduler:tick_ok", { featureId }); } catch (_) { /* best-effort */ }
                hadError = false;
            }
            if (perfActive && typeof featureId === "string" && featureId) {
                const elapsed = nowMs() - t0;
                recordTiming(featureId, elapsed);
            }
            if (observation) observation.record(featureId, "polls", Math.max(0, nowMs() - t0), delayMs, threw);
            if (!stopped) {
                handle = scheduleTick(rate);
            }
        };

        // Jitter first tick (0-50% of rate) to prevent frame-aligned spikes
        const jitter = (typeof Math !== "undefined" && Math.random) ? Math.random() * rate * 0.5 : 0;
        handle = scheduleTick(jitter);

        loop = {
            kind: "poll",
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

    // Native one-shot scheduling with the same feature ownership as poll loops.
    const scheduleOnce = (callback, delaySec, featureId) => {
        let handle = null;
        let stopped = false;
        const owner = $.GetContextPanel();
        const task = { kind: "once", stop: () => {
            if (stopped) return;
            stopped = true;
            if (handle !== null) { $.CancelScheduled(handle); handle = null; }
            removeRegisteredLoop(featureId, task);
        } };
        if (typeof callback !== "function") return task;
        if (typeof featureId === "string" && featureId) {
            if (!loops.has(featureId)) loops.set(featureId, []);
            loops.get(featureId).push(task);
        }
        const delay = Number.isFinite(delaySec) && delaySec >= 0 ? delaySec : 0;
        const dueMs = workObservation ? nowMs() + delay * 1000 : null;
        handle = $.Schedule(delay, () => {
            handle = null;
            if (stopped) return;
            stopped = true;
            removeRegisteredLoop(featureId, task);
            if (owner && !QOL_UTILS.IsPanelValid(owner)) return;
            const observation = workObservation;
            const t0 = observation ? nowMs() : 0;
            let threw = false;
            try { callback(); }
            catch (e) {
                threw = true;
                const message = e?.message || String(e);
                if (EventBus && featureId) EventBus.emit("scheduler:error", { featureId, message, timestamp: nowMs() });
                $.Msg(`[QOLLock][ERROR][Scheduler] deferred callback threw — ${message}`);
            }
            finally {
                if (observation) observation.record(featureId, "once", Math.max(0, nowMs() - t0),
                    dueMs === null ? 0 : Math.max(0, t0 - dueMs), threw);
            }
        });
        return task;
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

    let benchmarkTimer = null;
    let benchmarkProgressTimer = null;
    let lookupObservation = null;

    // A native FindChildTraverse does its walk inside the engine. Count calls,
    // never claim that these are the engine's internal node visits.
    const startLookupObservation = panelRoot => {
        const result = { status: "unavailable", panelsScanned: 0, panelsCovered: 0, scanErrors: 0,
            prototypesHooked: 0, totalCalls: 0, pollCalls: 0, outsidePollCalls: 0,
            byFeature: {} };
        const restorers = [];
        let currentFeature = "";
        let stopped = false;
        const stop = () => {
            if (stopped) return result;
            stopped = true;
            for (let i = restorers.length - 1; i >= 0; i--) restorers[i]();
            if (lookupObservation === session) lookupObservation = null;
            return result;
        };
        const session = {
            result,
            enter: id => { currentFeature = id || "<anonymous>"; },
            leave: () => { currentFeature = ""; },
            stop
        };

        let root = null;
        try { root = panelRoot || $.GetContextPanel(); } catch (_) {}
        if (!root || typeof root.GetChildCount !== "function") return session;

        // Discover the panel prototypes present at the start of the sample.
        // The census is outside the timed window and capped to avoid an unbounded walk.
        const seen = [];
        const stack = [root];
        const maxPanels = 50000;
        while (stack.length && result.panelsScanned < maxPanels) {
            const panel = stack.pop();
            try { if (panel.IsValid && !panel.IsValid()) continue; } catch (_) { result.scanErrors++; continue; }
            result.panelsScanned++;
            try {
                let proto = Object.getPrototypeOf(panel);
                while (proto) {
                    if (seen.indexOf(proto) >= 0) break;
                    seen.push(proto);
                    const descriptor = Object.getOwnPropertyDescriptor(proto, "FindChildTraverse");
                    if (descriptor && typeof descriptor.value === "function") {
                        const targetProto = proto;
                        const original = descriptor.value;
                        const wrapped = function(...args) {
                            result.totalCalls++;
                            if (currentFeature) {
                                result.pollCalls++;
                                result.byFeature[currentFeature] = (result.byFeature[currentFeature] || 0) + 1;
                            } else result.outsidePollCalls++;
                            return original.apply(this, args);
                        };
                        wrapped.__qolLookupProbe = true;
                        try {
                            Object.defineProperty(targetProto, "FindChildTraverse", { ...descriptor, value: wrapped });
                            if (targetProto.FindChildTraverse === wrapped) {
                                restorers.push(() => {
                                    try {
                                        if (targetProto.FindChildTraverse === wrapped) Object.defineProperty(targetProto, "FindChildTraverse", descriptor);
                                    } catch (_) {}
                                });
                                result.prototypesHooked++;
                            }
                        } catch (_) { /* native prototype may be read-only */ }
                    }
                    proto = Object.getPrototypeOf(proto);
                }
                if (panel.FindChildTraverse && result.prototypesHooked > 0) {
                    let covered = false;
                    let p = Object.getPrototypeOf(panel);
                    while (p) {
                        if (restorers.length && seen.indexOf(p) >= 0 &&
                            Object.prototype.hasOwnProperty.call(p, "FindChildTraverse")) {
                            // A hooked method is identifiable by its replacement marker below.
                            covered = !!p.FindChildTraverse.__qolLookupProbe;
                            break;
                        }
                        p = Object.getPrototypeOf(p);
                    }
                    if (covered) result.panelsCovered++;
                }
                const count = panel.GetChildCount();
                for (let i = count - 1; i >= 0; i--) stack.push(panel.GetChild(i));
            } catch (_) { result.scanErrors++; /* destroyed panel or unsupported native object */ }
        }
        result.status = result.prototypesHooked > 0 ?
            ((stack.length || result.scanErrors || result.panelsCovered < result.panelsScanned) ?
                "partial-tree" : "active") : "unavailable";
        lookupObservation = session;
        return session;
    };

    const padL = (val, len) => {
        let s = String(val != null ? val : "");
        while (s.length < len) s = " " + s;
        return s;
    };

    const padR = (val, len) => {
        let s = String(val != null ? val : "");
        while (s.length < len) s = s + " ";
        return s;
    };

    const formatBenchmarkReport = (bm, durSec, activeCount) => {
        if (!bm) return "No benchmark data recorded.";
        const dur = (durSec || 10).toFixed(1);
        const totalTicks = bm.totalTicks || 0;
        const ticksPerSec = (totalTicks / (durSec || 1)).toFixed(1);
        const totalJs = (bm.totalJsMs || 0).toFixed(2);
        const avgPerTick = (totalTicks > 0 ? (bm.totalJsMs / totalTicks) : 0).toFixed(3);
        const budgetPct = (((bm.totalJsMs || 0) / ((durSec || 1) * 1000)) * 100).toFixed(2);
        const maxSpike = (bm.maxTickMs || 0).toFixed(2) + " ms (" + (bm.maxTickFeature || "none") + ")";
        const spikes = bm.spikeCount || 0;

        const sep = "--------------------------------------------------------------------------------";
        const eq = "================================================================================";
        const lookups = bm.lookupStats;
        const lookupLines = lookups ? [
            `Panel lookup hook: ${lookups.status}; ${lookups.panelsCovered}/${lookups.panelsScanned} panels covered at start`,
            `FindChildTraverse calls: ${lookups.totalCalls} (${lookups.pollCalls} in timed polls, ${lookups.outsidePollCalls} outside)`,
            "These are native lookup calls, not engine-internal panel visits. Other search APIs are excluded."
        ] : [];

        const lines = [
            eq,
            `QOLLOCK IN-GAME BENCHMARK REPORT (${dur}s sample)`,
            eq,
            `Active Features:  ${activeCount}`,
            `Total Poll Ticks: ${totalTicks} (${ticksPerSec} ticks/s)`,
            `Timed Callbacks: ${totalJs} ms (${budgetPct}% of sample elapsed time)`,
            `Avg Per Tick:    ${avgPerTick} ms`,
            `Max Single Spike: ${maxSpike}`,
            `Spikes (>= 4ms):  ${spikes}`,
            "Scope: Scheduler poll callbacks only, including synchronous native calls.",
            "Clock: Date.now() milliseconds; decimal formatting does not imply sub-millisecond accuracy.",
            "Not measured: FPS, frame-time percentiles, deferred layout/rendering, GPU, or work outside these callbacks.",
            ...lookupLines,
            "A zero-cost or inactive feature may simply not have exercised its gameplay path.",
            "",
            "TOP FEATURES BY TIMED POLL CALLBACKS:",
            "  #   Feature                    Total(ms)   Avg(ms)   Max(ms)   Ticks  Spikes",
            sep
        ];

        const features = [];
        const byFeat = bm.byFeature || {};
        for (const k in byFeat) {
            if (Object.prototype.hasOwnProperty.call(byFeat, k)) {
                features.push({
                    id: k,
                    count: byFeat[k].count,
                    totalMs: byFeat[k].totalMs,
                    maxMs: byFeat[k].maxMs,
                    spikes: byFeat[k].spikes
                });
            }
        }
        features.sort((a, b) => b.totalMs - a.totalMs);

        if (features.length === 0) {
            lines.push("  No feature polling activity detected during benchmark window.");
        } else {
            for (let i = 0; i < features.length; i++) {
                const f = features[i];
                const rank = padL(i + 1 + ".", 4);
                let featName = f.id;
                if (featName.length > 24) featName = featName.substring(0, 23) + "…";
                const featCol = padR(featName, 25);
                const totCol = padL(f.totalMs.toFixed(2), 10);
                const avgCol = padL((f.count > 0 ? (f.totalMs / f.count) : 0).toFixed(3), 10);
                const maxCol = padL(f.maxMs.toFixed(2), 10);
                const cntCol = padL(f.count, 8);
                const spkCol = padL(f.spikes || 0, 8);
                lines.push(`${rank} ${featCol} ${totCol} ${avgCol} ${maxCol} ${cntCol} ${spkCol}`);
            }
        }

        if (bm.lookupStats && bm.lookupStats.status !== "unavailable") {
            lines.push("", "FINDCHILDTRAVERSE CALLS IN SCHEDULER POLLS:");
            const lookupRows = Object.keys(bm.lookupStats.byFeature)
                .sort((a, b) => bm.lookupStats.byFeature[b] - bm.lookupStats.byFeature[a]);
            if (!lookupRows.length) lines.push("  No instrumented lookups in timed polls.");
            for (const id of lookupRows) lines.push(`  ${id}: ${bm.lookupStats.byFeature[id]}`);
        }

        lines.push(sep);
        try {
            lines.push(`Generated: ${new Date().toISOString()}`);
        } catch (_) {}
        lines.push(eq);

        return lines.join("\n");
    };

    const startBenchmark = (durationSec, onComplete, options) => {
        const durSec = (typeof durationSec === "number" && durationSec > 0) ? durationSec : 10;
        const state = getState();
        if (!state) return null;

        if (benchmarkTimer !== null) {
            $.CancelScheduled(benchmarkTimer);
            benchmarkTimer = null;
        }
        if (benchmarkProgressTimer !== null) {
            $.CancelScheduled(benchmarkProgressTimer);
            benchmarkProgressTimer = null;
        }
        if (lookupObservation) lookupObservation.stop();
        const lookupSession = options?.capturePanelLookups ? startLookupObservation(options.panelRoot) : null;

        state.benchmarkActive = true;
        state.benchmarkStats = {
            startTime: nowMs(),
            durationSec: durSec,
            totalJsMs: 0,
            totalTicks: 0,
            maxTickMs: 0,
            maxTickFeature: "",
            spikeCount: 0,
            byFeature: {}
        };

        let startActiveCount = 0;
        try {
            if (Q.core?.FeatureRegistry?.getEnabledIds) {
                startActiveCount = Q.core.FeatureRegistry.getEnabledIds().length;
            }
        } catch (_) {}

        $.Msg(`[QOLLock] Starting ${durSec}s in-game benchmark (${startActiveCount} active manifests)...`);

        if (durSec >= 4) {
            const halfDur = Math.floor(durSec / 2);
            benchmarkProgressTimer = $.Schedule(halfDur, () => {
                benchmarkProgressTimer = null;
                if (!state.benchmarkActive || !state.benchmarkStats) return;
                const bm = state.benchmarkStats;
                const elapsed = Math.max(0.1, (nowMs() - bm.startTime) / 1000).toFixed(1);
                $.Msg(`[QOLLock][Benchmark] Heartbeat: ${elapsed}s/${durSec}s elapsed | Ticks: ${bm.totalTicks} | JS time: ${bm.totalJsMs.toFixed(1)}ms | Spikes(>=4ms): ${bm.spikeCount}`);
            });
        }

        benchmarkTimer = $.Schedule(durSec, () => {
            benchmarkTimer = null;
            if (benchmarkProgressTimer !== null) {
                $.CancelScheduled(benchmarkProgressTimer);
                benchmarkProgressTimer = null;
            }
            const bm = state.benchmarkStats;
            state.benchmarkActive = false;
            if (lookupSession) bm.lookupStats = lookupSession.stop();
            const actualDurSec = Math.max(0.1, (nowMs() - (bm ? bm.startTime : 0)) / 1000);

            let activeCount = 0;
            try {
                if (Q.core?.FeatureRegistry?.getEnabledIds) {
                    activeCount = Q.core.FeatureRegistry.getEnabledIds().length;
                }
            } catch (_) {}

            const report = formatBenchmarkReport(bm, actualDurSec, activeCount);

            const reportLines = report.split("\n");
            for (let i = 0; i < reportLines.length; i++) {
                $.Msg(reportLines[i]);
            }

            if (typeof onComplete === "function") {
                try {
                    onComplete(report, bm);
                } catch (e) {
                    $.Msg(`[QOLLock][ERROR][Scheduler] benchmark onComplete threw: ${e?.message || e}`);
                }
            }
        });

        return {
            stop: () => {
                if (benchmarkTimer !== null) {
                    $.CancelScheduled(benchmarkTimer);
                    benchmarkTimer = null;
                }
                if (benchmarkProgressTimer !== null) {
                    $.CancelScheduled(benchmarkProgressTimer);
                    benchmarkProgressTimer = null;
                }
                if (state) state.benchmarkActive = false;
                if (lookupSession) lookupSession.stop();
            }
        };
    };

    const perfApi = {
        getWorkSnapshot,
        startWorkObservation,
        schedule: createPollLoop,
        createPollLoop,
        scheduleOnce,
        cancelAll: cancelAllForFeature,
        cancelAllForFeature,
        getTimings,
        resetTimings,
        startBenchmark,
        formatBenchmarkReport,
        isBenchmarkActive: () => {
            const s = getState();
            return !!(s && s.benchmarkActive);
        }
    };

    Q.core.perf = perfApi;
    Q.core.Scheduler = perfApi;
    Q.runBenchmark = (durationSec, onComplete) => startBenchmark(durationSec, onComplete);

    $.Msg("[QOLLock] core/ql_scheduler: attached to QOL.core.perf, QOL.core.Scheduler, and QOL.runBenchmark");
})();
