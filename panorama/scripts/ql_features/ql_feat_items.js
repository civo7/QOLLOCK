// ql_feat_items.js — Items/mod slots HUD runtime (position, opacity, wash color, visibility)
// Extracted from ql_core.js, Step 2a
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: itemsRuntime\n");
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var RC = typeof QOL_ResolveCachedPanel !== "undefined" ? QOL_ResolveCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var SWC = typeof QOL_SetWashColorSafe !== "undefined" ? QOL_SetWashColorSafe : undefined;
    var RWP = typeof QOL_ResolveWashColorFromPalette !== "undefined" ? QOL_ResolveWashColorFromPalette : undefined;
    var NPC = typeof QOL_NormalizePaletteColorIndex !== "undefined" ? QOL_NormalizePaletteColorIndex : undefined;
    var IPV = (typeof QOL_UTILS !== "undefined" ? QOL_UTILS.IsPanelValid : null);

    // One-shot dependency validation
    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_items";
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
    // ── Gate ──
    function gate(cfg) {
        return hasNonDefaultConfig(cfg) ||
            !!(S.itemsRuntimeStyleSig && String(S.itemsRuntimeStyleSig).length > 0) ||
            GC("itemsModsContainer");
    }

    function hasNonDefaultConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_ITEMS_ENABLED) !== 1 ||
            U.NormalizeOpacityNumber(cfg.ITEMS_OPACITY, 1.0) !== 1.0 ||
            U.NormalizeHudOffsetNumber(cfg.ITEMS_X_OFFSET, 0) !== 0 ||
            U.NormalizeHudOffsetNumber(cfg.ITEMS_Y_OFFSET, 0) !== 0 ||
            NPC(cfg.ITEMS_WASH_COLOR) !== 0
        );
    }

    // ── Update ──
    function update(root, cfg) {
        if (!S._debug_itemsRuntime) { $.Msg("[QOL DEBUG] First update: itemsRuntime\n"); S._debug_itemsRuntime = true; }
        var active = hasNonDefaultConfig(cfg);
        var enabled = U.IsCfgEnabled(cfg, "HUD_ITEMS_ENABLED");
        var modsContainer = GC("itemsModsContainer");
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
            SC("itemsModsContainer", modsContainer);
        }
        if (!modsContainer) return;

        var offsetX = active ? U.NormalizeHudOffsetNumber(cfg.ITEMS_X_OFFSET, 0) : 0;
        var offsetY = active ? U.NormalizeHudOffsetNumber(cfg.ITEMS_Y_OFFSET, 0) : 0;
        var opacityText = active ? U.NormalizeOpacityNumber(cfg.ITEMS_OPACITY, 1.0).toFixed(2) : "1.00";
        var washColor = active ? RWP(cfg.ITEMS_WASH_COLOR) : "";
        var styleSig = String(offsetX) + "|" + String(offsetY) + "|" + opacityText + "|" + washColor + "|" + (enabled ? "1" : "0");
        if (S.itemsRuntimeStyleSig === styleSig) return;

        modsContainer.style.x = String(offsetX) + "px";
        modsContainer.style.y = String(-offsetY) + "px";
        modsContainer.style.visibility = enabled ? "visible" : "collapse";
        SWC(modsContainer, washColor);
        U.ClearStyleSafe(modsContainer, "opacity");
        var barGraphContainer = modsContainer.FindChildTraverse ? modsContainer.FindChildTraverse("BarGraphContainer") : null;
        if (IPV(barGraphContainer)) {
            if (opacityText === "1.00") U.ClearStyleSafe(barGraphContainer, "opacity");
            else U.SetPanelOpacitySafe(barGraphContainer, opacityText, 1.0);
        }
        var modSections = modsContainer.FindChildrenWithClassTraverse ? (modsContainer.FindChildrenWithClassTraverse("ModSection") || []) : [];
        for (var sectionIndex = 0; sectionIndex < modSections.length; sectionIndex++) {
            if (IPV(modSections[sectionIndex])) U.ClearStyleSafe(modSections[sectionIndex], "opacity");
        }
        var modIconContainers = modsContainer.FindChildrenWithClassTraverse ? (modsContainer.FindChildrenWithClassTraverse("mod_icon_single_container") || []) : [];
        for (var iconIndex = 0; iconIndex < modIconContainers.length; iconIndex++) {
            if (!IPV(modIconContainers[iconIndex])) continue;
            if (opacityText === "1.00") U.ClearStyleSafe(modIconContainers[iconIndex], "opacity");
            else U.SetPanelOpacitySafe(modIconContainers[iconIndex], opacityText, 1.0);
        }
        S.itemsRuntimeStyleSig = styleSig;
    }

    // ── Register ──
    (typeof QOL_REGISTER_FEATURE !== "undefined" ? QOL_REGISTER_FEATURE : null)("itemsRuntime", {
        configKeys: ["HUD_ITEMS_ENABLED", "ITEMS_OPACITY", "ITEMS_X_OFFSET",
                     "ITEMS_Y_OFFSET", "ITEMS_WASH_COLOR"],
        bucket: 3, phase: -1,
        gate: gate,
        update: function(root, cfg) { update(root, cfg); },
        stateKeys: ["itemsRuntimeStyleSig", "cachedPanels.itemsModsContainer",
                    "cachedPanels.statsAndModsContainer"]
    });
})();
