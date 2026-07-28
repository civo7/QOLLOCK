// features/ql_better_unsecured_hud/manifest.js
// =============================================================================
// QOLLOCK — Better Unsecured HUD
// =============================================================================
// OWNS:        Mirrored unsecured souls overlay
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_BETTER_UNSECURED
// CSS:         none
// PATTERN:     Polling (0.2Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_better_unsecured_hud: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_better_unsecured_hud",
        enableKey: "ENABLE_BETTER_UNSECURED",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_BETTER_UNSECURED", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_better_unsecured_hud", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_better_unsecured_hud") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_better_unsecured_hud");
                    logger.clearThrottle("ql_better_unsecured_hud");
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var hud = root ? root.FindChildTraverse("gameplay_hud") : null;
            return { passed: !!hud, name: "Gameplay HUD exists for unsecured overlay", message: hud ? "" : "gameplay_hud not found", assertions: [{ passed: !!hud, name: "gameplay_hud panel exists" }] };
        } catch(e) { return { passed: false, name: "Better unsecured HUD check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();
