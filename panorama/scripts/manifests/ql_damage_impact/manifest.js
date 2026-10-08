// OWNS: Directional damage indicator offsets, overall scale, opacity and visibility.
// DOES NOT OWN: Damage events, native animation transforms or damage-number children.
// Source: Hud > .HudCore > damage_impact; hud_damage_impact.css uses ui-scale: 80%.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_damage_impact",
        // Hidden indicators still need replacement discovery.
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_DAMAGE_IMPACT", type: "toggle", default: true },
            { key: "DAMAGE_IMPACT_SCALE", type: "slider", min: 0.5, max: 2, step: 0.05, default: 1 },
            { key: "DAMAGE_IMPACT_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "DAMAGE_IMPACT_X_OFFSET", type: "slider", min: -1000, max: 1000, step: 1, default: 0 },
            { key: "DAMAGE_IMPACT_Y_OFFSET", type: "slider", min: -1000, max: 1000, step: 1, default: 0 }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const resolver = QOL.panelCache.createIdResolver("damage_impact", {
                retryMs: 500, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            let panel = null, model = null, signature = null, loop = null;
            let owned = new Set();

            function readModel() {
                const cfg = ctx.config.view();
                const styles = {};
                const x = Math.round(Number(cfg.DAMAGE_IMPACT_X_OFFSET)) || 0;
                const y = Math.round(Number(cfg.DAMAGE_IMPACT_Y_OFFSET)) || 0;
                const scale = Number(cfg.DAMAGE_IMPACT_SCALE);
                const opacity = Number(cfg.DAMAGE_IMPACT_OPACITY);
                if (x !== 0) styles.x = x + "px";
                if (y !== 0) styles.y = -y + "px";
                if (Number.isFinite(scale) && scale !== 1) styles.uiScale = Math.round(scale * 80) + "%";
                if (Number.isFinite(opacity) && opacity !== 1) styles.opacity = opacity.toFixed(2);
                const hidden = Number(cfg.ENABLE_DAMAGE_IMPACT) !== 1;
                if (hidden) styles.visibility = "collapse";
                return { hidden, styles };
            }

            function clearOwned(property) {
                if (property === "x" || property === "y") QOL.utils.SetStyleSafe(panel, property, "0px");
                P.clearStyleProperty(panel, property);
            }

            function release() {
                if (P.isAlive(panel)) {
                    for (const property of owned) clearOwned(property);
                    P.setClass(panel, "qol-hidden", false);
                }
                owned.clear();
                signature = null;
            }

            function update(force = false) {
                const current = resolver.resolve($.GetContextPanel(), force);
                if (current !== panel) {
                    release();
                    panel = current;
                }
                if (!P.isAlive(panel) || !model) return;
                for (const property of owned) {
                    if (!(property in model.styles)) {
                        clearOwned(property);
                        owned.delete(property);
                        signature = null;
                    }
                }
                signature = P.syncStyles(panel, model.styles, signature).sig;
                owned = new Set(Object.keys(model.styles));
                P.setClass(panel, "qol-hidden", model.hidden);
            }

            function refreshSettings() {
                model = readModel();
                update(true);
            }

            return {
                onEnable() {
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    release();
                    panel = null;
                    model = null;
                    resolver.reset();
                }
            };
        },
        test() {
            try {
                const panel = QOL.core.panel.findTraverse($.GetContextPanel(), "damage_impact");
                if (!panel) return null;
                return { passed: true, name: "Damage impact panel exists", message: "",
                    assertions: [{ passed: true, name: "damage_impact panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Damage impact panel check", message: e.message || String(e) };
            }
        }
    });
})();
