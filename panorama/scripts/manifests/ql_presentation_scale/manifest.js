// Overall ui-scale and added opacity controls; content keeps its existing owner.
// Multiply verified scale baselines; release overrides at their default.
(() => {
    "use strict";
    const Q = QOL;
    const P = Q.core.panel;
    const scaled = new Set(["souls", "items", "stamina", "playerStats", "statsList", "speed", "abilityPoints", "damageReport", "quickbuy"]);
    const opacityOwners = ["activeItems", "abilityPoints", "ammo", "stamina", "playerStats", "statsList", "compass", "speed", "zipBoost",
        "combatStatus", "unsecuredTimer", "unsecuredSouls", "keyboard", "damageReport", "chat"];
    const positions = new Set(["abilityPoints", "stamina", "statsList", "quickbuy"]);
    const elements = [...new Set([...scaled, ...opacityOwners, ...positions])].map(id => Q.presentation.elements.find(element => element.id === id));
    const opacityKeys = new Map(opacityOwners.map(id => [id,
        elements.find(element => element.id === id).fields.find(field => Q.settings.get(field.key).role === "opacity").key]));
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
        settings: [...Q.presentation.stateSettings("ql_presentation_scale"), ...elements.flatMap(element => [
            ...(scaled.has(element.id) ? [{ key: element.scaleKey, type: "slider" }] : []),
            ...(opacityKeys.has(element.id) ? [{ key: opacityKeys.get(element.id), type: "slider" }] : []),
            ...(positions.has(element.id) ? element.fields.filter(field => field.axis).map(field => ({
                key: field.key, type: "slider"
            })) : [])
        ])],
        create(ctx) {
            const geometryStyles = P.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" }, releasePosition: true });
            const opacityStyles = P.createNativeStyleOwner();
            let loop = null;
            let active = false;
            function update() {
                if (!active) return;
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view());
                const candidate = P.findHud($.GetContextPanel());
                const hud = P.isAlive(candidate) && (candidate.id === "Hud" || candidate.paneltype === "CitadelHud") ? candidate : null;
                const opacityPanels = [];
                const geometryPanels = [];
                for (const element of elements) {
                    const value = scaled.has(element.id) ? QOL.settings.readNumber(element.scaleKey, cfg[element.scaleKey]) / 100 : 1;
                    const alpha = opacityKeys.has(element.id)
                        ? QOL_UTILS.NormalizeOpacityNumber(cfg[opacityKeys.get(element.id)] ?? 1, 1) : 1;
                    // Default geometry owns no native override. Discovery (in
                    // particular dash class traversal) is unnecessary until an
                    // actual scale/offset needs applying or retiring.
                    const moved = positions.has(element.id) && element.fields.some(field => field.axis && Number(cfg[field.key]));
                    const hidden = positions.has(element.id) && Q.presentation.shouldHide(element.id, cfg, hud);
                    // Native dash pips did not return after collapse even when
                    // computed visibility was visible again (2026-10-24 capture).
                    // Keep that dynamic tree in layout, as with native stats.
                    const opacityHidden = element.id === "stamina" && hidden;
                    if (!hud || (value === 1 && !moved && alpha === 1 && !hidden)) continue;
                    const owner = Q.presentation.resolve(element, hud, cfg);
                    const panel = Q.presentation.scaleTarget(element, owner);
                    if (alpha !== 1 || opacityHidden) {
                        // Stats visibility is owned on the outer wrapper. Apply
                        // custom opacity only to the compact block, never over
                        // the wrapper's conditional opacity=0.
                        const targets = element.id === "playerStats" ? [P.findChild(owner, "HudStatBlock")]
                            : element.id === "ammo" && P.isAlive(owner) ? element.measurePanels(owner) : [panel];
                        for (const target of targets.filter(P.isAlive)) {
                            opacityStyles.apply(target, { opacity: (opacityHidden ? 0 : alpha).toFixed(2) });
                            opacityPanels.push(target);
                        }
                    }
                    if (!P.isAlive(panel)) continue;
                    const styles = hidden && !opacityHidden ? { visibility: "collapse" } : {};
                    if (value !== 1) styles.uiScale = Number((basePercent(element, hud) * value).toFixed(2)) + "%";
                    if (positions.has(element.id)) for (const field of element.fields.filter(field => field.axis)) {
                        const offset = QOL.settings.readNumber(field.key, cfg[field.key]);
                        if (offset) styles[field.axis] = offset * (field.direction || 1) + "px";
                    }
                    if (Object.keys(styles).length) {
                        // Native active-player-stats XML keeps particle effects
                        // beside HudStatBlock; scale or hide them with it.
                        const targets = element.id === "playerStats" ? [panel, P.findChild(owner, "CoreStatFXLayer")]
                            : element.id === "quickbuy" ? element.measurePanels(owner) : [panel];
                        for (const target of targets.filter(P.isAlive)) {
                            let targetStyles = styles;
                            if (element.id === "playerStats" && target !== panel) {
                                // Native CSS owns a 300x500 FX viewport, with its
                                // bottom 60px above the block (30px in shop).
                                const blockBottom = hud.BHasClass("gShopOpen") ? 250 : 220;
                                // TODO: I couldn't figure out how to scale these effects properly with player stats so anything more than 135% will just have 0% opacity
                                targetStyles = value > 1.35 ? { opacity: "0" } : { ...styles, minWidth: "300px", minHeight: "500px",
                                    // HudStatBlock's unscaled outer left margin is 20px.
                                    marginLeft: Number((20 * (1 - value)).toFixed(2)) + "px",
                                    marginBottom: Number((blockBottom + (280 - blockBottom) * value).toFixed(2)) + "px" };
                            }
                            geometryStyles.apply(target, targetStyles);
                            geometryPanels.push(target);
                        }
                    }
                }
                // Default opacity retires previous code writes without a new
                // native lookup; rejected clears keep the helper's cleanup retry.
                opacityStyles.retain(opacityPanels);
                geometryStyles.retain(geometryPanels);
            }
            return Q.presentation.bindVisibility(ctx, {
                onEnable() {
                    active = true;
                    update();
                    loop = Q.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
                },
                onSettingsChanged: update,
                onDisable() {
                    active = false;
                    if (loop) loop.stop();
                    loop = null;
                    geometryStyles.clear();
                    opacityStyles.clear();
                }
            }, update);
        }
    });
})();
