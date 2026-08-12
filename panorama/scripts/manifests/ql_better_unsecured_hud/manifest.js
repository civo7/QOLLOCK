// features/ql_better_unsecured_hud/manifest.js
// =============================================================================
// QOLLOCK — Unsecured Plus
// =============================================================================
// Moves/scales Valve's live Unsecured panel directly.  The previous mirrored
// panel approach was fragile: Panorama may retain an old HUD tree after a map
// transition, which let the mod hide the live counter while drawing elsewhere.
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
            var _runtime = { panel: null, isModern: false, lastSig: "" };

            function _isPanelValid(panel) {
                try { return !!(QOL.utils && QOL.utils.IsPanelValid && QOL.utils.IsPanelValid(panel)); } catch(e) {}
                return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
            }
            function _clamp(val, def, min, max) {
                var value = Number(val);
                if (!isFinite(value)) value = def;
                value = Math.round(value);
                if (value < min) value = min;
                if (value > max) value = max;
                return value;
            }
            function _findLivePanel(root) {
                if (!root || !root.FindChildTraverse) return null;

                // Current Deadlock HUD.  This is the same panel that displays
                // "94 UNSECURED" in Panorama Debugger.
                var modern = root.FindChildTraverse("HudUnsecuredLabelContainer");
                if (_isPanelValid(modern)) return { panel: modern, isModern: true };

                // Older HUD fallback.
                var label = root.FindChildTraverse("hudUnsecuredLabel");
                if (_isPanelValid(label) && label.GetParent) {
                    return { panel: label.GetParent(), isModern: false };
                }
                return null;
            }
            function _clearLegacyMirror(root) {
                // Remove copies left by builds prior to this direct-panel rewrite.
                var mirror = root && root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
                if (_isPanelValid(mirror)) mirror.DeleteAsync(0);
                if (root && root.SetHasClass) root.SetHasClass("better_unsecured_ready", false);
            }
            function _restoreNativePanel(root) {
                var found = _findLivePanel(root);
                if (!found || !_isPanelValid(found.panel)) return;
                var panel = found.panel;
                panel.style.marginLeft = "";
                panel.style.marginBottom = "";
                panel.style.uiScale = "";
                panel.style.visibility = "";
            }
            function _applyDirectLayout(root, cfg) {
                var found = _findLivePanel(root);
                if (!found || !_isPanelValid(found.panel)) {
                    _runtime.panel = null;
                    _runtime.lastSig = "";
                    return;
                }

                var scale = _clamp(cfg.UNSECURED_SOULS_HUD_SCALE, 100, 50, 200);
                var xOffset = _clamp(cfg.UNSECURED_SOULS_HUD_X_OFFSET, 120, -1000, 2000);
                var yOffset = _clamp(cfg.UNSECURED_SOULS_HUD_Y_OFFSET, 925, 800, 2000);
                var sig = String(scale) + "|" + String(xOffset) + "|" + String(yOffset) + "|" + (found.isModern ? "modern" : "legacy");
                var panel = found.panel;

                if (sig !== _runtime.lastSig || panel !== _runtime.panel) {
                    // Defaults are the old Plus zero point.  Thus existing
                    // presets retain their default location without hiding or
                    // recreating Valve's live counter.
                    panel.style.marginLeft = (xOffset - 120) + "px";
                    panel.style.marginBottom = (925 - yOffset) + "px";
                    panel.style.uiScale = scale + "%";
                    panel.style.visibility = "visible";
                    _runtime.panel = panel;
                    _runtime.isModern = found.isModern;
                    _runtime.lastSig = sig;
                }
            }
            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!_isPanelValid(root)) return;
                    var cfg = ctx.config.all();
                    var enabled = Number(cfg.ENABLE_BETTER_UNSECURED) === 1;

                    // Never let an old mirror hide the native panel.
                    _clearLegacyMirror(root);
                    if (!enabled) {
                        _restoreNativePanel(root);
                        _runtime.panel = null;
                        _runtime.lastSig = "";
                        return;
                    }
                    _applyDirectLayout(root, cfg);
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
                    if (_isPanelValid(root)) {
                        _clearLegacyMirror(root);
                        _restoreNativePanel(root);
                    }
                    _runtime.panel = null;
                    _runtime.lastSig = "";
                },
                onSettingsChanged: function() {}
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
