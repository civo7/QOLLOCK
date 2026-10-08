// OWNS: Passive cooldown mode classes and Basic native layout/shop visibility.
// DOES NOT OWN: Advanced item mirror panels, audio reminders or native cooldown values.
// Source: hud.xml (Hud > .HudCore > AbilitiesContainer > hud_passive_items).
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_passive_cooldown",
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: false },
            { key: "ENABLE_OLD_ITEM_COOLDOWNS", type: "toggle", default: false },
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider", min: 30, max: 60, step: 1, default: 40 },
            { key: "PASSIVE_COOLDOWN_Y", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_X", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 0.5 }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            const resolver = QOL.panelCache.createIdResolver("hud_passive_items", {
                retryMs: 500,
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "AbilitiesContainer"]
            });
            const properties = ["uiScale", "x", "y", "marginLeft", "marginTop", "opacity", "visibility"];
            const applied = new Set();
            let root = null;
            let panel = null;
            let signature = null;
            let model = null;
            let loop = null;

            function readModel() {
                const cfg = ctx.config.view();
                const mode = QOL.core.hud.resolvePassiveCooldownMode(cfg);
                const clamp = QOL.utils.ClampConfigNumber;
                const size = clamp(cfg.PASSIVE_COOLDOWN_SIZE, 40, 30, 60, false);
                const scale = clamp(size / 40 * 110, 110, 50, 200, true);
                const x = clamp(cfg.PASSIVE_COOLDOWN_X, 0, -50, 50, false);
                const y = clamp(cfg.PASSIVE_COOLDOWN_Y, 0, -50, 50, false);
                const opacity = clamp(cfg.PASSIVE_COOLDOWN_OPACITY, 0.5, 0, 1, false);
                return { mode, styles: {
                    uiScale: scale + "%", x: "11px", y: "30px",
                    marginLeft: x.toFixed(2) + "%", marginTop: (-6 - y).toFixed(2) + "%",
                    opacity: String(opacity)
                } };
            }

            function releaseRoot(target) {
                panelAPI.setClass(target, "passive_cooldown_basic_active", false);
                panelAPI.setClass(target, "passive_cooldown_advanced_active", false);
            }

            function releasePanel(target) {
                if (!panelAPI.isAlive(target)) { applied.clear(); return; }
                for (const property of applied) QOL.utils.ClearStyleSafe(target, property);
                applied.clear();
                panelAPI.setClass(target, "passive_cooldown_basic_active", false);
                panelAPI.setClass(target, "qol-hidden", false);
            }

            function update() {
                const currentRoot = QOL.core.hud.findHud();
                if (currentRoot !== root) {
                    releaseRoot(root);
                    root = currentRoot;
                }
                const basic = model.mode === "basic";
                panelAPI.setClass(root, "passive_cooldown_basic_active", basic);
                panelAPI.setClass(root, "passive_cooldown_advanced_active", model.mode === "advanced");
                const current = resolver.resolve(root);
                if (current !== panel) {
                    releasePanel(panel);
                    panel = current;
                    signature = null;
                }
                if (!panel) return;
                panelAPI.setClass(panel, "passive_cooldown_basic_active", basic);
                // Native shop listeners live on AbilitiesContainer. Read the
                // current ancestry so replacements do not inherit a stale gate.
                const shopHidden = basic && QOL.utils.HasClassInHierarchy(panel, "gShopOpen");
                panelAPI.setClass(panel, "qol-hidden", shopHidden);
                if (shopHidden) {
                    applied.add("visibility");
                    QOL.utils.SetStyleIfChanged(panel, "visibility", "collapse");
                } else if (applied.has("visibility")) {
                    QOL.utils.ClearStyleSafe(panel, "visibility");
                    applied.delete("visibility");
                }
                if (signature !== null) return;
                if (basic) {
                    for (const property of Object.keys(model.styles)) applied.add(property);
                    signature = panelAPI.syncStyles(panel, model.styles, signature).sig;
                } else {
                    for (const property of properties) if (applied.has(property)) QOL.utils.ClearStyleSafe(panel, property);
                    applied.clear();
                    signature = "native";
                }
            }

            function refreshSettings() {
                model = readModel();
                signature = null;
                resolver.reset();
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
                    releaseRoot(root);
                    releasePanel(panel);
                    root = panel = model = null;
                    signature = null;
                    resolver.reset();
                }
            };
        },
        test() {
            try {
                const hud = QOL.core.hud.findHud();
                if (!hud) return null;
                return { passed: true, name: "Passive cooldown Hud panel exists", message: "", assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch (e) { return { passed: false, name: "Passive cooldown panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
