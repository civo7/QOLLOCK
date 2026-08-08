// features/ql_recent_purchases/manifest.js
// =============================================================================
// QOLLOCK — Recent Purchases
// =============================================================================
// OWNS:        Purchase panels, quick popups, hero popups
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_SHOP_RECENT_PURCHASES, ENABLE_SHOP_ITEM_NOTIFICATIONS
// CSS:         none
// PATTERN:     Polling (0.2Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_recent_purchases: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_recent_purchases",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_SHOP_RECENT_PURCHASES", type: "toggle", default: false },
            { key: "ENABLE_SHOP_ITEM_NOTIFICATIONS", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_recent_purchases", "_tick threw: " + (e.message || e));
                    throw e;
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_recent_purchases") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_recent_purchases");
                    logger.clearThrottle("ql_recent_purchases");
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var shop = root ? root.FindChildTraverse("CitadelShop") : null;
            if (!shop) return null;  // Skip — not in a match context
            return { passed: true, name: "Shop panel exists for recent purchases", message: "", assertions: [{ passed: true, name: "CitadelShop panel exists" }] };
        } catch(e) { return { passed: false, name: "Recent purchases panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();
