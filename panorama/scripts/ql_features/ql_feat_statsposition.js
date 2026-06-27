// ql_feat_statsposition.js — Player Stats (move/hide the active/detailed stats panel)
// New feature (3.1.7): repositions and/or hides the game's #hudPlayerStats panel — the bottom-left
// active modifiers block that ALSO shows the full detailed list while the scoreboard/TAB is held.
// The player can pin it left (default, like vanilla) or right with X/Y offsets, and independently
// hide the normal (compact) view and/or the scoreboard/TAB view. Because both views are the SAME
// panel, hide is decided per-frame from the gScoreboardOpen state. Hiding uses opacity:0 (NOT
// visibility:collapse): the game re-asserts visibility every frame, and collapsing would also break
// the Crosshair Active Stats mirror, which reads its modifiers from this panel. opacity:0 sticks
// and keeps the panel readable. Enabled by default; default Left/0/0/no-hide is vanilla (no-op).
(function() {
    'use strict';
    var _featureId = "ql_feat_statsposition";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel", "isHudClassActive"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var IsHudClassActive = _deps.isHudClassActive;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;

    function EnsureState() {
        if (!State.statsPosition) {
            State.statsPosition = { sig: "", applied: false, panel: null };
        }
        return State.statsPosition;
    }

    // CSS class that flips the panel from its vanilla left dock to a true right dock — it
    // right-aligns the wrapper AND its internal rows (see ql_feat_stats_position.css). Toggling a
    // class (instead of an inline horizontal-align) is what makes the block actually hug the right
    // wall rather than just translate; the inner miniModifier rows stay left-anchored otherwise.
    var CLASS_RIGHT = "QolStatsRight";

    // #hudPlayerStats is the CitadelHudActivePlayerStats wrapper (bottom-left in vanilla).
    function GetStatsPanel(root) {
        var panel = GetCachedPanel("statsPositionPanel");
        if (IsPanelValid(panel)) return panel;
        panel = (root && root.FindChildTraverse) ? root.FindChildTraverse("hudPlayerStats") : null;
        SetCachedPanel("statsPositionPanel", panel);
        return panel;
    }

    // Restore the panel to its CSS default (bottom-left, no inline offset, no right-dock class,
    // fully opaque).
    function ResetStatsPanel(panel) {
        if (!IsPanelValid(panel)) return;
        try { panel.RemoveClass(CLASS_RIGHT); } catch(e0) {}
        try { panel.style.x = "0px"; } catch(e1) {}
        try { panel.style.y = "0px"; } catch(e2) {}
        Utils.SetPanelOpacitySafe(panel, 1, 1);
    }

    // True only when the feature has actual work to do: enabled AND not the vanilla default
    // (left / 0 / 0, both hides off). The default config is a visual no-op, so we treat it like
    // "off" — that's what keeps the feature OUT of the dispatch loop for the vast majority of
    // players who never touch it (the gate below returns false), instead of running it ~20Hz for
    // nothing. A hide toggle being on DOES count as work (and makes the loop run every tick so it
    // can react to the scoreboard opening/closing).
    function HasStatsPositionWork(cfg) {
        if (!IsCfgEnabled(cfg, "ENABLE_STATS_POSITION")) return false;
        var side = (Math.round(Number(cfg.STATS_POSITION_SIDE)) === 1) ? 1 : 0;
        var offX = Number(cfg.STATS_POSITION_X_OFFSET) || 0;
        var offY = Number(cfg.STATS_POSITION_Y_OFFSET) || 0;
        var hideNormal = IsCfgEnabled(cfg, "STATS_POSITION_HIDE_NORMAL");
        var hideScoreboard = IsCfgEnabled(cfg, "STATS_POSITION_HIDE_SCOREBOARD");
        return side === 1 || offX !== 0 || offY !== 0 || hideNormal || hideScoreboard;
    }

    function UpdateStatsPosition(root, cfg) {
        var st = EnsureState();
        var panel = GetStatsPanel(root);

        // If the cached panel was swapped (HUD rebuilt), clear styling on the previous one.
        var prev = IsPanelValid(st.panel) ? st.panel : null;
        if (prev && prev !== panel) ResetStatsPanel(prev);

        if (!panel) {
            st.sig = ""; st.applied = false; st.panel = null;
            return;
        }

        // Disabled OR back at the vanilla default: undo our styling exactly once, then go idle.
        // Resetting whenever there's no work (not only when st.applied) makes disable robust even
        // if the applied flag ever drifts out of sync with what's on the panel.
        if (!HasStatsPositionWork(cfg)) {
            if (st.applied) {
                ResetStatsPanel(panel);
            }
            st.sig = ""; st.applied = false; st.panel = null;
            return;
        }

        // #hudPlayerStats is the SAME panel for the compact bottom-left view and the detailed list
        // shown while the scoreboard/TAB is held — the game expands it under the gScoreboardOpen
        // class. So "hide" is per-view: pick the right toggle for the current scoreboard state.
        var scoreboardOpen = !!(IsHudClassActive && IsHudClassActive(root, "gScoreboardOpen"));
        var hidden = scoreboardOpen
            ? IsCfgEnabled(cfg, "STATS_POSITION_HIDE_SCOREBOARD")
            : IsCfgEnabled(cfg, "STATS_POSITION_HIDE_NORMAL");

        var side = (Math.round(Number(cfg.STATS_POSITION_SIDE)) === 1) ? 1 : 0;
        var offX = Utils.ClampConfigNumber(cfg.STATS_POSITION_X_OFFSET, 0, -500, 500, true);
        var offY = Utils.ClampConfigNumber(cfg.STATS_POSITION_Y_OFFSET, 0, -500, 500, true);

        var sig = hidden ? "hidden" : ("show|" + side + "|" + offX + "|" + offY);
        if (st.applied && st.panel === panel && st.sig === sig) return;

        if (hidden) {
            // Hide via opacity, NOT visibility:collapse — the game re-asserts visibility every
            // frame (via .player_selected), and collapsing would also stop the Crosshair Active
            // Stats mirror from reading this panel. opacity:0 sticks (the game never sets opacity
            // on the root) and keeps the modifier containers/classes/text alive for the mirror.
            Utils.SetPanelOpacitySafe(panel, 0, 0);
        } else {
            Utils.SetPanelOpacitySafe(panel, 1, 1);
            // Right dock: add the class so CSS right-aligns the wrapper and its inner rows. Left
            // dock (default): remove it and let the vanilla left-align CSS apply.
            try { panel.SetHasClass(CLASS_RIGHT, side === 1); } catch(e0) {}
            // style.x/style.y translate in screen space regardless of align: +X moves right, +Y
            // raises (negated, matching the Damage Report / Chat offset convention used elsewhere).
            try { panel.style.x = String(offX) + "px"; } catch(e1) {}
            try { panel.style.y = String(-offY) + "px"; } catch(e2) {}
        }

        st.sig = sig; st.applied = true; st.panel = panel;
    }

    // ── Registration ──
    QOL.register("statsPosition", {
        configKeys: [
            "ENABLE_STATS_POSITION",
            "STATS_POSITION_SIDE",
            "STATS_POSITION_X_OFFSET",
            "STATS_POSITION_Y_OFFSET",
            "STATS_POSITION_HIDE_NORMAL",
            "STATS_POSITION_HIDE_SCOREBOARD"
        ],
        bucket: 6, phase: -1,
        requiresRoot: true,
        gate: function(cfg) {
            // Only dispatch when there's real work, or while we still owe a one-shot cleanup
            // after the user turned it off / reverted to default. Default config => never runs.
            return HasStatsPositionWork(cfg) ||
                   !!(State.statsPosition && State.statsPosition.applied);
        },
        update: function(root, cfg, nowMs) {
            try { UpdateStatsPosition(root, cfg); }
            catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + e.message + "\n" + e.stack);
                throw e;
            }
        },
        stateKeys: ["statsPosition"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateStatsPosition !== "function") throw new Error("UpdateStatsPosition is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
