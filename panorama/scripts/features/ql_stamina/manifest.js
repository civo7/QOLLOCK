// features/ql_stamina/manifest.js
// =============================================================================
// QOLLOCK — Stamina Charge (rotation angle + wash color)
// =============================================================================
// OWNS:        Stamina charge container rotation + color
// DOES NOT OWN: Stamina mechanics, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: STAMINA_CHARGE_ANGLE, STAMINA_CHARGE_COLOR
// PANEL ID:    charges_container
// PATTERN:     Event-driven (no polling). Signature diffing preserved.
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

            function _refreshColorPanels(root) {
                _colorPanels = [];
                var cc = root.FindChildTraverse("charges_container");
                if (!cc || !cc.FindChildrenWithClassTraverse) return;
                try {
                    var finished = cc.FindChildrenWithClassTraverse("charge_fg") || [];
                    var drained = cc.FindChildrenWithClassTraverse("charge_drained") || [];
                    _colorPanels = finished.concat(drained);
                } catch(e) {}
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var cc = root.FindChildTraverse("charges_container");
                if (!cc) return;

                // Rotation
                var angle = Math.round(Number(cfg.STAMINA_CHARGE_ANGLE)) || 0;
                if (angle < 0) angle = 0; if (angle > 360) angle = 360;
                var angleSig = String(angle);
                if (_lastAngleSig !== angleSig) {
                    _lastAngleSig = angleSig;
                    try { cc.style.preTransformRotateZ = angle + "deg"; } catch(e) {}
                }

                // Wash color
                var colorIdx = Math.round(Number(cfg.STAMINA_CHARGE_COLOR)) || 0;
                if (colorIdx < 0) colorIdx = 0; if (colorIdx > 29) colorIdx = 29;
                var colorSig = String(colorIdx);
                if (_lastColorSig !== colorSig) {
                    _lastColorSig = colorSig;
                    _refreshColorPanels(root);
                    var wc = String(colorIdx || "");
                    for (var i = 0; i < _colorPanels.length; i++) {
                        try { _colorPanels[i].style.washColor = wc; } catch(e) {}
                    }
                }
            }

            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    _lastAngleSig = ""; _lastColorSig = "";
                    try {
                        var root = $.GetContextPanel();
                        var cc = root.FindChildTraverse("charges_container");
                        if (cc && cc.style) { cc.style.preTransformRotateZ = "0deg"; }
                        for (var i = 0; i < _colorPanels.length; i++) {
                            try { _colorPanels[i].style.washColor = ""; } catch(e) {}
                        }
                        _colorPanels = [];
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        }
    });
})();
