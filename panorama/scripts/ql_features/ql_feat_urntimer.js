// ql_feat_urntimer.js — Urn spawn countdown timer in the top bar
// Creates a standalone #UrnTimer panel (sibling to #UrnTracker) so both
// features can be toggled independently.
(function() {
    'use strict';
    var _featureId = "ql_feat_urntimer";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "getGameSecondsForUrn", "isConnectedToHideout", "panelIdTopBar"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var GetGameSecondsForUrn = _deps.getGameSecondsForUrn;
    var IsConnectedToHideout = _deps.isConnectedToHideout;
    var PANEL_ID_TOP_BAR = _deps.panelIdTopBar;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;

    // ── Constants ──
    var URN_FIRST_SPAWN_SEC = 12 * 60;    // 720 — first urn spawn at 12:00 game time
    var URN_CYCLE_INTERVAL_SEC = 6 * 60;  // 360 — subsequent spawns every 6:00

    // ── Private helpers ──

    function FormatClockMmSs(totalSec) {
        var s = Math.max(0, Math.floor(Number(totalSec) || 0));
        var mm = Math.floor(s / 60);
        var ss = s % 60;
        return String(mm) + ":" + (ss < 10 ? "0" + ss : String(ss));
    }

    function ComputeUrnTimerRemaining(gameSec) {
        if (gameSec < URN_FIRST_SPAWN_SEC) {
            return URN_FIRST_SPAWN_SEC - gameSec;
        }
        return URN_CYCLE_INTERVAL_SEC - ((gameSec - URN_FIRST_SPAWN_SEC) % URN_CYCLE_INTERVAL_SEC);
    }

    function FindFirstPanelByClass(panel, className) {
        if (!panel || !panel.FindChildrenWithClassTraverse) return null;
        var matches = panel.FindChildrenWithClassTraverse(className) || [];
        return matches.length > 0 ? matches[0] : null;
    }

    function EnsureUrnTimerPanel(root) {
        var panel = GetCachedPanel("urnTimerPanel");
        var label = GetCachedPanel("urnTimerLabel");
        if (panel && label && label.GetParent && label.GetParent() === panel) return panel;

        panel = root ? root.FindChildTraverse("UrnTimer") : null;
        if (!panel) {
            var parent = null;
            var topBar = root ? root.FindChildTraverse(PANEL_ID_TOP_BAR) : null;
            if (topBar) {
                parent = FindFirstPanelByClass(topBar, "TeamNetworth");
            }
            if (!parent && root) {
                parent = FindFirstPanelByClass(root, "TeamNetworth");
            }
            if (!parent && topBar) {
                parent = topBar;
            }
            if (!parent) return null;
            panel = $.CreatePanel("Panel", parent, "UrnTimer", {
                "class": "UrnTimer",
                hittest: "false",
                hittestchildren: "false",
                visible: "true"
            });
        }
        if (!panel) return null;

        label = panel.FindChildTraverse("UrnTimerLabel");
        if (!label) {
            label = $.CreatePanel("Label", panel, "UrnTimerLabel", {
                "class": "UrnTimerLabel",
                text: "0:00"
            });
        }

        SetCachedPanel("urnTimerPanel", panel);
        SetCachedPanel("urnTimerLabel", label);
        return panel;
    }

    function HideUrnTimerPanel(root) {
        var panel = GetCachedPanel("urnTimerPanel");
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse("UrnTimer");
            if (IsPanelValid(panel)) {
                SetCachedPanel("urnTimerPanel", panel);
            }
        }
        if (IsPanelValid(panel)) panel.visible = false;
    }

    // ── Update ──

    function UpdateUrnTimer(root, cfg, nowMs) {
        if (!root) return;

        var enabled = IsCfgEnabled(cfg, "ENABLE_URN_TIMER");
        var inHideout = IsConnectedToHideout(root);

        if (!enabled || inHideout) {
            HideUrnTimerPanel(root);
            State.urnTimerDisplayMode = inHideout ? "hideout" : "disabled";
            State.urnTimerLastText = "";
            return;
        }

        var gameSec = GetGameSecondsForUrn(root);
        var remaining = ComputeUrnTimerRemaining(gameSec);
        var displayText = FormatClockMmSs(remaining);

        if (State.urnTimerLastText === displayText) return;

        var panel = EnsureUrnTimerPanel(root);
        var label = GetCachedPanel("urnTimerLabel");
        if (!panel || !label) return;

        label.text = displayText;
        State.urnTimerLastText = displayText;
        State.urnTimerDisplayMode = "active";
        panel.visible = true;
    }

    // ── Registration ──

    QOL.register("urnTimer", {
        configKeys: ["ENABLE_URN_TIMER"],
        bucket: 0,
        phase: 0,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_URN_TIMER");
        },
        requiresRoot: true,
        update: function(root, cfg, nowMs) {
            try {
                UpdateUrnTimer(root, cfg, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["urnTimerDisplayMode", "urnTimerLastText"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateUrnTimer !== "function") throw new Error("UpdateUrnTimer missing");
        if (typeof EnsureUrnTimerPanel !== "function") throw new Error("EnsureUrnTimerPanel missing");
        if (typeof ComputeUrnTimerRemaining !== "function") throw new Error("ComputeUrnTimerRemaining missing");
        if (typeof FormatClockMmSs !== "function") throw new Error("FormatClockMmSs missing");
        if (ComputeUrnTimerRemaining(0) !== URN_FIRST_SPAWN_SEC) throw new Error("Timer math failed at t=0");
        if (ComputeUrnTimerRemaining(URN_FIRST_SPAWN_SEC) !== URN_CYCLE_INTERVAL_SEC) throw new Error("Timer math failed at first spawn");
        if (ComputeUrnTimerRemaining(URN_FIRST_SPAWN_SEC + URN_CYCLE_INTERVAL_SEC) !== URN_CYCLE_INTERVAL_SEC) throw new Error("Timer math failed at second spawn");
        if (ComputeUrnTimerRemaining(URN_FIRST_SPAWN_SEC + 1) !== URN_CYCLE_INTERVAL_SEC - 1) throw new Error("Timer math failed mid-cycle");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();
