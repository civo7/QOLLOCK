// OWNS: Native target/hint shape size and target opacity code overrides.
// DOES NOT OWN: Valve target panels, targeting animations or root feature gates.
// Source: native ability_hud_element_unit_target.xml UnitTarget snippet:
// .unit_target_instance > unscaled_panel > hint_container / scaled_panel > hint_container.
// Native target_shape classes and children remain with Valve; no XML hook is required.
(() => {
    "use strict";
    const ID = "ql_target_shapes";
    const P = QOL.core.panel;
    const number = (cfg, key) => QOL.settings.readNumber(key, cfg[key]);
    const styleTexts = cfg => ({
        scaleText: (number(cfg, "UNIT_TARGET_SIZE") / 100).toFixed(3),
        opacityText: QOL.utils.NormalizeOpacityNumber(cfg.UNIT_TARGET_OPACITY ?? 1, 1).toFixed(2),
        hintScaleText: (number(cfg, "UNIT_TARGET_HINT_SIZE") / 100).toFixed(3)
    });

    function hintSources(root) {
        const sources = new Map();
        for (const instance of QOL.utils.FindPanelsByClass(root, "unit_target_instance")) {
            const surface = P.findChild(instance, "unscaled_panel");
            for (const parent of [surface, P.findChild(surface, "scaled_panel")]) {
                const panel = P.findChild(parent, "hint_container");
                if (P.isAlive(panel)) sources.set(panel, { instance, surface, parent });
            }
        }
        return sources;
    }

    function currentHint(panel, source) {
        return P.hasClassToken(source.instance, "unit_target_instance") &&
            P.findChild(source.instance, "unscaled_panel") === source.surface &&
            (source.parent === source.surface || P.findChild(source.surface, "scaled_panel") === source.parent) &&
            P.findChild(source.parent, "hint_container") === panel;
    }

    function findTargetScope(hud) {
        // hud.xml, the October 3 capture and the October 26 live Debugger
        // target confirm this host, including primary unit_target instances.
        const core = P.findChildByClass(hud, "HudCore");
        const gameplay = P.findChild(core, "gameplay_hud");
        const alive = P.findChild(gameplay, "gameplay_hud_alive");
        return P.findChild(P.findChild(alive, "crosshair"), "unit_target_container");
    }

    QOL.core.FeatureRegistry.register({
        id: ID,
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_RED_DIAMOND", type: "toggle" },
            { key: "ENABLE_IMPROVED_HINT", type: "toggle", label: "Improved Hint" },
            { key: "UNIT_TARGET_SIZE", type: "slider" },
            { key: "UNIT_TARGET_OPACITY", type: "slider" },
            { key: "UNIT_TARGET_HINT_SIZE", type: "slider" }
        ],
        create(ctx) {
            const panels = QOL.core.panel;
            const defaults = styleTexts(QOL.buildDefaultConfig());
            const styleOwner = panels.createNativeStyleOwner();
            const shapes = new Map();
            const hints = new Map();
            let root = null;
            let model = null;
            let nextDiscovery = 0;
            let targetScope = null;
            let loop = null;
            let active = false;

            function readModel() {
                const cfg = ctx.config.view();
                const styles = styleTexts(cfg);
                const shapeActive = QOL.utils.IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND") ||
                    styles.scaleText !== defaults.scaleText || styles.opacityText !== defaults.opacityText;
                const hintActive = styles.hintScaleText !== defaults.hintScaleText;
                return { active: shapeActive || hintActive, shapeActive, hintActive, styles,
                    shapeStyles: { preTransformScale2d: "1.00, 1.00", uiScale: Math.round(Number(styles.scaleText) * 100) + "%", opacity: styles.opacityText },
                    hintStyles: { preTransformScale2d: "1.00, 1.00", uiScale: Math.round(Number(styles.hintScaleText) * 100) + "%" }
                };
            }

            function release(target) { styleOwner.apply(target, {}); }

            function releaseAll() {
                styleOwner.clear();
                shapes.clear(); hints.clear();
                nextDiscovery = 0;
                targetScope = null;
            }

            function reconcile(owners, current) {
                for (const target of owners.keys()) {
                    if (!current.has(target)) { release(target); owners.delete(target); }
                }
                for (const [target, source] of current) if (panels.isAlive(target)) {
                    if (!owners.has(target)) owners.set(target, { source });
                    else owners.get(target).source = source;
                }
            }

            function render(owners, styles, matches) {
                for (const [target, owner] of owners) {
                    if (!panels.isAlive(target)) { owners.delete(target); nextDiscovery = 0; continue; }
                    let ancestor = target;
                    for (let depth = 0; depth < 64 && panels.isAlive(ancestor) && ancestor !== targetScope; depth++) ancestor = ancestor.GetParent();
                    if (ancestor !== targetScope || !matches(target, owner.source)) {
                        release(target); owners.delete(target); nextDiscovery = 0; continue;
                    }
                    styleOwner.apply(target, styles);
                }
            }

            function update() {
                if (!active) return;
                const current = panels.findHud($.GetContextPanel());
                if (current !== root) { releaseAll(); root = current; }
                if (!panels.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud") || !model.active) {
                    releaseAll();
                    if (loop) loop.reschedule(1.0);
                    return;
                }
                const now = QOL.utils.PerfNowMs();
                const scope = findTargetScope(root);
                if (scope !== targetScope) {
                    releaseAll();
                    targetScope = scope;
                }
                if (now >= nextDiscovery) {
                    const currentShapes = new Map(scope && model.shapeActive ?
                        QOL.utils.FindPanelsByClass(scope, "target_shape").map(panel => [panel, null]) : []);
                    const currentHints = scope && model.hintActive ? hintSources(scope) : new Map();
                    reconcile(shapes, currentShapes);
                    reconcile(hints, currentHints);
                    nextDiscovery = now + (shapes.size || hints.size ? 1000 : 500);
                }
                render(shapes, model.shapeStyles, target => panels.hasClassToken(target, "target_shape"));
                render(hints, model.hintStyles, currentHint);
                if (loop) loop.reschedule(shapes.size || hints.size ? 0.2 : 0.5);
            }

            function refreshSettings() {
                if (!active) return;
                model = readModel();
                nextDiscovery = 0;
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update();
                // Native targets cannot make neutral settings produce an
                // override. Settings changes own restarting discovery.
                if (model.active && !loop) loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id);
                else if (!model.active && loop) { loop.stop(); loop = null; }
            }

            return {
                onEnable() {
                    active = true;
                    refreshSettings();
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    releaseAll(); root = model = null;
                }
            };
        },
        test() {
            try {
                const root = findTargetScope(P.findHud($.GetContextPanel()));
                const shapes = root?.FindChildrenWithClassTraverse("target_shape") || [];
                const hints = hintSources(root);
                return { passed: true, name: "Target shape panels traversal works",
                    message: `Found ${shapes.length} target_shape + ${hints.size} hint panels`,
                    assertions: [{ passed: true, name: "Target/hint traversal succeeded" }]
                };
            } catch (error) {
                return { passed: false, name: "Target shape traversal failed", message: String(error.message || error) };
            }
        }
    });
})();
