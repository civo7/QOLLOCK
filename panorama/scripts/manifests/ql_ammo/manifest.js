// OWNS: Ammo digits/geometry/color, native magazine enable and container rotation.
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
            if (QOL.presentation.hasStateHiding("ammo", cfg)) return true;
            const isTrue = value => value === true || value === 1 || String(value) === "true";
            if (isTrue(cfg.ENABLE_AMMO_STATUS) || isTrue(cfg.ENABLE_HIDE_MAGAZINE) || isTrue(cfg.ENABLE_HIDE_AMMO_ALL)) return true;
            for (const key of ["AMMO_CURRENT_SCALE", "AMMO_TOTAL_SCALE", "AMMO_PANEL_SCALE", "AMMO_HUD_SCALE"]) {
                if (cfg[key] != null && Number(cfg[key]) !== 100) return true;
            }
            for (const key of ["AMMO_PANEL_X_OFFSET", "AMMO_PANEL_Y_OFFSET", "AMMO_CURRENT_X_OFFSET", "AMMO_CURRENT_Y_OFFSET",
                "AMMO_MAX_X_OFFSET", "AMMO_MAX_Y_OFFSET", "AMMO_CLIP_ANGLE", "AMMO_TEXT_COLOR", "AMMO_CURRENT_FONT_STYLE", "AMMO_TOTAL_FONT_STYLE"]) {
                if (cfg[key] != null && Number(cfg[key]) !== 0) return true;
            }
            return false;
        },
        settings: [
            ...QOL.presentation.stateSettings("ql_ammo"),
            { key: "ENABLE_AMMO_STATUS", type: "toggle" },
            { key: "ENABLE_HIDE_MAGAZINE", type: "toggle" },
            { key: "ENABLE_HIDE_AMMO_ALL", type: "toggle" },
            ...["AMMO_CURRENT_FONT_STYLE", "AMMO_TOTAL_FONT_STYLE"].map(key => ({ key, type: "dropdown", options: QOL.settings.get(key).options.map(([value]) => value) })),
            { key: "AMMO_PANEL_SCALE", type: "slider" },
            { key: "AMMO_HUD_SCALE", type: "slider" },
            { key: "AMMO_CURRENT_SCALE", type: "slider" },
            { key: "AMMO_TOTAL_SCALE", type: "slider" },
            { key: "AMMO_PANEL_X_OFFSET", type: "slider" },
            { key: "AMMO_PANEL_Y_OFFSET", type: "slider" },
            { key: "AMMO_CURRENT_X_OFFSET", type: "slider" },
            { key: "AMMO_CURRENT_Y_OFFSET", type: "slider" },
            { key: "AMMO_MAX_X_OFFSET", type: "slider" },
            { key: "AMMO_MAX_Y_OFFSET", type: "slider" },
            { key: "AMMO_CLIP_ANGLE", type: "slider" },
            { key: "AMMO_TEXT_COLOR", type: "palette" }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            const gunPath = [...QOL.presentation.paths.crosshair, "gun", "gun_data"];
            const geometry = panelAPI.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" }, releasePosition: true });
            // Native ammo_panel flows right: position is ignored for its digits.
            // Balanced margins move a label without displacing its siblings.
            // Neutralize the resolved font before releasing its code property.
            // The standard and Tokamak native layouts use different baselines.
            const textStyles = new Map([16, 18].map(fontSize => [fontSize,
                panelAPI.createNativeStyleOwner({ resetValues: { marginLeft: "0px", marginRight: "0px", marginTop: "0px", marginBottom: "0px", fontSize: fontSize + "px" } })]));
            const clipStyles = new Map([0, 90, 180].map(baseline => [baseline,
                panelAPI.createNativeStyleOwner({ resetValues: { transform: "rotateZ(" + baseline + "deg)" } })]));
            let panel = null;
            let model = null;
            let loop = null;
            let active = false;
            let nativeVisual = null;

            function setNativeVisual(enabled) {
                if (nativeVisual === enabled) return;
                if (enabled) $.DispatchEvent("CitadelConCommand", "citadel_crosshair_enable_clip_status 1");
                else $.DispatchEvent("CitadelConCommand", "citadel_crosshair_enable_clip_status 0");
                nativeVisual = enabled;
            }

            function readModel() {
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view());
                const number = key => QOL.settings.readNumber(key, cfg[key]);
                const current = QOL.settings.readNumber("AMMO_CURRENT_SCALE", cfg.AMMO_CURRENT_SCALE ?? cfg.AMMO_PANEL_SCALE);
                const total = QOL.settings.readNumber("AMMO_TOTAL_SCALE", cfg.AMMO_TOTAL_SCALE ?? cfg.AMMO_PANEL_SCALE);
                const color = panelAPI.resolvePaletteColor(cfg.AMMO_TEXT_COLOR);
                // Native citadel_base_styles.css numericOracle fallback chain.
                // Code ownership also reaches hero-specific gun stylesheets.
                const numericFont = "Gulim, VALVEOracle, Reaver, Noto Sans, sans-serif";
                const neutralFont = { fontFamily: null, fontWeight: null, textShadow: null, opacity: null };
                const currentStyles = { ...neutralFont, fontSize: null, width: null, color: color || null };
                const totalStyles = { ...neutralFont, fontSize: null, width: null, marginLeft: null, color: color || null };
                const currentFont = number("AMMO_CURRENT_FONT_STYLE"), totalFont = number("AMMO_TOTAL_FONT_STYLE");
                if (currentFont === 1) Object.assign(currentStyles, { fontFamily: numericFont, fontWeight: "bold", textShadow: "0px 0px 0px 5.0 #10130d" });
                if (currentFont === 2) Object.assign(currentStyles, { fontFamily: "Radiance", fontWeight: "bold" });
                if (totalFont === 1) Object.assign(totalStyles, { fontFamily: numericFont, textShadow: "0px 0px 0px 5.0 #10130d", color: color || "rgba(255, 255, 255, 0.1)" });
                if (totalFont === 2) Object.assign(totalStyles, { fontWeight: "bold", textShadow: "0px 0px 0px 2.0 #aaaaaa", color: color || "#10130d", opacity: "0.95" });
                if (totalFont === 3) Object.assign(totalStyles, { fontFamily: "Radiance", fontWeight: "bold", color: color || "rgba(255, 255, 255, 0.1)" });
                if (totalFont === 4) Object.assign(totalStyles, { fontFamily: "Radiance", fontWeight: "bold", textShadow: "0px 0px 0px 2.0 #aaaaaa", color: color || "#10130d", opacity: "0.95" });
                const infiniteStyles = { color: color || null };
                if (current !== 100) {
                    currentStyles.fontSize = Math.max(8, Math.round(16 * current / 100)) + "px";
                    currentStyles.width = Math.max(16, Math.round(32 * current / 100)) + "px";
                }
                if (total !== 100) {
                    totalStyles.fontSize = Math.max(8, Math.round(16 * total / 100)) + "px";
                    totalStyles.width = Math.max(25, Math.round(50 * total / 100)) + "px";
                    totalStyles.marginLeft = Math.max(0, Math.round(2 * total / 100)) + "px";
                }
                const groupScale = number("AMMO_HUD_SCALE");
                const xOffset = number("AMMO_PANEL_X_OFFSET");
                const yOffset = number("AMMO_PANEL_Y_OFFSET");
                const textPosition = prefix => {
                    const x = number(prefix + "X_OFFSET");
                    const y = number(prefix + "Y_OFFSET");
                    return { x, y };
                };
                const roles = [["weapon_ammo", currentStyles, textPosition("AMMO_CURRENT_"), current],
                    ["weapon_ammo_max", totalStyles, textPosition("AMMO_MAX_"), total], ["weapon_ammo_infinite", infiniteStyles, {}, 100]];
                const textPlans = new Map([16, 18].map(fontSize => [fontSize, roles.map(([className, plan, position, scale]) => {
                    const styles = { ...plan };
                    if (fontSize === 18) {
                        if (scale !== 100) styles.fontSize = Math.max(8, Math.round(fontSize * scale / 100)) + "px";
                        // Tokamak's digits have native content widths and no gap.
                        delete styles.width;
                        delete styles.marginLeft;
                    }
                    if (position.x) {
                        const gap = Number.parseFloat(styles.marginLeft ?? (className === "weapon_ammo_max" && fontSize === 16 ? 2 : 0));
                        styles.marginLeft = gap + position.x + "px";
                        styles.marginRight = -position.x + "px";
                    }
                    if (position.y) {
                        styles.marginTop = -position.y + "px";
                        styles.marginBottom = position.y + "px";
                    }
                    return { className, styles };
                })]));
                return { visualEnabled: Number(cfg.ENABLE_AMMO_STATUS) === 1, angle: number("AMMO_CLIP_ANGLE"), textPlans,
                    clipStyles: {
                        ...(groupScale !== 100 ? { uiScale: groupScale + "%" } : {}),
                        ...(xOffset ? { x: xOffset + "px" } : {}),
                        ...(yOffset ? { y: -yOffset + "px" } : {})
                    },
                    panelStyles: {
                        ...(xOffset ? { marginLeft: xOffset + "px", marginRight: -xOffset + "px" } : {}),
                        ...(yOffset ? { marginTop: -yOffset + "px", marginBottom: yOffset + "px" } : {}),
                        ...(groupScale !== 100 ? { uiScale: groupScale + "%" } : {})
                    }
                };
            }

            function releaseMain() {
                for (const owner of textStyles.values()) owner.clear();
                if (panelAPI.isAlive(panel)) panelAPI.setClass(panel, "qol-hidden", false);
            }

            function discoverTexts() {
                const sources = new Map();
                const fontSize = panelAPI.findChild(panel.GetParent(), "clip_status_mirrored") ? 18 : 16;
                for (const { className, styles } of model.textPlans.get(fontSize)) {
                    for (const target of QOL.utils.FindPanelsByClass(panel, className)) {
                        // Keep native multi-class precedence: a later role may
                        // replace shared properties, without dropping earlier ones.
                        sources.set(target, { styles: Object.assign({}, sources.get(target)?.styles, styles), fontSize });
                    }
                }
                return sources;
            }

            function renderTexts(sources) {
                const retained = new Map([...textStyles.keys()].map(fontSize => [fontSize, []]));
                for (const [target, { fontSize }] of sources) retained.get(fontSize).push(target);
                // Retire the previous layout before the new owner claims the
                // same native composite font/margin properties.
                for (const [fontSize, owner] of textStyles) owner.retain(retained.get(fontSize));
                for (const [target, { styles: plan, fontSize }] of sources) {
                    const styles = Object.fromEntries(Object.entries(plan).filter(([, value]) => value !== null));
                    textStyles.get(fontSize).apply(target, styles);
                }
            }

            function discoverClips(owner) {
                const sources = new Map();
                // Native XML and Debugger place both rings directly in gun_data,
                // including layouts without digits. Missing sources retry here.
                const clip = panelAPI.findChild(owner, "clip_status");
                if (!clip) return sources;
                const mirrored = panelAPI.findChild(owner, "clip_status_mirrored");
                if (mirrored) {
                    // Tokamak's centered heat halves start at 90 and 180 degrees.
                    sources.set(clip, { angle: 90 - model.angle, baseline: 90 });
                    sources.set(mirrored, { angle: 180 - model.angle, baseline: 180 });
                } else {
                    // C++ centers the live arc using the native crosshair offset;
                    // CSS's static 0..90 clip is not its live orientation.
                    sources.set(clip, { angle: -model.angle, baseline: 0 });
                }
                return sources;
            }

            function renderClips(sources, root) {
                const retained = new Map([...clipStyles.keys()].map(baseline => [baseline, []]));
                for (const [target, source] of sources) {
                    geometry.apply(target, QOL.presentation.visibilityStyles("ammo", QOL.presentation.visibilityConfig(ctx), root, model.clipStyles));
                    clipStyles.get(source.baseline).apply(target,
                        source.angle !== source.baseline ? { transform: "rotateZ(" + source.angle + "deg)" } : {},
                        { "qol-ammo-visual-enabled": model.visualEnabled, "qol-ammo-visual-disabled": !model.visualEnabled });
                    retained.get(source.baseline).push(target);
                }
                for (const [baseline, owner] of clipStyles) owner.retain(retained.get(baseline));
            }

            function update() {
                if (!active) return;
                const candidate = panelAPI.findHud($.GetContextPanel());
                const root = panelAPI.isAlive(candidate) && (candidate.id === "Hud" || candidate.paneltype === "CitadelHud") ? candidate : null;
                const gun = QOL.presentation.findPath(root, gunPath);
                const current = panelAPI.findChild(gun, "ammo_panel");
                if (current !== panel) {
                    releaseMain();
                    panel = current;
                }
                const clipSources = discoverClips(gun);
                renderClips(clipSources, root);
                const textSources = panel ? discoverTexts() : new Map();
                renderTexts(textSources);
                geometry.retain([panel, ...clipSources.keys()]);
                if (!panel) return;
                panelAPI.setClass(panel, "qol-hidden", false);
                geometry.apply(panel, QOL.presentation.visibilityStyles("ammo", QOL.presentation.visibilityConfig(ctx), root, model.panelStyles));
            }

            function refreshSettings() {
                if (!active) return;
                model = readModel();
                setNativeVisual(model.visualEnabled);
                update();
                QOL.core.hud.refreshRootClasses(panelAPI.findHud($.GetContextPanel()));
            }

            return QOL.presentation.bindVisibility(ctx, {
                onEnable() {
                    active = true;
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    releaseMain();
                    for (const owner of clipStyles.values()) owner.clear();
                    geometry.clear();
                    panel = model = null;
                    if (nativeVisual !== null) setNativeVisual(false);
                    nativeVisual = null;
                }
            }, update);
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
