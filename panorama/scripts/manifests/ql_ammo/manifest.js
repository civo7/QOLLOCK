// OWNS: Ammo digits/geometry/color and magazine container rotation.
// Native ring/bullet transforms are engine-owned and must remain intact.
// DOES NOT OWN: Reload cooldown, crosshair stats or native weapon/ammo state.
// Sources: hud.xml, element_gun.xml, element_tokamak_custom_semi_circles.xml/css and debugger gun ancestry.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_ammo",
        enabledByDefault: false,
        enableKeys: ["ENABLE_AMMO_STATUS", "ENABLE_HIDE_MAGAZINE", "ENABLE_HIDE_AMMO_ALL"],
        isEnabled(cfg) {
            if (!cfg) return false;
            const isTrue = value => value === true || value === 1 || String(value) === "true";
            if (isTrue(cfg.ENABLE_AMMO_STATUS) || isTrue(cfg.ENABLE_HIDE_MAGAZINE) || isTrue(cfg.ENABLE_HIDE_AMMO_ALL)) return true;
            for (const key of ["AMMO_CURRENT_SCALE", "AMMO_TOTAL_SCALE", "AMMO_PANEL_SCALE"]) {
                if (cfg[key] != null && Number(cfg[key]) !== 100) return true;
            }
            for (const key of ["AMMO_PANEL_X_OFFSET", "AMMO_PANEL_Y_OFFSET", "AMMO_CLIP_ANGLE", "AMMO_TEXT_COLOR"]) {
                if (cfg[key] != null && Number(cfg[key]) !== 0) return true;
            }
            return false;
        },
        settings: [
            { key: "ENABLE_AMMO_STATUS", type: "toggle", default: false },
            { key: "ENABLE_HIDE_MAGAZINE", type: "toggle", default: false },
            { key: "ENABLE_HIDE_AMMO_ALL", type: "toggle", default: false },
            { key: "AMMO_PANEL_SCALE", type: "slider", min: 100, max: 300, step: 1, default: 100 },
            { key: "AMMO_CURRENT_SCALE", type: "slider", min: 100, max: 300, step: 1, default: 100 },
            { key: "AMMO_TOTAL_SCALE", type: "slider", min: 100, max: 300, step: 1, default: 100 },
            { key: "AMMO_PANEL_X_OFFSET", type: "slider", min: -2000, max: 2000, step: 5, default: 0 },
            { key: "AMMO_PANEL_Y_OFFSET", type: "slider", min: -2000, max: 2000, step: 5, default: 0 },
            { key: "AMMO_CLIP_ANGLE", type: "slider", min: 0, max: 360, step: 1, default: 0 },
            { key: "AMMO_TEXT_COLOR", type: "palette", default: 0 }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            const gunPath = [{ id: "Hud", optional: true }, { className: "HudCore" },
                "gameplay_hud", "gameplay_hud_alive", "crosshair", "gun", "gun_data"];
            const ammoResolver = QOL.panelCache.createIdResolver("ammo_panel", { retryMs: 500, ownerPath: gunPath });
            const clipResolver = QOL.panelCache.createIdResolver("clip_status", { retryMs: 500, ownerPath: gunPath });
            const texts = new Map();
            const clips = new Map();
            let panel = null;
            let signature = null;
            let model = null;
            let loop = null;
            const pips = { owner: null, children: [], maximum: 0, current: -1, color: "" };
            const maxCustomPips = 40;
            // rate-exempt: 10Hz follows shot-by-shot native ammo labels for custom pips.
            const visualInterval = 0.1;
            const idleInterval = 0.5;

            function releasePips() {
                panelAPI.setClass(pips.owner, "qol-ammo-pips-populated", false);
                for (const pip of pips.children) panelAPI.delete(pip);
                pips.owner = null;
                pips.children = [];
                pips.maximum = 0;
                pips.current = -1;
                pips.color = "";
            }

            function readAmmo(className) {
                for (const label of QOL.utils.FindPanelsByClass(panel, className)) {
                    const match = String(label.text ?? "").match(/\d+/);
                    if (match) return Number(match[0]);
                }
                return NaN;
            }

            function renderPips(sources) {
                const clip = sources.size === 1 ? sources.keys().next().value : null;
                const maximum = Math.round(readAmmo("weapon_ammo_max"));
                const current = Math.round(readAmmo("weapon_ammo"));
                if (!model.visualEnabled || !clip || !panel || !Number.isFinite(current) ||
                    !Number.isFinite(maximum) || maximum < 1 || maximum > maxCustomPips) {
                    releasePips();
                    return;
                }
                if (clip !== pips.owner || maximum !== pips.maximum || pips.children.some(pip => !panelAPI.isAlive(pip))) {
                    releasePips();
                    pips.owner = clip;
                    pips.maximum = maximum;
                    const segment = 90 / maximum;
                    const gap = Math.min(1.2, segment * 0.18);
                    for (let index = 0; index < maximum; index++) {
                        const pip = panelAPI.create("Panel", clip, "QOLAmmoPip_" + index);
                        if (!pip) { releasePips(); return; }
                        panelAPI.setClass(pip, "qol-ammo-pip", true);
                        pip.style.clip = "radial( 50% 50%, " + (index * segment + gap / 2) + "deg, " + (segment - gap) + "deg )";
                        pips.children.push(pip);
                    }
                    panelAPI.setClass(clip, "qol-ammo-pips-populated", true);
                }
                const count = Math.max(0, Math.min(maximum, current));
                const color = model.currentStyles.color || "";
                if (pips.current === count && pips.color === color) return;
                pips.current = count;
                pips.color = color;
                pips.children.forEach((pip, index) => {
                    const live = index < count;
                    panelAPI.setClass(pip, "qol-ammo-pip-live", live);
                    panelAPI.setClass(pip, "qol-ammo-pip-empty", !live);
                    if (live && color) QOL.utils.SetStyleIfChanged(pip, "borderColor", color);
                    else QOL.utils.ClearStyleSafe(pip, "borderColor");
                });
            }

            function readModel() {
                const cfg = ctx.config.view();
                const clamp = (value, min, max) => QOL.utils.ClampConfigNumber(value, min, min, max, true);
                const current = clamp(cfg.AMMO_CURRENT_SCALE != null ? cfg.AMMO_CURRENT_SCALE : cfg.AMMO_PANEL_SCALE, 100, 300);
                const total = clamp(cfg.AMMO_TOTAL_SCALE != null ? cfg.AMMO_TOTAL_SCALE : cfg.AMMO_PANEL_SCALE, 100, 300);
                const color = panelAPI.resolvePaletteColor(cfg.AMMO_TEXT_COLOR);
                const currentStyles = { fontSize: null, width: null, color: color || null };
                const totalStyles = { fontSize: null, width: null, marginLeft: null, color: color || null };
                const infiniteStyles = { color: color || null };
                if (current !== 100) {
                    currentStyles.fontSize = Math.max(12, Math.round(16 * current / 100)) + "px";
                    currentStyles.width = Math.max(24, Math.round(32 * current / 100)) + "px";
                }
                if (total !== 100) {
                    totalStyles.fontSize = Math.max(12, Math.round(16 * total / 100)) + "px";
                    totalStyles.width = Math.max(32, Math.round(50 * total / 100)) + "px";
                    totalStyles.marginLeft = Math.max(0, Math.round(2 * total / 100)) + "px";
                }
                return { visualEnabled: Number(cfg.ENABLE_AMMO_STATUS) === 1, angle: clamp(cfg.AMMO_CLIP_ANGLE, 0, 360), currentStyles, totalStyles, infiniteStyles,
                    styles: {
                        x: clamp(cfg.AMMO_PANEL_X_OFFSET, -2000, 2000) + "px",
                        y: (80 - clamp(cfg.AMMO_PANEL_Y_OFFSET, -2000, 2000)) + "px",
                        preTransformScale2d: "1.00, 1.00", opacity: "1.00"
                    }
                };
            }

            function releaseText(target, properties) {
                if (!panelAPI.isAlive(target)) return;
                for (const property of properties) QOL.utils.ClearStyleSafe(target, property);
            }

            function releaseMain() {
                for (const [target, state] of texts) releaseText(target, state.properties);
                texts.clear();
                if (!panelAPI.isAlive(panel)) return;
                // Preserve the established ammo baseline on release.
                panelAPI.syncStyles(panel, { x: "0px", y: "80px", preTransformScale2d: "1.00, 1.00" }, null);
                QOL.utils.ClearStyleSafe(panel, "opacity");
                panelAPI.setClass(panel, "qol-hidden", false);
            }

            function discoverTexts() {
                const sources = new Map();
                for (const [className, styles] of [["weapon_ammo", model.currentStyles],
                    ["weapon_ammo_max", model.totalStyles], ["weapon_ammo_infinite", model.infiniteStyles]]) {
                    for (const target of QOL.utils.FindPanelsByClass(panel, className)) {
                        // Keep native multi-class precedence: a later role may
                        // replace shared properties, without dropping earlier ones.
                        sources.set(target, Object.assign({}, sources.get(target), styles));
                    }
                }
                return sources;
            }

            function renderTexts(sources) {
                for (const [target, state] of texts) {
                    if (!sources.has(target)) { releaseText(target, state.properties); texts.delete(target); }
                }
                for (const [target, plan] of sources) {
                    const previous = texts.get(target);
                    const properties = Object.keys(plan);
                    const planSignature = properties.map(property => property + "=" + plan[property]).join(";");
                    if (previous && previous.signature === planSignature) continue;
                    if (previous) {
                        for (const property of previous.properties) {
                            if (!Object.prototype.hasOwnProperty.call(plan, property)) QOL.utils.ClearStyleSafe(target, property);
                        }
                    }
                    const styles = {};
                    for (const property of properties) {
                        if (plan[property] === null) {
                            if (previous?.properties.includes(property)) QOL.utils.ClearStyleSafe(target, property);
                        }
                        else styles[property] = plan[property];
                    }
                    const written = panelAPI.syncStyles(target, styles, null).sig;
                    texts.set(target, { properties: Object.keys(styles), signature: written === null ? null : planSignature });
                }
            }

            function discoverClips(root) {
                const sources = new Map();
                // The live ammo owner wins over duplicate IDs in retained templates.
                const owner = panelAPI.isAlive(panel) ? panel.GetParent() : null;
                const clip = panelAPI.findChild(owner, "clip_status") || panelAPI.findTraverse(owner, "clip_status") || clipResolver.resolve(root);
                if (!clip) return sources;
                let parent = null;
                try { parent = clip.GetParent(); } catch (_) { /* stale native owner */ }
                const mirrored = panelAPI.findChild(parent, "clip_status_mirrored") || panelAPI.findTraverse(parent, "clip_status_mirrored");
                if (mirrored) {
                    // Tokamak's centered heat halves start at 90 and 180 degrees.
                    sources.set(clip, { angle: 90 - model.angle, baseline: 90 });
                    sources.set(mirrored, { angle: 180 - model.angle, baseline: 180 });
                } else {
                    sources.set(clip, { angle: -model.angle, baseline: 0 });
                }
                return sources;
            }

            function releaseClip(target, state) {
                if (!panelAPI.isAlive(target) || !state) return;
                if (state.transform) {
                    target.style.transform = "rotateZ(" + state.baseline + "deg)";
                    QOL.utils.ClearStyleSafe(target, "transform");
                }
                panelAPI.setClass(target, "qol-ammo-visual-enabled", false);
                panelAPI.setClass(target, "qol-ammo-visual-disabled", false);
            }

            function renderClips(sources) {
                for (const [target, state] of clips) {
                    if (!sources.has(target)) { releaseClip(target, state); clips.delete(target); }
                }
                for (const [target, source] of sources) {
                    const previous = clips.get(target);
                    panelAPI.setClass(target, "qol-ammo-visual-enabled", model.visualEnabled);
                    panelAPI.setClass(target, "qol-ammo-visual-disabled", !model.visualEnabled);
                    if (model.angle === 0) {
                        if (previous?.transform) {
                            target.style.transform = "rotateZ(" + previous.baseline + "deg)";
                            QOL.utils.ClearStyleSafe(target, "transform");
                        }
                        clips.set(target, { transform: null, baseline: source.baseline, signature: null });
                    } else {
                        const transform = "rotateZ(" + source.angle + "deg)";
                        const sig = previous && previous.transform === transform ? previous.signature : null;
                        clips.set(target, { transform, baseline: source.baseline,
                            signature: panelAPI.syncStyles(target, { transform }, sig).sig });
                    }
                }
            }

            function update() {
                const root = $.GetContextPanel();
                const current = ammoResolver.resolve(root);
                if (current !== panel) {
                    releaseMain();
                    panel = current;
                    signature = null;
                }
                const clipSources = discoverClips(root);
                renderClips(clipSources);
                renderPips(clipSources);
                if (!panel) return;
                panelAPI.setClass(panel, "qol-hidden", false);
                signature = panelAPI.syncStyles(panel, model.styles, signature).sig;
                renderTexts(discoverTexts());
                // Native ammo state may recolor retained labels between ticks.
                if (model.currentStyles.color) for (const target of texts.keys()) {
                    QOL.utils.SetStyleIfChanged(target, "color", model.currentStyles.color);
                }
            }

            function refreshSettings() {
                model = readModel();
                signature = null;
                ammoResolver.reset();
                clipResolver.reset();
                update();
                if (loop) loop.reschedule(model.visualEnabled ? visualInterval : idleInterval);
            }

            return {
                onEnable() {
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, model.visualEnabled ? visualInterval : idleInterval, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    releaseMain();
                    releasePips();
                    for (const [target, state] of clips) releaseClip(target, state);
                    clips.clear();
                    panel = model = null;
                    signature = null;
                    ammoResolver.reset();
                    clipResolver.reset();
                }
            };
        },
        test() {
            try {
                const root = $.GetContextPanel();
                const panel = QOL.core.panel.findTraverse(root, "ammo_panel") || QOL.core.panel.findTraverse(root, "clip_status");
                if (!panel) return null;
                return { passed: true, name: "Ammo panel exists", message: "", assertions: [{ passed: true, name: "ammo_panel or clip_status exists" }] };
            } catch (e) { return { passed: false, name: "Ammo panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
