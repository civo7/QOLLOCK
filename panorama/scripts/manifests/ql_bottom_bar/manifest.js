// OWNS: Ability bar geometry/visibility/tint and active-item slot geometry.
// DOES NOT OWN: Ability/item content, currency values or native slot creation.
// Source: hud.xml (Hud > .HudCore > AbilitiesContainer).
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_bottom_bar",
        enabledByDefault: true,
        settings: [
            ...QOL.presentation.stateSettings("ql_bottom_bar"),
            { key: "HUD_BOTTOM_BAR_ENABLED", type: "toggle" },
            { key: "BOTTOM_BAR_OPACITY", type: "slider" },
            { key: "BOTTOM_BAR_SCALE", type: "slider" },
            { key: "BOTTOM_BAR_X_OFFSET", type: "slider" },
            { key: "BOTTOM_BAR_Y_OFFSET", type: "slider" },
            { key: "BOTTOM_BAR_WASH_COLOR", type: "palette" },
            { key: "ACTIVE_ITEMS_SCALE", type: "slider" },
            { key: "ACTIVE_ITEMS_X_OFFSET", type: "slider" },
            { key: "ACTIVE_ITEMS_Y_OFFSET", type: "slider" }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            const styles = panelAPI.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" } });
            let model = null;
            let loop = null;
            let active = false;

            function readModel() {
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view());
                const enabled = cfg.HUD_BOTTOM_BAR_ENABLED === undefined || cfg.HUD_BOTTOM_BAR_ENABLED === true || Number(cfg.HUD_BOTTOM_BAR_ENABLED) === 1;
                const x = Math.round(Number(cfg.BOTTOM_BAR_X_OFFSET)) || 0;
                const y = Math.round(Number(cfg.BOTTOM_BAR_Y_OFFSET)) || 0;
                const opacity = QOL.utils.NormalizeOpacityNumber(cfg.BOTTOM_BAR_OPACITY ?? 1, 1);
                const scale = isFinite(Number(cfg.BOTTOM_BAR_SCALE)) ? Number(cfg.BOTTOM_BAR_SCALE) : 1;
                const washColor = enabled ? panelAPI.resolvePaletteColor(cfg.BOTTOM_BAR_WASH_COLOR) : "";
                const barStyles = {};
                if (enabled) {
                    if (x !== 0) barStyles.x = x + "px";
                    if (y !== 0) barStyles.y = -y + "px";
                    // Native hud_signature uses ui-scale: 90%, not 100%.
                    if (Math.abs(scale - 1) > 0.0001) barStyles.uiScale = Number((90 * scale).toFixed(2)) + "%";
                    if (Math.abs(opacity - 1) > 0.0001) barStyles.opacity = opacity.toFixed(2);
                    if (washColor) barStyles.washColor = washColor;
                } else {
                    barStyles.visibility = "collapse";
                }
                const itemScale = QOL.settings.readNumber("ACTIVE_ITEMS_SCALE", cfg.ACTIVE_ITEMS_SCALE);
                const itemX = QOL.settings.readNumber("ACTIVE_ITEMS_X_OFFSET", cfg.ACTIVE_ITEMS_X_OFFSET);
                const itemY = QOL.settings.readNumber("ACTIVE_ITEMS_Y_OFFSET", cfg.ACTIVE_ITEMS_Y_OFFSET);
                const itemStyles = {};
                if (itemScale !== 100) itemStyles.uiScale = itemScale + "%";
                if (itemX !== 0) itemStyles.x = itemX + "px";
                if (itemY !== 0) itemStyles.y = -itemY + "px";
                return { enabled, barStyles, itemStyles };
            }

            function update() {
                if (!active) return;
                const root = panelAPI.findHud($.GetContextPanel());
                if (!panelAPI.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { styles.clear(); return; }
                // Both native menus are direct children in current hud.xml.
                // A missing owner must not borrow a menu from a retired subtree.
                const core = panelAPI.findChildByClass(root, "HudCore");
                const abilities = panelAPI.findChild(core, "AbilitiesContainer");
                const bar = panelAPI.findChild(abilities, "hud_signature");
                const activeItems = panelAPI.findChild(abilities, "ActiveAbilitiesMenu");
                styles.retain([bar, activeItems]);
                if (bar) styles.apply(bar, QOL.presentation.visibilityStyles("bottomBar", QOL.presentation.visibilityConfig(ctx), root, model.barStyles), { "qol-hidden": !model.enabled });
                // Active-slot geometry remains independently configurable even
                // when the signature bar itself is hidden.
                if (activeItems) styles.apply(activeItems, QOL.presentation.visibilityStyles("activeItems", QOL.presentation.visibilityConfig(ctx), root, model.itemStyles));
            }

            function refreshSettings() {
                if (!active) return;
                model = readModel();
                update();
            }

            return QOL.presentation.bindVisibility(ctx, {
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
                }
            }, update);
        },
        test() {
            try {
                const panel = QOL.core.panel.findTraverse($.GetContextPanel(), "hud_signature");
                if (!panel) return null;
                return { passed: true, name: "Bottom bar hud_signature panel exists", message: "", assertions: [{ passed: true, name: "hud_signature panel exists" }] };
            } catch (e) { return { passed: false, name: "Bottom bar panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
