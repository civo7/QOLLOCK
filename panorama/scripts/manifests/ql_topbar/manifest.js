// features/ql_topbar/manifest.js
// =============================================================================
// QOLLOCK — Top Bar HUD (position, scale, opacity, visibility)
// =============================================================================
// OWNS:        Top bar panel: position, scale, opacity, visibility, HUD state
// DOES NOT OWN: Top bar content (scores, timers, player panels)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: HUD_TOP_BAR_ENABLED, TOP_BAR_OPACITY, TOP_BAR_SCALE,
//              TOP_BAR_X_OFFSET, TOP_BAR_Y_OFFSET
// PANEL ID:    TopBar
// PATTERN:     Polled at 0.5Hz — HUD visibility flips during match (spectating,
//              escape menu, hideout) require re-evaluation every tick.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] topbar: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_topbar",
        enabledByDefault: true,
        enableKey: "HUD_TOP_BAR_ENABLED",
        settings: [
            { key: "HUD_TOP_BAR_ENABLED", type: "toggle", default: true },
            { key: "ENABLE_OBJ_MAP", type: "toggle", default: false, label: "Objective Map", description: "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base." },
            { key: "ENABLE_MISSING_HERO", type: "toggle", default: false, label: "Missing Hero Opaque", description: "Greys out heros in the top bar when missing on the map." },
            { key: "ENABLE_OBJ_DMG", type: "toggle", default: false, label: "Objective Damage", description: "Shows the individual player's objective damage in the top bar." },
            { key: "DISABLE_PLAYER_NAME_BLUR", type: "toggle", invert: true, default: false, label: "Top Bar Background", description: "The world blur behind player names in the top bar." },
            {
                key: "ENABLE_TOPBAR_ENEMY_HP_WARNING",
                type: "multitoggle",
                label: "Enemy HP Warning",
                description: "Colored enemy top-bar health warnings when at significant thresholds.",
                options: [
                    { label: "25%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_25" },
                    { label: "65%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_65" },
                    { label: "75%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_75" }
                ]
            },
            {
                key: "ENABLE_TOPBAR_ALLY_HP_WARNING",
                type: "multitoggle",
                label: "Ally HP Warning",
                description: "Colored ally top-bar health warnings when at significant thresholds.",
                options: [
                    { label: "25%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_25" },
                    { label: "65%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_65" },
                    { label: "75%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_75" }
                ]
            },
            { key: "ENABLE_URN_DIFF", type: "toggle", default: false },
            { key: "TOP_BAR_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1.0 },
            { key: "TOP_BAR_SCALE", type: "slider", min: 0.5, max: 1.5, step: 0.05, default: 1.0 },
            { key: "TOP_BAR_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0 },
            { key: "TOP_BAR_Y_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";
            var _loop = null;

            function _clamp(v, lo, hi) {
                var n = Number(v);
                if (!isFinite(n)) return lo;
                if (n < lo) return lo;
                if (n > hi) return hi;
                return n;
            }

            function _clearStyle(panel, prop) {
                if (!panel || !panel.style || !prop) return;
                try { delete panel.style[prop]; } catch (e0) {}
                try { panel.style[prop] = null; } catch (e1) {}
                try { panel.style[prop] = ""; } catch (e2) {}
            }

            function _hasNonDefault(cfg) {
                if (!cfg) return false;
                var enabled = (cfg.HUD_TOP_BAR_ENABLED === undefined || cfg.HUD_TOP_BAR_ENABLED === true || Number(cfg.HUD_TOP_BAR_ENABLED) === 1);
                return !enabled ||
                    Number(cfg.TOP_BAR_OPACITY !== undefined ? cfg.TOP_BAR_OPACITY : 1.0) !== 1.0 ||
                    Number(cfg.TOP_BAR_SCALE !== undefined ? cfg.TOP_BAR_SCALE : 1.0) !== 1.0 ||
                    Number(cfg.TOP_BAR_X_OFFSET || 0) !== 0 ||
                    Number(cfg.TOP_BAR_Y_OFFSET || 0) !== 0;
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var topBar = root.FindChildTraverse("TopBar");
                if (!topBar) return;

                // Visibility gate: if the top bar is hidden in spectator/replay mode, don't apply styles.
                var hudVisible = true;
                try {
                    if (typeof QOL !== "undefined" && QOL.isHudVisibleForTopBarRuntime) {
                        hudVisible = QOL.isHudVisibleForTopBarRuntime(root, topBar);
                    }
                } catch(e) {}

                var active = _hasNonDefault(cfg);
                var enabled = (cfg.HUD_TOP_BAR_ENABLED === undefined || cfg.HUD_TOP_BAR_ENABLED === true || Number(cfg.HUD_TOP_BAR_ENABLED) === 1);
                var ox = Math.round(_clamp(active ? cfg.TOP_BAR_X_OFFSET : 0, -1500, 1500));
                var oy = Math.round(_clamp(active ? cfg.TOP_BAR_Y_OFFSET : 0, -500, 500));
                var opNum = active ? Number(cfg.TOP_BAR_OPACITY !== undefined ? cfg.TOP_BAR_OPACITY : 1.0) : 1.0;
                if (!isFinite(opNum)) opNum = 1.0;
                var scNum = active ? Number(cfg.TOP_BAR_SCALE !== undefined ? cfg.TOP_BAR_SCALE : 1.0) : 1.0;
                if (!isFinite(scNum)) scNum = 1.0;

                var op = opNum.toFixed(2);
                var sc = scNum.toFixed(2);

                if (topBar.SetHasClass) topBar.SetHasClass("qol-hidden", !enabled);

                var sig = ox + "|" + oy + "|" + op + "|" + sc + "|" + (enabled ? "1" : "0") + "|" + (hudVisible ? "1" : "0") + "|" + (active ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                if (enabled && active && hudVisible) {
                    if (ox !== 0) topBar.style.x = ox + "px";
                    else _clearStyle(topBar, "x");

                    if (oy !== 0) topBar.style.y = (-oy) + "px";
                    else _clearStyle(topBar, "y");

                    topBar.style.preTransformScale2d = "1.00, 1.00";
                    if (Math.abs(scNum - 1.0) > 0.0001) topBar.style.uiScale = Math.round(scNum * 100) + "%";
                    else _clearStyle(topBar, "uiScale");

                    if (Math.abs(opNum - 1.0) > 0.0001) {
                        try { topBar.style.opacity = op; } catch(e) {}
                    } else {
                        _clearStyle(topBar, "opacity");
                    }
                } else {
                    _clearStyle(topBar, "x");
                    _clearStyle(topBar, "y");
                    _clearStyle(topBar, "preTransformScale2d");
                    _clearStyle(topBar, "uiScale");
                    _clearStyle(topBar, "opacity");
                }
            }

            function _tick() {
                try { _apply(ctx.config.all()); } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_topbar", "_tick: " + (e.message || e));
                    }
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all());
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_topbar") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_topbar");
                    _lastSig = "";
                    var root = $.GetContextPanel ? $.GetContextPanel() : null;
                    var topBar = root ? root.FindChildTraverse("TopBar") : null;
                    if (topBar) {
                        var isSupposed = FR && FR.isFeatureSupposedToBeEnabled ? FR.isFeatureSupposedToBeEnabled("ql_topbar") : false;
                        if (topBar.SetHasClass) topBar.SetHasClass("qol-hidden", !isSupposed);
                        _clearStyle(topBar, "x");
                        _clearStyle(topBar, "y");
                        _clearStyle(topBar, "preTransformScale2d");
                        _clearStyle(topBar, "uiScale");
                        _clearStyle(topBar, "opacity");
                    }
                },
                onSettingsChanged: function() {
                    _apply(ctx.config.all());
                    var root = $.GetContextPanel ? $.GetContextPanel() : null;
                    if (root && QOL.core && QOL.core.hud && QOL.core.hud.applyRootClasses) {
                        QOL.core.hud.applyRootClasses(root, ctx.config.all(), Date.now ? Date.now() : (new Date()).getTime(), false);
                    }
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var panel = root ? root.FindChildTraverse("TopBar") : null;
                if (!panel) return null;  // Skip — not in a match context
                return { passed: true, name: "Top bar panel exists", message: "", assertions: [{ passed: true, name: "TopBar panel exists" }] };
            } catch(e) { return { passed: false, name: "Top bar panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
