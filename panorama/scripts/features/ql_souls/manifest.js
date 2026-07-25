// features/ql_souls/manifest.js
// =============================================================================
// QOLLOCK — Souls HUD (position, opacity, visibility)
// =============================================================================
// OWNS:        Souls/gold-and-AP container: position, opacity, visibility
// DOES NOT OWN: Souls content, game economy
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: HUD_SOULS_ENABLED, SOULS_OPACITY, SOULS_X_OFFSET, SOULS_Y_OFFSET
// PANEL ID:    gold_and_ap_container
// PATTERN:     Event-driven. Style apply with signature diffing.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] souls: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_souls",
        enabledByDefault: true,
        settings: [
            { key: "HUD_SOULS_ENABLED", type: "toggle", default: true },
            { key: "SOULS_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1.0 },
            { key: "SOULS_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0 },
            { key: "SOULS_Y_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";
            var PANEL_ID = "gold_and_ap_container";

            function _hasNonDefault(cfg) {
                return Number(cfg.HUD_SOULS_ENABLED) !== 1 ||
                    Number(cfg.SOULS_OPACITY) !== 1.0 ||
                    Number(cfg.SOULS_X_OFFSET) !== 0 ||
                    Number(cfg.SOULS_Y_OFFSET) !== 0;
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var panel = root.FindChildTraverse(PANEL_ID);
                if (!panel) return;

                var active = _hasNonDefault(cfg);
                var enabled = Number(cfg.HUD_SOULS_ENABLED) === 1;
                var ox = Math.round(Number(active ? cfg.SOULS_X_OFFSET : 0)) || 0;
                var oy = Math.round(Number(active ? cfg.SOULS_Y_OFFSET : 0)) || 0;
                var op = active ? Number(cfg.SOULS_OPACITY).toFixed(2) : "1.00";
                var sig = ox + "|" + oy + "|" + op + "|" + (enabled ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                panel.style.x = ox + "px";
                panel.style.y = (-oy) + "px";
                if (panel.SetHasClass) panel.SetHasClass("qol-hidden", !enabled);
                try { panel.style.opacity = op; } catch(e) {}
            }

            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    _lastSig = "";
                    try {
                        var p = $.GetContextPanel().FindChildTraverse(PANEL_ID);
                        if (p && p.style) {
                            p.style.x = "0px"; p.style.y = "0px"; p.style.opacity = "1.00";
                            if (p.SetHasClass) p.SetHasClass("qol-hidden", false);
                        }
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        }
    });
})();
