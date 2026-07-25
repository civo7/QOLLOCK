// features/ql_topbar/manifest.js
// =============================================================================
// QOLLOCK — Top Bar HUD (position, scale, opacity, visibility)
// =============================================================================
// OWNS:        Top bar panel: position, scale, opacity, visibility, HUD state
// DOES NOT OWN: Top bar content (scores, timers, player panels)
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: HUD_TOP_BAR_ENABLED, TOP_BAR_OPACITY, TOP_BAR_SCALE,
//              TOP_BAR_X_OFFSET, TOP_BAR_Y_OFFSET
// PANEL ID:    TopBar
// PATTERN:     Event-driven. Clears inline opacity on hide so CSS can take over.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] topbar: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_topbar",
        enabledByDefault: true,
        settings: [
            { key: "HUD_TOP_BAR_ENABLED", type: "toggle", default: true },
            { key: "TOP_BAR_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1.0 },
            { key: "TOP_BAR_SCALE", type: "slider", min: 0.5, max: 1.5, step: 0.05, default: 1.0 },
            { key: "TOP_BAR_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0 },
            { key: "TOP_BAR_Y_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";

            function _hasNonDefault(cfg) {
                return Number(cfg.HUD_TOP_BAR_ENABLED) !== 1 ||
                    Number(cfg.TOP_BAR_OPACITY) !== 1.0 ||
                    Number(cfg.TOP_BAR_SCALE) !== 1.0 ||
                    Number(cfg.TOP_BAR_X_OFFSET) !== 0 ||
                    Number(cfg.TOP_BAR_Y_OFFSET) !== 0;
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var topBar = root.FindChildTraverse("TopBar");
                if (!topBar) return;

                var active = _hasNonDefault(cfg);
                var enabled = Number(cfg.HUD_TOP_BAR_ENABLED) === 1;
                var ox = Math.round(Number(active ? cfg.TOP_BAR_X_OFFSET : 0)) || 0;
                var oy = Math.round(Number(active ? cfg.TOP_BAR_Y_OFFSET : 0)) || 0;
                var op = active ? Number(cfg.TOP_BAR_OPACITY).toFixed(2) : "1.00";
                var sc = active ? Number(cfg.TOP_BAR_SCALE).toFixed(2) : "1.00";
                var shouldShow = enabled;

                var sig = ox + "|" + oy + "|" + op + "|" + sc + "|" + (enabled ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                if (topBar.SetHasClass) topBar.SetHasClass("qol-hidden", !shouldShow);
                if (shouldShow) {
                    topBar.style.x = ox + "px";
                    topBar.style.y = (-oy) + "px";
                    topBar.style.preTransformScale2d = sc + ", " + sc;
                    try { topBar.style.opacity = op; } catch(e) {}
                } else {
                    try { delete topBar.style.opacity; } catch(e) { topBar.style.opacity = ""; }
                }
            }

            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    _lastSig = "";
                    try {
                        var p = $.GetContextPanel().FindChildTraverse("TopBar");
                        if (p && p.style) {
                            p.style.x = "0px"; p.style.y = "0px";
                            p.style.preTransformScale2d = "1.00, 1.00";
                            try { delete p.style.opacity; } catch(e) { p.style.opacity = ""; }
                            if (p.SetHasClass) p.SetHasClass("qol-hidden", false);
                        }
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        }
    });
})();
