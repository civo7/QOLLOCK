// ql_feat_spm.js — Souls Per Minute (SPM) display
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _dk = "ql_feat_spm";
    var _deps = QOL.import(["detectTopBarPlayerTeam","ensureSpmState","getCachedPanel","getSoulValueFromLabels","parseClockSeconds","refreshSpmPanelCache","state","setCachedPanel","setPanelClassIfChanged","utils","isConnectedToHideout"]);
    var GC = _deps.getCachedPanel;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var U = _deps.utils;

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
        S.spm.playerHistory = histories;
        S.spm.teamHistory = { friendly: [], enemy: [] };
        S.spm.warmupActive = true;
        S.spm.nextSampleMs = 0;
        S.spm.panelCacheNextMs = 0;
        S.spm.playerRefreshCursor = 0;
        S.spm.playerRefreshRemaining = 0;
        S.spm.needsFullPlayerCache = true;
        S.topbarSoulSnapshot = null;
        S.topbarSoulSnapshotUntilMs = 0;
    }

    function ApplyZeroSpmDisplay(root, nowMs) {
        if (!root) return;
        RefreshSpmPanelCache(root, nowMs || 0);
        var friendlyScore = IsPanelValid(S.spm.cachedFriendlyScore) ? S.spm.cachedFriendlyScore : null;
        var enemyScore = IsPanelValid(S.spm.cachedEnemyScore) ? S.spm.cachedEnemyScore : null;
        var friendlyLabel = IsPanelValid(S.spm.cachedFriendlyLabel) ? S.spm.cachedFriendlyLabel : null;
        var enemyLabel = IsPanelValid(S.spm.cachedEnemyLabel) ? S.spm.cachedEnemyLabel : null;
        SetSpmLabel(friendlyLabel, 0, friendlyScore);
        SetSpmLabel(enemyLabel, 0, enemyScore);
    }

    function BuildTopbarSoulSnapshot(root, nowMs) {
        if (!root) return null;
        RefreshSpmPanelCache(root, nowMs || 0);
        if (!S.spm.playerPanels || !S.spm.playerTeamByIndex) return null;

        var players = new Array(SPM_MAX_PLAYERS);
        var friendlyTotal = 0, enemyTotal = 0, friendlyPlayers = 0, enemyPlayers = 0;

        for (var i = 0; i < SPM_MAX_PLAYERS; i++) {
            var panel = IsPanelValid(S.spm.playerPanels[i]) ? S.spm.playerPanels[i] : null;
            if (!panel) { players[i] = null; continue; }

            var hiddenGoldLabel = IsPanelValid(S.spm.playerHiddenGoldLabels[i]) ? S.spm.playerHiddenGoldLabels[i] : null;
            var soulsLabel = IsPanelValid(S.spm.playerSoulsLabels[i]) ? S.spm.playerSoulsLabels[i] : null;
            if (!hiddenGoldLabel) {
                hiddenGoldLabel = panel.FindChildTraverse ? (panel.FindChildTraverse("HiddenGoldValue") || null) : null;
                S.spm.playerHiddenGoldLabels[i] = hiddenGoldLabel;
            }
            if (!soulsLabel) {
                soulsLabel = panel.FindChildTraverse ? (panel.FindChildTraverse("SoulsValue") || null) : null;
                S.spm.playerSoulsLabels[i] = soulsLabel;
            }

            var soulValue = GetSoulValueFromLabels(hiddenGoldLabel, soulsLabel);
            var team = S.spm.playerTeamByIndex[i];
            if (team !== "friendly" && team !== "enemy") {
                team = DetectTopBarPlayerTeam(panel);
                S.spm.playerTeamByIndex[i] = team;
            }

            players[i] = { panel: panel, soulValue: soulValue, team: team };

            if (team === "friendly") { friendlyTotal += soulValue; friendlyPlayers++; }
            else if (team === "enemy") { enemyTotal += soulValue; enemyPlayers++; }
        }

        var snapshot = { players: players, friendlyTotal: friendlyTotal, enemyTotal: enemyTotal, friendlyPlayers: friendlyPlayers, enemyPlayers: enemyPlayers };
        S.topbarSoulSnapshot = snapshot;
        S.topbarSoulSnapshotUntilMs = (nowMs || 0) + TOPBAR_SOUL_SNAPSHOT_TTL_MS;
        return snapshot;
    }

    function GetTopbarSoulSnapshot(root, nowMs) {
        var snapshot = S.topbarSoulSnapshot;
        if (snapshot && nowMs <= (S.topbarSoulSnapshotUntilMs || 0)) return snapshot;
        return BuildTopbarSoulSnapshot(root, nowMs);
    }

    // ── Update ──

    function UpdateSoulsPerMinute(root, nowMs, cfg) {
        if (!root) return;
        EnsureSpmState();

        var spmEnabled = !cfg || IsCfgEnabled(cfg, "ENABLE_MIN_SOULS");
        if (!spmEnabled) {
            if (!S.spm.wasDisabled) {
                ResetSpmState();
                ApplyZeroSpmDisplay(root, nowMs);
                S.spm.lastClockSec = null;
                S.spm.wasDisabled = true;
            }
            return;
        }
        S.spm.wasDisabled = false;

        if (isConnectedToHideout(root)) {
            ResetSpmState();
            ApplyZeroSpmDisplay(root, nowMs);
            S.spm.lastClockSec = null;
            return;
        }

        var gameTimePanel = GC("gameTime");
        if (!gameTimePanel) {
            gameTimePanel = root.FindChildTraverse("HudGameTime") || root.FindChildTraverse("GameTime");
            SC("gameTime", gameTimePanel);
        }
        var clockSec = gameTimePanel && gameTimePanel.text ? ParseClockSeconds(gameTimePanel.text) : 0;
        if (S.spm.lastClockSec !== null && clockSec < S.spm.lastClockSec) {
            ResetSpmState();
        }
        S.spm.lastClockSec = clockSec;

        if (!isFinite(nowMs)) {
            nowMs = Date.now ? Date.now() : (new Date()).getTime();
        }
        if (nowMs < (S.spm.nextSampleMs || 0)) return;
        S.spm.nextSampleMs = nowMs + SPM_SAMPLE_INTERVAL_MS;

        RefreshSpmPanelCache(root, nowMs);
        var friendlyScore = IsPanelValid(S.spm.cachedFriendlyScore) ? S.spm.cachedFriendlyScore : null;
        var enemyScore = IsPanelValid(S.spm.cachedEnemyScore) ? S.spm.cachedEnemyScore : null;
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
            var history = S.spm.playerHistory[i];
            SpmAddSample(history, soulValue);
            var spm = SpmCalculate(history);

            var playerDisplay = IsPanelValid(S.spm.playerDisplayLabels[i]) ? S.spm.playerDisplayLabels[i] : null;
            if (playerDisplay) {
                var playerText = SpmFormat(spm) + "/m";
                if (playerDisplay.text !== playerText) playerDisplay.text = playerText;
                SetPanelClassIfChanged(playerDisplay, "positive", spm > 0);
                SetPanelClassIfChanged(playerDisplay, "negative", spm < 0);
            }

            var team = snapshotPlayer.team || S.spm.playerTeamByIndex[i];
            S.spm.playerTeamByIndex[i] = team;
            if (team === "friendly") { friendlyTotal += soulValue; friendlyPlayers++; }
            else if (team === "enemy") { enemyTotal += soulValue; enemyPlayers++; }
        }

        if (friendlyPlayers <= 0 || enemyPlayers <= 0) {
            ApplyZeroSpmDisplay(root, nowMs);
            return;
        }

        SpmAddSample(S.spm.teamHistory.friendly, friendlyTotal);
        SpmAddSample(S.spm.teamHistory.enemy, enemyTotal);

        if (S.spm.warmupActive) {
            ApplyZeroSpmDisplay(root, nowMs);
            if (S.spm.teamHistory.friendly.length >= 2 && S.spm.teamHistory.enemy.length >= 2) {
                S.spm.warmupActive = false;
            }
            return;
        }

        var friendlySpm = SpmCalculate(S.spm.teamHistory.friendly);
        var enemySpm = SpmCalculate(S.spm.teamHistory.enemy);

        var friendlyLabel = IsPanelValid(S.spm.cachedFriendlyLabel) ? S.spm.cachedFriendlyLabel : null;
        var enemyLabel = IsPanelValid(S.spm.cachedEnemyLabel) ? S.spm.cachedEnemyLabel : null;

        SetSpmLabel(friendlyLabel, friendlySpm, friendlyScore);
        SetSpmLabel(enemyLabel, enemySpm, enemyScore);
    }

    // ── Registration ──

    QOL.register("spm", {
        configKeys: ["ENABLE_MIN_SOULS"],
        bucket: 1, phase: 1,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_MIN_SOULS");
        },
        update: function(root, cfg, nowMs) {
            try {
                UpdateSoulsPerMinute(root, nowMs, cfg);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] update: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["spm"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateSoulsPerMinute !== "function") throw new Error("UpdateSoulsPerMinute is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
