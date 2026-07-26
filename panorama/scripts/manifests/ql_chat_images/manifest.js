// features/ql_chat_images/manifest.js
// =============================================================================
// QOLLOCK — Images In Chat
// =============================================================================
// OWNS:        Inline chat image injection
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_IMAGES_IN_CHAT
// CSS:         none
// PATTERN:     Polling (0.2Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_chat_images: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_chat_images",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_IMAGES_IN_CHAT", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_chat_images", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_chat_images") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_chat_images");
                    logger.clearThrottle("ql_chat_images");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
