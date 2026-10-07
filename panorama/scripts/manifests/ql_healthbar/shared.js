// features/ql_healthbar/shared.js
// =============================================================================
// QOLLOCK — Healthbar Shared Helpers
// =============================================================================
// OWNS:        Shared panel reset, style computation, and application helpers
//              used by multiple healthbar variants: resetMinimalistOffsetRuntime,
//              resetPlayerScaleOpacity, buildPlayerHealthbarStyleState,
//              applyPlayerStyleToPanel, resetPlayerStyle, resetOffsetRuntimeAll.
// DOES NOT OWN: Variant-specific logic, health reading, panel discovery
// DEPENDS ON:  Nothing beyond Utils + GetCachedPanel (already available)
// USED BY:     Healthbar variants (minimalist, fg, budhud, accent, mc)
//              via QOL.healthbar.* namespace
//
// Extracted from ql_feat_healthbar.js (Phase 6).
// Coexists with original — both publish to QOL.healthbar.* namespace.
// =============================================================================

(function() {
    "use strict";

    // Publish to QOL.healthbar namespace (create if not exists)
    QOL.healthbar = QOL.healthbar || {};

    // -- Shared reset helpers --

    var clearStyle = QOL.utils.ClearStyleSafe;
    var Panel = QOL.core.panel;
    var scaleOwners = new Map();
    var positionOwners = new Set();

    // The XML root is the engine-owned CitadelHudHealthContainer, not a
    // separate Panel. Keep its native canvas and CSS baseline unchanged.
    QOL.healthbar.getPlayerScalePanel = function(panel) {
        return Panel.findChild(panel, "QOLHealthbarGeometry");
    };
    QOL.healthbar.playerScaleGeometry = function(panel) {
        var target = QOL.healthbar.getPlayerScalePanel(panel);
        function logicalSize(axis, dimension) {
            var actual = Number(panel && panel["actuallayout" + dimension]);
            var scale = Number(panel && panel["actualuiscale_" + axis]);
            return actual > 0 && scale > 0 ? Number((actual / scale).toFixed(2)) : 0;
        }
        return { target: target, width: logicalSize("x", "width"), height: logicalSize("y", "height") };
    };
    function clearScaleOwner(panel) {
        var target = scaleOwners.get(panel);
        if (Panel.isAlive(target)) {
            clearStyle(target, "uiScale");
            clearStyle(target, "width");
            clearStyle(target, "height");
        }
        scaleOwners.delete(panel);
    }

    QOL.healthbar.resetMinimalistOffsetRuntime = function(panel) {
        if (!panel || !panel.style) return;
        if (positionOwners.has(panel)) {
            // x/y are components of native position. Return the layout to its
            // origin before releasing the composite property back to CSS.
            panel.style.x = "0px";
            panel.style.y = "0px";
            clearStyle(panel, "position");
            positionOwners.delete(panel);
        }
        clearStyle(panel, "x");
        clearStyle(panel, "y");
    };

    // Clear, never write identity values. ui-scale in particular belongs to CSS:
    // base/hud.css:420 puts 120% on #health_and_abilities_container (104% under
    // .support_16_10_active), so writing "100%" here is not a reset — it shrinks
    // the bar to 100/120 and, because the panel is centred off a 1290px right
    // margin, moves it left. Same reasoning for opacity: the game fades the
    // container in over 1.5s on .GameStatePreGame, and a forced 1.00 skips it.
    QOL.healthbar.resetPlayerScaleOpacity = function(panel) {
        if (!panel || !panel.style) return;
        clearScaleOwner(panel);
        clearStyle(panel, "preTransformScale2d");
        clearStyle(panel, "uiScale");
        clearStyle(panel, "opacity");
    };

    QOL.healthbar.resetPlayerStyle = function(panel) {
        QOL.healthbar.resetMinimalistOffsetRuntime(panel);
        QOL.healthbar.resetPlayerScaleOpacity(panel);
    };

    QOL.healthbar.resetMinimalistOffsetRuntimeAll = function(root, currentPanel, previousPanel) {
        var Utils = QOL.utils;
        var GetCachedPanel = QOL.getCachedPanel;
        var GetUIRoot = QOL.getUIRoot;
        var PushUnique = QOL_UTILS.PushUnique;

        var seen = [];
        function push(p) { if (p && typeof p.IsValid === "function" && p.IsValid()) PushUnique(seen, p); }

        push(currentPanel);
        push(previousPanel);
        push(GetCachedPanel ? GetCachedPanel("healthContainer") : null);

        if (root && root.FindChildTraverse) {
            push(root.FindChildTraverse("health_and_abilities_container"));
        }
        var uiRoot = GetUIRoot ? GetUIRoot() : null;
        if (uiRoot && uiRoot.FindChildTraverse) {
            push(uiRoot.FindChildTraverse("health_and_abilities_container"));
        }

        for (var p = 0; p < seen.length; p++) {
            QOL.healthbar.resetMinimalistOffsetRuntime(seen[p]);
        }
    };

    // -- Shared style computation --

    QOL.healthbar.buildPlayerHealthbarStyleState = function(cfg, minimalistEnabled, minimalistClassActive) {
        var playerOffsetX = (cfg && cfg.PLAYER_HEALTHBAR_X_OFFSET !== undefined && cfg.PLAYER_HEALTHBAR_X_OFFSET !== null)
            ? Math.round(Number(cfg.PLAYER_HEALTHBAR_X_OFFSET)) : 0;
        var playerOffsetY = (cfg && cfg.PLAYER_HEALTHBAR_Y_OFFSET !== undefined && cfg.PLAYER_HEALTHBAR_Y_OFFSET !== null)
            ? Math.round(Number(cfg.PLAYER_HEALTHBAR_Y_OFFSET)) : 0;
        var playerScale = (cfg && cfg.PLAYER_HEALTHBAR_SCALE !== undefined && cfg.PLAYER_HEALTHBAR_SCALE !== null)
            ? Math.round(Number(cfg.PLAYER_HEALTHBAR_SCALE)) : 100;
        var playerOpacity = (cfg && cfg.PLAYER_HEALTHBAR_OPACITY !== undefined && cfg.PLAYER_HEALTHBAR_OPACITY !== null)
            ? Number(cfg.PLAYER_HEALTHBAR_OPACITY) : 1.0;

        if (!isFinite(playerOffsetX)) playerOffsetX = 0;
        if (!isFinite(playerOffsetY)) playerOffsetY = 0;
        if (!isFinite(playerScale)) playerScale = 100;
        if (!isFinite(playerOpacity)) playerOpacity = 1.0;
        if (playerOffsetX < -1000) playerOffsetX = -1000;
        if (playerOffsetX > 1000) playerOffsetX = 1000;
        if (playerOffsetY < -1000) playerOffsetY = -1000;
        if (playerOffsetY > 1000) playerOffsetY = 1000;
        if (playerScale < 50) playerScale = 50;
        if (playerScale > 200) playerScale = 200;
        if (playerOpacity < 0) playerOpacity = 0;
        if (playerOpacity > 1) playerOpacity = 1;

        var minimalistOffsetX = 0;
        var minimalistOffsetY = 0;
        if (minimalistEnabled && minimalistClassActive) {
            var loX = (cfg && cfg.MINIMALIST_HEALTHBAR_X_OFFSET !== undefined && cfg.MINIMALIST_HEALTHBAR_X_OFFSET !== null)
                ? Math.round(Number(cfg.MINIMALIST_HEALTHBAR_X_OFFSET)) : 0;
            var loY = (cfg && cfg.MINIMALIST_HEALTHBAR_Y_OFFSET !== undefined && cfg.MINIMALIST_HEALTHBAR_Y_OFFSET !== null)
                ? Math.round(Number(cfg.MINIMALIST_HEALTHBAR_Y_OFFSET)) : 0;
            if (!isFinite(loX)) loX = 0;
            if (!isFinite(loY)) loY = 0;
            if (loX < -300) loX = -300;
            if (loX > 300) loX = 300;
            if (loY < -300) loY = -300;
            if (loY > 300) loY = 300;
            minimalistOffsetX = loX;
            minimalistOffsetY = -loY;
        }

        var finalOffsetX = playerOffsetX + minimalistOffsetX;
        var finalOffsetY = (-playerOffsetY) + minimalistOffsetY;
        var finalScale = playerScale / 100;
        // Inline ui-scale replaces CSS rather than multiplying it. Preserve
        // the native baseline and its aspect-ratio override (source styles).
        var basePct = 120;
        var scaleRoot = Panel.findHud();
        if (scaleRoot && scaleRoot.BHasClass("support_16_10_active")) basePct = 104;
        if (scaleRoot && scaleRoot.BHasClass("minecraft_healthbar_active")) basePct = 130;
        if (scaleRoot && scaleRoot.BHasClass("fg_healthbar_active")) basePct = 120;
        if (scaleRoot && scaleRoot.BHasClass("support_16_10_active")) {
            if (scaleRoot.BHasClass("klutz_healthbar_active")) basePct = 125;
            if (scaleRoot.BHasClass("minimalist_healthbar_active") && scaleRoot.BHasClass("AspectRatio16x10")) basePct = 110;
        }
        var scaleText = Math.round(basePct * playerScale / 100) + "%";
        var opacityText = playerOpacity.toFixed(2);
        var scaleActive = Math.abs(finalScale - 1.0) > 0.0001;
        var opacityActive = Math.abs(playerOpacity - 1.0) > 0.0001;

        return {
            finalOffsetX: finalOffsetX, finalOffsetY: finalOffsetY,
            finalScale: finalScale, scaleText: scaleText,
            opacityText: opacityText, playerOpacity: playerOpacity,
            scaleActive: scaleActive, opacityActive: opacityActive,
            scaleOpacityActive: scaleActive || opacityActive
        };
    };

    // -- Shared style application --

    // Release defaults so native CSS transitions and aspect-ratio scales return.
    QOL.healthbar.applyPlayerStyleToPanel = function(panel, runtimeState, includeOffsets, geometry) {
        if (!panel || !panel.style || !runtimeState) return;
        for (var owner of scaleOwners.keys()) if (!Panel.isAlive(owner)) scaleOwners.delete(owner);
        for (var positionOwner of positionOwners) if (!Panel.isAlive(positionOwner)) positionOwners.delete(positionOwner);
        var applyOffsets = (includeOffsets !== false);
        if (applyOffsets) {
            if (runtimeState.finalOffsetX !== 0 || runtimeState.finalOffsetY !== 0) {
                var x = String(runtimeState.finalOffsetX) + "px";
                var y = String(runtimeState.finalOffsetY) + "px";
                if (panel.style.x !== x) panel.style.x = x;
                if (panel.style.y !== y) panel.style.y = y;
                positionOwners.add(panel);
            } else QOL.healthbar.resetMinimalistOffsetRuntime(panel);
        }
        clearStyle(panel, "preTransformScale2d");
        geometry = geometry || QOL.healthbar.playerScaleGeometry(panel);
        var target = geometry.target;
        var previous = scaleOwners.get(panel);
        if (previous && previous !== target) clearScaleOwner(panel);
        if (Panel.isAlive(target)) {
            clearStyle(panel, "uiScale");
            if (runtimeState.scaleActive && geometry.width > 0 && geometry.height > 0) {
                // Percentage-sized children and fixed-size number groups must
                // share one unchanged logical canvas when ui-scale relayouts.
                var width = geometry.width + "px";
                var height = geometry.height + "px";
                var text = Math.round(runtimeState.finalScale * 100) + "%";
                if (target.style.width !== width) target.style.width = width;
                if (target.style.height !== height) target.style.height = height;
                if (target.style.uiScale !== text) target.style.uiScale = text;
                scaleOwners.set(panel, target);
            } else clearScaleOwner(panel);
        } else {
            // Compatibility with a health layout loaded before the new XML.
            if (runtimeState.scaleActive) panel.style.uiScale = runtimeState.scaleText;
            else clearStyle(panel, "uiScale");
        }
        if (runtimeState.opacityActive) panel.style.opacity = runtimeState.opacityText;
        else clearStyle(panel, "opacity");
    };
})();
