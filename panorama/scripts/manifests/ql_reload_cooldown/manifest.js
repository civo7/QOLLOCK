// OWNS: Estimated reload countdown and its QOL label in the native reticle.
// DOES NOT OWN: Native radial clip, reload classes, ammo or icon/circle CSS.
// Source IDs and bounded class ancestry are retained from the native owner.
(() => {
    "use strict";
    const FEATURE_ID = "ql_reload_cooldown";
    // rate-exempt: 20Hz follows native radial animation only during a reload.
    const ACTIVE_SECONDS = 0.05;
    const IDLE_SECONDS = 0.5;
    const LABEL_ID = "QOLReloadCooldownText";

    function findReticle(hud) {
        const P = QOL.core.panel;
        // element_gun.xml plus the native capture verify this complete owner path.
        let panel = P.findChildByClass(hud, "HudCore");
        for (const id of ["gameplay_hud", "gameplay_hud_alive", "crosshair", "gun", "gun_data", "reticle_status"]) panel = P.findChild(panel, id);
        return panel;
    }

    function readAngle(panel) {
        let clip = "";
        try { clip = String(panel.style.clip || ""); } catch (_) {}
        if (!clip) {
            const attribute = QOL.utils.SafeGetAttribute(panel, "style", "");
            clip = /clip\s*:\s*([^;]+)/i.exec(attribute)?.[1] || "";
        }
        // Native clips may have a center before the first angle.
        const match = /radial\s*\([^)]*?([+\-]?\d+(?:\.\d+)?)\s*deg/i.exec(clip) ||
            /,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*\)/i.exec(clip);
        const angle = match ? Number(match[1]) : NaN;
        return Number.isFinite(angle) ? angle : null;
    }

    function hasReloadClass(panel) {
        const P = QOL.core.panel;
        for (let depth = 0; depth < 16 && P.isAlive(panel); depth++) {
            if (panel.BHasClass("has_active_reload") || panel.BHasClass("attack_delayed") || panel.BHasClass("reloading")) return true;
            panel = panel.GetParent();
        }
        return false;
    }

    function createEstimate() {
        let lastAngle = null, lastTime = null, direction = 0, slope = null, displayLock = null;
        function reset() {
            lastAngle = null; lastTime = null; direction = 0; slope = null; displayLock = null;
        }
        function sample(angle, now) {
            if (lastAngle !== null && lastTime !== null) {
                const seconds = (now - lastTime) / 1000;
                const delta = lastAngle - angle;
                if (delta < -180 || delta > 360) {
                    slope = null; displayLock = null; direction = 0;
                } else if (seconds > 0.01 && seconds < 1 && Math.abs(delta) > 0.01) {
                    if (direction === 0 && Math.abs(delta) >= 0.05) direction = delta > 0 ? 1 : -1;
                    const progress = (direction >= 0 && delta > 0) || (direction <= 0 && delta < 0) ? Math.abs(delta) : 0;
                    const observedSlope = progress / seconds;
                    if (observedSlope > 0.001 && observedSlope < 5000) {
                        slope = slope === null ? observedSlope : slope * 0.75 + observedSlope * 0.25;
                    }
                }
            }
            lastAngle = angle; lastTime = now;
            if (slope === null || slope <= 0.001) return "";
            const remainingAngle = Math.max(0, direction < 0 ? 360 - angle : angle);
            let remaining = remainingAngle / slope;
            if (!Number.isFinite(remaining)) return "";
            if (displayLock !== null) remaining = Math.min(remaining, displayLock);
            displayLock = remaining >= 1 ? Math.ceil(remaining) : remaining;
            return remaining >= 1 ? String(displayLock) : (Math.round(remaining * 10) / 10).toFixed(1);
        }
        return { reset, sample };
    }

    QOL.core.FeatureRegistry.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_RELOAD_COOLDOWN",
        enabledByDefault: false,
        settings: [
            ...QOL.presentation.stateSettings("ql_reload_cooldown"),
            { key: "ENABLE_RELOAD_COOLDOWN", type: "toggle" },
            { key: "ENABLE_HIDE_RELOAD_ICON", type: "toggle", invert: true, label: "Icon", description: "The icon that replaces your crosshair when reloading." },
            { key: "ENABLE_HIDE_RELOAD_CIRCLE", type: "toggle", invert: true, label: "Circle", description: "The circle countdown for when you are reloading." },
            { key: "RELOAD_COOLDOWN_OPACITY", type: "slider" },
            { key: "RELOAD_COOLDOWN_SIZE", type: "slider" },
            { key: "RELOAD_COOLDOWN_X_OFFSET", type: "slider" },
            { key: "RELOAD_COOLDOWN_Y_OFFSET", type: "slider" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const estimate = createEstimate();
            const tree = P.createOwnedTree();
            let running = false, rootOwner = null;
            let reticle = null, progress = null, label = null, model = null, signature = null, loop = null;

            function readModel() {
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view());
                // ConfigStore owns persisted defaults, normalization and units.
                return {
                    enabled: Number(cfg.ENABLE_RELOAD_COOLDOWN) === 1,
                    styles: {
                        opacity: String(QOL.utils.NormalizeOpacityNumber(cfg.RELOAD_COOLDOWN_OPACITY, 0.6)),
                        fontSize: Math.round(Number(cfg.RELOAD_COOLDOWN_SIZE)) + "px",
                        x: Math.round(Number(cfg.RELOAD_COOLDOWN_X_OFFSET)) + "px",
                        y: -Math.round(Number(cfg.RELOAD_COOLDOWN_Y_OFFSET)) + "px"
                    }
                };
            }

            function renderText(text) {
                if (!P.isAlive(label)) return;
                if (label.text !== text) label.text = text;
                const visibility = text && !QOL.presentation.shouldHide("reload", QOL.presentation.visibilityConfig(ctx), rootOwner) ? "visible" : "collapse";
                if (label.style.visibility !== visibility) label.style.visibility = visibility;
            }

            function retireLabel() {
                tree.clear();
                label = null; signature = null;
            }

            function releaseSources() {
                retireLabel();
                estimate.reset();
                reticle = null; progress = null;
            }

            function ensureLabel() {
                const previous = label;
                label = tree.child(reticle, "Label", LABEL_ID);
                if (previous !== label) signature = null;
                if (!P.isAlive(label)) return false;
                if (previous !== label) label.style.visibility = "collapse";
                return true;
            }

            function update() {
                if (!running) return;
                const hud = P.findHud($.GetContextPanel());
                if (hud !== rootOwner) { releaseSources(); rootOwner = hud; }
                tree.sweep();
                if (!model?.enabled || !P.isAlive(hud) || (hud.id !== "Hud" && hud.paneltype !== "CitadelHud")) {
                    releaseSources();
                    loop?.reschedule(IDLE_SECONDS);
                    return;
                }
                const currentReticle = findReticle(hud);
                if (reticle !== currentReticle) {
                    retireLabel(); estimate.reset();
                    reticle = currentReticle; progress = null;
                }
                const currentProgress = P.findChild(reticle, "attack_delayed_progress_bar");
                if (progress !== currentProgress) {
                    estimate.reset(); renderText(""); progress = currentProgress;
                }
                const preview = QOL.presentation.preview.selected(hud, "reload");
                if (!P.isAlive(reticle) || (!P.isAlive(progress) && !preview)) {
                    P.setClass(label, "QOLCustomizeSample", false);
                    renderText(""); estimate.reset();
                    loop?.reschedule(IDLE_SECONDS);
                    return;
                }
                if (!ensureLabel()) { loop?.reschedule(IDLE_SECONDS); return; }
                signature = P.syncStyles(label, model.styles, signature).sig;
                const wasPreview = label.BHasClass("QOLCustomizeSample");
                P.setClass(label, "QOLCustomizeSample", preview);
                if (preview) {
                    renderText("2.5");
                    loop?.reschedule(IDLE_SECONDS);
                    return;
                }
                if (wasPreview) estimate.reset();
                const angle = readAngle(progress);
                const active = hasReloadClass(progress) || String(progress.style.visibility || "").toLowerCase() === "visible";
                if (!active || angle === null || angle <= 0.01) {
                    renderText(""); estimate.reset();
                    loop?.reschedule(IDLE_SECONDS);
                    return;
                }
                loop?.reschedule(ACTIVE_SECONDS);
                renderText(estimate.sample(angle, QOL.utils.PerfNowMs()));
            }

            function refreshSettings() {
                if (!running) return;
                model = readModel();
                update();
                QOL.core.hud.refreshRootClasses(P.findHud($.GetContextPanel()));
            }

            return QOL.presentation.bindVisibility(ctx, {
                onEnable() {
                    running = true;
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, ACTIVE_SECONDS, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    running = false;
                    if (loop) { loop.stop(); loop = null; }
                    releaseSources(); tree.dispose(); model = rootOwner = null;
                }
            }, update);
        },
        test(ctx) {
            const passed = ctx?.id === FEATURE_ID;
            return { passed, name: "ql_reload_cooldown manifest check", message: passed ? "" : "Invalid feature ID",
                assertions: [{ passed, name: "Feature ID matches" }] };
        }
    });
})();
