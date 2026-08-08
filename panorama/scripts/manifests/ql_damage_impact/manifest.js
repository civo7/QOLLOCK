// features/ql_damage_impact/manifest.js
// =============================================================================
// QOLLOCK — Damage Impact HUD (position, scale, opacity)
// =============================================================================
// OWNS:        Damage impact panel: position, scale, opacity, visibility
// DOES NOT OWN: Damage numbers, crosshair, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: ENABLE_DAMAGE_IMPACT, DAMAGE_IMPACT_SCALE, DAMAGE_IMPACT_OPACITY,
//              DAMAGE_IMPACT_X_OFFSET, DAMAGE_IMPACT_Y_OFFSET
// STATE:       State.damageImpactRuntimeStyleSig, State.cachedPanels.damageImpactPanel
// PATTERN:     Event-driven (no polling). Style apply with signature diffing.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] damage_impact: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_damage_impact",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_DAMAGE_IMPACT", type: "toggle", default: true },
            { key: "DAMAGE_IMPACT_SCALE", type: "slider", min: 0.5, max: 2.0, step: 0.05, default: 1.0 },
            { key: "DAMAGE_IMPACT_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1.0 },
            { key: "DAMAGE_IMPACT_X_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 },
            { key: "DAMAGE_IMPACT_Y_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";

            function _hasNonDefault(cfg) {
                if (!cfg) return false;
                return Number(cfg.ENABLE_DAMAGE_IMPACT) !== 1 ||
                    Number(cfg.DAMAGE_IMPACT_SCALE) !== 1.0 ||
                    Number(cfg.DAMAGE_IMPACT_OPACITY) !== 1.0 ||
                    Number(cfg.DAMAGE_IMPACT_X_OFFSET) !== 0 ||
                    Number(cfg.DAMAGE_IMPACT_Y_OFFSET) !== 0;
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                // Resolve panel (with caching fallback — QOL.resolveCachedPanel pattern)
                var panel = null;
                try {
                    if (typeof QOL.resolveCachedPanel === "function") {
                        panel = QOL.resolveCachedPanel(root, "damageImpactPanel", "damage_impact");
                    }
                } catch(e) { /* panel resolution failed, skip this tick */ }
                if (!panel) { panel = root.FindChildTraverse("damage_impact"); }
                if (!panel) return;

                var active = _hasNonDefault(cfg);
                var enabled = Number(cfg.ENABLE_DAMAGE_IMPACT) === 1;
                var ox = Math.round(Number(active ? cfg.DAMAGE_IMPACT_X_OFFSET : 0)) || 0;
                var oy = Math.round(Number(active ? cfg.DAMAGE_IMPACT_Y_OFFSET : 0)) || 0;
                var op = active ? Number(cfg.DAMAGE_IMPACT_OPACITY).toFixed(2) : "1.00";
                var sc = active ? Number(cfg.DAMAGE_IMPACT_SCALE).toFixed(2) : "1.00";

                var sig = ox + "|" + oy + "|" + op + "|" + sc + "|" + (enabled ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                panel.style.x = ox + "px";
                panel.style.y = (-oy) + "px";
                panel.style.opacity = op;
                panel.style.preTransformScale2d = sc + ", " + sc;
                if (panel.SetHasClass) panel.SetHasClass("qol-hidden", !enabled);
            }

            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    _lastSig = "";
                    // Don't force the panel visible — the old feature had no onDisable
                    // and left the panel in whatever state the user configured. Forcing
                    // qol-hidden=false + opacity=1.00 would un-hide a panel the user
                    // explicitly set ENABLE_DAMAGE_IMPACT=0 to hide.
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var panel = root ? root.FindChildTraverse("damage_impact") : null;
                if (!panel) return null;
                return { passed: true, name: "Damage impact panel exists", message: "", assertions: [{ passed: true, name: "damage_impact panel exists" }] };
            } catch(e) { return { passed: false, name: "Damage impact panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
