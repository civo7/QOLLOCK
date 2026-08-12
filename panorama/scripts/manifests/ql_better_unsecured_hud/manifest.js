// features/ql_better_unsecured_hud/manifest.js
// =============================================================================
// QOLLOCK — Unsecured Plus
// =============================================================================
// Moves/scales Valve's live Unsecured panel.  The panel is temporarily moved
// under gameplay_hud so its coordinates are not constrained by the native
// currency container's flow/clipping.  No value mirror is created.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_better_unsecured_hud: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_better_unsecured_hud",
        enableKey: "ENABLE_BETTER_UNSECURED",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_BETTER_UNSECURED", type: "toggle", default: false },
            { key: "UNSECURED_SOULS_HUD_SCALE", type: "slider", min: 50, max: 200, default: 100 },
            { key: "UNSECURED_SOULS_HUD_X_OFFSET", type: "slider", min: -1000, max: 2000, default: 120 },
            { key: "UNSECURED_SOULS_HUD_Y_OFFSET", type: "slider", min: 800, max: 2000, default: 925 },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON", type: "toggle", default: false },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_TEXT", type: "toggle", default: false },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var _runtime = {
                panel: null,
                host: null,
                originalParent: null,
                originalPreviousSibling: null,
                originalNextSibling: null,
                originalStyle: null,
                lastSig: ""
            };
            var _touchedStyleNames = [
                "horizontalAlign", "verticalAlign", "ignoreParentFlow",
                "marginLeft", "marginRight", "marginTop", "marginBottom",
                "x", "y", "uiScale", "zIndex"
            ];

            function _isPanelValid(panel) {
                try { return !!(QOL.utils && QOL.utils.IsPanelValid && QOL.utils.IsPanelValid(panel)); } catch(e) {}
                return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
            }

            function _isDescendantOf(panel, ancestor) {
                if (!_isPanelValid(panel) || !_isPanelValid(ancestor)) return false;
                var current = panel;
                var guard = 0;
                while (current && guard < 96) {
                    if (current === ancestor) return true;
                    current = current.GetParent ? current.GetParent() : null;
                    guard++;
                }
                return false;
            }

            function _clamp(val, def, min, max) {
                var value = Number(val);
                if (!isFinite(value)) value = def;
                value = Math.round(value);
                if (value < min) value = min;
                if (value > max) value = max;
                return value;
            }

            function _getGameplayHud(root) {
                try {
                    if (QOL.getGameplayHudPanel) {
                        var delegated = QOL.getGameplayHudPanel(root);
                        if (_isPanelValid(delegated)) return delegated;
                    }
                } catch(e) {}
                if (!root || !root.FindChildTraverse) return null;
                var hud = root.FindChildTraverse("gameplay_hud");
                return _isPanelValid(hud) ? hud : null;
            }

            function _findLivePanel(root, host) {
                if (_isPanelValid(_runtime.panel) && _runtime.host === host && _isDescendantOf(_runtime.panel, host)) {
                    return _runtime.panel;
                }
                var searchRoot = _isPanelValid(host) ? host : root;
                if (!searchRoot || !searchRoot.FindChildTraverse) return null;

                var panel = searchRoot.FindChildTraverse("HudUnsecuredLabelContainer");
                if (_isPanelValid(panel)) return panel;

                var label = searchRoot.FindChildTraverse("HudUnsecuredLabel");
                if (!_isPanelValid(label)) label = searchRoot.FindChildTraverse("hudUnsecuredLabel");
                if (_isPanelValid(label) && label.GetParent) {
                    panel = label.GetParent();
                    if (_isPanelValid(panel)) return panel;
                }
                return null;
            }

            function _captureStyle(panel) {
                var values = {};
                for (var i = 0; i < _touchedStyleNames.length; i++) {
                    var name = _touchedStyleNames[i];
                    try { values[name] = panel.style[name]; } catch(e) { values[name] = ""; }
                }
                return values;
            }

            function _restoreStyle(panel, values) {
                if (!_isPanelValid(panel) || !values) return;
                for (var i = 0; i < _touchedStyleNames.length; i++) {
                    var name = _touchedStyleNames[i];
                    try { panel.style[name] = values[name] == null ? "" : values[name]; } catch(e) {}
                }
            }

            function _captureSiblings(panel, parent) {
                var result = { previous: null, next: null };
                if (!parent || !parent.GetChildCount || !parent.GetChild) return result;
                var count = Number(parent.GetChildCount()) || 0;
                for (var i = 0; i < count; i++) {
                    if (parent.GetChild(i) !== panel) continue;
                    if (i > 0) result.previous = parent.GetChild(i - 1);
                    if (i + 1 < count) result.next = parent.GetChild(i + 1);
                    break;
                }
                return result;
            }

            function _clearRuntime() {
                _runtime.panel = null;
                _runtime.host = null;
                _runtime.originalParent = null;
                _runtime.originalPreviousSibling = null;
                _runtime.originalNextSibling = null;
                _runtime.originalStyle = null;
                _runtime.lastSig = "";
            }

            function _restoreNativePanel() {
                var panel = _runtime.panel;
                var parent = _runtime.originalParent;
                if (_isPanelValid(panel)) {
                    if (_isPanelValid(parent) && panel.GetParent && panel.GetParent() !== parent && panel.SetParent) {
                        try { panel.SetParent(parent); } catch(e) {}
                    }
                    if (_isPanelValid(parent) && panel.GetParent && panel.GetParent() === parent) {
                        var next = _runtime.originalNextSibling;
                        var previous = _runtime.originalPreviousSibling;
                        if (_isPanelValid(next) && next.GetParent && next.GetParent() === parent && parent.MoveChildBefore) {
                            try { parent.MoveChildBefore(panel, next); } catch(e0) {}
                        } else if (_isPanelValid(previous) && previous.GetParent && previous.GetParent() === parent && parent.MoveChildAfter) {
                            try { parent.MoveChildAfter(panel, previous); } catch(e1) {}
                        }
                    }
                    _restoreStyle(panel, _runtime.originalStyle);
                }
                _clearRuntime();
            }

            function _moveNativePanel(panel, host) {
                if (!_isPanelValid(panel) || !_isPanelValid(host) || !panel.GetParent || !panel.SetParent) return false;
                if (_runtime.panel === panel && _runtime.host === host && panel.GetParent() === host) return true;

                _restoreNativePanel();

                var originalParent = panel.GetParent();
                if (!_isPanelValid(originalParent)) return false;
                var siblings = _captureSiblings(panel, originalParent);
                var originalStyle = _captureStyle(panel);
                try { panel.SetParent(host); } catch(e) { return false; }
                if (panel.GetParent && panel.GetParent() !== host) return false;

                _runtime.panel = panel;
                _runtime.host = host;
                _runtime.originalParent = originalParent;
                _runtime.originalPreviousSibling = siblings.previous;
                _runtime.originalNextSibling = siblings.next;
                _runtime.originalStyle = originalStyle;
                _runtime.lastSig = "";

                if (host.MoveChildAfter && host.GetChildCount && host.GetChild) {
                    var count = Number(host.GetChildCount()) || 0;
                    if (count > 0) {
                        var last = host.GetChild(count - 1);
                        if (last && last !== panel) {
                            try { host.MoveChildAfter(panel, last); } catch(e0) {}
                        }
                    }
                }
                return true;
            }

            function _removeLegacyMirror(root) {
                var mirror = root && root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
                if (_isPanelValid(mirror)) mirror.DeleteAsync(0);
                if (root && root.SetHasClass) root.SetHasClass("better_unsecured_ready", false);
            }

            function _applyLayout(panel, cfg) {
                var scale = _clamp(cfg.UNSECURED_SOULS_HUD_SCALE, 100, 50, 200);
                var xOffset = _clamp(cfg.UNSECURED_SOULS_HUD_X_OFFSET, 120, -1000, 2000);
                var yOffset = _clamp(cfg.UNSECURED_SOULS_HUD_Y_OFFSET, 925, 800, 2000);
                var sig = String(scale) + "|" + String(xOffset) + "|" + String(yOffset);
                if (sig === _runtime.lastSig) return;

                // These settings are screen-space coordinates.  Keeping the
                // live panel under gameplay_hud avoids native parent clipping.
                panel.style.ignoreParentFlow = "true";
                panel.style.horizontalAlign = "left";
                panel.style.verticalAlign = "top";
                panel.style.marginLeft = "0px";
                panel.style.marginRight = "0px";
                panel.style.marginTop = "0px";
                panel.style.marginBottom = "0px";
                panel.style.x = xOffset + "px";
                panel.style.y = yOffset + "px";
                panel.style.uiScale = scale + "%";
                panel.style.zIndex = "50";
                _runtime.lastSig = sig;
            }

            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!_isPanelValid(root)) return;
                    var cfg = ctx.config.all();
                    var enabled = Number(cfg.ENABLE_BETTER_UNSECURED) === 1;

                    _removeLegacyMirror(root);
                    if (!enabled) {
                        _restoreNativePanel();
                        return;
                    }

                    var host = _getGameplayHud(root);
                    if (!_isPanelValid(host)) {
                        _restoreNativePanel();
                        return;
                    }

                    if (_runtime.panel && (!_isPanelValid(_runtime.panel) || _runtime.host !== host || !_isDescendantOf(_runtime.panel, host))) {
                        _restoreNativePanel();
                    }

                    var panel = _findLivePanel(root, host);
                    if (!_isPanelValid(panel)) return;
                    if (!_moveNativePanel(panel, host)) return;
                    _applyLayout(panel, cfg);
                } catch(e) {
                    logger.logError("ql_better_unsecured_hud", "_tick threw: " + (e.message || e));
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_better_unsecured_hud") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_better_unsecured_hud");
                    logger.clearThrottle("ql_better_unsecured_hud");
                    var root = $.GetContextPanel();
                    if (_isPanelValid(root)) _removeLegacyMirror(root);
                    _restoreNativePanel();
                },
                onSettingsChanged: function() {
                    _runtime.lastSig = "";
                    _tick();
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var hud = root ? root.FindChildTraverse("gameplay_hud") : null;
                if (!hud) return null;
                return { passed: true, name: "Gameplay HUD exists for Unsecured Plus", message: "", assertions: [{ passed: true, name: "gameplay_hud panel exists" }] };
            } catch(e) { return { passed: false, name: "Unsecured Plus check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
