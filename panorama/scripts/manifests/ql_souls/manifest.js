// OWNS: Souls container x/y/opacity overrides and qol-hidden.
// DOES NOT OWN: Souls/AP values, native economy updates or neighboring inventory.
// Source: hud.xml, Hud > .HudCore > StatsAndModsContainer > LowerLeft > gold_and_ap_container.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_souls",
        // Visibility is a presentation setting; keep discovery alive while hidden.
        enabledByDefault: true,
        settings: [
            { key: "HUD_SOULS_ENABLED", type: "toggle" },
            { key: "SOULS_OPACITY", type: "slider" },
            { key: "SOULS_X_OFFSET", type: "slider" },
            { key: "SOULS_Y_OFFSET", type: "slider" }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            const resolver = QOL.panelCache.createIdResolver("gold_and_ap_container", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "StatsAndModsContainer", "LowerLeft"]
            });
            const ownedStyles = ["x", "y", "opacity", "visibility"];
            const applied = new Set();
            let panel = null;
            let signature = null;
            let model = null;
            let loop = null;
            const offsets = { x: false, y: false };

            function clearOwnedStyle(target, property) {
                if (!applied.has(property)) return;
                // Native layout can retain the last resolved offset after a
                // code-property clear. Zero the owned offset before releasing it.
                if (offsets[property]) target.style[property] = "0px";
                QOL.utils.ClearStyleSafe(target, property);
                applied.delete(property);
                if (property === "x" || property === "y") offsets[property] = false;
            }

            function readModel() {
                const cfg = ctx.config.view();
                const enabled = cfg.HUD_SOULS_ENABLED === undefined || cfg.HUD_SOULS_ENABLED === true || Number(cfg.HUD_SOULS_ENABLED) === 1;
                const x = Math.round(Number(cfg.SOULS_X_OFFSET)) || 0;
                const y = Math.round(Number(cfg.SOULS_Y_OFFSET)) || 0;
                const value = Number(cfg.SOULS_OPACITY ?? 1);
                const opacity = Number.isFinite(value) ? value : 1;
                const styles = {};
                if (enabled) {
                    if (x !== 0) styles.x = x + "px";
                    if (y !== 0) styles.y = -y + "px";
                    if (Math.abs(opacity - 1) > 0.0001) styles.opacity = opacity.toFixed(2);
                } else {
                    // Native ID visibility rules can outbid a generic class.
                    styles.visibility = "collapse";
                }
                return { enabled, styles };
            }

            function release(target) {
                if (panelAPI.isAlive(target)) {
                    for (const property of ownedStyles) clearOwnedStyle(target, property);
                    panelAPI.setClass(target, "qol-hidden", false);
                }
                applied.clear();
                offsets.x = offsets.y = false;
            }

            function update() {
                const current = resolver.resolve(QOL.core.hud.findHud());
                if (current !== panel) {
                    release(panel);
                    panel = current;
                    signature = null;
                }
                if (!panel || signature !== null) return;
                for (const property of ownedStyles) {
                    if (!Object.prototype.hasOwnProperty.call(model.styles, property)) clearOwnedStyle(panel, property);
                }
                offsets.x = Object.prototype.hasOwnProperty.call(model.styles, "x");
                offsets.y = Object.prototype.hasOwnProperty.call(model.styles, "y");
                for (const property of Object.keys(model.styles)) applied.add(property);
                signature = panelAPI.syncStyles(panel, model.styles, signature).sig;
                panelAPI.setClass(panel, "qol-hidden", !model.enabled);
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
                    release(panel);
                    panel = null;
                    model = null;
                    signature = null;
                    resolver.reset();
                }
            };
        },
        test() {
            try {
                const root = $.GetContextPanel();
                const panel = root ? root.FindChildTraverse("gold_and_ap_container") : null;
                if (!panel) return null;
                return { passed: true, name: "Souls panel exists", message: "", assertions: [{ passed: true, name: "gold_and_ap_container panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Souls panel check", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();
