// OWNS: Native inventory container geometry, wash color, qol-hidden and child opacity.
// DOES NOT OWN: Item content, purchased-item state or other HUD panels.
// Source: hud.xml (Hud > .HudCore > StatsAndModsContainer > LowerLeft > ModsContainer).
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_items",
        enabledByDefault: true,
        settings: [
            { key: "HUD_ITEMS_ENABLED", type: "toggle" },
            { key: "ITEMS_OPACITY", type: "slider" },
            { key: "ITEMS_X_OFFSET", type: "slider" },
            { key: "ITEMS_Y_OFFSET", type: "slider" },
            { key: "ITEMS_WASH_COLOR", type: "palette" }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            const resolver = QOL.panelCache.createIdResolver("StatsAndModsContainer", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const styles = panelAPI.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px", washColor: "transparent" } });
            let panel = null;
            let model = null;
            let loop = null;
            let active = false;

            function readModel() {
                const cfg = ctx.config.view();
                const enabled = cfg.HUD_ITEMS_ENABLED === undefined || cfg.HUD_ITEMS_ENABLED === true || Number(cfg.HUD_ITEMS_ENABLED) === 1;
                const opacity = isFinite(Number(cfg.ITEMS_OPACITY)) ? Number(cfg.ITEMS_OPACITY).toFixed(2) : "1.00";
                const styles = {};
                const x = Math.round(Number(cfg.ITEMS_X_OFFSET)) || 0;
                const y = Math.round(Number(cfg.ITEMS_Y_OFFSET)) || 0;
                if (enabled && x) styles.x = x + "px";
                if (enabled && y) styles.y = -y + "px";
                const color = enabled ? panelAPI.resolvePaletteColor(cfg.ITEMS_WASH_COLOR) : "";
                if (color) styles.washColor = color;
                if (!enabled) styles.visibility = "collapse";
                return { enabled, opacity, styles };
            }

            function discoverContainer(root) {
                const owner = resolver.resolve(root);
                if (!owner) return null;
                const left = panelAPI.findChild(owner, "LowerLeft");
                const native = panelAPI.findChild(left, "ModsContainer");
                if (native) return native;
                // Preserve class-based compatibility for layouts not matching
                // current hud.xml, scoped to the discovered native stats owner.
                return QOL.utils.FindFirstPanelByClass(owner, "ModsContainer");
            }

            function discoverChildren() {
                const sources = new Map();
                const opacity = model.enabled && model.opacity !== "1.00" ? model.opacity : null;
                const graph = panelAPI.findTraverse(panel, "BarGraphContainer");
                if (graph) sources.set(graph, opacity);
                for (const section of QOL.utils.FindPanelsByClass(panel, "ModSection")) sources.set(section, null);
                for (const icon of QOL.utils.FindPanelsByClass(panel, "mod_icon_single_container")) sources.set(icon, opacity);
                return sources;
            }

            function update() {
                if (!active) return;
                const root = panelAPI.findHud($.GetContextPanel());
                panel = panelAPI.isAlive(root) && (root.id === "Hud" || root.paneltype === "CitadelHud") ? discoverContainer(root) : null;
                if (!panel) { styles.clear(); return; }
                const sources = discoverChildren();
                styles.retain([panel, ...sources.keys()]);
                styles.apply(panel, model.styles, { "qol-hidden": !model.enabled });
                // Native icons are conditional and can appear without a settings
                // change. Opacity belongs to leaves, so it is never multiplied
                // again by applying it to the inventory container.
                for (const [target, opacity] of sources) styles.apply(target, opacity === null ? {} : { opacity });
            }

            function refreshSettings() {
                if (!active) return;
                model = readModel();
                resolver.reset();
                update();
            }

            return {
                onEnable() {
                    active = true;
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 1.0, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    styles.clear();
                    panel = model = null;
                    resolver.reset();
                }
            };
        },
        test() {
            try {
                const root = $.GetContextPanel();
                let panel = root ? root.FindChildTraverse("StatsAndModsContainer") : null;
                if (!panel) panel = root ? root.FindChildTraverse("ModsContainer") : null;
                if (!panel) return null;
                return { passed: true, name: "Items mods panel exists", message: "", assertions: [{ passed: true, name: "StatsAndModsContainer or ModsContainer exists" }] };
            } catch (e) { return { passed: false, name: "Items panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
