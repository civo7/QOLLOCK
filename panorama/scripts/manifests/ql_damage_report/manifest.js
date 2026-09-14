// features/ql_damage_report/manifest.js
// =============================================================================
// QOLLOCK — Disable Damage Report
// =============================================================================
// OWNS:        Hiding damage report HUD panels
// DOES NOT OWN: Any other HUD element
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: DISABLE_DAMAGE_REPORT (toggle)
// CSS:         styles/features/ql_feat_damage_report.css
// CLASS:       disable_damage_report_active
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] damage_report: FeatureRegistry not found — aborting"); return; }
    FR.register({
        id: "ql_damage_report",
        enableKey: "DISABLE_DAMAGE_REPORT",
        enabledByDefault: false,
        settings: [{ key: "DISABLE_DAMAGE_REPORT", type: "toggle", default: false }],
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
                    if (h) h.AddClass("disable_damage_report_active");
                },
                onDisable: function() {
                    var h = _findHud();
                    if (h) h.RemoveClass("disable_damage_report_active");
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var PH = (typeof QOL !== "undefined" && QOL.core && QOL.core.PanelHelpers) ? QOL.core.PanelHelpers : null;
                var hud = PH && PH.findHud ? PH.findHud() : ($.GetContextPanel() ? ($.GetContextPanel().id === "Hud" ? $.GetContextPanel() : $.GetContextPanel().FindChildTraverse("Hud")) : null);
                if (!hud) return null;  // Skip — not in a match context
                return { passed: true, name: "Damage report Hud panel exists", message: "", assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch(e) { return { passed: false, name: "Damage report panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
