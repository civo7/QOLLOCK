// ql_feat_stamina.js — Stamina charge color and angle runtime
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: staminaChargeColorRuntime\n");
        var _featureId = "ql_feat_stamina";
    var _deps = QOL.import(["getCachedPanel","normalizeStaminaChargeAngle","readStaminaChargeColorIndex","resolveCachedPanel","resolveWashColorFromPalette","state","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var RC = _deps.resolveCachedPanel;
    var RWP = _deps.resolveWashColorFromPalette;
    var State = _deps.state;
    var Utils = _deps.utils;
    var IPV = Utils.IsPanelValid;
    var NSA = _deps.normalizeStaminaChargeAngle;
    var RSC = _deps.readStaminaChargeColorIndex;
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(State.staminaChargeAngleStyleSig && String(State.staminaChargeAngleStyleSig).length > 0) ||
            !!(State.staminaChargeColorStyleSig && String(State.staminaChargeColorStyleSig).length > 0) ||
            GetCachedPanel("staminaChargesContainer") ||
            !!(State.staminaChargeColorPanelCache && State.staminaChargeColorPanelCache.length > 0);
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
        var cached = State.staminaChargeColorPanelCache || [];
        if (Utils.IsPanelListValid(cached) && nowMs < (State.staminaChargeColorPanelCacheNextMs || 0)) {
            return cached;
        }

        var panels = [];
        var searchRoot = GetCachedPanel("staminaChargesContainer");
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

        State.staminaChargeColorPanelCache = panels;
        State.staminaChargeColorPanelCacheNextMs = nowMs + 500;
        return panels;
    }

    function getStaminaChargesContainer(root) {
        return RC(root, "staminaChargesContainer", "charges_container");
    }

    // ── Update ──
    function update(root, cfg, nowMs) {
        if (!State._debug_staminaChargeColorRuntime) { $.Msg("[QOL DEBUG] First update: staminaChargeColorRuntime\n"); State._debug_staminaChargeColorRuntime = true; }
        if (!hasNonDefaultConfig(cfg) &&
            !GetCachedPanel("staminaChargesContainer") &&
            !(State.staminaChargeColorPanelCache && State.staminaChargeColorPanelCache.length > 0)) return;

        var color = RWP(RSC(cfg));
        var angle = NSA(cfg && cfg.STAMINA_CHARGE_ANGLE);
        var angleSig = String(angle);
        var chargesContainer = getStaminaChargesContainer(root);
        if (chargesContainer && State.staminaChargeAngleStyleSig !== angleSig) {
            Utils.SetStyleSafe(chargesContainer, "transform", "rotateZ(" + String(angle) + "deg)");
            State.staminaChargeAngleStyleSig = angleSig;
        } else if (!chargesContainer) {
            State.staminaChargeAngleStyleSig = "";
        }

        var styleSig = color || "";
        var panels = getStaminaChargeColorPanels(root, nowMs || 0);
        if (State.staminaChargeColorStyleSig === styleSig && Utils.IsPanelListValid(panels)) return;

        for (var i = 0; i < panels.length; i++) {
            var panel = panels[i];
            if (!IPV(panel)) continue;
            Utils.SetStyleSafe(panel, "borderColor", color || "");
        }

        State.staminaChargeColorStyleSig = styleSig;
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
