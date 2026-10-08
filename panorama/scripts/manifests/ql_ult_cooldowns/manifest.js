// features/ql_ult_cooldowns/manifest.js
// =============================================================================
// QOLLOCK — Top Bar Ultimate Cooldowns
// =============================================================================
// OWNS:        Top bar ultimate cooldown numeric readout sync.
//              Mirrors hidden UltimateCooldownTextHidden label to UltimateCooldownTextShown.
// DOES NOT OWN: StatusRow (Valve), UltimateStatus (Valve)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL.ui.PanelHelpers
// CONFIG KEYS: ENABLE_ULT_COOLDOWNS (toggle)
// PATTERN:     Polling (4Hz / 0.25s). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ult_cooldowns: FeatureRegistry not found — aborting"); return; }

    var FEATURE_ID = "ql_ult_cooldowns";
    var CLASS_NAME = "ult_cooldowns_active";
    var POLL_INTERVAL = 0.25;

    FR.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_ULT_COOLDOWNS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_ULT_COOLDOWNS", type: "toggle" }
        ],
        create: function(ctx) {
            var _loop = null;
            var _topBar = null;
            var _playerContainersCache = null;
            var _cachedSlots = []; // array of { playerPanel, hidden, shown }
            var _expectedPlayerCount = 0;
            var _tickCounter = 0;
            var _running = false;

            var _isAlive = QOL.utils.IsPanelValid;

            function _getTopBar() {
                if (_isAlive(_topBar)) return _topBar;
                _topBar = null;
                _playerContainersCache = null;
                var hud = (typeof QOL !== "undefined" && QOL.core && QOL.core.panel && QOL.core.panel.findHud)
                    ? QOL.core.panel.findHud()
                    : ((typeof QOL !== "undefined" && QOL.ui && QOL.ui.PanelHelpers && QOL.ui.PanelHelpers.findHud)
                        ? QOL.ui.PanelHelpers.findHud()
                        : null);
                if (!hud || !_isAlive(hud)) return null;
                _topBar = hud.FindChildTraverse ? (hud.FindChildTraverse("TopBar") || hud.FindChildTraverse("CitadelHudTopBar")) : null;
                return _topBar;
            }

            function _getPlayerContainers(topBar) {
                if (!_isAlive(topBar)) return [];
                if (_playerContainersCache) {
                    var good = _playerContainersCache.length > 0;
                    for (var c = 0; good && c < _playerContainersCache.length; c++) {
                        if (!_isAlive(_playerContainersCache[c])) good = false;
                    }
                    if (good) return _playerContainersCache;
                    _playerContainersCache = null;
                }
                var out = [];
                var tc = topBar.FindChildTraverse ? topBar.FindChildTraverse("TeamsContainer") : null;
                if (_isAlive(tc)) {
                    var tcc = tc.GetChildCount ? tc.GetChildCount() : 0;
                    for (var ti = 0; ti < tcc && ti < 4; ti++) {
                        var team = tc.GetChild(ti);
                        if (!_isAlive(team)) continue;
                        var pc = team.FindChildTraverse ? team.FindChildTraverse("PlayerContents") : null;
                        if (!_isAlive(pc)) continue;
                        var pl = pc.FindChildTraverse ? pc.FindChildTraverse("PlayersContainer") : null;
                        if (!_isAlive(pl)) continue;
                        out.push(pl);
                    }
                }
                if (out.length > 0) _playerContainersCache = out;
                return out;
            }

            function _resolvePlayerPanels(topBar) {
                var list = [];
                if (!_isAlive(topBar)) return list;

                var containers = _getPlayerContainers(topBar);
                for (var ci = 0; ci < containers.length; ci++) {
                    var pl = containers[ci];
                    var plc = 0;
                    try { plc = pl.GetChildCount ? pl.GetChildCount() : 0; } catch(_) { plc = 0; }
                    for (var pi = 0; pi < plc && pi < 12; pi++) {
                        var player = null;
                        try { player = pl.GetChild(pi); } catch(_) { player = null; }
                        if (_isAlive(player) && list.indexOf(player) === -1) {
                            list.push(player);
                        }
                    }
                }

                if (list.length === 0) {
                    // Sandbox / hero testing fallback
                    for (var i = 0; i <= 12; i++) {
                        var p = topBar.FindChildTraverse("TopBarPlayer" + i);
                        if (_isAlive(p) && list.indexOf(p) === -1) {
                            list.push(p);
                        }
                    }
                }
                return list;
            }

            function _syncSlots() {
                var topBar = _getTopBar();
                if (!_isAlive(topBar)) return;

                topBar.SetHasClass(CLASS_NAME, true);
                var root = $.GetContextPanel();
                if (root && root.SetHasClass) root.SetHasClass(CLASS_NAME, true);

                var playerPanels = _resolvePlayerPanels(topBar);
                var validSlots = [];

                for (var i = 0; i < playerPanels.length; i++) {
                    var playerPanel = playerPanels[i];
                    if (!_isAlive(playerPanel)) continue;

                    if (playerPanel.SetHasClass) {
                        playerPanel.SetHasClass(CLASS_NAME, true);
                    }

                    var hidden = playerPanel.FindChildTraverse("UltimateCooldownTextHidden");
                    var shown = playerPanel.FindChildTraverse("UltimateCooldownTextShown");
                    if (!_isAlive(hidden) || !_isAlive(shown)) continue;

                    validSlots.push({ playerPanel: playerPanel, hidden: hidden, shown: shown });

                    var rawText = hidden.text;
                    if (rawText !== undefined && rawText !== null) {
                        var cdStr = String(rawText).trim();
                        if (cdStr !== "" && cdStr !== "0") {
                            if (shown.text !== cdStr) {
                                shown.text = cdStr;
                            }
                        } else {
                            if (shown.text !== "") {
                                shown.text = "";
                            }
                        }
                    }
                }

                _cachedSlots = validSlots;
                _expectedPlayerCount = playerPanels.length;
            }

            function _tick() {
                if (!_running) return;

                var topBar = _getTopBar();
                if (!_isAlive(topBar) || (topBar.BHasClass && topBar.BHasClass("InHideout"))) {
                    return;
                }

                _tickCounter++;

                // Quick pass if cached slots are all alive
                var allAlive = _cachedSlots.length > 0;
                for (var s = 0; s < _cachedSlots.length; s++) {
                    var slot = _cachedSlots[s];
                    if (!slot || !_isAlive(slot.playerPanel) || !_isAlive(slot.hidden) || !_isAlive(slot.shown)) {
                        allAlive = false;
                        break;
                    }
                }

                var containerCountChanged = false;
                var containers = _getPlayerContainers(topBar);
                if (containers.length > 0) {
                    var totalChildren = 0;
                    for (var c = 0; c < containers.length; c++) {
                        var cnt = containers[c];
                        if (_isAlive(cnt) && cnt.GetChildCount) {
                            totalChildren += cnt.GetChildCount();
                        }
                    }
                    if (totalChildren !== _expectedPlayerCount || totalChildren !== _cachedSlots.length) {
                        containerCountChanged = true;
                    }
                }

                var needsPeriodicResync = (_tickCounter >= 8) || (_cachedSlots.length < _expectedPlayerCount);

                if (!allAlive || containerCountChanged || needsPeriodicResync) {
                    _tickCounter = 0;
                    _syncSlots();
                    return;
                }

                for (var i = 0; i < _cachedSlots.length; i++) {
                    var cur = _cachedSlots[i];
                    var raw = cur.hidden.text;
                    if (raw !== undefined && raw !== null) {
                        var cd = String(raw).trim();
                        if (cd !== "" && cd !== "0") {
                            if (cur.shown.text !== cd) {
                                cur.shown.text = cd;
                            }
                        } else {
                            if (cur.shown.text !== "") {
                                cur.shown.text = "";
                            }
                        }
                    }
                }
            }

            function _start() {
                if (_running) return;
                _running = true;
                try {
                    _syncSlots();
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, POLL_INTERVAL, FEATURE_ID) : null;
                } catch(e) {
                    $.Msg("[QOLLock][ERROR][" + FEATURE_ID + "] _start: " + (e && e.message ? e.message : String(e)));
                }
            }

            function _stop() {
                _running = false;
                try {
                    if (_loop) {
                        _loop.stop();
                        _loop = null;
                    }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature(FEATURE_ID);

                    if (_isAlive(_topBar)) {
                        _topBar.SetHasClass(CLASS_NAME, false);
                    }
                    var root = $.GetContextPanel();
                    if (root && root.SetHasClass) root.SetHasClass(CLASS_NAME, false);

                    for (var i = 0; i < _cachedSlots.length; i++) {
                        var s = _cachedSlots[i];
                        if (s && _isAlive(s.playerPanel) && s.playerPanel.SetHasClass) {
                            s.playerPanel.SetHasClass(CLASS_NAME, false);
                        }
                    }
                    _topBar = null;
                    _playerContainersCache = null;
                    _cachedSlots = [];
                    _expectedPlayerCount = 0;
                    _tickCounter = 0;
                } catch(e) {
                    $.Msg("[QOLLock][ERROR][" + FEATURE_ID + "] _stop: " + (e && e.message ? e.message : String(e)));
                }
            }

            return {
                onEnable: function() {
                    _start();
                },
                onDisable: function() {
                    _stop();
                },
                onSettingsChanged: function(payload) {
                    var enabled = false;
                    if (payload && payload.changes && payload.changes.hasOwnProperty("ENABLE_ULT_COOLDOWNS")) {
                        enabled = Number(payload.changes.ENABLE_ULT_COOLDOWNS) === 1 || payload.changes.ENABLE_ULT_COOLDOWNS === true;
                    } else if (ctx && ctx.config) {
                        enabled = Number(ctx.config.get("ENABLE_ULT_COOLDOWNS")) === 1 || ctx.config.get("ENABLE_ULT_COOLDOWNS") === true;
                    }
                    if (enabled) {
                        _start();
                    } else {
                        _stop();
                    }
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var topBar = root ? (root.FindChildTraverse("TopBar") || root.FindChildTraverse("CitadelHudTopBar")) : null;
                return {
                    passed: !!topBar,
                    name: "Ult cooldown top bar check",
                    message: topBar ? "TopBar exists" : "TopBar not found",
                    assertions: [{ passed: !!topBar, name: "TopBar exists" }]
                };
            } catch(e) {
                return { passed: false, name: "Ult cooldown test", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();
