// ql_feat_topBar.js — Top bar HUD runtime (position, scale, opacity, visibility)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: topBarRuntime\n");
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var RC = typeof QOL_ResolveCachedPanel !== "undefined" ? QOL_ResolveCachedPanel : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IH = typeof QOL_IsHudVisibleForTopBarRuntime !== "undefined" ? QOL_IsHudVisibleForTopBarRuntime : undefined;

    var PID_TOP_BAR = "TopBar";
    var PID_HUD = "CitadelHud";
    var PID_GAMEPLAY_HUD = "gameplay_hud";

    // One-shot dependency validation
    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_topbar";
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
        if (!S._debug_topBarRuntime) { $.Msg("[QOL DEBUG] First update: topBarRuntime\n"); S._debug_topBarRuntime = true; }
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
    (typeof QOL_REGISTER_FEATURE !== "undefined" ? QOL_REGISTER_FEATURE : null)("topBarRuntime", {
        configKeys: ["HUD_TOP_BAR_ENABLED", "TOP_BAR_OPACITY", "TOP_BAR_SCALE",
                     "TOP_BAR_X_OFFSET", "TOP_BAR_Y_OFFSET"],
        bucket: 4, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["topBarRuntimeStyleSig", "cachedPanels.topBarPanel"]
    });
})();
