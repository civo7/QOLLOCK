// features/ql_showrank/manifest.js
// =============================================================================
// QOLLOCK — Show Rank (rank prediction badges on top bar + escape menu)
// =============================================================================
// OWNS:        Rank badge display, API fetching, top bar + player list badges
// DOES NOT OWN: Profile card context (ql_feat_showrank_card.js — permanent exception)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL delegates
// CONFIG KEYS: SHOW_RANK, SHOW_RANK_TOPBAR
// PATTERN:     Polling (10Hz). Scans top bar player panels, escape menu.
// STATE KEYS:  _showRankTopBarVisible, _showRankEnabled, showRankEscapeDone
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] showrank: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_showrank",
        enableKey: "SHOW_RANK",
        enabledByDefault: false,
        settings: [
            { key: "SHOW_RANK", type: "toggle", default: false },
            { key: "SHOW_RANK_TOPBAR", type: "toggle", default: true }
        ],
        create: function(ctx) {
            var RANK0 = "s2r://panorama/images/ranked/badges/rank0/badge_sm_psd.vtex";
            var API_URL = "https://api.deadlock-api.com/v1/players/";
            var HIDEOUT_CLASSES = ["InHideout","inHideoutIntro","connectedToHideout","connectedtoHideout","connectedtohideout"];
            var _loop = null, _wasEnabled = false, _escapeDone = false;
            var _topBarInitDone = false, _srCache = {}, _srFillTimer = 0;

            // ── QOL delegates ──
            function _nowMs() { try { return Date.now ? Date.now() : 0; } catch(e) { return 0; } }
            function _valid(p) { if (!p) return false; try { return p.IsValid ? p.IsValid() : true; } catch(e) { return false; } }
            function _isOn(cfg, k) { return Number(cfg[k]) === 1; }
            function _hasAnyClass(panel, classes) { if (!_valid(panel)) return false; for (var i = 0; i < classes.length; i++) { try { if (panel.BHasClass(classes[i])) return true; } catch(e) {} } return false; }
            function _hudPanel(root) { try { return root.FindChildTraverse("Hud"); } catch(e) { return null; } }
            function _isInHideout(root) { var h = _hudPanel(root); return _hasAnyClass(h, HIDEOUT_CLASSES) || _hasAnyClass(root, HIDEOUT_CLASSES); }
            function _stateGet(k, d) { try { if (typeof QOL !== "undefined" && QOL.state) { var v = QOL.state[k]; return v !== undefined ? v : d; } } catch(e) {} return d; }
            function _stateSet(k, v) { try { if (typeof QOL !== "undefined" && QOL.state) QOL.state[k] = v; } catch(e) {} }

            function _setBadgeVisible(badge, visible) {
                if (!_valid(badge)) return;
                try { if (visible) badge.AddClass("ShowRankVisible"); else badge.RemoveClass("ShowRankVisible"); } catch(e) {}
            }

            // ── Top bar player scanning (mirrors old FindAllTopBarPlayers) ──
            function _findTopBarPlayers(topBar) {
                var out = [];
                if (!_valid(topBar)) return out;
                try {
                    for (var i = 0; i < topBar.GetChildCount() && i < 50; i++) {
                        var child = topBar.GetChild(i);
                        if (!_valid(child)) continue;
                        try { if (child.BHasClass && (child.BHasClass("TopBarPlayer") || child.BHasClass("player_N"))) out.push(child); } catch(e) {}
                    }
                } catch(e) {}
                return out;
            }

            function _applyTopBarVisibility(root, visible) {
                try {
                    var topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null;
                    if (!_valid(topBar)) return;
                    var players = _findTopBarPlayers(topBar);
                    for (var i = 0; i < players.length; i++) {
                        var base = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBar") : null;
                        var ov = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                        _setBadgeVisible(base, visible); _setBadgeVisible(ov, visible);
                    }
                } catch(e) {}
            }

            // ── Escape menu player list ──
            function _getPlayersList(root) {
                var esc = null; try { esc = root.FindChildTraverse("CitadelHudEscapeMenu"); } catch(e) {}
                var start = _valid(esc) ? esc : root;
                try { return start.FindChildTraverse("PlayersList"); } catch(e) { return null; }
            }

            function _findAllEntries(root) {
                var out = [], playersList = _getPlayersList(root);
                if (!_valid(playersList)) return out;
                try { for (var i = 0; i < playersList.GetChildCount() && i < 200; i++) out.push(playersList.GetChild(i)); } catch(e) {}
                return out;
            }

            function _applyPlayerListVisibility(root, visible) {
                var entries = _findAllEntries(root);
                for (var i = 0; i < entries.length; i++) {
                    var base = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadge") : null;
                    var ov = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
                    _setBadgeVisible(base, visible); _setBadgeVisible(ov, visible);
                }
            }

            function _clearTopBarBadges(root) { _applyTopBarVisibility(root, false); }
            function _clearPlayerListBadges(root) { _applyPlayerListVisibility(root, false); }

            // ── Top bar player init (mirrors old _InitTopBarPlayer) ──
            function _ensureTopBarPlayersInit(root) {
                if (_topBarInitDone) return;
                try {
                    var topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null;
                    if (!_valid(topBar)) return;
                    var players = _findTopBarPlayers(topBar);
                    var allDone = players.length > 0;
                    for (var i = 0; i < players.length; i++) {
                        var p = players[i];
                        try {
                            var base = p.FindChildTraverse ? p.FindChildTraverse("RankPredictionBadgeTopBar") : null;
                            if (!_valid(base)) allDone = false;
                            var ov = p.FindChildTraverse ? p.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                            if (!_valid(ov)) allDone = false;
                            // Set default rank 0 image if not loaded
                            if (_valid(base)) { try { if (!base.BHasClass || !base.BHasClass("loaded")) { base.SetImage(RANK0); if (base.AddClass) base.AddClass("loaded"); } } catch(e) {} }
                            if (_valid(ov)) { try { if (!ov.BHasClass || !ov.BHasClass("loaded")) { ov.SetImage(RANK0); if (ov.AddClass) ov.AddClass("loaded"); } } catch(e) {} }
                        } catch(e) {}
                    }
                    if (allDone) _topBarInitDone = true;
                } catch(e) {}
            }

            // ── Main tick ──
            function _tick() {
                try {
                    var root = $.GetContextPanel(); if (!root) return;
                    var cfg = ctx.config.all(); var now = _nowMs();

                    if (!_isOn(cfg, "SHOW_RANK")) {
                        if (_wasEnabled) { _clearTopBarBadges(root); _clearPlayerListBadges(root); _wasEnabled = false; _topBarInitDone = false; _escapeDone = false; _stateSet("_showRankEnabled", false); }
                        return;
                    }
                    _wasEnabled = true; _stateSet("_showRankEnabled", true);

                    if (_isInHideout(root)) return;
                    _ensureTopBarPlayersInit(root);

                    var showTopBar = _isOn(cfg, "SHOW_RANK_TOPBAR");
                    _applyTopBarVisibility(root, showTopBar);
                    _stateSet("_showRankTopBarVisible", showTopBar);

                    // Escape menu — only scan when it might be open
                    var esc = null; try { esc = root.FindChildTraverse("CitadelHudEscapeMenu"); } catch(e) {}
                    var escOpen = _valid(esc);
                    if (escOpen && !_escapeDone && now >= _srFillTimer) {
                        _applyPlayerListVisibility(root, true);
                        _escapeDone = true;
                        _stateSet("showRankEscapeDone", true);
                        _srFillTimer = now + 5000;
                    }
                    if (!escOpen && _escapeDone) {
                        _clearPlayerListBadges(root);
                        _escapeDone = false;
                        _stateSet("showRankEscapeDone", false);
                    }
                } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_showrank", "_tick: " + (e.message || e));
                    }
                }
            }

            return {
                onEnable: function() {
                    _topBarInitDone = false; _escapeDone = false;
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.1, "ql_showrank") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var root = $.GetContextPanel();
                    _clearTopBarBadges(root); _clearPlayerListBadges(root);
                    _wasEnabled = false; _topBarInitDone = false; _escapeDone = false;
                    _stateSet("_showRankEnabled", false); _stateSet("_showRankTopBarVisible", false);
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
