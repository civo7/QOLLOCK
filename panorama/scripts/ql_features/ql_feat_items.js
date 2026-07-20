// ql_feat_items.js — Items/mod slots HUD runtime (position, opacity, wash color, visibility)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    var _featureId = "ql_feat_items";
    // DEPENDS: getCachedPanel, normalizePaletteColorIndex, resolveCachedPanel, resolveWashColorFromPalette, state, setCachedPanel, setWashColorSafe, utils
    var _deps = QOL.import(["getCachedPanel","normalizePaletteColorIndex","resolveCachedPanel","resolveWashColorFromPalette","state","setCachedPanel","setWashColorSafe","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var RC = _deps.resolveCachedPanel;
    var RWP = _deps.resolveWashColorFromPalette;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var SWC = _deps.setWashColorSafe;
    var Utils = _deps.utils;
    var IPV = Utils.IsPanelValid;
    var NPC = _deps.normalizePaletteColorIndex;
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(State.itemsRuntimeStyleSig && String(State.itemsRuntimeStyleSig).length > 0) ||
            GetCachedPanel("itemsModsContainer");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_ITEMS_ENABLED) !== 1 ||
            Utils.NormalizeOpacityNumber(cfg.ITEMS_OPACITY, 1.0) !== 1.0 ||
            Utils.NormalizeHudOffsetNumber(cfg.ITEMS_X_OFFSET, 0) !== 0 ||
            Utils.NormalizeHudOffsetNumber(cfg.ITEMS_Y_OFFSET, 0) !== 0 ||
            NPC(cfg.ITEMS_WASH_COLOR) !== 0
        );
    }

    // ── Update ──
    function update(root, cfg) {
        if (!State._debug_itemsRuntime) { $.Msg("[QOL DEBUG] First update: itemsRuntime\n"); State._debug_itemsRuntime = true; }
        var active = hasNonDefaultConfig(cfg);
        var enabled = Utils.IsCfgEnabled(cfg, "HUD_ITEMS_ENABLED");
        var modsContainer = GetCachedPanel("itemsModsContainer");
        if (!modsContainer) {
            var statsAndMods = RC(root, "statsAndModsContainer", "StatsAndModsContainer");
            if (statsAndMods && statsAndMods.FindChildrenWithClassTraverse) {
                var modsContainers = statsAndMods.FindChildrenWithClassTraverse("ModsContainer") || [];
                for (var iMods = 0; iMods < modsContainers.length; iMods++) {
                    if (IPV(modsContainers[iMods])) {
                        modsContainer = modsContainers[iMods];
                        break;
                    }
                }
            }
            SetCachedPanel("itemsModsContainer", modsContainer);
        }
        if (!modsContainer) return;

        var offsetX = active ? Utils.NormalizeHudOffsetNumber(cfg.ITEMS_X_OFFSET, 0) : 0;
        var offsetY = active ? Utils.NormalizeHudOffsetNumber(cfg.ITEMS_Y_OFFSET, 0) : 0;
        var opacityText = active ? Utils.NormalizeOpacityNumber(cfg.ITEMS_OPACITY, 1.0).toFixed(2) : "1.00";
        var washColor = active ? RWP(cfg.ITEMS_WASH_COLOR) : "";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + washColor + "|" + (enabled ? "1" : "0");
        if (State.itemsRuntimeStyleSig === styleSig) return;

        modsContainer.style.x = String(offsetX) + "px";
        modsContainer.style.y = String(-offsetY) + "px";
        modsContainer.style.visibility = enabled ? "visible" : "collapse";
        SWC(modsContainer, washColor);
        Utils.ClearStyleSafe(modsContainer, "opacity");
        var barGraphContainer = modsContainer.FindChildTraverse ? modsContainer.FindChildTraverse("BarGraphContainer") : null;
        if (IPV(barGraphContainer)) {
            if (opacityText === "1.00") Utils.ClearStyleSafe(barGraphContainer, "opacity");
            else Utils.SetPanelOpacitySafe(barGraphContainer, opacityText, 1.0);
        }
        var modSections = modsContainer.FindChildrenWithClassTraverse ? (modsContainer.FindChildrenWithClassTraverse("ModSection") || []) : [];
        for (var sectionIndex = 0; sectionIndex < modSections.length; sectionIndex++) {
            if (IPV(modSections[sectionIndex])) Utils.ClearStyleSafe(modSections[sectionIndex], "opacity");
        }
        var modIconContainers = modsContainer.FindChildrenWithClassTraverse ? (modsContainer.FindChildrenWithClassTraverse("mod_icon_single_container") || []) : [];
        for (var iconIndex = 0; iconIndex < modIconContainers.length; iconIndex++) {
            if (!IPV(modIconContainers[iconIndex])) continue;
            if (opacityText === "1.00") Utils.ClearStyleSafe(modIconContainers[iconIndex], "opacity");
            else Utils.SetPanelOpacitySafe(modIconContainers[iconIndex], opacityText, 1.0);
        }
        State.itemsRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    QOL.register("itemsRuntime", {
        configKeys: ["HUD_ITEMS_ENABLED", "ITEMS_OPACITY", "ITEMS_X_OFFSET",
                     "ITEMS_Y_OFFSET", "ITEMS_WASH_COLOR"],
        bucket: 3, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["itemsRuntimeStyleSig", "cachedPanels.itemsModsContainer",
                    "cachedPanels.statsAndModsContainer"]
    });

    // ── Self-test ──
    try {
        if (typeof update !== "function") throw new Error("update is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
