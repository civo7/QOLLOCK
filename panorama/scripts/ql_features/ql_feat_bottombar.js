// ql_feat_bottomBar.js — Bottom bar HUD runtime (position, opacity, scale, wash, currency color)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: bottomBarRuntime\n");
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var RC = typeof QOL_ResolveCachedPanel !== "undefined" ? QOL_ResolveCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var SWC = typeof QOL_SetWashColorSafe !== "undefined" ? QOL_SetWashColorSafe : undefined;
    var RWP = typeof QOL_ResolveWashColorFromPalette !== "undefined" ? QOL_ResolveWashColorFromPalette : undefined;
    var RBW = typeof QOL_ReadBottomBarWashColorIndex !== "undefined" ? QOL_ReadBottomBarWashColorIndex : undefined;
    var GUIR = typeof QOL_GetUIRoot !== "undefined" ? QOL_GetUIRoot : undefined;
    var GGHP = typeof QOL_GetGameplayHudPanel !== "undefined" ? QOL_GetGameplayHudPanel : undefined;
    var IPV = (typeof QOL_UTILS !== "undefined" ? QOL_UTILS.IsPanelValid : null);

    var PID_SIGNATURE = "hud_signature";
    var PID_GOLD_AP = "gold_and_ap_container";

    // One-shot dependency validation
    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_bottombar";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_GetCachedPanel === "undefined") _m.push("QOL_GetCachedPanel");
        if (typeof QOL_SetCachedPanel === "undefined") _m.push("QOL_SetCachedPanel");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing bridge globals: " + _m.join(", ") + " - feature may not work");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(S.bottomBarRuntimeStyleSig && String(S.bottomBarRuntimeStyleSig).length > 0) ||
            GC("bottomBarPanel");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_BOTTOM_BAR_ENABLED) !== 1 ||
            U.NormalizeOpacityNumber(cfg.BOTTOM_BAR_OPACITY, 1.0) !== 1.0 ||
            U.NormalizeHudScaleNumber(cfg.BOTTOM_BAR_SCALE, 1.0) !== 1.0 ||
            U.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_X_OFFSET, 0) !== 0 ||
            U.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_Y_OFFSET, 0) !== 0 ||
            RBW(cfg) !== 0
        );
    }

    // ── Currency color helper (inlined from ql_core.js) ──
    function applyCurrencyColor(root, washColor) {
        var color = washColor || "";
        var searchRoot = GGHP(root) || root;
        var apContainer = searchRoot && searchRoot.FindChildTraverse ? searchRoot.FindChildTraverse("APContainer") : null;
        var goldApContainer = searchRoot && searchRoot.FindChildTraverse ? searchRoot.FindChildTraverse(PID_GOLD_AP) : null;
        var contextPanel = null;
        try { contextPanel = $.GetContextPanel ? $.GetContextPanel() : null; } catch (eContext) { contextPanel = null; }
        var uiRoot = GUIR();
        var containers = [];
        if (IPV(contextPanel)) containers.push(contextPanel);
        if (IPV(uiRoot)) containers.push(uiRoot);
        if (IPV(searchRoot)) containers.push(searchRoot);
        if (IPV(apContainer)) containers.push(apContainer);
        if (IPV(goldApContainer)) containers.push(goldApContainer);

        var icons = [];
        var amounts = [];
        var infiniteIcons = [];
        for (var c = 0; c < containers.length; c++) {
            var container = containers[c];
            if (!IPV(container)) continue;
            if (container.FindChildrenWithClassTraverse) {
                icons = icons.concat(container.FindChildrenWithClassTraverse("APCurrencyIcon") || []);
                amounts = amounts.concat(container.FindChildrenWithClassTraverse("APCurrencyAmount") || []);
            }
            if (container.FindChildTraverse) {
                var infiniteIcon = container.FindChildTraverse("hudAPInfinite");
                if (IPV(infiniteIcon)) infiniteIcons.push(infiniteIcon);
            }
        }

        for (var i = 0; i < icons.length; i++) {
            if (IPV(icons[i])) SWC(icons[i], color);
        }

        for (var k = 0; k < infiniteIcons.length; k++) {
            if (IPV(infiniteIcons[k])) SWC(infiniteIcons[k], color);
        }

        for (var j = 0; j < amounts.length; j++) {
            if (IPV(amounts[j])) U.SetStyleSafe(amounts[j], "color", color);
        }

        S.bottomBarCurrencyColorStyleSig = color;
    }

    // ── Update ──
    function update(root, cfg) {
        if (!S._debug_bottomBarRuntime) { $.Msg("[QOL DEBUG] First update: bottomBarRuntime\n"); S._debug_bottomBarRuntime = true; }
        var active = hasNonDefaultConfig(cfg);
        var enabled = U.IsCfgEnabled(cfg, "HUD_BOTTOM_BAR_ENABLED");
        var hudSignature = RC(root, "bottomBarPanel", PID_SIGNATURE);

        var washColor = active ? RWP(RBW(cfg)) : "";
        applyCurrencyColor(root, washColor);
        if (!hudSignature) return;

        var offsetX = active ? U.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_X_OFFSET, 0) : 0;
        var offsetY = active ? U.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_Y_OFFSET, 0) : 0;
        var opacityText = active ? U.NormalizeOpacityNumber(cfg.BOTTOM_BAR_OPACITY, 1.0).toFixed(2) : "1.00";
        var scaleText = active ? U.NormalizeHudScaleNumber(cfg.BOTTOM_BAR_SCALE, 1.0).toFixed(2) : "1.00";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + scaleText + "|" + washColor + "|" + (enabled ? "1" : "0");
        if (S.bottomBarRuntimeStyleSig === styleSig) return;

        hudSignature.style.x = String(offsetX) + "px";
        hudSignature.style.y = String(-offsetY) + "px";
        hudSignature.style.preTransformScale2d = scaleText + ", " + scaleText;
        hudSignature.style.visibility = enabled ? "visible" : "collapse";
        SWC(hudSignature, washColor);
        U.SetPanelOpacitySafe(hudSignature, opacityText, 1.0);
        S.bottomBarRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    (typeof QOL_REGISTER_FEATURE !== "undefined" ? QOL_REGISTER_FEATURE : null)("bottomBarRuntime", {
        configKeys: ["HUD_BOTTOM_BAR_ENABLED", "BOTTOM_BAR_OPACITY", "BOTTOM_BAR_SCALE",
                     "BOTTOM_BAR_X_OFFSET", "BOTTOM_BAR_Y_OFFSET"],
        bucket: 3, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["bottomBarRuntimeStyleSig", "bottomBarCurrencyColorStyleSig",
                    "cachedPanels.bottomBarPanel"]
    });
})();
