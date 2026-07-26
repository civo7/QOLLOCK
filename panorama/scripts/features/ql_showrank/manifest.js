// features/ql_showrank/manifest.js
// =============================================================================
// QOLLOCK — Show Rank
// =============================================================================
// OWNS:        Rank prediction badges on top bar + escape menu
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: SHOW_RANK, SHOW_RANK_TOPBAR
// CSS:         none
// PATTERN:     Polling (0.1Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_showrank: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_showrank",
        enabledByDefault: false,
        settings: [
            { key: "SHOW_RANK", type: "toggle", default: false },
            { key: "SHOW_RANK_TOPBAR", type: "toggle", default: true }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_showrank", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.1, "ql_showrank") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_showrank");
                    logger.clearThrottle("ql_showrank");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
