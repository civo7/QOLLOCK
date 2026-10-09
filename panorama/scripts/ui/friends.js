// OWNS: Escape-context friend search handlers, filter classes and one retry loop.
// Native categories, entries, names and visibility remain game-owned.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const context = $.GetContextPanel();
    const hiddenClass = "QOLFriendSearchHidden";
    const hidden = new Set();
    const retiredClearHosts = new Set();
    let owner = null, root = null, pending = null, generation = 0, stopped = false;

    function setClass(panel, name, value) {
        if (!P.isAlive(panel)) return true;
        P.setClass(panel, name, value);
        try { return panel.BHasClass(name) === value; } catch (_) { return false; }
    }
    function releaseHidden(panel) {
        if (setClass(panel, hiddenClass, false)) hidden.delete(panel);
    }
    function release() {
        if (owner) retiredClearHosts.add(owner.clearHost);
        owner = null;
        for (const panel of hidden) releaseHidden(panel);
        for (const panel of retiredClearHosts) {
            if (setClass(panel, "showSearchClearButton", false)) retiredClearHosts.delete(panel);
        }
    }
    function source() {
        if (stopped || !P.isAlive(context)) return null;
        const currentRoot = P.findRoot(context);
        if (!currentRoot || (root && currentRoot !== root)) return null;
        root = currentRoot;
        const input = P.findTraverse(root, "FriendSearchInput");
        if (!P.isAlive(input)) return null;
        try {
            const clearHost = input.GetParent();
            const list = clearHost && clearHost.GetParent();
            if (!P.isAlive(list) || list.paneltype !== "CitadelFriendsList") return null;
            const clear = P.findChild(clearHost, "FriendSearchClear");
            const categories = P.findChild(list, "FriendsCategories");
            return clear && categories ? { input, clear, clearHost, categories } : null;
        } catch (_) { return null; }
    }
    function matches(a, b) {
        return !!a && !!b && ["input", "clear", "clearHost", "categories"].every(key => a[key] === b[key]);
    }
    function isCurrent(record, token) {
        return !stopped && token === generation && owner === record && matches(record, source());
    }
    function render(record) {
        const entries = new Set();
        try {
            const query = String(record.input.text || "").toLowerCase();
            for (const category of record.categories.Children()) {
                // Native FriendsCategory snippet owns this direct child ID.
                const container = P.findChild(category, "FriendEntries");
                if (!container) continue;
                for (const entry of container.Children()) {
                    entries.add(entry);
                    const name = P.readTextDeep(P.findTraverse(entry, "UserName"));
                    const hide = !!query && !!name && !name.toLowerCase().includes(query);
                    if (hide) { hidden.add(entry); setClass(entry, hiddenClass, true); }
                    else releaseHidden(entry);
                }
            }
            setClass(record.clearHost, "showSearchClearButton", !!query);
            for (const entry of hidden) if (!entries.has(entry)) releaseHidden(entry);
        } catch (_) { /* Retry replaced native children on the next update. */ }
    }
    function clear(record) {
        try {
            record.input.text = "";
            if (record.input.ClearSelection) record.input.ClearSelection();
        } catch (_) { return; }
        render(record);
    }
    function bindFriendsSearchHandlers() {
        const next = source();
        if (!matches(owner, next)) {
            release();
            if (!next) return false;
            const token = generation;
            try {
                next.input.SetPanelEvent("ontextentrychange", () => {
                    if (isCurrent(next, token)) render(next);
                });
                next.clear.SetPanelEvent("onactivate", () => {
                    if (isCurrent(next, token)) clear(next);
                });
                owner = next;
            } catch (_) { return false; }
        }
        // Retired classes can fail to clear while their handles remain alive.
        for (const panel of retiredClearHosts) {
            if (setClass(panel, "showSearchClearButton", false)) retiredClearHosts.delete(panel);
        }
        render(owner);
        return true;
    }
    function filterFriendsList() { return bindFriendsSearchHandlers(); }
    function clearFriendsSearch() {
        if (bindFriendsSearchHandlers()) clear(owner);
    }
    function dispose() {
        stopped = true;
        generation++;
        if (pending !== null) {
            try { $.CancelScheduled(pending); } catch (_) {}
            pending = null;
        }
        release();
    }
    function schedule() {
        if (pending !== null || stopped || typeof $.Schedule !== "function") return;
        const token = generation;
        pending = $.Schedule(0.5, () => {
            if (stopped || token !== generation) return;
            pending = null;
            if (!P.isAlive(context) || P.findRoot(context) !== root) { dispose(); return; }
            bindFriendsSearchHandlers();
            schedule();
        });
    }
    function ensureFriendsSearchHandlers() {
        if (!P.isAlive(context)) return false;
        if (stopped) { stopped = false; root = null; }
        const bound = bindFriendsSearchHandlers();
        schedule();
        return bound;
    }

    Q.ui.friends?.dispose?.();
    Q.ui.friends = { filterFriendsList, clearFriendsSearch, bindFriendsSearchHandlers, ensureFriendsSearchHandlers, dispose };
    globalThis.QOLFilterFriendsList = filterFriendsList;
    globalThis.QOLClearFriendsSearch = clearFriendsSearch;
    globalThis.QOLBindFriendsSearchHandlers = bindFriendsSearchHandlers;
    globalThis.QOLEnsureFriendsSearchHandlers = ensureFriendsSearchHandlers;
})();
