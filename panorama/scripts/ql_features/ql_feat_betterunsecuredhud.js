// ql_feat_betterunsecuredhud.js — Better unsecured souls HUD container layout
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_betterunsecuredhud";
    // DEPENDS: getCachedPanel, getGameplayHudPanel, parseUnsecuredSoulsValue, state, setCachedPanel, utils, panelIdGoldApContainer
    var _deps = QOL.import(["getCachedPanel", "getGameplayHudPanel", "parseUnsecuredSoulsValue", "state", "setCachedPanel", "utils", "panelIdGoldApContainer"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var GGHP = _deps.getGameplayHudPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var PANEL_ID_GOLD_AP_CONTAINER = _deps.panelIdGoldApContainer;
    var ParseUnsecuredSoulsValue = QOL.parseUnsecuredSoulsValue || function() { return 0; };

    var PANEL_LAYOUT_OFFSET_ABS_MAX = 100000;
    var PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
function GetGameplayHudPanel(root) {
        if (!root || !root.FindChildTraverse) return root || null;
        return root.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD) || root;
    }
function ParseSpmNumber(valueText) {
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
function ParseUnsecuredSoulsValue(valueText) {
        return Math.max(0, Math.round(ParseSpmNumber(valueText)));
    }
    function FindUnsecuredSoulsHudContainer(root) {
        if (!root) return null;
        var goldContainer = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_GOLD_AP_CONTAINER) : null;
        if (goldContainer && goldContainer.FindChildrenWithClassTraverse) {
            var goldContainers = goldContainer.FindChildrenWithClassTraverse("hudDeathGoldContainer") || [];
            for (var i = 0; i < goldContainers.length; i++) {
                if (IsPanelValid(goldContainers[i])) return goldContainers[i];
            }
        }
        var containers = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("hudDeathGoldContainer") || []) : [];
        for (var j = 0; j < containers.length; j++) {
            if (IsPanelValid(containers[j])) return containers[j];
        }
        return null;
    }

    function FindUnsecuredSoulsHudLabel(root, container) {
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
                if (!IsPanelValid(labels[i])) continue;
                label = labels[i];
                break;
            }
        }
        if (!IsPanelValid(label)) return null;
        if (label.BHasClass && !label.BHasClass("death_penalty_gold")) return null;
        return label;
    }

    function FindUnsecuredSoulsHudTextLabel(root, container) {
        var textLabel = null;
        if (container && container.FindChildTraverse) {
            textLabel = container.FindChildTraverse("hudUnsecuredLabel");
        }
        if (!textLabel && root && root.FindChildTraverse) {
            textLabel = root.FindChildTraverse("hudUnsecuredLabel");
        }
        return IsPanelValid(textLabel) ? textLabel : null;
    }

    function EnsureBetterUnsecuredOverlay(root) {
        var overlay = GetCachedPanel("betterUnsecuredOverlay");
        if (!overlay) {
            overlay = root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
            if (!overlay) {
                var parent = GetGameplayHudPanel(root);
                if (!parent) return null;
                overlay = $.CreatePanel("Panel", parent, "QOLBetterUnsecuredOverlay", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                var icon = $.CreatePanel("Panel", overlay, "QOLBetterUnsecuredMirrorIcon");
                if (icon) {
                    icon.hittest = false;
                    icon.hittestchildren = false;
                }
                var mirror = $.CreatePanel("Label", overlay, "QOLBetterUnsecuredMirrorLabel");
                if (mirror) {
                    mirror.hittest = false;
                    mirror.hittestchildren = false;
                    if (mirror.AddClass) mirror.AddClass("death_penalty_gold");
                }
                var text = $.CreatePanel("Label", overlay, "QOLBetterUnsecuredMirrorText");
                if (text) {
                    text.hittest = false;
                    text.hittestchildren = false;
                    text.text = "UNSECURED";
                }
            }
            SetCachedPanel("betterUnsecuredOverlay", overlay);
        }
        var mirrorLabel = IsPanelValid(State.unsecuredSouls.hudMirrorLabel) ? State.unsecuredSouls.hudMirrorLabel : null;
        var mirrorIcon = IsPanelValid(State.unsecuredSouls.hudMirrorIcon) ? State.unsecuredSouls.hudMirrorIcon : null;
        var mirrorText = IsPanelValid(State.unsecuredSouls.hudMirrorText) ? State.unsecuredSouls.hudMirrorText : null;
        if (!mirrorLabel && overlay && overlay.FindChildTraverse) {
            mirrorLabel = overlay.FindChildTraverse("QOLBetterUnsecuredMirrorLabel");
            if (mirrorLabel && mirrorLabel.AddClass && !mirrorLabel.BHasClass("death_penalty_gold")) {
                mirrorLabel.AddClass("death_penalty_gold");
            }
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

    function RemoveBetterUnsecuredOverlay(root) {
        var overlay = GetCachedPanel("betterUnsecuredOverlay");
        if (!overlay && root && root.FindChildTraverse) {
            overlay = root.FindChildTraverse("QOLBetterUnsecuredOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SetCachedPanel("betterUnsecuredOverlay", null);
        State.unsecuredSouls.hudMirrorLabel = null;
        State.unsecuredSouls.hudMirrorIcon = null;
        State.unsecuredSouls.hudMirrorText = null;
    }

        var GetGameplayHudPanel = QOL.getGameplayHudPanel || function() { return null; };
    // GetPanelPositionRelativeToAncestor — now in ql_utils.js, accessed via Utils.*

    // ── Apply position and styles to the better-unsecured HUD overlay (extracted from update)
    function ApplyBetterUnsecuredHudLayout(overlay, mirrorLabel, mirrorIcon, mirrorText, label, panel, root, cfg, scale, xOffset, yOffset, fontPx, showIcon, showText) {
        var sourceText = (typeof label.text === "string") ? label.text : "";
        var sourceTextLabel = FindUnsecuredSoulsHudTextLabel(root, panel);
        var unsecuredText = (sourceTextLabel && typeof sourceTextLabel.text === "string" && sourceTextLabel.text.length > 0)
            ? sourceTextLabel.text
            : "UNSECURED";
        var sourceValue = ParseUnsecuredSoulsValue(sourceText);
        if (!isFinite(sourceValue)) sourceValue = 0;
        if (sourceValue <= 0) {
            var zeroSig = "hidden_zero|" + sourceText;
            if (State.unsecuredSouls.hudStyleSig !== zeroSig) {
                if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
                State.unsecuredSouls.hudStyleSig = zeroSig;
            }
            return;
        }
        var overlayParent = overlay.GetParent ? overlay.GetParent() : null;
        var sourcePos = Utils.GetPanelPositionRelativeToAncestor(label, overlayParent);
        var baseX = null;
        var baseY = null;
        if (sourcePos && isFinite(sourcePos.x) && isFinite(sourcePos.y)) {
            baseX = Math.round(sourcePos.x);
            baseY = Math.round(sourcePos.y);
            State.unsecuredSouls.hudBaseX = baseX;
            State.unsecuredSouls.hudBaseY = baseY;
        } else {
            var cachedBaseX = Utils.ReadSafePanelLayoutOffset(State.unsecuredSouls.hudBaseX);
            var cachedBaseY = Utils.ReadSafePanelLayoutOffset(State.unsecuredSouls.hudBaseY);
            baseX = (cachedBaseX !== null) ? cachedBaseX : 0;
            baseY = (cachedBaseY !== null) ? cachedBaseY : 0;
        }
        var targetX = baseX + xOffset;
        var unsecuredHudBaselineY = Number(QOL_DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET);
        if (!isFinite(unsecuredHudBaselineY)) unsecuredHudBaselineY = 0;
        var reflectedYOffset = (2 * unsecuredHudBaselineY) - yOffset;
        var targetY = baseY + reflectedYOffset;
        if (!isFinite(targetX) || !isFinite(targetY) || Math.abs(targetX) > PANEL_LAYOUT_OFFSET_ABS_MAX || Math.abs(targetY) > PANEL_LAYOUT_OFFSET_ABS_MAX) {
            if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
            State.unsecuredSouls.hudStyleSig = "hidden_invalid_pos";
            return;
        }
        var sig = String(scale) + "|" + String(targetX) + "|" + String(targetY) + "|" + String(fontPx) + "|" + sourceText + "|" + unsecuredText + "|" + (showIcon ? "1" : "0") + "|" + (showText ? "1" : "0");
        if (sig === State.unsecuredSouls.hudStyleSig) return;

        if (overlay.style.visibility !== "visible") overlay.style.visibility = "visible";
        overlay.style.x = targetX + "px";
        overlay.style.y = targetY + "px";

        mirrorIcon.style.visibility = showIcon ? "visible" : "collapse";
        mirrorText.style.visibility = showText ? "visible" : "collapse";
        if (showText && mirrorText.text !== unsecuredText) mirrorText.text = unsecuredText;

        if (mirrorLabel.text !== sourceText) mirrorLabel.text = sourceText;
        if (mirrorLabel.style.visibility !== "visible") mirrorLabel.style.visibility = "visible";
        mirrorLabel.style.fontSize = fontPx + "px";
        mirrorLabel.style.x = "0px";
        mirrorLabel.style.y = "0px";
        State.unsecuredSouls.hudStyleSig = sig;
    }

    function UpdateUnsecuredSoulsHudContainerLayout(root, cfg, nowMs) {
        var enabled = IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED");
        var panel = GetCachedPanel("unsecuredSoulsHudContainer");
        var label = IsPanelValid(State.unsecuredSouls.hudLabel) ? State.unsecuredSouls.hudLabel : null;
        var mirrorLabel = IsPanelValid(State.unsecuredSouls.hudMirrorLabel) ? State.unsecuredSouls.hudMirrorLabel : null;
        var mirrorIcon = IsPanelValid(State.unsecuredSouls.hudMirrorIcon) ? State.unsecuredSouls.hudMirrorIcon : null;
        var mirrorText = IsPanelValid(State.unsecuredSouls.hudMirrorText) ? State.unsecuredSouls.hudMirrorText : null;
        if (!enabled) {
            RemoveBetterUnsecuredOverlay(root);
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
                panel = FindUnsecuredSoulsHudContainer(root);
                SetCachedPanel("unsecuredSoulsHudContainer", panel);
                State.unsecuredSouls.hudNextSearchMs = panel ? 0 : (nowMs + UNSECURED_SOULS_HUD_SEARCH_MS);
            }
        }
        if (!panel) {
            State.unsecuredSouls.hudMirrorLabel = null;
            State.unsecuredSouls.hudMirrorIcon = null;
            State.unsecuredSouls.hudMirrorText = null;
            State.unsecuredSouls.hudStyleSig = "";
            RemoveBetterUnsecuredOverlay(root);
            return;
        }
        if (!label) {
            label = FindUnsecuredSoulsHudLabel(root, panel);
            State.unsecuredSouls.hudLabel = label || null;
        }
        var overlay = EnsureBetterUnsecuredOverlay(root);
        if (!overlay) {
            State.unsecuredSouls.hudStyleSig = "";
            return;
        }
        if (!mirrorLabel) {
            mirrorLabel = IsPanelValid(State.unsecuredSouls.hudMirrorLabel) ? State.unsecuredSouls.hudMirrorLabel : null;
        }
        if (!mirrorIcon) {
            mirrorIcon = IsPanelValid(State.unsecuredSouls.hudMirrorIcon) ? State.unsecuredSouls.hudMirrorIcon : null;
        }
        if (!mirrorText) {
            mirrorText = IsPanelValid(State.unsecuredSouls.hudMirrorText) ? State.unsecuredSouls.hudMirrorText : null;
        }
        if (!label) {
            if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
            State.unsecuredSouls.hudStyleSig = "";
            return;
        }
        if (!mirrorLabel || !mirrorIcon || !mirrorText) {
            State.unsecuredSouls.hudStyleSig = "";
            return;
        }

        var scale = Utils.ClampConfigNumber(cfg.UNSECURED_SOULS_HUD_SCALE, 100, 50, 200, true);
        var xOffset = Utils.ClampConfigNumber(cfg.UNSECURED_SOULS_HUD_X_OFFSET, 0, -1000, 2000, true);
        var yOffset = Utils.ClampConfigNumber(cfg.UNSECURED_SOULS_HUD_Y_OFFSET, 0, 800, 2000, true);
        var fontPx = Math.round(14 * (scale / 100));
        if (fontPx < 8) fontPx = 8;
        if (fontPx > 72) fontPx = 72;

        var legacyShowBoth = IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT");
        var showIcon = legacyShowBoth || (IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_ICON"));
        var showText = legacyShowBoth || (IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_TEXT"));

        ApplyBetterUnsecuredHudLayout(overlay, mirrorLabel, mirrorIcon, mirrorText, label, panel, root, cfg, scale, xOffset, yOffset, fontPx, showIcon, showText);
    }

    function NeedsBetterUnsecuredHudLayoutWork(cfg) {
        if (IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED")) return true;
        return !!(
            State.unsecuredSouls.hudStyleSig ||
            GetCachedPanel("betterUnsecuredOverlay") ||
            GetCachedPanel("unsecuredSoulsHudContainer")
        );
    }

    // ── Registration ──
    QOL.register("betterUnsecuredHud", {
        configKeys: ["ENABLE_BETTER_UNSECURED"],
        bucket: 7, phase: -1,
        perfLabel: "loop.unsecured_souls_hud",
        gate: function(cfg) { return NeedsBetterUnsecuredHudLayoutWork(cfg); },
        update: function(root, cfg, nowMs) {
            try {
                UpdateUnsecuredSoulsHudContainerLayout(root, cfg, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["unsecuredSouls.hudNextSearchMs", "unsecuredSouls.hudLabel",
                    "unsecuredSouls.hudMirrorLabel", "unsecuredSouls.hudMirrorIcon",
                    "unsecuredSouls.hudMirrorText", "unsecuredSouls.hudBaseX",
                    "unsecuredSouls.hudBaseY", "unsecuredSouls.hudStyleSig",
                    "cachedPanels.betterUnsecuredOverlay",
                    "cachedPanels.unsecuredSoulsHudContainer"]
    });

    // Self-test
    try {
        if (typeof UpdateUnsecuredSoulsHudContainerLayout !== "function") throw new Error("UpdateUnsecuredSoulsHudContainerLayout is not a function");
        if (typeof NeedsBetterUnsecuredHudLayoutWork !== "function") throw new Error("NeedsBetterUnsecuredHudLayoutWork is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();
