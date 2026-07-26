// features/ql_unsecured_souls_timer/manifest.js
// =============================================================================
// QOLLOCK — Unsecured Souls Timer
// =============================================================================
// OWNS:        Unsecured soul decay rate + ETA overlay
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_UNSECURED_SOUL_TIMER
// CSS:         none
// PATTERN:     Polling (0.2Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_unsecured_souls_timer: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_unsecured_souls_timer",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_UNSECURED_SOUL_TIMER", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_unsecured_souls_timer", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_unsecured_souls_timer") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_unsecured_souls_timer");
                    logger.clearThrottle("ql_unsecured_souls_timer");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
