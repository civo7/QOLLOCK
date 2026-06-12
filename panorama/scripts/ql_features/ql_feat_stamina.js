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
    var _dbgTick = 0;
    var _dbgLastLogTick = 0;
    var _dbgLogEveryN = 60; // log every 60 ticks (~3s at 20Hz)

    function update(root, cfg, nowMs) {
        _dbgTick++;
        var rawIndex = RSC(cfg);
        var color = RWP(rawIndex);
        var styleSig = color || "";

        // Log on sig change or every N ticks
        var sigChanged = State.staminaChargeColorStyleSig !== styleSig;
        var forceLog = sigChanged || (_dbgTick - _dbgLastLogTick >= _dbgLogEveryN);
        if (forceLog) {
            _dbgLastLogTick = _dbgTick;
            $.Msg("[STAMINA DBG] tick=" + _dbgTick +
                  " rawIndex=" + rawIndex +
                  " color='" + color + "'" +
                  " styleSig='" + styleSig + "'" +
                  " prevSig='" + (State.staminaChargeColorStyleSig || "") + "'" +
                  " sigChanged=" + sigChanged +
                  " cfg.STAMINA_CHARGE_COLOR=" + (cfg && cfg.STAMINA_CHARGE_COLOR));
        }

        if (!hasNonDefaultConfig(cfg) &&
            !GetCachedPanel("staminaChargesContainer") &&
            !(State.staminaChargeColorPanelCache && State.staminaChargeColorPanelCache.length > 0)) {
            if (forceLog) $.Msg("[STAMINA DBG] early exit: no non-default config, no cached container/panels");
            return;
        }

        var angle = NSA(cfg && cfg.STAMINA_CHARGE_ANGLE);
        var angleSig = String(angle);
        var chargesContainer = getStaminaChargesContainer(root);
        if (chargesContainer && State.staminaChargeAngleStyleSig !== angleSig) {
            Utils.SetStyleSafe(chargesContainer, "transform", "rotateZ(" + String(angle) + "deg)");
            State.staminaChargeAngleStyleSig = angleSig;
        } else if (!chargesContainer) {
            State.staminaChargeAngleStyleSig = "";
        }

        var panels = getStaminaChargeColorPanels(root, nowMs || 0);
        if (State.staminaChargeColorStyleSig === styleSig && Utils.IsPanelListValid(panels)) {
            if (forceLog) $.Msg("[STAMINA DBG] debounce: sig unchanged, panels valid, skipping. panelCount=" + panels.length);
            return;
        }

        // Use wash-color instead of border/borderColor. When clearing,
        // set to "transparent" (alpha=0) which effectively disables the wash.
        // "none" sets it to white (#FFFFFFFF) which is still visible.
        var targetValue = color || "transparent";

        if (forceLog) {
            $.Msg("[STAMINA DBG] applying: targetValue=" + targetValue +
                  " panelCount=" + panels.length +
                  " typeof=" + typeof targetValue);
            for (var pi = 0; pi < panels.length; pi++) {
                var pp = panels[pi];
                if (IPV(pp)) {
                    var curVal = "?";
                    try { curVal = pp.style.washColor; } catch(e) { curVal = "<error:" + e.message + ">"; }
                    $.Msg("[STAMINA DBG]   panel[" + pi + "] id=" + (pp.id || "?") +
                          " curWashColor='" + curVal + "'" +
                          " -> setting to '" + targetValue + "'");
                } else {
                    $.Msg("[STAMINA DBG]   panel[" + pi + "] INVALID");
                }
            }
        }

        for (var i = 0; i < panels.length; i++) {
            var panel = panels[i];
            if (!IPV(panel)) continue;
            try {
                panel.style.washColor = targetValue;
            } catch(e) {
                $.Msg("[STAMINA DBG] EXCEPTION panel[" + i + "] washColor=" + targetValue + ": " + e.message);
            }
            if (forceLog) {
                var after = "?";
                try { after = panel.style.washColor; } catch(e2) { after = "<err>"; }
                $.Msg("[STAMINA DBG]   after: panel[" + i + "] washColor='" + after + "' typeof=" + typeof after);
            }
        }

        State.staminaChargeColorStyleSig = styleSig;
        if (forceLog) $.Msg("[STAMINA DBG] saved sig='" + styleSig + "'");
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
    // ── Debug console hook ──
    // Run from Panorama console: QOL_DUMP_STAMINA_DEBUG()
    var _global = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this);
    _global.QOL_DUMP_STAMINA_DEBUG = function() {
        $.Msg("[STAMINA DUMP] === State ===");
        $.Msg("[STAMINA DUMP] sig='" + (State.staminaChargeColorStyleSig || "") + "'");
        $.Msg("[STAMINA DUMP] angleSig='" + (State.staminaChargeAngleStyleSig || "") + "'");
        $.Msg("[STAMINA DUMP] panelCache.length=" + (State.staminaChargeColorPanelCache ? State.staminaChargeColorPanelCache.length : 0));
        $.Msg("[STAMINA DUMP] panelCacheNextMs=" + (State.staminaChargeColorPanelCacheNextMs || 0));
        $.Msg("[STAMINA DUMP] cachedPanels.staminaChargesContainer=" + !!GetCachedPanel("staminaChargesContainer"));
        $.Msg("[STAMINA DUMP] dbgTick=" + _dbgTick);
        $.Msg("[STAMINA DUMP] === Cache panels ===");
        var cache = State.staminaChargeColorPanelCache || [];
        for (var i = 0; i < cache.length; i++) {
            var p = cache[i];
            if (IPV(p)) {
                var cur = "?";
                try { cur = p.style.washColor; } catch(e) { cur = "<err>"; }
                $.Msg("[STAMINA DUMP] cache[" + i + "] id=" + (p.id || "?") + " curWashColor='" + cur + "'");
            } else {
                $.Msg("[STAMINA DUMP] cache[" + i + "] INVALID");
            }
        }
        $.Msg("[STAMINA DUMP] === End ===");
    };

})();
