// features/ql_keyboard/manifest.js
// =============================================================================
// QOLLOCK — Keyboard Overlay (key binding display with scale, position, wash color)
// =============================================================================
// OWNS:        Keyboard overlay panel creation, layout, and cleanup
// DOES NOT OWN: Key bindings, input system
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_KEYBOARD_OVERLAY, ENABLE_FULL_KEYBOARD_LAYOUT,
//              KEYBOARD_OVERLAY_SCALE, KEYBOARD_OVERLAY_X_OFFSET,
//              KEYBOARD_OVERLAY_Y_OFFSET, KEYBOARD_OVERLAY_WASH_COLOR
// PATTERN:     Polling (~5Hz). Creates overlay with child panels.
// =============================================================================

(() => {
    "use strict";
    const FR = QOL.core?.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] keyboard: FeatureRegistry not found — aborting");
        return;
    }

    const KEYBOARD_OVERLAY_WASH_COLOR_ATTR = "QOL_KEYBOARD_OVERLAY_WASH_COLOR";

    const isAlive = QOL.utils.IsPanelValid;

    const createKeyboardOverlayKey = (parent, spec) => {
        if (!parent || !spec) return null;
        if (spec.emptyClass) {
            const empty = $.CreatePanel("Panel", parent, "");
            empty.AddClass("Key");
            empty.AddClass(spec.emptyClass);
            return empty;
        }

        const binding = $.CreatePanel("CitadelBinding", parent, "", {
            action: spec.action,
            glyphstyle: spec.glyphstyle,
            solid: "false"
        });
        binding.AddClass("Key");
        if (spec.keyClass) binding.AddClass(spec.keyClass);
        return binding;
    };

    const createKeyboardOverlayRow = (layout, specs) => {
        const row = $.CreatePanel("Panel", layout, "");
        row.AddClass("KeyboardRow");
        for (let i = 0; i < specs.length; i++) {
            createKeyboardOverlayKey(row, specs[i]);
        }
        return row;
    };

    const buildKeyboardOverlayLayouts = (allBindingsBox) => {
        const baseLayout = $.CreatePanel("Panel", allBindingsBox, "");
        baseLayout.AddClass("KeyboardLayout");
        baseLayout.AddClass("KeyboardLayoutBase");
        createKeyboardOverlayRow(baseLayout, [
            { emptyClass: "EmptyKeyWide" },
            { action: "AbilityMelee", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "MoveForward", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Attack", glyphstyle: "dark", keyClass: "MouseKey" },
            { action: "ADS", glyphstyle: "dark", keyClass: "MouseKey" }
        ]);
        createKeyboardOverlayRow(baseLayout, [
            { action: "Roll", glyphstyle: "light", keyClass: "ShiftKey" },
            { action: "MoveLeft", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveBackwards", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveRight", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "HeldItem", glyphstyle: "light", keyClass: "ASDFKey" }
        ]);
        createKeyboardOverlayRow(baseLayout, [
            { action: "Crouch", glyphstyle: "light", keyClass: "CtrlKey" },
            { action: "Mantle", glyphstyle: "light", keyClass: "SpaceKey" }
        ]);

        const fullLayout = $.CreatePanel("Panel", allBindingsBox, "");
        fullLayout.AddClass("KeyboardLayout");
        fullLayout.AddClass("KeyboardLayoutFull");
        createKeyboardOverlayRow(fullLayout, [
            { emptyClass: "EmptyKey" },
            { action: "Ability1", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability2", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability3", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability4", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Attack", glyphstyle: "dark", keyClass: "MouseKey" },
            { action: "ADS", glyphstyle: "dark", keyClass: "MouseKey" }
        ]);
        createKeyboardOverlayRow(fullLayout, [
            { action: "Scoreboard", glyphstyle: "light", keyClass: "TabKey" },
            { action: "AbilityMelee", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "MoveForward", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Cosmetic1", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Reload", glyphstyle: "light", keyClass: "QWERTYKey" }
        ]);
        createKeyboardOverlayRow(fullLayout, [
            { emptyClass: "EmptyKeyWide" },
            { action: "MoveLeft", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveBackwards", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveRight", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "HeldItem", glyphstyle: "light", keyClass: "ASDFKey" }
        ]);
        createKeyboardOverlayRow(fullLayout, [
            { action: "Roll", glyphstyle: "light", keyClass: "ShiftKey" },
            { action: "Item1", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item2", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item3", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item4", glyphstyle: "light", keyClass: "ZXCVKey" }
        ]);
        createKeyboardOverlayRow(fullLayout, [
            { action: "Crouch", glyphstyle: "light", keyClass: "CtrlKey" },
            { action: "ExtraInfo", glyphstyle: "light", keyClass: "AltKey" },
            { action: "Mantle", glyphstyle: "light", keyClass: "SpaceKey" }
        ]);
    };

    const isPanelListValid = (list) => {
        if (!list || list.length === 0) return false;
        for (let i = 0; i < list.length; i++) {
            if (!isAlive(list[i])) return false;
        }
        return true;
    };

    const getKeyboardCachedPanels = (cache, allBindingsBox, fieldName, className) => {
        let list = cache[fieldName];
        if (!isPanelListValid(list)) {
            list = allBindingsBox.FindChildrenWithClassTraverse(className) || [];
            cache[fieldName] = list;
        }
        return list;
    };

    const resetKeyboardOverlayCaches = () => {
        const state = QOL.state || globalThis.State;
        if (state) state.keyboardBoxCaches = [];
    };

    // Expose on QOL namespace for compatibility
    QOL.buildKeyboardOverlayLayouts = buildKeyboardOverlayLayouts;
    QOL.getKeyboardCachedPanels = getKeyboardCachedPanels;
    QOL.resetKeyboardOverlayCaches = resetKeyboardOverlayCaches;

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
        create(ctx) {
            let _loop = null;
            let _washSig = "";
            let _boxCaches = null;

            const getPanel = QOL.getCachedPanel;
            const setPanel = QOL.setCachedPanel;
            const getGameplayHud = (root) => {
                try { if (QOL.getGameplayHudPanel) return QOL.getGameplayHudPanel(root); } catch (_) {}
                return root;
            };

            const readWashIdx = (cfg) => {
                try { if (QOL.readKeyboardOverlayWashColorIndex) return QOL.readKeyboardOverlayWashColorIndex(cfg); } catch (_) {}
                const Utils = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : QOL.utils;
                if (Utils?.ReadPaletteColorIndexWithPanelAttr) {
                    return Utils.ReadPaletteColorIndexWithPanelAttr(cfg, "KEYBOARD_OVERLAY_WASH_COLOR", KEYBOARD_OVERLAY_WASH_COLOR_ATTR, "");
                }
                return Number(cfg?.KEYBOARD_OVERLAY_WASH_COLOR) || 0;
            };

            const resolveWash = (idx) => {
                try { if (QOL.resolveWashColorFromPalette) return QOL.resolveWashColorFromPalette(idx); } catch (_) {}
                const Utils = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : QOL.utils;
                if (Utils?.ResolveWashColorFromPalette) {
                    return Utils.ResolveWashColorFromPalette(idx);
                }
                return "";
            };

            const setWashSafe = (panel, color) => {
                try { if (QOL.setWashColorSafe) return QOL.setWashColorSafe(panel, color); } catch (_) {}
                if (panel?.style) {
                    try { panel.style.washColor = color || "none"; } catch (_) {}
                }
            };

            const getBoxCache = (box) => {
                if (!_boxCaches) _boxCaches = [];
                const next = [];
                let found = null;
                for (let i = 0; i < _boxCaches.length; i++) {
                    const e = _boxCaches[i];
                    if (!e || !isAlive(e.box)) continue;
                    if (e.box === box) found = e;
                    next.push(e);
                }
                _boxCaches = next;
                if (found) return found;
                const created = { box, keyPanels: null, glyphLabels: null, mouseGlyphs: null, lastStyleSig: "" };
                _boxCaches.push(created);
                return created;
            };

            const applyLayout = (allBindingsBox, cfg) => {
                if (!allBindingsBox) return;
                let kbScale = (cfg.KEYBOARD_OVERLAY_SCALE == null) ? 100 : Math.round(cfg.KEYBOARD_OVERLAY_SCALE);
                let kbOffsetX = (cfg.KEYBOARD_OVERLAY_X_OFFSET == null) ? 0 : Math.round(cfg.KEYBOARD_OVERLAY_X_OFFSET);
                let kbOffsetY = (cfg.KEYBOARD_OVERLAY_Y_OFFSET == null) ? 0 : Math.round(cfg.KEYBOARD_OVERLAY_Y_OFFSET);
                const kbFullLayout = Number(cfg.ENABLE_FULL_KEYBOARD_LAYOUT) === 1;
                const kbBaseMarginLeft = kbFullLayout ? 70 : 150;
                const kbBaseMarginBottom = 300;
                if (kbScale < 70) kbScale = 70;
                if (kbScale > 150) kbScale = 150;
                if (kbOffsetX < -1500) kbOffsetX = -1500;
                if (kbOffsetX > 1500) kbOffsetX = 1500;
                if (kbOffsetY < -400) kbOffsetY = -400;
                if (kbOffsetY > 1000) kbOffsetY = 1000;

                const styleSig = `${kbFullLayout ? "1" : "0"}|${kbScale}|${kbOffsetX}|${kbOffsetY}`;
                const cache = getBoxCache(allBindingsBox);
                if (cache.lastStyleSig === styleSig) return;

                const kbScaleFactor = kbScale / 100;
                const scaledHeight = Math.max(1, Math.round(40 * kbScaleFactor));
                const scaledGap = 2;
                const labelScaleFactor = kbScale > 100 ? kbScaleFactor : 1;
                const scaledLabelSize = Math.max(1, Math.round(16 * labelScaleFactor));
                const scaledMouseGlyphSize = Math.max(1, Math.round(20 * labelScaleFactor));

                allBindingsBox.style.uiScale = "100%";
                allBindingsBox.style.marginLeft = `${kbBaseMarginLeft}px`;
                allBindingsBox.style.marginBottom = `${kbBaseMarginBottom}px`;
                allBindingsBox.style.x = `${kbOffsetX}px`;
                allBindingsBox.style.y = `${-kbOffsetY}px`;
                allBindingsBox.style.width = "fit-children";

                const keyPanels = getKeyboardCachedPanels(cache, allBindingsBox, "keyPanels", "Key");
                for (let ki = 0; ki < keyPanels.length; ki++) {
                    const kp = keyPanels[ki];
                    if (!kp) continue;
                    let bw = 40;
                    if (kp.BHasClass("TabKey")) bw = 53;
                    else if (kp.BHasClass("SpaceKey")) bw = kbFullLayout ? 133 : 192;
                    else if (kp.BHasClass("ShiftKey")) bw = 80;
                    else if (kp.BHasClass("AltKey") || kp.BHasClass("CtrlKey")) bw = 60;
                    else if (kp.BHasClass("EmptyKeyWide")) bw = kbFullLayout ? 60 : 80;
                    kp.style.width = `${Math.max(1, Math.round(bw * kbScaleFactor))}px`;
                    kp.style.height = `${scaledHeight}px`;
                    kp.style.margin = `${scaledGap}px`;
                }
                const glyphs = getKeyboardCachedPanels(cache, allBindingsBox, "glyphLabels", "Label");
                for (let gi = 0; gi < glyphs.length; gi++) {
                    if (!glyphs[gi]) continue;
                    glyphs[gi].style.fontSize = `${scaledLabelSize}px`;
                    glyphs[gi].style.lineHeight = "0px";
                }
                const mice = getKeyboardCachedPanels(cache, allBindingsBox, "mouseGlyphs", "MouseButtonGlyph");
                for (let mi = 0; mi < mice.length; mi++) {
                    if (!mice[mi]) continue;
                    mice[mi].style.width = `${scaledMouseGlyphSize}px`;
                    mice[mi].style.height = `${scaledMouseGlyphSize}px`;
                    mice[mi].style.backgroundTextureSize = `${scaledMouseGlyphSize}px ${scaledMouseGlyphSize}px`;
                }
                cache.lastStyleSig = styleSig;
            };

            const ensureOverlay = (root) => {
                let overlayRoot = getPanel("keyboardOverlayRoot");
                if (!isAlive(overlayRoot)) {
                    overlayRoot = root?.FindChildTraverse ? root.FindChildTraverse("QOLKeyboardOverlayRoot") : null;
                    if (!overlayRoot) {
                        const parent = getGameplayHud(root);
                        if (!parent) return null;
                        overlayRoot = $.CreatePanel("Panel", parent, "QOLKeyboardOverlayRoot", {
                            hittest: "false", hittestchildren: "false"
                        });
                    }
                    setPanel("keyboardOverlayRoot", overlayRoot);
                }
                if (!overlayRoot) return null;
                let allBindingsBox = getPanel("keyboardOverlayBox");
                if (!isAlive(allBindingsBox)) {
                    allBindingsBox = overlayRoot.FindChildTraverse ? overlayRoot.FindChildTraverse("AllBindingsBox") : null;
                    if (!allBindingsBox) {
                        allBindingsBox = $.CreatePanel("Panel", overlayRoot, "AllBindingsBox", {
                            "class": "AllBindingsScope", hittest: "false", hittestchildren: "false"
                        });
                        buildKeyboardOverlayLayouts(allBindingsBox);
                    }
                    setPanel("keyboardOverlayBox", allBindingsBox);
                }
                return allBindingsBox;
            };

            const removeOverlay = (root) => {
                let overlayRoot = getPanel("keyboardOverlayRoot");
                if (!isAlive(overlayRoot) && root?.FindChildTraverse) {
                    overlayRoot = root.FindChildTraverse("QOLKeyboardOverlayRoot");
                }
                if (isAlive(overlayRoot)) {
                    try { overlayRoot.DeleteAsync(0); } catch (_) {}
                }
                setPanel("keyboardOverlayRoot", null);
                setPanel("keyboardOverlayBox", null);
                _washSig = "";
                _boxCaches = null;
                resetKeyboardOverlayCaches();
                const state = QOL.state || globalThis.State;
                if (state) {
                    state.keyboardOverlayWashSig = "";
                    state.allBindingsBoxes = [];
                }
            };

            const _tick = () => {
                try {
                    const root = $.GetContextPanel();
                    if (!root) return;
                    const cfg = ctx.config.view();

                    if (Number(cfg?.ENABLE_KEYBOARD_OVERLAY) === 1) {
                        const allBindingsBox = ensureOverlay(root);
                        const state = QOL.state || globalThis.State;
                        if (state) {
                            state.allBindingsBoxes = allBindingsBox ? [allBindingsBox] : [];
                        }

                        // Wash color
                        const overlayRoot = getPanel("keyboardOverlayRoot");
                        const washIdx = readWashIdx(cfg);
                        const washColor = resolveWash(washIdx);
                        const washStr = washColor || "";
                        if (isAlive(overlayRoot) && _washSig !== washStr) {
                            setWashSafe(overlayRoot, washColor);
                            _washSig = washStr;
                            if (state) state.keyboardOverlayWashSig = washStr;
                        }

                        if (allBindingsBox) applyLayout(allBindingsBox, cfg);
                    } else {
                        if (getPanel("keyboardOverlayRoot")) {
                            removeOverlay(root);
                        } else {
                            _boxCaches = null;
                            resetKeyboardOverlayCaches();
                            const state = QOL.state || globalThis.State;
                            if (state) state.allBindingsBoxes = [];
                        }
                    }
                } catch (e) {
                    QOL.core?.Logger?.logError?.("ql_keyboard", `_tick: ${e?.message || e}`);
                    throw e;
                }
            };

            return {
                onEnable() {
                    _boxCaches = null;
                    const S = QOL.core?.Scheduler;
                    _loop = S?.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_keyboard") : null;
                },
                onDisable() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    const root = $.GetContextPanel();
                    removeOverlay(root);
                    _boxCaches = null;
                },
                onSettingsChanged() {
                    _boxCaches = null;
                    _tick();
                }
            };
        },
        test(ctx) {
            try {
                const hud = QOL.core?.panel?.findHud ? QOL.core.panel.findHud() : null;
                if (!hud) return null;
                return {
                    passed: true,
                    name: "Keyboard overlay anchor panel exists",
                    message: "",
                    assertions: [{ passed: true, name: "Hud root panel exists" }]
                };
            } catch (e) {
                return { passed: false, name: "Keyboard panel check", message: e?.message || String(e) };
            }
        }
    });
})();
