// features/ql_ability_icons/manifest.js
// =============================================================================
// QOLLOCK — Ability Icons (Simplify / Hide Cosmetic)
// =============================================================================
// OWNS:        Toggling ability icon CSS classes on the Hud root
// DOES NOT OWN: Ability functionality, other HUD elements
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: ENABLE_SIMPLIFY_ABILITY_ICONS, ENABLE_HIDE_COSMETIC_ABILITY
// CSS:         styles/features/ql_feat_ability_icons.css
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ability_icons: FeatureRegistry not found — aborting"); return; }
    FR.register({
        id: "ql_ability_icons",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_SIMPLIFY_ABILITY_ICONS", type: "toggle", default: false },
            { key: "ENABLE_HIDE_COSMETIC_ABILITY", type: "toggle", default: false }
        ],
        create: function(ctx) {
            function _apply(cfg) {
                var h = $.GetContextPanel().FindChildTraverse("Hud");
                if (!h) return;
                cfg.ENABLE_SIMPLIFY_ABILITY_ICONS ? h.AddClass("simplify_ability_icons_active")
                                                   : h.RemoveClass("simplify_ability_icons_active");
                cfg.ENABLE_HIDE_COSMETIC_ABILITY ? h.AddClass("hide_cosmetic_ability_active")
                                                  : h.RemoveClass("hide_cosmetic_ability_active");
            }
            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    var h = $.GetContextPanel().FindChildTraverse("Hud");
                    if (h) { h.RemoveClass("simplify_ability_icons_active"); h.RemoveClass("hide_cosmetic_ability_active"); }
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        }
    });
})();
