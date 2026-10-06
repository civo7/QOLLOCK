// Overall ui-scale for surfaces whose content is owned by other features.
// Multiply verified CSS baselines; release overrides at the default.
(() => {
    "use strict";
    const Q = QOL;
    const P = Q.core.panel;
    const owners = ["souls", "items", "stamina", "playerStats", "speed", "ammo", "abilityPoints", "damageReport"];
    const elements = owners.map(id => Q.presentation.elements.find(element => element.id === id));
    const clear = panel => {
        if (!P.isAlive(panel)) return;
        QOL_UTILS.ClearStyleSafe(panel, "uiScale");
        QOL_UTILS.ClearStyleSafe(panel, "preTransformScale2d");
    };
    function basePercent(element, root) {
        const has = name => !!root?.BHasClass(name);
        // base/hud.css and features/ql_feat_aspect_ratio.css own inventory scale.
        if (element.id === "items") return has("support_16_10_active") ? 90 : 120;
        // features/ql_feat_healthbar.css reduces the native AP group in FG mode.
        if (element.id === "abilityPoints" && has("fg_healthbar_active") && !has("minimalist_healthbar_active")) return 70;
        if (element.id === "damageReport" && has("disable_damage_report_active")) return 0;
        return 100;
    }
    Q.core.FeatureRegistry.register({
        id: "ql_presentation_scale",
        enabledByDefault: true,
        settings: elements.map(element => ({ key: element.scaleKey, type: "slider", min: 50, max: 200, step: 1, default: 100 })),
        create(ctx) {
            const applied = new Map();
            let loop = null;
            function update() {
                const cfg = ctx.config.view();
                const root = $.GetContextPanel();
                const styleRoot = P.findHud(root) || root;
                for (const element of elements) {
                    const previous = applied.get(element.id);
                    const percent = Number(cfg[element.scaleKey]);
                    const value = Number.isFinite(percent) ? Math.max(50, Math.min(200, percent)) / 100 : 1;
                    if (value === 1 && !previous) continue;
                    const owner = Q.presentation.resolve(element, root, cfg);
                    const panel = Q.presentation.scaleTarget(element, owner);
                    if (previous && previous.panel !== panel) { clear(previous.panel); applied.delete(element.id); }
                    if (!P.isAlive(panel)) continue;
                    if (value === 1) {
                        if (applied.has(element.id)) { clear(panel); applied.delete(element.id); }
                    } else {
                        const text = Number((basePercent(element, styleRoot) * value).toFixed(2)) + "%";
                        if (!previous || previous.panel !== panel || previous.text !== text) {
                            QOL_UTILS.ClearStyleSafe(panel, "preTransformScale2d");
                            panel.style.uiScale = text;
                            applied.set(element.id, { panel, text });
                        }
                    }
                }
            }
            return {
                onEnable() {
                    update();
                    loop = Q.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
                },
                onSettingsChanged: update,
                onDisable() {
                    if (loop) loop.stop();
                    loop = null;
                    for (const { panel } of applied.values()) clear(panel);
                    applied.clear();
                }
            };
        }
    });
})();
