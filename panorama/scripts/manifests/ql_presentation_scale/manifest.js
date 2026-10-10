// Overall ui-scale and added opacity controls; content keeps its existing owner.
// Multiply verified scale baselines; release overrides at their default.
(() => {
    "use strict";
    const Q = QOL;
    const P = Q.core.panel;
    const scaled = new Set(["souls", "items", "stamina", "playerStats", "speed", "abilityPoints", "damageReport"]);
    const opacityOwners = ["activeItems", "abilityPoints", "ammo", "stamina", "playerStats", "compass", "speed", "zipBoost",
        "statBonuses", "combatStatus", "unsecuredTimer", "unsecuredSouls", "keyboard", "damageReport", "chat"];
    const elements = [...new Set([...scaled, ...opacityOwners])].map(id => Q.presentation.elements.find(element => element.id === id));
    const opacityKeys = new Map(opacityOwners.map(id => [id,
        elements.find(element => element.id === id).fields.find(field => field.label === "Opacity").key]));
    const positions = new Set(["abilityPoints", "stamina"]);
    const clear = (panel, record) => {
        if (!P.isAlive(panel)) return;
        for (const property of Object.keys(record.styles)) {
            if (property === "x" || property === "y") panel.style[property] = "0px";
            QOL_UTILS.ClearStyleSafe(panel, property);
        }
        if ("x" in record.styles || "y" in record.styles) QOL_UTILS.ClearStyleSafe(panel, "position");
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
        settings: elements.flatMap(element => [
            ...(scaled.has(element.id) ? [{ key: element.scaleKey, type: "slider" }] : []),
            ...(opacityKeys.has(element.id) ? [{ key: opacityKeys.get(element.id), type: "slider" }] : []),
            ...(positions.has(element.id) ? element.fields.filter(field => field.axis).map(field => ({
                key: field.key, type: "slider"
            })) : [])
        ]),
        create(ctx) {
            const applied = new Map();
            const opacityStyles = P.createNativeStyleOwner();
            let loop = null;
            function update() {
                const cfg = ctx.config.view();
                const root = $.GetContextPanel();
                const styleRoot = P.findHud(root) || root;
                const opacityPanels = [];
                for (const element of elements) {
                    const previous = applied.get(element.id);
                    const percent = scaled.has(element.id) ? Number(cfg[element.scaleKey]) : 100;
                    const value = Number.isFinite(percent) ? Math.max(50, Math.min(200, percent)) / 100 : 1;
                    const alpha = opacityKeys.has(element.id)
                        ? QOL_UTILS.ClampConfigNumber(cfg[opacityKeys.get(element.id)], 1, 0, 1) : 1;
                    // Default geometry owns no native override. Discovery (in
                    // particular dash class traversal) is unnecessary until an
                    // actual scale/offset needs applying or retiring.
                    const moved = positions.has(element.id) && element.fields.some(field => field.axis && Number(cfg[field.key]));
                    if (value === 1 && !moved && !previous && alpha === 1) continue;
                    const owner = Q.presentation.resolve(element, root, cfg);
                    const panel = Q.presentation.scaleTarget(element, owner);
                    if (alpha !== 1) {
                        // Stats visibility is owned on the outer wrapper. Apply
                        // custom opacity only to the compact block, never over
                        // the wrapper's conditional opacity=0.
                        const targets = element.id === "playerStats" ? [P.findChild(owner, "HudStatBlock")]
                            : element.id === "ammo" && P.isAlive(owner) ? element.measurePanels(owner) : [panel];
                        for (const target of targets.filter(P.isAlive)) {
                            opacityStyles.apply(target, { opacity: alpha.toFixed(2) });
                            opacityPanels.push(target);
                        }
                    }
                    if (previous && previous.panel !== panel) { clear(previous.panel, previous); applied.delete(element.id); }
                    if (!P.isAlive(panel)) continue;
                    const styles = {};
                    if (value !== 1) styles.uiScale = Number((basePercent(element, styleRoot) * value).toFixed(2)) + "%";
                    if (positions.has(element.id)) for (const field of element.fields.filter(field => field.axis)) {
                        const offset = Math.round(Math.max(-2000, Math.min(2000, Number(cfg[field.key]) || 0)));
                        if (offset) styles[field.axis] = offset * (field.direction || 1) + "px";
                    }
                    const record = applied.get(element.id);
                    if (record) for (const property of Object.keys(record.styles)) {
                        if (property in styles) continue;
                        if (property === "x" || property === "y") panel.style[property] = "0px";
                        QOL_UTILS.ClearStyleSafe(panel, property);
                        if (property === "x" || property === "y") QOL_UTILS.ClearStyleSafe(panel, "position");
                    }
                    if (!Object.keys(styles).length) { applied.delete(element.id); continue; }
                    if (!record || JSON.stringify(record.styles) !== JSON.stringify(styles)) {
                        Object.assign(panel.style, styles);
                        applied.set(element.id, { panel, styles });
                    }
                }
                // Default opacity retires previous code writes without a new
                // native lookup; rejected clears keep the helper's cleanup retry.
                opacityStyles.retain(opacityPanels);
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
                    for (const record of applied.values()) clear(record.panel, record);
                    applied.clear();
                    opacityStyles.clear();
                }
            };
        }
    });
})();
