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
            const ownedStyles = ["x", "y", "washColor", "visibility"];
            const applied = new Set();
            const children = new Map();
            let panel = null;
            let signature = null;
            let model = null;
            let loop = null;
            let washApplied = false;

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

            function releaseWash() {
                if (washApplied && panelAPI.isAlive(panel)) {
                    // Empty strings are not a Panorama color. Restore neutral
                    // multiplication before releasing the previous code tint.
                    panel.style.washColor = "transparent";
                    QOL.utils.ClearStyleSafe(panel, "washColor");
                }
                washApplied = false;
            }

            function discoverContainer() {
                const owner = resolver.resolve($.GetContextPanel());
                if (!owner) return null;
                const left = panelAPI.findChild(owner, "LowerLeft");
                const native = panelAPI.findChild(left, "ModsContainer");
                if (native) return native;
                // Preserve class-based compatibility for layouts not matching
                // current hud.xml, scoped to the discovered native stats owner.
                return QOL.utils.FindFirstPanelByClass(owner, "ModsContainer");
            }

            function releaseChild(target) {
                if (children.get(target)?.owned && panelAPI.isAlive(target)) QOL.utils.ClearStyleSafe(target, "opacity");
            }

            function release() {
                for (const target of children.keys()) releaseChild(target);
                children.clear();
                releaseWash();
                if (!panelAPI.isAlive(panel)) { applied.clear(); return; }
                for (const property of applied) {
                    if (property === "x" || property === "y") panel.style[property] = "0px";
                    QOL.utils.ClearStyleSafe(panel, property);
                }
                applied.clear();
                panelAPI.setClass(panel, "qol-hidden", false);
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

            function renderChildren(sources) {
                for (const target of children.keys()) {
                    if (!sources.has(target)) { releaseChild(target); children.delete(target); }
                }
                for (const [target, opacity] of sources) {
                    if (!panelAPI.isAlive(target)) continue;
                    const previous = children.get(target);
                    if (opacity === null) {
                        if (!previous || previous.opacity !== null) releaseChild(target);
                        children.set(target, { opacity, signature: "native", owned: false });
                    } else {
                        const sig = previous && previous.opacity === opacity ? previous.signature : null;
                        children.set(target, { opacity, owned: true, signature: panelAPI.syncStyles(target, { opacity }, sig).sig });
                    }
                }
            }

            function update() {
                const current = discoverContainer();
                if (current !== panel) {
                    release();
                    panel = current;
                    signature = null;
                }
                if (!panel) return;
                panelAPI.setClass(panel, "qol-hidden", !model.enabled);
                if (signature === null) {
                    // Opacity belongs to leaf icons/graph; applying it on the
                    // container as well would multiply the configured opacity.
                    if (!model.styles.washColor) releaseWash();
                    else washApplied = true;
                    for (const property of ownedStyles) {
                        if (!applied.has(property) || property in model.styles) continue;
                        if (property === "x" || property === "y") panel.style[property] = "0px";
                        QOL.utils.ClearStyleSafe(panel, property);
                        applied.delete(property);
                    }
                    for (const property of Object.keys(model.styles)) applied.add(property);
                    signature = panelAPI.syncStyles(panel, model.styles, signature).sig;
                }
                // Native icons are conditional and can appear without a settings
                // change. Keep membership discovery alive at the existing cadence.
                renderChildren(discoverChildren());
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
                    loop = QOL.core.Scheduler.createPollLoop(update, 1.0, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    release();
                    panel = model = null;
                    signature = null;
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
