// features/ql_rejuv_timers/manifest.js
// =============================================================================
// QOLLOCK — Rejuv Timers
// =============================================================================
// OWNS:        Rejuv/buff HUD timers + minimap objectives
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_REJUV_HUD, ENABLE_BUFF_HUD, ENABLE_MINIMAP_REJUV_TIMER, ENABLE_MINIMAP_BUFF_TIMER
// CSS:         none
// PATTERN:     Polling (0.3Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_rejuv_timers: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_rejuv_timers",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_REJUV_HUD", type: "toggle", default: false },
            { key: "ENABLE_BUFF_HUD", type: "toggle", default: false },
            { key: "ENABLE_MINIMAP_REJUV_TIMER", type: "toggle", default: false },
            { key: "ENABLE_MINIMAP_BUFF_TIMER", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_rejuv_timers", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.3, "ql_rejuv_timers") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_rejuv_timers");
                    logger.clearThrottle("ql_rejuv_timers");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
