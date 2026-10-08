// ==========================================================================
// ql_panelcache.js — QOLLOCK typed panel cache subsystem
// ==========================================================================
// Provides: PanelCache object with typed accessors for three cache categories:
//   panels  — single Panel objects, validated via IsPanelValid
//   lists   — Panel[] arrays, validated via IsPanelListValid
//   data    — any non-panel data (arrays, objects, numbers)
//
// Backward compat: the legacy GetCachedPanel/SetCachedPanel in ql_state.js
// dual-write to these typed caches. Existing code continues to work unchanged.
//
// Publishes to: QOL.* namespace, window.PanelCache
// Loads AFTER:  ql_utils.js, ql_shared_presets.js, ql_state.js
// Depends on:   QOL_UTILS.IsPanelValid, QOL_UTILS.IsPanelListValid
// ==========================================================================

(function() {
    'use strict';

    // ── Validation stubs (mirror ql_utils.js, fall back to inline) ──
    var IsPanelValid = QOL_UTILS.IsPanelValid;

    var IsPanelListValid = QOL_UTILS.IsPanelListValid;

    // ── Typed cache storage ──
    var _panels = {};
    var _lists = {};
    var _data = {};
    var _resolved = {};

    // ── PanelCache public API ──
    var PanelCache = {
        // ── Panel cache (single Panels, validated on every get) ──
        getPanel: function(key) {
            var p = _panels[key];
            if (IsPanelValid(p)) return p;
            _panels[key] = null;
            return null;
        },
        setPanel: function(key, panel) {
            delete _resolved[key];
            _panels[key] = (panel === null || panel === undefined || IsPanelValid(panel)) ? panel : null;
        },

        // ── List cache (Panel[] arrays, validated element-by-element) ──
        getList: function(key) {
            var list = _lists[key];
            if (list && IsPanelListValid(list)) return list;
            _lists[key] = null;
            return null;
        },
        setList: function(key, list) {
            _lists[key] = (list === null || list === undefined || (Array.isArray(list) && list.length >= 0)) ? list : null;
        },

        // ── Data cache (any non-panel value — objects, numbers, strings, arrays of non-panels) ──
        getData: function(key) {
            return (_data.hasOwnProperty(key)) ? _data[key] : undefined;
        },
        setData: function(key, value) {
            _data[key] = value;
        },

        // ── Sweep — null stale panel/list entries, skip data entries ──
        sweep: function() {
            var swept = 0;
            for (var k in _panels) {
                if (_panels.hasOwnProperty(k) && _panels[k] && !IsPanelValid(_panels[k])) {
                    _panels[k] = null;
                    swept++;
                }
            }
            for (var k in _lists) {
                if (_lists.hasOwnProperty(k) && _lists[k] && !IsPanelListValid(_lists[k])) {
                    _lists[k] = null;
                    swept++;
                }
            }
            return swept;
        },

        // ── Clear — reset all typed caches to empty ──
        // Uses delete instead of reassignment so State._panelCache references stay valid.
        clear: function() {
            for (var k in _resolved) { if (Object.prototype.hasOwnProperty.call(_resolved, k)) delete _resolved[k]; }
            for (var k in _panels) { if (_panels.hasOwnProperty(k)) delete _panels[k]; }
            for (var k in _lists) { if (_lists.hasOwnProperty(k)) delete _lists[k]; }
            for (var k in _data) { if (_data.hasOwnProperty(k)) delete _data[k]; }
        },

        // ── Resolve — get-or-traverse pattern (single Panel only) ──
        resolve: function(parent, cacheKey, traverseId) {
            if (!IsPanelValid(parent)) { PanelCache._clearKey(cacheKey); return null; }
            var owner = _resolved[cacheKey];
            var panel = owner && owner.parent === parent && owner.id === traverseId && IsPanelValid(_panels[cacheKey]) ? _panels[cacheKey] : null;
            if (panel) {
                // A still-valid panel can have been reparented by the engine.
                try {
                    var ancestor = panel.GetParent();
                    while (ancestor && ancestor !== parent) ancestor = ancestor.GetParent();
                    if (ancestor !== parent) panel = null;
                } catch (_) { panel = null; }
            }
            if (!panel) {
                try { panel = parent.FindChildTraverse(traverseId); } catch (_) { panel = null; }
                if (!IsPanelValid(panel)) panel = null;
                _panels[cacheKey] = panel;
                _resolved[cacheKey] = { parent: parent, id: traverseId };
            }
            return panel;
        },

        // Feature-owned ID resolver. Discover the native parent rather than
        // assuming an XML path; check that parent directly between full refreshes.
        createIdResolver: function(traverseId, options) {
            options = options || {};
            const refreshMs = options.refreshMs === undefined ? 5000 : Math.max(0, Number(options.refreshMs) || 0);
            const retryMs = options.retryMs === undefined ? 1000 : Math.max(0, Number(options.retryMs) || 0);
            const ownerPath = options.ownerPath || [];
            let root = null, parent = null, panel = null;
            let nextFullSearchMs = 0, nextRetryMs = 0;

            function reset() {
                root = null; parent = null; panel = null;
                nextFullSearchMs = 0; nextRetryMs = 0;
            }

            function belongsToRoot(candidate, target) {
                try {
                    for (let depth = 0; depth < 64 && IsPanelValid(candidate); depth++) {
                        if (candidate === target) return true;
                        candidate = candidate.GetParent();
                    }
                } catch (_) {}
                return false;
            }

            // Verified breadcrumbs take precedence over generic discovery. Each step
            // checks direct children, so replacement is observed without a tree walk.
            function resolvePath(searchRoot) {
                if (!ownerPath.length) return null;
                try {
                    let owner = searchRoot;
                    for (const step of ownerPath) {
                        const id = typeof step === "string" ? step : step.id;
                        if (id && owner.id === id) continue;
                        let child = null;
                        if (id) child = owner.FindChild(id);
                        else if (step.className) {
                            for (let i = 0; i < owner.GetChildCount(); i++) {
                                const candidate = owner.GetChild(i);
                                if (IsPanelValid(candidate) && candidate.BHasClass(step.className)) { child = candidate; break; }
                            }
                        }
                        if (!IsPanelValid(child)) {
                            if (step.optional) continue;
                            return null;
                        }
                        owner = child;
                    }
                    const current = owner.FindChild(traverseId);
                    return IsPanelValid(current) ? current : null;
                } catch (_) { return null; }
            }

            function resolve(searchRoot, force) {
                if (!IsPanelValid(searchRoot)) { reset(); return null; }
                if (root !== searchRoot) { reset(); root = searchRoot; }
                const nowMs = Date.now();
                const preferred = resolvePath(root);
                if (preferred) {
                    panel = preferred;
                    try { parent = panel.GetParent(); } catch (_) { parent = null; }
                    nextFullSearchMs = nowMs + refreshMs;
                    nextRetryMs = 0;
                    return panel;
                }
                if (!force && panel && nowMs < nextFullSearchMs && belongsToRoot(parent, root)) {
                    try {
                        const current = parent.FindChild(traverseId);
                        if (IsPanelValid(current)) { panel = current; return panel; }
                    } catch (_) {}
                }
                // Losing/reparenting a known panel bypasses a previous miss deadline.
                if (!force && !panel && nowMs < nextRetryMs) return null;
                try {
                    panel = root.FindChildTraverse(traverseId);
                    if (!IsPanelValid(panel)) panel = null;
                    parent = panel ? panel.GetParent() : null;
                } catch (_) { panel = null; parent = null; }
                nextFullSearchMs = nowMs + refreshMs;
                nextRetryMs = panel ? 0 : nowMs + retryMs;
                return panel;
            }

            return { resolve: resolve, reset: reset };
        },

        // ── Reset a single key across all typed caches (used by SetCachedPanel null/undefined) ──
        _clearKey: function(key) {
            delete _resolved[key];
            delete _panels[key];
            delete _lists[key];
            delete _data[key];
        },

        // ── Introspection (for diagnostics and State._panelCache reference) ──
        _internal: function() {
            return { panels: _panels, lists: _lists, data: _data };
        }
    };

    // ── Publish to QOL namespace ──
    if (typeof QOL !== "undefined") {
        QOL.panelCache = PanelCache;
        QOL.getPanel = PanelCache.getPanel;
        QOL.setPanel = PanelCache.setPanel;
        QOL.getList = PanelCache.getList;
        QOL.setList = PanelCache.setList;
        QOL.getData = PanelCache.getData;
        QOL.setData = PanelCache.setData;
        QOL.panelCacheSweep = PanelCache.sweep;
        QOL.panelCacheClear = PanelCache.clear;
        QOL.panelCacheResolve = PanelCache.resolve;
    }

    // ── Publish to global scope ──
    try { if (typeof window !== "undefined") window.PanelCache = PanelCache; } catch(e) { /* window may not be defined */ }
    try { if (typeof globalThis !== "undefined") globalThis.PanelCache = PanelCache; } catch(e) { /* globalThis may not be defined */ }

    // ── Self-test ──
    try {
        if (typeof PanelCache.getPanel !== "function") throw new Error("PanelCache.getPanel is not a function");
        if (typeof PanelCache.setPanel !== "function") throw new Error("PanelCache.setPanel is not a function");
        if (typeof PanelCache.getList !== "function") throw new Error("PanelCache.getList is not a function");
        if (typeof PanelCache.setList !== "function") throw new Error("PanelCache.setList is not a function");
        if (typeof PanelCache.getData !== "function") throw new Error("PanelCache.getData is not a function");
        if (typeof PanelCache.setData !== "function") throw new Error("PanelCache.setData is not a function");
        if (typeof PanelCache.sweep !== "function") throw new Error("PanelCache.sweep is not a function");
        if (typeof PanelCache.clear !== "function") throw new Error("PanelCache.clear is not a function");
        if (typeof PanelCache.resolve !== "function") throw new Error("PanelCache.resolve is not a function");
        if (typeof PanelCache.createIdResolver !== "function") throw new Error("PanelCache.createIdResolver is not a function");
        if (typeof PanelCache._clearKey !== "function") throw new Error("PanelCache._clearKey is not a function");
        if (typeof PanelCache._internal !== "function") throw new Error("PanelCache._internal is not a function");

        // Verify publish to QOL namespace
        if (typeof QOL !== "undefined") {
            if (typeof QOL.panelCache !== "object" || QOL.panelCache === null) throw new Error("QOL.panelCache not published");
            if (typeof QOL.getPanel !== "function") throw new Error("QOL.getPanel not published");
            if (typeof QOL.getList !== "function") throw new Error("QOL.getList not published");
            if (typeof QOL.getData !== "function") throw new Error("QOL.getData not published");
        }
    } catch(e) {
        $.Msg("[QOLLock][ERROR][ql_panelcache] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();

// ── Expose typed cache internals on State ──
// Runs after the IIFE, when both PanelCache (this file) and State (ql_state.js) are available.
if (typeof State !== "undefined" && State && typeof PanelCache !== "undefined" && PanelCache) {
    State._panelCache = PanelCache._internal();
}
