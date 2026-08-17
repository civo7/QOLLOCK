// features/ql_on_death_arcade/manifest.js
// =============================================================================
// QOLLOCK — On-Death Arcade
// =============================================================================
// OWNS:        Arcade game bridge to competitive mod on player death.
//              Detects death via respawn timer panel, sends bridge attributes
//              to trigger arcade games, manages escape menu open/close.
// DOES NOT OWN: Arcade game implementations (competitive mod), respawn UI (Valve)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_ON_DEATH_GAMES, ON_DEATH_GAME_MINESWEEPER,
//              ON_DEATH_GAME_BLACKJACK, ON_DEATH_GAME_FLAPPY_BAT,
//              ON_DEATH_GAME_GRAVES_TRAINER, ON_DEATH_GAME_ZERGGY_MANIA,
//              ON_DEATH_GAME_WHACK_A_REM
// CSS:         none (AddClass/RemoveClass "ShowEscapeMenu" only)
// PATTERN:     Polling (0.2Hz). Bridge attribute writes via SetAttributeString.
//              Has postUpdate equivalent (writes onDeathArcadeRuntimeWasActive).
// CONFIG SRC:  ctx.config.view() (read-only hot path; has enableKey)
// PORTED FROM: features/ql_feat_ondeatharcade.js (220 lines)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_on_death_arcade: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_on_death_arcade",
        enableKey: "ENABLE_ON_DEATH_GAMES",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_ON_DEATH_GAMES", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_MINESWEEPER", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_BLACKJACK", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_FLAPPY_BAT", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_GRAVES_TRAINER", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_ZERGGY_MANIA", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_WHACK_A_REM", type: "toggle", default: false }
        ],
        create: function(ctx) {
            // ── QOL.import deps (verbatim from old feature) ──
            var _deps = QOL.import(["isPanelVisibleMaybe","state","utils"]);
            var State = _deps.state;
            var Utils = _deps.utils;
            var IsCfgEnabled = Utils.IsCfgEnabled;
            var IsPanelValid = Utils.IsPanelValid;
            var IsPanelVisibleMaybe = _deps.isPanelVisibleMaybe || function(p) { try { return p ? p.visible : false; } catch(e) { return false; } };
            // QOL_PANEL_ID_HUD is a bare global (loaded before manifests in hud.xml)
            var PANEL_ID_HUD = (typeof QOL_PANEL_ID_HUD !== "undefined") ? QOL_PANEL_ID_HUD : "Hud";

            var _loop = null;
            var _root = null;

            // ── Constants (verbatim from old feature) ──
            var ON_DEATH_ARCADE_ACTIVE_ATTR = "QOL_ON_DEATH_ARCADE_ACTIVE";
            var ON_DEATH_ARCADE_REQUEST_ATTR = "QOL_ON_DEATH_ARCADE_REQUEST";
            var ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR = "QOL_ON_DEATH_ARCADE_REQUEST_TOKEN";
            var ON_DEATH_ARCADE_TRIGGER_COOLDOWN_MS = 5000;
            // PushUnique is defined in ql_utils.js — use local fallback if not available.
            var PushUnique = (typeof QOL !== "undefined" && typeof QOL.utils !== "undefined" && typeof QOL.utils.PushUnique === "function")
                ? QOL.utils.PushUnique
                : function(arr, item) { if (arr.indexOf(item) === -1) arr.push(item); };

            // ── Helpers (verbatim from old feature) ──
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
                    State.onDeathArcadeRespawnPanel = null;
                    return null;
                }

                var cached = IsPanelValid(State.onDeathArcadeRespawnPanel) ? State.onDeathArcadeRespawnPanel : null;
                if (cached && IsPanelVisibleMaybe(cached)) return cached;
                State.onDeathArcadeRespawnPanel = null;

                var localRespawnRoot = null;
                try { localRespawnRoot = root.FindChildTraverse("respawn_timer"); } catch (e0) { localRespawnRoot = null; }
                if (localRespawnRoot && localRespawnRoot.FindChildrenWithClassTraverse) {
                    var localLabels = [];
                    try { localLabels = localRespawnRoot.FindChildrenWithClassTraverse("respawn_number") || []; } catch (e1) { localLabels = []; }
                    for (var iLocal = 0; iLocal < localLabels.length; iLocal++) {
                        var localCandidate = localLabels[iLocal];
                        if (!IsPanelValid(localCandidate) || !IsPanelVisibleMaybe(localCandidate)) continue;
                        State.onDeathArcadeRespawnPanel = localCandidate;
                        return localCandidate;
                    }
                }

                if (!root.FindChildrenWithClassTraverse) return null;
                var labels = [];
                try { labels = root.FindChildrenWithClassTraverse("RespawnTimer") || []; } catch (e2) { labels = []; }
                for (var i = 0; i < labels.length; i++) {
                    var candidate = labels[i];
                    if (!IsPanelValid(candidate) || !IsPanelVisibleMaybe(candidate)) continue;
                    State.onDeathArcadeRespawnPanel = candidate;
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
                try { root.SetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, activeText); } catch(e0) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_ondeatharcade", (e0 && e0.message ? e0.message : String(e0 || ""))); }
                try { root.SetAttributeString(ON_DEATH_ARCADE_REQUEST_ATTR, gameText); } catch(e1) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_ondeatharcade", (e1 && e1.message ? e1.message : String(e1 || ""))); }
                try { root.SetAttributeString(ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR, tokenText); } catch(e2) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_ondeatharcade", (e2 && e2.message ? e2.message : String(e2 || ""))); }
                var hud = null;
                try { hud = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HUD) : null; } catch (e3) { hud = null; }
                if (hud && hud.SetAttributeString) {
                    try { hud.SetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, activeText); } catch(e4) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_ondeatharcade", (e4 && e4.message ? e4.message : String(e4 || ""))); }
                    try { hud.SetAttributeString(ON_DEATH_ARCADE_REQUEST_ATTR, gameText); } catch(e5) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_ondeatharcade", (e5 && e5.message ? e5.message : String(e5 || ""))); }
                    try { hud.SetAttributeString(ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR, tokenText); } catch(e6) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_ondeatharcade", (e6 && e6.message ? e6.message : String(e6 || ""))); }
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
                    } catch(e0) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_ondeatharcade", (e0 && e0.message ? e0.message : String(e0 || ""))); }
                }
            }

            // ── Main tick (adapted from UpdateOnDeathArcadeBridge + postUpdate) ──
            function _tick() {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                var cfg = ctx.config.view();

                if (!root || !cfg) return;

                var pool = BuildOnDeathArcadeIdPool(cfg);
                var featureEnabled = pool.length > 0;
                if (!featureEnabled) {
                    var staleActive = "";
                    try { staleActive = String(root.GetAttributeString ? root.GetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, "") : ""); } catch (e0) { staleActive = ""; }
                    if (State.onDeathArcadeWasDead || staleActive === "1") {
                        SetOnDeathArcadeBridgeAttributes(root, false, "", "");
                        SetOnDeathArcadeEscapeMenuOpen(root, false);
                    }
                    State.onDeathArcadeWasDead = false;
                    State.onDeathArcadeRespawnPanel = null;
                    // postUpdate equivalent — replicate sticky-state write
                    State.onDeathArcadeRuntimeWasActive = false;
                    return;
                }

                // postUpdate equivalent — feature is active
                State.onDeathArcadeRuntimeWasActive = true;

                var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                var timerSeconds = GetRespawnTimerSecondsForOnDeathArcade(root);
                var isDead = isFinite(timerSeconds) && timerSeconds > 0;
                var wasDead = State.onDeathArcadeWasDead === true;

                if (isDead && !wasDead) {
                    if ((nowMs - State.onDeathArcadeLastTriggerMs) >= ON_DEATH_ARCADE_TRIGGER_COOLDOWN_MS) {
                        State.onDeathArcadeLastTriggerMs = nowMs;
                        State.onDeathArcadeRequestSerial = Number(State.onDeathArcadeRequestSerial || 0) + 1;
                        var gameId = pool[Math.floor(Math.random() * pool.length)] || "";
                        var requestToken = String(State.onDeathArcadeRequestSerial);
                        SetOnDeathArcadeBridgeAttributes(root, true, gameId, requestToken);
                        SetOnDeathArcadeEscapeMenuOpen(root, true);
                    }
                } else if (!isDead && wasDead) {
                    SetOnDeathArcadeBridgeAttributes(root, false, "", "");
                    SetOnDeathArcadeEscapeMenuOpen(root, false);
                } else if (!isDead) {
                    SetOnDeathArcadeBridgeAttributes(root, false, "", "");
                }

                State.onDeathArcadeWasDead = isDead;
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_on_death_arcade") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_on_death_arcade");
                    // Clear bridge attributes on disable
                    var root = _root || $.GetContextPanel();
                    try { SetOnDeathArcadeBridgeAttributes(root, false, "", ""); } catch(e) {}
                    try { SetOnDeathArcadeEscapeMenuOpen(root, false); } catch(e) {}
                    State.onDeathArcadeWasDead = false;
                    State.onDeathArcadeLastTriggerMs = 0;
                    State.onDeathArcadeRespawnPanel = null;
                    State.onDeathArcadeRequestSerial = 0;
                    State.onDeathArcadeRuntimeWasActive = false;
                    _root = null;
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var respawnTimer = root ? root.FindChildTraverse("respawn_timer") : null;
                var escapeMenu = root ? root.FindChildTraverse("EscapeMenu") : null;
                return {
                    passed: !!(respawnTimer && escapeMenu),
                    name: "On-death arcade panels exist",
                    message: (!respawnTimer ? "respawn_timer not found" : "") + (!escapeMenu ? (respawnTimer ? "" : "") + "EscapeMenu not found" : ""),
                    assertions: [
                        { passed: !!respawnTimer, name: "respawn_timer exists" },
                        { passed: !!escapeMenu, name: "EscapeMenu exists" }
                    ]
                };
            } catch(e) { return { passed: false, name: "On-death arcade panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
