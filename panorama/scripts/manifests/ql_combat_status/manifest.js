// features/ql_combat_status/manifest.js
// =============================================================================
// QOLLOCK — Combat Status Overlay (IN COMBAT / RECOVERING / OUT OF COMBAT)
// =============================================================================
// OWNS:        Combat status overlay panel + timer display + state machine
// DOES NOT OWN: Combat signal detection (delegates to QOL.isCombatSignalActive)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_COMBAT_STATUS, ENABLE_COMBAT_INDICATOR,
//              COMBAT_STATUS_SCALE, COMBAT_STATUS_X/Y_OFFSET
// PATTERN:     Polling (~5Hz). 3-phase state machine: combat → recover → idle.
//              Creates overlay with state/timer child labels.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] combat_status: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_combat_status",
        enableKey: "ENABLE_COMBAT_STATUS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_COMBAT_STATUS", type: "toggle", default: false },
            { key: "ENABLE_COMBAT_INDICATOR", type: "toggle", default: false },
            { key: "COMBAT_STATUS_SCALE", type: "slider", min: 50, max: 200, step: 1, default: 100 },
            { key: "COMBAT_STATUS_X_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 },
            { key: "COMBAT_STATUS_Y_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 }
        ],
        create: function(ctx) {
            // ── Constants (mirror old feature lines 24-28) ──
            var RECOVERY_MS = 3000;
            var _loop = null;
            var _overlay = null;
            var _stateLabel = null;
            var _timerLabel = null;
            // Local state (mirrors State.combatStatus.*)
            var _displayMode = "";
            var _lastLayoutSig = "";
            var _lastClassSig = "";
            var _lastStateText = "";
            var _lastTimerText = "";
            var _lastCombatMs = 0;
            var _combatStartMs = 0;
            var _signalActive = false;

            function _isAlive(p) { return p && typeof p.IsValid === "function" && p.IsValid(); }

            function _ensureOverlay(root) {
                if (_isAlive(_overlay)) return _overlay;
                _overlay = root.FindChildTraverse ? root.FindChildTraverse("QOLCombatStatusOverlay") : null;
                if (!_overlay) {
                    var gp = root.FindChildTraverse ? (root.FindChildTraverse("gameplay_hud") || root) : root;
                    if (!gp) return null;
                    _overlay = $.CreatePanel("Panel", gp, "QOLCombatStatusOverlay", {
                        hittest: "false", hittestchildren: "false"
                    });
                    _stateLabel = $.CreatePanel("Label", _overlay, "QOLCombatStatusState");
                    _stateLabel.text = "IN COMBAT";
                    _timerLabel = $.CreatePanel("Label", _overlay, "QOLCombatStatusTimer");
                    _timerLabel.text = "0.0s";
                } else {
                    _stateLabel = _overlay.FindChildTraverse ? _overlay.FindChildTraverse("QOLCombatStatusState") : null;
                    _timerLabel = _overlay.FindChildTraverse ? _overlay.FindChildTraverse("QOLCombatStatusTimer") : null;
                }
                return _overlay;
            }

            function _removeOverlay() {
                if (_isAlive(_overlay)) { try { _overlay.DeleteAsync(0); } catch(e) {} }
                _overlay = null; _stateLabel = null; _timerLabel = null;
                // Clear global panel cache so the old system doesn't write to a deleted panel.
                try {
                    if (typeof QOL !== "undefined" && QOL.setCachedPanel) {
                        QOL.setCachedPanel("combatStatusOverlay", null);
                        QOL.setCachedPanel("combatStatusState", null);
                        QOL.setCachedPanel("combatStatusTimer", null);
                        QOL.setCachedPanel("combatStatusAlertPanel", null);
                    }
                } catch(e) {}
                _displayMode = ""; _lastLayoutSig = ""; _lastClassSig = "";
                _lastStateText = ""; _lastTimerText = "";
                _lastCombatMs = 0; _combatStartMs = 0; _signalActive = false;
                // Write to State.combatStatus.* so coreRoot's combat indicator stays functional
                // when the old feature is removed (post-migration compatibility).
                try {
                    if (typeof QOL !== "undefined" && QOL.state) {
                        var st = QOL.state.combatStatus;
                        if (st) {
                            st.displayMode = ""; st.lastLayoutSig = ""; st.lastClassSig = "";
                            st.lastStateText = ""; st.lastTimerText = "";
                            st.lastCombatMs = 0; st.combatStartMs = 0; st.signalActive = false;
                        }
                    }
                } catch(e) {}
            }

            function _isCustomHudActive(root) {
                try {
                    if (typeof QOL !== "undefined" && QOL.isCustomHudContextActive) {
                        return QOL.isCustomHudContextActive(root);
                    }
                } catch(e) {}
                return true; // fallback: assume active
            }

            function _isCombatSignal(root, nowMs) {
                try {
                    if (typeof QOL !== "undefined" && QOL.isCombatSignalActive) {
                        return QOL.isCombatSignalActive(root, nowMs);
                    }
                } catch(e) {}
                return false;
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!root) return;  // null-root guard (mirrors old requiresRoot: true)
                var now = Date.now ? Date.now() : (new Date()).getTime();
                var cfg = ctx.config.view();

                // ── Context gate (mirrors old line 100-106) ──
                if (!_isCustomHudActive(root)) {
                    if (_displayMode !== "context_off") { _removeOverlay(); _displayMode = "context_off"; }
                    return;
                }

                // ── Enablement gate (mirrors old line 108-114) ──
                if (Number(cfg.ENABLE_COMBAT_STATUS) !== 1) {
                    if (_displayMode !== "disabled") { _removeOverlay(); _displayMode = "disabled"; }
                    return;
                }

                // ── Ensure overlay (mirrors old line 116-121) ──
                var ov = _ensureOverlay(root);
                if (!_isAlive(ov)) return;
                if (_displayMode !== "active" || (ov.BHasClass && ov.BHasClass("qol-hidden"))) {
                    if (ov.SetHasClass) ov.SetHasClass("qol-hidden", false);
                    else try { ov.style.visibility = "visible"; } catch(e) {}
                }
                _displayMode = "active";

                // ── Layout: scale + position (mirrors old line 123-142) ──
                var scale = Math.round(Number(cfg.COMBAT_STATUS_SCALE));
                var offsetX = Math.round(Number(cfg.COMBAT_STATUS_X_OFFSET));
                var offsetY = Math.round(Number(cfg.COMBAT_STATUS_Y_OFFSET));
                if (!isFinite(scale)) scale = 100;
                if (!isFinite(offsetX)) offsetX = 0;
                if (!isFinite(offsetY)) offsetY = 0;
                if (scale < 50) scale = 50; if (scale > 200) scale = 200;
                if (offsetX < -1000) offsetX = -1000; if (offsetX > 1000) offsetX = 1000;
                if (offsetY < -1000) offsetY = -1000; if (offsetY > 1000) offsetY = 1000;

                var layoutSig = scale + "|" + offsetX + "|" + offsetY;
                if (layoutSig !== _lastLayoutSig) {
                    ov.style.preTransformScale2d = (scale / 100).toFixed(2);
                    ov.style.marginLeft = offsetX + "px";
                    ov.style.marginBottom = (165 + offsetY) + "px";
                    _lastLayoutSig = layoutSig;
                }

                // ── Combat signal detection (mirrors old line 144-151) ──
                var combatSignal = _isCombatSignal(root, now);
                if (combatSignal) {
                    if (!_signalActive || _combatStartMs <= 0) { _combatStartMs = now; }
                    _lastCombatMs = now;
                }
                _signalActive = combatSignal;
                // Write to State.combatStatus.* for cross-feature compatibility.
                // coreRoot reads lastCombatMs for combat_indicator_active class (ql_core.js line 13179).
                try {
                    if (typeof QOL !== "undefined" && QOL.state) {
                        var st = QOL.state.combatStatus;
                        if (st) {
                            st.lastCombatMs = _lastCombatMs;
                            st.combatStartMs = _combatStartMs;
                            st.signalActive = _signalActive;
                        }
                    }
                } catch(e) {}

                // ── Phase state machine (mirrors old line 153-158) ──
                var recentCombatMs = now - _lastCombatMs;
                var recoveryActive = !combatSignal && _lastCombatMs > 0 && recentCombatMs <= RECOVERY_MS;
                var phase = combatSignal ? "combat" : (recoveryActive ? "recover" : "idle");
                if (phase === "idle") { _combatStartMs = 0; }

                // ── Phase classes (mirrors old line 160-165) ──
                var classSig = phase;
                if (classSig !== _lastClassSig) {
                    ov.SetHasClass("phase_combat", combatSignal);
                    ov.SetHasClass("phase_recover", recoveryActive);
                    ov.SetHasClass("phase_idle", !combatSignal && !recoveryActive);
                    _lastClassSig = classSig;
                }

                // ── Label text (mirrors old line 168-191) ──
                var stateText = "OUT OF COMBAT";
                var timerText = "--";
                if (combatSignal) {
                    var cs = (_combatStartMs > 0 && isFinite(_combatStartMs)) ? _combatStartMs : now;
                    var combatSec = Math.max(0, (now - cs) / 1000.0);
                    stateText = "IN COMBAT";
                    timerText = combatSec.toFixed(1) + "s";
                } else if (recoveryActive) {
                    var recoverSec = Math.max(0, (RECOVERY_MS - recentCombatMs) / 1000.0);
                    stateText = "RECOVERING";
                    timerText = recoverSec.toFixed(1) + "s";
                }

                if (_isAlive(_stateLabel) && stateText !== _lastStateText) {
                    _stateLabel.text = stateText; _lastStateText = stateText;
                }
                if (_isAlive(_timerLabel) && timerText !== _lastTimerText) {
                    _timerLabel.text = timerText; _lastTimerText = timerText;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    // Legacy dispatch ran at 5Hz; the 20Hz rewrite cadence was
                    // unnecessary for a timer rendered to one decimal place.
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_combat_status") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _removeOverlay();
                },
                onSettingsChanged: function() { _lastLayoutSig = ""; }
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var gp = root ? root.FindChildTraverse("gameplay_hud") : null;
            return { passed: !!gp, name: "Combat status anchor panel exists", message: gp ? "" : "gameplay_hud not found", assertions: [{ passed: !!gp, name: "gameplay_hud panel exists" }] };
        } catch(e) { return { passed: false, name: "Combat status panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();
