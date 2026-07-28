// features/ql_minimap_runtime/manifest.js
// =============================================================================
// QOLLOCK — Minimap Runtime
// =============================================================================
// OWNS:        Minimap zoom, crate/tunnel overlays, icon color
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_ALT_ZOOM, ENABLE_TAB_ZOOM, MINIMAP_BASE_OPACITY, MINIMAL_MINIMAP, MINIMAP_ROTATE_WITH_PLAYER, MINIMAP_FLIP, MINIMAP_ICON_COLOR
// CSS:         none
// PATTERN:     Polling (0.2Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_minimap_runtime: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_minimap_runtime",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_ALT_ZOOM", type: "toggle", default: false },
            { key: "ENABLE_TAB_ZOOM", type: "toggle", default: false },
            { key: "MINIMAP_BASE_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "MINIMAL_MINIMAP", type: "toggle", default: false },
            { key: "MINIMAP_ROTATE_WITH_PLAYER", type: "toggle", default: false },
            { key: "MINIMAP_FLIP", type: "toggle", default: false },
            { key: "MINIMAP_ICON_COLOR", type: "palette", default: 0 }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_minimap_runtime", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_minimap_runtime") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_minimap_runtime");
                    logger.clearThrottle("ql_minimap_runtime");
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var minimap = root ? root.FindChildTraverse("hud_minimap") : null;
            return { passed: !!minimap, name: "Minimap runtime panel exists", message: minimap ? "" : "hud_minimap not found", assertions: [{ passed: !!minimap, name: "hud_minimap panel exists" }] };
        } catch(e) { return { passed: false, name: "Minimap runtime panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();
