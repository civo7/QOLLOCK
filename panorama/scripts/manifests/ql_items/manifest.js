// features/ql_items/manifest.js
// =============================================================================
// QOLLOCK — Items/Mods HUD (position, opacity, wash color, visibility)
// =============================================================================
// OWNS:        Items/mods container styles
// DOES NOT OWN: Item content, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry
// CONFIG KEYS: HUD_ITEMS_ENABLED, ITEMS_OPACITY, ITEMS_X_OFFSET,
//              ITEMS_Y_OFFSET, ITEMS_WASH_COLOR
// PATTERN:     Event-driven (no polling). Signature diffing preserved.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] items: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_items",
        enabledByDefault: false,
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

            function _hasNonDefault(cfg) {
                return Number(cfg.HUD_ITEMS_ENABLED) !== 1 ||
                    Number(cfg.ITEMS_OPACITY) !== 1.0 ||
                    Number(cfg.ITEMS_X_OFFSET) !== 0 ||
                    Number(cfg.ITEMS_Y_OFFSET) !== 0 ||
                    Number(cfg.ITEMS_WASH_COLOR) !== 0;
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

            function _apply(cfg) {
                var root = $.GetContextPanel();
                var mc = _resolveModsContainer(root);
                if (!mc) return;

                var active = _hasNonDefault(cfg);
                var enabled = Number(cfg.HUD_ITEMS_ENABLED) === 1;
                var ox = Math.round(Number(active ? cfg.ITEMS_X_OFFSET : 0)) || 0;
                var oy = Math.round(Number(active ? cfg.ITEMS_Y_OFFSET : 0)) || 0;
                var op = active ? Number(cfg.ITEMS_OPACITY).toFixed(2) : "1.00";
                var wc = active ? String(cfg.ITEMS_WASH_COLOR || "") : "";

                var sig = ox + "|" + oy + "|" + op + "|" + wc + "|" + (enabled ? "1" : "0");
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

            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    _lastSig = ""; _lastWashColor = "";
                    try {
                        var root = $.GetContextPanel();
                        var mc = _resolveModsContainer(root);
                        if (mc && mc.style) {
                            mc.style.x = "0px"; mc.style.y = "0px"; mc.style.washColor = "";
                            _clearOpacity(mc);
                            if (mc.SetHasClass) mc.SetHasClass("qol-hidden", false);
                        }
                    } catch(e) {}
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
            };
        }
    });
})();
