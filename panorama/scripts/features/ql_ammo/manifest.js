// features/ql_ammo/manifest.js
// =============================================================================
// QOLLOCK — Ammo Panel (position, scale, color, clip angle, visibility)
// =============================================================================
// OWNS:        Ammo panel text scale/position/color, magazine clip ring rotation
// DOES NOT OWN: Reload cooldown, crosshair stats, weapon logic
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: ENABLE_AMMO_STATUS, ENABLE_HIDE_MAGAZINE, ENABLE_HIDE_AMMO_ALL,
//              AMMO_PANEL_SCALE, AMMO_CURRENT_SCALE, AMMO_TOTAL_SCALE,
//              AMMO_PANEL_X_OFFSET, AMMO_PANEL_Y_OFFSET, AMMO_CLIP_ANGLE
// PATTERN:     Event-driven. Multi-child style apply with signature diffing.
//              Clip ring rotation via transform on children (not container).
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ammo: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_ammo",
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_AMMO_STATUS", type: "toggle", default: false },
            { key: "ENABLE_HIDE_MAGAZINE", type: "toggle", default: false },
            { key: "ENABLE_HIDE_AMMO_ALL", type: "toggle", default: false },
            { key: "AMMO_PANEL_SCALE", type: "slider", min: 100, max: 300, step: 1, default: 100 },
            { key: "AMMO_CURRENT_SCALE", type: "slider", min: 100, max: 300, step: 1, default: 100 },
            { key: "AMMO_TOTAL_SCALE", type: "slider", min: 100, max: 300, step: 1, default: 100 },
            { key: "AMMO_PANEL_X_OFFSET", type: "slider", min: -200, max: 200, step: 5, default: 0 },
            { key: "AMMO_PANEL_Y_OFFSET", type: "slider", min: -200, max: 200, step: 5, default: 0 },
            { key: "AMMO_CLIP_ANGLE", type: "slider", min: 0, max: 360, step: 1, default: 0 },
            { key: "AMMO_TEXT_COLOR", type: "palette", default: 0 }
        ],
        create: function(ctx) {
            var _lastMainSig = "";
            var _lastClipSig = "";
            var _lastColorSig = "";

            function _clamp(v, lo, hi) { var n = Math.round(Number(v)); if (!isFinite(n)) return lo; return n < lo ? lo : n > hi ? hi : n; }

            function _applyClipAngle(root, angle) {
                var cs = root.FindChildTraverse("clip_status");
                if (!cs) { _lastClipSig = ""; return; }
                // Clear any orphaned transform on the container (previous builds)
                try { cs.style.transform = ""; } catch(e) {}
                var rings = [];
                try { if (cs.Children) rings = cs.Children(); } catch(e) {}
                if (!rings || !rings.length) return;
                var sig = angle + "|" + rings.length;
                if (_lastClipSig === sig) return;
                _lastClipSig = sig;
                for (var i = 0; i < rings.length; i++) {
                    try {
                        if (angle === 0) rings[i].style.transform = "";
                        else rings[i].style.transform = "rotateZ(-" + angle + "deg)";
                    } catch(e) {}
                }
            }

            function _applyChildren(ap, curScale, totScale) {
                var cf = curScale / 100, tf = totScale / 100;
                var valFont = Math.max(12, Math.round(16 * cf));
                var valWidth = Math.max(24, Math.round(32 * cf));
                var maxFont = Math.max(12, Math.round(16 * tf));
                var maxWidth = Math.max(32, Math.round(50 * tf));
                var maxMl = Math.max(0, Math.round(2 * tf));
                try {
                    var vals = ap.FindChildrenWithClassTraverse("weapon_ammo") || [];
                    for (var vi = 0; vi < vals.length; vi++) {
                        if (!vals[vi]) continue;
                        vals[vi].style.fontSize = valFont + "px";
                        vals[vi].style.width = valWidth + "px";
                    }
                    var maxs = ap.FindChildrenWithClassTraverse("weapon_ammo_max") || [];
                    for (var mi = 0; mi < maxs.length; mi++) {
                        if (!maxs[mi]) continue;
                        maxs[mi].style.fontSize = maxFont + "px";
                        maxs[mi].style.width = maxWidth + "px";
                        maxs[mi].style.marginLeft = maxMl + "px";
                    }
                } catch(e) {}
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var ap = root.FindChildTraverse("ammo_panel");
                _applyClipAngle(root, _clamp(cfg.AMMO_CLIP_ANGLE, 0, 360));
                if (!ap) { _lastMainSig = ""; return; }

                var hideMagazine = Number(cfg.ENABLE_HIDE_MAGAZINE) === 1;
                var hideAll = Number(cfg.ENABLE_HIDE_AMMO_ALL) === 1;
                var curScale = _clamp(cfg.AMMO_CURRENT_SCALE || cfg.AMMO_PANEL_SCALE, 100, 300);
                var totScale = _clamp(cfg.AMMO_TOTAL_SCALE || cfg.AMMO_PANEL_SCALE, 100, 300);
                var ox = _clamp(cfg.AMMO_PANEL_X_OFFSET, -200, 200);
                var oy = _clamp(cfg.AMMO_PANEL_Y_OFFSET, -200, 200);
                var colorIdx = Number(cfg.AMMO_TEXT_COLOR) || 0;

                var sig = curScale + "|" + totScale + "|" + ox + "|" + oy + "|" + hideMagazine + "|" + hideAll + "|" + colorIdx;
                if (_lastMainSig === sig) return;
                _lastMainSig = sig;

                _applyChildren(ap, curScale, totScale);
                ap.style.x = ox + "px";
                ap.style.y = (80 - oy) + "px";
                ap.style.preTransformScale2d = "1.00, 1.00";
                if (ap.SetHasClass) ap.SetHasClass("qol-hidden", false);
                try { ap.style.opacity = "1.00"; } catch(e) {}
            }

            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    _lastMainSig = ""; _lastClipSig = "";
                    try {
                        var root = $.GetContextPanel();
                        var ap = root.FindChildTraverse("ammo_panel");
                        if (ap && ap.style) {
                            ap.style.x = "0px"; ap.style.y = "0px";
                            ap.style.preTransformScale2d = "1.00, 1.00";
                        }
                        var cs = root.FindChildTraverse("clip_status");
                        if (cs) {
                            try { cs.style.transform = ""; } catch(e) {}
                            var rings = cs.Children ? cs.Children() : [];
                            for (var i = 0; i < rings.length; i++)
                                try { rings[i].style.transform = ""; } catch(e) {}
                        }
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        }
    });
})();
