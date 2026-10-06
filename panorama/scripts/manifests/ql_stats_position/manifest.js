// manifests/ql_stats_position/manifest.js
// =============================================================================
// QOLLOCK — Stats Position (Move/Hide Active & Detailed Player Stats)
// =============================================================================
// OWNS:        Positioning and visibility of the visible native stats owner
//              (current #hudActivePlayerStats, legacy #hudPlayerStats).
// DOES NOT OWN: CitadelHudActivePlayerStats content, modifier data stream.
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL.core.Hud,
//              QOL.presentation.chooseStatsPanel (shared with Customize)
// CONFIG KEYS: ENABLE_STATS_POSITION, STATS_POSITION_SIDE,
//              STATS_POSITION_X_OFFSET, STATS_POSITION_Y_OFFSET,
//              STATS_POSITION_HIDE_NORMAL, STATS_POSITION_HIDE_SCOREBOARD
// CSS:         QolStatsRight
// PATTERN:     Polling (20Hz, 0.05s). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_stats_position: FeatureRegistry not found — aborting");
        return;
    }

    var CLASS_RIGHT = "QolStatsRight";

    var isPanelValid = QOL.utils.IsPanelValid;

    function resetStatsPanel(panel) {
        if (!isPanelValid(panel)) return;
        try { panel.RemoveClass(CLASS_RIGHT); } catch(e) {}
        if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.ClearStyleSafe) {
            QOL_UTILS.ClearStyleSafe(panel, "x");
            QOL_UTILS.ClearStyleSafe(panel, "y");
            QOL_UTILS.ClearStyleSafe(panel, "opacity");
        } else {
            try { panel.style.x = "0px"; } catch(e) {}
            try { panel.style.y = "0px"; } catch(e) {}
            try { panel.style.opacity = "1"; } catch(e) {}
        }
    }

    function hasStatsPositionWork(cfg) {
        if (!cfg) return false;
        var enabled = (cfg.ENABLE_STATS_POSITION === undefined || cfg.ENABLE_STATS_POSITION === true || Number(cfg.ENABLE_STATS_POSITION) === 1);
        if (!enabled) return false;
        var side = (Math.round(Number(cfg.STATS_POSITION_SIDE)) === 1) ? 1 : 0;
        var offX = Number(cfg.STATS_POSITION_X_OFFSET) || 0;
        var offY = Number(cfg.STATS_POSITION_Y_OFFSET) || 0;
        var hideNormal = Number(cfg.STATS_POSITION_HIDE_NORMAL) === 1;
        var hideScoreboard = Number(cfg.STATS_POSITION_HIDE_SCOREBOARD) === 1;
        return side === 1 || offX !== 0 || offY !== 0 || hideNormal || hideScoreboard;
    }

    FR.register({
        id: "ql_stats_position",
        enabledByDefault: true,
        enableKey: "ENABLE_STATS_POSITION",
        settings: [
            { key: "ENABLE_STATS_POSITION", type: "toggle", default: true },
            { key: "STATS_POSITION_SIDE", type: "buttongroup", default: 0 },
            { key: "STATS_POSITION_X_OFFSET", type: "number", default: 0 },
            { key: "STATS_POSITION_Y_OFFSET", type: "number", default: 0 },
            { key: "STATS_POSITION_HIDE_NORMAL", type: "toggle", default: false },
            { key: "STATS_POSITION_HIDE_SCOREBOARD", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var _panel = null;
            var _sig = "";
            var _applied = false;

            function _getStatsPanel(root) {
                const legacy = QOL.core.panel.findTraverse(root, "hudPlayerStats");
                const active = QOL.core.panel.findTraverse(root, "hudActivePlayerStats");
                const current = QOL.presentation.chooseStatsPanel(legacy, active);
                if (current !== _panel) {
                    if (isPanelValid(_panel)) resetStatsPanel(_panel);
                    _panel = current;
                    _sig = "";
                    _applied = false;
                }
                return _panel;
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!root) return;

                var cfg = ctx.config.view();
                var panel = _getStatsPanel(root);

                if (!panel) {
                    _sig = "";
                    _applied = false;
                    return;
                }

                if (!hasStatsPositionWork(cfg)) {
                    if (_applied) {
                        resetStatsPanel(panel);
                    }
                    _sig = "";
                    _applied = false;
                    return;
                }

                var scoreboardOpen = QOL.core.hud.isScoreboardOpen(root);
                var hidden = scoreboardOpen
                    ? (Number(cfg.STATS_POSITION_HIDE_SCOREBOARD) === 1)
                    : (Number(cfg.STATS_POSITION_HIDE_NORMAL) === 1);

                var side = (Math.round(Number(cfg.STATS_POSITION_SIDE)) === 1) ? 1 : 0;
                var rawX = Math.round(Number(cfg.STATS_POSITION_X_OFFSET) || 0);
                var rawY = Math.round(Number(cfg.STATS_POSITION_Y_OFFSET) || 0);
                var offX = Math.max(-2000, Math.min(2000, rawX));
                var offY = Math.max(-2000, Math.min(2000, rawY));

                var sig = hidden ? "hidden" : ("show|" + side + "|" + offX + "|" + offY);
                if (_applied && _sig === sig) return;

                if (hidden) {
                    try { panel.style.opacity = "0"; } catch(e) {}
                } else {
                    try { panel.style.opacity = "1"; } catch(e) {}
                    try { panel.SetHasClass(CLASS_RIGHT, side === 1); } catch(e) {}
                    try { panel.style.x = String(offX) + "px"; } catch(e) {}
                    try { panel.style.y = String(-offY) + "px"; } catch(e) {}
                }

                _sig = sig;
                _applied = true;
            }

            var _currentRate = 0;

            function _onScoreboardToggle() {
                QOL.core.Scheduler.scheduleOnce(_tick, 0, ctx.id);
            }

            function _determineOptimalRate() {
                return 1.0; // 1Hz idle baseline; reactive via engine:scoreboard_toggle
            }

            function _syncLoop(cfg) {
                var targetRate = _determineOptimalRate(cfg);
                if (_loop && _currentRate !== targetRate) {
                    _loop.stop();
                    _loop = null;
                }
                if (!_loop) {
                    var S = QOL.core.Scheduler;
                    _currentRate = targetRate;
                    _loop = (S && S.createPollLoop) ? S.createPollLoop(_tick, targetRate, "ql_stats_position") : null;
                }
            }

            return {
                onEnable: function() {
                    if (ctx && ctx.events && typeof ctx.events.on === "function") {
                        ctx.events.on("engine:scoreboard_toggle", _onScoreboardToggle);
                    }
                    _syncLoop(ctx.config.view());
                    _tick();
                },
                onDisable: function() {
                    if (ctx && ctx.events && typeof ctx.events.off === "function") {
                        ctx.events.off("engine:scoreboard_toggle", _onScoreboardToggle);
                    }
                    if (_loop) {
                        _loop.stop();
                        _loop = null;
                    }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_stats_position");

                    if (isPanelValid(_panel)) {
                        resetStatsPanel(_panel);
                    }
                    _panel = null;
                    _sig = "";
                    _applied = false;
                    _currentRate = 0;
                },
                onSettingsChanged: function() {
                    _sig = "";
                    _syncLoop(ctx.config.view());
                    _tick();
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                const panel = QOL.presentation.chooseStatsPanel(
                    QOL.core.panel.findTraverse(root, "hudPlayerStats"),
                    QOL.core.panel.findTraverse(root, "hudActivePlayerStats"));
                return {
                    passed: !!panel,
                    name: "Player stats panel exists",
                    message: panel ? "" : "Native player stats owner not found",
                    assertions: [{ passed: !!panel, name: "Native player stats owner exists" }]
                };
            } catch(e) {
                return {
                    passed: false,
                    name: "Player stats panel check",
                    message: (e && e.message ? e.message : String(e))
                };
            }
        }
    });
})();
