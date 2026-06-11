// ql_feat_stamina.js — Stamina charge color and angle runtime
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: staminaChargeColorRuntime\n");
        var _featureId = "ql_feat_stamina";
    var _deps = QOL.import(["getCachedPanel","normalizeStaminaChargeAngle","readStaminaChargeColorIndex","resolveCachedPanel","resolveWashColorFromPalette","state","utils"]);
    var GC = _deps.getCachedPanel;
    var RC = _deps.resolveCachedPanel;
    var RWP = _deps.resolveWashColorFromPalette;
    var S = _deps.state;
    var U = _deps.utils;
    var IPV = U.IsPanelValid;
    var NSA = _deps.normalizeStaminaChargeAngle;
    var RSC = _deps.readStaminaChargeColorIndex;
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(S.staminaChargeAngleStyleSig && String(S.staminaChargeAngleStyleSig).length > 0) ||
            !!(S.staminaChargeColorStyleSig && String(S.staminaChargeColorStyleSig).length > 0) ||
            GC("staminaChargesContainer") ||
            !!(S.staminaChargeColorPanelCache && S.staminaChargeColorPanelCache.length > 0);
    }

    function hasNonDefaultColorConfig(cfg) {
        if (!cfg) return false;
        return RSC(cfg) !== 0;
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return NSA(cfg.STAMINA_CHARGE_ANGLE) !== 45 ||
            hasNonDefaultColorConfig(cfg);
    }

    // ── Panel helpers (inlined from ql_core.js) ──
    function getStaminaChargeColorPanels(root, nowMs) {
        var cached = S.staminaChargeColorPanelCache || [];
        if (U.IsPanelListValid(cached) && nowMs < (S.staminaChargeColorPanelCacheNextMs || 0)) {
            return cached;
        }

        var panels = [];
        var searchRoot = GC("staminaChargesContainer");
        if (!searchRoot && root && root.FindChildTraverse) {
            searchRoot = root.FindChildTraverse("charges_container") || root;
        }
        if (!searchRoot) searchRoot = root;

        if (searchRoot && searchRoot.FindChildrenWithClassTraverse) {
            var finishedCharges = searchRoot.FindChildrenWithClassTraverse("charge_fg") || [];
            for (var i = 0; i < finishedCharges.length; i++) {
                var fg = finishedCharges[i];
                if (IPV(fg) && fg.BHasClass && fg.BHasClass("finished")) panels.push(fg);
            }

            var drainedCharges = searchRoot.FindChildrenWithClassTraverse("charge_drained") || [];
            for (var j = 0; j < drainedCharges.length; j++) {
                var drained = drainedCharges[j];
                if (IPV(drained)) panels.push(drained);
            }
        }

        S.staminaChargeColorPanelCache = panels;
        S.staminaChargeColorPanelCacheNextMs = nowMs + 500;
        return panels;
    }

    function getStaminaChargesContainer(root) {
        return RC(root, "staminaChargesContainer", "charges_container");
    }

    // ── Update ──
    function update(root, cfg, nowMs) {
        if (!S._debug_staminaChargeColorRuntime) { $.Msg("[QOL DEBUG] First update: staminaChargeColorRuntime\n"); S._debug_staminaChargeColorRuntime = true; }
        if (!hasNonDefaultConfig(cfg) &&
            !GC("staminaChargesContainer") &&
            !(S.staminaChargeColorPanelCache && S.staminaChargeColorPanelCache.length > 0)) return;

        var color = RWP(RSC(cfg));
        var angle = NSA(cfg && cfg.STAMINA_CHARGE_ANGLE);
        var angleSig = String(angle);
        var chargesContainer = getStaminaChargesContainer(root);
        if (chargesContainer && S.staminaChargeAngleStyleSig !== angleSig) {
            U.SetStyleSafe(chargesContainer, "transform", "rotateZ(" + String(angle) + "deg)");
            S.staminaChargeAngleStyleSig = angleSig;
        } else if (!chargesContainer) {
            S.staminaChargeAngleStyleSig = "";
        }

        var styleSig = color || "";
        var panels = getStaminaChargeColorPanels(root, nowMs || 0);
        if (S.staminaChargeColorStyleSig === styleSig && U.IsPanelListValid(panels)) return;

        for (var i = 0; i < panels.length; i++) {
            var panel = panels[i];
            if (!IPV(panel)) continue;
            U.SetStyleSafe(panel, "borderColor", color || "");
        }

        S.staminaChargeColorStyleSig = styleSig;
    }

    // ── Register ──
    QOL.register("staminaChargeColorRuntime", {
        configKeys: ["STAMINA_CHARGE_ANGLE", "STAMINA_CHARGE_COLOR"],
        bucket: 7, phase: -1,
        gate: gate,
        update: function(root, cfg, nowMs) { update(root, cfg, nowMs); },
        stateKeys: ["staminaChargeAngleStyleSig", "staminaChargeColorStyleSig",
                    "staminaChargeColorPanelCache", "staminaChargeColorPanelCacheNextMs",
                    "cachedPanels.staminaChargesContainer"]
    });
})();
