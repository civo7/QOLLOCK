// features/ql_passive_cooldown/manifest.js
// =============================================================================
// QOLLOCK — Passive Cooldown HUD (CSS class toggle)
// =============================================================================
// OWNS:        CSS class toggle for passive cooldown display
// DOES NOT OWN: Cooldown runtime logic (ql_feat_legacyaudiopassive.js)
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: ENABLE_PASSIVE_COOLDOWN (toggle)
// CSS:         styles/features/ql_feat_passive_cooldown.css
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] passive_cooldown: FeatureRegistry not found — aborting"); return; }
    FR.register({
        id: "ql_passive_cooldown",
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: false }],
        create: function(ctx) {
            function _findHud() {
                var PH = (typeof QOL !== "undefined" && QOL.core && QOL.core.PanelHelpers) ? QOL.core.PanelHelpers : null;
                if (PH && PH.findHud) return PH.findHud();
                var c = $.GetContextPanel();
                if (c && (c.id === "Hud" || (c.paneltype && c.paneltype === "CitadelHud"))) return c;
                return (c && c.FindChildTraverse) ? c.FindChildTraverse("Hud") : c;
            }

            function _apply(cfg) {
                var h = _findHud();
                if (!h) return;
                cfg.ENABLE_PASSIVE_COOLDOWN ? h.AddClass("passive_cooldown_basic_active")
                                            : h.RemoveClass("passive_cooldown_basic_active");
            }
            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    var h = _findHud();
                    if (h) { h.RemoveClass("passive_cooldown_basic_active"); h.RemoveClass("passive_cooldown_advanced_active"); }
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        },
        test: function(ctx) {
            try {
                var PH = (typeof QOL !== "undefined" && QOL.core && QOL.core.PanelHelpers) ? QOL.core.PanelHelpers : null;
                var hud = PH && PH.findHud ? PH.findHud() : ($.GetContextPanel() ? ($.GetContextPanel().id === "Hud" ? $.GetContextPanel() : $.GetContextPanel().FindChildTraverse("Hud")) : null);
                if (!hud) return null;  // Skip — not in a match context
                return { passed: true, name: "Passive cooldown Hud panel exists", message: "", assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch(e) { return { passed: false, name: "Passive cooldown panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
