// features/ql_nicknames/manifest.js
// =============================================================================
// QOLLOCK — Top Bar Player Nicknames
// =============================================================================
// OWNS:        Top bar player nicknames visibility via CSS gating class.
//              Native {s:player_name} binding in citadel_hud_top_bar_player.xml.
// DOES NOT OWN: Player panels (Valve), player name data (game)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.ui.PanelHelpers
// CONFIG KEYS: ENABLE_NICKNAMES (toggle)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] nicknames: FeatureRegistry not found — aborting"); return; }

    var CLASS_NAME = "nicknames_active";

    FR.register({
        id: "ql_nicknames",
        enableKey: "ENABLE_NICKNAMES",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_NICKNAMES", type: "toggle", default: false }
        ],
        create: function(ctx) {
            function _apply(enabled) {
                var root = $.GetContextPanel();
                if (root && root.SetHasClass) {
                    root.SetHasClass(CLASS_NAME, enabled);
                }
                var hud = QOL.ui && QOL.ui.PanelHelpers ? QOL.ui.PanelHelpers.findHud() : null;
                if (hud && hud.SetHasClass) {
                    hud.SetHasClass(CLASS_NAME, enabled);
                    var topBar = hud.FindChildTraverse ? hud.FindChildTraverse("TopBar") : null;
                    if (topBar && topBar.SetHasClass) {
                        topBar.SetHasClass(CLASS_NAME, enabled);
                    }
                }
            }

            return {
                onEnable: function() { _apply(true); },
                onDisable: function() { _apply(false); },
                onSettingsChanged: function() { _apply(Number(ctx.config.get("ENABLE_NICKNAMES")) === 1); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                if (!root || !root.FindChildTraverse) return null;
                var topBar = root.FindChildTraverse("TopBar");
                return {
                    passed: !!topBar,
                    name: "Top bar nicknames check",
                    message: topBar ? "TopBar found" : "TopBar not found",
                    assertions: [
                        { passed: !!topBar, name: "TopBar exists" }
                    ]
                };
            } catch(e) {
                return { passed: false, name: "Nicknames test", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();
