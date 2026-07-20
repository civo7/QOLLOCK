// ql_feat_damageImpact.js — Damage impact HUD runtime (position, scale, opacity)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    var _featureId = "ql_feat_damageimpact";
    // DEPENDS: getCachedPanel, normalizeDamageImpactScaleNumber, resolveCachedPanel, state, utils
    var _deps = QOL.import(["getCachedPanel","normalizeDamageImpactScaleNumber","resolveCachedPanel","state","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var RC = _deps.resolveCachedPanel;
    var State = _deps.state;
    var Utils = _deps.utils;
    var NDS = _deps.normalizeDamageImpactScaleNumber;
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(State.damageImpactRuntimeStyleSig && String(State.damageImpactRuntimeStyleSig).length > 0) ||
            GetCachedPanel("damageImpactPanel");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.ENABLE_DAMAGE_IMPACT) !== 1 ||
            NDS(cfg.DAMAGE_IMPACT_SCALE, 1.0) !== 1.0 ||
            Utils.NormalizeOpacityNumber(cfg.DAMAGE_IMPACT_OPACITY, 1.0) !== 1.0 ||
            Utils.NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_X_OFFSET, 0) !== 0 ||
            Utils.NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_Y_OFFSET, 0) !== 0
        );
    }

    // ── Update ──
    function update(root, cfg) {
        if (!State._debug_damageImpactRuntime) { $.Msg("[QOL DEBUG] First update: damageImpactRuntime\n"); State._debug_damageImpactRuntime = true; }
        var active = hasNonDefaultConfig(cfg);
        var enabled = Utils.IsCfgEnabled(cfg, "ENABLE_DAMAGE_IMPACT");
        var panel = RC(root, "damageImpactPanel", "damage_impact");
        if (!panel) return;

        var offsetX = active ? Utils.NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_X_OFFSET, 0) : 0;
        var offsetY = active ? Utils.NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_Y_OFFSET, 0) : 0;
        var opacityText = active ? Utils.NormalizeOpacityNumber(cfg.DAMAGE_IMPACT_OPACITY, 1.0).toFixed(2) : "1.00";
        var scaleText = active ? NDS(cfg.DAMAGE_IMPACT_SCALE, 1.0).toFixed(2) : "1.00";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + scaleText + "|" + (enabled ? "1" : "0");
        if (State.damageImpactRuntimeStyleSig === styleSig) return;

        panel.style.x = String(offsetX) + "px";
        panel.style.y = String(-offsetY) + "px";
        panel.style.opacity = opacityText;
        panel.style.preTransformScale2d = scaleText + ", " + scaleText;
        panel.style.visibility = enabled ? "visible" : "collapse";
        State.damageImpactRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    QOL.register("damageImpactRuntime", {
        configKeys: ["ENABLE_DAMAGE_IMPACT", "DAMAGE_IMPACT_SCALE", "DAMAGE_IMPACT_OPACITY",
                     "DAMAGE_IMPACT_X_OFFSET", "DAMAGE_IMPACT_Y_OFFSET"],
        bucket: 7, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["damageImpactRuntimeStyleSig", "cachedPanels.damageImpactPanel"]
    });

    // ── Self-test ──
    try {
        if (typeof update !== "function") throw new Error("update is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
