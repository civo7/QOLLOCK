// features/ql_better_unsecured_hud/manifest.js
// =============================================================================
// QOLLOCK — Better Unsecured HUD (Mirrored Unsecured Souls Overlay)
// =============================================================================
// OWNS:        QOLBetterUnsecuredOverlay with mirrored icon/label/text.
//              Positional mirroring relative to game's hudDeathGoldContainer.
// DOES NOT OWN: gameplay_hud (Valve), hudDeathGoldContainer (Valve)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL delegates: getCachedPanel, setCachedPanel, state, utils,
//              getGameplayHudPanel, parseUnsecuredSoulsValue, panelIdGoldApContainer
// CONFIG KEYS: ENABLE_BETTER_UNSECURED, UNSECURED_SOULS_HUD_SCALE,
//              UNSECURED_SOULS_HUD_X_OFFSET, UNSECURED_SOULS_HUD_Y_OFFSET,
//              ENABLE_BETTER_UNSECURED_SHOW_ICON, ENABLE_BETTER_UNSECURED_SHOW_TEXT,
//              ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT
// CSS:         none
// PATTERN:     Polling (0.2Hz). Signature-based style caching.
//              Finds game's unsecured souls container via traversal.
//              Creates mirror overlay with reflected y-offset.
// STATE KEYS:  State.unsecuredSouls.hud* (hudNextSearchMs, hudLabel, hudMirrorLabel,
//              hudMirrorIcon, hudMirrorText, hudBaseX, hudBaseY, hudStyleSig)
//              (written for backward compat — Pattern 7)
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_better_unsecured_hud: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_better_unsecured_hud",
        enableKey: "ENABLE_BETTER_UNSECURED",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_BETTER_UNSECURED", type: "toggle", default: false },
            { key: "UNSECURED_SOULS_HUD_SCALE", type: "slider", min: 50, max: 200, default: 100 },
            { key: "UNSECURED_SOULS_HUD_X_OFFSET", type: "slider", min: -1000, max: 2000, default: 0 },
            { key: "UNSECURED_SOULS_HUD_Y_OFFSET", type: "slider", min: 800, max: 2000, default: 1095 },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON", type: "toggle", default: false },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_TEXT", type: "toggle", default: false },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT", type: "toggle", default: false }
        ],
        create: function(ctx) {
            // ── QOL delegate wrappers (Pattern 10) ──
            function _getState() {
                try { if (typeof QOL !== "undefined" && QOL.state) return QOL.state; } catch(e) {}
                return null;
            }
            var _getCachedPanel = QOL.getCachedPanel;
            var _setCachedPanel = QOL.setCachedPanel;
            function _getGameplayHudPanel(root) {
                try { if (typeof QOL !== "undefined" && QOL.getGameplayHudPanel) return QOL.getGameplayHudPanel(root); } catch(e) {}
                if (!root || !root.FindChildTraverse) return root || null;
                return root.FindChildTraverse("gameplay_hud") || root;
            }
            function _getPanelIdGoldApContainer() {
                try { if (typeof QOL !== "undefined" && QOL.panelIdGoldApContainer) return QOL.panelIdGoldApContainer; } catch(e) {}
                return "gold_and_ap_container";
            }
            function _parseUnsecuredSoulsValue(valueText) {
                try { if (typeof QOL !== "undefined" && QOL.parseUnsecuredSoulsValue) return QOL.parseUnsecuredSoulsValue(valueText); } catch(e) {}
                return 0;
            }
            var _isPanelValid = QOL.utils.IsPanelValid;
            var _isCfgEnabled = QOL.utils.IsCfgEnabled;
            var _clampConfigNumber = QOL.utils.ClampConfigNumber;
            function _getPanelPositionRelativeToAncestor(child, ancestor) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.GetPanelPositionRelativeToAncestor) return QOL.utils.GetPanelPositionRelativeToAncestor(child, ancestor); } catch(e) {}
                return null;
            }
            function _readSafePanelLayoutOffset(val) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.ReadSafePanelLayoutOffset) return QOL.utils.ReadSafePanelLayoutOffset(val); } catch(e) {}
                return (val != null && isFinite(val)) ? val : null;
            }
            function _getDefaultConfigYOffset() {
                try { if (typeof globalThis !== "undefined" && globalThis.DEFAULT_CONFIG && globalThis.DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET != null) return Number(globalThis.DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET); } catch(e) {}
                try { if (typeof QOL_DEFAULT_CONFIG !== "undefined" && QOL_DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET != null) return Number(QOL_DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET); } catch(e) {}
                return 1095;
            }

            // ── Constants ──
            var PANEL_LAYOUT_OFFSET_ABS_MAX = 100000;
            var PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
            var UNSECURED_SOULS_HUD_SEARCH_MS = 2000;

            var _loop = null;

            // ── Helpers ──
            function _parseSpmNumber(valueText) {
                if (!valueText) return 0;
                var raw = String(valueText).replace(/,/g, "").trim().toLowerCase();
                if (raw.length === 0) return 0;
                var scale = 1;
                var suffix = raw.charAt(raw.length - 1);
                if (suffix === "k" || suffix === "m" || suffix === "b") {
                    raw = raw.substring(0, raw.length - 1);
                    if (suffix === "k") scale = 1000;
                    else if (suffix === "m") scale = 1000000;
                    else if (suffix === "b") scale = 1000000000;
                }
                var v = parseFloat(raw);
                return isFinite(v) ? (v * scale) : 0;
            }

            function _parseUnsecuredSouls(sourceText) {
                return Math.max(0, Math.round(_parseSpmNumber(sourceText)));
            }

            function _findContainer(root) {
                var PANEL_ID_GOLD_AP_CONTAINER = _getPanelIdGoldApContainer();
                if (!root) return null;
                var goldContainer = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_GOLD_AP_CONTAINER) : null;
                if (goldContainer && goldContainer.FindChildrenWithClassTraverse) {
                    var goldContainers = goldContainer.FindChildrenWithClassTraverse("hudDeathGoldContainer") || [];
                    for (var i = 0; i < goldContainers.length; i++) {
                        if (_isPanelValid(goldContainers[i])) return goldContainers[i];
                    }
                }
                var containers = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("hudDeathGoldContainer") || []) : [];
                for (var j = 0; j < containers.length; j++) {
                    if (_isPanelValid(containers[j])) return containers[j];
                }
                return null;
            }

            function _findLabel(root, container) {
                var label = null;
                if (container && container.FindChildTraverse) {
                    label = container.FindChildTraverse("hudDeathGoldLabel");
                    if (!label) label = container.FindChildTraverse("hudDealthGoldLabel");
                }
                if (!label && root && root.FindChildTraverse) {
                    label = root.FindChildTraverse("hudDeathGoldLabel");
                    if (!label) label = root.FindChildTraverse("hudDealthGoldLabel");
                }
                if (!label && container && container.FindChildrenWithClassTraverse) {
                    var labels = container.FindChildrenWithClassTraverse("death_penalty_gold") || [];
                    for (var i = 0; i < labels.length; i++) {
                        if (!_isPanelValid(labels[i])) continue;
                        label = labels[i];
                        break;
                    }
                }
                if (!_isPanelValid(label)) return null;
                if (label.BHasClass && !label.BHasClass("death_penalty_gold")) return null;
                return label;
            }

            function _findTextLabel(root, container) {
                var textLabel = null;
                if (container && container.FindChildTraverse) textLabel = container.FindChildTraverse("hudUnsecuredLabel");
                if (!textLabel && root && root.FindChildTraverse) textLabel = root.FindChildTraverse("hudUnsecuredLabel");
                return _isPanelValid(textLabel) ? textLabel : null;
            }

            function _ensureOverlay(root) {
                var State = _getState();
                var overlay = _getCachedPanel("betterUnsecuredOverlay");
                if (!overlay) {
                    overlay = root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
                    if (!overlay) {
                        var parent = _getGameplayHudPanel(root);
                        if (!parent) return null;
                        overlay = $.CreatePanel("Panel", parent, "QOLBetterUnsecuredOverlay", {
                            hittest: "false", hittestchildren: "false"
                        });
                        var icon = $.CreatePanel("Panel", overlay, "QOLBetterUnsecuredMirrorIcon");
                        if (icon) { icon.hittest = false; icon.hittestchildren = false; }
                        var mirror = $.CreatePanel("Label", overlay, "QOLBetterUnsecuredMirrorLabel");
                        if (mirror) {
                            mirror.hittest = false; mirror.hittestchildren = false;
                            if (mirror.AddClass) mirror.AddClass("death_penalty_gold");
                        }
                        var text = $.CreatePanel("Label", overlay, "QOLBetterUnsecuredMirrorText");
                        if (text) { text.hittest = false; text.hittestchildren = false; text.text = "UNSECURED"; }
                    }
                    _setCachedPanel("betterUnsecuredOverlay", overlay);
                }
                if (!State) return overlay;
                if (!State.unsecuredSouls) State.unsecuredSouls = {};
                var mirrorLabel = _isPanelValid(State.unsecuredSouls.hudMirrorLabel) ? State.unsecuredSouls.hudMirrorLabel : null;
                var mirrorIcon = _isPanelValid(State.unsecuredSouls.hudMirrorIcon) ? State.unsecuredSouls.hudMirrorIcon : null;
                var mirrorText = _isPanelValid(State.unsecuredSouls.hudMirrorText) ? State.unsecuredSouls.hudMirrorText : null;
                if (!mirrorLabel && overlay && overlay.FindChildTraverse) {
                    mirrorLabel = overlay.FindChildTraverse("QOLBetterUnsecuredMirrorLabel");
                    if (mirrorLabel && mirrorLabel.AddClass && !mirrorLabel.BHasClass("death_penalty_gold")) mirrorLabel.AddClass("death_penalty_gold");
                    State.unsecuredSouls.hudMirrorLabel = mirrorLabel || null;
                }
                if (!mirrorIcon && overlay && overlay.FindChildTraverse) {
                    mirrorIcon = overlay.FindChildTraverse("QOLBetterUnsecuredMirrorIcon");
                    State.unsecuredSouls.hudMirrorIcon = mirrorIcon || null;
                }
                if (!mirrorText && overlay && overlay.FindChildTraverse) {
                    mirrorText = overlay.FindChildTraverse("QOLBetterUnsecuredMirrorText");
                    State.unsecuredSouls.hudMirrorText = mirrorText || null;
                }
                return overlay;
            }

            function _removeOverlay(root) {
                var overlay = _getCachedPanel("betterUnsecuredOverlay");
                if (!overlay && root && root.FindChildTraverse) overlay = root.FindChildTraverse("QOLBetterUnsecuredOverlay");
                if (_isPanelValid(overlay)) overlay.DeleteAsync(0);
                _setCachedPanel("betterUnsecuredOverlay", null);
                var State = _getState();
                if (State) {
                    State.unsecuredSouls.hudMirrorLabel = null;
                    State.unsecuredSouls.hudMirrorIcon = null;
                    State.unsecuredSouls.hudMirrorText = null;
                }
            }

            function _applyLayout(overlay, mirrorLabel, mirrorIcon, mirrorText, label, panel, root, cfg, scale, xOffset, yOffset, fontPx, showIcon, showText) {
                var State = _getState();
                if (!State) return;
                var sourceText = (typeof label.text === "string") ? label.text : "";
                var sourceTextLabel = _findTextLabel(root, panel);
                var unsecuredText = (sourceTextLabel && typeof sourceTextLabel.text === "string" && sourceTextLabel.text.length > 0) ? sourceTextLabel.text : "UNSECURED";
                var sourceValue = _parseUnsecuredSouls(sourceText);
                if (!isFinite(sourceValue)) sourceValue = 0;
                if (sourceValue <= 0) {
                    var zeroSig = "hidden_zero|" + sourceText;
                    if (State.unsecuredSouls.hudStyleSig !== zeroSig) {
                        if (!overlay.BHasClass || !overlay.BHasClass("qol-hidden")) { if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true); else overlay.style.visibility = "collapse"; }
                        State.unsecuredSouls.hudStyleSig = zeroSig;
                    }
                    return;
                }
                var overlayParent = overlay.GetParent ? overlay.GetParent() : null;
                var sourcePos = _getPanelPositionRelativeToAncestor(label, overlayParent);
                var baseX = null, baseY = null;
                if (sourcePos && isFinite(sourcePos.x) && isFinite(sourcePos.y)) {
                    baseX = Math.round(sourcePos.x); baseY = Math.round(sourcePos.y);
                    State.unsecuredSouls.hudBaseX = baseX; State.unsecuredSouls.hudBaseY = baseY;
                } else {
                    var cachedBaseX = _readSafePanelLayoutOffset(State.unsecuredSouls.hudBaseX);
                    var cachedBaseY = _readSafePanelLayoutOffset(State.unsecuredSouls.hudBaseY);
                    baseX = (cachedBaseX !== null) ? cachedBaseX : 0;
                    baseY = (cachedBaseY !== null) ? cachedBaseY : 0;
                }
                var targetX = baseX + xOffset;
                var unsecuredHudBaselineY = _getDefaultConfigYOffset();
                if (!isFinite(unsecuredHudBaselineY)) unsecuredHudBaselineY = 0;
                var reflectedYOffset = (2 * unsecuredHudBaselineY) - yOffset;
                var targetY = baseY + reflectedYOffset;
                if (!isFinite(targetX) || !isFinite(targetY) || Math.abs(targetX) > PANEL_LAYOUT_OFFSET_ABS_MAX || Math.abs(targetY) > PANEL_LAYOUT_OFFSET_ABS_MAX) {
                    if (!overlay.BHasClass || !overlay.BHasClass("qol-hidden")) { if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true); else overlay.style.visibility = "collapse"; }
                    State.unsecuredSouls.hudStyleSig = "hidden_invalid_pos";
                    return;
                }
                var sig = String(scale) + "|" + String(targetX) + "|" + String(targetY) + "|" + String(fontPx) + "|" + sourceText + "|" + unsecuredText + "|" + (showIcon ? "1" : "0") + "|" + (showText ? "1" : "0");
                if (sig === State.unsecuredSouls.hudStyleSig) return;

                if (!overlay.BHasClass || !overlay.BHasClass("qol-hidden")) { if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false); else overlay.style.visibility = "visible"; }
                overlay.style.x = targetX + "px";
                overlay.style.y = targetY + "px";

                if (mirrorIcon.SetHasClass) mirrorIcon.SetHasClass("qol-hidden", !showIcon); else mirrorIcon.style.visibility = showIcon ? "visible" : "collapse";
                if (mirrorText.SetHasClass) mirrorText.SetHasClass("qol-hidden", !showText); else mirrorText.style.visibility = showText ? "visible" : "collapse";
                if (showText && mirrorText.text !== unsecuredText) mirrorText.text = unsecuredText;

                if (mirrorLabel.text !== sourceText) mirrorLabel.text = sourceText;
                if (!mirrorLabel.BHasClass || !mirrorLabel.BHasClass("qol-hidden")) { if (mirrorLabel.SetHasClass) mirrorLabel.SetHasClass("qol-hidden", false); else mirrorLabel.style.visibility = "visible"; }
                mirrorLabel.style.fontSize = fontPx + "px";
                mirrorLabel.style.x = "0px";
                mirrorLabel.style.y = "0px";
                State.unsecuredSouls.hudStyleSig = sig;
            }

            // ── Main tick ──
            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!_isPanelValid(root)) return;

                    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                    var cfg = ctx.config.view();
                    var enabled = Number(cfg.ENABLE_BETTER_UNSECURED) === 1;
                    var State = _getState();
                    if (!State) return;
                    if (!State.unsecuredSouls) State.unsecuredSouls = {};

                    var panel = _getCachedPanel("unsecuredSoulsHudContainer");
                    var label = _isPanelValid(State.unsecuredSouls.hudLabel) ? State.unsecuredSouls.hudLabel : null;

                    if (!enabled) {
                        _removeOverlay(root);
                        State.unsecuredSouls.hudLabel = null;
                        State.unsecuredSouls.hudMirrorLabel = null;
                        State.unsecuredSouls.hudMirrorIcon = null;
                        State.unsecuredSouls.hudMirrorText = null;
                        State.unsecuredSouls.hudBaseX = null;
                        State.unsecuredSouls.hudBaseY = null;
                        State.unsecuredSouls.hudStyleSig = "";
                        return;
                    }

                    if (!panel) {
                        if (nowMs >= (State.unsecuredSouls.hudNextSearchMs || 0)) {
                            panel = _findContainer(root);
                            _setCachedPanel("unsecuredSoulsHudContainer", panel);
                            State.unsecuredSouls.hudNextSearchMs = panel ? 0 : (nowMs + UNSECURED_SOULS_HUD_SEARCH_MS);
                        }
                    }
                    if (!panel) {
                        State.unsecuredSouls.hudMirrorLabel = null;
                        State.unsecuredSouls.hudMirrorIcon = null;
                        State.unsecuredSouls.hudMirrorText = null;
                        State.unsecuredSouls.hudStyleSig = "";
                        _removeOverlay(root);
                        return;
                    }
                    if (!label) {
                        label = _findLabel(root, panel);
                        State.unsecuredSouls.hudLabel = label || null;
                    }

                    var overlay = _ensureOverlay(root);
                    if (!overlay) { State.unsecuredSouls.hudStyleSig = ""; return; }

                    var mirrorLabel = _isPanelValid(State.unsecuredSouls.hudMirrorLabel) ? State.unsecuredSouls.hudMirrorLabel : null;
                    var mirrorIcon = _isPanelValid(State.unsecuredSouls.hudMirrorIcon) ? State.unsecuredSouls.hudMirrorIcon : null;
                    var mirrorText = _isPanelValid(State.unsecuredSouls.hudMirrorText) ? State.unsecuredSouls.hudMirrorText : null;

                    if (!label) {
                        if (!overlay.BHasClass || !overlay.BHasClass("qol-hidden")) { if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true); else overlay.style.visibility = "collapse"; }
                        State.unsecuredSouls.hudStyleSig = "";
                        return;
                    }
                    if (!mirrorLabel || !mirrorIcon || !mirrorText) { State.unsecuredSouls.hudStyleSig = ""; return; }

                    var scale = _clampConfigNumber(cfg.UNSECURED_SOULS_HUD_SCALE, 100, 50, 200, true);
                    var xOffset = _clampConfigNumber(cfg.UNSECURED_SOULS_HUD_X_OFFSET, 0, -1000, 2000, true);
                    var yOffset = _clampConfigNumber(cfg.UNSECURED_SOULS_HUD_Y_OFFSET, 1095, 800, 2000, true);
                    var fontPx = Math.round(14 * (scale / 100));
                    if (fontPx < 8) fontPx = 8;
                    if (fontPx > 72) fontPx = 72;

                    var legacyShowBoth = _isCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT");
                    var showIcon = legacyShowBoth || _isCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_ICON");
                    var showText = legacyShowBoth || _isCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_TEXT");

                    _applyLayout(overlay, mirrorLabel, mirrorIcon, mirrorText, label, panel, root, cfg, scale, xOffset, yOffset, fontPx, showIcon, showText);
                } catch(e) {
                    logger.logError("ql_better_unsecured_hud", "_tick threw: " + (e.message || e));
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_better_unsecured_hud") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_better_unsecured_hud");
                    logger.clearThrottle("ql_better_unsecured_hud");
                    var root = $.GetContextPanel();
                    _removeOverlay(root);
                    _setCachedPanel("unsecuredSoulsHudContainer", null);
                    var State = _getState();
                    if (State) {
                        State.unsecuredSouls.hudLabel = null;
                        State.unsecuredSouls.hudMirrorLabel = null;
                        State.unsecuredSouls.hudMirrorIcon = null;
                        State.unsecuredSouls.hudMirrorText = null;
                        State.unsecuredSouls.hudBaseX = null;
                        State.unsecuredSouls.hudBaseY = null;
                        State.unsecuredSouls.hudStyleSig = "";
                        State.unsecuredSouls.hudNextSearchMs = 0;
                    }
                },
                onSettingsChanged: function() {
                    var State = _getState();
                    if (State && State.unsecuredSouls) {
                        State.unsecuredSouls.hudStyleSig = "";
                    }
                    _tick();
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var hud = root ? root.FindChildTraverse("gameplay_hud") : null;
                if (!hud) return null;
                return { passed: true, name: "Gameplay HUD exists for unsecured overlay", message: "", assertions: [{ passed: true, name: "gameplay_hud panel exists" }] };
            } catch(e) { return { passed: false, name: "Better unsecured HUD check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
