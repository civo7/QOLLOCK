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
        enableKey: "ENABLE_HIDE_FAILED_HINT",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_HIDE_FAILED_HINT", type: "toggle", default: false }],
        create: function(ctx) {
            function _findHud() {
                var PH = (typeof QOL !== "undefined" && QOL.core && QOL.core.PanelHelpers) ? QOL.core.PanelHelpers : null;
                if (PH && PH.findHud) return PH.findHud();
                var c = $.GetContextPanel();
                if (c && (c.id === "Hud" || (c.paneltype && c.paneltype === "CitadelHud"))) return c;
                return (c && c.FindChildTraverse) ? c.FindChildTraverse("Hud") : c;
            }

            return {
                onEnable: function() {
                    var h = _findHud();
                    if (h) h.AddClass("hide_failed_hint_active");
                },
                onDisable: function() {
                    var h = _findHud();
                    if (h) h.RemoveClass("hide_failed_hint_active");
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var PH = (typeof QOL !== "undefined" && QOL.core && QOL.core.PanelHelpers) ? QOL.core.PanelHelpers : null;
                var hud = PH && PH.findHud ? PH.findHud() : ($.GetContextPanel() ? ($.GetContextPanel().id === "Hud" ? $.GetContextPanel() : $.GetContextPanel().FindChildTraverse("Hud")) : null);
                if (!hud) return null;  // Skip — not in a match context
                return {
                    passed: true,
                    name: "Hud panel exists for class toggle",
                    message: "",
                    assertions: [
                        { passed: true, name: "Hud root panel exists" }
                    ]
                };
            } catch(e) { return { passed: false, name: "Cast failed hint panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
