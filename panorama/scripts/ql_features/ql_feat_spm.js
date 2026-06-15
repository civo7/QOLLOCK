// ql_feat_spm.js — Souls Per Minute (SPM) display
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_spm";
    var _deps = QOL.import(["detectTopBarPlayerTeam","ensureSpmState","getCachedPanel","getSoulValueFromLabels","parseClockSeconds","refreshSpmPanelCache","state","setCachedPanel","setPanelClassIfChanged","utils","isConnectedToHideout"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var SetPanelClassIfChanged = _deps.setPanelClassIfChanged;
    var EnsureSpmState = _deps.ensureSpmState;
    var ParseClockSeconds = _deps.parseClockSeconds;
    var RefreshSpmPanelCache = _deps.refreshSpmPanelCache;
    var GetSoulValueFromLabels = _deps.getSoulValueFromLabels;
    var DetectTopBarPlayerTeam = _deps.detectTopBarPlayerTeam;
    var isConnectedToHideout = _deps.isConnectedToHideout;

    // ── Private constants ──
    var SPM_MAX_PLAYERS = 13;
    var SPM_SAMPLE_INTERVAL_MS = 1000;
    var SPM_WINDOW_SIZE = 60;
    var TOPBAR_SOUL_SNAPSHOT_TTL_MS = 140;

    // ── Private helpers ──

    function SpmAddSample(history, value) {
        if (!history) return;
        history.push(value);
        if (history.length > SPM_WINDOW_SIZE) history.shift();
    }

    function SpmCalculate(history) {
        if (!history || history.length < 2) return 0;
        return history[history.length - 1] - history[0];
    }

    function SpmFormat(spm) {
        if (spm >= 1000) return (spm / 1000).toFixed(1) + "k";
        return Math.round(spm).toString();
    }

    function SpmFormatTeam(spm) {
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

    function SetSpmLabel(label, spm, scorePanel) {
        if (!label) return;
        var nextText = SpmFormatTeam(spm);
        if (label.text !== nextText) label.text = nextText;
        SetPanelClassIfChanged(label, "positive", spm > 0);
        SetPanelClassIfChanged(label, "negative", spm < 0);
        if (scorePanel) {
            var isTeam1 = !!(scorePanel.BHasClass && scorePanel.BHasClass("team1"));
            SetPanelClassIfChanged(label, "isTeam1", isTeam1);
            SetPanelClassIfChanged(label, "isTeam2", !isTeam1);
        }
    }

    function ResetSpmState() {
        var histories = [];
        for (var i = 0; i < SPM_MAX_PLAYERS; i++) histories.push([]);
        State.spm.playerHistory = histories;
        State.spm.teamHistory = { friendly: [], enemy: [] };
        State.spm.warmupActive = true;
        State.spm.nextSampleMs = 0;
        State.spm.panelCacheNextMs = 0;
        State.spm.playerRefreshCursor = 0;
        State.spm.playerRefreshRemaining = 0;
        State.spm.needsFullPlayerCache = true;
        State.topbarSoulSnapshot = null;
        State.topbarSoulSnapshotUntilMs = 0;
    }

    function ApplyZeroSpmDisplay(root, nowMs) {
        if (!root) return;
        RefreshSpmPanelCache(root, nowMs || 0);
        var friendlyScore = IsPanelValid(State.spm.cachedFriendlyScore) ? State.spm.cachedFriendlyScore : null;
        var enemyScore = IsPanelValid(State.spm.cachedEnemyScore) ? State.spm.cachedEnemyScore : null;
        var friendlyLabel = IsPanelValid(State.spm.cachedFriendlyLabel) ? State.spm.cachedFriendlyLabel : null;
        var enemyLabel = IsPanelValid(State.spm.cachedEnemyLabel) ? State.spm.cachedEnemyLabel : null;
        SetSpmLabel(friendlyLabel, 0, friendlyScore);
        SetSpmLabel(enemyLabel, 0, enemyScore);
    }

    function BuildTopbarSoulSnapshot(root, nowMs) {
        if (!root) return null;
        RefreshSpmPanelCache(root, nowMs || 0);
        if (!State.spm.playerPanels || !State.spm.playerTeamByIndex) return null;

        var players = new Array(SPM_MAX_PLAYERS);
        var friendlyTotal = 0, enemyTotal = 0, friendlyPlayers = 0, enemyPlayers = 0;

        for (var i = 0; i < SPM_MAX_PLAYERS; i++) {
            var panel = IsPanelValid(State.spm.playerPanels[i]) ? State.spm.playerPanels[i] : null;
            if (!panel) { players[i] = null; continue; }

            var hiddenGoldLabel = IsPanelValid(State.spm.playerHiddenGoldLabels[i]) ? State.spm.playerHiddenGoldLabels[i] : null;
            var soulsLabel = IsPanelValid(State.spm.playerSoulsLabels[i]) ? State.spm.playerSoulsLabels[i] : null;
            if (!hiddenGoldLabel) {
                hiddenGoldLabel = panel.FindChildTraverse ? (panel.FindChildTraverse("HiddenGoldValue") || null) : null;
                State.spm.playerHiddenGoldLabels[i] = hiddenGoldLabel;
            }
            if (!soulsLabel) {
                soulsLabel = panel.FindChildTraverse ? (panel.FindChildTraverse("SoulsValue") || null) : null;
                State.spm.playerSoulsLabels[i] = soulsLabel;
            }

            var soulValue = GetSoulValueFromLabels(hiddenGoldLabel, soulsLabel);
            var team = State.spm.playerTeamByIndex[i];
            if (team !== "friendly" && team !== "enemy") {
                team = DetectTopBarPlayerTeam(panel);
                State.spm.playerTeamByIndex[i] = team;
            }

            players[i] = { panel: panel, soulValue: soulValue, team: team };

            if (team === "friendly") { friendlyTotal += soulValue; friendlyPlayers++; }
            else if (team === "enemy") { enemyTotal += soulValue; enemyPlayers++; }
        }

        var snapshot = { players: players, friendlyTotal: friendlyTotal, enemyTotal: enemyTotal, friendlyPlayers: friendlyPlayers, enemyPlayers: enemyPlayers };
        State.topbarSoulSnapshot = snapshot;
        State.topbarSoulSnapshotUntilMs = (nowMs || 0) + TOPBAR_SOUL_SNAPSHOT_TTL_MS;
        return snapshot;
    }

    function GetTopbarSoulSnapshot(root, nowMs) {
        var snapshot = State.topbarSoulSnapshot;
        if (snapshot && nowMs <= (State.topbarSoulSnapshotUntilMs || 0)) return snapshot;
        return BuildTopbarSoulSnapshot(root, nowMs);
    }

    // ── Update ──

    function UpdateSoulsPerMinute(root, nowMs, cfg) {
        if (!root) return;
        EnsureSpmState();

        var spmEnabled = !cfg || IsCfgEnabled(cfg, "ENABLE_MIN_SOULS");
        if (!spmEnabled) {
            if (!State.spm.wasDisabled) {
                ResetSpmState();
                ApplyZeroSpmDisplay(root, nowMs);
                State.spm.lastClockSec = null;
                State.spm.wasDisabled = true;
            }
            return;
        }
        State.spm.wasDisabled = false;

        if (isConnectedToHideout(root)) {
            ResetSpmState();
            ApplyZeroSpmDisplay(root, nowMs);
            State.spm.lastClockSec = null;
            return;
        }

        var gameTimePanel = GetCachedPanel("gameTime");
        if (!gameTimePanel) {
            gameTimePanel = root.FindChildTraverse("HudGameTime") || root.FindChildTraverse("GameTime");
            SetCachedPanel("gameTime", gameTimePanel);
        }
        var clockSec = gameTimePanel && gameTimePanel.text ? ParseClockSeconds(gameTimePanel.text) : 0;
        if (State.spm.lastClockSec !== null && clockSec < State.spm.lastClockSec) {
            ResetSpmState();
        }
        State.spm.lastClockSec = clockSec;

        if (!isFinite(nowMs)) {
            nowMs = Date.now ? Date.now() : (new Date()).getTime();
        }
        if (nowMs < (State.spm.nextSampleMs || 0)) return;
        State.spm.nextSampleMs = nowMs + SPM_SAMPLE_INTERVAL_MS;

        RefreshSpmPanelCache(root, nowMs);
        var friendlyScore = IsPanelValid(State.spm.cachedFriendlyScore) ? State.spm.cachedFriendlyScore : null;
        var enemyScore = IsPanelValid(State.spm.cachedEnemyScore) ? State.spm.cachedEnemyScore : null;
        if (!friendlyScore || !enemyScore) {
            ApplyZeroSpmDisplay(root, nowMs);
            return;
        }

        var snapshot = GetTopbarSoulSnapshot(root, nowMs);
        if (!snapshot || !snapshot.players) {
            ApplyZeroSpmDisplay(root, nowMs);
            return;
        }

        var friendlyTotal = 0, enemyTotal = 0, friendlyPlayers = 0, enemyPlayers = 0;
        for (var i = 0; i < SPM_MAX_PLAYERS; i++) {
            var snapshotPlayer = snapshot.players[i];
            if (!snapshotPlayer) continue;
            var soulValue = snapshotPlayer.soulValue;
            var history = State.spm.playerHistory[i];
            SpmAddSample(history, soulValue);
            var spm = SpmCalculate(history);

            var playerDisplay = IsPanelValid(State.spm.playerDisplayLabels[i]) ? State.spm.playerDisplayLabels[i] : null;
            if (playerDisplay) {
                var playerText = SpmFormat(spm) + "/m";
                if (playerDisplay.text !== playerText) playerDisplay.text = playerText;
                SetPanelClassIfChanged(playerDisplay, "positive", spm > 0);
                SetPanelClassIfChanged(playerDisplay, "negative", spm < 0);
            }

            var team = snapshotPlayer.team || State.spm.playerTeamByIndex[i];
            State.spm.playerTeamByIndex[i] = team;
            if (team === "friendly") { friendlyTotal += soulValue; friendlyPlayers++; }
            else if (team === "enemy") { enemyTotal += soulValue; enemyPlayers++; }
        }

        if (friendlyPlayers <= 0 || enemyPlayers <= 0) {
            ApplyZeroSpmDisplay(root, nowMs);
            return;
        }

        SpmAddSample(State.spm.teamHistory.friendly, friendlyTotal);
        SpmAddSample(State.spm.teamHistory.enemy, enemyTotal);

        if (State.spm.warmupActive) {
            ApplyZeroSpmDisplay(root, nowMs);
            if (State.spm.teamHistory.friendly.length >= 2 && State.spm.teamHistory.enemy.length >= 2) {
                State.spm.warmupActive = false;
            }
            return;
        }

        var friendlySpm = SpmCalculate(State.spm.teamHistory.friendly);
        var enemySpm = SpmCalculate(State.spm.teamHistory.enemy);

        var friendlyLabel = IsPanelValid(State.spm.cachedFriendlyLabel) ? State.spm.cachedFriendlyLabel : null;
        var enemyLabel = IsPanelValid(State.spm.cachedEnemyLabel) ? State.spm.cachedEnemyLabel : null;

        SetSpmLabel(friendlyLabel, friendlySpm, friendlyScore);
        SetSpmLabel(enemyLabel, enemySpm, enemyScore);
    }

    // ── Registration ──

    QOL.register("spm", {
        configKeys: ["ENABLE_MIN_SOULS"],
        bucket: 1, phase: 1,
        perfLabel: "loop.souls_per_min",
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_MIN_SOULS");
        },
        update: function(root, cfg, nowMs) {
            try {
                UpdateSoulsPerMinute(root, nowMs, cfg);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] update: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["spm"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateSoulsPerMinute !== "function") throw new Error("UpdateSoulsPerMinute is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
