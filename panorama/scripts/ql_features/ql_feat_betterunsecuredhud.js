// ql_feat_betterunsecuredhud.js — Better unsecured souls HUD container layout
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
    var ReadSafePanelLayoutOffset = U ? U.ReadSafePanelLayoutOffset : function() { return null; };

    var UNSECURED_SOULS_HUD_SEARCH_MS = 1000;
    var PANEL_ID_GOLD_AP_CONTAINER = "gold_and_ap_container";

    // One-shot dependency validation
    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_betterunsecuredhud";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_GetCachedPanel === "undefined") _m.push("QOL_GetCachedPanel");
        if (typeof QOL_SetCachedPanel === "undefined") _m.push("QOL_SetCachedPanel");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing " + _m.length + " bridge(s): " + _m.join(", ") + " — feature will fail");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }

    var PANEL_LAYOUT_OFFSET_ABS_MAX = 100000;
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
        var overlay = GC("betterUnsecuredOverlay");
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
            SC("betterUnsecuredOverlay", overlay);
        }
        var mirrorLabel = IsPanelValid(S.unsecuredSouls.hudMirrorLabel) ? S.unsecuredSouls.hudMirrorLabel : null;
        var mirrorIcon = IsPanelValid(S.unsecuredSouls.hudMirrorIcon) ? S.unsecuredSouls.hudMirrorIcon : null;
        var mirrorText = IsPanelValid(S.unsecuredSouls.hudMirrorText) ? S.unsecuredSouls.hudMirrorText : null;
        if (!mirrorLabel && overlay && overlay.FindChildTraverse) {
            mirrorLabel = overlay.FindChildTraverse("QOLBetterUnsecuredMirrorLabel");
            if (mirrorLabel && mirrorLabel.AddClass && !mirrorLabel.BHasClass("death_penalty_gold")) {
                mirrorLabel.AddClass("death_penalty_gold");
            }
            S.unsecuredSouls.hudMirrorLabel = mirrorLabel || null;
        }
        if (!mirrorIcon && overlay && overlay.FindChildTraverse) {
            mirrorIcon = overlay.FindChildTraverse("QOLBetterUnsecuredMirrorIcon");
            S.unsecuredSouls.hudMirrorIcon = mirrorIcon || null;
        }
        if (!mirrorText && overlay && overlay.FindChildTraverse) {
            mirrorText = overlay.FindChildTraverse("QOLBetterUnsecuredMirrorText");
            S.unsecuredSouls.hudMirrorText = mirrorText || null;
        }
        return overlay;
    }

    function RemoveBetterUnsecuredOverlay(root) {
        var overlay = GC("betterUnsecuredOverlay");
        if (!overlay && root && root.FindChildTraverse) {
            overlay = root.FindChildTraverse("QOLBetterUnsecuredOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SC("betterUnsecuredOverlay", null);
        S.unsecuredSouls.hudMirrorLabel = null;
        S.unsecuredSouls.hudMirrorIcon = null;
        S.unsecuredSouls.hudMirrorText = null;
    }

    var ReadSafePanelLayoutOffset = U ? U.ReadSafePanelLayoutOffset : function(rawValue) {
        var n = Number(rawValue);
        if (!isFinite(n)) return null;
        if (Math.abs(n) > PANEL_LAYOUT_OFFSET_ABS_MAX) return null;
        return n;
    };

    function GetPanelPositionRelativeToAncestor(panel, ancestor) {
        if (!panel || !ancestor) return null;
        var x = 0;
        var y = 0;
        var p = panel;
        var guard = 0;
        while (p && p !== ancestor && guard < 64) {
            var ox = ReadSafePanelLayoutOffset(p.actualxoffset);
            var oy = ReadSafePanelLayoutOffset(p.actualyoffset);
            if (ox === null || oy === null) return null;
            x += ox;
            y += oy;
            p = p.GetParent ? p.GetParent() : null;
            guard++;
        }
        if (p !== ancestor) return null;
        return { x: x, y: y };
    }

    function UpdateUnsecuredSoulsHudContainerLayout(root, cfg, nowMs) {
        var enabled = IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED");
        var panel = GC("unsecuredSoulsHudContainer");
        var label = IsPanelValid(S.unsecuredSouls.hudLabel) ? S.unsecuredSouls.hudLabel : null;
        var mirrorLabel = IsPanelValid(S.unsecuredSouls.hudMirrorLabel) ? S.unsecuredSouls.hudMirrorLabel : null;
        var mirrorIcon = IsPanelValid(S.unsecuredSouls.hudMirrorIcon) ? S.unsecuredSouls.hudMirrorIcon : null;
        var mirrorText = IsPanelValid(S.unsecuredSouls.hudMirrorText) ? S.unsecuredSouls.hudMirrorText : null;
        if (!enabled) {
            RemoveBetterUnsecuredOverlay(root);
            S.unsecuredSouls.hudLabel = null;
            S.unsecuredSouls.hudMirrorLabel = null;
            S.unsecuredSouls.hudMirrorIcon = null;
            S.unsecuredSouls.hudMirrorText = null;
            S.unsecuredSouls.hudBaseX = null;
            S.unsecuredSouls.hudBaseY = null;
            S.unsecuredSouls.hudStyleSig = "";
            return;
        }
        if (!panel) {
            if (nowMs >= (S.unsecuredSouls.hudNextSearchMs || 0)) {
                panel = FindUnsecuredSoulsHudContainer(root);
                SC("unsecuredSoulsHudContainer", panel);
                S.unsecuredSouls.hudNextSearchMs = panel ? 0 : (nowMs + UNSECURED_SOULS_HUD_SEARCH_MS);
            }
        }
        if (!panel) {
            S.unsecuredSouls.hudMirrorLabel = null;
            S.unsecuredSouls.hudMirrorIcon = null;
            S.unsecuredSouls.hudMirrorText = null;
            S.unsecuredSouls.hudStyleSig = "";
            RemoveBetterUnsecuredOverlay(root);
            return;
        }
        if (!label) {
            label = FindUnsecuredSoulsHudLabel(root, panel);
            S.unsecuredSouls.hudLabel = label || null;
        }
        var overlay = EnsureBetterUnsecuredOverlay(root);
        if (!overlay) {
            S.unsecuredSouls.hudStyleSig = "";
            return;
        }
        if (!mirrorLabel) {
            mirrorLabel = IsPanelValid(S.unsecuredSouls.hudMirrorLabel) ? S.unsecuredSouls.hudMirrorLabel : null;
        }
        if (!mirrorIcon) {
            mirrorIcon = IsPanelValid(S.unsecuredSouls.hudMirrorIcon) ? S.unsecuredSouls.hudMirrorIcon : null;
        }
        if (!mirrorText) {
            mirrorText = IsPanelValid(S.unsecuredSouls.hudMirrorText) ? S.unsecuredSouls.hudMirrorText : null;
        }
        if (!label) {
            if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
            S.unsecuredSouls.hudStyleSig = "";
            return;
        }
        if (!mirrorLabel || !mirrorIcon || !mirrorText) {
            S.unsecuredSouls.hudStyleSig = "";
            return;
        }

        var scale = Number(cfg.UNSECURED_SOULS_HUD_SCALE);
        var xOffset = Number(cfg.UNSECURED_SOULS_HUD_X_OFFSET);
        var yOffset = Number(cfg.UNSECURED_SOULS_HUD_Y_OFFSET);
        if (!isFinite(scale)) scale = 100;
        if (!isFinite(xOffset)) xOffset = 0;
        if (!isFinite(yOffset)) yOffset = 0;
        scale = Math.round(scale);
        xOffset = Math.round(xOffset);
        yOffset = Math.round(yOffset);
        if (scale < 50) scale = 50;
        if (scale > 200) scale = 200;
        if (xOffset < -1000) xOffset = -1000;
        if (xOffset > 2000) xOffset = 2000;
        if (yOffset < 800) yOffset = 800;
        if (yOffset > 2000) yOffset = 2000;
        var fontPx = Math.round(14 * (scale / 100));
        if (fontPx < 8) fontPx = 8;
        if (fontPx > 72) fontPx = 72;

        var legacyShowBoth = IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT");
        var showIcon = legacyShowBoth || (IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_ICON"));
        var showText = legacyShowBoth || (IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_TEXT"));

        var sourceText = (typeof label.text === "string") ? label.text : "";
        var sourceTextLabel = FindUnsecuredSoulsHudTextLabel(root, panel);
        var unsecuredText = (sourceTextLabel && typeof sourceTextLabel.text === "string" && sourceTextLabel.text.length > 0)
            ? sourceTextLabel.text
            : "UNSECURED";
        var sourceValue = ParseUnsecuredSoulsValue(sourceText);
        if (!isFinite(sourceValue)) sourceValue = 0;
        if (sourceValue <= 0) {
            var zeroSig = "hidden_zero|" + sourceText;
            if (S.unsecuredSouls.hudStyleSig !== zeroSig) {
                if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
                S.unsecuredSouls.hudStyleSig = zeroSig;
            }
            return;
        }
        var overlayParent = overlay.GetParent ? overlay.GetParent() : null;
        var sourcePos = GetPanelPositionRelativeToAncestor(label, overlayParent);
        var baseX = null;
        var baseY = null;
        if (sourcePos && isFinite(sourcePos.x) && isFinite(sourcePos.y)) {
            baseX = Math.round(sourcePos.x);
            baseY = Math.round(sourcePos.y);
            S.unsecuredSouls.hudBaseX = baseX;
            S.unsecuredSouls.hudBaseY = baseY;
        } else {
            var cachedBaseX = ReadSafePanelLayoutOffset(S.unsecuredSouls.hudBaseX);
            var cachedBaseY = ReadSafePanelLayoutOffset(S.unsecuredSouls.hudBaseY);
            baseX = (cachedBaseX !== null) ? cachedBaseX : 0;
            baseY = (cachedBaseY !== null) ? cachedBaseY : 0;
        }
        var targetX = baseX + xOffset;
        var unsecuredHudBaselineY = Number(DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET);
        if (!isFinite(unsecuredHudBaselineY)) unsecuredHudBaselineY = 0;
        var reflectedYOffset = (2 * unsecuredHudBaselineY) - yOffset;
        var targetY = baseY + reflectedYOffset;
        if (!isFinite(targetX) || !isFinite(targetY) || Math.abs(targetX) > PANEL_LAYOUT_OFFSET_ABS_MAX || Math.abs(targetY) > PANEL_LAYOUT_OFFSET_ABS_MAX) {
            if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
            S.unsecuredSouls.hudStyleSig = "hidden_invalid_pos";
            return;
        }
        var sig = String(scale) + "|" + String(targetX) + "|" + String(targetY) + "|" + String(fontPx) + "|" + sourceText + "|" + unsecuredText + "|" + (showIcon ? "1" : "0") + "|" + (showText ? "1" : "0");
        if (sig === S.unsecuredSouls.hudStyleSig) return;

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
        S.unsecuredSouls.hudStyleSig = sig;
    }


    function NeedsBetterUnsecuredHudLayoutWork(cfg) {
        if (IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED")) return true;
        return !!(
            S.unsecuredSouls.hudStyleSig ||
            GC("betterUnsecuredOverlay") ||
            GC("unsecuredSoulsHudContainer")
        );
    }

    // ── Registration ──
    QOL_REGISTER_FEATURE("betterUnsecuredHud", {
        configKeys: ["ENABLE_BETTER_UNSECURED"],
        bucket: 7, phase: -1,
        gate: function(cfg) { return NeedsBetterUnsecuredHudLayoutWork(cfg); },
        update: function(root, cfg, nowMs) {
            try {
                UpdateUnsecuredSoulsHudContainerLayout(root, cfg, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
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
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();
