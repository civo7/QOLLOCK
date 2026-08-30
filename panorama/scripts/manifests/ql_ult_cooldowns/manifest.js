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
    var MAX_PLAYERS = 12;

    FR.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_ULT_COOLDOWNS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_ULT_COOLDOWNS", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var _topBar = null;
            var _slots = []; // per-player { hidden, shown, playerPanel } cache

            function _isAlive(p) {
                return !!(p && typeof p.IsValid === "function" && p.IsValid());
            }

            function _isAttached(panel) {
                var cursor = panel;
                while (cursor && cursor.GetParent) {
                    if (cursor === _topBar) { return true; }
                    cursor = cursor.GetParent();
                }
                return false;
            }

            function _ensureSlot(i) {
                var slot = _slots[i];
                if (
                    slot &&
                    _isAlive(slot.hidden) &&
                    _isAlive(slot.shown) &&
                    _isAttached(slot.playerPanel)
                ) {
                    return slot;
                }

                if (!_isAlive(_topBar)) return null;

                // Player panels are 1-indexed (TopBarPlayer1..12); slot 0..11
                var playerPanel = _topBar.FindChildTraverse("TopBarPlayer" + (i + 1));
                if (!_isAlive(playerPanel)) {
                    _slots[i] = null;
                    return null;
                }
                var hidden = playerPanel.FindChildTraverse("UltimateCooldownTextHidden");
                var shown = playerPanel.FindChildTraverse("UltimateCooldownTextShown");
                if (!_isAlive(hidden) || !_isAlive(shown)) {
                    _slots[i] = null;
                    return null;
                }
                slot = { playerPanel: playerPanel, hidden: hidden, shown: shown };
                _slots[i] = slot;
                return slot;
            }

            function _tick() {
                if (!_isAlive(_topBar)) {
                    var hud = QOL.ui && QOL.ui.PanelHelpers ? QOL.ui.PanelHelpers.findHud() : null;
                    if (!hud || !_isAlive(hud)) return;
                    _topBar = hud.FindChildTraverse("TopBar");
                    if (!_isAlive(_topBar)) return;
                    _topBar.SetHasClass(CLASS_NAME, true);
                    hud.SetHasClass(CLASS_NAME, true);
                    _slots = [];
                }

                for (var i = 0; i < MAX_PLAYERS; i++) {
                    var slot = _ensureSlot(i);
                    if (!slot) continue;

                    var hText = slot.hidden.text;
                    if (typeof hText !== "string") continue;
                    if (slot.shown.text !== hText) {
                        slot.shown.text = hText;
                    }
                }
            }

            return {
                onEnable: function() {
                    try {
                        var hud = QOL.ui && QOL.ui.PanelHelpers ? QOL.ui.PanelHelpers.findHud() : null;
                        if (hud && _isAlive(hud)) {
                            hud.SetHasClass(CLASS_NAME, true);
                            _topBar = hud.FindChildTraverse("TopBar");
                            if (_isAlive(_topBar)) {
                                _topBar.SetHasClass(CLASS_NAME, true);
                            }
                        }
                        var S = QOL.core.Scheduler;
                        _loop = S && S.createPollLoop ? S.createPollLoop(_tick, POLL_INTERVAL, FEATURE_ID) : null;
                    } catch(e) {
                        $.Msg("[QOLLock][ERROR][" + FEATURE_ID + "] onEnable: " + (e && e.message ? e.message : String(e)));
                    }
                },
                onDisable: function() {
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
                        var hud = QOL.ui && QOL.ui.PanelHelpers ? QOL.ui.PanelHelpers.findHud() : null;
                        if (hud && _isAlive(hud)) {
                            hud.SetHasClass(CLASS_NAME, false);
                        }
                        _topBar = null;
                        _slots = [];
                    } catch(e) {
                        $.Msg("[QOLLock][ERROR][" + FEATURE_ID + "] onDisable: " + (e && e.message ? e.message : String(e)));
                    }
                },
                onSettingsChanged: function() {}
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
