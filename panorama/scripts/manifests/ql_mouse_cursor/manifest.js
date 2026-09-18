// features/ql_mouse_cursor/manifest.js
// =============================================================================
// QOLLOCK — Custom Gameplay Mouse Cursor
// =============================================================================
// OWNS:        Custom mouse cursor image overlay, position tracking,
//              visibility tied to shop/scoreboard/escape-menu context
// DOES NOT OWN: Cursor input (read from game), image assets
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: none (always-on gate)
// PATTERN:     Polling (~20Hz). Creates Image panel on Hud root.
//              Tracks cursor position, shows in UI contexts (shop, scoreboard,
//              escape menu, ability upgrade, detail view).
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] mouse_cursor: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_mouse_cursor",
        enabledByDefault: false,  // disabled by default — perf: avg 1.34ms/tick, 20x next most expensive feature
        settings: [],
        create: function(ctx) {
            var _loop = null;
            var CURSOR_HALF_PX = 27;
            var IMAGE_PATH = "s2r://panorama/images/hud/abilities/punkgoat/goat_sigilslam_psd.vtex";

            // Local state
            var _cursorPanel = null;
            var _cursorImage = null;
            var _imageBound = false;
            var _classActive = false;
            var _lastX = null;
            var _lastY = null;

            var _alive = QOL.utils.IsPanelValid;

            function _hasClass(root, name) {
                if (!root || !root.BHasClass) return false;
                try { return root.BHasClass(name); } catch(e) { return false; }
            }

            function _visibleMaybe(panel) {
                if (!_alive(panel)) return false;
                try {
                    if (panel.visible === false) return false;
                    if (panel.style && panel.style.visibility === "collapse") return false;
                } catch(e) {}
                return true;
            }

            function _isInMatch(root) {
                if (!root) return false;
                try {
                    var loader = root.FindChildTraverse ? root.FindChildTraverse("StartupLoader") : null;
                    if (!loader || !loader.BHasClass) return true;
                    return !loader.BHasClass("Active");
                } catch(e) { return true; }
            }

            function _inHideout(root) {
                if (typeof QOL !== "undefined" && QOL.core?.hud?.isInHideout) {
                    return QOL.core.hud.isInHideout(root);
                }
                if (!root || !root.BHasClass) return false;
                try {
                    var _hud = (QOL.core?.panel?.findHud) ? QOL.core.panel.findHud(root) : (root.FindChildTraverse ? root.FindChildTraverse("Hud") : null);
                    if (_hud && _hud.BHasClass && (_hud.BHasClass("connectedToHideout") || _hud.BHasClass("InHideout"))) return true;
                    if (root.BHasClass && (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout"))) return true;
                } catch(e) { return false; }
                return false;
            }

            function _getCursorPos() {
                try {
                    if (typeof GameUI !== "undefined" && GameUI.GetCursorPosition) {
                        var pos = GameUI.GetCursorPosition();
                        if (pos && typeof pos.x === "number" && typeof pos.y === "number") return pos;
                    }
                } catch(e) {}
                return null;
            }

            function _ensurePanel(root) {
                if (!root) return null;
                var panel = _alive(_cursorPanel) ? _cursorPanel : null;
                if (!panel) {
                    panel = root.FindChildTraverse ? root.FindChildTraverse("QOLGameplayMouseCursor") : null;
                    if (!panel) {
                        try {
                            panel = $.CreatePanel("Panel", root, "QOLGameplayMouseCursor");
                            if (panel) panel.AddClass("QOLGameplayMouseCursor");
                        } catch(e) { panel = null; }
                    }
                    _cursorPanel = panel || null;
                }
                if (!panel) return null;
                try { panel.hittest = false; } catch(e) {}
                try { panel.hittestchildren = false; } catch(e) {}

                var image = _alive(_cursorImage) ? _cursorImage : null;
                if (!image || (panel && image.GetParent && image.GetParent() !== panel)) {
                    image = panel.FindChildTraverse ? panel.FindChildTraverse("QOLGameplayMouseCursorImage") : null;
                    if (!image) {
                        try {
                            image = $.CreatePanel("Image", panel, "QOLGameplayMouseCursorImage");
                            if (image) image.AddClass("QOLGameplayMouseCursorImage");
                        } catch(e) { image = null; }
                    }
                    _cursorImage = image || null;
                    _imageBound = false;
                }
                if (image && !_imageBound) {
                    try { image.SetImage(IMAGE_PATH); _imageBound = true; } catch(e) {
                        try { image.SetImage(IMAGE_PATH + "_c"); _imageBound = true; } catch(e2) { _imageBound = false; }
                    }
                }
                return panel;
            }

            function _hide(root) {
                if (root && root.SetHasClass) {
                    if (_classActive) { try { root.SetHasClass("qol_custom_cursor_replace_active", false); } catch(e) {} }
                    _classActive = false;
                }
                var panel = _alive(_cursorPanel) ? _cursorPanel : null;
                if (panel) {
                    try {
                        if (panel.SetHasClass) panel.SetHasClass("qol-hidden", true);
                        else panel.style.visibility = "collapse";
                    } catch(e) {}
                }
                _lastX = null; _lastY = null;
            }

            function _contextActive(root) {
                if (!root || _inHideout(root)) return false;
                if (!_isInMatch(root)) return false;
                if (_hasClass(root, "gShopOpen")) return true;
                if (_hasClass(root, "gScoreboardOpen")) return true;
                if (_hasClass(root, "gAbilityUpgradeMenu")) return true;
                if (_hasClass(root, "gDetailView")) return true;
                var esc = root.FindChildTraverse ? root.FindChildTraverse("EscapeMenu") : null;
                if (esc && _visibleMaybe(esc)) return true;
                return false;
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!_alive(root)) return;
                if (!_contextActive(root)) { _hide(root); return; }
                var pos = _getCursorPos();
                if (!pos) { _hide(root); return; }
                var panel = _ensurePanel(root);
                if (!panel) return;
                var x = Math.round(pos.x - CURSOR_HALF_PX);
                var y = Math.round(pos.y - CURSOR_HALF_PX);
                if (_lastX !== x) { panel.style.x = x + "px"; _lastX = x; }
                if (_lastY !== y) { panel.style.y = y + "px"; _lastY = y; }
                if (panel.SetHasClass) panel.SetHasClass("qol-hidden", false);
                else panel.style.visibility = "visible";
                if (root && root.SetHasClass && !_classActive) {
                    try { root.SetHasClass("qol_custom_cursor_replace_active", true); } catch(e) {}
                    _classActive = true;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    // rate-exempt: 20Hz (0.05s) required for tracking custom mouse cursor coordinates
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.05, "ql_mouse_cursor") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var root = $.GetContextPanel();
                    if (_alive(root) && root.SetHasClass) {
                        try { root.SetHasClass("qol_custom_cursor_replace_active", false); } catch(e) {}
                    }
                    _classActive = false;
                    if (_alive(_cursorPanel)) { try { _cursorPanel.DeleteAsync(0); } catch(e) {} }
                    _cursorPanel = null; _cursorImage = null; _imageBound = false; _lastX = null; _lastY = null;
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var loader = root ? root.FindChildTraverse("StartupLoader") : null;
            if (!loader) return null;  // Skip — not in a match context
            return { passed: true, name: "Startup loader panel exists", message: "", assertions: [{ passed: true, name: "StartupLoader panel exists" }] };
        } catch(e) { return { passed: false, name: "Mouse cursor panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();
