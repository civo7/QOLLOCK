// ql_feat_panelcache.js — Core loop panel cache priming
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var EnsureCachedPanelByIds = typeof QOL_EnsureCachedPanelByIds !== "undefined" ? QOL_EnsureCachedPanelByIds : function() {};
    var EnsureMinimapPanelCache = typeof QOL_EnsureMinimapPanelCache !== "undefined" ? QOL_EnsureMinimapPanelCache : function() {};
    var EnsurePassiveHudPanelCache = typeof QOL_EnsurePassiveHudPanelCache !== "undefined" ? QOL_EnsurePassiveHudPanelCache : function() {};
    var EnsureGameTimePanelCache = typeof QOL_EnsureGameTimePanelCache !== "undefined" ? QOL_EnsureGameTimePanelCache : function() {};
    var EnsureAbilitiesContainerPanelCache = typeof QOL_EnsureAbilitiesContainerPanelCache !== "undefined" ? QOL_EnsureAbilitiesContainerPanelCache : function() {};

    // ── One-shot dependency validation ──
    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_panelcache";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (typeof QOL_EnsureCachedPanelByIds === "undefined") _m.push("QOL_EnsureCachedPanelByIds");
        if (typeof QOL_EnsureMinimapPanelCache === "undefined") _m.push("QOL_EnsureMinimapPanelCache");
        if (typeof QOL_EnsurePassiveHudPanelCache === "undefined") _m.push("QOL_EnsurePassiveHudPanelCache");
        if (typeof QOL_EnsureGameTimePanelCache === "undefined") _m.push("QOL_EnsureGameTimePanelCache");
        if (typeof QOL_EnsureAbilitiesContainerPanelCache === "undefined") _m.push("QOL_EnsureAbilitiesContainerPanelCache");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing " + _m.length + " bridge(s): " + _m.join(", ") + " — feature will fail");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }

    // ── Local constants (mirrors for feature isolation) ──
    var PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
    var PANEL_ID_HEALTH_CONTAINER = "health_and_abilities_container";
    var PANEL_ID_ABILITIES_CONTAINER = "AbilitiesContainer";

    // ── Update ──

    function EnsureCoreLoopPanelCaches(root) {
        if (S.lastResolvedGates) {
            var gates = S.lastResolvedGates;
            if (gates.minimapRuntime) EnsureMinimapPanelCache(root);
            if (gates.legacyAudioPassive) EnsurePassiveHudPanelCache(root);
            if (gates.rejuvTimers) EnsureGameTimePanelCache(root);
            EnsureCachedPanelByIds(root, "gameplayHud", [PANEL_ID_GAMEPLAY_HUD]);
            if (gates.itemsRuntime || gates.statBonuses) EnsureAbilitiesContainerPanelCache(root);
            EnsureCachedPanelByIds(root, "healthContainer", [PANEL_ID_HEALTH_CONTAINER]);
        } else {
            EnsureMinimapPanelCache(root);
            EnsurePassiveHudPanelCache(root);
            EnsureGameTimePanelCache(root);
            EnsureCachedPanelByIds(root, "gameplayHud", [PANEL_ID_GAMEPLAY_HUD]);
            EnsureAbilitiesContainerPanelCache(root);
            EnsureCachedPanelByIds(root, "healthContainer", [PANEL_ID_HEALTH_CONTAINER]);
        }
    }

    // ── Registration ──

    QOL_REGISTER_FEATURE("panelCache", {
        configKeys: [],
        bucket: 7, phase: -1,
        gate: function(cfg) { return false; },
        update: function(root) {
            try {
                EnsureCoreLoopPanelCaches(root);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] update: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["cachedPanels"]
    });

    // ── Self-test ──
    try {
        if (typeof EnsureCoreLoopPanelCaches !== "function") throw new Error("EnsureCoreLoopPanelCaches is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
