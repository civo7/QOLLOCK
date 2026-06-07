// ql_feat_damageImpact.js — Damage impact HUD runtime (position, scale, opacity)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: damageImpactRuntime\n");
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var RC = typeof QOL_ResolveCachedPanel !== "undefined" ? QOL_ResolveCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var NDS = typeof QOL_NormalizeDamageImpactScaleNumber !== "undefined" ? QOL_NormalizeDamageImpactScaleNumber : undefined;

    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(S.damageImpactRuntimeStyleSig && String(S.damageImpactRuntimeStyleSig).length > 0) ||
            (typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : null)("damageImpactPanel");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.ENABLE_DAMAGE_IMPACT) !== 1 ||
            NDS(cfg.DAMAGE_IMPACT_SCALE, 1.0) !== 1.0 ||
            U.NormalizeOpacityNumber(cfg.DAMAGE_IMPACT_OPACITY, 1.0) !== 1.0 ||
            U.NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_X_OFFSET, 0) !== 0 ||
            U.NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_Y_OFFSET, 0) !== 0
        );
    }

    // ── Update ──
    function update(root, cfg) {
        if (!S._debug_damageImpactRuntime) { $.Msg("[QOL DEBUG] First update: damageImpactRuntime\n"); S._debug_damageImpactRuntime = true; }
        var active = hasNonDefaultConfig(cfg);
        var enabled = U.IsCfgEnabled(cfg, "ENABLE_DAMAGE_IMPACT");
        var panel = RC(root, "damageImpactPanel", "damage_impact");
        if (!panel) return;

        var offsetX = active ? U.NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_X_OFFSET, 0) : 0;
        var offsetY = active ? U.NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_Y_OFFSET, 0) : 0;
        var opacityText = active ? U.NormalizeOpacityNumber(cfg.DAMAGE_IMPACT_OPACITY, 1.0).toFixed(2) : "1.00";
        var scaleText = active ? NDS(cfg.DAMAGE_IMPACT_SCALE, 1.0).toFixed(2) : "1.00";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + scaleText + "|" + (enabled ? "1" : "0");
        if (S.damageImpactRuntimeStyleSig === styleSig) return;

        panel.style.x = String(offsetX) + "px";
        panel.style.y = String(-offsetY) + "px";
        panel.style.opacity = opacityText;
        panel.style.preTransformScale2d = scaleText + ", " + scaleText;
        panel.style.visibility = enabled ? "visible" : "collapse";
        S.damageImpactRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    (typeof QOL_REGISTER_FEATURE !== "undefined" ? QOL_REGISTER_FEATURE : null)("damageImpactRuntime", {
        configKeys: ["ENABLE_DAMAGE_IMPACT", "DAMAGE_IMPACT_SCALE", "DAMAGE_IMPACT_OPACITY",
                     "DAMAGE_IMPACT_X_OFFSET", "DAMAGE_IMPACT_Y_OFFSET"],
        bucket: 7, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["damageImpactRuntimeStyleSig", "cachedPanels.damageImpactPanel"]
    });
})();
