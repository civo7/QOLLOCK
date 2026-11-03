// OWNS: Damage indicator text size/opacity overrides.
// DOES NOT OWN: Valve indicators, cumulative/batched typography or fade animations.
// Source: native hud_event_indicator.css, existing HudIndicatorText class traversal
// and verified event-indicator IDs. Root CSS owns clean/fountain/trooper gates.
(() => {
    "use strict";
    const ID = "ql_damage_numbers";

    QOL.core.FeatureRegistry.register({
        id: ID,
        enabledByDefault: true,
        settings: [
            { key: "DAMAGE_NUMBER_OPACITY", type: "slider" },
            { key: "HUD_INDICATOR_SIZE", type: "slider" },
            { key: "ENABLE_CLEAN_DAMAGE_INDICATORS", type: "toggle" },
            { key: "ENABLE_HIDE_SMALL_NUMBERS", type: "toggle" },
            { key: "ENABLE_HIDE_TROOPER_DAMAGE", type: "toggle" },
            { key: "ENABLE_DAMAGE_FOUNTAIN", type: "toggle" },
            { key: "DAMAGE_FOUNTAIN_SIZE", type: "slider" },
            { key: "ENABLE_CUMULATIVE_DMG", type: "toggle" }
        ],
        create(ctx) {
            const panels = QOL.core.panel;
            const utils = QOL.utils;
            const state = QOL.state;
            const sourceResolvers = [
                "HudEventIndicatorsPanel", "CitadelDamageFeedbackDisplay",
                "CitadelHudEventIndicatorsPanel", "CitadelHudDamageIndicators"
            ].map(id => QOL.panelCache.createIdResolver(id, { retryMs: 2500 }));
            const owners = new Set();
            const styles = panels.createNativeStyleOwner();
            let root = null;
            let source = null;
            let scope = null;
            let model = null;
            let nextDiscovery = 0;
            let loop = null, active = false;

            function resetDiscovery() {
                for (const resolver of sourceResolvers) resolver.reset();
            }

            function resolveSource(currentRoot) {
                for (const resolver of sourceResolvers) {
                    const current = resolver.resolve(currentRoot);
                    if (current) return current;
                }
                return null;
            }

            function readModel() {
                const cfg = ctx.config.view();
                const opacity = utils.NormalizeOpacityNumber(cfg.DAMAGE_NUMBER_OPACITY ?? 1, 1).toFixed(2);
                const size = QOL.settings.readNumber("HUD_INDICATOR_SIZE", cfg.HUD_INDICATOR_SIZE);
                return { size, opacity, active: size !== 18 || opacity !== "1.00" };
            }

            function release(target) { styles.apply(target, {}); }

            function releaseAll() {
                styles.clear(); owners.clear(); nextDiscovery = 0;
            }

            function discover() {
                const current = new Set(scope.FindChildrenWithClassTraverse("HudIndicatorText") || []);
                for (const target of owners) {
                    if (!current.has(target)) { release(target); owners.delete(target); }
                }
                for (const target of current) if (panels.isAlive(target) && !owners.has(target)) {
                    owners.add(target);
                }
                nextDiscovery = utils.PerfNowMs() + 2500;
            }

            function apply(target) {
                // Valve can recycle a live label for another indicator role.
                // Re-read those native classes rather than freezing metadata.
                const cumulative = utils.HasClassInHierarchy(target, "cumulative") || utils.HasClassInHierarchy(target, "batched");
                const plan = model.opacity !== "1.00" ? { opacity: model.opacity } : {};
                if (!cumulative && model.size !== 18) plan.fontSize = (target.id === "Desc" || target.id === "Effectiveness" ? Math.min(28, model.size) : model.size) + "px";
                return styles.apply(target, plan);
            }

            function update() {
                if (!active) return;
                const current = panels.findHud($.GetContextPanel());
                if (current !== root) {
                    releaseAll(); resetDiscovery(); root = current; source = null;
                }
                if (!panels.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud") || (!model.active && !state.accountPresetTestActive)) { releaseAll(); return; }
                const nextSource = resolveSource(root);
                if (nextSource !== source) { releaseAll(); source = nextSource; }
                const nextScope = source || root.FindChildTraverse("gameplay_hud") || root;
                if (nextScope !== scope) { releaseAll(); scope = nextScope; }
                const now = utils.PerfNowMs();
                if (now >= nextDiscovery) discover();
                for (const target of owners) {
                    if (!panels.isAlive(target)) { owners.delete(target); nextDiscovery = 0; continue; }
                    let ancestor = target;
                    for (let depth = 0; depth < 64 && panels.isAlive(ancestor) && ancestor !== scope; depth++) ancestor = ancestor.GetParent();
                    if (ancestor !== scope || !target.BHasClass("HudIndicatorText")) {
                        release(target); owners.delete(target); nextDiscovery = 0; continue;
                    }
                    apply(target);
                }
            }

            function refreshSettings() {
                if (!active) return;
                model = readModel(); nextDiscovery = 0; resetDiscovery();
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update();
                // Native events cannot turn a neutral settings-only plan into
                // an override. The next settings hook restarts discovery.
                if (model.active && !loop) loop = QOL.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
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
                    releaseAll(); resetDiscovery(); root = source = scope = model = null;
                }
            };
        },
        test() {
            const root = $.GetContextPanel();
            const source = root?.FindChildTraverse("HudEventIndicatorsPanel") || root?.FindChildTraverse("CitadelHudDamageIndicators");
            if (!source) return null;
            return { passed: true, name: "Damage indicators panel exists", message: "",
                assertions: [{ passed: true, name: "Damage indicators container exists" }] };
        }
    });
})();
