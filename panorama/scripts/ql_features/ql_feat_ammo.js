// ql_feat_ammo.js — Ammo panel HUD runtime (scale, position, color)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: ammo\n");
        var _featureId = "ql_feat_ammo";
    var _deps = QOL.import(["getCachedPanel","readAmmoTextColorIndex","resolveWashColorFromPalette","state","setCachedPanel","utils"]);
    // State = _deps.state, Utils = _deps.utils, GetCachedPanel/SetCachedPanel = panel cache get/set.
    var GetCachedPanel = _deps.getCachedPanel;
    var RWP = _deps.resolveWashColorFromPalette;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var RAI = _deps.readAmmoTextColorIndex;
    // ── Gate ──
    function gate(cfg) {
        if (!cfg) return false;
        if (Utils.IsCfgEnabled(cfg, "ENABLE_AMMO_STATUS")) return true;
        if (Utils.IsCfgEnabled(cfg, "ENABLE_HIDE_MAGAZINE")) return true;
        if (Utils.IsCfgEnabled(cfg, "ENABLE_HIDE_AMMO_ALL")) return true;
        if (Number(cfg.AMMO_PANEL_SCALE) !== 100) return true;
        if (Number(cfg.AMMO_CURRENT_SCALE) !== 100) return true;
        if (Number(cfg.AMMO_TOTAL_SCALE) !== 100) return true;
        if (Number(cfg.AMMO_PANEL_X_OFFSET) !== 0) return true;
        if (Number(cfg.AMMO_PANEL_Y_OFFSET) !== 0) return true;
        if (RAI(cfg) !== 0) return true;
        return !!(State.ammoPanelStyleSig && String(State.ammoPanelStyleSig).length > 0);
    }

    // ── Apply scaled styles + position to ammo panel children (extracted from update)

    function ApplyAmmoPanelStyles(ammoPanel, ammoCurrentScale, ammoTotalScale, ammoOffsetX, ammoOffsetY, ammoTextColor) {
        var currentFactor = ammoCurrentScale / 100.0;
        var scaledCurrentFontPx = Math.max(12, Math.round(16 * currentFactor));
        var scaledValueWidthPx = Math.max(24, Math.round(32 * currentFactor));

        var totalFactor = ammoTotalScale / 100.0;
        var scaledTotalFontPx = Math.max(12, Math.round(16 * totalFactor));
        var scaledMaxWidthPx = Math.max(32, Math.round(50 * totalFactor));
        var scaledMaxMarginLeftPx = Math.max(0, Math.round(2 * totalFactor));

        var ammoValueLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo") || [];
        for (var ammoIdx = 0; ammoIdx < ammoValueLabels.length; ammoIdx++) {
            var ammoValueLabel = ammoValueLabels[ammoIdx];
            if (!ammoValueLabel) continue;
            ammoValueLabel.style.fontSize = String(scaledCurrentFontPx) + "px";
            ammoValueLabel.style.width = String(scaledValueWidthPx) + "px";
            Utils.SetStyleSafe(ammoValueLabel, "color", ammoTextColor || "");
        }
        var ammoMaxLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo_max") || [];
        for (var maxIdx = 0; maxIdx < ammoMaxLabels.length; maxIdx++) {
            var ammoMaxLabel = ammoMaxLabels[maxIdx];
            if (!ammoMaxLabel) continue;
            ammoMaxLabel.style.fontSize = String(scaledTotalFontPx) + "px";
            ammoMaxLabel.style.width = String(scaledMaxWidthPx) + "px";
            ammoMaxLabel.style.marginLeft = String(scaledMaxMarginLeftPx) + "px";
            Utils.SetStyleSafe(ammoMaxLabel, "color", ammoTextColor || "");
        }
        var ammoInfiniteLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo_infinite") || [];
        for (var infiniteIdx = 0; infiniteIdx < ammoInfiniteLabels.length; infiniteIdx++) {
            var ammoInfiniteLabel = ammoInfiniteLabels[infiniteIdx];
            if (!ammoInfiniteLabel) continue;
            Utils.SetStyleSafe(ammoInfiniteLabel, "color", ammoTextColor || "");
        }

        ammoPanel.style.preTransformScale2d = "1.00, 1.00";
        ammoPanel.style.x = String(ammoOffsetX) + "px";
        ammoPanel.style.y = String(80 - ammoOffsetY) + "px";
        ammoPanel.style.visibility = "visible";
        Utils.SetPanelOpacitySafe(ammoPanel, 1.0, 1.0);
    }

    // ── Update ──
    function update(root, cfg) {
        if (!State._debug_ammo) { $.Msg("[QOL DEBUG] First update: ammo\n"); State._debug_ammo = true; }
        if (Number(cfg.ENABLE_AMMO_STATUS) !== 1 &&
            Number(cfg.ENABLE_HIDE_MAGAZINE) !== 1 &&
            Number(cfg.ENABLE_HIDE_AMMO_ALL) !== 1 &&
            Number(cfg.AMMO_PANEL_SCALE) === 100 &&
            Number(cfg.AMMO_CURRENT_SCALE) === 100 &&
            Number(cfg.AMMO_TOTAL_SCALE) === 100 &&
            Number(cfg.AMMO_PANEL_X_OFFSET) === 0 &&
            Number(cfg.AMMO_PANEL_Y_OFFSET) === 0 &&
            !GetCachedPanel("ammoPanel")) return;

        var ammoPanel = GetCachedPanel("ammoPanel");
        if (!ammoPanel) {
            ammoPanel = root.FindChildTraverse("ammo_panel");
            SetCachedPanel("ammoPanel", ammoPanel);
        }
        if (ammoPanel) {
            var ammoCurrentScale = (cfg.AMMO_CURRENT_SCALE === undefined || cfg.AMMO_CURRENT_SCALE === null) ? cfg.AMMO_PANEL_SCALE : cfg.AMMO_CURRENT_SCALE;
            ammoCurrentScale = Math.round(Number(ammoCurrentScale));
            if (!isFinite(ammoCurrentScale)) ammoCurrentScale = 100;
            if (ammoCurrentScale < 100) ammoCurrentScale = 100;
            if (ammoCurrentScale > 300) ammoCurrentScale = 300;

            var ammoTotalScale = (cfg.AMMO_TOTAL_SCALE === undefined || cfg.AMMO_TOTAL_SCALE === null) ? cfg.AMMO_PANEL_SCALE : cfg.AMMO_TOTAL_SCALE;
            ammoTotalScale = Math.round(Number(ammoTotalScale));
            if (!isFinite(ammoTotalScale)) ammoTotalScale = 100;
            if (ammoTotalScale < 100) ammoTotalScale = 100;
            if (ammoTotalScale > 300) ammoTotalScale = 300;

            var ammoOffsetX = (cfg.AMMO_PANEL_X_OFFSET === undefined || cfg.AMMO_PANEL_X_OFFSET === null) ? 0 : Math.round(Number(cfg.AMMO_PANEL_X_OFFSET));
            if (!isFinite(ammoOffsetX)) ammoOffsetX = 0;
            if (ammoOffsetX < -200) ammoOffsetX = -200;
            if (ammoOffsetX > 200) ammoOffsetX = 200;
            var ammoOffsetY = (cfg.AMMO_PANEL_Y_OFFSET === undefined || cfg.AMMO_PANEL_Y_OFFSET === null) ? 0 : Math.round(Number(cfg.AMMO_PANEL_Y_OFFSET));
            if (!isFinite(ammoOffsetY)) ammoOffsetY = 0;
            if (ammoOffsetY < -200) ammoOffsetY = -200;
            if (ammoOffsetY > 200) ammoOffsetY = 200;

            var ammoTextColor = RWP(RAI(cfg));
            var ammoSig = String(ammoCurrentScale) + "|" + String(ammoTotalScale) + "|" + String(ammoOffsetX) + "|" + String(ammoOffsetY) + "|" + (ammoTextColor || "");
            if (State.ammoPanelStyleSig !== ammoSig) {
                ApplyAmmoPanelStyles(ammoPanel, ammoCurrentScale, ammoTotalScale, ammoOffsetX, ammoOffsetY, ammoTextColor);
                State.ammoPanelStyleSig = ammoSig;
            }
        } else {
            State.ammoPanelStyleSig = "";
        }
    }

    // ── Register ──
    QOL.register("ammo", {
        configKeys: ["ENABLE_AMMO_STATUS", "ENABLE_HIDE_MAGAZINE", "ENABLE_HIDE_AMMO_ALL",
                     "AMMO_PANEL_SCALE", "AMMO_CURRENT_SCALE", "AMMO_TOTAL_SCALE",
                     "AMMO_PANEL_X_OFFSET", "AMMO_PANEL_Y_OFFSET"],
        bucket: 4, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["cachedPanels.ammoPanel", "ammoPanelStyleSig"]
    });
})();
