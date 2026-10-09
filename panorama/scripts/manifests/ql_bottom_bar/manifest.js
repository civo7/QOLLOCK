// OWNS: Signature bar geometry/visibility, active-item slot geometry and AP leaf color.
// DOES NOT OWN: Ability/item content, currency values or native slot creation.
// Source: hud.xml (Hud > .HudCore > AbilitiesContainer; native currency under APContainer).
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_bottom_bar",
        enabledByDefault: true,
        settings: [
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
            const abilityPath = [{ id: "Hud", optional: true }, { className: "HudCore" }, "AbilitiesContainer"];
            const barResolver = QOL.panelCache.createIdResolver("hud_signature", { ownerPath: abilityPath });
            const activeResolver = QOL.panelCache.createIdResolver("ActiveAbilitiesMenu", { ownerPath: abilityPath });
            const apResolver = QOL.panelCache.createIdResolver("APContainer", { ownerPath: abilityPath });
            const statsResolver = QOL.panelCache.createIdResolver("StatsAndModsContainer", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const soulsResolver = QOL.panelCache.createIdResolver("gold_and_ap_container", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "StatsAndModsContainer", "LowerLeft"]
            });
            const styles = panelAPI.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" } });
            let model = null;
            let loop = null;
            let active = false;

            function readModel() {
                const cfg = ctx.config.view();
                const enabled = cfg.HUD_BOTTOM_BAR_ENABLED === undefined || cfg.HUD_BOTTOM_BAR_ENABLED === true || Number(cfg.HUD_BOTTOM_BAR_ENABLED) === 1;
                const x = Math.round(Number(cfg.BOTTOM_BAR_X_OFFSET)) || 0;
                const y = Math.round(Number(cfg.BOTTOM_BAR_Y_OFFSET)) || 0;
                const opacity = isFinite(Number(cfg.BOTTOM_BAR_OPACITY)) ? Number(cfg.BOTTOM_BAR_OPACITY) : 1;
                const scale = isFinite(Number(cfg.BOTTOM_BAR_SCALE)) ? Number(cfg.BOTTOM_BAR_SCALE) : 1;
                const washColor = enabled ? panelAPI.resolvePaletteColor(cfg.BOTTOM_BAR_WASH_COLOR) : "";
                const barStyles = {};
                if (enabled) {
                    if (x !== 0) barStyles.x = x + "px";
                    if (y !== 0) barStyles.y = -y + "px";
                    // Native hud_signature uses ui-scale: 90%, not 100%.
                    if (Math.abs(scale - 1) > 0.0001) barStyles.uiScale = Math.round(90 * scale) + "%";
                    if (Math.abs(opacity - 1) > 0.0001) barStyles.opacity = opacity.toFixed(2);
                    if (washColor) barStyles.washColor = washColor;
                } else {
                    barStyles.visibility = "collapse";
                }
                const itemScale = QOL.utils.ClampConfigNumber(cfg.ACTIVE_ITEMS_SCALE, 100, 50, 250, true);
                const itemX = QOL.utils.ClampConfigNumber(cfg.ACTIVE_ITEMS_X_OFFSET, 0, -2000, 2000, true);
                const itemY = QOL.utils.ClampConfigNumber(cfg.ACTIVE_ITEMS_Y_OFFSET, 0, -2000, 2000, true);
                const itemStyles = {};
                if (itemScale !== 100) itemStyles.uiScale = itemScale + "%";
                if (itemX !== 0) itemStyles.x = itemX + "px";
                if (itemY !== 0) itemStyles.y = -itemY + "px";
                return { enabled, barStyles, itemStyles, washColor };
            }

            function discoverCurrencyContainers(root, bar, activeItems) {
                let ap = null;
                // Signature and active slots share APContainer's verified owner.
                // Reuse the observed living parent before whole-HUD fallback.
                for (const panel of [bar, activeItems]) {
                    if (!panelAPI.isAlive(panel)) continue;
                    let parent = null;
                    try { parent = panel.GetParent(); } catch (_) { /* stale owner */ }
                    ap = panelAPI.findChild(parent, "APContainer");
                    if (ap) break;
                }
                if (!ap) ap = apResolver.resolve(root);
                const stats = statsResolver.resolve(root);
                const left = panelAPI.findChild(stats, "LowerLeft");
                const souls = panelAPI.findChild(left, "gold_and_ap_container") || soulsResolver.resolve(root);
                return [ap, souls];
            }

            function discoverCurrency(root, bar, activeItems) {
                const sources = new Map();
                if (!model.washColor) return sources;
                const containers = discoverCurrencyContainers(root, bar, activeItems);
                for (const container of containers) {
                    if (!container) continue;
                    for (const icon of QOL.utils.FindPanelsByClass(container, "APCurrencyIcon")) sources.set(icon, "washColor");
                    for (const amount of QOL.utils.FindPanelsByClass(container, "APCurrencyAmount")) sources.set(amount, "color");
                    const infinite = panelAPI.findTraverse(container, "hudAPInfinite");
                    if (infinite) sources.set(infinite, "washColor");
                }
                return sources;
            }

            function update() {
                if (!active) return;
                const root = panelAPI.findHud($.GetContextPanel());
                if (!panelAPI.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { styles.clear(); return; }
                const bar = barResolver.resolve(root), activeItems = activeResolver.resolve(root);
                const currency = discoverCurrency(root, bar, activeItems);
                styles.retain([bar, activeItems, ...currency.keys()]);
                if (bar) styles.apply(bar, model.barStyles, { "qol-hidden": !model.enabled });
                // Active-slot geometry remains independently configurable even
                // when the signature bar itself is hidden.
                if (activeItems) styles.apply(activeItems, model.itemStyles);
                for (const [target, property] of currency) styles.apply(target, { [property]: model.washColor });
            }

            function resetDiscovery() {
                barResolver.reset();
                activeResolver.reset();
                apResolver.reset();
                statsResolver.reset();
                soulsResolver.reset();
            }

            function refreshSettings() {
                if (!active) return;
                model = readModel();
                resetDiscovery();
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
                    resetDiscovery();
                }
            };
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
