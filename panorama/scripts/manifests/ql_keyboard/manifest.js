// features/ql_keyboard/manifest.js
// =============================================================================
// QOLLOCK — Keyboard Overlay (key binding display with scale, position, wash color)
// =============================================================================
// OWNS:        Keyboard overlay panel creation, layout, and cleanup
// DOES NOT OWN: Key bindings, input system
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL.buildKeyboardOverlayLayouts, QOL.getKeyboardCachedPanels, etc.
// CONFIG KEYS: ENABLE_KEYBOARD_OVERLAY, ENABLE_FULL_KEYBOARD_LAYOUT,
//              KEYBOARD_OVERLAY_SCALE, KEYBOARD_OVERLAY_X_OFFSET,
//              KEYBOARD_OVERLAY_Y_OFFSET, KEYBOARD_OVERLAY_WASH_COLOR
// PATTERN:     Polling (~20Hz). Creates overlay with child panels.
//              Delegates complex layout to QOL.buildKeyboardOverlayLayouts.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] keyboard: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_keyboard",
        enableKey: "ENABLE_KEYBOARD_OVERLAY",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_KEYBOARD_OVERLAY", type: "toggle", default: false },
            { key: "ENABLE_FULL_KEYBOARD_LAYOUT", type: "toggle", default: false },
            { key: "KEYBOARD_OVERLAY_SCALE", type: "slider", min: 70, max: 150, step: 1, default: 100 },
            { key: "KEYBOARD_OVERLAY_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0 },
            { key: "KEYBOARD_OVERLAY_Y_OFFSET", type: "slider", min: -400, max: 1000, step: 5, default: 0 },
            { key: "KEYBOARD_OVERLAY_WASH_COLOR", type: "palette", default: 0 }
        ],
        create: function(ctx) {
            var _loop = null;
            var _washSig = "";

            function _isAlive(p) { return p && typeof p.IsValid === "function" && p.IsValid(); }

            // ── QOL delegate helpers (all published on QOL namespace) ──
            function _getPanel(k) {
                try { if (typeof QOL !== "undefined" && QOL.getCachedPanel) return QOL.getCachedPanel(k); } catch(e) {}
                return null;
            }
            function _setPanel(k, v) {
                try { if (typeof QOL !== "undefined" && QOL.setCachedPanel) QOL.setCachedPanel(k, v); } catch(e) {}
            }
            function _getGameplayHud(root) {
                try { if (typeof QOL !== "undefined" && QOL.getGameplayHudPanel) return QOL.getGameplayHudPanel(root); } catch(e) {}
                return root;
            }
            function _buildLayouts(box) {
                try { if (typeof QOL !== "undefined" && QOL.buildKeyboardOverlayLayouts) QOL.buildKeyboardOverlayLayouts(box); } catch(e) {}
            }
            function _getCachedPanels(cache, box, key, cls) {
                try { if (typeof QOL !== "undefined" && QOL.getKeyboardCachedPanels) return QOL.getKeyboardCachedPanels(cache, box, key, cls); } catch(e) {}
                return [];
            }
            function _resetCaches() {
                try { if (typeof QOL !== "undefined" && QOL.resetKeyboardOverlayCaches) QOL.resetKeyboardOverlayCaches(); } catch(e) {}
            }
            function _readWashIdx(cfg) {
                try { if (typeof QOL !== "undefined" && QOL.readKeyboardOverlayWashColorIndex) return QOL.readKeyboardOverlayWashColorIndex(cfg); } catch(e) {}
                return 0;
            }
            function _resolveWash(idx) {
                try { if (typeof QOL !== "undefined" && QOL.resolveWashColorFromPalette) return QOL.resolveWashColorFromPalette(idx); } catch(e) {}
                return "";
            }
            function _setWashSafe(panel, color) {
                try { if (typeof QOL !== "undefined" && QOL.setWashColorSafe) QOL.setWashColorSafe(panel, color); } catch(e) {}
            }

            function _getBoxCache(box) {
                // Mirrors old GetKeyboardBoxCache: maintains a per-box style signature.
                if (!_boxCaches) _boxCaches = [];
                var next = [], found = null;
                for (var i = 0; i < _boxCaches.length; i++) {
                    var e = _boxCaches[i];
                    if (!e || !_isAlive(e.box)) continue;
                    if (e.box === box) found = e;
                    next.push(e);
                }
                _boxCaches = next;
                if (found) return found;
                var created = { box: box, keyPanels: null, glyphLabels: null, mouseGlyphs: null, lastStyleSig: "" };
                _boxCaches.push(created);
                return created;
            }
            var _boxCaches = null;

            function _applyLayout(allBindingsBox, cfg) {
                if (!allBindingsBox) return;
                var kbScale = (cfg.KEYBOARD_OVERLAY_SCALE === undefined || cfg.KEYBOARD_OVERLAY_SCALE === null) ? 100 : Math.round(cfg.KEYBOARD_OVERLAY_SCALE);
                var kbOffsetX = (cfg.KEYBOARD_OVERLAY_X_OFFSET === undefined || cfg.KEYBOARD_OVERLAY_X_OFFSET === null) ? 0 : Math.round(cfg.KEYBOARD_OVERLAY_X_OFFSET);
                var kbOffsetY = (cfg.KEYBOARD_OVERLAY_Y_OFFSET === undefined || cfg.KEYBOARD_OVERLAY_Y_OFFSET === null) ? 0 : Math.round(cfg.KEYBOARD_OVERLAY_Y_OFFSET);
                var kbFullLayout = cfg.ENABLE_FULL_KEYBOARD_LAYOUT === 1;
                var kbBaseMarginLeft = kbFullLayout ? 70 : 150;
                var kbBaseMarginBottom = 300;
                if (kbScale < 70) kbScale = 70; if (kbScale > 150) kbScale = 150;
                if (kbOffsetX < -1500) kbOffsetX = -1500; if (kbOffsetX > 1500) kbOffsetX = 1500;
                if (kbOffsetY < -400) kbOffsetY = -400; if (kbOffsetY > 1000) kbOffsetY = 1000;

                var styleSig = [kbFullLayout ? "1" : "0", String(kbScale), String(kbOffsetX), String(kbOffsetY)].join("|");
                var cache = _getBoxCache(allBindingsBox);
                if (cache.lastStyleSig === styleSig) return;

                var kbScaleFactor = kbScale / 100;
                var scaledHeight = Math.max(1, Math.round(40 * kbScaleFactor));
                var scaledGap = 2;
                var labelScaleFactor = kbScale > 100 ? kbScaleFactor : 1;
                var scaledLabelSize = Math.max(1, Math.round(16 * labelScaleFactor));
                var scaledMouseGlyphSize = Math.max(1, Math.round(20 * labelScaleFactor));

                allBindingsBox.style.uiScale = "100%";
                allBindingsBox.style.marginLeft = kbBaseMarginLeft + "px";
                allBindingsBox.style.marginBottom = kbBaseMarginBottom + "px";
                allBindingsBox.style.x = kbOffsetX + "px";
                allBindingsBox.style.y = (-kbOffsetY) + "px";
                allBindingsBox.style.width = "fit-children";

                var keyPanels = _getCachedPanels(cache, allBindingsBox, "keyPanels", "Key");
                for (var ki = 0; ki < keyPanels.length; ki++) {
                    var kp = keyPanels[ki]; if (!kp) continue;
                    var bw = 40;
                    if (kp.BHasClass("TabKey")) bw = 53;
                    else if (kp.BHasClass("SpaceKey")) bw = kbFullLayout ? 133 : 192;
                    else if (kp.BHasClass("ShiftKey")) bw = 80;
                    else if (kp.BHasClass("AltKey") || kp.BHasClass("CtrlKey")) bw = 60;
                    else if (kp.BHasClass("EmptyKeyWide")) bw = kbFullLayout ? 60 : 80;
                    kp.style.width = Math.max(1, Math.round(bw * kbScaleFactor)) + "px";
                    kp.style.height = scaledHeight + "px";
                    kp.style.margin = scaledGap + "px";
                }
                var glyphs = _getCachedPanels(cache, allBindingsBox, "glyphLabels", "Label");
                for (var gi = 0; gi < glyphs.length; gi++) {
                    if (!glyphs[gi]) continue;
                    glyphs[gi].style.fontSize = scaledLabelSize + "px";
                    glyphs[gi].style.lineHeight = "0px";
                }
                var mice = _getCachedPanels(cache, allBindingsBox, "mouseGlyphs", "MouseButtonGlyph");
                for (var mi = 0; mi < mice.length; mi++) {
                    if (!mice[mi]) continue;
                    mice[mi].style.width = scaledMouseGlyphSize + "px";
                    mice[mi].style.height = scaledMouseGlyphSize + "px";
                    mice[mi].style.backgroundTextureSize = scaledMouseGlyphSize + "px " + scaledMouseGlyphSize + "px";
                }
                cache.lastStyleSig = styleSig;
            }

            function _ensureOverlay(root) {
                var overlayRoot = _getPanel("keyboardOverlayRoot");
                if (!_isAlive(overlayRoot)) {
                    overlayRoot = root.FindChildTraverse ? root.FindChildTraverse("QOLKeyboardOverlayRoot") : null;
                    if (!overlayRoot) {
                        var parent = _getGameplayHud(root);
                        if (!parent) return null;
                        overlayRoot = $.CreatePanel("Panel", parent, "QOLKeyboardOverlayRoot", {
                            hittest: "false", hittestchildren: "false"
                        });
                    }
                    _setPanel("keyboardOverlayRoot", overlayRoot);
                }
                if (!overlayRoot) return null;
                var allBindingsBox = _getPanel("keyboardOverlayBox");
                if (!_isAlive(allBindingsBox)) {
                    allBindingsBox = overlayRoot.FindChildTraverse ? overlayRoot.FindChildTraverse("AllBindingsBox") : null;
                    if (!allBindingsBox) {
                        allBindingsBox = $.CreatePanel("Panel", overlayRoot, "AllBindingsBox", {
                            "class": "AllBindingsScope", hittest: "false", hittestchildren: "false"
                        });
                        _buildLayouts(allBindingsBox);
                    }
                    _setPanel("keyboardOverlayBox", allBindingsBox);
                }
                return allBindingsBox;
            }

            function _removeOverlay(root) {
                var overlayRoot = _getPanel("keyboardOverlayRoot");
                if (!_isAlive(overlayRoot) && root && root.FindChildTraverse) {
                    overlayRoot = root.FindChildTraverse("QOLKeyboardOverlayRoot");
                }
                if (_isAlive(overlayRoot)) { try { overlayRoot.DeleteAsync(0); } catch(e) {} }
                _setPanel("keyboardOverlayRoot", null);
                _setPanel("keyboardOverlayBox", null);
                _washSig = "";
                _boxCaches = null;
                _resetCaches();
                try {
                    if (typeof QOL !== "undefined" && QOL.state) {
                        QOL.state.keyboardOverlayWashSig = "";
                        QOL.state.allBindingsBoxes = [];
                    }
                } catch(e) {}
            }

            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!root) return;
                    var cfg = ctx.config.all();

                    if (cfg.ENABLE_KEYBOARD_OVERLAY === 1) {
                        var allBindingsBox = _ensureOverlay(root);
                        // Update State.allBindingsBoxes for cross-feature compat
                        try {
                            if (typeof QOL !== "undefined" && QOL.state) {
                                QOL.state.allBindingsBoxes = allBindingsBox ? [allBindingsBox] : [];
                            }
                        } catch(e) {}

                        // Wash color
                        var overlayRoot = _getPanel("keyboardOverlayRoot");
                        var washIdx = _readWashIdx(cfg);
                        var washColor = _resolveWash(washIdx);
                        var washStr = washColor || "";
                        if (_isAlive(overlayRoot) && _washSig !== washStr) {
                            _setWashSafe(overlayRoot, washColor);
                            _washSig = washStr;
                            try {
                                if (typeof QOL !== "undefined" && QOL.state) {
                                    QOL.state.keyboardOverlayWashSig = washStr;
                                }
                            } catch(e) {}
                        }

                        if (allBindingsBox) _applyLayout(allBindingsBox, cfg);
                    } else {
                        if (_getPanel("keyboardOverlayRoot")) {
                            _removeOverlay(root);
                        } else {
                            _boxCaches = null;
                            _resetCaches();
                            try {
                                if (typeof QOL !== "undefined" && QOL.state) {
                                    QOL.state.allBindingsBoxes = [];
                                }
                            } catch(e) {}
                        }
                    }
                } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_keyboard", "_tick: " + (e.message || e));
                    }
                }
            }

            return {
                onEnable: function() {
                    _boxCaches = null;
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.05, "ql_keyboard") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var root = $.GetContextPanel();
                    _removeOverlay(root);
                    _boxCaches = null;
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();
