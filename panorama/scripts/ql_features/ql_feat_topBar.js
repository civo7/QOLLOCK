// ql_feat_topBar.js — Top bar HUD runtime (position, scale, opacity, visibility)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    var S = window.QOL_STATE;
    var RC = window.QOL_ResolveCachedPanel;
    var GC = window.QOL_GetCachedPanel;
    var SC = window.QOL_SetCachedPanel;
    var U = window.QOL_UTILS;
    var IH = window.QOL_IsHudVisibleForTopBarRuntime;

    var PID_TOP_BAR = "TopBar";
    var PID_HUD = "CitadelHud";
    var PID_GAMEPLAY_HUD = "gameplay_hud";

    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(S.topBarRuntimeStyleSig && String(S.topBarRuntimeStyleSig).length > 0) ||
            GC("topBarPanel");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_TOP_BAR_ENABLED) !== 1 ||
            U.NormalizeOpacityNumber(cfg.TOP_BAR_OPACITY, 1.0) !== 1.0 ||
            U.NormalizeHudScaleNumber(cfg.TOP_BAR_SCALE, 1.0) !== 1.0 ||
            U.NormalizeHudOffsetNumber(cfg.TOP_BAR_X_OFFSET, 0) !== 0 ||
            U.NormalizeHudOffsetNumber(cfg.TOP_BAR_Y_OFFSET, 0) !== 0
        );
    }

    // ── Update ──
    function update(root, cfg) {
        var active = hasNonDefaultConfig(cfg);
        var enabled = U.IsCfgEnabled(cfg, "HUD_TOP_BAR_ENABLED");
        var topBar = RC(root, "topBarPanel", PID_TOP_BAR);
        if (!topBar) return;

        var hudVisible = IH(root, topBar);
        var offsetX = active ? U.NormalizeHudOffsetNumber(cfg.TOP_BAR_X_OFFSET, 0) : 0;
        var offsetY = active ? U.NormalizeHudOffsetNumber(cfg.TOP_BAR_Y_OFFSET, 0) : 0;
        var opacityText = active ? U.NormalizeOpacityNumber(cfg.TOP_BAR_OPACITY, 1.0).toFixed(2) : "1.00";
        var scaleText = active ? U.NormalizeHudScaleNumber(cfg.TOP_BAR_SCALE, 1.0).toFixed(2) : "1.00";
        var shouldShow = enabled && hudVisible;
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + scaleText + "|" + (enabled ? "1" : "0") + "|" + (hudVisible ? "1" : "0");
        if (S.topBarRuntimeStyleSig === styleSig) return;

        topBar.style.x = String(offsetX) + "px";
        topBar.style.y = String(-offsetY) + "px";
        topBar.style.preTransformScale2d = scaleText + ", " + scaleText;
        topBar.style.visibility = shouldShow ? "visible" : "collapse";
        U.SetPanelOpacitySafe(topBar, opacityText, 1.0);
        S.topBarRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    window.QOL_REGISTER_FEATURE("topBarRuntime", {
        configKeys: ["HUD_TOP_BAR_ENABLED", "TOP_BAR_OPACITY", "TOP_BAR_SCALE",
                     "TOP_BAR_X_OFFSET", "TOP_BAR_Y_OFFSET"],
        bucket: 4, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["topBarRuntimeStyleSig", "cachedPanels.topBarPanel"]
    });
})();
