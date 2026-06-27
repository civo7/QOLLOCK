// ql_feat_statsposition.js — Player Stats Position (move the active/detailed stats panel)
// New feature (3.1.7): repositions the game's #hudPlayerStats panel — the bottom-left active
// modifiers block that ALSO shows the full detailed list while the scoreboard/TAB is held — so the
// player can pin it to the left (default, like vanilla) or right side and nudge it with X/Y
// offsets. Because both the compact view and the TAB-detailed view are the same panel, moving it
// once covers both. Enabled by default; default Left/0/0 is identical to vanilla (no-op).
(function() {
    'use strict';
    var _featureId = "ql_feat_statsposition";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
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

    // Restore the panel to its CSS default (bottom-left, no inline offset, no right-dock class).
    function ResetStatsPanel(panel) {
        if (!IsPanelValid(panel)) return;
        try { panel.RemoveClass(CLASS_RIGHT); } catch(e0) {}
        try { panel.style.x = "0px"; } catch(e1) {}
        try { panel.style.y = "0px"; } catch(e2) {}
    }

    // True only when the feature has actual repositioning to do: enabled AND not the vanilla
    // default (left / 0 / 0). The default config is a visual no-op, so we treat it like "off" —
    // that's what keeps the feature OUT of the dispatch loop for the vast majority of players who
    // never touch it (the gate below returns false), instead of running it ~20Hz for nothing.
    function HasStatsPositionWork(cfg) {
        if (!IsCfgEnabled(cfg, "ENABLE_STATS_POSITION")) return false;
        var side = (Math.round(Number(cfg.STATS_POSITION_SIDE)) === 1) ? 1 : 0;
        var offX = Number(cfg.STATS_POSITION_X_OFFSET) || 0;
        var offY = Number(cfg.STATS_POSITION_Y_OFFSET) || 0;
        return side === 1 || offX !== 0 || offY !== 0;
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

        var side = (Math.round(Number(cfg.STATS_POSITION_SIDE)) === 1) ? 1 : 0;
        var offX = Utils.ClampConfigNumber(cfg.STATS_POSITION_X_OFFSET, 0, -500, 500, true);
        var offY = Utils.ClampConfigNumber(cfg.STATS_POSITION_Y_OFFSET, 0, -500, 500, true);

        var sig = side + "|" + offX + "|" + offY;
        if (st.applied && st.panel === panel && st.sig === sig) return;

        // Right dock: add the class so CSS right-aligns the wrapper and its inner rows. Left dock
        // (default): remove it and let the vanilla left-align CSS apply.
        try { panel.SetHasClass(CLASS_RIGHT, side === 1); } catch(e0) {}
        // style.x/style.y translate in screen space regardless of align: +X moves right, +Y raises
        // (negated, matching the Damage Report / Chat offset convention used elsewhere in the mod).
        try { panel.style.x = String(offX) + "px"; } catch(e1) {}
        try { panel.style.y = String(-offY) + "px"; } catch(e2) {}

        st.sig = sig; st.applied = true; st.panel = panel;
    }

    // ── Registration ──
    QOL.register("statsPosition", {
        configKeys: [
            "ENABLE_STATS_POSITION",
            "STATS_POSITION_SIDE",
            "STATS_POSITION_X_OFFSET",
            "STATS_POSITION_Y_OFFSET"
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
