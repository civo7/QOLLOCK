// features/ql_ammo/manifest.js
// =============================================================================
// QOLLOCK — Ammo Panel (position, scale, color, clip angle, visibility)
// =============================================================================
// OWNS:        Ammo panel text scale/position/color, magazine clip ring rotation
// DOES NOT OWN: Reload cooldown, crosshair stats, weapon logic
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: ENABLE_AMMO_STATUS, ENABLE_HIDE_MAGAZINE, ENABLE_HIDE_AMMO_ALL,
//              AMMO_PANEL_SCALE, AMMO_CURRENT_SCALE, AMMO_TOTAL_SCALE,
//              AMMO_PANEL_X_OFFSET, AMMO_PANEL_Y_OFFSET, AMMO_CLIP_ANGLE,
//              AMMO_TEXT_COLOR
// PATTERN:     Settings-driven with a slow poll for replaced native panels.
//              Dual-half heat rings rotate as a pair at their native base angles.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ammo: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_ammo",
        enabledByDefault: false,
        enableKeys: ["ENABLE_AMMO_STATUS", "ENABLE_HIDE_MAGAZINE", "ENABLE_HIDE_AMMO_ALL"],
        isEnabled: function(cfg) {
            if (!cfg) return false;
            var isTrue = function(v) { return v === true || v === 1 || String(v) === "true"; };
            if (isTrue(cfg.ENABLE_AMMO_STATUS) || isTrue(cfg.ENABLE_HIDE_MAGAZINE) || isTrue(cfg.ENABLE_HIDE_AMMO_ALL)) return true;
            if (cfg.AMMO_CURRENT_SCALE != null && Number(cfg.AMMO_CURRENT_SCALE) !== 100) return true;
            if (cfg.AMMO_TOTAL_SCALE != null && Number(cfg.AMMO_TOTAL_SCALE) !== 100) return true;
            if (cfg.AMMO_PANEL_SCALE != null && Number(cfg.AMMO_PANEL_SCALE) !== 100) return true;
            if (cfg.AMMO_PANEL_X_OFFSET != null && Number(cfg.AMMO_PANEL_X_OFFSET) !== 0) return true;
            if (cfg.AMMO_PANEL_Y_OFFSET != null && Number(cfg.AMMO_PANEL_Y_OFFSET) !== 0) return true;
            if (cfg.AMMO_CLIP_ANGLE != null && Number(cfg.AMMO_CLIP_ANGLE) !== 0) return true;
            if (cfg.AMMO_TEXT_COLOR != null && Number(cfg.AMMO_TEXT_COLOR) !== 0) return true;
            return false;
        },
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
            var _lastMainPanel = null;
            var _lastClipPanel = null;
            var _lastMirroredClipPanel = null;
            var _lastRings = [];
            var _lastMirroredRings = [];
            var _lastTextTargets = [];
            var _loop = null;
            var _clearStyle = QOL.utils.ClearStyleSafe;
            var _isAlive = QOL.utils.IsPanelValid;

            function _samePanels(a, b) {
                if (a.length !== b.length) return false;
                for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
                return true;
            }

            function _textTargets(ap) {
                var targets = [];
                var classes = ["weapon_ammo", "weapon_ammo_max", "weapon_ammo_infinite"];
                for (var i = 0; i < classes.length; i++) {
                    var found = ap.FindChildrenWithClassTraverse(classes[i]) || [];
                    for (var j = 0; j < found.length; j++) targets.push(found[j]);
                }
                return targets;
            }

            function _clamp(v, lo, hi) {
                if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.ClampConfigNumber) {
                    return QOL_UTILS.ClampConfigNumber(v, lo, lo, hi, true);
                }
                var n = Math.round(Number(v));
                if (!isFinite(n)) return lo;
                return n < lo ? lo : n > hi ? hi : n;
            }

            function _clipChildren(panel) {
                try { return panel && panel.Children ? (panel.Children() || []) : []; } catch(e) { return []; }
            }

            function _mirroredClipSibling(panel) {
                var parent = panel && panel.GetParent ? panel.GetParent() : null;
                return parent && parent.FindChildTraverse ? parent.FindChildTraverse("clip_status_mirrored") : null;
            }

            function _resolveClipPanel(root, ammoPanel) {
                // Standard gun layouts keep clip_status beside ammo_panel under
                // gun_data. Anchor to that working ammo panel so duplicate IDs in
                // hidden hero/template subtrees cannot win the global traversal.
                var owner = ammoPanel && ammoPanel.GetParent ? ammoPanel.GetParent() : null;
                var anchored = null;
                if (owner) {
                    if (owner.FindChild) anchored = owner.FindChild("clip_status");
                    if (!anchored && owner.FindChildTraverse) anchored = owner.FindChildTraverse("clip_status");
                }
                return anchored || (root && root.FindChildTraverse ? root.FindChildTraverse("clip_status") : null);
            }

            function _releaseClipStyles(panel, rings) {
                if (_isAlive(panel)) {
                    _clearStyle(panel, "transform");
                    if (QOL.core.panel && QOL.core.panel.setClass) {
                        QOL.core.panel.setClass(panel, "qol-ammo-visual-enabled", false);
                        QOL.core.panel.setClass(panel, "qol-ammo-visual-disabled", false);
                    }
                }
                for (var i = 0; i < rings.length; i++) {
                    if (_isAlive(rings[i])) _clearStyle(rings[i], "transform");
                }
            }

            function _setClipVisual(panel, enabled) {
                if (!_isAlive(panel) || !QOL.core.panel || !QOL.core.panel.setClass) return;
                QOL.core.panel.setClass(panel, "qol-ammo-visual-enabled", enabled);
                QOL.core.panel.setClass(panel, "qol-ammo-visual-disabled", !enabled);
            }

            function _applyClipState(root, ammoPanel, angle, visualEnabled) {
                var cs = _resolveClipPanel(root, ammoPanel);
                var mirrored = _mirroredClipSibling(cs);
                var rings = _clipChildren(cs);
                var mirroredRings = _clipChildren(mirrored);
                var sig = angle + "|" + (visualEnabled ? "visible" : "hidden") + "|" + (mirrored ? "dual" : "single");
                _setClipVisual(cs, visualEnabled);
                _setClipVisual(mirrored, visualEnabled);
                if (_lastClipSig === sig && _lastClipPanel === cs &&
                    _lastMirroredClipPanel === mirrored && _samePanels(_lastRings, rings) &&
                    _samePanels(_lastMirroredRings, mirroredRings)) return;

                if (_lastClipPanel !== cs || _lastMirroredClipPanel !== mirrored) {
                    _releaseClipStyles(_lastClipPanel, _lastRings);
                    _releaseClipStyles(_lastMirroredClipPanel, _lastMirroredRings);
                }
                _lastClipSig = sig;
                _lastClipPanel = cs;
                _lastMirroredClipPanel = mirrored;
                _lastRings = rings.slice();
                _lastMirroredRings = mirroredRings.slice();
                if (!cs) return;

                if (mirrored) {
                    // The extracted Tokamak layout starts its two centered heat
                    // halves at 90 and 180 degrees. Rotate both around that center.
                    for (var i = 0; i < rings.length; i++) _clearStyle(rings[i], "transform");
                    for (var j = 0; j < mirroredRings.length; j++) _clearStyle(mirroredRings[j], "transform");
                    if (angle === 0) {
                        _clearStyle(cs, "transform");
                        _clearStyle(mirrored, "transform");
                    } else {
                        cs.style.transform = "rotateZ(" + (90 - angle) + "deg)";
                        mirrored.style.transform = "rotateZ(" + (180 - angle) + "deg)";
                    }
                    return;
                }

                // Standard gun layout has one clip_status with three ring children.
                _clearStyle(cs, "transform");
                for (var k = 0; k < rings.length; k++) {
                    if (angle === 0) _clearStyle(rings[k], "transform");
                    else rings[k].style.transform = "rotateZ(-" + angle + "deg)";
                }
            }

            function _applyTextColor(label, textColor) {
                if (textColor) {
                    if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.SetStyleSafe) {
                        QOL_UTILS.SetStyleSafe(label, "color", textColor);
                    } else {
                        try { label.style.color = textColor; } catch(e) {}
                    }
                } else {
                    if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.ClearStyleSafe) {
                        QOL_UTILS.ClearStyleSafe(label, "color");
                    } else {
                        try { label.style.color = ""; } catch(e) {}
                    }
                }
            }

            function _applyChildren(ap, curScale, totScale, textColor) {
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
                        vals[vi].style.fontSize = (curScale === 100) ? null : (valFont + "px");
                        vals[vi].style.width = (curScale === 100) ? null : (valWidth + "px");
                        _applyTextColor(vals[vi], textColor);
                    }
                    var maxs = ap.FindChildrenWithClassTraverse("weapon_ammo_max") || [];
                    for (var mi = 0; mi < maxs.length; mi++) {
                        if (!maxs[mi]) continue;
                        maxs[mi].style.fontSize = (totScale === 100) ? null : (maxFont + "px");
                        maxs[mi].style.width = (totScale === 100) ? null : (maxWidth + "px");
                        maxs[mi].style.marginLeft = (totScale === 100) ? null : (maxMl + "px");
                        _applyTextColor(maxs[mi], textColor);
                    }
                    var infs = ap.FindChildrenWithClassTraverse("weapon_ammo_infinite") || [];
                    for (var ii = 0; ii < infs.length; ii++) {
                        if (!infs[ii]) continue;
                        _applyTextColor(infs[ii], textColor);
                    }
                } catch(e) {}
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var ap = root.FindChildTraverse("ammo_panel");
                var visualEnabled = cfg.ENABLE_AMMO_STATUS === true || Number(cfg.ENABLE_AMMO_STATUS) === 1;
                _applyClipState(root, ap, _clamp(cfg.AMMO_CLIP_ANGLE, 0, 360), visualEnabled);
                if (ap !== _lastMainPanel) {
                    _lastMainPanel = ap;
                    _lastMainSig = "";
                    _lastTextTargets = [];
                }
                if (!ap) return;

                var hideMagazine = Number(cfg.ENABLE_HIDE_MAGAZINE) === 1;
                var hideAll = Number(cfg.ENABLE_HIDE_AMMO_ALL) === 1;
                var curScale = _clamp(cfg.AMMO_CURRENT_SCALE !== undefined && cfg.AMMO_CURRENT_SCALE !== null ? cfg.AMMO_CURRENT_SCALE : cfg.AMMO_PANEL_SCALE, 100, 300);
                var totScale = _clamp(cfg.AMMO_TOTAL_SCALE !== undefined && cfg.AMMO_TOTAL_SCALE !== null ? cfg.AMMO_TOTAL_SCALE : cfg.AMMO_PANEL_SCALE, 100, 300);
                var ox = _clamp(cfg.AMMO_PANEL_X_OFFSET, -200, 200);
                var oy = _clamp(cfg.AMMO_PANEL_Y_OFFSET, -200, 200);
                var colorIdx = Number(cfg.AMMO_TEXT_COLOR) || 0;
                var textColor = (typeof QOL !== "undefined" && QOL.core && QOL.core.panel && QOL.core.panel.resolvePaletteColor)
                    ? QOL.core.panel.resolvePaletteColor(colorIdx)
                    : ((typeof QOL !== "undefined" && QOL.washColorPalette && colorIdx > 0 && colorIdx < QOL.washColorPalette.length) ? QOL.washColorPalette[colorIdx] : "");

                var sig = curScale + "|" + totScale + "|" + ox + "|" + oy + "|" + hideMagazine + "|" + hideAll + "|" + colorIdx;
                var targets = _textTargets(ap);
                if (_lastMainSig === sig && _samePanels(_lastTextTargets, targets)) {
                    // Ammo state changes can rewrite native label colors without
                    // replacing the panels. Reassert a selected user color.
                    if (colorIdx > 0) {
                        for (var ti = 0; ti < targets.length; ti++) _applyTextColor(targets[ti], textColor);
                    }
                    return;
                }
                _lastMainSig = sig;
                _lastTextTargets = targets;

                _applyChildren(ap, curScale, totScale, textColor);
                ap.style.x = ox + "px";
                ap.style.y = (80 - oy) + "px";
                ap.style.preTransformScale2d = "1.00, 1.00";
                if (ap.SetHasClass) ap.SetHasClass("qol-hidden", false);
                try { ap.style.opacity = "1.00"; } catch(e) {}
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all());
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(function() { _apply(ctx.config.all()); }, 0.5, ctx.id) : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature(ctx.id);
                    _lastMainSig = ""; _lastClipSig = "";
                    _lastMainPanel = null; _lastTextTargets = [];
                    try {
                        var root = $.GetContextPanel();
                        var ap = root.FindChildTraverse("ammo_panel");
                        if (ap && ap.style) {
                            ap.style.x = "0px";
                            ap.style.y = "80px";
                            ap.style.preTransformScale2d = "1.00, 1.00";
                            _applyChildren(ap, 100, 100, "");
                        }
                        var cs = _resolveClipPanel(root, ap);
                        var mirrored = _mirroredClipSibling(cs);
                        _releaseClipStyles(cs, _clipChildren(cs));
                        _releaseClipStyles(mirrored, _clipChildren(mirrored));
                    } catch(e) {}
                    _releaseClipStyles(_lastClipPanel, _lastRings);
                    _releaseClipStyles(_lastMirroredClipPanel, _lastMirroredRings);
                    _lastClipPanel = null; _lastMirroredClipPanel = null;
                    _lastRings = []; _lastMirroredRings = [];
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var panel = root ? root.FindChildTraverse("ammo_panel") : null;
                if (!panel) panel = root ? root.FindChildTraverse("clip_status") : null;
                if (!panel) return null;  // Skip — not in a match context
                return { passed: true, name: "Ammo panel exists", message: "", assertions: [{ passed: true, name: "ammo_panel or clip_status exists" }] };
            } catch(e) { return { passed: false, name: "Ammo panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
