// ql_feat_combatstatus.js — Combat status HUD overlay (in-combat detection, indicator)
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _dk = "ql_feat_combatstatus";
    var _deps = QOL.import(["getCachedPanel","getGameplayHudPanel","getUIRoot","isCombatSignalActive","isCustomHudContextActive","perfEnd","perfStart","state","setCachedPanel","setPanelClassIfChanged","setWashColorSafe","utils"]);
    var GC = _deps.getCachedPanel;
    var GGHP = _deps.getGameplayHudPanel;
    var GUIR = _deps.getUIRoot;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var SWC = _deps.setWashColorSafe;
    var U = _deps.utils;
    // ── Feature constants ──
    var COMBAT_STATUS_RECOVERY_MS = 3000;
    var COMBAT_STATUS_ALERT_PROBE_MS = 500;
    var COMBAT_STATUS_PANEL_PROBE_IDLE_MAX_MS = 3000;
    var COMBAT_INDICATOR_DEBUG = false;
    var COMBAT_INDICATOR_DEBUG_THROTTLE_MS = 700;

    function CombatIndicatorDebugLog(msg) {
        if (!COMBAT_INDICATOR_DEBUG) return;
        $.Msg("[QOLLock][CombatIndicatorDbg] " + msg);
    }

    function CombatIndicatorDebugLogThrottled(sig, msg, nowMs) {
        if (!COMBAT_INDICATOR_DEBUG) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === S.combatIndicatorDebugLastSig;
        if (sameSig && now < (S.combatIndicatorDebugNextMs || 0)) return;
        S.combatIndicatorDebugLastSig = sig || "";
        S.combatIndicatorDebugNextMs = now + COMBAT_INDICATOR_DEBUG_THROTTLE_MS;
        CombatIndicatorDebugLog(msg);
    }

    function ResetCombatStatusProbeBackoff() {
        S.combatStatusAlertProbeMisses = 0;
    }

    function EnsureCombatStatusOverlay(root) {
        var overlay = GC("combatStatusOverlay");
        if (overlay) return overlay;

        overlay = root.FindChildTraverse ? root.FindChildTraverse("QOLCombatStatusOverlay") : null;
        if (!overlay) {
            var parent = GetGameplayHudPanel(root);
            if (!parent) return null;
            overlay = $.CreatePanel("Panel", parent, "QOLCombatStatusOverlay", {
                hittest: "false",
                hittestchildren: "false"
            });
            var stateLabel = $.CreatePanel("Label", overlay, "QOLCombatStatusState");
            stateLabel.text = "IN COMBAT";
            var timerLabel = $.CreatePanel("Label", overlay, "QOLCombatStatusTimer");
            timerLabel.text = "0.0s";
        }

        SC("combatStatusOverlay", overlay);
        SC("combatStatusState", overlay ? overlay.FindChildTraverse("QOLCombatStatusState") : null);
        SC("combatStatusTimer", overlay ? overlay.FindChildTraverse("QOLCombatStatusTimer") : null);
        return overlay;
    }

    function RemoveCombatStatusOverlay(root) {
        var overlay = GC("combatStatusOverlay");
        if (!overlay && root && root.FindChildTraverse) {
            overlay = root.FindChildTraverse("QOLCombatStatusOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SC("combatStatusOverlay", null);
        SC("combatStatusState", null);
        SC("combatStatusTimer", null);
        SC("combatStatusAlertPanel", null);
        S.combatStatus.displayMode = "";
        S.combatStatus.lastLayoutSig = "";
        S.combatStatus.lastClassSig = "";
        S.combatStatus.lastStateText = "";
        S.combatStatus.lastTimerText = "";
        S.combatStatus.lastCombatMs = 0;
        S.combatStatus.combatStartMs = 0;
        S.combatStatus.signalActive = false;
        S.combatStatus.nextAlertProbeMs = 0;
        ResetCombatStatusProbeBackoff();
    }

    function UpdateCombatStatusOverlay(root, cfg, hideoutOverride) {
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();

        if (!IsCustomHudContextActive(root)) {
            if (S.combatStatus.displayMode !== "context_off") {
                RemoveCombatStatusOverlay(root);
                S.combatStatus.displayMode = "context_off";
            }
            return;
        }

        if (Number(cfg.ENABLE_COMBAT_STATUS) !== 1) {
            if (S.combatStatus.displayMode !== "disabled") {
                RemoveCombatStatusOverlay(root);
                S.combatStatus.displayMode = "disabled";
            }
            return;
        }

        var overlay = EnsureCombatStatusOverlay(root);
        if (!overlay) return;
        if (S.combatStatus.displayMode !== "active" || overlay.style.visibility !== "visible") {
            overlay.style.visibility = "visible";
        }
        S.combatStatus.displayMode = "active";

        var scale = Math.round(Number(cfg.COMBAT_STATUS_SCALE));
        var offsetX = Math.round(Number(cfg.COMBAT_STATUS_X_OFFSET));
        var offsetY = Math.round(Number(cfg.COMBAT_STATUS_Y_OFFSET));
        if (!isFinite(scale)) scale = 100;
        if (!isFinite(offsetX)) offsetX = 0;
        if (!isFinite(offsetY)) offsetY = 0;
        if (scale < 50) scale = 50;
        if (scale > 200) scale = 200;
        if (offsetX < -1000) offsetX = -1000;
        if (offsetX > 1000) offsetX = 1000;
        if (offsetY < -1000) offsetY = -1000;
        if (offsetY > 1000) offsetY = 1000;

        var layoutSig = String(scale) + "|" + String(offsetX) + "|" + String(offsetY);
        if (layoutSig !== S.combatStatus.lastLayoutSig) {
            overlay.style.preTransformScale2d = (scale / 100).toFixed(2);
            overlay.style.marginLeft = String(offsetX) + "px";
            overlay.style.marginBottom = String(165 + offsetY) + "px";
            S.combatStatus.lastLayoutSig = layoutSig;
        }

        var combatSignal = IsCombatSignalActive(root, nowMs);
        if (combatSignal) {
            if (!S.combatStatus.signalActive || S.combatStatus.combatStartMs <= 0) {
                S.combatStatus.combatStartMs = nowMs;
            }
            S.combatStatus.lastCombatMs = nowMs;
        }
        S.combatStatus.signalActive = combatSignal;

        var recentCombatMs = nowMs - Number(S.combatStatus.lastCombatMs || 0);
        var recoveryActive = !combatSignal && S.combatStatus.lastCombatMs > 0 && recentCombatMs <= COMBAT_STATUS_RECOVERY_MS;
        var phase = combatSignal ? "combat" : (recoveryActive ? "recover" : "idle");
        if (phase === "idle") {
            S.combatStatus.combatStartMs = 0;
        }

        var classSig = phase;
        if (classSig !== S.combatStatus.lastClassSig) {
            overlay.SetHasClass("phase_combat", combatSignal);
            overlay.SetHasClass("phase_recover", recoveryActive);
            overlay.SetHasClass("phase_idle", !combatSignal && !recoveryActive);
            S.combatStatus.lastClassSig = classSig;
        }

        var stateText = "OUT OF COMBAT";
        var timerText = "--";
        if (combatSignal) {
            var combatStartMs = Number(S.combatStatus.combatStartMs || nowMs);
            if (!isFinite(combatStartMs) || combatStartMs <= 0) combatStartMs = nowMs;
            var combatSec = Math.max(0, (nowMs - combatStartMs) / 1000.0);
            stateText = "IN COMBAT";
            timerText = combatSec.toFixed(1) + "s";
        } else if (recoveryActive) {
            var recoverSec = Math.max(0, (COMBAT_STATUS_RECOVERY_MS - recentCombatMs) / 1000.0);
            stateText = "RECOVERING";
            timerText = recoverSec.toFixed(1) + "s";
        }

        var stateLabel = GC("combatStatusState");
        if (stateLabel && stateText !== S.combatStatus.lastStateText) {
            stateLabel.text = stateText;
            S.combatStatus.lastStateText = stateText;
        }
        var timerLabel = GC("combatStatusTimer");
        if (timerLabel && timerText !== S.combatStatus.lastTimerText) {
            timerLabel.text = timerText;
            S.combatStatus.lastTimerText = timerText;
        }
    }

    // ── Registration ──
    QOL.register("combatStatus", {
        configKeys: ["ENABLE_COMBAT_STATUS", "ENABLE_COMBAT_INDICATOR"],
        bucket: 7,
        phase: -1,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_COMBAT_STATUS") ||
                   IsCfgEnabled(cfg, "ENABLE_COMBAT_INDICATOR");
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateCombatStatusOverlay(root, cfg, hideoutConnected);
        },
        stateKeys: ["combatStatus", "combatStatusAlertProbeMisses",
                    "combatIndicatorDebugLastSig", "combatIndicatorDebugNextMs"]
    });

})();
