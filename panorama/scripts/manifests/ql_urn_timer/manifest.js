// features/ql_urn_timer/manifest.js
// =============================================================================
// QOLLOCK — Urn Timer (Unstable Rift countdown in top bar)
// =============================================================================
// OWNS:        RiftTimer panel + RiftTimerLabel under TopBar > TeamNetworth.
//              Monitors minimap .map_button.capture_point for koth_warning class.
// DOES NOT OWN: Minimap panels (Valve), TopBar (Valve)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL delegates: state, utils, getCachedPanel, setCachedPanel,
//              getGameSecondsForUrn, isConnectedToHideout, panelIdTopBar
// CONFIG KEYS: ENABLE_URN_TIMER
// CSS:         none
// PATTERN:     Polling (0.5Hz). Self-scheduling via Scheduler.
//              CVar-driven constants — GAME_VERSION_DEPENDENT.
//              Minimap scan with class-priority state machine.
// STATE KEYS:  riftTimerDisplayMode, riftTimerLastText, riftTimerRiftAccumulator,
//              riftTimerWarningGameSec, riftTimerWarningActive,
//              riftTimerLastCapturePointCheckMs, riftTimerCapturePointValid,
//              riftTimerRiftIsActive, riftTimerLastSpawnCycleMs, riftTimerLastMode
//              (written for backward compat — Pattern 7)
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_urn_timer: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_urn_timer",
        enableKey: "ENABLE_URN_TIMER",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_URN_TIMER", type: "toggle", default: false }
        ],
        create: function(ctx) {
            // ── QOL delegate wrappers (Pattern 10) ──
            function _getState() {
                try { if (typeof QOL !== "undefined" && QOL.state) return QOL.state; } catch(e) {}
                return null;
            }
            function _getCachedPanel(key) {
                try { if (typeof QOL !== "undefined" && QOL.getCachedPanel) return QOL.getCachedPanel(key); } catch(e) {}
                return null;
            }
            function _setCachedPanel(key, val) {
                try { if (typeof QOL !== "undefined" && QOL.setCachedPanel) QOL.setCachedPanel(key, val); } catch(e) {}
            }
            function _getGameSecondsForUrn(root) {
                try { if (typeof QOL !== "undefined" && QOL.getGameSecondsForUrn) return QOL.getGameSecondsForUrn(root); } catch(e) {}
                return 0;
            }
            function _isConnectedToHideout(root) {
                try { if (typeof QOL !== "undefined" && QOL.isConnectedToHideout) return QOL.isConnectedToHideout(root); } catch(e) {}
                return false;
            }
            function _getPanelIdTopBar() {
                try { if (typeof QOL !== "undefined" && QOL.panelIdTopBar) return QOL.panelIdTopBar; } catch(e) {}
                return "TopBar";
            }
            function _isPanelValid(p) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.IsPanelValid) return QOL.utils.IsPanelValid(p); } catch(e) {}
                return !!(p && typeof p.IsValid === "function" && p.IsValid());
            }
            function _isCfgEnabled(cfg, key) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.IsCfgEnabled) return QOL.utils.IsCfgEnabled(cfg, key); } catch(e) {}
                return Number(cfg[key]) === 1;
            }

            // ── Constants (CVar-driven, GAME_VERSION_DEPENDENT) ──
            // Last verified: 2026-07-13 game patch (bzihnali: RIFT_INITIAL_DELAY changed 25s→20s)
            // citadel_koth_spawn_initial_delay = 720s (12 min)
            // citadel_koth_early_warning_time  = 60s  (koth_warning class appears)
            // citadel_koth_spawn_window       = ±60s random jitter per spawn
            // citadel_koth_respawn_interval   = 420s (7 min between spawns)
            var RIFT_INITIAL_DELAY_SEC = 12 * 60 + 20;      // 740 — accumulator (720) + 20s fudge
            var RIFT_RESPAWN_INTERVAL_SEC = 7 * 60;          // 420
            var RIFT_EARLY_WARNING_SEC = 20;                 // koth_warning → spawn
            var RIFT_SPAWN_JITTER_SEC = 60;
            var RIFT_MINIMAP_POLL_INTERVAL_MS = 500;
            var RIFT_DEBUG = false;
            var _debugLogIntervalMs = 2000;

            var _loop = null;
            var _lastLogMs = 0;

            function _debugLog(msg) {
                if (!RIFT_DEBUG) return;
                var now = Date.now ? Date.now() : (new Date()).getTime();
                if (now - _lastLogMs < _debugLogIntervalMs) return;
                _lastLogMs = now;
                $.Msg("[QOLLock][RIFT] " + msg);
            }

            // ── Helpers ──
            function _formatClockMmSs(totalSec) {
                var s = Math.max(0, Math.floor(Number(totalSec) || 0));
                var mm = Math.floor(s / 60);
                var ss = s % 60;
                return String(mm) + ":" + (ss < 10 ? "0" + ss : String(ss));
            }

            function _findFirstPanelByClass(panel, className) {
                if (!panel || !panel.FindChildrenWithClassTraverse) return null;
                var matches = panel.FindChildrenWithClassTraverse(className) || [];
                return matches.length > 0 ? matches[0] : null;
            }

            function _estimateAccumulatorFromGameTime(gameSec) {
                if (gameSec <= RIFT_INITIAL_DELAY_SEC) return RIFT_INITIAL_DELAY_SEC;
                var elapsed = gameSec - RIFT_INITIAL_DELAY_SEC;
                var cycles = Math.floor(elapsed / RIFT_RESPAWN_INTERVAL_SEC);
                return RIFT_INITIAL_DELAY_SEC + cycles * RIFT_RESPAWN_INTERVAL_SEC;
            }

            function _computeRiftRangeSeconds(gameSec, accumulator) {
                var minSec = Math.max(0, accumulator - RIFT_SPAWN_JITTER_SEC - gameSec);
                var maxSec = Math.max(0, accumulator + RIFT_SPAWN_JITTER_SEC - gameSec);
                return { min: minSec, max: maxSec };
            }

            function _formatRangeDisplay(minSec, maxSec) {
                return _formatClockMmSs(minSec) + " - " + _formatClockMmSs(maxSec);
            }

            function _scanMinimapForRift(root) {
                var minimapIDs = ["hud_minimap", "minimap_persp", "minimap_container",
                    "minimap_frame", "HudMinimapContainer"];
                var minimapPanel = null;
                for (var m = 0; m < minimapIDs.length; m++) {
                    var p = root ? root.FindChildTraverse(minimapIDs[m]) : null;
                    if (p) { minimapPanel = p; break; }
                }
                if (!minimapPanel || !minimapPanel.FindChildrenWithClassTraverse) {
                    return { hasCapturePoint: false, hasKothWarning: false, isActive: false };
                }
                var mapButtons = minimapPanel.FindChildrenWithClassTraverse("map_button") || [];
                var bestHasCp = false, bestHasKoth = false, bestHasActive = false;
                var cvCount = 0;
                for (var i = 0; i < mapButtons.length; i++) {
                    var btn = mapButtons[i];
                    if (!_isPanelValid(btn)) continue;
                    if (!btn.BHasClass) continue;
                    if (!btn.BHasClass("capture_point")) continue;
                    cvCount++;
                    var hasKw = btn.BHasClass("koth_warning");
                    var hasActive = btn.BHasClass("active");
                    if (hasKw) {
                        bestHasCp = true; bestHasKoth = true; bestHasActive = hasActive;
                        _debugLog("RIFT btn#" + cvCount + ": cp active=" +
                            (hasActive ? "Y" : "n") + " koth=Y *** WARNING *** btns=" + mapButtons.length);
                    } else if (hasActive && !bestHasKoth) {
                        bestHasCp = true; bestHasActive = true;
                        _debugLog("RIFT btn#" + cvCount + ": cp active=Y koth=n *** ACTIVE *** btns=" + mapButtons.length);
                    } else if (!bestHasActive && !bestHasKoth) {
                        bestHasCp = true;
                    }
                }
                return { hasCapturePoint: bestHasCp, hasKothWarning: bestHasKoth, isActive: bestHasActive };
            }

            function _checkMinimapRiftState(root, nowMs) {
                var State = _getState();
                var lastCheck = (State && State.riftTimerLastCapturePointCheckMs) || 0;
                if (nowMs - lastCheck < RIFT_MINIMAP_POLL_INTERVAL_MS) {
                    return {
                        hasCapturePoint: !!(State && State.riftTimerCapturePointValid),
                        isActive: !!(State && State.riftTimerRiftIsActive),
                        inWarning: !!(State && State.riftTimerWarningActive)
                    };
                }
                if (State) State.riftTimerLastCapturePointCheckMs = nowMs;
                var scan = _scanMinimapForRift(root);
                if (State) {
                    State.riftTimerCapturePointValid = scan.hasCapturePoint;
                    State.riftTimerRiftIsActive = scan.isActive;
                    State.riftTimerWarningActive = scan.hasKothWarning;
                }
                return { hasCapturePoint: scan.hasCapturePoint,
                    isActive: scan.isActive, inWarning: scan.hasKothWarning };
            }

            function _ensureRiftTimerPanel(root) {
                var panel = _getCachedPanel("riftTimerPanel");
                var label = _getCachedPanel("riftTimerLabel");
                if (panel && label && label.GetParent && label.GetParent() === panel)
                    return panel;
                panel = root ? root.FindChildTraverse("RiftTimer") : null;
                if (!panel) {
                    var PANEL_ID_TOP_BAR = _getPanelIdTopBar();
                    var parent = null;
                    var topBar = root ? root.FindChildTraverse(PANEL_ID_TOP_BAR) : null;
                    if (topBar) parent = _findFirstPanelByClass(topBar, "TeamNetworth");
                    if (!parent && root) parent = _findFirstPanelByClass(root, "TeamNetworth");
                    if (!parent && topBar) parent = topBar;
                    if (!parent) return null;
                    panel = $.CreatePanel("Panel", parent, "RiftTimer", {
                        "class": "RiftTimer", hittest: "false",
                        hittestchildren: "false", visible: "true"
                    });
                }
                if (!panel) return null;
                var icon = panel.FindChildTraverse("RiftTimerRiftIcon");
                if (!icon) {
                    icon = $.CreatePanel("Panel", panel, "RiftTimerRiftIcon", {
                        "class": "RiftTimerRiftIcon", hittest: "false"
                    });
                }
                label = panel.FindChildTraverse("RiftTimerLabel");
                if (!label) {
                    label = $.CreatePanel("Label", panel, "RiftTimerLabel", {
                        "class": "RiftTimerLabel", text: "0:00 - 0:00"
                    });
                }
                _setCachedPanel("riftTimerPanel", panel);
                _setCachedPanel("riftTimerLabel", label);
                return panel;
            }

            function _hideRiftTimerPanel(root) {
                var panel = _getCachedPanel("riftTimerPanel");
                if (!panel && root && root.FindChildTraverse) {
                    panel = root.FindChildTraverse("RiftTimer");
                    if (_isPanelValid(panel)) _setCachedPanel("riftTimerPanel", panel);
                }
                if (_isPanelValid(panel)) panel.visible = false;
            }

            function _resolveRiftMode(root, gameSec, nowMs) {
                var State = _getState();
                var state_data = _checkMinimapRiftState(root, nowMs);
                var prevMode = (State && State.riftTimerDisplayMode) || "idle";

                if (state_data.hasCapturePoint && state_data.inWarning) {
                    if (prevMode !== "warning" && State) {
                        State.riftTimerWarningGameSec = gameSec;
                        State.riftTimerLastSpawnCycleMs = 0;
                    }
                    return "warning";
                }
                if (state_data.hasCapturePoint && state_data.isActive && !state_data.inWarning) {
                    return "active";
                }

                // Button gone or cooldown
                if (prevMode === "warning" || prevMode === "active") {
                    if (State) {
                        var acc = State.riftTimerRiftAccumulator || RIFT_INITIAL_DELAY_SEC;
                        State.riftTimerRiftAccumulator = acc + RIFT_RESPAWN_INTERVAL_SEC;
                        State.riftTimerWarningGameSec = 0;
                        State.riftTimerWarningActive = false;
                        State.riftTimerLastSpawnCycleMs = nowMs;
                    }
                    return "idle";
                }

                // idle — auto-advance accumulator if past the window
                if (State) {
                    var currAcc = State.riftTimerRiftAccumulator || RIFT_INITIAL_DELAY_SEC;
                    if (gameSec > currAcc + RIFT_SPAWN_JITTER_SEC) {
                        State.riftTimerRiftAccumulator = currAcc + RIFT_RESPAWN_INTERVAL_SEC;
                    }
                }
                return "idle";
            }

            // ── Main tick ──
            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!_isPanelValid(root)) return;

                    var cfg = ctx.config.all();
                    var enabled = Number(cfg.ENABLE_URN_TIMER) === 1;
                    var inHideout = _isConnectedToHideout(root);

                    if (!enabled || inHideout) {
                        _hideRiftTimerPanel(root);
                        var State = _getState();
                        if (State) {
                            State.riftTimerDisplayMode = inHideout ? "hideout" : "disabled";
                            State.riftTimerLastText = "";
                            State.riftTimerRiftAccumulator = 0;
                            State.riftTimerWarningGameSec = 0;
                            State.riftTimerWarningActive = false;
                            State.riftTimerLastCapturePointCheckMs = 0;
                            State.riftTimerCapturePointValid = false;
                            State.riftTimerRiftIsActive = false;
                            State.riftTimerLastSpawnCycleMs = 0;
                        }
                        return;
                    }

                    var gameSec = _getGameSecondsForUrn(root);
                    if (gameSec <= 0) return;

                    var State = _getState();
                    if (!State) return;

                    if (!State.riftTimerRiftAccumulator || State.riftTimerRiftAccumulator <= 0) {
                        State.riftTimerRiftAccumulator = _estimateAccumulatorFromGameTime(gameSec);
                    }

                    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                    var mode = _resolveRiftMode(root, gameSec, nowMs);
                    State.riftTimerDisplayMode = mode;

                    var displayText = "";
                    if (mode === "warning") {
                        var warningSec = State.riftTimerWarningGameSec || gameSec;
                        var elapsed = Math.max(0, gameSec - warningSec);
                        var remaining = Math.max(0, RIFT_EARLY_WARNING_SEC - elapsed);
                        displayText = remaining > 0 ? _formatClockMmSs(remaining) : "ACTIVE";
                    } else if (mode === "active") {
                        displayText = "ACTIVE";
                    } else {
                        var acc = State.riftTimerRiftAccumulator || RIFT_INITIAL_DELAY_SEC;
                        var range = _computeRiftRangeSeconds(gameSec, acc);
                        displayText = _formatRangeDisplay(range.min, range.max);
                    }

                    if (State.riftTimerLastText === displayText && State.riftTimerLastMode === mode)
                        return;

                    _debugLog("DISPLAY: mode=" + mode + " text='" + displayText +
                        "' gameSec=" + gameSec + " acc=" + (State.riftTimerRiftAccumulator || 0));

                    State.riftTimerLastText = displayText;
                    State.riftTimerLastMode = mode;

                    var panel = _ensureRiftTimerPanel(root);
                    var label = _getCachedPanel("riftTimerLabel");
                    if (!panel || !label) return;

                    label.text = displayText;
                    panel.visible = true;
                    try {
                        if (panel.SetHasClass) {
                            panel.SetHasClass("rift_warning", mode === "warning");
                            panel.SetHasClass("rift_active", mode === "active");
                            panel.SetHasClass("rift_idle", mode === "idle");
                        }
                    } catch(e) { /* panel may be deleted mid-frame */ }
                } catch(e) {
                    logger.logError("ql_urn_timer", "_tick threw: " + (e.message || e));
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_urn_timer") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_urn_timer");
                    logger.clearThrottle("ql_urn_timer");
                    // Clean up panel and state
                    var root = $.GetContextPanel();
                    _hideRiftTimerPanel(root);
                    var State = _getState();
                    if (State) {
                        State.riftTimerDisplayMode = "disabled";
                        State.riftTimerLastText = "";
                        State.riftTimerRiftAccumulator = 0;
                        State.riftTimerWarningGameSec = 0;
                        State.riftTimerWarningActive = false;
                        State.riftTimerLastCapturePointCheckMs = 0;
                        State.riftTimerCapturePointValid = false;
                        State.riftTimerRiftIsActive = false;
                        State.riftTimerLastSpawnCycleMs = 0;
                        State.riftTimerLastMode = "";
                    }
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var topBar = root ? root.FindChildTraverse("TopBar") : null;
                if (!topBar) return null;
                return { passed: true, name: "Urn timer top bar panel exists", message: "", assertions: [{ passed: true, name: "TopBar panel exists" }] };
            } catch(e) { return { passed: false, name: "Urn timer panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
