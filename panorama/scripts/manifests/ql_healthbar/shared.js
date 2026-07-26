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

    QOL.healthbar.resetMinimalistOffsetRuntime = function(panel) {
        if (!panel || !panel.style) return;
        try { panel.style.x = "0px"; } catch(e0) {}
        try { panel.style.y = "0px"; } catch(e00) {}
    };

    QOL.healthbar.resetPlayerScaleOpacity = function(panel) {
        if (!panel || !panel.style) return;
        try { panel.style.preTransformScale2d = "1.00, 1.00"; } catch(e0) {}
        try { panel.style.opacity = "1.00"; } catch(e1) {}
    };

    QOL.healthbar.resetPlayerStyle = function(panel) {
        QOL.healthbar.resetMinimalistOffsetRuntime(panel);
        QOL.healthbar.resetPlayerScaleOpacity(panel);
    };

    QOL.healthbar.resetMinimalistOffsetRuntimeAll = function(root, currentPanel, previousPanel) {
        var Utils = QOL.utils;
        var GetCachedPanel = QOL.getCachedPanel;
        var GetUIRoot = QOL.getUIRoot;
        var PushUnique = Utils ? Utils.PushUnique : function(arr, val) { if (arr.indexOf(val) === -1) arr.push(val); };

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
        var scaleText = finalScale.toFixed(2) + ", " + finalScale.toFixed(2);
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

    QOL.healthbar.applyPlayerStyleToPanel = function(panel, runtimeState, includeOffsets) {
        if (!panel || !panel.style || !runtimeState) return;
        var applyOffsets = (includeOffsets !== false);
        if (applyOffsets) {
            panel.style.x = String(runtimeState.finalOffsetX) + "px";
            panel.style.y = String(runtimeState.finalOffsetY) + "px";
        }
        panel.style.preTransformScale2d = runtimeState.scaleText;
        panel.style.opacity = runtimeState.opacityText;
    };
})();
