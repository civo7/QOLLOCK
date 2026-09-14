// manifests/ql_perf/manifest.js
// =============================================================================
// QOLLOCK — Performance Diagnostics & Overlay
// =============================================================================
// OWNS:        Performance debug tracking, detailed console logs, and HUD overlay.
// DOES NOT OWN: Low-level scheduling or frame measurement (Scheduler, perf_overlay)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_PERF_DEBUG, ENABLE_PERF_DEBUG_DETAIL, ENABLE_PERF_OVERLAY,
//              PERF_OVERLAY_OPACITY
// PATTERN:     Polling (5Hz = 0.2s). Drives QOL_PERF_OVERLAY and periodic console logs.
// =============================================================================

(() => {
    "use strict";

    const FR = QOL.core && QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] perf: FeatureRegistry not found — aborting");
        return;
    }

    const PERF_FLUSH_INTERVAL_MS = 5000;
    const TOP_COUNT = 8;

    FR.register({
        id: "ql_perf",
        enabledByDefault: false,
        enableKeys: ["ENABLE_PERF_DEBUG", "ENABLE_PERF_DEBUG_DETAIL", "ENABLE_PERF_OVERLAY"],
        settings: [
            { key: "ENABLE_PERF_DEBUG", type: "toggle", default: false },
            { key: "ENABLE_PERF_DEBUG_DETAIL", type: "toggle", default: false },
            { key: "ENABLE_PERF_OVERLAY", type: "toggle", default: false },
            { key: "PERF_OVERLAY_OPACITY", type: "slider", min: 0.1, max: 1.0, step: 0.05, default: 0.8 }
        ],
        create: (ctx) => {
            let _loop = null;
            let _lastFlushMs = 0;

            const _getState = () => {
                return (typeof QOL !== "undefined" && QOL.state) ? QOL.state :
                       ((typeof State !== "undefined" && State) ? State :
                       ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : {}));
            };

            const _flushConsolePerf = (perfStats, detailed) => {
                const now = Date.now ? Date.now() : (new Date()).getTime();
                if (now - _lastFlushMs < PERF_FLUSH_INTERVAL_MS) return;
                _lastFlushMs = now;

                const stats = perfStats || {};
                const keys = Object.keys(stats);
                if (keys.length === 0) {
                    $.Msg("[QOLLock][Perf] (collecting samples...)");
                    return;
                }

                keys.sort((a, b) => {
                    const ea = stats[a], eb = stats[b];
                    const avgA = (ea && ea.count > 0) ? (ea.total / ea.count) : 0;
                    const avgB = (eb && eb.count > 0) ? (eb.total / eb.count) : 0;
                    return avgB - avgA;
                });

                const topKeys = keys.slice(0, TOP_COUNT);
                const parts = [];
                for (let i = 0; i < topKeys.length; i++) {
                    const k = topKeys[i];
                    const e = stats[k];
                    if (!e || e.count <= 0) continue;
                    const avg = (e.total / e.count).toFixed(2);
                    if (detailed) {
                        parts.push(`${k}=${avg}ms (n=${e.count} max=${e.max ? e.max.toFixed(1) : "0.0"} slow=${e.slow || 0})`);
                    } else {
                        parts.push(`${k}=${avg}ms`);
                    }
                }
                if (parts.length > 0) {
                    $.Msg(`[QOLLock][Perf] ${parts.join(" | ")}`);
                }
            };

            const _tick = () => {
                const root = $.GetContextPanel();
                const state = _getState();
                const cfg = (ctx && ctx.config && ctx.config.all) ? ctx.config.all() : (state.lastConfig || {});

                const consoleDebug = !!(cfg && (cfg.ENABLE_PERF_DEBUG === true || Number(cfg.ENABLE_PERF_DEBUG) === 1));
                const detailed = !!(cfg && (cfg.ENABLE_PERF_DEBUG_DETAIL === true || Number(cfg.ENABLE_PERF_DEBUG_DETAIL) === 1));
                const consoleEnabled = consoleDebug || detailed;
                const overlayEnabled = !!(cfg && (cfg.ENABLE_PERF_OVERLAY === true || Number(cfg.ENABLE_PERF_OVERLAY) === 1));

                state.perfEnabled = consoleEnabled || overlayEnabled;
                state.perfDetailed = detailed;
                if (typeof QOL !== "undefined" && QOL.state) {
                    QOL.state.perfEnabled = state.perfEnabled;
                    QOL.state.perfDetailed = state.perfDetailed;
                }
                if (!state.perfStats) state.perfStats = {};

                const perfOverlay = (typeof globalThis !== "undefined" && globalThis.QOL_PERF_OVERLAY) ? globalThis.QOL_PERF_OVERLAY :
                                  ((typeof window !== "undefined" && window.QOL_PERF_OVERLAY) ? window.QOL_PERF_OVERLAY : null);

                if (perfOverlay && typeof perfOverlay.UpdateOverlay === "function") {
                    perfOverlay.UpdateOverlay(root, cfg, state.perfStats);
                }

                if (consoleEnabled) {
                    _flushConsolePerf(state.perfStats, detailed);
                }
            };

            return {
                onEnable: () => {
                    const Scheduler = QOL.core.Scheduler;
                    if (Scheduler && Scheduler.createPollLoop) {
                        _loop = Scheduler.createPollLoop(_tick, 0.2, "ql_perf");
                    }
                    _tick();
                },
                onDisable: () => {
                    if (_loop) {
                        _loop.stop();
                        _loop = null;
                    }
                    const state = _getState();
                    state.perfEnabled = false;
                    state.perfDetailed = false;
                    if (typeof QOL !== "undefined" && QOL.state) {
                        QOL.state.perfEnabled = false;
                        QOL.state.perfDetailed = false;
                    }
                    const perfOverlay = (typeof globalThis !== "undefined" && globalThis.QOL_PERF_OVERLAY) ? globalThis.QOL_PERF_OVERLAY :
                                      ((typeof window !== "undefined" && window.QOL_PERF_OVERLAY) ? window.QOL_PERF_OVERLAY : null);
                    if (perfOverlay && typeof perfOverlay.UpdateOverlay === "function") {
                        perfOverlay.UpdateOverlay($.GetContextPanel(), { ENABLE_PERF_OVERLAY: 0 }, state.perfStats || {});
                    }
                },
                onSettingsChanged: (_payload) => {
                    _tick();
                }
            };
        },
        test: (_ctx) => {
            try {
                const perfOverlay = (typeof globalThis !== "undefined" && globalThis.QOL_PERF_OVERLAY) ? globalThis.QOL_PERF_OVERLAY :
                                  ((typeof window !== "undefined" && window.QOL_PERF_OVERLAY) ? window.QOL_PERF_OVERLAY : null);
                const hasOverlayModule = !!(perfOverlay && typeof perfOverlay.UpdateOverlay === "function");
                return {
                    passed: hasOverlayModule,
                    name: "Perf overlay module available",
                    message: hasOverlayModule ? "" : "QOL_PERF_OVERLAY missing or invalid",
                    assertions: [{ passed: hasOverlayModule, name: "QOL_PERF_OVERLAY.UpdateOverlay is function" }]
                };
            } catch (e) {
                return { passed: false, name: "Perf manifest check", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();
