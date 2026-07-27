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
            function _apply(cfg) {
                var h = $.GetContextPanel().FindChildTraverse("Hud");
                if (!h) return;
                cfg.ENABLE_PASSIVE_COOLDOWN ? h.AddClass("passive_cooldown_basic_active")
                                            : h.RemoveClass("passive_cooldown_basic_active");
            }
            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    var h = $.GetContextPanel().FindChildTraverse("Hud");
                    if (h) { h.RemoveClass("passive_cooldown_basic_active"); h.RemoveClass("passive_cooldown_advanced_active"); }
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        }
    });
})();
