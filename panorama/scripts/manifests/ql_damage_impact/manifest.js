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
// PATTERN:     Settings-driven with a slow poll for replaced native panels.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] damage_impact: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_damage_impact",
        // Keep the visibility controller alive when the indicator is hidden so
        // it can hide native panels created after the setting changes.
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_DAMAGE_IMPACT", type: "toggle", default: true },
            { key: "DAMAGE_IMPACT_SCALE", type: "slider", min: 0.5, max: 2.0, step: 0.05, default: 1.0 },
            { key: "DAMAGE_IMPACT_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1.0 },
            { key: "DAMAGE_IMPACT_X_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 },
            { key: "DAMAGE_IMPACT_Y_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";
            var _lastPanel = null;
            var _loop = null;
            var _clearStyle = QOL.utils.ClearStyleSafe;
            var _isAlive = QOL.core.panel.isAlive;

            function _reset(panel) {
                if (!_isAlive(panel)) return;
                _clearStyle(panel, "x");
                _clearStyle(panel, "y");
                _clearStyle(panel, "opacity");
                _clearStyle(panel, "preTransformScale2d");
                _clearStyle(panel, "uiScale");
                if (panel.SetHasClass) panel.SetHasClass("qol-hidden", false);
            }

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
                var panel = root && root.FindChildTraverse ? root.FindChildTraverse("damage_impact") : null;
                if (panel !== _lastPanel) {
                    _reset(_lastPanel);
                    _lastPanel = panel;
                    _lastSig = "";
                }
                if (!panel) return;

                var active = _hasNonDefault(cfg);
                var enabled = Number(cfg.ENABLE_DAMAGE_IMPACT) === 1;
                var ox = Math.round(Number(active ? cfg.DAMAGE_IMPACT_X_OFFSET : 0)) || 0;
                var oy = Math.round(Number(active ? cfg.DAMAGE_IMPACT_Y_OFFSET : 0)) || 0;
                var op = active ? Number(cfg.DAMAGE_IMPACT_OPACITY).toFixed(2) : "1.00";
                var sc = active ? Number(cfg.DAMAGE_IMPACT_SCALE).toFixed(2) : "1.00";

                var sig = ox + "|" + oy + "|" + op + "|" + sc + "|" + (enabled ? "1" : "0") + "|" + (active ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                if (!active) {
                    _reset(panel);
                    return;
                }

                panel.style.x = ox + "px";
                panel.style.y = (-oy) + "px";
                panel.style.opacity = op;
                panel.style.preTransformScale2d = "1.00, 1.00";
                // Vanilla Deadlock baseline for .damageImpactContainer is ui-scale: 80% (hud_damage_impact.css:10)
                var baseScalePercent = 80;
                panel.style.uiScale = Math.round(Number(sc) * baseScalePercent) + "%";
                if (panel.SetHasClass) panel.SetHasClass("qol-hidden", !enabled);
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all());
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(function() {
                        var root = $.GetContextPanel();
                        var current = root && root.FindChildTraverse ? root.FindChildTraverse("damage_impact") : null;
                        if (current !== _lastPanel) _apply(ctx.config.all());
                    }, 0.5, ctx.id) : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature(ctx.id);
                    _lastSig = "";
                    _reset(_lastPanel);
                    _lastPanel = null;
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
