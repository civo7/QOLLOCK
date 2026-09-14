// features/ql_items/manifest.js
// =============================================================================
// QOLLOCK — Items/Mods HUD (position, opacity, wash color, visibility)
// =============================================================================
// OWNS:        Items/mods container styles
// DOES NOT OWN: Item content, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: HUD_ITEMS_ENABLED, ITEMS_OPACITY, ITEMS_X_OFFSET,
//              ITEMS_Y_OFFSET, ITEMS_WASH_COLOR
// PATTERN:     Polled at 1.0Hz — the mods container may not exist at enable time
//              (e.g. main menu), so the poll loop retries until found.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] items: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_items",
        enabledByDefault: true,
        enableKey: "HUD_ITEMS_ENABLED",
        settings: [
            { key: "HUD_ITEMS_ENABLED", type: "toggle", default: true },
            { key: "ITEMS_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1.0 },
            { key: "ITEMS_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0 },
            { key: "ITEMS_Y_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "ITEMS_WASH_COLOR", type: "palette", default: 0 }
        ],
        create: function(ctx) {
            var _lastSig = "";
            var _lastWashColor = "";
            var _loop = null;

            function _hasNonDefault(cfg) {
                if (!cfg) return false;
                var enabled = (cfg.HUD_ITEMS_ENABLED === undefined || cfg.HUD_ITEMS_ENABLED === true || Number(cfg.HUD_ITEMS_ENABLED) === 1);
                return !enabled ||
                    Number(cfg.ITEMS_OPACITY !== undefined ? cfg.ITEMS_OPACITY : 1.0) !== 1.0 ||
                    Number(cfg.ITEMS_X_OFFSET || 0) !== 0 ||
                    Number(cfg.ITEMS_Y_OFFSET || 0) !== 0 ||
                    Number(cfg.ITEMS_WASH_COLOR || 0) !== 0;
            }

            function _resolveModsContainer(root) {
                var mc = root.FindChildTraverse("StatsAndModsContainer");
                if (!mc || !mc.FindChildrenWithClassTraverse) return null;
                var mods = mc.FindChildrenWithClassTraverse("ModsContainer") || [];
                for (var i = 0; i < mods.length; i++) { if (mods[i]) return mods[i]; }
                return null;
            }

            function _clearOpacity(panel) { try { panel.style.opacity = ""; } catch(e) {} }
            function _setOpacity(panel, val) { try { panel.style.opacity = val; } catch(e) {} }

            function _resetAllChildren(mc) {
                // Reset BarGraphContainer, ModSection children, and mod_icon_single_container
                // children that _apply sets opacity on. onDisable must leave the HUD clean.
                var barGraph = mc.FindChildTraverse ? mc.FindChildTraverse("BarGraphContainer") : null;
                if (barGraph) _clearOpacity(barGraph);
                try {
                    var modSections = mc.FindChildrenWithClassTraverse ? (mc.FindChildrenWithClassTraverse("ModSection") || []) : [];
                    for (var s = 0; s < modSections.length; s++) { if (modSections[s]) _clearOpacity(modSections[s]); }
                    var iconContainers = mc.FindChildrenWithClassTraverse ? (mc.FindChildrenWithClassTraverse("mod_icon_single_container") || []) : [];
                    for (var ic = 0; ic < iconContainers.length; ic++) {
                        if (iconContainers[ic]) _clearOpacity(iconContainers[ic]);
                    }
                } catch(e) {}
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var mc = _resolveModsContainer(root);
                if (!mc) return;

                var active = _hasNonDefault(cfg);
                var enabled = (cfg.HUD_ITEMS_ENABLED === undefined || cfg.HUD_ITEMS_ENABLED === true || Number(cfg.HUD_ITEMS_ENABLED) === 1);
                var ox = Math.round(Number(active ? cfg.ITEMS_X_OFFSET : 0)) || 0;
                var oy = Math.round(Number(active ? cfg.ITEMS_Y_OFFSET : 0)) || 0;
                var op = active ? Number(cfg.ITEMS_OPACITY).toFixed(2) : "1.00";
                var wcIdx = active ? (Math.round(Number(cfg.ITEMS_WASH_COLOR)) || 0) : 0;
                var pal = (typeof QOL !== "undefined" && QOL.washColorPalette) ? QOL.washColorPalette : [];
                var wc = (wcIdx > 0 && wcIdx < pal.length) ? pal[wcIdx] : "";

                var sig = ox + "|" + oy + "|" + op + "|" + wcIdx + "|" + (enabled ? "1" : "0");
                if (_lastSig === sig) return;
                _lastSig = sig;

                mc.style.x = ox + "px";
                mc.style.y = (-oy) + "px";
                if (mc.SetHasClass) mc.SetHasClass("qol-hidden", !enabled);
                if (wc !== _lastWashColor) { try { mc.style.washColor = wc; } catch(e) {} _lastWashColor = wc; }
                _clearOpacity(mc);

                var barGraph = mc.FindChildTraverse ? mc.FindChildTraverse("BarGraphContainer") : null;
                if (barGraph) { op === "1.00" ? _clearOpacity(barGraph) : _setOpacity(barGraph, op); }

                try {
                    var modSections = mc.FindChildrenWithClassTraverse ? (mc.FindChildrenWithClassTraverse("ModSection") || []) : [];
                    for (var s = 0; s < modSections.length; s++) { if (modSections[s]) _clearOpacity(modSections[s]); }
                    var iconContainers = mc.FindChildrenWithClassTraverse ? (mc.FindChildrenWithClassTraverse("mod_icon_single_container") || []) : [];
                    for (var ic = 0; ic < iconContainers.length; ic++) {
                        if (!iconContainers[ic]) continue;
                        op === "1.00" ? _clearOpacity(iconContainers[ic]) : _setOpacity(iconContainers[ic], op);
                    }
                } catch(e) {}
            }

            function _tick() {
                try { _apply(ctx.config.all()); } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_items", "_tick: " + (e.message || e));
                    }
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    _apply(ctx.config.all());
                    var S = QOL.core.Scheduler;
                    // Polling retries container resolution; the mods container may not
                    // exist at enable time (e.g. main menu).
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 1.0, "ql_items") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_items");
                    _lastSig = ""; _lastWashColor = "";
                    try {
                        var root = $.GetContextPanel();
                        var mc = _resolveModsContainer(root);
                        if (mc && mc.style) {
                            mc.style.x = "0px"; mc.style.y = "0px"; mc.style.washColor = "";
                            _clearOpacity(mc);
                            if (mc.SetHasClass) mc.SetHasClass("qol-hidden", false);
                            // Also reset all child panels that _apply touches.
                            _resetAllChildren(mc);
                        }
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var panel = root ? root.FindChildTraverse("StatsAndModsContainer") : null;
                if (!panel) panel = root ? root.FindChildTraverse("ModsContainer") : null;
                if (!panel) return null;  // Skip — not in a match context
                return { passed: true, name: "Items mods panel exists", message: "", assertions: [{ passed: true, name: "StatsAndModsContainer or ModsContainer exists" }] };
            } catch(e) { return { passed: false, name: "Items panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
