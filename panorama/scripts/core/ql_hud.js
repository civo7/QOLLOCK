// =============================================================================
// QOLLOCK — core/ql_hud.js
// =============================================================================
// OWNS:        Deadlock HUD lookups: findHud, isInHideout, isStreetBrawl.
// DOES NOT OWN: Pure DOM panel manipulation (core/ql_panel_helpers.js),
//               Feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js
// USED BY:     Feature manifests, core/ql_app.js
// LOAD ORDER:  6th — after ql_panel_helpers.js
// =============================================================================

(function () {
    "use strict";

    var Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q || !Q.core) {
        $.Msg("[QOLLock] core/ql_hud: QOL.core not found — aborting.");
        return;
    }

    var _panelHelpers = Q.core.panel || Q.ui.PanelHelpers || {};
    var isAlive = _panelHelpers.isPanelAlive || _panelHelpers.isAlive || function (p) {
        return !!(p && typeof p.IsValid === "function" && p.IsValid());
    };

    var _cachedHud = null;

    /**
     * Finds the primary Deadlock #Hud panel with caching.
     */
    function findHud() {
        if (isAlive(_cachedHud)) return _cachedHud;
        _cachedHud = null;

        var MAX_DEPTH = 64;
        try {
            var ctx = $.GetContextPanel();
            if (!isAlive(ctx)) return null;
            if (ctx.id === "Hud") { _cachedHud = ctx; return ctx; }

            var hud = ctx.FindChildTraverse("Hud");
            if (isAlive(hud)) { _cachedHud = hud; return hud; }

            var absRoot = ctx;
            var depth = 0;
            while (depth < MAX_DEPTH) {
                var parent = absRoot.GetParent();
                if (!parent || !isAlive(parent)) break;
                absRoot = parent;
                depth++;
            }
            hud = absRoot.FindChildTraverse("Hud");
            if (isAlive(hud)) { _cachedHud = hud; return hud; }
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Whether the player is in hideout / sandbox / hero testing mode.
     */
    function isInHideout(root) {
        try {
            var hud = findHud();
            if (isAlive(hud) && (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout"))) {
                return true;
            }
            if (isAlive(root) && (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout"))) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    /**
     * Whether the match is in street brawl mode.
     */
    function isStreetBrawl(root) {
        try {
            var hud = findHud();
            if (isAlive(hud)) {
                if (hud.BHasClass("gamemode_streetbrawl")
                    || hud.BHasClass("StreetBrawlInterstitial")
                    || hud.BHasClass("StreetBrawlBuyPhase")
                    || hud.BHasClass("GameMode_StreetBrawl")) {
                    return true;
                }
                var sb = hud.FindChildTraverse("StretBrawlContainer");
                if (isAlive(sb) && (sb.visible || (sb.BHasClass && sb.BHasClass("visible")) || (sb.style && sb.style.visibility === "visible"))) {
                    return true;
                }
                var topBar = hud.FindChildTraverse("TopBar");
                if (isAlive(topBar) && (topBar.BHasClass("gamemode_streetbrawl")
                    || topBar.BHasClass("StreetBrawlInterstitial")
                    || topBar.BHasClass("StreetBrawlBuyPhase"))) {
                    return true;
                }
            }
            if (isAlive(root)) {
                if (root.BHasClass("gamemode_streetbrawl")
                    || root.BHasClass("StreetBrawlInterstitial")
                    || root.BHasClass("StreetBrawlBuyPhase")
                    || root.BHasClass("GameMode_StreetBrawl")) {
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    // Attach to namespace
    Q.core.hud = {
        findHud: findHud,
        isInHideout: isInHideout,
        isStreetBrawl: isStreetBrawl
    };

    // Backward compat: alias on PanelHelpers if not already present
    if (Q.ui && Q.ui.PanelHelpers) {
        Q.ui.PanelHelpers.findHud = findHud;
    }
    if (Q.core.panel) {
        Q.core.panel.findHud = findHud;
    }

    $.Msg("[QOLLock] core/ql_hud: attached to QOL.core.hud");
})();
