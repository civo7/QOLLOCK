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
        enableKey: "HUD_SOULS_ENABLED",
        settings: [
            { key: "HUD_SOULS_ENABLED", type: "toggle", default: true },
            { key: "SOULS_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1.0 },
            { key: "SOULS_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0 },
            { key: "SOULS_Y_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";
            var _loop = null;
            var PANEL_ID = "gold_and_ap_container";

            var _clearStyle = QOL.utils.ClearStyleSafe;

            function _hasNonDefault(cfg) {
                if (!cfg) return false;
                var enabled = (cfg.HUD_SOULS_ENABLED === undefined || cfg.HUD_SOULS_ENABLED === true || Number(cfg.HUD_SOULS_ENABLED) === 1);
                return !enabled ||
                    Number(cfg.SOULS_OPACITY !== undefined ? cfg.SOULS_OPACITY : 1.0) !== 1.0 ||
                    Number(cfg.SOULS_X_OFFSET || 0) !== 0 ||
                    Number(cfg.SOULS_Y_OFFSET || 0) !== 0;
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var panel = root.FindChildTraverse(PANEL_ID);
                if (!panel) return;

                var active = _hasNonDefault(cfg);
                var enabled = (cfg.HUD_SOULS_ENABLED === undefined || cfg.HUD_SOULS_ENABLED === true || Number(cfg.HUD_SOULS_ENABLED) === 1);
                var offsetX = Math.round(Number(active ? cfg.SOULS_X_OFFSET : 0)) || 0;
                var offsetY = Math.round(Number(active ? cfg.SOULS_Y_OFFSET : 0)) || 0;
                var opNum = active ? Number(cfg.SOULS_OPACITY !== undefined ? cfg.SOULS_OPACITY : 1.0) : 1.0;
                if (!isFinite(opNum)) opNum = 1.0;
                var opacityText = opNum.toFixed(2);
                var sig = offsetX + "|" + offsetY + "|" + opacityText + "|" + (enabled ? "1" : "0") + "|" + (active ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                if (panel.SetHasClass) panel.SetHasClass("qol-hidden", !enabled);

                if (active && enabled) {
                    if (offsetX !== 0) panel.style.x = offsetX + "px"; else _clearStyle(panel, "x");
                    if (offsetY !== 0) panel.style.y = (-offsetY) + "px"; else _clearStyle(panel, "y");
                    if (Math.abs(opNum - 1.0) > 0.0001) panel.style.opacity = opacityText; else _clearStyle(panel, "opacity");
                } else {
                    _clearStyle(panel, "x");
                    _clearStyle(panel, "y");
                    _clearStyle(panel, "opacity");
                }
            }

            function _tick() {
                try { _apply(ctx.config.all()); } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_souls", "_tick: " + (e.message || e));
                    }
                }
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all());
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 1.0, "ql_souls") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_souls");
                    _lastSig = "";
                    try {
                        var p = $.GetContextPanel().FindChildTraverse(PANEL_ID);
                        if (p) {
                            var isSupposed = FR && FR.isFeatureSupposedToBeEnabled ? FR.isFeatureSupposedToBeEnabled("ql_souls") : false;
                            if (p.SetHasClass) p.SetHasClass("qol-hidden", !isSupposed);
                            _clearStyle(p, "x");
                            _clearStyle(p, "y");
                            _clearStyle(p, "opacity");
                        }
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var panel = root ? root.FindChildTraverse("gold_and_ap_container") : null;
                if (!panel) return null;  // Skip — not in a match context
                return { passed: true, name: "Souls panel exists", message: "", assertions: [{ passed: true, name: "gold_and_ap_container panel exists" }] };
            } catch(e) { return { passed: false, name: "Souls panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
