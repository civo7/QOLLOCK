// features/ql_spm/manifest.js
// =============================================================================
// QOLLOCK — Souls Per Minute (SPM) Display
// =============================================================================
// OWNS:        SPM calculation and display on top bar player/team panels
// DOES NOT OWN: Soul values (read from game labels), top bar layout
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_MIN_SOULS (toggle)
// PATTERN:     Polling (1Hz). Rolling 60-sample window. Per-player + team.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] spm: FeatureRegistry not found — aborting"); return; }

    var SPM_MAX_PLAYERS = 13;
    var SPM_WINDOW_SIZE = 60;
    var SLOT_MISS_BACKOFF_MS = 2000;
    var SLOT_NEVER_RESOLVED_BACKOFF_MS = 30000;

    FR.register({
        id: "ql_spm",
        enableKey: "ENABLE_MIN_SOULS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_MIN_SOULS", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var _playerHistory = [];
            var _teamHistory = { friendly: [], enemy: [] };
            var _warmupActive = true;
            var _lastClockSec = null;
            var _nextSampleMs = 0;

            // Cached panel references
            var _cachedFriendlyScore = null;
            var _cachedEnemyScore = null;
            var _cachedFriendlyLabel = null;
            var _cachedEnemyLabel = null;
            var _playerPanels = new Array(SPM_MAX_PLAYERS);
            var _playerDisplayLabels = new Array(SPM_MAX_PLAYERS);
            var _playerTeamByIndex = new Array(SPM_MAX_PLAYERS);
            var _playerHiddenGoldLabels = new Array(SPM_MAX_PLAYERS);
            var _playerSoulsLabels = new Array(SPM_MAX_PLAYERS);
            var _slotMissUntil = new Array(SPM_MAX_PLAYERS);
            var _slotEverResolved = new Array(SPM_MAX_PLAYERS);
            var _anySlotEverResolved = false;

            function _alive(p) { return !!(p && typeof p.IsValid === "function" && p.IsValid()); }

            function _init() {
                _playerHistory = [];
                for (var i = 0; i < SPM_MAX_PLAYERS; i++) _playerHistory.push([]);
                _teamHistory = { friendly: [], enemy: [] };
                _warmupActive = true;
                _lastClockSec = null;
                _nextSampleMs = 0;
            }

            function _addSample(hist, val) {
                if (!hist) return;
                hist.push(val);
                if (hist.length > SPM_WINDOW_SIZE) hist.shift();
            }

            function _calc(hist) {
                if (!hist || hist.length < 2) return 0;
                return hist[hist.length - 1] - hist[0];
            }

            function _format(spm) {
                if (spm >= 1000) return (spm / 1000).toFixed(1) + "k";
                return Math.round(spm).toString();
            }

            function _formatTeam(spm) {
                var value = Number(spm);
                if (!isFinite(value)) value = 0;
                if (Math.abs(value) < 0.0001) return "0";
                var sign = value < 0 ? "-" : "";
                var k = Math.abs(value) / 1000;
                var text = k.toFixed(1);
                if (text.indexOf("0.") === 0) text = text.substring(1);
                if (text === "0.0") return "0";
                return sign + text + "k";
            }

            function _setPanelClassIfChanged(panel, className, hasClass) {
                if (!panel || typeof panel.SetHasClass !== "function") return;
                try { panel.SetHasClass(className, !!hasClass); } catch (e) {}
            }

            function _setSpmLabel(label, spm, scorePanel) {
                if (!_alive(label)) return;
                var nextText = _formatTeam(spm);
                if (label.text !== nextText) label.text = nextText;
                _setPanelClassIfChanged(label, "positive", spm > 0);
                _setPanelClassIfChanged(label, "negative", spm < 0);
                if (scorePanel) {
                    var isTeam1 = !!(scorePanel.BHasClass && scorePanel.BHasClass("team1"));
                    _setPanelClassIfChanged(label, "isTeam1", isTeam1);
                    _setPanelClassIfChanged(label, "isTeam2", !isTeam1);
                }
            }

            function _parseSpmNumber(valueText) {
                if (!valueText) return 0;
                var raw = String(valueText).replace(/,/g, "").trim().toLowerCase();
                if (raw.length === 0) return 0;
                var scale = 1;
                var suffix = raw.charAt(raw.length - 1);
                if (suffix === "k" || suffix === "m" || suffix === "b") {
                    raw = raw.substring(0, raw.length - 1);
                    if (suffix === "k") scale = 1000;
                    else if (suffix === "m") scale = 1000000;
                    else if (suffix === "b") scale = 1000000000;
                }
                var v = parseFloat(raw);
                return isFinite(v) ? (v * scale) : 0;
            }

            function _getSoulValueFromLabels(hiddenGoldLabel, soulsLabel) {
                var soulValue = 0;
                if (hiddenGoldLabel && hiddenGoldLabel.text) soulValue = _parseSpmNumber(hiddenGoldLabel.text);
                if (soulValue === 0 && soulsLabel && soulsLabel.text) soulValue = _parseSpmNumber(soulsLabel.text);
                return soulValue;
            }

            function _detectTeam(playerPanel) {
                var p = playerPanel;
                var guard = 0;
                while (p && p.GetParent && guard < 64) {
                    if (p.id === "TeamFriendly") return "friendly";
                    if (p.id === "TeamEnemy") return "enemy";
                    p = p.GetParent();
                    guard++;
                }
                return null;
            }

            function _parseClockSeconds(text) {
                if (!text || typeof text !== "string") return 0;
                var parts = text.trim().split(":");
                if (parts.length === 2) {
                    var m = parseInt(parts[0], 10) || 0;
                    var s = parseInt(parts[1], 10) || 0;
                    return m * 60 + s;
                } else if (parts.length === 3) {
                    var h = parseInt(parts[0], 10) || 0;
                    var mm = parseInt(parts[1], 10) || 0;
                    var ss = parseInt(parts[2], 10) || 0;
                    return h * 3600 + mm * 60 + ss;
                }
                var v = parseInt(text, 10);
                return isFinite(v) ? v : 0;
            }

            function _getTopBarPlayerPanel(root, index, nowMs) {
                if (!root || !root.FindChildTraverse) return null;
                var now = Number(nowMs) || 0;
                if (now > 0 && now < (Number(_slotMissUntil[index]) || 0)) return null;
                try {
                    var playerPanel = root.FindChildTraverse("TopBarPlayer" + index);
                    if (_alive(playerPanel)) {
                        _slotMissUntil[index] = 0;
                        _slotEverResolved[index] = true;
                        _anySlotEverResolved = true;
                        return playerPanel;
                    }
                } catch(e) {}
                if (now > 0) {
                    var absent = !_slotEverResolved[index] && _anySlotEverResolved;
                    _slotMissUntil[index] = now + (absent ? SLOT_NEVER_RESOLVED_BACKOFF_MS : SLOT_MISS_BACKOFF_MS);
                }
                return null;
            }

            function _applyZeroDisplay() {
                _setSpmLabel(_cachedFriendlyLabel, 0, _cachedFriendlyScore);
                _setSpmLabel(_cachedEnemyLabel, 0, _cachedEnemyScore);
            }

            function _isInHideout(root) {
                try {
                    if (typeof QOL !== "undefined" && QOL.isConnectedToHideout) return QOL.isConnectedToHideout(root);
                    if (root && root.BHasClass) return root.BHasClass("InHideout");
                } catch(e) {}
                return false;
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!root) return;
                var enabled = Number(ctx.config.get("ENABLE_MIN_SOULS")) === 1;
                if (!enabled || _isInHideout(root)) {
                    _init();
                    _applyZeroDisplay();
                    return;
                }

                var nowMs = Date.now ? Date.now() : (new Date()).getTime();

                // Game clock check (detect match restart)
                var gameTimePanel = root.FindChildTraverse("HudGameTime") || root.FindChildTraverse("GameTime");
                var clockSec = gameTimePanel && gameTimePanel.text ? _parseClockSeconds(gameTimePanel.text) : 0;
                if (_lastClockSec !== null && clockSec < _lastClockSec) {
                    _init();
                }
                _lastClockSec = clockSec;

                if (nowMs < _nextSampleMs) return;
                _nextSampleMs = nowMs + 1000;

                // Score panels
                if (!_alive(_cachedFriendlyScore) || !_alive(_cachedFriendlyLabel)) {
                    _cachedFriendlyScore = root.FindChildTraverse("TeamScoreFriendly");
                    _cachedFriendlyLabel = _cachedFriendlyScore ? _cachedFriendlyScore.FindChildTraverse("TeamSPMDisplay_friendly") : null;
                }
                if (!_alive(_cachedEnemyScore) || !_alive(_cachedEnemyLabel)) {
                    _cachedEnemyScore = root.FindChildTraverse("TeamScoreEnemy");
                    _cachedEnemyLabel = _cachedEnemyScore ? _cachedEnemyScore.FindChildTraverse("TeamSPMDisplay_enemy") : null;
                }

                if (!_alive(_cachedFriendlyScore) || !_alive(_cachedEnemyScore)) {
                    _applyZeroDisplay();
                    return;
                }

                var friendlyTotal = 0, enemyTotal = 0, friendlyPlayers = 0, enemyPlayers = 0;

                for (var i = 0; i < SPM_MAX_PLAYERS; i++) {
                    var panel = _playerPanels[i];
                    if (!_alive(panel)) {
                        panel = _getTopBarPlayerPanel(root, i, nowMs);
                        _playerPanels[i] = panel;
                        _playerDisplayLabels[i] = panel && panel.FindChildTraverse ? panel.FindChildTraverse("PlayerSPMDisplay") : null;
                        _playerHiddenGoldLabels[i] = panel && panel.FindChildTraverse ? panel.FindChildTraverse("HiddenGoldValue") : null;
                        _playerSoulsLabels[i] = panel && panel.FindChildTraverse ? panel.FindChildTraverse("SoulsValue") : null;
                        _playerTeamByIndex[i] = panel ? _detectTeam(panel) : null;
                    }
                    if (!panel) continue;

                    var hiddenGoldLabel = _playerHiddenGoldLabels[i];
                    var soulsLabel = _playerSoulsLabels[i];
                    var soulValue = _getSoulValueFromLabels(hiddenGoldLabel, soulsLabel);
                    var team = _playerTeamByIndex[i];
                    if (team !== "friendly" && team !== "enemy") {
                        team = _detectTeam(panel);
                        _playerTeamByIndex[i] = team;
                    }

                    _addSample(_playerHistory[i], soulValue);
                    var spm = _calc(_playerHistory[i]);

                    var playerDisplay = _playerDisplayLabels[i];
                    if (_alive(playerDisplay)) {
                        var playerText = _format(spm) + "/m";
                        if (playerDisplay.text !== playerText) playerDisplay.text = playerText;
                        _setPanelClassIfChanged(playerDisplay, "positive", spm > 0);
                        _setPanelClassIfChanged(playerDisplay, "negative", spm < 0);
                    }

                    if (team === "friendly") { friendlyTotal += soulValue; friendlyPlayers++; }
                    else if (team === "enemy") { enemyTotal += soulValue; enemyPlayers++; }
                }

                if (friendlyPlayers <= 0 || enemyPlayers <= 0) {
                    _applyZeroDisplay();
                    return;
                }

                _addSample(_teamHistory.friendly, friendlyTotal);
                _addSample(_teamHistory.enemy, enemyTotal);

                if (_warmupActive) {
                    _applyZeroDisplay();
                    if (_teamHistory.friendly.length >= 2 && _teamHistory.enemy.length >= 2) {
                        _warmupActive = false;
                    }
                    return;
                }

                var friendlySpm = _calc(_teamHistory.friendly);
                var enemySpm = _calc(_teamHistory.enemy);

                _setSpmLabel(_cachedFriendlyLabel, friendlySpm, _cachedFriendlyScore);
                _setSpmLabel(_cachedEnemyLabel, enemySpm, _cachedEnemyScore);
            }

            _init();
            return {
                onEnable: function() {
                    _tick();
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 1.0, "ql_spm") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_spm");
                    _init();
                    _applyZeroDisplay();
                },
                onSettingsChanged: function() { _tick(); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var topBar = root ? root.FindChildTraverse("TopBar") : null;
                return {
                    passed: !!topBar,
                    name: "SPM top bar panel exists",
                    message: topBar ? "" : "TopBar not found",
                    assertions: [{ passed: !!topBar, name: "TopBar panel exists" }]
                };
            } catch(e) { return { passed: false, name: "SPM panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
