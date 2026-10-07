// features/ql_bottom_bar/manifest.js
// =============================================================================
// QOLLOCK — Bottom Bar HUD (ability bar and active-item slot geometry)
// =============================================================================
// OWNS:        Bottom bar panel styles, active-item slot geometry + currency color wash
// DOES NOT OWN: Signature/active-item content, purchased items, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: HUD_BOTTOM_BAR_ENABLED, BOTTOM_BAR_OPACITY, BOTTOM_BAR_SCALE,
//              BOTTOM_BAR_X_OFFSET, BOTTOM_BAR_Y_OFFSET, BOTTOM_BAR_WASH_COLOR,
//              ACTIVE_ITEMS_SCALE, ACTIVE_ITEMS_X_OFFSET, ACTIVE_ITEMS_Y_OFFSET
// PANEL IDS:   hud_signature, ActiveAbilitiesMenu
// PATTERN:     Settings-driven with a slow poll for replaced native panels.
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
            { key: "BOTTOM_BAR_X_OFFSET", type: "slider", min: -2000, max: 2000, step: 1, default: 0 },
            { key: "BOTTOM_BAR_Y_OFFSET", type: "slider", min: -2000, max: 2000, step: 1, default: 0 },
            { key: "BOTTOM_BAR_WASH_COLOR", type: "palette", default: 0 },
            { key: "ACTIVE_ITEMS_SCALE", type: "slider", min: 50, max: 250, step: 1, default: 100 },
            { key: "ACTIVE_ITEMS_X_OFFSET", type: "slider", min: -2000, max: 2000, step: 1, default: 0 },
            { key: "ACTIVE_ITEMS_Y_OFFSET", type: "slider", min: -2000, max: 2000, step: 1, default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";
            var _lastPanel = null;
            var _visibilityOverride = false;
            var _lastParent = null;
            var _lastRoot = null;
            var _nextFullSearchMs = 0;
            var _lastActiveItemsSig = "";
            var _lastActiveItemsPanel = null;
            var _lastActiveItemsParent = null;
            var _lastActiveItemsRoot = null;
            var _nextActiveItemsFullSearchMs = 0;
            var _loop = null;
            var _offsetXApplied = false;
            var _offsetYApplied = false;
            var _activeItemsScaleApplied = false;
            var _activeItemsOffsetXApplied = false;
            var _activeItemsOffsetYApplied = false;

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

            function _releaseOffset(panel, prop, hadOffset) {
                if (hadOffset) panel.style[prop] = "0px";
                _clearStyle(panel, prop);
            }

            function _findBar(root) {
                if (!root) return null;
                // The live panel's parent is authoritative even when the native
                // bar is replaced. A direct-child check avoids a full HUD walk.
                if (_lastRoot === root && QOL.utils.IsPanelValid(_lastParent) && _lastParent.FindChild) {
                    try {
                        var direct = _lastParent.FindChild("hud_signature");
                        if (QOL.utils.IsPanelValid(direct) && Date.now() < _nextFullSearchMs) return direct;
                    } catch(e) {}
                }
                _nextFullSearchMs = Date.now() + 5000;
                return root.FindChildTraverse ? root.FindChildTraverse("hud_signature") : null;
            }

            function _findActiveItems(root) {
                if (!root) return null;
                if (_lastActiveItemsRoot === root && QOL.utils.IsPanelValid(_lastActiveItemsParent) && _lastActiveItemsParent.FindChild) {
                    try {
                        var direct = _lastActiveItemsParent.FindChild("ActiveAbilitiesMenu");
                        if (QOL.utils.IsPanelValid(direct) && Date.now() < _nextActiveItemsFullSearchMs) return direct;
                    } catch(e) {}
                }
                _nextActiveItemsFullSearchMs = Date.now() + 5000;
                return root.FindChildTraverse ? root.FindChildTraverse("ActiveAbilitiesMenu") : null;
            }

            function _applyActiveItems(root, cfg) {
                var panel = _findActiveItems(root);
                if (panel !== _lastActiveItemsPanel) {
                    _lastActiveItemsPanel = panel;
                    _lastActiveItemsRoot = root;
                    try { _lastActiveItemsParent = panel && panel.GetParent ? panel.GetParent() : null; }
                    catch(e) { _lastActiveItemsParent = null; }
                    _lastActiveItemsSig = "";
                    _activeItemsScaleApplied = false;
                    _activeItemsOffsetXApplied = false;
                    _activeItemsOffsetYApplied = false;
                }
                if (!panel) return;

                var scale = Math.round(Number(cfg.ACTIVE_ITEMS_SCALE !== undefined ? cfg.ACTIVE_ITEMS_SCALE : 100));
                if (!isFinite(scale)) scale = 100;
                if (scale < 50) scale = 50;
                if (scale > 250) scale = 250;
                var ox = Math.round(Number(cfg.ACTIVE_ITEMS_X_OFFSET || 0)) || 0;
                var oy = Math.round(Number(cfg.ACTIVE_ITEMS_Y_OFFSET || 0)) || 0;
                if (ox < -2000) ox = -2000;
                if (ox > 2000) ox = 2000;
                if (oy < -2000) oy = -2000;
                if (oy > 2000) oy = 2000;

                var sig = scale + "|" + ox + "|" + oy;
                if (_lastActiveItemsSig === sig) return;
                _lastActiveItemsSig = sig;

                if (scale !== 100) panel.style.uiScale = scale + "%";
                else if (_activeItemsScaleApplied) _clearStyle(panel, "uiScale");
                if (ox !== 0) panel.style.x = ox + "px";
                else if (_activeItemsOffsetXApplied) _releaseOffset(panel, "x", true);
                if (oy !== 0) panel.style.y = (-oy) + "px";
                else if (_activeItemsOffsetYApplied) _releaseOffset(panel, "y", true);

                _activeItemsScaleApplied = scale !== 100;
                _activeItemsOffsetXApplied = ox !== 0;
                _activeItemsOffsetYApplied = oy !== 0;
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                _applyActiveItems(root, cfg);
                var active = _hasNonDefault(cfg);
                var enabled = (cfg.HUD_BOTTOM_BAR_ENABLED === undefined || cfg.HUD_BOTTOM_BAR_ENABLED === true || Number(cfg.HUD_BOTTOM_BAR_ENABLED) === 1);
                var wcIdx = active && enabled ? (Math.round(Number(cfg.BOTTOM_BAR_WASH_COLOR)) || 0) : 0;
                var wc = (typeof QOL !== "undefined" && QOL.core && QOL.core.panel && QOL.core.panel.resolvePaletteColor)
                    ? QOL.core.panel.resolvePaletteColor(wcIdx)
                    : ((typeof QOL !== "undefined" && QOL.washColorPalette && wcIdx > 0 && wcIdx < QOL.washColorPalette.length) ? QOL.washColorPalette[wcIdx] : "");

                // Apply currency color BEFORE the panel guard — old feature
                // applies it unconditionally (ql_feat_bottombar.js:93 before guard at :94).
                _applyCurrencyColor(root, wc);

                var bp = _findBar(root);
                if (bp !== _lastPanel) {
                    if (_visibilityOverride && QOL.utils.IsPanelValid(_lastPanel)) _clearStyle(_lastPanel, "visibility");
                    _visibilityOverride = false;
                    _lastPanel = bp;
                    _lastRoot = root;
                    try { _lastParent = bp && bp.GetParent ? bp.GetParent() : null; }
                    catch(e) { _lastParent = null; }
                    _lastSig = "";
                    _offsetXApplied = false;
                    _offsetYApplied = false;
                }
                if (!bp) return;

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
                if (!enabled) { if (bp.style.visibility !== "collapse") bp.style.visibility = "collapse"; _visibilityOverride = true; }
                else if (_visibilityOverride) { _clearStyle(bp, "visibility"); _visibilityOverride = false; }

                if (!enabled) {
                    _releaseOffset(bp, "x", _offsetXApplied);
                    _releaseOffset(bp, "y", _offsetYApplied);
                    _offsetXApplied = false;
                    _offsetYApplied = false;
                    _clearStyle(bp, "preTransformScale2d");
                    _clearStyle(bp, "uiScale");
                    _clearStyle(bp, "opacity");
                    _clearStyle(bp, "washColor");
                    if (bp.SetHasClass) bp.SetHasClass("qol-hidden", true);
                    return;
                }

                if (ox !== 0) bp.style.x = ox + "px";
                else _releaseOffset(bp, "x", _offsetXApplied);
                if (oy !== 0) bp.style.y = (-oy) + "px";
                else _releaseOffset(bp, "y", _offsetYApplied);
                _offsetXApplied = ox !== 0;
                _offsetYApplied = oy !== 0;

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
                        var panel = _findBar(root);
                        var activeItemsPanel = _findActiveItems(root);
                        if (panel !== _lastPanel || activeItemsPanel !== _lastActiveItemsPanel) _apply(ctx.config.all());
                    }, 0.5, ctx.id) : null;
                },
                onDisable: function() {
                    if (_visibilityOverride && QOL.utils.IsPanelValid(_lastPanel)) _clearStyle(_lastPanel, "visibility");
                    _visibilityOverride = false;
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature(ctx.id);
                    _lastSig = "";
                    try {
                        var root = $.GetContextPanel();
                        _applyCurrencyColor(root, "");
                        var bp = root ? root.FindChildTraverse("hud_signature") : null;
                        if (bp && bp.style) {
                            _releaseOffset(bp, "x", _offsetXApplied && bp === _lastPanel);
                            _releaseOffset(bp, "y", _offsetYApplied && bp === _lastPanel);
                            _clearStyle(bp, "preTransformScale2d");
                            _clearStyle(bp, "uiScale");
                            _clearStyle(bp, "opacity");
                            if (_visibilityOverride) _clearStyle(bp, "visibility");
                            _clearStyle(bp, "washColor");
                            var isSupposed = FR && FR.isFeatureSupposedToBeEnabled ? FR.isFeatureSupposedToBeEnabled("ql_bottom_bar") : false;
                            if (bp.SetHasClass) bp.SetHasClass("qol-hidden", !isSupposed);
                        }
                        var activeItems = root ? root.FindChildTraverse("ActiveAbilitiesMenu") : null;
                        if (activeItems && activeItems.style) {
                            if (_activeItemsScaleApplied && activeItems === _lastActiveItemsPanel) _clearStyle(activeItems, "uiScale");
                            if (_activeItemsOffsetXApplied && activeItems === _lastActiveItemsPanel) _releaseOffset(activeItems, "x", true);
                            if (_activeItemsOffsetYApplied && activeItems === _lastActiveItemsPanel) _releaseOffset(activeItems, "y", true);
                        }
                        _lastPanel = null;
                        _lastParent = null;
                        _lastRoot = null;
                        _nextFullSearchMs = 0;
                        _lastActiveItemsSig = "";
                        _lastActiveItemsPanel = null;
                        _lastActiveItemsParent = null;
                        _lastActiveItemsRoot = null;
                        _nextActiveItemsFullSearchMs = 0;
                        _offsetXApplied = false;
                        _offsetYApplied = false;
                        _activeItemsScaleApplied = false;
                        _activeItemsOffsetXApplied = false;
                        _activeItemsOffsetYApplied = false;
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
