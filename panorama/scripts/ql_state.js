// ==========================================================================
// ql_state.js — QOLLOCK shared state and panel cache accessors
// ==========================================================================
// Provides: State object (global singleton), GetCachedPanel, SetCachedPanel,
//           ClearPanelCache, SweepStalePanelCache, ResolveCachedPanel
// Publishes to: QOL.* namespace, window.State
// ==========================================================================
var State;
(function() {
    'use strict';

    // IsPanelValid inline stub — mirrors ql_utils.js definition.
    var IsPanelValid = QOL_UTILS.IsPanelValid;

    // ── Panel cache accessors ──
    var GetCachedPanel = function(k) {
        var p = State.cachedPanels[k];
        if (IsPanelValid(p)) return p;
        State.cachedPanels[k] = null;
        return null;
    };
    var SetCachedPanel = function(k, p) {
        if (p !== null && p !== undefined && !IsPanelValid(p) && !Array.isArray(p)) {
            $.Msg("[QOLLock][WARN] SetCachedPanel('" + String(k) + "') called with non-panel value (type=" + typeof p + "). Use direct State.cachedPanels assignment for non-panel data.");
        }
        State.cachedPanels[k] = (p === null || p === undefined || IsPanelValid(p) || Array.isArray(p)) ? p : null;
        // Dual-write to typed cache (Phase 3 — ql_panelcache.js)
        if (typeof PanelCache !== "undefined" && PanelCache) {
            if (p === null || p === undefined) {
                PanelCache._clearKey(k);
            } else if (Array.isArray(p)) {
                PanelCache.setList(k, p);
            } else if (IsPanelValid(p)) {
                PanelCache.setPanel(k, p);
            } else {
                // Non-panel, non-array value — store as data
                PanelCache.setData(k, p);
            }
        }
    };
    var ClearPanelCache = function() {
        State.cachedPanels = {};
        // Clear typed caches (Phase 3 — ql_panelcache.js)
        if (typeof PanelCache !== "undefined" && PanelCache) {
            PanelCache.clear();
        }
    };
    var SweepStalePanelCache = function() {
        var swept = 0;
        var cache = State.cachedPanels;
        for (var k in cache) {
            if (cache.hasOwnProperty(k) && cache[k] && typeof cache[k].IsValid === "function" && !IsPanelValid(cache[k])) {
                cache[k] = null;
                swept++;
            }
        }
        return swept;
    };
    var ResolveCachedPanel = function(parent, cacheKey, traverseId) {
        var panel = IsPanelValid(State.cachedPanels[cacheKey]) ? State.cachedPanels[cacheKey] : null;
        if (!panel && parent && parent.FindChildTraverse) {
            panel = parent.FindChildTraverse(traverseId);
            State.cachedPanels[cacheKey] = panel || null;
        }
        return panel;
    };

    // ── State object ──
    State = {
        lastTime: -1, 
        lastIntervalAlert: 0,
        lastMinimapAlert: 0,
        triggeredOneTimers: {},
        lastRawConfig: null, 
        lastZoomState: null, 
        cachedPanels: {},
        allBindingsBoxes: [],
        forceRefreshTicks: 0,
        lastItemCount: 0,
        lastIndicatorCount: 0,
        lastIndicatorConfigSig: "",
        lastIndicatorHideModesSig: "",
        indicatorPanelsCache: [],
        indicatorMetaCache: [],
        runtimeTaskNextMs: {},
        showBuildIdStyleSig: "",
        showBuildIdLastLabel: null,
        lastConfig: null,
        imagesInChatTopNextSearchMs: 0,
        imagesInChatBottomNextSearchMs: 0,
        imagesInChatTopIdleMisses: 0,
        imagesInChatBottomIdleMisses: 0,
        imagesInChatTopWatermark: "",
        imagesInChatBottomWatermark: "",
        imagesInChatTopFullScanNextMs: 0,
        imagesInChatBottomFullScanNextMs: 0,
        imagesInChatTopMessageCache: [],
        imagesInChatBottomMessageCache: [],
        combatStatus: {
            displayMode: "",
            lastLayoutSig: "",
            lastClassSig: "",
            lastStateText: "",
            lastTimerText: "",
            lastCombatMs: 0,
            combatStartMs: 0,
            signalActive: false,
            nextAlertProbeMs: 0
        },
        combatIndicatorDebugLastSig: "",
        combatIndicatorDebugNextMs: 0,
        enemyUnitStatusOldPanelCacheRoot: null,
        enemyUnitStatusOldPanelCache: [],
        enemyUnitStatusOldPanelCacheNextMs: 0,
        enemyUnitStatusOldPanelScanStats: null,
        ultCdSlotCache: null,
        ultCdSlotNextRecheckMs: null,
        ultCdSlotFullRescanAtMs: 0,
        enemyUltOldPanelCache: [],
        enemyUltOldPanelCacheNextMs: 0,
        enemyUltOldNextUpdateMs: 0,
        enemyUltOldTopBarNameByIndex: null,
        enemyUltOldTopBarNameToIndex: null,
        enemyUltOldTopBarNameToIndices: null,
        enemyUltOldTopBarEnemyIndices: null,
        enemyUltOldTopBarNameNextMs: 0,
        enemyUltOldDebugLastSig: "",
        enemyUltOldDebugNextMs: 0,
        enemyV2EnhancedBridgeLastValue: "",
        enemyV2UltBridgeLastValue: "",
        enemyV2LevelBridgeLastValue: "",
        enemyV2BridgeEventEnhanced: null,
        enemyV2BridgeEventUlt: null,
        enemyV2BridgeEventLevel: null,
        enemyV2BridgeEventLastMs: 0,
        enemyV2AttrBridgeLastSig: "",
        customHudSuppressed: false,
        keyboardBoxCaches: [],
        bottomBarCurrencyColorStyleSig: "",
        // Paired with the sig above. A colour already applied still has to be
        // re-applied when the HUD rebuilds and the signature panel is a different
        // object, or the sig claims work was done on panels that no longer exist.
        bottomBarCurrencyColorPanel: null,
        bottomBarCurrencyDebugLastSig: "",
        bottomBarCurrencyDebugNextMs: 0,
        urnTrackerDisplayMode: "",
        urnTrackerLastClass: "",
        urnTrackerLastText: "",
        urnTrackerNextSampleMs: 0,
        urnTrackerNextPanelSearchMs: 0,
        urnTrackerCachedState: null,
        topbarPlayerPanelRoot: null,
        topbarPlayerPanels: null,
        topbarPlayerPanelLastScanMs: null,
        // Latched per slot on first successful resolve, never cleared for the session.
        // Distinguishes "the engine does not create this slot" (index 0 — see
        // GetTopBarPlayerPanel) from "the panel died and will come back", which decides
        // whether a lookup gets a 30s cooldown or the normal 1.5s one.
        topbarPlayerPanelEverResolved: null,
        // Per-slot deadline before which a missed lookup is not retried, stamped when
        // the miss happens. Only a slot that has never resolved while the top bar
        // demonstrably exists earns the long cooldown — see GetTopBarPlayerPanel.
        topbarPlayerPanelMissUntilMs: null,
        topbarNicknamePlayers: null,
        topbarNicknameLabels: null,
        topbarNicknameSourceLabels: null,
        topbarNicknameFallbackLabels: null,
        topbarNicknameResolvedTexts: null,
        topbarNicknameResolveStates: null,
        topbarNicknameRetryNextMs: null,
        statlockerWasEnabled: false,
        statlockerNextScanMs: 0,
        statlockerScanMisses: 0,
        statlockerCorePanels: null,
        statlockerButtons: null,
        topbarSoulSnapshot: null,
        topbarSoulSnapshotUntilMs: 0,
        rejuvState: null,
        legacyCooldownsUiFlag: null,
        accountProbeStartMs: 0,
        accountProbeWindowEndMs: 0,
        accountProbeNextMs: 0,
        accountProbeReportNextMs: 0,
        accountProbeFoundId: "",
        accountProbeDone: false,
        accountProbeMissLogged: false,
        accountProbeDeepScanNextMs: 0,
        accountProbeScans: 0,
        accountProbeLastPanelsScanned: 0,
        accountProbeApiHintLogged: false,
        accountProbeFoundSource: "",
        accountProbeCandidateId: "",
        accountProbeCandidateHits: 0,
        accountPresetTestActive: false,
        accountPresetBootstrapDone: false,
        accountPresetBootstrapAccountId: "",
        accountPresetRawOverride: "",
        accountPresetUiMarker: "",
        accountPresetSessionLockId: "",
        accountPresetLastAppliedRaw: "",
        accountPresetBootstrapAtMs: 0,
        accountPresetLastUserEditRev: 0,
        accountPresetManualUnlockActive: false,
        accountPresetManualUnlockAccountId: "",
        // Storage bridge (CEF HTMLPanel localStorage) state
        storageBridgeReady: false,
        storageBridgeLastSaveMs: 0,
        storageBridgeLastLoadMs: 0,
        storageBridgeLastError: "",
        configLoadState: "loaded",
        // (debug state fields removed — buildClearDebugLastSig, buildClearDebugNextMs, buildClearDebugOverlayLine)
        heroReturnDebugLastSig: "",
        heroReturnDebugNextMs: 0,
        heroDetectDebugLastSig: "",
        heroDetectDebugNextMs: 0,
        heroDetectLastResolved: "",
        heroDetectLastSource: "",
        heroResolveLastSource: "",
        heroDetectLastKnownPlayableHero: "",
        heroDetectNextProbeMs: 0,
        heroDetectAbilityProgressNextScanMs: 0,
        heroDetectAbilityProgressLastHero: "",
        heroDetectCaptureAbilityNextScanMs: 0,
        heroDetectCaptureAbilityLastHero: "",
        heroDetectAbilityHintNextScanMs: 0,
        heroDetectAbilityHintLastHero: "",
        heroDetectLogoSpotlightNextScanMs: 0,
        heroDetectLogoSpotlightLastHero: "",
        heroDetectCaptureSnapshotNextScanMs: 0,
        heroDetectCaptureSnapshotLastHero: "",
        heroDetectDeepScanNextMs: 0,
        heroDetectDeepScanExtendedNextMs: 0,
        heroDetectNoMatchStreak: 0,
        heroDetectLastDeepScanHero: "",
        heroDetectLastDeepScanDetail: "",
        heroPersistLastWriteMs: 0,
        heroPersistLastWrittenHero: "",
        heroPersistNextCheckMs: 0,
        heroDetectApiHintsLogged: false,
        heroRestorePendingTarget: "",
        heroRestorePendingStartedMs: 0,
        heroRestorePendingNextMs: 0,
        heroRestorePendingRetries: 0,
        heroRestorePendingContext: "",
        heroRestoreShopPulseNextMs: 0,
        chatStyleSig: "",
        chatStyleApplied: false,
        chatStylePanel: null,
        rootClassCache: { panel: null, values: {} },
        coreRootStaticSig: "",
        abilitiesClassCache: { panel: null, values: {} },
        targetShapesCache: [],
        hintContainerCache: [],
        targetShapeStyleSig: "",
        nextTargetShapeRefreshMs: 0,
        targetShapeHadNonDefaultRuntime: false,
        targetShapeDebugLastSig: "",
        targetShapeDebugNextMs: 0,
        unitTargetBootstrapTryCount: 0,
        unitTargetBootstrapDone: false,
        perfEnabled: false,
        perfDetailed: false,
        perfWindowStartMs: 0,
        perfNextFlushMs: 0,
        perfStats: {},
        perfLoopCount: 0,
        perfCompassLoopCount: 0,
        perfLastLoopStartMs: 0,
        perfLastCompassStartMs: 0,
        coreLoopTickSerial: 0,
        coreLoopPhaseLast: 0,
        runtimeGateSig: "",
        runtimeGates: null,
        runtimeGateConfigRef: null,
        runtimeGateRaw: null,
        runtimeGateHideoutConnected: null,
        runtimeGateHasConfigSource: null,
        coreRootGateSig: "",
        onDeathArcadeRuntimeWasActive: false,
        healthbarVisDebugLastSig: "",
        healthbarVisDebugNextMs: 0,
        loopErrorNextLogMs: 0,
        dl4dLastTime: -1,
        dl4dTriggeredTimes: {},
        dl4dCaptionToken: 0,
        dl4dCaptionVisible: false
    };

    // ── Publish to QOL namespace ──
    if (typeof QOL !== "undefined") {
        QOL.state = State;
        QOL.getCachedPanel = GetCachedPanel;
        QOL.setCachedPanel = SetCachedPanel;
        QOL.clearPanelCache = ClearPanelCache;
        QOL.sweepStalePanelCache = SweepStalePanelCache;
        QOL.resolveCachedPanel = ResolveCachedPanel;
    }

    // ── Publish to global scope ──
    try { if (typeof window !== "undefined") window.State = State; } catch(e) { /* window may not be defined */ }
    try { if (typeof globalThis !== "undefined") globalThis.State = State; } catch(e) { /* globalThis may not be defined */ }

    // ── Self-test ──
    try {
        if (typeof GetCachedPanel !== "function") throw new Error("GetCachedPanel is not a function");
        if (typeof SetCachedPanel !== "function") throw new Error("SetCachedPanel is not a function");
        if (typeof State !== "object" || State === null) throw new Error("State is not an object");
        if (typeof State.cachedPanels !== "object" || State.cachedPanels === null) throw new Error("State.cachedPanels is not an object");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][ql_state] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
