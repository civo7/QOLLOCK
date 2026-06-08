// ql_feat_ondeatharcade.js — On-death arcade game bridge to competitive mod
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _dk = "ql_feat_ondeatharcade";
    var _deps = QOL.import(["isPanelVisibleMaybe","panelIdHud","state","utils"]);
    var S = _deps.state;
    var U = _deps.utils;
    var PANEL_ID_HUD = _deps.panelIdHud;
    function ParseOnDeathArcadeRespawnSeconds(rawText) {
        var raw = String(rawText || "").trim();
        if (raw.length <= 0) return -1;
        var match = raw.match(/-?\d+(?:[.,]\d+)?/);
        if (!match || !match[0]) return -1;
        var parsed = Number(String(match[0]).replace(",", "."));
        if (!isFinite(parsed)) return -1;
        return parsed;
    }

    function FindRespawnTimerPanelForOnDeathArcade(root) {
        if (!root || !root.FindChildTraverse) {
            S.onDeathArcadeRespawnPanel = null;
            return null;
        }

        var cached = IsPanelValid(S.onDeathArcadeRespawnPanel) ? S.onDeathArcadeRespawnPanel : null;
        if (cached && IsPanelVisibleMaybe(cached)) return cached;
        S.onDeathArcadeRespawnPanel = null;

        var localRespawnRoot = null;
        try { localRespawnRoot = root.FindChildTraverse("respawn_timer"); } catch (e0) { localRespawnRoot = null; }
        if (localRespawnRoot && localRespawnRoot.FindChildrenWithClassTraverse) {
            var localLabels = [];
            try { localLabels = localRespawnRoot.FindChildrenWithClassTraverse("respawn_number") || []; } catch (e1) { localLabels = []; }
            for (var iLocal = 0; iLocal < localLabels.length; iLocal++) {
                var localCandidate = localLabels[iLocal];
                if (!IsPanelValid(localCandidate) || !IsPanelVisibleMaybe(localCandidate)) continue;
                S.onDeathArcadeRespawnPanel = localCandidate;
                return localCandidate;
            }
        }

        if (!root.FindChildrenWithClassTraverse) return null;
        var labels = [];
        try { labels = root.FindChildrenWithClassTraverse("RespawnTimer") || []; } catch (e2) { labels = []; }
        for (var i = 0; i < labels.length; i++) {
            var candidate = labels[i];
            if (!IsPanelValid(candidate) || !IsPanelVisibleMaybe(candidate)) continue;
            S.onDeathArcadeRespawnPanel = candidate;
            return candidate;
        }
        return null;
    }

    function GetRespawnTimerSecondsForOnDeathArcade(root) {
        var timerPanel = FindRespawnTimerPanelForOnDeathArcade(root);
        if (!IsPanelValid(timerPanel) || !IsPanelVisibleMaybe(timerPanel)) return -1;
        var text = "";
        try { text = String(timerPanel.text || ""); } catch (e0) { text = ""; }
        return ParseOnDeathArcadeRespawnSeconds(text);
    }

    function BuildOnDeathArcadeIdPool(cfg) {
        var pool = [];
        if (Number(cfg.ENABLE_ON_DEATH_GAMES) !== 1) return pool;
        if (IsCfgEnabled(cfg, "ON_DEATH_GAME_MINESWEEPER")) pool.push("minesweeper");
        if (IsCfgEnabled(cfg, "ON_DEATH_GAME_BLACKJACK")) pool.push("blackjack");
        if (IsCfgEnabled(cfg, "ON_DEATH_GAME_FLAPPY_BAT")) pool.push("flappy_bat");
        if (IsCfgEnabled(cfg, "ON_DEATH_GAME_GRAVES_TRAINER")) pool.push("graves_trainer");
        if (IsCfgEnabled(cfg, "ON_DEATH_GAME_ZERGGY_MANIA")) pool.push("zerggy_mania");
        if (IsCfgEnabled(cfg, "ON_DEATH_GAME_WHACK_A_REM")) pool.push("whack_a_rem");
        return pool;
    }

    function SetOnDeathArcadeBridgeAttributes(root, active, gameId, token) {
        if (!root || !root.SetAttributeString) return;
        var activeText = active ? "1" : "";
        var gameText = active ? String(gameId || "") : "";
        var tokenText = active ? String(token || "") : "";
        try { root.SetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, activeText); } catch (e0) {}
        try { root.SetAttributeString(ON_DEATH_ARCADE_REQUEST_ATTR, gameText); } catch (e1) {}
        try { root.SetAttributeString(ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR, tokenText); } catch (e2) {}
        var hud = null;
        try { hud = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HUD) : null; } catch (e3) { hud = null; }
        if (hud && hud.SetAttributeString) {
            try { hud.SetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, activeText); } catch (e4) {}
            try { hud.SetAttributeString(ON_DEATH_ARCADE_REQUEST_ATTR, gameText); } catch (e5) {}
            try { hud.SetAttributeString(ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR, tokenText); } catch (e6) {}
        }
    }

    function BuildOnDeathArcadeEscapeTargets(root) {
        var targets = [];
        function pushUnique(panel) {
            if (!IsPanelValid(panel)) return;
            PushUnique(targets, panel);
        }

        pushUnique(root);
        if (root && root.FindChildTraverse) {
            var escapeMenu = null;
            try { escapeMenu = root.FindChildTraverse("EscapeMenu"); } catch (e0) { escapeMenu = null; }
            pushUnique(escapeMenu);
            if (escapeMenu && escapeMenu.GetParent) pushUnique(escapeMenu.GetParent());
            var hud = null;
            try { hud = root.FindChildTraverse(PANEL_ID_HUD); } catch (e1) { hud = null; }
            pushUnique(hud);
        }
        return targets;
    }

    function SetOnDeathArcadeEscapeMenuOpen(root, shouldOpen) {
        var targets = BuildOnDeathArcadeEscapeTargets(root);
        for (var i = 0; i < targets.length; i++) {
            var panel = targets[i];
            if (!panel) continue;
            try {
                if (shouldOpen && panel.AddClass) panel.AddClass("ShowEscapeMenu");
                if (!shouldOpen && panel.RemoveClass) panel.RemoveClass("ShowEscapeMenu");
            } catch (e0) {}
        }
    }

    function UpdateOnDeathArcadeBridge(root, cfg, nowMsLoop) {
        if (!root || !cfg) return;

        var pool = BuildOnDeathArcadeIdPool(cfg);
        var featureEnabled = pool.length > 0;
        if (!featureEnabled) {
            var staleActive = "";
            try { staleActive = String(root.GetAttributeString ? root.GetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, "") : ""); } catch (e0) { staleActive = ""; }
            if (S.onDeathArcadeWasDead || staleActive === "1") {
                SetOnDeathArcadeBridgeAttributes(root, false, "", "");
                SetOnDeathArcadeEscapeMenuOpen(root, false);
            }
            S.onDeathArcadeWasDead = false;
            S.onDeathArcadeRespawnPanel = null;
            return;
        }

        var timerSeconds = GetRespawnTimerSecondsForOnDeathArcade(root);
        var isDead = isFinite(timerSeconds) && timerSeconds > 0;
        var wasDead = S.onDeathArcadeWasDead === true;

        if (isDead && !wasDead) {
            if ((nowMsLoop - S.onDeathArcadeLastTriggerMs) >= ON_DEATH_ARCADE_TRIGGER_COOLDOWN_MS) {
                S.onDeathArcadeLastTriggerMs = nowMsLoop;
                S.onDeathArcadeRequestSerial = Number(S.onDeathArcadeRequestSerial || 0) + 1;
                var gameId = pool[Math.floor(Math.random() * pool.length)] || "";
                var requestToken = String(S.onDeathArcadeRequestSerial);
                SetOnDeathArcadeBridgeAttributes(root, true, gameId, requestToken);
                SetOnDeathArcadeEscapeMenuOpen(root, true);
            }
        } else if (!isDead && wasDead) {
            SetOnDeathArcadeBridgeAttributes(root, false, "", "");
            SetOnDeathArcadeEscapeMenuOpen(root, false);
        } else if (!isDead) {
            SetOnDeathArcadeBridgeAttributes(root, false, "", "");
        }

        S.onDeathArcadeWasDead = isDead;
    }

    // ── Registration ──
    QOL.register("onDeathArcade", {
        configKeys: ["ENABLE_ON_DEATH_GAMES", "ON_DEATH_GAME_MINESWEEPER",
                     "ON_DEATH_GAME_BLACKJACK", "ON_DEATH_GAME_FLAPPY_BAT",
                     "ON_DEATH_GAME_GRAVES_TRAINER", "ON_DEATH_GAME_ZERGGY_MANIA",
                     "ON_DEATH_GAME_WHACK_A_REM"],
        bucket: 7, phase: -1,
        gate: function(cfg) {
            if (Number(cfg.ENABLE_ON_DEATH_GAMES) !== 1) return false;
            return IsCfgEnabled(cfg, "ON_DEATH_GAME_MINESWEEPER") ||
                   IsCfgEnabled(cfg, "ON_DEATH_GAME_BLACKJACK") ||
                   IsCfgEnabled(cfg, "ON_DEATH_GAME_FLAPPY_BAT") ||
                   IsCfgEnabled(cfg, "ON_DEATH_GAME_GRAVES_TRAINER") ||
                   IsCfgEnabled(cfg, "ON_DEATH_GAME_ZERGGY_MANIA") ||
                   IsCfgEnabled(cfg, "ON_DEATH_GAME_WHACK_A_REM");
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
                        try {
                UpdateOnDeathArcadeBridge(root, cfg, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["onDeathArcadeWasDead", "onDeathArcadeLastTriggerMs",
                    "onDeathArcadeRespawnPanel", "onDeathArcadeRequestSerial",
                    "onDeathArcadeRuntimeWasActive"]
    });

    // Self-test: verify update function exists at load time
    try {
        if (typeof UpdateOnDeathArcadeBridge !== "function") throw new Error("UpdateOnDeathArcadeBridge is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();
