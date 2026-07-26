// features/ql_urn_timer/manifest.js
// =============================================================================
// QOLLOCK — Urn Timer
// =============================================================================
// OWNS:        Unstable Rift countdown in top bar
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_URN_TIMER
// CSS:         none
// PATTERN:     Polling (0.5Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_urn_timer: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_urn_timer",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_URN_TIMER", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_urn_timer", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_urn_timer") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_urn_timer");
                    logger.clearThrottle("ql_urn_timer");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
