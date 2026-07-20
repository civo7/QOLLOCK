// ql_feat_ammo.js — Ammo panel HUD runtime (scale, position, color)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
        var _featureId = "ql_feat_ammo";
    // DEPENDS: getCachedPanel, normalizeAmmoClipAngle, readAmmoTextColorIndex, resolveWashColorFromPalette, state, setCachedPanel, utils
    var _deps = QOL.import(["getCachedPanel","normalizeAmmoClipAngle","readAmmoTextColorIndex","resolveWashColorFromPalette","state","setCachedPanel","utils"]);
    // State = _deps.state, Utils = _deps.utils, GetCachedPanel/SetCachedPanel = panel cache get/set.
    var GetCachedPanel = _deps.getCachedPanel;
    var RWP = _deps.resolveWashColorFromPalette;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var RAI = _deps.readAmmoTextColorIndex;
    var NAC = _deps.normalizeAmmoClipAngle;
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
        if (NAC(cfg.AMMO_CLIP_ANGLE) !== 0) return true;
        if (RAI(cfg) !== 0) return true;
        return !!(State.ammoPanelStyleSig && String(State.ammoPanelStyleSig).length > 0) ||
            !!(State.ammoClipAngleStyleSig && String(State.ammoClipAngleStyleSig).length > 0);
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

        // Empty ammoTextColor means "default": clear the inline override so the
        // stylesheet color applies again. Assigning "" via SetStyleSafe does NOT
        // reliably clear an inline color in Panorama — ClearStyleSafe (delete →
        // null → "" cascade) does. (Fixes: reverting to Default left old color stuck.)
        function applyAmmoTextColor(label) {
            if (ammoTextColor) Utils.SetStyleSafe(label, "color", ammoTextColor);
            else Utils.ClearStyleSafe(label, "color");
        }

        var ammoValueLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo") || [];
        for (var ammoIdx = 0; ammoIdx < ammoValueLabels.length; ammoIdx++) {
            var ammoValueLabel = ammoValueLabels[ammoIdx];
            if (!ammoValueLabel) continue;
            ammoValueLabel.style.fontSize = String(scaledCurrentFontPx) + "px";
            ammoValueLabel.style.width = String(scaledValueWidthPx) + "px";
            applyAmmoTextColor(ammoValueLabel);
        }
        var ammoMaxLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo_max") || [];
        for (var maxIdx = 0; maxIdx < ammoMaxLabels.length; maxIdx++) {
            var ammoMaxLabel = ammoMaxLabels[maxIdx];
            if (!ammoMaxLabel) continue;
            ammoMaxLabel.style.fontSize = String(scaledTotalFontPx) + "px";
            ammoMaxLabel.style.width = String(scaledMaxWidthPx) + "px";
            ammoMaxLabel.style.marginLeft = String(scaledMaxMarginLeftPx) + "px";
            applyAmmoTextColor(ammoMaxLabel);
        }
        var ammoInfiniteLabels = ammoPanel.FindChildrenWithClassTraverse("weapon_ammo_infinite") || [];
        for (var infiniteIdx = 0; infiniteIdx < ammoInfiniteLabels.length; infiniteIdx++) {
            var ammoInfiniteLabel = ammoInfiniteLabels[infiniteIdx];
            if (!ammoInfiniteLabel) continue;
            applyAmmoTextColor(ammoInfiniteLabel);
        }

        ammoPanel.style.preTransformScale2d = "1.00, 1.00";
        ammoPanel.style.x = String(ammoOffsetX) + "px";
        ammoPanel.style.y = String(80 - ammoOffsetY) + "px";
        ammoPanel.style.visibility = "visible";
        Utils.SetPanelOpacitySafe(ammoPanel, 1.0, 1.0);
    }

    // ── Magazine visualiser rotation (#clip_status — circular clip indicator) ──
    function getAmmoClipStatus(root) {
        var panel = GetCachedPanel("ammoClipStatus");
        if (!panel) {
            panel = root.FindChildTraverse("clip_status");
            SetCachedPanel("ammoClipStatus", panel);
        }
        return panel;
    }

    // The clip_status container holds the magazine ring (concentric
    // CircularProgressBar children). Putting a `transform` on the *container*
    // promotes it to a compositing layer and makes the overlapping ammo-digit
    // sibling (#ammo_panel) vanish. Rotating the children instead is visually
    // identical — every ring bar is center-aligned, so rotating each around its
    // own centre rotates the whole ring — while leaving the container (and the
    // digits) untouched.
    function getAmmoClipRingPanels(root) {
        var clipStatus = getAmmoClipStatus(root);
        if (!clipStatus) return null;
        var children = (clipStatus.Children && clipStatus.Children()) || [];
        var rings = [];
        for (var i = 0; i < children.length; i++) {
            if (Utils.IsPanelValid(children[i])) rings.push(children[i]);
        }
        return rings.length ? rings : null;
    }

    function ApplyAmmoClipAngle(root, cfg) {
        var angle = NAC(cfg && cfg.AMMO_CLIP_ANGLE);
        var angleSig = String(angle);
        var rings = getAmmoClipRingPanels(root);
        if (!rings) {
            // clip_status not resolved yet — drop the sig so we re-apply once it appears.
            State.ammoClipAngleStyleSig = "";
            return;
        }
        // Re-apply when the angle changes OR the engine rebuilt/re-showed the ring
        // children (weapon swap, reload, respawn reset them to the stylesheet's
        // rotateZ(0deg)). Folding the ring count into the signature forces a
        // re-apply on a replaced child set instead of silently keeping stale state.
        var sig = angleSig + "|" + rings.length;
        if (State.ammoClipAngleStyleSig === sig) return;

        // Defensive: earlier builds wrote the rotation onto the #clip_status
        // CONTAINER. Any transform there promotes it to a compositing layer and
        // hides the overlapping #ammo_panel digits, so the ammo counter vanishes
        // — even at angle 0 (rotateZ(0deg) still promotes). Clear any such
        // orphaned inline transform so the digits stay visible.
        var clipStatus = getAmmoClipStatus(root);
        if (clipStatus) Utils.ClearStyleSafe(clipStatus, "transform");

        for (var i = 0; i < rings.length; i++) {
            if (angle === 0) {
                // Default: no rotation. Clear the override rather than write an
                // identity transform, so no needless compositing layer lingers.
                Utils.ClearStyleSafe(rings[i], "transform");
            } else {
                // Negative rotateZ → counter-clockwise rotation.
                Utils.SetStyleSafe(rings[i], "transform", "rotateZ(-" + angleSig + "deg)");
            }
        }
        State.ammoClipAngleStyleSig = sig;
    }

    // ── Update ──
    function update(root, cfg) {
        if (!State._debug_ammo) { $.Msg("[QOL DEBUG] First update: ammo\n"); State._debug_ammo = true; }
        // Magazine rotation is independent of the ammo-text scale/position/color path.
        ApplyAmmoClipAngle(root, cfg);
        if (Number(cfg.ENABLE_AMMO_STATUS) !== 1 &&
            Number(cfg.ENABLE_HIDE_MAGAZINE) !== 1 &&
            Number(cfg.ENABLE_HIDE_AMMO_ALL) !== 1 &&
            Number(cfg.AMMO_PANEL_SCALE) === 100 &&
            Number(cfg.AMMO_CURRENT_SCALE) === 100 &&
            Number(cfg.AMMO_TOTAL_SCALE) === 100 &&
            Number(cfg.AMMO_PANEL_X_OFFSET) === 0 &&
            Number(cfg.AMMO_PANEL_Y_OFFSET) === 0 &&
            RAI(cfg) === 0 &&
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
                     "AMMO_PANEL_X_OFFSET", "AMMO_PANEL_Y_OFFSET", "AMMO_CLIP_ANGLE"],
        bucket: 4, phase: -1,
        requiresRoot: true,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["cachedPanels.ammoPanel", "ammoPanelStyleSig",
                    "cachedPanels.ammoClipStatus", "ammoClipAngleStyleSig"]
    });

    // ── Self-test ──
    try {
        if (typeof update !== "function") throw new Error("update is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
