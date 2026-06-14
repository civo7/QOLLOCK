// ql_feat_bottomBar.js — Bottom bar HUD runtime (position, opacity, scale, wash, currency color)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: bottomBarRuntime\n");
        var _featureId = "ql_feat_bottombar";
    var _deps = QOL.import(["getCachedPanel","getGameplayHudPanel","getUIRoot","panelIdGoldApContainer","panelIdSignature","readBottomBarWashColorIndex","resolveCachedPanel","resolveWashColorFromPalette","state","setWashColorSafe","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var GetGameplayHudPanel = _deps.getGameplayHudPanel;
    var GetUIRoot = _deps.getUIRoot;
    var ReadBottomBarWashColor = _deps.readBottomBarWashColorIndex;
    var RC = _deps.resolveCachedPanel;
    var RWP = _deps.resolveWashColorFromPalette;
    var State = _deps.state;
    var SetWashColor = _deps.setWashColorSafe;
    var Utils = _deps.utils;
    var PID_GOLD_AP = _deps.panelIdGoldApContainer;
    var PID_SIGNATURE = _deps.panelIdSignature;
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(State.bottomBarRuntimeStyleSig && String(State.bottomBarRuntimeStyleSig).length > 0) ||
            GetCachedPanel("bottomBarPanel");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_BOTTOM_BAR_ENABLED) !== 1 ||
            Utils.NormalizeOpacityNumber(cfg.BOTTOM_BAR_OPACITY, 1.0) !== 1.0 ||
            Utils.NormalizeHudScaleNumber(cfg.BOTTOM_BAR_SCALE, 1.0) !== 1.0 ||
            Utils.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_X_OFFSET, 0) !== 0 ||
            Utils.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_Y_OFFSET, 0) !== 0 ||
            ReadBottomBarWashColor(cfg) !== 0
        );
    }

    // ── Currency color helper (inlined from ql_core.js) ──
    function applyCurrencyColor(root, washColor) {
        var color = washColor || "";
        var searchRoot = GetGameplayHudPanel(root) || root;
        var apContainer = searchRoot && searchRoot.FindChildTraverse ? searchRoot.FindChildTraverse("APContainer") : null;
        var goldApContainer = searchRoot && searchRoot.FindChildTraverse ? searchRoot.FindChildTraverse(PID_GOLD_AP) : null;
        var contextPanel = null;
        try { contextPanel = $.GetContextPanel ? $.GetContextPanel() : null; } catch (eContext) { contextPanel = null; }
        var uiRoot = GetUIRoot();
        var containers = [];
        if (Utils.IsPanelValid(contextPanel)) containers.push(contextPanel);
        if (Utils.IsPanelValid(uiRoot)) containers.push(uiRoot);
        if (Utils.IsPanelValid(searchRoot)) containers.push(searchRoot);
        if (Utils.IsPanelValid(apContainer)) containers.push(apContainer);
        if (Utils.IsPanelValid(goldApContainer)) containers.push(goldApContainer);

        var icons = [];
        var amounts = [];
        var infiniteIcons = [];
        for (var c = 0; c < containers.length; c++) {
            var container = containers[c];
            if (!Utils.IsPanelValid(container)) continue;
            if (container.FindChildrenWithClassTraverse) {
                icons = icons.concat(container.FindChildrenWithClassTraverse("APCurrencyIcon") || []);
                amounts = amounts.concat(container.FindChildrenWithClassTraverse("APCurrencyAmount") || []);
            }
            if (container.FindChildTraverse) {
                var infiniteIcon = container.FindChildTraverse("hudAPInfinite");
                if (Utils.IsPanelValid(infiniteIcon)) infiniteIcons.push(infiniteIcon);
            }
        }

        for (var i = 0; i < icons.length; i++) {
            if (Utils.IsPanelValid(icons[i])) SetWashColor(icons[i], color);
        }

        for (var k = 0; k < infiniteIcons.length; k++) {
            if (Utils.IsPanelValid(infiniteIcons[k])) SetWashColor(infiniteIcons[k], color);
        }

        for (var j = 0; j < amounts.length; j++) {
            if (Utils.IsPanelValid(amounts[j])) Utils.SetStyleSafe(amounts[j], "color", color);
        }

        State.bottomBarCurrencyColorStyleSig = color;
    }

    // ── Update ──
    function update(root, cfg) {
        if (!State._debug_bottomBarRuntime) { $.Msg("[QOL DEBUG] First update: bottomBarRuntime\n"); State._debug_bottomBarRuntime = true; }
        var active = hasNonDefaultConfig(cfg);
        var enabled = Utils.IsCfgEnabled(cfg, "HUD_BOTTOM_BAR_ENABLED");
        var hudSignature = RC(root, "bottomBarPanel", PID_SIGNATURE);

        var washColor = active ? RWP(ReadBottomBarWashColor(cfg)) : "";
        applyCurrencyColor(root, washColor);
        if (!hudSignature) return;

        var offsetX = active ? Utils.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_X_OFFSET, 0) : 0;
        var offsetY = active ? Utils.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_Y_OFFSET, 0) : 0;
        var opacityText = active ? Utils.NormalizeOpacityNumber(cfg.BOTTOM_BAR_OPACITY, 1.0).toFixed(2) : "1.00";
        var scaleText = active ? Utils.NormalizeHudScaleNumber(cfg.BOTTOM_BAR_SCALE, 1.0).toFixed(2) : "1.00";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + scaleText + "|" + washColor + "|" + (enabled ? "1" : "0");
        if (State.bottomBarRuntimeStyleSig === styleSig) return;

        hudSignature.style.x = String(offsetX) + "px";
        hudSignature.style.y = String(-offsetY) + "px";
        hudSignature.style.preTransformScale2d = scaleText + ", " + scaleText;
        hudSignature.style.visibility = enabled ? "visible" : "collapse";
        SetWashColor(hudSignature, washColor);
        Utils.SetPanelOpacitySafe(hudSignature, opacityText, 1.0);
        State.bottomBarRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    QOL.register("bottomBarRuntime", {
        configKeys: ["HUD_BOTTOM_BAR_ENABLED", "BOTTOM_BAR_OPACITY", "BOTTOM_BAR_SCALE",
                     "BOTTOM_BAR_X_OFFSET", "BOTTOM_BAR_Y_OFFSET"],
        bucket: 3, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["bottomBarRuntimeStyleSig", "bottomBarCurrencyColorStyleSig",
                    "cachedPanels.bottomBarPanel"]
    });

    // ── Self-test ──
    try {
        if (typeof update !== "function") throw new Error("update is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
