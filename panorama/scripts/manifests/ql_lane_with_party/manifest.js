// features/ql_lane_with_party/manifest.js
// =============================================================================
// QOLLOCK — Lane With Party
// =============================================================================
// OWNS:        Auto-select 'With Party' lane preference
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_LANE_WITH_PARTY
// CSS:         none
// PATTERN:     Polling (0.5Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_lane_with_party: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_lane_with_party",
        enableKey: "ENABLE_LANE_WITH_PARTY",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_LANE_WITH_PARTY", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_lane_with_party", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_lane_with_party") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_lane_with_party");
                    logger.clearThrottle("ql_lane_with_party");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
