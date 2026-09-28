// features/ql_bottom_bar/manifest.js
// =============================================================================
// QOLLOCK — Bottom Bar HUD (position, scale, opacity, wash, currency color)
// =============================================================================
// OWNS:        Bottom bar panel styles + currency color wash
// DOES NOT OWN: Signature ability content, items, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: HUD_BOTTOM_BAR_ENABLED, BOTTOM_BAR_OPACITY, BOTTOM_BAR_SCALE,
//              BOTTOM_BAR_X_OFFSET, BOTTOM_BAR_Y_OFFSET, BOTTOM_BAR_WASH_COLOR
// PANEL ID:    hud_signature (cache key was "bottomBarPanel" in old feature)
// PATTERN:     Settings-driven with a slow poll for replaced native panels.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] bottom_bar: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_bottom_bar",
        enabledByDefault: true,
        enableKey: "HUD_BOTTOM_BAR_ENABLED",
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
            var _lastPanel = null;
            var _loop = null;

            function _hasNonDefault(cfg) {
                if (!cfg) return false;
                var enabled = (cfg.HUD_BOTTOM_BAR_ENABLED === undefined || cfg.HUD_BOTTOM_BAR_ENABLED === true || Number(cfg.HUD_BOTTOM_BAR_ENABLED) === 1);
                return !enabled ||
                    Number(cfg.BOTTOM_BAR_OPACITY !== undefined ? cfg.BOTTOM_BAR_OPACITY : 1.0) !== 1.0 ||
                    Number(cfg.BOTTOM_BAR_SCALE !== undefined ? cfg.BOTTOM_BAR_SCALE : 1.0) !== 1.0 ||
                    Number(cfg.BOTTOM_BAR_X_OFFSET || 0) !== 0 ||
                    Number(cfg.BOTTOM_BAR_Y_OFFSET || 0) !== 0 ||
                    Number(cfg.BOTTOM_BAR_WASH_COLOR || 0) !== 0;
            }

            function _applyCurrencyColor(root, washColor) {
                var wc = washColor || "";
                var sr = root || $.GetContextPanel();
                if (!sr) return;
                var ap = sr.FindChildTraverse ? sr.FindChildTraverse("APContainer") : null;
                var gap = sr.FindChildTraverse ? sr.FindChildTraverse("gold_and_ap_container") : null;
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

            var SIGNATURE_UI_SCALE_BASE_PCT = 90;

            var _clearStyle = QOL.utils.ClearStyleSafe;

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var active = _hasNonDefault(cfg);
                var wcIdx = active ? (Math.round(Number(cfg.BOTTOM_BAR_WASH_COLOR)) || 0) : 0;
                var wc = (typeof QOL !== "undefined" && QOL.core && QOL.core.panel && QOL.core.panel.resolvePaletteColor)
                    ? QOL.core.panel.resolvePaletteColor(wcIdx)
                    : ((typeof QOL !== "undefined" && QOL.washColorPalette && wcIdx > 0 && wcIdx < QOL.washColorPalette.length) ? QOL.washColorPalette[wcIdx] : "");

                // Apply currency color BEFORE the panel guard — old feature
                // applies it unconditionally (ql_feat_bottombar.js:93 before guard at :94).
                _applyCurrencyColor(root, wc);

                var bp = root.FindChildTraverse("hud_signature");
                if (bp !== _lastPanel) {
                    _lastPanel = bp;
                    _lastSig = "";
                }
                if (!bp) return;

                var enabled = (cfg.HUD_BOTTOM_BAR_ENABLED === undefined || cfg.HUD_BOTTOM_BAR_ENABLED === true || Number(cfg.HUD_BOTTOM_BAR_ENABLED) === 1);
                var ox = Math.round(Number(active ? cfg.BOTTOM_BAR_X_OFFSET : 0)) || 0;
                var oy = Math.round(Number(active ? cfg.BOTTOM_BAR_Y_OFFSET : 0)) || 0;
                var opNum = active ? Number(cfg.BOTTOM_BAR_OPACITY !== undefined ? cfg.BOTTOM_BAR_OPACITY : 1.0) : 1.0;
                if (!isFinite(opNum)) opNum = 1.0;
                var scNum = active ? Number(cfg.BOTTOM_BAR_SCALE !== undefined ? cfg.BOTTOM_BAR_SCALE : 1.0) : 1.0;
                if (!isFinite(scNum)) scNum = 1.0;

                var op = opNum.toFixed(2);
                var scText = Math.round(SIGNATURE_UI_SCALE_BASE_PCT * scNum) + "%";

                var sig = ox + "|" + oy + "|" + op + "|" + scText + "|" + wcIdx + "|" + (enabled ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                if (ox !== 0) bp.style.x = ox + "px";
                else _clearStyle(bp, "x");

                if (oy !== 0) bp.style.y = (-oy) + "px";
                else _clearStyle(bp, "y");

                _clearStyle(bp, "preTransformScale2d");

                if (Math.abs(scNum - 1.0) > 0.0001) bp.style.uiScale = scText;
                else _clearStyle(bp, "uiScale");

                if (bp.SetHasClass) bp.SetHasClass("qol-hidden", !enabled);

                if (wc) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.panel && QOL.core.panel.setWashColor) {
                        QOL.core.panel.setWashColor(bp, wc);
                    } else {
                        bp.style.washColor = wc;
                    }
                } else {
                    _clearStyle(bp, "washColor");
                }

                if (Math.abs(opNum - 1.0) > 0.0001) bp.style.opacity = op;
                else _clearStyle(bp, "opacity");
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all());
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(function() {
                        var root = $.GetContextPanel();
                        var panel = root && root.FindChildTraverse ? root.FindChildTraverse("hud_signature") : null;
                        if (panel !== _lastPanel) _apply(ctx.config.all());
                    }, 0.5, ctx.id) : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature(ctx.id);
                    _lastSig = "";
                    _lastPanel = null;
                    try {
                        var root = $.GetContextPanel();
                        _applyCurrencyColor(root, "");
                        var bp = root ? root.FindChildTraverse("hud_signature") : null;
                        if (bp && bp.style) {
                            _clearStyle(bp, "x");
                            _clearStyle(bp, "y");
                            _clearStyle(bp, "preTransformScale2d");
                            _clearStyle(bp, "uiScale");
                            _clearStyle(bp, "opacity");
                            _clearStyle(bp, "washColor");
                            var isSupposed = FR && FR.isFeatureSupposedToBeEnabled ? FR.isFeatureSupposedToBeEnabled("ql_bottom_bar") : false;
                            if (bp.SetHasClass) bp.SetHasClass("qol-hidden", !isSupposed);
                        }
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var panel = root ? root.FindChildTraverse("hud_signature") : null;
                if (!panel) return null;  // Skip — not in a match context
                return { passed: true, name: "Bottom bar hud_signature panel exists", message: "", assertions: [{ passed: true, name: "hud_signature panel exists" }] };
            } catch(e) { return { passed: false, name: "Bottom bar panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
