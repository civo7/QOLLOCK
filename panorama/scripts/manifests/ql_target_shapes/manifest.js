// OWNS: Native target/hint shape size and target opacity code overrides.
// DOES NOT OWN: Valve target panels, targeting animations or root feature gates.
// Source: native ability_hud_element_unit_target.xml UnitTarget snippet:
// .unit_target_instance > unscaled_panel > hint_container / scaled_panel > hint_container.
// Native target_shape classes and children remain with Valve; no XML hook is required.
(() => {
    "use strict";
    const ID = "ql_target_shapes";
    const P = QOL.core.panel;
    const clamp = QOL.utils.ClampConfigNumber;
    const styleTexts = cfg => ({
        scaleText: (clamp(cfg.UNIT_TARGET_SIZE, 150, 50, 300, true) / 100).toFixed(3),
        opacityText: clamp(cfg.UNIT_TARGET_OPACITY, 1, 0, 1).toFixed(2),
        hintScaleText: (clamp(cfg.UNIT_TARGET_HINT_SIZE, 100, 50, 200, true) / 100).toFixed(3)
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
            const shapes = new Map();
            const hints = new Map();
            let root = null;
            let model = null;
            let nextDiscovery = 0;
            let loop = null;
            let active = false;

            function readModel() {
                const cfg = ctx.config.view();
                const styles = styleTexts(cfg);
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
            }

            function reconcile(owners, current) {
                for (const [target, owner] of owners) {
                    if (!current.has(target)) { release(target, owner); owners.delete(target); }
                }
                for (const [target, source] of current) if (panels.isAlive(target)) {
                    if (!owners.has(target)) owners.set(target, { properties: new Set(), signature: null, source });
                    else owners.get(target).source = source;
                }
            }

            function render(owners, styles, matches) {
                for (const [target, owner] of owners) {
                    if (!panels.isAlive(target)) { owners.delete(target); nextDiscovery = 0; continue; }
                    let ancestor = target;
                    for (let depth = 0; depth < 64 && panels.isAlive(ancestor) && ancestor !== root; depth++) ancestor = ancestor.GetParent();
                    if (ancestor !== root || !matches(target, owner.source)) {
                        release(target, owner); owners.delete(target); nextDiscovery = 0; continue;
                    }
                    // A partial rejected write remains owned and is retried.
                    for (const property of Object.keys(styles)) owner.properties.add(property);
                    owner.signature = panels.syncStyles(target, styles, owner.signature).sig;
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
                if (now >= nextDiscovery) {
                    reconcile(shapes, new Map(QOL.utils.FindPanelsByClass(root, "target_shape").map(panel => [panel, null])));
                    reconcile(hints, hintSources(root));
                    nextDiscovery = now + (shapes.size || hints.size ? 1000 : 500);
                }
                render(shapes, model.shapeStyles, target => panels.hasClassToken(target, "target_shape"));
                render(hints, model.hintStyles, currentHint);
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
                    active = true;
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, model.active ? 0.2 : 1.0, ctx.id);
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
                const root = $.GetContextPanel();
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
