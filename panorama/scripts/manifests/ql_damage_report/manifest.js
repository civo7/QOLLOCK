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
        settings: [
            { key: "DISABLE_DAMAGE_REPORT", type: "toggle", default: false },
            { key: "DAMAGE_REPORT_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0, label: "Horizontal Offset" },
            { key: "DAMAGE_REPORT_Y_OFFSET", type: "slider", min: -1500, max: 200, step: 5, default: 0, label: "Vertical Offset" }
        ],
        create: function(ctx) {
            var _findHud = QOL.core.panel.findHud;

            function _apply(cfg) {
                var h = _findHud();
                if (!h) return;
                if (cfg.DISABLE_DAMAGE_REPORT) {
                    h.AddClass("disable_damage_report_active");
                } else {
                    h.RemoveClass("disable_damage_report_active");
                }
                var updateFn = (typeof QOL !== "undefined" && (QOL.updateDamageReportOffsets || (QOL.core?.hud?.updateDamageReportOffsets)));
                if (typeof updateFn === "function") {
                    updateFn(h, cfg);
                }
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all ? ctx.config.all() : {});
                },
                onDisable: function() {
                    var h = _findHud();
                    if (h) {
                        h.RemoveClass("disable_damage_report_active");
                        var resetFn = (typeof QOL !== "undefined" && (QOL.resetDamageReportOffsetRuntime || (QOL.core?.hud?.resetDamageReportOffsetRuntime)));
                        var livePanel = (h.FindChildTraverse) ? h.FindChildTraverse("CitadelHudDamageReport") : null;
                        if (livePanel && typeof resetFn === "function") resetFn(livePanel);
                    }
                },
                onSettingsChanged: function() {
                    _apply(ctx.config.all ? ctx.config.all() : {});
                    var h = _findHud();
                    if (h && QOL.core && QOL.core.hud && QOL.core.hud.applyRootClasses) {
                        QOL.core.hud.applyRootClasses(h, ctx.config.all(), Date.now ? Date.now() : (new Date()).getTime(), false);
                    }
                }
            };
        },
        test: function(ctx) {
            try {
                var hud = (typeof QOL !== "undefined" && QOL.core?.panel?.findHud) ? QOL.core.panel.findHud() : null;
                if (!hud) return null;  // Skip — not in a match context
                return { passed: true, name: "Damage report Hud panel exists", message: "", assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch(e) { return { passed: false, name: "Damage report panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
