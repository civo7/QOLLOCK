// features/ql_target_shapes/manifest.js
// =============================================================================
// QOLLOCK — Target Shapes
// =============================================================================
// OWNS:        Unit target shape size, opacity, red diamond
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_RED_DIAMOND, UNIT_TARGET_SIZE, UNIT_TARGET_OPACITY, UNIT_TARGET_HINT_SIZE
// CSS:         none
// PATTERN:     Polling (0.2Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_target_shapes: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_target_shapes",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_RED_DIAMOND", type: "toggle", default: false },
            { key: "UNIT_TARGET_SIZE", type: "slider", min: 50, max: 300, step: 5, default: 150 },
            { key: "UNIT_TARGET_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "UNIT_TARGET_HINT_SIZE", type: "slider", min: 50, max: 200, step: 5, default: 100 }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_target_shapes", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_target_shapes") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_target_shapes");
                    logger.clearThrottle("ql_target_shapes");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
