// OWNS: Native damage-report offsets and their replacement/disable cleanup.
// DOES NOT OWN: Report gameplay data, visibility CSS or independent overall scale.
// Visibility is projected by core.hud from the complete flat configuration;
// ql_presentation_scale owns uiScale. Native source: Hud > .HudCore > CitadelHudDamageReport.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_damage_report",
        // Offsets also apply while DISABLE_DAMAGE_REPORT is false.
        enabledByDefault: true,
        settings: [
            { key: "DISABLE_DAMAGE_REPORT", type: "toggle" },
            { key: "DAMAGE_REPORT_X_OFFSET", type: "slider", label: "Horizontal Offset" },
            { key: "DAMAGE_REPORT_Y_OFFSET", type: "slider", label: "Vertical Offset" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const resolver = QOL.panelCache.createIdResolver("CitadelHudDamageReport", {
                retryMs: 500, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            let panel = null, model = null, signature = null, loop = null;
            let owned = new Set();

            function readModel() {
                const cfg = ctx.config.view();
                const styles = {};
                const x = Math.round(Number(cfg.DAMAGE_REPORT_X_OFFSET)) || 0;
                const y = Math.round(Number(cfg.DAMAGE_REPORT_Y_OFFSET)) || 0;
                if (x !== 0) styles.x = x + "px";
                if (y !== 0) styles.y = -y + "px";
                return styles;
            }

            function clearOwned(property) {
                QOL.utils.SetStyleSafe(panel, property, "0px");
                P.clearStyleProperty(panel, property);
            }

            function release() {
                if (P.isAlive(panel)) {
                    for (const property of owned) clearOwned(property);
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
                    if (!(property in model)) {
                        clearOwned(property);
                        owned.delete(property);
                        signature = null;
                    }
                }
                signature = P.syncStyles(panel, model, signature).sig;
                owned = new Set(Object.keys(model));
            }

            function refreshSettings() {
                model = readModel();
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
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
                const hud = QOL.core.panel.findHud();
                if (!hud) return null;
                return { passed: true, name: "Damage report Hud panel exists", message: "",
                    assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Damage report panel check", message: e.message || String(e) };
            }
        }
    });
})();
