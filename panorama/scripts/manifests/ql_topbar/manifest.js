// manifests/ql_topbar/manifest.js
// =============================================================================
// QOLLOCK — Top Bar HUD (position, scale, opacity, visibility)
// =============================================================================
// OWNS:        Top bar panel: position, scale, opacity, visibility, HUD state
// DOES NOT OWN: Top bar content (scores, timers, player panels)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: HUD_TOP_BAR_ENABLED, TOP_BAR_OPACITY, TOP_BAR_SCALE,
//              TOP_BAR_X_OFFSET, TOP_BAR_Y_OFFSET
// PANEL ID:    TopBar
// PATTERN:     Polled every 0.5 seconds — HUD visibility flips during match (spectating,
//              escape menu, hideout) require re-evaluation every tick.
// =============================================================================

(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_topbar",
        enabledByDefault: true,
        settings: [
            { key: "HUD_TOP_BAR_ENABLED", type: "toggle" },
            { key: "ENABLE_OBJ_MAP", type: "toggle", label: "Objective Map", description: "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base." },
            { key: "ENABLE_MISSING_HERO", type: "toggle", label: "Missing Hero Opaque", description: "Greys out heros in the top bar when missing on the map." },
            { key: "ENABLE_OBJ_DMG", type: "toggle", label: "Objective Damage", description: "Shows the individual player's objective damage in the top bar." },
            { key: "DISABLE_PLAYER_NAME_BLUR", type: "toggle", invert: true, label: "Top Bar Background", description: "The world blur behind player names in the top bar." },
            {
                key: "ENABLE_TOPBAR_ENEMY_HP_WARNING",
                type: "multitoggle",
                label: "Enemy HP Warning",
                description: "Colored enemy top-bar health warnings when at significant thresholds.",
                options: [
                    { label: "25%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_25" },
                    { label: "65%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_65" },
                    { label: "75%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_75" }
                ]
            },
            {
                key: "ENABLE_TOPBAR_ALLY_HP_WARNING",
                type: "multitoggle",
                label: "Ally HP Warning",
                description: "Colored ally top-bar health warnings when at significant thresholds.",
                options: [
                    { label: "25%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_25" },
                    { label: "65%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_65" },
                    { label: "75%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_75" }
                ]
            },
            { key: "TOP_BAR_OPACITY", type: "slider" },
            { key: "TOP_BAR_SCALE", type: "slider" },
            { key: "TOP_BAR_X_OFFSET", type: "slider" },
            { key: "TOP_BAR_Y_OFFSET", type: "slider" }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            // hud.xml: Hud > .HudCore > TopBar.
            const resolver = QOL.panelCache.createIdResolver("TopBar", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const styles = panelAPI.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" } });
            let model = null;
            let loop = null;
            let active = false;

            function readModel(cfg) {
                const enabled = cfg.HUD_TOP_BAR_ENABLED === undefined || cfg.HUD_TOP_BAR_ENABLED === true || Number(cfg.HUD_TOP_BAR_ENABLED) === 1;
                const x = Math.round(Math.max(-2000, Math.min(2000, Number(cfg.TOP_BAR_X_OFFSET) || 0)));
                const y = Math.round(Math.max(-2000, Math.min(2000, Number(cfg.TOP_BAR_Y_OFFSET) || 0)));
                const opacity = isFinite(Number(cfg.TOP_BAR_OPACITY)) ? Number(cfg.TOP_BAR_OPACITY) : 1;
                const scale = isFinite(Number(cfg.TOP_BAR_SCALE)) ? Number(cfg.TOP_BAR_SCALE) : 1;
                const styles = {};
                if (enabled) {
                    if (x !== 0) styles.x = x + "px";
                    if (y !== 0) styles.y = -y + "px";
                    if (Math.abs(scale - 1) > 0.0001) styles.uiScale = Math.round(scale * 100) + "%";
                    if (Math.abs(opacity - 1) > 0.0001) styles.opacity = opacity.toFixed(2);
                } else {
                    styles.visibility = "collapse";
                }
                return { enabled, styles };
            }

            function update() {
                if (!active) return;
                const root = panelAPI.findHud($.GetContextPanel());
                const panel = panelAPI.isAlive(root) && (root.id === "Hud" || root.paneltype === "CitadelHud") ? resolver.resolve(root) : null;
                styles.retain([panel]);
                if (!panel) return;
                const visible = QOL.isHudVisibleForTopBarRuntime(root, panel);
                styles.apply(panel, visible || !model.enabled ? model.styles : {}, { "qol-hidden": !model.enabled });
            }

            function refreshSettings() {
                if (!active) return;
                model = readModel(ctx.config.view());
                resolver.reset();
                update();
            }

            return {
                onEnable() {
                    active = true;
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    styles.clear();
                    model = null;
                    resolver.reset();
                }
            };
        },
        test() {
            try {
                const root = $.GetContextPanel();
                const panel = root ? root.FindChildTraverse("TopBar") : null;
                if (!panel) return null;  // Skip — not in a match context
                return { passed: true, name: "Top bar panel exists", message: "", assertions: [{ passed: true, name: "TopBar panel exists" }] };
            } catch(e) { return { passed: false, name: "Top bar panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
