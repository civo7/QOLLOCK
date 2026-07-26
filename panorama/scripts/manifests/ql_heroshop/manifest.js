// features/ql_heroshop/manifest.js
// =============================================================================
// QOLLOCK — Hero Shop
// =============================================================================
// OWNS:        Shop offset, scale, opacity, simplification
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: HUD_SHOP_ENABLED, SHOP_OFFSET_X, SHOP_OFFSET_Y, SHOP_OPACITY, SHOP_SCALE, ENABLE_SIMPLIFY_SHOP, DISABLE_SHOP_BLUE
// CSS:         none
// PATTERN:     Polling (0.5Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_heroshop: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_heroshop",
        enabledByDefault: false,
        settings: [
            { key: "HUD_SHOP_ENABLED", type: "toggle", default: true },
            { key: "SHOP_OFFSET_X", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "SHOP_OFFSET_Y", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "SHOP_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "SHOP_SCALE", type: "slider", min: 0.5, max: 1.5, step: 0.05, default: 1 },
            { key: "ENABLE_SIMPLIFY_SHOP", type: "toggle", default: false },
            { key: "DISABLE_SHOP_BLUE", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_heroshop", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_heroshop") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_heroshop");
                    logger.clearThrottle("ql_heroshop");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
