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
        cachedPanels: {},
        lastConfig: null,
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
        urnTrackerDisplayMode: "",
        urnTrackerLastClass: "",
        urnTrackerLastText: "",
        urnTrackerNextSampleMs: 0,
        urnTrackerNextPanelSearchMs: 0,
        urnTrackerCachedState: null,
        rejuvState: null,
        accountPresetTestActive: false,
        rootClassCache: { panel: null, values: {} },
        coreRootStaticSig: "",
        abilitiesClassCache: { panel: null, values: {} },
        perfEnabled: false,
        perfDetailed: false,
        perfStats: {},
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
