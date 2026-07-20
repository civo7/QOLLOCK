// ql_feat_topBar.js — Top bar HUD runtime (position, scale, opacity, visibility)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    var _featureId = "ql_feat_topbar";
    // DEPENDS: getCachedPanel, isHudVisibleForTopBarRuntime, resolveCachedPanel, state, setCachedPanel, utils, panelIdTopBar
    var _deps = QOL.import(["getCachedPanel", "isHudVisibleForTopBarRuntime", "resolveCachedPanel", "state", "setCachedPanel", "utils", "panelIdTopBar"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var ResolveCachedPanel = _deps.resolveCachedPanel;
    var IsHudVisibleForTopBarRuntime = _deps.isHudVisibleForTopBarRuntime;
    var IH = _deps.isHudVisibleForTopBarRuntime;
    var PID_TOP_BAR = _deps.panelIdTopBar;
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(State.topBarRuntimeStyleSig && String(State.topBarRuntimeStyleSig).length > 0) ||
            GetCachedPanel("topBarPanel");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_TOP_BAR_ENABLED) !== 1 ||
            Utils.NormalizeOpacityNumber(cfg.TOP_BAR_OPACITY, 1.0) !== 1.0 ||
            Utils.NormalizeHudScaleNumber(cfg.TOP_BAR_SCALE, 1.0) !== 1.0 ||
            Utils.NormalizeHudOffsetNumber(cfg.TOP_BAR_X_OFFSET, 0) !== 0 ||
            Utils.NormalizeHudOffsetNumber(cfg.TOP_BAR_Y_OFFSET, 0) !== 0
        );
    }

    // ── Update ──
    function update(root, cfg) {
        if (!State._debug_topBarRuntime) { $.Msg("[QOL DEBUG] First update: topBarRuntime\n"); State._debug_topBarRuntime = true; }
        var active = hasNonDefaultConfig(cfg);
        var enabled = Utils.IsCfgEnabled(cfg, "HUD_TOP_BAR_ENABLED");
        var topBar = ResolveCachedPanel(root, "topBarPanel", PID_TOP_BAR);
        if (!topBar) return;

        var hudVisible = IH(root, topBar);
        var offsetX = active ? Utils.NormalizeHudOffsetNumber(cfg.TOP_BAR_X_OFFSET, 0) : 0;
        var offsetY = active ? Utils.NormalizeHudOffsetNumber(cfg.TOP_BAR_Y_OFFSET, 0) : 0;
        var opacityText = active ? Utils.NormalizeOpacityNumber(cfg.TOP_BAR_OPACITY, 1.0).toFixed(2) : "1.00";
        var scaleText = active ? Utils.NormalizeHudScaleNumber(cfg.TOP_BAR_SCALE, 1.0).toFixed(2) : "1.00";
        var shouldShow = enabled && hudVisible;
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + scaleText + "|" + (enabled ? "1" : "0") + "|" + (hudVisible ? "1" : "0");
        if (State.topBarRuntimeStyleSig === styleSig) return;

        topBar.style.x = String(offsetX) + "px";
        topBar.style.y = String(-offsetY) + "px";
        topBar.style.preTransformScale2d = scaleText + ", " + scaleText;
        topBar.style.visibility = shouldShow ? "visible" : "collapse";
        Utils.SetPanelOpacitySafe(topBar, opacityText, 1.0);
        State.topBarRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    QOL.register("topBarRuntime", {
        configKeys: ["HUD_TOP_BAR_ENABLED", "TOP_BAR_OPACITY", "TOP_BAR_SCALE",
                     "TOP_BAR_X_OFFSET", "TOP_BAR_Y_OFFSET"],
        bucket: 4, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["topBarRuntimeStyleSig", "cachedPanels.topBarPanel"]
    });

    // ── Self-test ──
    try {
        if (typeof update !== "function") throw new Error("update is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
