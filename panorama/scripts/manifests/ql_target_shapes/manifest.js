// OWNS: Native target/hint shape size and target opacity code overrides.
// DOES NOT OWN: Valve target panels, targeting animations or root feature gates.
// Source: native ability_hud_element_unit_target.css and existing target_shape /
// qol_hint_target class traversal. Native children remain with Valve.
(() => {
    "use strict";
    const ID = "ql_target_shapes";
    const clamp = QOL.utils.ClampConfigNumber;
    const styleTexts = cfg => ({
        scaleText: (clamp(cfg.UNIT_TARGET_SIZE, 150, 50, 300, true) / 100).toFixed(3),
        opacityText: clamp(cfg.UNIT_TARGET_OPACITY, 1, 0, 1).toFixed(2),
        hintScaleText: (clamp(cfg.UNIT_TARGET_HINT_SIZE, 100, 50, 200, true) / 100).toFixed(3)
    });
    QOL.getUnitTargetDefaultStyleTexts = () => styleTexts(QOL.buildDefaultConfig());

    QOL.core.FeatureRegistry.register({
        id: ID,
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_RED_DIAMOND", type: "toggle", default: false },
            { key: "ENABLE_IMPROVED_HINT", type: "toggle", default: false, label: "Improved Hint" },
            { key: "UNIT_TARGET_SIZE", type: "slider", min: 50, max: 300, step: 5, default: 150 },
            { key: "UNIT_TARGET_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "UNIT_TARGET_HINT_SIZE", type: "slider", min: 50, max: 200, step: 5, default: 100 }
        ],
        create(ctx) {
            const panels = QOL.core.panel;
            const state = QOL.state;
            const shapes = new Map();
            const hints = new Map();
            let root = null;
            let model = null;
            let nextDiscovery = 0;
            let loop = null;

            function readModel() {
                const cfg = ctx.config.view();
                const styles = styleTexts(cfg);
                const defaults = QOL.getUnitTargetDefaultStyleTexts();
                const active = QOL.utils.IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND") ||
                    Object.keys(defaults).some(key => styles[key] !== defaults[key]);
                return { active, styles,
                    shapeStyles: { preTransformScale2d: "1.00, 1.00", uiScale: Math.round(Number(styles.scaleText) * 100) + "%", opacity: styles.opacityText },
                    hintStyles: { preTransformScale2d: "1.00, 1.00", uiScale: Math.round(Number(styles.hintScaleText) * 100) + "%" }
                };
            }

            function release(target, owner) {
                if (panels.isAlive(target)) for (const property of owner.properties) QOL.utils.ClearStyleSafe(target, property);
                owner.properties.clear();
                owner.signature = null;
            }

            function releaseAll() {
                for (const [target, owner] of shapes) release(target, owner);
                for (const [target, owner] of hints) release(target, owner);
                shapes.clear(); hints.clear();
                nextDiscovery = 0;
                state.targetShapesCache = [];
                state.hintContainerCache = [];
                state.targetShapeHadNonDefaultRuntime = false;
                state.targetShapeStyleSig = "";
                state.nextTargetShapeRefreshMs = 0;
                state.targetShapeDebugLastSig = "";
                state.targetShapeDebugNextMs = 0;
            }

            function reconcile(owners, className) {
                const current = new Set(root.FindChildrenWithClassTraverse(className) || []);
                for (const [target, owner] of owners) {
                    if (!current.has(target)) { release(target, owner); owners.delete(target); }
                }
                for (const target of current) if (panels.isAlive(target) && !owners.has(target)) {
                    owners.set(target, { properties: new Set(), signature: null });
                }
            }

            function render(owners, styles) {
                for (const [target, owner] of owners) {
                    if (!panels.isAlive(target)) { owners.delete(target); nextDiscovery = 0; continue; }
                    // A partial rejected write remains owned and is retried.
                    for (const property of Object.keys(styles)) owner.properties.add(property);
                    owner.signature = panels.syncStyles(target, styles, owner.signature).sig;
                }
            }

            function update() {
                const current = $.GetContextPanel();
                if (current !== root) { releaseAll(); root = current; }
                if (!panels.isAlive(root) || !model.active) {
                    releaseAll();
                    if (loop) loop.reschedule(1.0);
                    return;
                }
                const now = QOL.utils.PerfNowMs();
                if (now >= nextDiscovery) {
                    reconcile(shapes, "target_shape"); reconcile(hints, "qol_hint_target");
                    nextDiscovery = now + (shapes.size || hints.size ? 1000 : 500);
                }
                render(shapes, model.shapeStyles); render(hints, model.hintStyles);
                state.targetShapesCache = [...shapes.keys()];
                state.hintContainerCache = [...hints.keys()];
                state.targetShapeHadNonDefaultRuntime = true;
                state.targetShapeStyleSig = Object.values(model.styles).join("|");
                state.nextTargetShapeRefreshMs = nextDiscovery;
                if (loop) loop.reschedule(shapes.size || hints.size ? 0.2 : 0.5);
            }

            function refreshSettings() {
                model = readModel();
                nextDiscovery = 0;
                for (const owner of shapes.values()) owner.signature = null;
                for (const owner of hints.values()) owner.signature = null;
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update();
            }

            return {
                onEnable() {
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, model.active ? 0.2 : 1.0, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    releaseAll(); root = model = null;
                }
            };
        },
        test() {
            try {
                const root = $.GetContextPanel();
                const shapes = root?.FindChildrenWithClassTraverse("target_shape") || [];
                const hints = root?.FindChildrenWithClassTraverse("qol_hint_target") || [];
                return { passed: true, name: "Target shape panels traversal works",
                    message: `Found ${shapes.length} target_shape + ${hints.length} hint panels`,
                    assertions: [{ passed: true, name: "Target/hint traversal succeeded" }]
                };
            } catch (error) {
                return { passed: false, name: "Target shape traversal failed", message: String(error.message || error) };
            }
        }
    });
})();
