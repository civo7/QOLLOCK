// features/ql_healthbar/manifest.js
// =============================================================================
// QOLLOCK — Healthbar Runtime
// =============================================================================
// OWNS:        Healthbar type dispatcher with variant routing
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: HEALTHBAR_TYPE, PLAYER_HEALTHBAR_SCALE, PLAYER_HEALTHBAR_OPACITY, PLAYER_HEALTHBAR_X_OFFSET, PLAYER_HEALTHBAR_Y_OFFSET, PLAYER_HEALTHBAR_ACCENT_COLOR
// CSS:         none
// PATTERN:     Polling (0.1Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_healthbar: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_healthbar",
        enabledByDefault: true,
        settings: [
            { key: "HEALTHBAR_TYPE", type: "dropdown", options: [0,1,2,3,4,5], default: 0 },
            { key: "PLAYER_HEALTHBAR_SCALE", type: "slider", min: 50, max: 200, step: 1, default: 100 },
            { key: "PLAYER_HEALTHBAR_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "PLAYER_HEALTHBAR_X_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 },
            { key: "PLAYER_HEALTHBAR_Y_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 },
            { key: "PLAYER_HEALTHBAR_ACCENT_COLOR", type: "palette", default: 0 }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_healthbar", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.1, "ql_healthbar") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_healthbar");
                    logger.clearThrottle("ql_healthbar");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
