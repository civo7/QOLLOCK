// features/ql_bottom_bar/manifest.js
// =============================================================================
// QOLLOCK — Bottom Bar HUD (position, scale, opacity, wash, currency color)
// =============================================================================
// OWNS:        Bottom bar panel styles + currency color wash
// DOES NOT OWN: Signature ability content, items, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: HUD_BOTTOM_BAR_ENABLED, BOTTOM_BAR_OPACITY, BOTTOM_BAR_SCALE,
//              BOTTOM_BAR_X_OFFSET, BOTTOM_BAR_Y_OFFSET, BOTTOM_BAR_WASH_COLOR
// PANEL ID:    bottomBarPanel
// PATTERN:     Event-driven (no polling). Signature diffing preserved.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] bottom_bar: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_bottom_bar",
        enabledByDefault: true,
        settings: [
            { key: "HUD_BOTTOM_BAR_ENABLED", type: "toggle", default: true },
            { key: "BOTTOM_BAR_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1.0 },
            { key: "BOTTOM_BAR_SCALE", type: "slider", min: 0.5, max: 1.5, step: 0.05, default: 1.0 },
            { key: "BOTTOM_BAR_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0 },
            { key: "BOTTOM_BAR_Y_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "BOTTOM_BAR_WASH_COLOR", type: "palette", default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";

            function _hasNonDefault(cfg) {
                return Number(cfg.HUD_BOTTOM_BAR_ENABLED) !== 1 ||
                    Number(cfg.BOTTOM_BAR_OPACITY) !== 1.0 ||
                    Number(cfg.BOTTOM_BAR_SCALE) !== 1.0 ||
                    Number(cfg.BOTTOM_BAR_X_OFFSET) !== 0 ||
                    Number(cfg.BOTTOM_BAR_Y_OFFSET) !== 0 ||
                    Number(cfg.BOTTOM_BAR_WASH_COLOR) !== 0;
            }

            function _applyCurrencyColor(root, washColor) {
                var wc = washColor || "";
                var sr = $.GetContextPanel();
                var ap = sr.FindChildTraverse("APContainer");
                var gap = sr.FindChildTraverse("gold_and_ap_container");
                var containers = [sr];
                if (ap) containers.push(ap);
                if (gap) containers.push(gap);

                var icons = [], amounts = [], infinites = [];
                for (var ci = 0; ci < containers.length; ci++) {
                    var c = containers[ci];
                    if (!c) continue;
                    try {
                        if (c.FindChildrenWithClassTraverse) {
                            icons = icons.concat(c.FindChildrenWithClassTraverse("APCurrencyIcon") || []);
                            amounts = amounts.concat(c.FindChildrenWithClassTraverse("APCurrencyAmount") || []);
                        }
                        if (c.FindChildTraverse) {
                            var inf = c.FindChildTraverse("hudAPInfinite");
                            if (inf) infinites.push(inf);
                        }
                    } catch(e) {}
                }
                for (var ii = 0; ii < icons.length; ii++)
                    try { icons[ii].style.washColor = wc; } catch(e) {}
                for (var ik = 0; ik < infinites.length; ik++)
                    try { infinites[ik].style.washColor = wc; } catch(e) {}
                for (var ij = 0; ij < amounts.length; ij++)
                    try { amounts[ij].style.color = wc; } catch(e) {}
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var bp = root.FindChildTraverse("bottomBarPanel");
                if (!bp) return;

                var active = _hasNonDefault(cfg);
                var enabled = Number(cfg.HUD_BOTTOM_BAR_ENABLED) === 1;
                var ox = Math.round(Number(active ? cfg.BOTTOM_BAR_X_OFFSET : 0)) || 0;
                var oy = Math.round(Number(active ? cfg.BOTTOM_BAR_Y_OFFSET : 0)) || 0;
                var op = active ? Number(cfg.BOTTOM_BAR_OPACITY).toFixed(2) : "1.00";
                var sc = active ? Number(cfg.BOTTOM_BAR_SCALE).toFixed(2) : "1.00";
                var wc = active ? String(cfg.BOTTOM_BAR_WASH_COLOR || "") : "";

                var sig = ox + "|" + oy + "|" + op + "|" + sc + "|" + wc + "|" + (enabled ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                _applyCurrencyColor(root, wc);
                bp.style.x = ox + "px";
                bp.style.y = (-oy) + "px";
                bp.style.preTransformScale2d = sc + ", " + sc;
                if (bp.SetHasClass) bp.SetHasClass("qol-hidden", !enabled);
                try { bp.style.washColor = wc; bp.style.opacity = op; } catch(e) {}
            }

            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    _lastSig = "";
                    try {
                        var root = $.GetContextPanel();
                        _applyCurrencyColor(root, "");
                        var bp = root.FindChildTraverse("bottomBarPanel");
                        if (bp && bp.style) {
                            bp.style.x = "0px"; bp.style.y = "0px";
                            bp.style.preTransformScale2d = "1.00, 1.00";
                            bp.style.opacity = "1.00"; bp.style.washColor = "";
                            if (bp.SetHasClass) bp.SetHasClass("qol-hidden", false);
                        }
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        }
    });
})();
