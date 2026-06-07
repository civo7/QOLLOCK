// ql_feat_souls.js — Souls HUD runtime (position, opacity, visibility)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    var S = window.QOL_STATE;
    var RC = window.QOL_ResolveCachedPanel;
    var U = window.QOL_UTILS;

    var PID = "gold_and_ap_container";

    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(S.soulsRuntimeStyleSig && String(S.soulsRuntimeStyleSig).length > 0) ||
            window.QOL_GetCachedPanel("soulsContainer");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_SOULS_ENABLED) !== 1 ||
            U.NormalizeOpacityNumber(cfg.SOULS_OPACITY, 1.0) !== 1.0 ||
            U.NormalizeHudOffsetNumber(cfg.SOULS_X_OFFSET, 0) !== 0 ||
            U.NormalizeHudOffsetNumber(cfg.SOULS_Y_OFFSET, 0) !== 0
        );
    }

    // ── Update ──
    function update(root, cfg) {
        var active = hasNonDefaultConfig(cfg);
        var enabled = U.IsCfgEnabled(cfg, "HUD_SOULS_ENABLED");
        var soulsPanel = RC(root, "soulsContainer", PID);
        if (!soulsPanel) return;

        var offsetX = active ? U.NormalizeHudOffsetNumber(cfg.SOULS_X_OFFSET, 0) : 0;
        var offsetY = active ? U.NormalizeHudOffsetNumber(cfg.SOULS_Y_OFFSET, 0) : 0;
        var opacityText = active ? U.NormalizeOpacityNumber(cfg.SOULS_OPACITY, 1.0).toFixed(2) : "1.00";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + (enabled ? "1" : "0");
        if (S.soulsRuntimeStyleSig === styleSig) return;

        soulsPanel.style.x = String(offsetX) + "px";
        soulsPanel.style.y = String(-offsetY) + "px";
        soulsPanel.style.visibility = enabled ? "visible" : "collapse";
        U.SetPanelOpacitySafe(soulsPanel, opacityText, 1.0);
        S.soulsRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    window.QOL_REGISTER_FEATURE("soulsRuntime", {
        configKeys: ["HUD_SOULS_ENABLED", "SOULS_OPACITY", "SOULS_X_OFFSET", "SOULS_Y_OFFSET"],
        bucket: 3, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["soulsRuntimeStyleSig", "cachedPanels.soulsContainer"]
    });
})();
