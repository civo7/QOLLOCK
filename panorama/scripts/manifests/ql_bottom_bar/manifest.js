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
            const bar = { panel: null, signature: null, offsets: { x: false, y: false }, applied: new Set() };
            const activeItems = { panel: null, signature: null, offsets: { x: false, y: false }, applied: new Set() };
            const barProperties = ["x", "y", "preTransformScale2d", "uiScale", "opacity", "washColor", "visibility"];
            const activeProperties = ["x", "y", "uiScale"];
            const currency = new Map();
            let model = null;
            let loop = null;

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

            function clearAbsentStyles(owner, properties, styles) {
                for (const property of properties) {
                    if (Object.prototype.hasOwnProperty.call(styles, property)) continue;
                    if (!owner.applied.has(property)) continue;
                    // Explicit zero is required by native offset reset behavior.
                    if (owner.offsets[property]) owner.panel.style[property] = "0px";
                    QOL.utils.ClearStyleSafe(owner.panel, property);
                    owner.applied.delete(property);
                    if (property === "x" || property === "y") owner.offsets[property] = false;
                }
            }

            function releaseOwner(owner, properties) {
                if (panelAPI.isAlive(owner.panel)) clearAbsentStyles(owner, properties, {});
                owner.offsets.x = owner.offsets.y = false;
                owner.applied.clear();
                owner.signature = null;
            }

            function bindOwner(owner, current, properties) {
                if (current === owner.panel) return;
                releaseOwner(owner, properties);
                if (owner === bar) panelAPI.setClass(owner.panel, "qol-hidden", false);
                owner.panel = current;
            }

            function renderOwner(owner, properties, styles) {
                if (!owner.panel || owner.signature !== null) return;
                clearAbsentStyles(owner, properties, styles);
                owner.offsets.x = Object.prototype.hasOwnProperty.call(styles, "x");
                owner.offsets.y = Object.prototype.hasOwnProperty.call(styles, "y");
                for (const property of Object.keys(styles)) owner.applied.add(property);
                owner.signature = panelAPI.syncStyles(owner.panel, styles, owner.signature).sig;
            }

            function releaseCurrency(target, state) {
                if (panelAPI.isAlive(target)) QOL.utils.ClearStyleSafe(target, state.property);
            }

            function discoverCurrencyContainers(root) {
                let ap = null;
                // Signature and active slots share APContainer's verified owner.
                // Reuse the observed living parent before whole-HUD fallback.
                for (const owner of [bar, activeItems]) {
                    if (!panelAPI.isAlive(owner.panel)) continue;
                    let parent = null;
                    try { parent = owner.panel.GetParent(); } catch (_) { /* stale owner */ }
                    ap = panelAPI.findChild(parent, "APContainer");
                    if (ap) break;
                }
                if (!ap) ap = apResolver.resolve(root);
                const stats = statsResolver.resolve(root);
                const left = panelAPI.findChild(stats, "LowerLeft");
                const souls = panelAPI.findChild(left, "gold_and_ap_container") || soulsResolver.resolve(root);
                return [ap, souls];
            }

            function updateCurrency(root) {
                if (!model.washColor) {
                    for (const [target, state] of currency) releaseCurrency(target, state);
                    currency.clear();
                    return;
                }
                const sources = new Map();
                const containers = discoverCurrencyContainers(root);
                for (const container of containers) {
                    if (!container) continue;
                    for (const icon of QOL.utils.FindPanelsByClass(container, "APCurrencyIcon")) sources.set(icon, "washColor");
                    for (const amount of QOL.utils.FindPanelsByClass(container, "APCurrencyAmount")) sources.set(amount, "color");
                    const infinite = panelAPI.findTraverse(container, "hudAPInfinite");
                    if (infinite) sources.set(infinite, "washColor");
                }
                for (const [target, state] of currency) {
                    if (!sources.has(target) || sources.get(target) !== state.property) {
                        releaseCurrency(target, state);
                        currency.delete(target);
                    }
                }
                for (const [target, property] of sources) {
                    const previous = currency.get(target);
                    const signature = previous ? previous.signature : null;
                    currency.set(target, { property, signature: panelAPI.syncStyles(target, { [property]: model.washColor }, signature).sig });
                }
            }

            function update() {
                const root = $.GetContextPanel();
                bindOwner(bar, barResolver.resolve(root), barProperties);
                bindOwner(activeItems, activeResolver.resolve(root), activeProperties);
                panelAPI.setClass(bar.panel, "qol-hidden", !model.enabled);
                renderOwner(bar, barProperties, model.barStyles);
                // Active-slot geometry remains independently configurable even
                // when the signature bar itself is hidden.
                renderOwner(activeItems, activeProperties, model.itemStyles);
                updateCurrency(root);
            }

            function resetDiscovery() {
                barResolver.reset();
                activeResolver.reset();
                apResolver.reset();
                statsResolver.reset();
                soulsResolver.reset();
            }

            function refreshSettings() {
                model = readModel();
                bar.signature = activeItems.signature = null;
                resetDiscovery();
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
                    releaseOwner(bar, barProperties);
                    releaseOwner(activeItems, activeProperties);
                    panelAPI.setClass(bar.panel, "qol-hidden", false);
                    for (const [target, state] of currency) releaseCurrency(target, state);
                    currency.clear();
                    bar.panel = activeItems.panel = model = null;
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
