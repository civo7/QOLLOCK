// OWNS: Damage indicator text size/opacity overrides and small-number filtering.
// DOES NOT OWN: Valve indicators, cumulative/batched typography or fade animations.
// Source: native hud_event_indicator.css, existing HudIndicatorText class traversal
// and verified event-indicator IDs. Root CSS owns clean/fountain/trooper gates.
(() => {
    "use strict";
    const ID = "ql_damage_numbers";
    const smallDamageClasses = ["bullet_damage_new", "ability_damage_new", "melee_damage_new", "pure_damage_new",
        "damage_type_gun", "damage_type_melee", "damage_type_ability", "damage_type_pure", "damage_type_poison"];

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
            const owners = new Map();
            let root = null;
            let source = null;
            let model = null;
            let nextDiscovery = 0;
            let loop = null;

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
                const opacity = utils.ClampConfigNumber(cfg.DAMAGE_NUMBER_OPACITY, 1, 0, 1).toFixed(2);
                const size = utils.ClampConfigNumber(cfg.HUD_INDICATOR_SIZE, 18, 10, 60, true);
                const hideSmall = utils.IsCfgEnabled(cfg, "ENABLE_HIDE_SMALL_NUMBERS");
                const clean = utils.IsCfgEnabled(cfg, "ENABLE_CLEAN_DAMAGE_INDICATORS");
                return { size, opacity, hideSmall, active: size !== 18 || opacity !== "1.00" || hideSmall || clean,
                    signature: [size, opacity, hideSmall ? 1 : 0, clean ? 1 : 0].join("|") };
            }

            function releaseProperty(target, owner, property) {
                if (!owner.properties.has(property)) return;
                if (panels.isAlive(target)) utils.ClearStyleSafe(target, property);
                owner.properties.delete(property);
            }

            function release(target, owner) {
                for (const property of [...owner.properties]) releaseProperty(target, owner, property);
            }

            function releaseAll() {
                for (const [target, owner] of owners) release(target, owner);
                owners.clear(); nextDiscovery = 0;
                state.indicatorPanelsCache = [];
                state.indicatorMetaCache = [];
                state.lastIndicatorCount = 0;
                state.lastIndicatorConfigSig = "";
                state.lastIndicatorHideModesSig = "";
                if (state.runtimeTaskNextMs) {
                    delete state.runtimeTaskNextMs.hud_indicator_refresh;
                    delete state.runtimeTaskNextMs.hud_indicator_panel_cache;
                }
            }

            function discover() {
                const scope = source || root.FindChildTraverse("gameplay_hud") || root;
                const current = new Set(scope.FindChildrenWithClassTraverse("HudIndicatorText") || []);
                for (const [target, owner] of owners) {
                    if (!current.has(target)) { release(target, owner); owners.delete(target); }
                }
                for (const target of current) if (panels.isAlive(target) && !owners.has(target)) {
                    owners.set(target, { properties: new Set() });
                }
                nextDiscovery = utils.PerfNowMs() + (model.hideSmall ? 700 : 2500);
                state.indicatorPanelsCache = [...owners.keys()];
            }

            function apply(target, owner) {
                // Valve can recycle a live label for another indicator role.
                // Re-read those native classes rather than freezing metadata.
                const cumulative = utils.HasClassInHierarchy(target, "cumulative") || utils.HasClassInHierarchy(target, "batched");
                const small = model.hideSmall && smallDamageClasses.some(name => utils.HasClassInHierarchy(target, name));
                const styles = { opacity: small ? "0.00" : model.opacity };
                if (!cumulative) styles.fontSize = (target.id === "Desc" || target.id === "Effectiveness" ? Math.min(28, model.size) : model.size) + "px";
                for (const property of [...owner.properties]) if (!(property in styles)) releaseProperty(target, owner, property);
                for (const [property, value] of Object.entries(styles)) {
                    if (target.style[property] === value) continue;
                    // Retain attempted ownership even if a native setter rejects
                    // one write; the next observation retries that property.
                    owner.properties.add(property);
                    utils.SetStyleIfChanged(target, property, value);
                }
            }

            function update() {
                const current = $.GetContextPanel();
                if (current !== root) {
                    releaseAll(); resetDiscovery(); root = current; source = null;
                }
                if (!panels.isAlive(root) || (!model.active && !state.accountPresetTestActive)) { releaseAll(); return; }
                const nextSource = resolveSource(root);
                if (nextSource !== source) { releaseAll(); source = nextSource; }
                const now = utils.PerfNowMs();
                if (now >= nextDiscovery) discover();
                for (const [target, owner] of owners) {
                    if (!panels.isAlive(target)) { owners.delete(target); nextDiscovery = 0; continue; }
                    apply(target, owner);
                }
                state.indicatorMetaCache = [...owners.keys()].map(panel => ({ panel }));
                state.lastIndicatorCount = owners.size;
                state.lastIndicatorConfigSig = model.signature;
                state.lastIndicatorHideModesSig = model.hideSmall ? "1" : "0";
            }

            function refreshSettings() {
                model = readModel(); nextDiscovery = 0; resetDiscovery();
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update();
            }

            return {
                onEnable() {
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    releaseAll(); resetDiscovery(); root = source = model = null;
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
