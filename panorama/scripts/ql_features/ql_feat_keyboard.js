// ql_feat_keyboard.js — Keyboard overlay
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _featureId = "ql_feat_keyboard";
    var _deps = QOL.import(["buildKeyboardOverlayLayouts","getCachedPanel","getGameplayHudPanel","getKeyboardCachedPanels","readKeyboardOverlayWashColorIndex","resetKeyboardOverlayCaches","resolveWashColorFromPalette","state","setCachedPanel","setWashColorSafe","utils"]);
    var GC = _deps.getCachedPanel;
    var GGHP = _deps.getGameplayHudPanel;
    var RWP = _deps.resolveWashColorFromPalette;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var SWC = _deps.setWashColorSafe;
    var U = _deps.utils;
    var IsCfgEnabled = U.IsCfgEnabled;
    var IsPanelValid = U.IsPanelValid;
    var FormatHudPx = U.FormatHudPx;
    var GetGameplayHudPanel = _deps.getGameplayHudPanel;
    var BuildKeyboardOverlayLayouts = _deps.buildKeyboardOverlayLayouts;
    var GetKeyboardCachedPanels = _deps.getKeyboardCachedPanels;
    var ReadKeyboardOverlayWashColorIndex = _deps.readKeyboardOverlayWashColorIndex;
    var ResetKeyboardOverlayCaches = _deps.resetKeyboardOverlayCaches;
    var ResolveWashColorFromPalette = _deps.resolveWashColorFromPalette;
    var SetWashColorSafe = _deps.setWashColorSafe;
    function GetKeyboardBoxCache(allBindingsBox) {
        if (!S.keyboardBoxCaches) S.keyboardBoxCaches = [];
        var next = [];
        var found = null;
        for (var i = 0; i < S.keyboardBoxCaches.length; i++) {
            var entry = S.keyboardBoxCaches[i];
            if (!entry || !IsPanelValid(entry.box)) continue;
            if (entry.box === allBindingsBox) found = entry;
            next.push(entry);
        }
        S.keyboardBoxCaches = next;
        if (found) return found;

        var created = {
            box: allBindingsBox,
            keyPanels: null,
            glyphLabels: null,
            mouseGlyphs: null,
            lastStyleSig: ""
        };
        S.keyboardBoxCaches.push(created);
        return created;
    }

    function ApplyKeyboardOverlayLayout(allBindingsBox, cfg) {
        if (!allBindingsBox) return;

        var kbScale = (cfg.KEYBOARD_OVERLAY_SCALE === undefined || cfg.KEYBOARD_OVERLAY_SCALE === null) ? 100 : Math.round(cfg.KEYBOARD_OVERLAY_SCALE);
        var kbOffsetX = (cfg.KEYBOARD_OVERLAY_X_OFFSET === undefined || cfg.KEYBOARD_OVERLAY_X_OFFSET === null) ? 0 : Math.round(cfg.KEYBOARD_OVERLAY_X_OFFSET);
        var kbOffsetY = (cfg.KEYBOARD_OVERLAY_Y_OFFSET === undefined || cfg.KEYBOARD_OVERLAY_Y_OFFSET === null) ? 0 : Math.round(cfg.KEYBOARD_OVERLAY_Y_OFFSET);
        var kbFullLayout = cfg.ENABLE_FULL_KEYBOARD_LAYOUT === 1;
        var kbBaseMarginLeft = kbFullLayout ? 70 : 150;
        var kbBaseMarginBottom = 300;

        if (kbScale < 70) kbScale = 70;
        if (kbScale > 150) kbScale = 150;
        if (kbOffsetX < -1500) kbOffsetX = -1500;
        if (kbOffsetX > 1500) kbOffsetX = 1500;
        if (kbOffsetY < -400) kbOffsetY = -400;
        if (kbOffsetY > 1000) kbOffsetY = 1000;

        var styleSig = [
            kbFullLayout ? "1" : "0",
            String(kbScale),
            String(kbOffsetX),
            String(kbOffsetY)
        ].join("|");
        var cache = GetKeyboardBoxCache(allBindingsBox);
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
        allBindingsBox.style.x = FormatHudPx(kbOffsetX, 0);
        allBindingsBox.style.y = FormatHudPx(-kbOffsetY, 0);
        allBindingsBox.style.width = "fit-children";

        var keyPanels = GetKeyboardCachedPanels(cache, allBindingsBox, "keyPanels", "Key");
        for (var keyIdx = 0; keyIdx < keyPanels.length; keyIdx++) {
            var keyPanel = keyPanels[keyIdx];
            if (!keyPanel) continue;

            var baseKeyWidth = 40;
            if (keyPanel.BHasClass("TabKey")) {
                baseKeyWidth = 53;
            } else if (keyPanel.BHasClass("SpaceKey")) {
                baseKeyWidth = kbFullLayout ? 133 : 192;
            } else if (keyPanel.BHasClass("ShiftKey")) {
                baseKeyWidth = 80;
            } else if (keyPanel.BHasClass("AltKey") || keyPanel.BHasClass("CtrlKey")) {
                baseKeyWidth = 60;
            } else if (keyPanel.BHasClass("EmptyKeyWide")) {
                baseKeyWidth = kbFullLayout ? 60 : 80;
            }

            keyPanel.style.width = Math.max(1, Math.round(baseKeyWidth * kbScaleFactor)) + "px";
            keyPanel.style.height = scaledHeight + "px";
            keyPanel.style.margin = scaledGap + "px";
        }

        var keyboardGlyphLabels = GetKeyboardCachedPanels(cache, allBindingsBox, "glyphLabels", "Label");
        for (var glyphIdx = 0; glyphIdx < keyboardGlyphLabels.length; glyphIdx++) {
            var glyphLabel = keyboardGlyphLabels[glyphIdx];
            if (!glyphLabel) continue;
            glyphLabel.style.fontSize = scaledLabelSize + "px";
            glyphLabel.style.lineHeight = "0px";
        }

        var mouseGlyphs = GetKeyboardCachedPanels(cache, allBindingsBox, "mouseGlyphs", "MouseButtonGlyph");
        for (var mouseIdx = 0; mouseIdx < mouseGlyphs.length; mouseIdx++) {
            var mouseGlyph = mouseGlyphs[mouseIdx];
            if (!mouseGlyph) continue;
            mouseGlyph.style.width = scaledMouseGlyphSize + "px";
            mouseGlyph.style.height = scaledMouseGlyphSize + "px";
            mouseGlyph.style.backgroundTextureSize = scaledMouseGlyphSize + "px " + scaledMouseGlyphSize + "px";
        }

        cache.lastStyleSig = styleSig;
    }

    function EnsureKeyboardOverlay(root) {
        var overlayRoot = GC("keyboardOverlayRoot");
        if (!IsPanelValid(overlayRoot)) {
            overlayRoot = root.FindChildTraverse("QOLKeyboardOverlayRoot");
            if (!overlayRoot) {
                var parent = GetGameplayHudPanel(root);
                if (!parent) return null;
                overlayRoot = $.CreatePanel("Panel", parent, "QOLKeyboardOverlayRoot", {
                    hittest: "false",
                    hittestchildren: "false"
                });
            }
            SC("keyboardOverlayRoot", overlayRoot);
        }
        if (!overlayRoot) return null;

        var allBindingsBox = GC("keyboardOverlayBox");
        if (!IsPanelValid(allBindingsBox)) {
            allBindingsBox = overlayRoot.FindChildTraverse("AllBindingsBox");
            if (!allBindingsBox) {
                allBindingsBox = $.CreatePanel("Panel", overlayRoot, "AllBindingsBox", {
                    "class": "AllBindingsScope",
                    hittest: "false",
                    hittestchildren: "false"
                });
                BuildKeyboardOverlayLayouts(allBindingsBox);
            }
            SC("keyboardOverlayBox", allBindingsBox);
        }
        S.allBindingsBoxes = allBindingsBox ? [allBindingsBox] : [];
        return allBindingsBox;
    }

    function RemoveKeyboardOverlay(root) {
        var overlayRoot = GC("keyboardOverlayRoot");
        if (!IsPanelValid(overlayRoot)) {
            overlayRoot = root.FindChildTraverse("QOLKeyboardOverlayRoot");
        }
        if (IsPanelValid(overlayRoot)) {
            overlayRoot.DeleteAsync(0);
        }
        SC("keyboardOverlayRoot", null);
        SC("keyboardOverlayBox", null);
        S.keyboardOverlayWashSig = "";
        S.allBindingsBoxes = [];
        ResetKeyboardOverlayCaches();
    }

    function UpdateKeyboardOverlayRuntime(root, cfg) {
        if (cfg && cfg.ENABLE_KEYBOARD_OVERLAY === 1) {
            var allBindingsBoxes = S.allBindingsBoxes || [];
            var validBoxes = [];
            for (var boxIdx = 0; boxIdx < allBindingsBoxes.length; boxIdx++) {
                var candidate = allBindingsBoxes[boxIdx];
                if (IsPanelValid(candidate)) validBoxes.push(candidate);
            }
            if (validBoxes.length === 0) {
                var keyboardBox = EnsureKeyboardOverlay(root);
                validBoxes = keyboardBox ? [keyboardBox] : [];
            }
            S.allBindingsBoxes = validBoxes;

            var overlayRoot = GC("keyboardOverlayRoot");
            var keyboardWashColor = ResolveWashColorFromPalette(ReadKeyboardOverlayWashColorIndex(cfg));
            var keyboardWashSig = keyboardWashColor || "";
            if (overlayRoot && S.keyboardOverlayWashSig !== keyboardWashSig) {
                SetWashColorSafe(overlayRoot, keyboardWashColor);
                S.keyboardOverlayWashSig = keyboardWashSig;
            }

            for (var vb = 0; vb < validBoxes.length; vb++) {
                var allBindingsBox = validBoxes[vb];
                if (!allBindingsBox) continue;
                ApplyKeyboardOverlayLayout(allBindingsBox, cfg);
            }
        } else if (GC("keyboardOverlayRoot")) {
            RemoveKeyboardOverlay(root);
        } else {
            S.allBindingsBoxes = [];
            ResetKeyboardOverlayCaches();
        }
    }

    // ── Registration ──
    QOL.register("keyboardRuntime", {
        configKeys: ["ENABLE_KEYBOARD_OVERLAY"],
        bucket: 6, phase: -1,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_KEYBOARD_OVERLAY") || GC("keyboardOverlayRoot") || !!(S.allBindingsBoxes && S.allBindingsBoxes.length > 0); },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateKeyboardOverlayRuntime(root, cfg);
        },
        stateKeys: ["allBindingsBoxes",
                    "cachedPanels.keyboardOverlayRoot",
                    "cachedPanels.keyboardOverlayBox",
                    "keyboardOverlayWashSig",
                    "keyboardBoxCaches"]
    });

})();
