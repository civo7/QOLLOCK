// OWNS: Performance collection enable policy, console reporting and private overlay/model lifetime.
// DOES NOT OWN: Scheduler samples or engine frame timings. Displayed reports describe callback work.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_perf",
        enabledByDefault: false,
        enableKeys: ["ENABLE_PERF_DEBUG", "ENABLE_PERF_DEBUG_DETAIL", "ENABLE_PERF_OVERLAY"],
        settings: [
            { key: "ENABLE_PERF_DEBUG", type: "toggle" },
            { key: "ENABLE_PERF_DEBUG_DETAIL", type: "toggle" },
            { key: "ENABLE_PERF_OVERLAY", type: "toggle" },
            { key: "PERF_OVERLAY_OPACITY", type: "slider" }
        ],
        create(ctx) {
            const state = QOL.state, U = QOL.utils, P = QOL.core.panel;
            const overlay = QOL.features.performanceOverlay.create(), history = QOL.features.performanceModel.create();
            let model = null, root = null, loop = null, enabled = false, lastFlush = null;
            function readModel() {
                const cfg = ctx.config.view();
                const detailed = U.IsCfgEnabled(cfg, "ENABLE_PERF_DEBUG_DETAIL");
                const console = detailed || U.IsCfgEnabled(cfg, "ENABLE_PERF_DEBUG");
                const shown = U.IsCfgEnabled(cfg, "ENABLE_PERF_OVERLAY");
                return { detailed, console, shown,
                    opacity: U.ClampConfigNumber(cfg.PERF_OVERLAY_OPACITY, 0.75, 0.3, 1, false).toFixed(2) };
            }
            function report(stats, now) {
                if (lastFlush !== null && now - lastFlush < 5000) return;
                lastFlush = now;
                const keys = Object.keys(stats);
                if (!keys.length) { $.Msg("[QOLLock][Perf] (collecting samples...)"); return; }
                keys.sort((a, b) => {
                    const average = entry => entry && entry.count > 0 ? entry.total / entry.count : 0;
                    return average(stats[b]) - average(stats[a]);
                });
                const parts = [];
                for (const key of keys.slice(0, 8)) {
                    const entry = stats[key];
                    if (!entry || entry.count <= 0) continue;
                    const average = (entry.total / entry.count).toFixed(2);
                    parts.push(key + "=" + average + "ms" + (model.detailed ?
                        " (n=" + entry.count + " max=" + (entry.max ? entry.max.toFixed(1) : "0.0") + " slow=" + (entry.slow || 0) + ")" : ""));
                }
                if (parts.length) $.Msg("[QOLLock][Perf] " + parts.join(" | "));
            }
            function update() {
                if (!enabled) return;
                const nextRoot = P.findHud($.GetContextPanel());
                if (root !== nextRoot) { overlay.clear(); history.reset(); lastFlush = null; root = nextRoot; }
                const now = U.PerfNowMs(), stats = state.perfStats || {};
                if (model.shown) {
                    const content = history.build(stats, now);
                    overlay.render(root, model.opacity, content);
                    for (const alert of content.alerts) $.Msg(alert);
                }
                if (model.console) report(stats, now);
            }
            function refresh() {
                const previous = model; model = readModel();
                state.perfEnabled = enabled && (model.console || model.shown);
                state.perfDetailed = enabled && model.detailed;
                if (!model.shown) { overlay.clear(); history.reset(); }
                if (previous && previous.console !== model.console) lastFlush = null;
                if (loop) loop.reschedule(model.shown ? 0.2 : 1.0);
                update();
            }
            return {
                onEnable() {
                    enabled = true; refresh();
                    loop = QOL.core.Scheduler.createPollLoop(update, model.shown ? 0.2 : 1.0, ctx.id);
                },
                onSettingsChanged: refresh,
                onDisable() {
                    enabled = false;
                    if (loop) loop.stop(); loop = null;
                    state.perfEnabled = state.perfDetailed = false;
                    overlay.dispose(); history.reset(); model = root = lastFlush = null;
                }
            };
        },
        test() {
            const available = typeof QOL.features.performanceOverlay?.create === "function" &&
                typeof QOL.features.performanceModel?.create === "function";
            return { passed: available, name: "Performance display owners available", message: "",
                assertions: [{ passed: available, name: "Private model and renderer factories exist" }] };
        }
    });
})();
