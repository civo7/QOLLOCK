// ql_feat_bottomBar.js — Bottom bar HUD runtime (position, opacity, scale, wash, currency color)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    var _featureId = "ql_feat_bottombar";
    // DEPENDS: getCachedPanel, getGameplayHudPanel, getUIRoot, panelIdGoldApContainer, panelIdSignature, readBottomBarWashColorIndex, resolveCachedPanel, resolveWashColorFromPalette, state, setWashColorSafe, utils
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
    // #hud_signature carries its own ui-scale in CSS — base/hud.css:1824 is 90%, and
    // .gShopOpen drops it to 75% (base/hud.css:1832). An inline ui-scale REPLACES
    // that rather than multiplying with it, and Panorama does not report a computed
    // value back, so the base is stated here and the slider applied on top of it.
    // Writing a flat "100%" is what made the bar render 11% larger than the game
    // intends the moment any bottom-bar key went non-default.
    //
    // Nothing is written while the config sits at its defaults, so an untouched HUD
    // keeps every CSS rule including the shop-open shrink. Once the slider is moved
    // the inline value wins for good and .gShopOpen's 75% stops applying: that is the
    // accepted cost of a continuous slider on a panel whose base is class-dependent.
    var SIGNATURE_UI_SCALE_BASE_PCT = 90;

    function update(root, cfg) {

        var active = hasNonDefaultConfig(cfg);
        var enabled = Utils.IsCfgEnabled(cfg, "HUD_BOTTOM_BAR_ENABLED");
        var hudSignature = RC(root, "bottomBarPanel", PID_SIGNATURE);

        var washColor = active ? RWP(ReadBottomBarWashColor(cfg)) : "";
        // Guarded on the recorded colour. This walks five containers — two of them
        // GetUIRoot() and the context panel — with FindChildrenWithClassTraverse for
        // two classes plus a FindChildTraverse each, and a traverse miss walks the
        // whole subtree. It ran on every tick of an always-run feature while the sig
        // it writes was never read back.
        if (State.bottomBarCurrencyColorStyleSig !== washColor ||
            State.bottomBarCurrencyColorPanel !== hudSignature) {
            applyCurrencyColor(root, washColor);
            State.bottomBarCurrencyColorPanel = hudSignature;
        }
        if (!hudSignature) return;

        var offsetX = active ? Utils.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_X_OFFSET, 0) : 0;
        var offsetY = active ? Utils.NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_Y_OFFSET, 0) : 0;
        var opacity = active ? Utils.NormalizeOpacityNumber(cfg.BOTTOM_BAR_OPACITY, 1.0) : 1.0;
        var scale = active ? Utils.NormalizeHudScaleNumber(cfg.BOTTOM_BAR_SCALE, 1.0) : 1.0;
        var opacityText = opacity.toFixed(2);
        var scaleText = Math.round(SIGNATURE_UI_SCALE_BASE_PCT * scale) + "%";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + scaleText + "|" + washColor + "|" + (enabled ? "1" : "0");
        if (State.bottomBarRuntimeStyleSig === styleSig) return;

        // Clear rather than write an identity value, so a config at its defaults
        // hands the panel back to CSS instead of pinning it.
        if (offsetX !== 0) hudSignature.style.x = String(offsetX) + "px";
        else Utils.ClearStyleSafe(hudSignature, "x");
        if (offsetY !== 0) hudSignature.style.y = String(-offsetY) + "px";
        else Utils.ClearStyleSafe(hudSignature, "y");
        Utils.ClearStyleSafe(hudSignature, "preTransformScale2d");
        if (Math.abs(scale - 1.0) > 0.0001) hudSignature.style.uiScale = scaleText;
        else Utils.ClearStyleSafe(hudSignature, "uiScale");
        if (hudSignature.SetHasClass) hudSignature.SetHasClass("qol-hidden", !enabled); else hudSignature.style.visibility = enabled ? "visible" : "collapse";
        SetWashColor(hudSignature, washColor);
        if (Math.abs(opacity - 1.0) > 0.0001) Utils.SetPanelOpacitySafe(hudSignature, opacityText, 1.0);
        else Utils.ClearStyleSafe(hudSignature, "opacity");
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
                    "bottomBarCurrencyColorPanel", "cachedPanels.bottomBarPanel"]
    });

    // ── Self-test ──
    try {

                    // P1: skip when new manifest is active to prevent dual execution
                    var _mfActive = false;
                    try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _mfActive = QOL.core.FeatureRegistry.isEnabled("ql_bottom_bar"); } } catch(e) {}
                    if (_mfActive) return;        if (typeof update !== "function") throw new Error("update is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
