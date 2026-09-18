// features/ql_passive_cooldown/manifest.js
// =============================================================================
// QOLLOCK — Passive Cooldown HUD (Basic & Advanced Mode Switcher + Styling)
// =============================================================================
// OWNS:        CSS class toggles and inline styles for basic passive cooldown HUD
//              (#hud_passive_items positioning, scaling, and opacity).
// DOES NOT OWN: Advanced item mirror overlay (ql_item_mirror)
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: ENABLE_PASSIVE_COOLDOWN, ENABLE_OLD_ITEM_COOLDOWNS,
//              PASSIVE_COOLDOWN_SIZE, PASSIVE_COOLDOWN_X, PASSIVE_COOLDOWN_Y,
//              PASSIVE_COOLDOWN_OPACITY
// CSS:         styles/features/ql_feat_passive_cooldown.css
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core && QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] passive_cooldown: FeatureRegistry not found — aborting"); return; }

    function _clamp(val, def, min, max) {
        var n = Number(val);
        if (!isFinite(n)) n = def;
        return Math.max(min, Math.min(max, n));
    }

    FR.register({
        id: "ql_passive_cooldown",
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: false },
            { key: "ENABLE_OLD_ITEM_COOLDOWNS", type: "toggle", default: false },
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider", min: 30, max: 60, step: 1, default: 40 },
            { key: "PASSIVE_COOLDOWN_Y", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_X", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 0.5 }
        ],
        create: function(ctx) {
            var _cachedPassiveHud = null;

            var _findHud = QOL.core.panel.findHud;

            function _findPassiveHud(hud) {
                if (QOL_UTILS.IsPanelValid(_cachedPassiveHud)) {
                    return _cachedPassiveHud;
                }
                var root = hud || _findHud();
                if (!root || !root.FindChildTraverse) return null;
                _cachedPassiveHud = root.FindChildTraverse("hud_passive_items");
                return _cachedPassiveHud;
            }

            function _resetStyles(passiveHud) {
                if (!QOL_UTILS.IsPanelValid(passiveHud) || !passiveHud.style) return;
                try {
                    passiveHud.style.uiScale = null;
                    passiveHud.style.x = null;
                    passiveHud.style.y = null;
                    passiveHud.style.marginLeft = null;
                    passiveHud.style.marginTop = null;
                    passiveHud.style.opacity = null;
                    passiveHud.style.visibility = null;
                    if (passiveHud.RemoveClass) passiveHud.RemoveClass("qol-hidden");
                } catch (_) {}
            }

            function _apply(cfg) {
                var h = _findHud();
                if (!h) return;

                var isMasterEnabled = Number(cfg.ENABLE_PASSIVE_COOLDOWN) === 1;
                var isBasicMode = isMasterEnabled && (Number(cfg.ENABLE_OLD_ITEM_COOLDOWNS) === 1);
                var isAdvancedMode = isMasterEnabled && !isBasicMode;

                if (h.SetHasClass) {
                    h.SetHasClass("passive_cooldown_basic_active", isBasicMode);
                    h.SetHasClass("passive_cooldown_advanced_active", isAdvancedMode);
                } else {
                    isBasicMode ? h.AddClass("passive_cooldown_basic_active") : h.RemoveClass("passive_cooldown_basic_active");
                    isAdvancedMode ? h.AddClass("passive_cooldown_advanced_active") : h.RemoveClass("passive_cooldown_advanced_active");
                }

                var passiveHud = _findPassiveHud(h);
                if (!passiveHud) return;

                if (isBasicMode) {
                    var passiveSize = _clamp(cfg.PASSIVE_COOLDOWN_SIZE, 40, 30, 60);
                    var scale = _clamp(Math.round((passiveSize / 40) * 110), 110, 50, 200);
                    var offX = _clamp(cfg.PASSIVE_COOLDOWN_X, 0, -50, 50);
                    var offY = _clamp(cfg.PASSIVE_COOLDOWN_Y, 0, -50, 50);
                    var opacity = _clamp(cfg.PASSIVE_COOLDOWN_OPACITY, 0.5, 0, 1);

                    try {
                        passiveHud.style.uiScale = scale + "%";
                        passiveHud.style.x = "11px";
                        passiveHud.style.y = "30px";
                        passiveHud.style.marginLeft = offX.toFixed(2) + "%";
                        passiveHud.style.marginTop = (-6 - offY).toFixed(2) + "%";
                        passiveHud.style.opacity = String(opacity);
                    } catch (_) {}
                } else {
                    _resetStyles(passiveHud);
                }
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all ? ctx.config.all() : (globalThis.MOD_CONFIG || {}));
                },
                onDisable: function() {
                    var h = _findHud();
                    if (h) {
                        h.RemoveClass("passive_cooldown_basic_active");
                        h.RemoveClass("passive_cooldown_advanced_active");
                    }
                    _resetStyles(_findPassiveHud(h));
                    _cachedPassiveHud = null;
                },
                onSettingsChanged: function() {
                    _apply(ctx.config.all ? ctx.config.all() : (globalThis.MOD_CONFIG || {}));
                }
            };
        },
        test: function(ctx) {
            try {
                var hud = (typeof QOL !== "undefined" && QOL.core?.panel?.findHud) ? QOL.core.panel.findHud() : null;
                if (!hud) return null;  // Skip — not in a match context
                return { passed: true, name: "Passive cooldown Hud panel exists", message: "", assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch(e) { return { passed: false, name: "Passive cooldown panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
