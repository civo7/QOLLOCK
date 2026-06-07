// ql_feat_ammo.js — Ammo panel HUD runtime (scale, position, color)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: ammo\n");
    var S = window.QOL_STATE;
    var GC = window.QOL_GetCachedPanel;
    var SC = window.QOL_SetCachedPanel;
    var U = window.QOL_UTILS;
    var RWP = window.QOL_ResolveWashColorFromPalette;
    var RAI = window.QOL_ReadAmmoTextColorIndex;

    // ── Gate ──
    function gate(cfg) {
        if (!cfg) return false;
        if (U.IsCfgEnabled(cfg, "ENABLE_AMMO_STATUS")) return true;
        if (U.IsCfgEnabled(cfg, "ENABLE_HIDE_MAGAZINE")) return true;
        if (U.IsCfgEnabled(cfg, "ENABLE_HIDE_AMMO_ALL")) return true;
        if (Number(cfg.AMMO_PANEL_SCALE) !== 100) return true;
        if (Number(cfg.AMMO_CURRENT_SCALE) !== 100) return true;
        if (Number(cfg.AMMO_TOTAL_SCALE) !== 100) return true;
        if (Number(cfg.AMMO_PANEL_X_OFFSET) !== 0) return true;
        if (Number(cfg.AMMO_PANEL_Y_OFFSET) !== 0) return true;
        if (RAI(cfg) !== 0) return true;
        return !!(S.ammoPanelStyleSig && String(S.ammoPanelStyleSig).length > 0);
    }

    // ── Update ──
    function update(root, cfg) {
        if (!S._debug_ammo) { $.Msg("[QOL DEBUG] First update: ammo\n"); S._debug_ammo = true; }
        if (Number(cfg.ENABLE_AMMO_STATUS) !== 1 &&
            Number(cfg.ENABLE_HIDE_MAGAZINE) !== 1 &&
            Number(cfg.ENABLE_HIDE_AMMO_ALL) !== 1 &&
            Number(cfg.AMMO_PANEL_SCALE) === 100 &&
            Number(cfg.AMMO_CURRENT_SCALE) === 100 &&
            Number(cfg.AMMO_TOTAL_SCALE) === 100 &&
            Number(cfg.AMMO_PANEL_X_OFFSET) === 0 &&
            Number(cfg.AMMO_PANEL_Y_OFFSET) === 0 &&
            !GC("ammoPanel")) return;

        var ammoPanel = GC("ammoPanel");
        if (!ammoPanel) {
            ammoPanel = root.FindChildTraverse("ammo_panel");
            SC("ammoPanel", ammoPanel);
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
            if (S.ammoPanelStyleSig !== ammoSig) {
                var ammoCurrentScaleFactor = ammoCurrentScale / 100.0;
                var scaledCurrentFontPx = Math.round(16 * ammoCurrentScaleFactor);
                if (scaledCurrentFontPx < 12) scaledCurrentFontPx = 12;
                var scaledValueWidthPx = Math.round(32 * ammoCurrentScaleFactor);
                if (scaledValueWidthPx < 24) scaledValueWidthPx = 24;

                var ammoTotalScaleFactor = ammoTotalScale / 100.0;
                var scaledTotalFontPx = Math.round(16 * ammoTotalScaleFactor);
                if (scaledTotalFontPx < 12) scaledTotalFontPx = 12;
                var scaledMaxWidthPx = Math.round(50 * ammoTotalScaleFactor);
                if (scaledMaxWidthPx < 32) scaledMaxWidthPx = 32;
                var scaledMaxMarginLeftPx = Math.round(2 * ammoTotalScaleFactor);
                if (scaledMaxMarginLeftPx < 0) scaledMaxMarginLeftPx = 0;

                var ammoValueLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo") || [];
                for (var av = 0; av < ammoValueLabels.length; av++) {
                    var ammoValueLabel = ammoValueLabels[av];
                    if (!ammoValueLabel) continue;
                    ammoValueLabel.style.fontSize = String(scaledCurrentFontPx) + "px";
                    ammoValueLabel.style.width = String(scaledValueWidthPx) + "px";
                    U.SetStyleSafe(ammoValueLabel, "color", ammoTextColor || "");
                }
                var ammoMaxLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo_max") || [];
                for (var am = 0; am < ammoMaxLabels.length; am++) {
                    var ammoMaxLabel = ammoMaxLabels[am];
                    if (!ammoMaxLabel) continue;
                    ammoMaxLabel.style.fontSize = String(scaledTotalFontPx) + "px";
                    ammoMaxLabel.style.width = String(scaledMaxWidthPx) + "px";
                    ammoMaxLabel.style.marginLeft = String(scaledMaxMarginLeftPx) + "px";
                    U.SetStyleSafe(ammoMaxLabel, "color", ammoTextColor || "");
                }
                var ammoInfiniteLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo_infinite") || [];
                for (var ai = 0; ai < ammoInfiniteLabels.length; ai++) {
                    var ammoInfiniteLabel = ammoInfiniteLabels[ai];
                    if (!ammoInfiniteLabel) continue;
                    U.SetStyleSafe(ammoInfiniteLabel, "color", ammoTextColor || "");
                }

                ammoPanel.style.preTransformScale2d = "1.00, 1.00";
                ammoPanel.style.x = String(ammoOffsetX) + "px";
                ammoPanel.style.y = String(80 - ammoOffsetY) + "px";
                ammoPanel.style.visibility = "visible";
                U.SetPanelOpacitySafe(ammoPanel, 1.0, 1.0);
                S.ammoPanelStyleSig = ammoSig;
            }
        } else {
            S.ammoPanelStyleSig = "";
        }
    }

    // ── Register ──
    window.QOL_REGISTER_FEATURE("ammo", {
        configKeys: ["ENABLE_AMMO_STATUS", "ENABLE_HIDE_MAGAZINE", "ENABLE_HIDE_AMMO_ALL",
                     "AMMO_PANEL_SCALE", "AMMO_CURRENT_SCALE", "AMMO_TOTAL_SCALE",
                     "AMMO_PANEL_X_OFFSET", "AMMO_PANEL_Y_OFFSET"],
        bucket: 4, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["cachedPanels.ammoPanel", "ammoPanelStyleSig"]
    });
})();
