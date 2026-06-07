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
    var IsStartupLoaderInActiveMatchContext = typeof QOL_IsStartupLoaderInActiveMatchContext !== "undefined" ? QOL_IsStartupLoaderInActiveMatchContext : function() { return false; };

    function SetGameplayMouseCursorRootClass(root, active) {
        var on = !!active;
        if (!!State.customMouseCursorClassActive === on) return;
        if (root && root.SetHasClass) {
            try { root.SetHasClass("qol_custom_cursor_replace_active", on); } catch (e0) {}
        }
        State.customMouseCursorClassActive = on;
    }

    function EnsureGameplayMouseCursorPanel(root) {
        if (!root) return null;
        var panel = IsPanelValid(State.customMouseCursorPanel) ? State.customMouseCursorPanel : null;
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
            State.customMouseCursorPanel = panel || null;
        }
        if (!panel) return null;
        try { panel.hittest = false; } catch (ePanelA) {}
        try { panel.hittestchildren = false; } catch (ePanelB) {}

        var image = IsPanelValid(State.customMouseCursorImage) ? State.customMouseCursorImage : null;
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
            State.customMouseCursorImage = image || null;
            State.customMouseCursorImageBound = false;
        }
        if (image && !State.customMouseCursorImageBound) {
            try {
                image.SetImage(GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH);
                State.customMouseCursorImageBound = true;
            } catch (e2) {
                try {
                    image.SetImage(GAMEPLAY_MOUSE_CURSOR_IMAGE_PATH_FALLBACK);
                    State.customMouseCursorImageBound = true;
                } catch (e3) {
                    State.customMouseCursorImageBound = false;
                }
            }
        }
        return panel;
    }

    function HideGameplayMouseCursor(root) {
        SetGameplayMouseCursorRootClass(root, false);
        var panel = IsPanelValid(State.customMouseCursorPanel) ? State.customMouseCursorPanel : null;
        if (panel) {
            try {
                if (panel.style.visibility !== "collapse") panel.style.visibility = "collapse";
            } catch (e0) {}
        }
        State.customMouseCursorLastX = null;
        State.customMouseCursorLastY = null;
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
        if (State.customMouseCursorLastX !== x) {
            panel.style.x = x + "px";
            State.customMouseCursorLastX = x;
        }
        if (State.customMouseCursorLastY !== y) {
            panel.style.y = y + "px";
            State.customMouseCursorLastY = y;
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
