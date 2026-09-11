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
            var _loop = null;

            function _hasNonDefaultConfig(cfg) {
                if (!cfg) return false;
                var angle = Math.round(Number(cfg.STAMINA_CHARGE_ANGLE));
                if (!isFinite(angle)) angle = 45;
                return angle !== 45 || _hasNonDefaultColor(cfg);
            }

            function _hasNonDefaultColor(cfg) {
                if (!cfg) return false;
                var idx = Math.round(Number(cfg.STAMINA_CHARGE_COLOR));
                if (!isFinite(idx)) idx = 0;
                return idx !== 0;
            }

            function _normalizeAngle(cfg) {
                var angle = Math.round(Number(cfg.STAMINA_CHARGE_ANGLE));
                if (!isFinite(angle)) angle = 45;
                if (angle < 0) angle = 0;
                if (angle > 360) angle = 360;
                return angle;
            }

            function _normalizeColorIndex(cfg) {
                var idx = Math.round(Number(cfg.STAMINA_CHARGE_COLOR));
                if (!isFinite(idx)) idx = 0;
                if (idx < 0) idx = 0;
                // Match old NormalizePaletteColorIndex: ≥ palette length → 0 (no color).
                // Palette has 30 entries (indices 0-29).
                if (idx >= 30) idx = 0;
                return idx;
            }

            function _refreshColorPanels(root) {
                _colorPanels = [];
                var cc = root.FindChildTraverse("charges_container");
                if (!cc || !cc.FindChildrenWithClassTraverse) return;
                try {
                    // Only include charge_fg panels that BHasClass("finished"),
                    // matching the old feature's filter (ql_feat_stamina.js:54).
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
                var root = $.GetContextPanel();
                var cc = root.FindChildTraverse("charges_container");
                if (!cc) return;

                // Early-exit at defaults (matching old feature ql_feat_stamina.js:101-106):
                // don't mutate the HUD when the user has never touched the settings.
                if (!_hasNonDefaultConfig(cfg)) return;

                var angle = _normalizeAngle(cfg);
                var angleSig = String(angle);
                var colorIdx = _normalizeColorIndex(cfg);
                var colorSig = String(colorIdx);

                if (_lastAngleSig !== angleSig) {
                    _lastAngleSig = angleSig;
                    // Use style.transform (not preTransformRotateZ) — old feature
                    // overwrites the full transform string (ql_feat_stamina.js:112).
                    try { cc.style.transform = "rotateZ(" + angle + "deg)"; } catch(e) {}
                }

                if (_lastColorSig !== colorSig) {
                    _lastColorSig = colorSig;
                    _refreshColorPanels(root);
                    var pal = (typeof QOL !== "undefined" && QOL.washColorPalette) ? QOL.washColorPalette : [];
                    // Old feature clears to "transparent" (alpha=0 disables wash), not "".
                    var wc = (colorIdx > 0 && colorIdx < pal.length) ? pal[colorIdx] : "transparent";
                    for (var i = 0; i < _colorPanels.length; i++) {
                        try { _colorPanels[i].style.washColor = wc; } catch(e) {}
                    }
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
                    // Restore the ring to the neutral 45° (matching the default).
                    try {
                        var root = $.GetContextPanel();
                        var cc = root.FindChildTraverse("charges_container");
                        if (cc && cc.style) { cc.style.transform = "rotateZ(45deg)"; }
                    } catch(e) {}
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
                var panel = root ? root.FindChildTraverse("charges_container") : null;
                if (!panel) return null;
                return { passed: true, name: "Stamina charges panel exists", message: "", assertions: [{ passed: true, name: "charges_container panel exists" }] };
            } catch(e) { return { passed: false, name: "Stamina panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
