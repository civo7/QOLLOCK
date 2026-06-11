// ql_feat_panelcache.js — Core loop panel cache priming
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_panelcache";
    var _deps = QOL.import(["state","utils","ensureCachedPanelByIds","ensureMinimapPanelCache","ensurePassiveHudPanelCache","ensureGameTimePanelCache","ensureAbilitiesContainerPanelCache"]);
    var S = _deps.state;
    var U = _deps.utils;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var EnsureCachedPanelByIds = _deps.ensureCachedPanelByIds || function() {};
    var EnsureMinimapPanelCache = _deps.ensureMinimapPanelCache || function() {};
    var EnsurePassiveHudPanelCache = _deps.ensurePassiveHudPanelCache || function() {};
    var EnsureGameTimePanelCache = _deps.ensureGameTimePanelCache || function() {};
    var EnsureAbilitiesContainerPanelCache = _deps.ensureAbilitiesContainerPanelCache || function() {};

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

    QOL.register("panelCache", {
        configKeys: [],
        bucket: 7, phase: -1,
        gate: function(cfg) { return false; },
        update: function(root) {
            try {
                EnsureCoreLoopPanelCaches(root);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] update: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["cachedPanels"]
    });

    // ── Self-test ──
    try {
        if (typeof EnsureCoreLoopPanelCaches !== "function") throw new Error("EnsureCoreLoopPanelCaches is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
