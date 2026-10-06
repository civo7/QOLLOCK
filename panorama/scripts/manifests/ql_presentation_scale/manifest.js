// Overall post-layout scale for surfaces whose content is owned by other
// features. Keep native layout, rotations and existing CSS ui-scale intact.
(() => {
    "use strict";
    const Q = QOL;
    const P = Q.core.panel;
    const owners = ["souls", "items", "stamina", "playerStats", "speed"];
    const elements = owners.map(id => Q.presentation.elements.find(element => element.id === id));
    const clear = panel => { if (P.isAlive(panel)) QOL_UTILS.ClearStyleSafe(panel, "preTransformScale2d"); };
    Q.core.FeatureRegistry.register({
        id: "ql_presentation_scale",
        enabledByDefault: true,
        settings: elements.map(element => ({ key: element.postScaleKey, type: "slider", min: 50, max: 200, step: 1, default: 100 })),
        create(ctx) {
            const applied = new Map();
            let loop = null;
            function update() {
                const cfg = ctx.config.view();
                const root = $.GetContextPanel();
                for (const element of elements) {
                    const previous = applied.get(element.id);
                    const percent = Number(cfg[element.postScaleKey]);
                    const value = Number.isFinite(percent) ? Math.max(50, Math.min(200, percent)) / 100 : 1;
                    if (value === 1 && !previous) continue;
                    const owner = Q.presentation.resolve(element, root, cfg);
                    const panel = Q.presentation.scaleTarget(element, owner);
                    if (previous && previous.panel !== panel) { clear(previous.panel); applied.delete(element.id); }
                    if (!P.isAlive(panel)) continue;
                    if (value === 1) {
                        if (applied.has(element.id)) { clear(panel); applied.delete(element.id); }
                    } else if (!previous || previous.panel !== panel || previous.value !== value) {
                        panel.style.preTransformScale2d = String(value);
                        applied.set(element.id, { panel, value });
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
