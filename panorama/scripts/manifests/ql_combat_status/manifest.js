// OWNS: Combat status overlay layout, private phase history and owned labels.
// DOES NOT OWN: Native combat detection or the shared healthbar combat indicator.
// Detection is delegated to core.hud; disabling this overlay leaves indicator history intact.
(() => {
    "use strict";
    const RECOVERY_MS = 3000;
    QOL.core.FeatureRegistry.register({
        id: "ql_combat_status",
        enableKey: "ENABLE_COMBAT_STATUS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_COMBAT_STATUS", type: "toggle" },
            { key: "ENABLE_COMBAT_INDICATOR", type: "toggle" },
            { key: "COMBAT_STATUS_SCALE", type: "slider" },
            { key: "COMBAT_STATUS_X_OFFSET", type: "slider" },
            { key: "COMBAT_STATUS_Y_OFFSET", type: "slider" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const hud = QOL.core.hud;
            let loop = null, overlay = null, model = null, signature = null;
            let stateLabel = null, timerLabel = null;
            let lastCombatMs = null, combatStartMs = null, signalActive = false;

            function readModel() {
                const cfg = ctx.config.view();
                return { enabled: Number(cfg.ENABLE_COMBAT_STATUS) === 1, styles: {
                    uiScale: Math.round(Number(cfg.COMBAT_STATUS_SCALE) || 100) + "%",
                    marginLeft: (Math.round(Number(cfg.COMBAT_STATUS_X_OFFSET)) || 0) + "px",
                    marginBottom: (165 + (Math.round(Number(cfg.COMBAT_STATUS_Y_OFFSET)) || 0)) + "px",
                    visibility: "visible"
                } };
            }

            function release(resetTracking = true) {
                P.delete(overlay);
                overlay = null; stateLabel = null; timerLabel = null; signature = null;
                if (resetTracking) { lastCombatMs = null; combatStartMs = null; signalActive = false; }
            }

            function ensureOverlay(root) {
                const parent = hud.getGameplayHudPanel(root);
                if (!P.isAlive(parent)) return false;
                if (!P.isAlive(overlay) || overlay.GetParent() !== parent) {
                    release(false);
                    overlay = P.findChild(parent, "QOLCombatStatusOverlay") ||
                        P.create("Panel", parent, "QOLCombatStatusOverlay", { hittest: "false", hittestchildren: "false" });
                }
                if (!P.isAlive(overlay)) return false;
                stateLabel = P.findChild(overlay, "QOLCombatStatusState") || P.create("Label", overlay, "QOLCombatStatusState");
                timerLabel = P.findChild(overlay, "QOLCombatStatusTimer") || P.create("Label", overlay, "QOLCombatStatusTimer");
                return P.isAlive(stateLabel) && P.isAlive(timerLabel);
            }

            function update() {
                const root = $.GetContextPanel();
                if (!P.isAlive(root) || !model || !model.enabled || !hud.isCustomHudContextActive(root)) {
                    release();
                    return;
                }
                if (!ensureOverlay(root)) return;
                signature = P.syncStyles(overlay, model.styles, signature).sig;
                P.setClass(overlay, "qol-hidden", false);

                const now = QOL.utils.PerfNowMs();
                const combatSignal = hud.isCombatSignalActive(root, now) === true;
                if (combatSignal) {
                    if (!signalActive || combatStartMs === null) combatStartMs = now;
                    lastCombatMs = now;
                }
                signalActive = combatSignal;
                const recentCombatMs = lastCombatMs === null ? Infinity : now - lastCombatMs;
                const recovering = !combatSignal && lastCombatMs !== null && recentCombatMs <= RECOVERY_MS;
                if (!combatSignal && !recovering) combatStartMs = null;
                P.setClass(overlay, "phase_combat", combatSignal);
                P.setClass(overlay, "phase_recover", recovering);
                P.setClass(overlay, "phase_idle", !combatSignal && !recovering);

                const stateText = combatSignal ? "IN COMBAT" : recovering ? "RECOVERING" : "OUT OF COMBAT";
                const timerText = combatSignal ? (Math.max(0, now - combatStartMs) / 1000).toFixed(1) + "s" :
                    recovering ? (Math.max(0, RECOVERY_MS - recentCombatMs) / 1000).toFixed(1) + "s" : "--";
                if (stateLabel.text !== stateText) stateLabel.text = stateText;
                if (timerLabel.text !== timerText) timerLabel.text = timerText;
            }

            function refreshSettings() {
                model = readModel();
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update();
            }

            return {
                onEnable() {
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    release();
                    model = null;
                }
            };
        },
        test() {
            try {
                const gp = QOL.core.panel.findTraverse($.GetContextPanel(), "gameplay_hud");
                return { passed: !!gp, name: "Combat status anchor panel exists", message: gp ? "" : "gameplay_hud not found",
                    assertions: [{ passed: !!gp, name: "gameplay_hud panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Combat status panel check", message: e.message || String(e) };
            }
        }
    });
})();
