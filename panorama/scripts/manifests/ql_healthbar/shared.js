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

    function clearStyle(panel, prop) {
        var Utils = QOL.utils;
        if (Utils && Utils.ClearStyleSafe) { Utils.ClearStyleSafe(panel, prop); return; }
        try { delete panel.style[prop]; } catch(e0) {}
        try { panel.style[prop] = ""; } catch(e1) {}
    }

    QOL.healthbar.resetMinimalistOffsetRuntime = function(panel) {
        if (!panel || !panel.style) return;
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
        // ui-scale is vector, pre-transform-scale2d is raster, so every scale in the
        // mod goes through ui-scale. But an inline ui-scale REPLACES the CSS one
        // rather than multiplying with it, and Panorama does not report a computed
        // value back, so the base has to be stated here and the slider applied on
        // top of it: base/hud.css:422 is 120%, and .support_16_10_active overrides it
        // to 104% (ql_feat_aspect_ratio.css:179). At slider 100 nothing is written.
        var uiScaleBasePct = 120;
        var scaleRoot = (typeof QOL.getUIRoot === "function") ? QOL.getUIRoot() : null;
        if (scaleRoot && scaleRoot.BHasClass && scaleRoot.BHasClass("support_16_10_active")) {
            uiScaleBasePct = 104;
        }
        var scaleText = Math.round(uiScaleBasePct * playerScale / 100) + "%";
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

    // Anything sitting at its default is cleared rather than written, so the CSS
    // value and its transitions come back. pre-transform-scale2d is cleared, never
    // set — it is raster where ui-scale is vector.
    QOL.healthbar.applyPlayerStyleToPanel = function(panel, runtimeState, includeOffsets) {
        if (!panel || !panel.style || !runtimeState) return;
        var applyOffsets = (includeOffsets !== false);
        if (applyOffsets) {
            if (runtimeState.finalOffsetX !== 0) panel.style.x = String(runtimeState.finalOffsetX) + "px";
            else clearStyle(panel, "x");
            if (runtimeState.finalOffsetY !== 0) panel.style.y = String(runtimeState.finalOffsetY) + "px";
            else clearStyle(panel, "y");
        }
        clearStyle(panel, "preTransformScale2d");
        if (runtimeState.scaleActive) panel.style.uiScale = runtimeState.scaleText;
        else clearStyle(panel, "uiScale");
        if (runtimeState.opacityActive) panel.style.opacity = runtimeState.opacityText;
        else clearStyle(panel, "opacity");
    };
})();
