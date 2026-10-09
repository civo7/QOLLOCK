// OWNS: One context-local typed cache and instance-local native ID resolvers.
// DOES NOT OWN: Feature selection, presentation, schedules or shared runtime State.
// HUD-only include after utilities/state; legacy access names delegate here.
(() => {
    "use strict";
    const valid = QOL_UTILS.IsPanelValid, validList = QOL_UTILS.IsPanelListValid;
    const panels = new Map(), lists = new Map(), data = new Map(), resolved = new Map();
    function clearKey(key) { panels.delete(key); lists.delete(key); data.delete(key); resolved.delete(key); }
    function within(panel, owner) {
        try {
            for (let depth = 0; depth < 64 && valid(panel); depth++) {
                if (panel === owner) return true;
                panel = panel.GetParent();
            }
        } catch (_) {}
        return false;
    }
    const cache = {
        getPanel(key) {
            const panel = panels.get(key);
            if (valid(panel)) return panel;
            panels.delete(key); resolved.delete(key); return null;
        },
        setPanel(key, panel) {
            resolved.delete(key);
            if (valid(panel)) panels.set(key, panel);
            else panels.delete(key);
        },
        getList(key) {
            const list = lists.get(key);
            if (validList(list)) return list;
            lists.delete(key); return null;
        },
        setList(key, list) {
            if (Array.isArray(list)) lists.set(key, list);
            else lists.delete(key);
        },
        getData: key => data.get(key),
        setData: (key, value) => { data.set(key, value); },
        sweep() {
            let swept = 0;
            for (const [key, panel] of panels) if (!valid(panel)) { panels.delete(key); resolved.delete(key); swept++; }
            for (const [key, list] of lists) if (!validList(list)) { lists.delete(key); swept++; }
            return swept;
        },
        clear() { panels.clear(); lists.clear(); data.clear(); resolved.clear(); },
        resolve(parent, key, id) {
            if (!valid(parent)) { clearKey(key); return null; }
            const owner = resolved.get(key);
            let panel = owner && owner.parent === parent && owner.id === id ? panels.get(key) : null;
            if (!valid(panel) || !within(panel, parent)) panel = null;
            if (panel) {
                try {
                    // A native child may have been replaced while its old handle
                    // remains in a retired container within the same root.
                    const current = panel.GetParent().FindChild(id);
                    if (current !== panel) panel = null;
                } catch (_) { panel = null; }
            }
            if (!panel) {
                try { panel = parent.FindChildTraverse(id); } catch (_) { panel = null; }
                if (!valid(panel)) panel = null;
                if (panel) panels.set(key, panel); else panels.delete(key);
                resolved.set(key, { parent, id });
            }
            return panel;
        },
        createIdResolver(id, options = {}) {
            const refreshMs = options.refreshMs === undefined ? 5000 : Math.max(0, Number(options.refreshMs) || 0);
            const retryMs = options.retryMs === undefined ? 1000 : Math.max(0, Number(options.retryMs) || 0);
            const ownerPath = options.ownerPath || [];
            let root = null, parent = null, panel = null, nextSearchMs = 0, nextRetryMs = 0;
            function reset() { root = parent = panel = null; nextSearchMs = nextRetryMs = 0; }
            function preferred(searchRoot) {
                if (!ownerPath.length) return null;
                try {
                    let owner = searchRoot;
                    for (const step of ownerPath) {
                        const stepId = typeof step === "string" ? step : step.id;
                        if (stepId && owner.id === stepId) continue;
                        let child = null;
                        if (stepId) child = owner.FindChild(stepId);
                        else if (step.className) {
                            for (let i = 0; i < owner.GetChildCount(); i++) {
                                const candidate = owner.GetChild(i);
                                if (valid(candidate) && candidate.BHasClass(step.className)) { child = candidate; break; }
                            }
                        }
                        if (!valid(child)) { if (step.optional) continue; return null; }
                        owner = child;
                    }
                    const current = owner.FindChild(id);
                    return valid(current) ? current : null;
                } catch (_) { return null; }
            }
            function resolve(searchRoot, force) {
                if (!valid(searchRoot)) { reset(); return null; }
                if (root !== searchRoot) { reset(); root = searchRoot; }
                const now = Date.now(), current = preferred(root);
                if (current) {
                    panel = current;
                    try { parent = panel.GetParent(); } catch (_) { parent = null; }
                    nextSearchMs = now + refreshMs; nextRetryMs = 0; return panel;
                }
                if (!force && panel && now < nextSearchMs && within(parent, root)) {
                    try { const child = parent.FindChild(id); if (valid(child)) { panel = child; return panel; } } catch (_) {}
                }
                if (!force && !panel && now < nextRetryMs) return null;
                try { panel = root.FindChildTraverse(id); if (!valid(panel)) panel = null; parent = panel ? panel.GetParent() : null; }
                catch (_) { panel = parent = null; }
                nextSearchMs = now + refreshMs; nextRetryMs = panel ? 0 : now + retryMs; return panel;
            }
            return { resolve, reset };
        }
    };
    QOL.panelCache = cache;
    Object.assign(QOL, { getPanel: cache.getPanel, setPanel: cache.setPanel, getList: cache.getList, setList: cache.setList,
        getData: cache.getData, setData: cache.setData, panelCacheSweep: cache.sweep, panelCacheClear: cache.clear,
        panelCacheResolve: cache.resolve, getCachedPanel: cache.getPanel, resolveCachedPanel: cache.resolve,
        clearPanelCache: cache.clear, sweepStalePanelCache: cache.sweep });
    QOL.setCachedPanel = (key, value) => {
        clearKey(key);
        if (Array.isArray(value)) cache.setList(key, value);
        else cache.setPanel(key, value);
    };
    try { if (typeof window !== "undefined") window.PanelCache = cache; } catch (_) {}
    try { if (typeof globalThis !== "undefined") globalThis.PanelCache = cache; } catch (_) {}
})();
