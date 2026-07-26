// features/ql_cast_failed_hint/manifest.js
// =============================================================================
// QOLLOCK — Cast Failed Hint
// =============================================================================
// OWNS:        Hiding the #cast_failed_box element
// DOES NOT OWN: Any other HUD element
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: ENABLE_HIDE_FAILED_HINT (toggle)
// CSS:         styles/features/ql_feat_cast_failed.css
// CLASS:       hide_failed_hint_active
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] cast_failed_hint: FeatureRegistry not found — aborting"); return; }
    FR.register({
        id: "ql_cast_failed_hint",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_HIDE_FAILED_HINT", type: "toggle", default: false }],
        create: function(ctx) {
            return {
                onEnable: function() {
                    var h = $.GetContextPanel().FindChildTraverse("Hud");
                    if (h) h.AddClass("hide_failed_hint_active");
                },
                onDisable: function() {
                    var h = $.GetContextPanel().FindChildTraverse("Hud");
                    if (h) h.RemoveClass("hide_failed_hint_active");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
