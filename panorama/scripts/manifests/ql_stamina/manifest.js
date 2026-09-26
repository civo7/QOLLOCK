// features/ql_stamina/manifest.js
// =============================================================================
// QOLLOCK — Stamina Charge Color + Rotation
// =============================================================================
// OWNS:        Stamina charge ring rotation + charge pip wash color
// DOES NOT OWN: Charge mechanics, pip creation/destruction
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL.washColorPalette
// CONFIG KEYS: STAMINA_CHARGE_ANGLE, STAMINA_CHARGE_COLOR
// PANEL ID:    charges_container
// PATTERN:     Polled at 500ms — stamina charges gain/lose the "finished" CSS
//              class at runtime, so panels must be rescanned mid-match.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] stamina: FeatureRegistry not found — aborting"); return; }

    function findChargesContainer(root) {
        // Scope the shared id to Valve's stamina element, not ability icons.
        var elements = root.FindChildrenWithClassTraverse("ability_element_charges") || [];
        for (var i = 0; i < elements.length; i++) {
            var cc = elements[i].FindChildTraverse("charges_container");
            // element_roll.xml shares the wrapper class, but has no drained pips.
            if (cc && cc.FindChildrenWithClassTraverse("charge_drained").length) return cc;
        }
        return null;
    }

    FR.register({
        id: "ql_stamina",
        enabledByDefault: true,
        settings: [
            { key: "STAMINA_CHARGE_ANGLE", type: "slider", min: 0, max: 360, step: 1, default: 45 },
            { key: "STAMINA_CHARGE_COLOR", type: "palette", default: 0 }
        ],
        create: function(ctx) {
            var _lastAngleSig = "";
            var _lastColorSig = "";
            var _colorPanels = [];
            var _anglePanel = null;
            var _loop = null;


            function _normalizeAngle(cfg) {
                var angle = Math.round(Number(cfg.STAMINA_CHARGE_ANGLE));
                if (!isFinite(angle)) angle = 45;
                if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.NormalizeDegrees360) {
                    return QOL_UTILS.NormalizeDegrees360(angle);
                }
                if (angle < 0) angle = 0;
                if (angle > 360) angle = 360;
                return angle;
            }

            function _normalizeColorIndex(cfg) {
                if (typeof QOL !== "undefined" && QOL.core && QOL.core.panel && QOL.core.panel.normalizePaletteIndex) {
                    return QOL.core.panel.normalizePaletteIndex(cfg.STAMINA_CHARGE_COLOR);
                }
                var idx = Math.round(Number(cfg.STAMINA_CHARGE_COLOR));
                if (!isFinite(idx)) idx = 0;
                if (idx < 0) idx = 0;
                // Match old NormalizePaletteColorIndex: ≥ palette length → 0 (no color).
                // Palette has 30 entries (indices 0-29).
                if (idx >= 30) idx = 0;
                return idx;
            }

            function _refreshColorPanels(cc) {
                _colorPanels = [];
                try {
                    // Leave native recharge/drain feedback untinted.
                    var allFg = cc.FindChildrenWithClassTraverse("charge_fg") || [];
                    for (var i = 0; i < allFg.length; i++) {
                        var fg = allFg[i];
                        if (fg && fg.BHasClass && fg.BHasClass("finished")) {
                            _colorPanels.push(fg);
                        }
                    }
                    var drained = cc.FindChildrenWithClassTraverse("charge_drained") || [];
                    for (var j = 0; j < drained.length; j++) {
                        if (drained[j]) _colorPanels.push(drained[j]);
                    }
                } catch(e) {}
            }

            function _apply(cfg) {
                var angle = _normalizeAngle(cfg);
                var colorIdx = _normalizeColorIndex(cfg);
                // Defaults are a no-op only after previous overrides are restored.
                if (angle === 45 && colorIdx === 0 && !_anglePanel && !_colorPanels.length) return;

                var cc = findChargesContainer($.GetContextPanel());
                if (!cc) return;
                var angleSig = String(angle);
                if (_anglePanel !== cc || _lastAngleSig !== angleSig) {
                    cc.style.transform = "rotateZ(" + angle + "deg)";
                    _lastAngleSig = angleSig;
                    _anglePanel = cc;
                }

                var previous = _colorPanels;
                if (colorIdx > 0) _refreshColorPanels(cc);
                else _colorPanels = [];
                for (var p = 0; p < previous.length; p++) {
                    if (_colorPanels.indexOf(previous[p]) !== -1) continue;
                    try { previous[p].style.washColor = "transparent"; } catch(e) {}
                }

                var colorSig = String(colorIdx);
                var pal = QOL.washColorPalette || [];
                var wc = QOL.core.panel && QOL.core.panel.resolvePaletteColor
                    ? QOL.core.panel.resolvePaletteColor(colorIdx)
                    : pal[colorIdx];
                for (var i = 0; i < _colorPanels.length; i++) {
                    if (_lastColorSig === colorSig && previous.indexOf(_colorPanels[i]) !== -1) continue;
                    _colorPanels[i].style.washColor = wc;
                }
                _lastColorSig = colorSig;
                if (angle === 45 && colorIdx === 0) {
                    _anglePanel = null;
                    _lastAngleSig = "";
                }
            }

            function _tick() {
                try { _apply(ctx.config.all()); } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_stamina", "_tick: " + (e.message || e));
                    }
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all());
                    var S = QOL.core.Scheduler;
                    // 500ms matches old feature's cache TTL (ql_feat_stamina.js:65).
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_stamina") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_stamina");
                    _lastAngleSig = ""; _lastColorSig = "";
                    // Restore only the stamina ring that this instance changed.
                    try {
                        if (_anglePanel) _anglePanel.style.transform = "rotateZ(45deg)";
                    } catch(e) {}
                    _anglePanel = null;
                    // Clear wash from all cached panels.
                    for (var i = 0; i < _colorPanels.length; i++) {
                        try { _colorPanels[i].style.washColor = "transparent"; } catch(e) {}
                    }
                    _colorPanels = [];
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var panel = root ? findChargesContainer(root) : null;
                if (!panel) return null;
                return { passed: true, name: "Stamina charges panel exists", message: "", assertions: [{ passed: true, name: "charges_container panel exists" }] };
            } catch(e) { return { passed: false, name: "Stamina panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
