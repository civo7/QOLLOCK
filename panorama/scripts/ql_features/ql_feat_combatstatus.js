// ql_feat_combatstatus.js — Combat status HUD overlay (in-combat detection, indicator)
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _featureId = "ql_feat_combatstatus";
    var _deps = QOL.import(["getCachedPanel","getGameplayHudPanel","getUIRoot","isCombatSignalActive","isCustomHudContextActive","perfEnd","perfStart","state","setCachedPanel","setPanelClassIfChanged","setWashColorSafe","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var GGHP = _deps.getGameplayHudPanel;
    var GUIR = _deps.getUIRoot;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var SWC = _deps.setWashColorSafe;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var IsCustomHudContextActive = _deps.isCustomHudContextActive;
    var IsCombatSignalActive = _deps.isCombatSignalActive;
    var GetGameplayHudPanel = _deps.getGameplayHudPanel;
    var GetUIRoot = _deps.getUIRoot;
    var PerfStart = _deps.perfStart;
    var PerfEnd = _deps.perfEnd;
    var SetWashColorSafe = _deps.setWashColorSafe;
    var SetPanelClassIfChanged = _deps.setPanelClassIfChanged;
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
        var sameSig = sig && sig === State.combatIndicatorDebugLastSig;
        if (sameSig && now < (State.combatIndicatorDebugNextMs || 0)) return;
        State.combatIndicatorDebugLastSig = sig || "";
        State.combatIndicatorDebugNextMs = now + COMBAT_INDICATOR_DEBUG_THROTTLE_MS;
        CombatIndicatorDebugLog(msg);
    }

    function ResetCombatStatusProbeBackoff() {
        State.combatStatusAlertProbeMisses = 0;
    }

    function EnsureCombatStatusOverlay(root) {
        var overlay = GetCachedPanel("combatStatusOverlay");
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

        SetCachedPanel("combatStatusOverlay", overlay);
        SetCachedPanel("combatStatusState", overlay ? overlay.FindChildTraverse("QOLCombatStatusState") : null);
        SetCachedPanel("combatStatusTimer", overlay ? overlay.FindChildTraverse("QOLCombatStatusTimer") : null);
        return overlay;
    }

    function RemoveCombatStatusOverlay(root) {
        var overlay = GetCachedPanel("combatStatusOverlay");
        if (!overlay && root && root.FindChildTraverse) {
            overlay = root.FindChildTraverse("QOLCombatStatusOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SetCachedPanel("combatStatusOverlay", null);
        SetCachedPanel("combatStatusState", null);
        SetCachedPanel("combatStatusTimer", null);
        SetCachedPanel("combatStatusAlertPanel", null);
        State.combatStatus.displayMode = "";
        State.combatStatus.lastLayoutSig = "";
        State.combatStatus.lastClassSig = "";
        State.combatStatus.lastStateText = "";
        State.combatStatus.lastTimerText = "";
        State.combatStatus.lastCombatMs = 0;
        State.combatStatus.combatStartMs = 0;
        State.combatStatus.signalActive = false;
        State.combatStatus.nextAlertProbeMs = 0;
        ResetCombatStatusProbeBackoff();
    }

    function UpdateCombatStatusOverlay(root, cfg, hideoutOverride) {
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();

        if (!IsCustomHudContextActive(root)) {
            if (State.combatStatus.displayMode !== "context_off") {
                RemoveCombatStatusOverlay(root);
                State.combatStatus.displayMode = "context_off";
            }
            return;
        }

        if (Number(cfg.ENABLE_COMBAT_STATUS) !== 1) {
            if (State.combatStatus.displayMode !== "disabled") {
                RemoveCombatStatusOverlay(root);
                State.combatStatus.displayMode = "disabled";
            }
            return;
        }

        var overlay = EnsureCombatStatusOverlay(root);
        if (!overlay) return;
        if (State.combatStatus.displayMode !== "active" || overlay.style.visibility !== "visible") {
            overlay.style.visibility = "visible";
        }
        State.combatStatus.displayMode = "active";

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
        if (layoutSig !== State.combatStatus.lastLayoutSig) {
            overlay.style.preTransformScale2d = (scale / 100).toFixed(2);
            overlay.style.marginLeft = String(offsetX) + "px";
            overlay.style.marginBottom = String(165 + offsetY) + "px";
            State.combatStatus.lastLayoutSig = layoutSig;
        }

        var combatSignal = IsCombatSignalActive(root, nowMs);
        if (combatSignal) {
            if (!State.combatStatus.signalActive || State.combatStatus.combatStartMs <= 0) {
                State.combatStatus.combatStartMs = nowMs;
            }
            State.combatStatus.lastCombatMs = nowMs;
        }
        State.combatStatus.signalActive = combatSignal;

        var recentCombatMs = nowMs - Number(State.combatStatus.lastCombatMs || 0);
        var recoveryActive = !combatSignal && State.combatStatus.lastCombatMs > 0 && recentCombatMs <= COMBAT_STATUS_RECOVERY_MS;
        var phase = combatSignal ? "combat" : (recoveryActive ? "recover" : "idle");
        if (phase === "idle") {
            State.combatStatus.combatStartMs = 0;
        }

        var classSig = phase;
        if (classSig !== State.combatStatus.lastClassSig) {
            overlay.SetHasClass("phase_combat", combatSignal);
            overlay.SetHasClass("phase_recover", recoveryActive);
            overlay.SetHasClass("phase_idle", !combatSignal && !recoveryActive);
            State.combatStatus.lastClassSig = classSig;
        }

        var stateText = "OUT OF COMBAT";
        var timerText = "--";
        if (combatSignal) {
            var combatStartMs = Number(State.combatStatus.combatStartMs || nowMs);
            if (!isFinite(combatStartMs) || combatStartMs <= 0) combatStartMs = nowMs;
            var combatSec = Math.max(0, (nowMs - combatStartMs) / 1000.0);
            stateText = "IN COMBAT";
            timerText = combatSec.toFixed(1) + "s";
        } else if (recoveryActive) {
            var recoverSec = Math.max(0, (COMBAT_STATUS_RECOVERY_MS - recentCombatMs) / 1000.0);
            stateText = "RECOVERING";
            timerText = recoverSec.toFixed(1) + "s";
        }

        var stateLabel = GetCachedPanel("combatStatusState");
        if (stateLabel && stateText !== State.combatStatus.lastStateText) {
            stateLabel.text = stateText;
            State.combatStatus.lastStateText = stateText;
        }
        var timerLabel = GetCachedPanel("combatStatusTimer");
        if (timerLabel && timerText !== State.combatStatus.lastTimerText) {
            timerLabel.text = timerText;
            State.combatStatus.lastTimerText = timerText;
        }
    }

    // ── Registration ──
    QOL.register("combatStatus", {
        configKeys: ["ENABLE_COMBAT_STATUS", "ENABLE_COMBAT_INDICATOR"],
        bucket: 7,
        phase: -1,
        requiresRoot: true,
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

    // ── Self-test ──
    try {
        if (typeof UpdateCombatStatusOverlay !== "function") throw new Error("UpdateCombatStatusOverlay is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
