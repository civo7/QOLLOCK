// ql_feat_souls.js — Souls HUD runtime (position, opacity, visibility)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    var _featureId = "ql_feat_souls";
    // DEPENDS: getCachedPanel, resolveCachedPanel, state, utils, panelIdGoldApContainer
    var _deps = QOL.import(["getCachedPanel","resolveCachedPanel","state","utils","panelIdGoldApContainer"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var RC = _deps.resolveCachedPanel;
    var State = _deps.state;
    var Utils = _deps.utils;
    var PID = _deps.panelIdGoldApContainer;
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(State.soulsRuntimeStyleSig && String(State.soulsRuntimeStyleSig).length > 0) ||
            GetCachedPanel("soulsContainer");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_SOULS_ENABLED) !== 1 ||
            Utils.NormalizeOpacityNumber(cfg.SOULS_OPACITY, 1.0) !== 1.0 ||
            Utils.NormalizeHudOffsetNumber(cfg.SOULS_X_OFFSET, 0) !== 0 ||
            Utils.NormalizeHudOffsetNumber(cfg.SOULS_Y_OFFSET, 0) !== 0
        );
    }

    // ── Update ──
    function update(root, cfg) {
        if (!State._debug_soulsRuntime) { $.Msg("[QOL DEBUG] First update: soulsRuntime\n"); State._debug_soulsRuntime = true; }
        var active = hasNonDefaultConfig(cfg);
        var enabled = Utils.IsCfgEnabled(cfg, "HUD_SOULS_ENABLED");
        var soulsPanel = RC(root, "soulsContainer", PID);
        if (!soulsPanel) return;

        var offsetX = active ? Utils.NormalizeHudOffsetNumber(cfg.SOULS_X_OFFSET, 0) : 0;
        var offsetY = active ? Utils.NormalizeHudOffsetNumber(cfg.SOULS_Y_OFFSET, 0) : 0;
        var opacityText = active ? Utils.NormalizeOpacityNumber(cfg.SOULS_OPACITY, 1.0).toFixed(2) : "1.00";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + (enabled ? "1" : "0");
        if (State.soulsRuntimeStyleSig === styleSig) return;

        soulsPanel.style.x = String(offsetX) + "px";
        soulsPanel.style.y = String(-offsetY) + "px";
        if (soulsPanel.SetHasClass) soulsPanel.SetHasClass("qol-hidden", !enabled); else soulsPanel.style.visibility = enabled ? "visible" : "collapse";
        Utils.SetPanelOpacitySafe(soulsPanel, opacityText, 1.0);
        State.soulsRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    QOL.register("soulsRuntime", {
        configKeys: ["HUD_SOULS_ENABLED", "SOULS_OPACITY", "SOULS_X_OFFSET", "SOULS_Y_OFFSET"],
        bucket: 3, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["soulsRuntimeStyleSig", "cachedPanels.soulsContainer"]
    });

    // ── Self-test ──
    try {
        if (typeof update !== "function") throw new Error("update is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
