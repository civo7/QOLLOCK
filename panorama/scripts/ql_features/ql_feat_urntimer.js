// ql_feat_urntimer.js — Rift spawn countdown timer in the top bar
// Monitors the minimap's .map_button.capture_point for the koth_warning class
// to detect the 60s early warning before an Unstable Rift spawn.
// Shows a range-based countdown between rifts and a precise 60s countdown
// during the warning phase.
(function() {
    'use strict';
    var _featureId = "ql_feat_urntimer";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "getGameSecondsForUrn", "isConnectedToHideout", "panelIdTopBar",
        "resolveCachedPanel", "ensureMinimapPanelCache"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var GetGameSecondsForUrn = _deps.getGameSecondsForUrn;
    var IsConnectedToHideout = _deps.isConnectedToHideout;
    var PANEL_ID_TOP_BAR = _deps.panelIdTopBar;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;

    // ── Constants (CVar-driven) ──
    // citadel_koth_spawn_initial_delay = 720s (12 min)
    // citadel_koth_early_warning_time  = 60s  (koth_warning class appears)
    // citadel_koth_spawn_window       = ±60s random jitter per spawn
    // citadel_koth_respawn_interval   = 420s (7 min between spawns)
    var RIFT_INITIAL_DELAY_SEC = 12 * 60 + 25;      // 720 — accumulator + 25
    var RIFT_RESPAWN_INTERVAL_SEC = 7 * 60;    // 420
    var RIFT_EARLY_WARNING_SEC = 20;           // koth_warning → spawn
    var RIFT_SPAWN_JITTER_SEC = 60;
    var RIFT_MINIMAP_POLL_INTERVAL_MS = 500;
    var RIFT_DEBUG = false;
    var _debugLogIntervalMs = 2000;

    function _debugLog(msg) {
        if (!RIFT_DEBUG) return;
        var now = Date.now ? Date.now() : (new Date()).getTime();
        var last = State._riftDebugLastLogMs || 0;
        if (now - last < _debugLogIntervalMs) return;
        State._riftDebugLastLogMs = now;
        $.Msg("[QOLLock][RIFT] " + msg);
    }

    function FormatClockMmSs(totalSec) {
        var s = Math.max(0, Math.floor(Number(totalSec) || 0));
        var mm = Math.floor(s / 60);
        var ss = s % 60;
        return String(mm) + ":" + (ss < 10 ? "0" + ss : String(ss));
    }

    function FindFirstPanelByClass(panel, className) {
        if (!panel || !panel.FindChildrenWithClassTraverse) return null;
        var matches = panel.FindChildrenWithClassTraverse(className) || [];
        return matches.length > 0 ? matches[0] : null;
    }

    function EstimateAccumulatorFromGameTime(gameSec) {
        if (gameSec <= RIFT_INITIAL_DELAY_SEC) return RIFT_INITIAL_DELAY_SEC;
        var elapsed = gameSec - RIFT_INITIAL_DELAY_SEC;
        var cycles = Math.floor(elapsed / RIFT_RESPAWN_INTERVAL_SEC);
        return RIFT_INITIAL_DELAY_SEC + cycles * RIFT_RESPAWN_INTERVAL_SEC;
    }

    function ComputeRiftRangeSeconds(gameSec, accumulator) {
        var minSec = Math.max(0, accumulator - RIFT_SPAWN_JITTER_SEC - gameSec);
        var maxSec = Math.max(0, accumulator + RIFT_SPAWN_JITTER_SEC - gameSec);
        return { min: minSec, max: maxSec };
    }

    function FormatRangeDisplay(minSec, maxSec) {
        return FormatClockMmSs(minSec) + " - " + FormatClockMmSs(maxSec);
    }

    function ScanMinimapForRift(root) {
        // Find ANY map_button with the right class combo:
        //   cp + active + koth_warning → warning
        //   cp + active (no koth)      → active
        //   cp only                    → cooldown
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
        // Scan all buttons, track highest-priority state.
        // Priority: warning > active > cooldown (capture_point only) > none
        var bestHasCp = false, bestHasKoth = false, bestHasActive = false;
        var cvCount = 0;
        for (var i = 0; i < mapButtons.length; i++) {
            var btn = mapButtons[i];
            if (!IsPanelValid(btn)) continue;
            if (!btn.BHasClass) continue;
            if (!btn.BHasClass("capture_point")) continue;
            cvCount++;
            var hasKw = btn.BHasClass("koth_warning");
            var hasActive = btn.BHasClass("active");
            if (hasKw) {
                // warning beats everything
                bestHasCp = true; bestHasKoth = true; bestHasActive = hasActive;
                _debugLog("RIFT btn#" + cvCount + ": cp active=" +
                    (hasActive ? "Y" : "n") + " koth=Y *** WARNING *** btns=" + mapButtons.length);
            } else if (hasActive && !bestHasKoth) {
                // active only (don't downgrade from warning)
                bestHasCp = true; bestHasActive = true;
                _debugLog("RIFT btn#" + cvCount + ": cp active=Y koth=n *** ACTIVE *** btns=" + mapButtons.length);
            } else if (!bestHasActive && !bestHasKoth) {
                bestHasCp = true;
            }
        }
        if (cvCount === 0) {
            _debugLog("RIFT scan: 0 capture_point buttons btns=" + mapButtons.length);
        }
        return { hasCapturePoint: bestHasCp, hasKothWarning: bestHasKoth, isActive: bestHasActive };
    }

    function CheckMinimapRiftState(root, nowMs) {
        var lastCheck = State.riftTimerLastCapturePointCheckMs || 0;
        if (nowMs - lastCheck < RIFT_MINIMAP_POLL_INTERVAL_MS) {
            return {
                hasCapturePoint: !!State.riftTimerCapturePointValid,
                isActive: !!State.riftTimerRiftIsActive,
                inWarning: !!State.riftTimerWarningActive
            };
        }
        State.riftTimerLastCapturePointCheckMs = nowMs;
        var scan = ScanMinimapForRift(root);
        State.riftTimerCapturePointValid = scan.hasCapturePoint;
        State.riftTimerRiftIsActive = scan.isActive;
        State.riftTimerWarningActive = scan.hasKothWarning;
        return { hasCapturePoint: scan.hasCapturePoint,
            isActive: scan.isActive, inWarning: scan.hasKothWarning };
    }

    function EnsureRiftTimerPanel(root) {
        var panel = GetCachedPanel("riftTimerPanel");
        var label = GetCachedPanel("riftTimerLabel");
        if (panel && label && label.GetParent && label.GetParent() === panel)
            return panel;
        panel = root ? root.FindChildTraverse("RiftTimer") : null;
        if (!panel) {
            var parent = null;
            var topBar = root ? root.FindChildTraverse(PANEL_ID_TOP_BAR) : null;
            if (topBar) parent = FindFirstPanelByClass(topBar, "TeamNetworth");
            if (!parent && root) parent = FindFirstPanelByClass(root, "TeamNetworth");
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
        SetCachedPanel("riftTimerPanel", panel);
        SetCachedPanel("riftTimerLabel", label);
        return panel;
    }

    function HideRiftTimerPanel(root) {
        var panel = GetCachedPanel("riftTimerPanel");
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse("RiftTimer");
            if (IsPanelValid(panel)) SetCachedPanel("riftTimerPanel", panel);
        }
        if (IsPanelValid(panel)) panel.visible = false;
    }

    function ResolveRiftMode(root, gameSec, nowMs) {
        // Class lifecycle: capture_point + active + koth_warning → warning
        //                 capture_point + active (no koth_warning) → active
        //                 capture_point only (no active) → cooldown
        var state = CheckMinimapRiftState(root, nowMs);
        var prevMode = State.riftTimerDisplayMode || "idle";

        if (state.hasCapturePoint && state.inWarning) {
            // Warning phase: 25s countdown (koth_warning present, active may or may not be)
            if (prevMode !== "warning") {
                State.riftTimerWarningGameSec = gameSec;
                State.riftTimerLastSpawnCycleMs = 0;
            }
            return "warning";
        }
        if (state.hasCapturePoint && state.isActive && !state.inWarning) {
            // Active phase: rift capturable (active present, koth_warning gone)
            return "active";
        }

        // Button gone or cooldown (capture_point but no active)
        if (prevMode === "warning" || prevMode === "active") {
            // Just exited warning/active — advance accumulator
            var acc = State.riftTimerRiftAccumulator || RIFT_INITIAL_DELAY_SEC;
            State.riftTimerRiftAccumulator = acc + RIFT_RESPAWN_INTERVAL_SEC;
            State.riftTimerWarningGameSec = 0;
            State.riftTimerWarningActive = false;
            State.riftTimerLastSpawnCycleMs = nowMs;
            return "idle";
        }

        // idle — auto-advance accumulator if we're past the window
        var currAcc = State.riftTimerRiftAccumulator || RIFT_INITIAL_DELAY_SEC;
        if (gameSec > currAcc + RIFT_SPAWN_JITTER_SEC) {
            State.riftTimerRiftAccumulator = currAcc + RIFT_RESPAWN_INTERVAL_SEC;
        }
        return "idle";
    }

    var _hasLoggedStartup = false;

    function UpdateRiftTimer(root, cfg, nowMs) {
        if (!root) return;
        var enabled = IsCfgEnabled(cfg, "ENABLE_URN_TIMER");
        var inHideout = IsConnectedToHideout(root);

        if (!_hasLoggedStartup) {
            _hasLoggedStartup = true;
            $.Msg("[QOLLock][RIFT] STARTUP: enabled=" + enabled +
                " hideout=" + inHideout +
                " ENABLE_URN_TIMER=" + cfg.ENABLE_URN_TIMER);
        }
        if (!enabled || inHideout) {
            HideRiftTimerPanel(root);
            State.riftTimerDisplayMode = inHideout ? "hideout" : "disabled";
            State.riftTimerLastText = "";
            State.riftTimerRiftAccumulator = 0;
            State.riftTimerWarningGameSec = 0;
            State.riftTimerWarningActive = false;
            State.riftTimerLastCapturePointCheckMs = 0;
            State.riftTimerCapturePointValid = false;
            State.riftTimerRiftIsActive = false;
            State.riftTimerLastSpawnCycleMs = 0;
            return;
        }
        var gameSec = GetGameSecondsForUrn(root);
        if (gameSec <= 0) return;
        if (!State.riftTimerRiftAccumulator || State.riftTimerRiftAccumulator <= 0) {
            State.riftTimerRiftAccumulator = EstimateAccumulatorFromGameTime(gameSec);
        }
        var mode = ResolveRiftMode(root, gameSec, nowMs);
        State.riftTimerDisplayMode = mode;
        var displayText = "";
        if (mode === "warning") {
            var warningSec = State.riftTimerWarningGameSec || gameSec;
            var elapsed = Math.max(0, gameSec - warningSec);
            var remaining = Math.max(0, RIFT_EARLY_WARNING_SEC - elapsed);
            displayText = remaining > 0 ? FormatClockMmSs(remaining) : "ACTIVE";
        } else if (mode === "active") {
            displayText = "ACTIVE";
        } else {
            var acc = State.riftTimerRiftAccumulator || RIFT_INITIAL_DELAY_SEC;
            var range = ComputeRiftRangeSeconds(gameSec, acc);
            displayText = FormatRangeDisplay(range.min, range.max);
        }
        if (State.riftTimerLastText === displayText && State.riftTimerLastMode === mode)
            return;
        _debugLog("DISPLAY: mode=" + mode + " text='" + displayText +
            "' gameSec=" + gameSec + " acc=" + (State.riftTimerRiftAccumulator || 0));
        State.riftTimerLastText = displayText;
        State.riftTimerLastMode = mode;
        var panel = EnsureRiftTimerPanel(root);
        var label = GetCachedPanel("riftTimerLabel");
        if (!panel || !label) return;
        label.text = displayText;
        panel.visible = true;
        try {
            if (panel.SetHasClass) {
                panel.SetHasClass("rift_warning", mode === "warning");
                panel.SetHasClass("rift_active", mode === "active");
                panel.SetHasClass("rift_idle", mode === "idle");
            }
        } catch(e) {}
    }

    QOL.register("urnTimer", {
        configKeys: ["ENABLE_URN_TIMER"],
        bucket: 0, phase: 0,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_URN_TIMER"); },
        requiresRoot: true,
        update: function(root, cfg, nowMs) {
            try { UpdateRiftTimer(root, cfg, nowMs); }
            catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " +
                    (e && e.message ? e.message : String(e)));
                throw e;
            }
        },
        stateKeys: ["riftTimerDisplayMode", "riftTimerLastText",
            "riftTimerRiftAccumulator", "riftTimerWarningGameSec",
            "riftTimerWarningActive", "riftTimerLastCapturePointCheckMs",
            "riftTimerCapturePointValid", "riftTimerRiftIsActive",
            "riftTimerLastSpawnCycleMs", "riftTimerLastMode"]
    });

    try {
        if (typeof UpdateRiftTimer !== "function") throw new Error("UpdateRiftTimer missing");
        if (typeof ResolveRiftMode !== "function") throw new Error("ResolveRiftMode missing");
        var r = ComputeRiftRangeSeconds(600, 720);
        if (r.min !== 60 || r.max !== 180) throw new Error("Range t=10:00: " + r.min + "-" + r.max);
        var r2 = ComputeRiftRangeSeconds(660, 720);
        if (r2.min !== 0 || r2.max !== 120) throw new Error("Range t=11:00: " + r2.min + "-" + r2.max);
        if (EstimateAccumulatorFromGameTime(600) !== 720) throw new Error("Accum est bad");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " +
            (e && e.message ? e.message : String(e)));
    }
})();
