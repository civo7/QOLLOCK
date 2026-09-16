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
            { key: "ENABLE_HIDE_COSMETIC_ABILITY", type: "toggle", default: false },
            { key: "ENABLE_HIDE_ABILITY_SUGGESTION", type: "toggle", invert: true, default: false, label: "Ability Suggestion", description: "Highlighted abilities showing you what you should upgrade depending on build." },
            { key: "ENABLE_CLEAN_STACKS", type: "toggle", default: false, label: "Clean Stacks", description: "Move ability stacks to bottom-center of ability icon" }
        ],
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
                cfg.ENABLE_SIMPLIFY_ABILITY_ICONS ? h.AddClass("simplify_ability_icons_active")
                                                   : h.RemoveClass("simplify_ability_icons_active");
                cfg.ENABLE_HIDE_COSMETIC_ABILITY ? h.AddClass("hide_cosmetic_ability_active")
                                                  : h.RemoveClass("hide_cosmetic_ability_active");
                cfg.ENABLE_HIDE_ABILITY_SUGGESTION ? h.AddClass("hide_ability_suggestion_active")
                                                    : h.RemoveClass("hide_ability_suggestion_active");
                cfg.ENABLE_CLEAN_STACKS ? h.AddClass("clean_stacks_active")
                                         : h.RemoveClass("clean_stacks_active");
            }
            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    var h = _findHud();
                    if (h) {
                        h.RemoveClass("simplify_ability_icons_active");
                        h.RemoveClass("hide_cosmetic_ability_active");
                        h.RemoveClass("hide_ability_suggestion_active");
                        h.RemoveClass("clean_stacks_active");
                    }
                },
                onSettingsChanged: function() {
                    _apply(ctx.config.all());
                    var h = _findHud();
                    if (h && QOL.core && QOL.core.hud && QOL.core.hud.applyRootClasses) {
                        QOL.core.hud.applyRootClasses(h, ctx.config.all(), Date.now ? Date.now() : (new Date()).getTime(), false);
                    }
                }
            };
        },
        test: function(ctx) {
            try {
                var PH = (typeof QOL !== "undefined" && QOL.core && QOL.core.PanelHelpers) ? QOL.core.PanelHelpers : null;
                var hud = PH && PH.findHud ? PH.findHud() : ($.GetContextPanel() ? ($.GetContextPanel().id === "Hud" ? $.GetContextPanel() : $.GetContextPanel().FindChildTraverse("Hud")) : null);
                if (!hud) return null;  // Skip — not in a match context
                return { passed: true, name: "Ability icons Hud panel exists", message: "", assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch(e) { return { passed: false, name: "Ability icons panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
