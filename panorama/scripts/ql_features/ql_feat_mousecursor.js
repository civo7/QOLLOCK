// ql_feat_mousecursor.js — Custom gameplay mouse cursor
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
    var GAMEPLAY_MOUSE_CURSOR_ENABLED = typeof QOL_GAMEPLAY_MOUSE_CURSOR_ENABLED !== "undefined" ? QOL_GAMEPLAY_MOUSE_CURSOR_ENABLED : true;
    var GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH = typeof QOL_GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH !== "undefined" ? QOL_GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH : "s2r://panorama/images/hud/abilities/punkgoat/goat_sigilslam_psd.vtex";
    var GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH_FALLBACK = typeof QOL_GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH_FALLBACK !== "undefined" ? QOL_GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH_FALLBACK : "s2r://panorama/images/hud/abilities/punkgoat/goat_sigilslam_psd.vtex_c";
    var GAMEPLAY_MOUSE_CURSOR_HALF_PX = typeof QOL_GAMEPLAY_MOUSE_CURSOR_HALF_PX !== "undefined" ? QOL_GAMEPLAY_MOUSE_CURSOR_HALF_PX : 27;
    var IsStartupLoaderInActiveMatchContext = typeof QOL_IsStartupLoaderInActiveMatchContext !== "undefined" ? QOL_IsStartupLoaderInActiveMatchContext : function() { return false; };
    var IsHudClassActive = typeof QOL_IsHudClassActive !== "undefined" ? QOL_IsHudClassActive : function() { return false; };
    var IsPanelVisibleMaybe = typeof QOL_IsPanelVisibleMaybe !== "undefined" ? QOL_IsPanelVisibleMaybe : function() { return false; };
    var TryGetGameplayMouseCursorPosition = typeof QOL_TryGetGameplayMouseCursorPosition !== "undefined" ? QOL_TryGetGameplayMouseCursorPosition : function() { return null; };

    // One-shot dependency validation
    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_mousecursor";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_GetCachedPanel === "undefined") _m.push("QOL_GetCachedPanel");
        if (typeof QOL_SetCachedPanel === "undefined") _m.push("QOL_SetCachedPanel");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing bridge globals: " + _m.join(", ") + " - feature may not work");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }
    function SetGameplayMouseCursorRootClass(root, active) {
        var on = !!active;
        if (!!S.customMouseCursorClassActive === on) return;
        if (root && root.SetHasClass) {
            try { root.SetHasClass("qol_custom_cursor_replace_active", on); } catch (e0) {}
        }
        S.customMouseCursorClassActive = on;
    }

    function EnsureGameplayMouseCursorPanel(root) {
        if (!root) return null;
        var panel = IsPanelValid(S.customMouseCursorPanel) ? S.customMouseCursorPanel : null;
        if (!panel) {
            panel = root.FindChildTraverse ? root.FindChildTraverse("QOLGameplayMouseCursor") : null;
            if (!panel) {
                try {
                    panel = $.CreatePanel("Panel", root, "QOLGameplayMouseCursor");
                    if (panel) panel.AddClass("QOLGameplayMouseCursor");
                } catch (e0) {
                    panel = null;
                }
            }
            S.customMouseCursorPanel = panel || null;
        }
        if (!panel) return null;
        try { panel.hittest = false; } catch (ePanelA) {}
        try { panel.hittestchildren = false; } catch (ePanelB) {}

        var image = IsPanelValid(S.customMouseCursorImage) ? S.customMouseCursorImage : null;
        if (!image || (panel && image.GetParent && image.GetParent() !== panel)) {
            image = panel.FindChildTraverse ? panel.FindChildTraverse("QOLGameplayMouseCursorImage") : null;
            if (!image) {
                try {
                    image = $.CreatePanel("Image", panel, "QOLGameplayMouseCursorImage");
                    if (image) image.AddClass("QOLGameplayMouseCursorImage");
                } catch (e1) {
                    image = null;
                }
            }
            S.customMouseCursorImage = image || null;
            S.customMouseCursorImageBound = false;
        }
        if (image && !S.customMouseCursorImageBound) {
            try {
                image.SetImage(GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH);
                S.customMouseCursorImageBound = true;
            } catch (e2) {
                try {
                    image.SetImage(GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH_FALLBACK);
                    S.customMouseCursorImageBound = true;
                } catch (e3) {
                    S.customMouseCursorImageBound = false;
                }
            }
        }
        return panel;
    }

    function HideGameplayMouseCursor(root) {
        SetGameplayMouseCursorRootClass(root, false);
        var panel = IsPanelValid(S.customMouseCursorPanel) ? S.customMouseCursorPanel : null;
        if (panel) {
            try {
                if (panel.style.visibility !== "collapse") panel.style.visibility = "collapse";
            } catch (e0) {}
        }
        S.customMouseCursorLastX = null;
        S.customMouseCursorLastY = null;
    }

    function IsGameplayMouseCursorContextActive(root, hideoutConnected) {
        if (!GAMEPLAY_MOUSE_CURSOR_ENABLED || !root || hideoutConnected) return false;
        if (!IsStartupLoaderInActiveMatchContext(root)) return false;
        if (IsHudClassActive(root, "gShopOpen")) return true;
        if (IsHudClassActive(root, "gScoreboardOpen")) return true;
        if (IsHudClassActive(root, "gAbilityUpgradeMenu")) return true;
        if (IsHudClassActive(root, "gDetailView")) return true;
        var escapeMenu = root.FindChildTraverse ? root.FindChildTraverse("EscapeMenu") : null;
        if (escapeMenu && IsPanelVisibleMaybe(escapeMenu)) return true;
        return false;
    }

    function UpdateGameplayMouseCursor(root, nowMsLoop, hideoutConnected) {
        if (!GAMEPLAY_MOUSE_CURSOR_ENABLED || !root) return;
        if (!IsGameplayMouseCursorContextActive(root, hideoutConnected)) {
            HideGameplayMouseCursor(root);
            return;
        }
        var pos = TryGetGameplayMouseCursorPosition();
        if (!pos) {
            HideGameplayMouseCursor(root);
            return;
        }
        var panel = EnsureGameplayMouseCursorPanel(root);
        if (!panel) return;

        var x = Math.round(pos.x - GAMEPLAY_MOUSE_CURSOR_HALF_PX);
        var y = Math.round(pos.y - GAMEPLAY_MOUSE_CURSOR_HALF_PX);
        if (S.customMouseCursorLastX !== x) {
            panel.style.x = x + "px";
            S.customMouseCursorLastX = x;
        }
        if (S.customMouseCursorLastY !== y) {
            panel.style.y = y + "px";
            S.customMouseCursorLastY = y;
        }
        if (panel.style.visibility !== "visible") panel.style.visibility = "visible";
        SetGameplayMouseCursorRootClass(root, true);
    }

    // ── Registration ──
    QOL_REGISTER_FEATURE("gameplayMouseCursor", {
        configKeys: [],
        bucket: 7, phase: -1,
        gate: function(cfg) { return true; },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateGameplayMouseCursor(root, nowMs, hideoutConnected);
        },
        stateKeys: ["customMouseCursorLastX",
                    "customMouseCursorLastY",
                    "customMouseCursorPanel",
                    "customMouseCursorImage",
                    "customMouseCursorImageBound",
                    "customMouseCursorClassActive"]
    });

})();
