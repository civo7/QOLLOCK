// =============================================================================
// QOLLOCK — core/ql_panel_helpers.js
// =============================================================================
// OWNS:        Safe panel utility functions: isPanelAlive, findHud, syncStyles,
//              safeCreatePanel, safeDeletePanel, setClass, setVisible.
//              isPanelAlive uses typeof check (not truthy) — mandatory for
//              correct destroyed-panel detection.
// DOES NOT OWN: Panel caching (PanelCache), feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js (QOL.core, QOL.ui)
// USED BY:     Feature manifests, settings renderer
// LOAD ORDER:  5th — after ql_scheduler.js
//
// Boundary validation: Checks QOL.core and QOL.ui exist.
// =============================================================================

(function () {
    "use strict";

    if (!QOL || !QOL.core || !QOL.ui) {
        $.Msg("[QOLLock] core/ql_panel_helpers: namespace not found — aborting. " +
              "Is core/ql_namespace.js loaded first?");
        return;
    }

    // -- Panel safety --
    function isPanelAlive(panel) {
        return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
    }

    function safeCreatePanel(type, parent, id) {
        if (!isPanelAlive(parent)) return null;
        if (typeof type !== "string" || !type) return null;
        try {
            return $.CreatePanel(type, parent, id || "");
        } catch (e) {
            $.Msg("[QOLLock][WARN][PanelHelpers] CreatePanel('" + type +
                  "') threw: " + (e && e.message ? e.message : String(e)));
            return null;
        }
    }

    function safeDeletePanel(panel) {
        if (!isPanelAlive(panel)) return;
        try { panel.DeleteAsync(0); }
        catch (e) { /* panel may already be destroyed */ }
    }

    // -- Hud resolution --
    //
    // Cached, because this is called from poll loops and is not cheap when it
    // fails. The first attempt — ctx.FindChildTraverse("Hud") — MISSES whenever the
    // context panel is itself the Hud panel, which is the normal case in the HUD
    // context: FindChildTraverse never returns the panel it was called on. A miss
    // walks the whole subtree before returning null, so the uncached version cost
    // two full-tree walks (one from the context panel, one from the absolute root)
    // every time a caller asked.
    //
    // The Hud panel lives for the whole context, so one resolution is enough;
    // isPanelAlive re-validates on every call and a torn-down panel is re-resolved
    // on the next one.
    var _cachedHud = null;

    function findHud() {
        if (isPanelAlive(_cachedHud)) return _cachedHud;
        _cachedHud = null;

        var MAX_DEPTH = 64;
        try {
            var ctx = $.GetContextPanel();
            if (!isPanelAlive(ctx)) return null;
            var hud = ctx.FindChildTraverse("Hud");
            if (isPanelAlive(hud)) { _cachedHud = hud; return hud; }
            var absRoot = ctx;
            var depth = 0;
            while (depth < MAX_DEPTH) {
                var parent = absRoot.GetParent();
                if (!parent || !isPanelAlive(parent)) break;
                absRoot = parent;
                depth++;
            }
            hud = absRoot.FindChildTraverse("Hud");
            if (isPanelAlive(hud)) { _cachedHud = hud; return hud; }
            // The context panel IS the Hud in the HUD context, where neither search
            // can return it. Recognise that rather than reporting no Hud at all.
            if (ctx.id === "Hud") { _cachedHud = ctx; return ctx; }
            return null;
        } catch (e) {
            return null;
        }
    }

    // -- Class helpers --
    function setClass(panel, className, active) {
        if (!isPanelAlive(panel)) return false;
        if (typeof className !== "string" || !className) return false;
        try {
            var has = panel.BHasClass(className);
            if (active && !has) { panel.SetHasClass(className, true); return true; }
            if (!active && has) { panel.SetHasClass(className, false); return true; }
        } catch (e) {
            $.Msg("[QOLLock][WARN][PanelHelpers] setClass('" + className +
                  "') threw: " + (e && e.message ? e.message : String(e)));
        }
        return false;
    }

    function setVisible(panel, visible) {
        if (!isPanelAlive(panel)) return;
        try { panel.visible = !!visible; }
        catch (e) { /* panel may be destroyed */ }
    }

    // -- Style helpers --
    function syncStyles(panel, styles, lastSig) {
        if (!isPanelAlive(panel)) return { changed: false, sig: lastSig || "" };
        if (typeof styles !== "object" || !styles) return { changed: false, sig: lastSig || "" };
        var parts = [];
        for (var prop in styles) {
            if (styles.hasOwnProperty(prop)) { parts.push(prop + "=" + styles[prop]); }
        }
        var sig = parts.join(";");
        if (sig === lastSig) return { changed: false, sig: sig };
        for (var prop2 in styles) {
            if (styles.hasOwnProperty(prop2)) {
                try { panel.style[prop2] = styles[prop2]; }
                catch (e) { /* property may be read-only */ }
            }
        }
        return { changed: true, sig: sig };
    }

    function clearStyleProperty(panel, prop) {
        if (!isPanelAlive(panel)) return false;
        if (typeof prop !== "string") return false;
        try { panel.ClearPropertyFromCode(prop); return true; }
        catch (e) { return false; }
    }

    function findRoot() {
        var ctx = $.GetContextPanel();
        if (!isPanelAlive(ctx)) return null;
        var curr = ctx;
        while (curr.GetParent && isPanelAlive(curr.GetParent())) {
            curr = curr.GetParent();
        }
        return curr;
    }

    // -- Attach to namespace --
    var panelApi = {
        isAlive: isPanelAlive,
        isPanelAlive: isPanelAlive,
        create: safeCreatePanel,
        createPanel: safeCreatePanel,
        delete: safeDeletePanel,
        deletePanel: safeDeletePanel,
        findRoot: findRoot,
        findHud: findHud,
        setClass: setClass,
        setVisible: setVisible,
        syncStyles: syncStyles,
        clearStyleProperty: clearStyleProperty
    };

    QOL.core = QOL.core || {};
    QOL.core.panel = panelApi;
    QOL.ui = QOL.ui || {};
    QOL.ui.PanelHelpers = panelApi;

    $.Msg("[QOLLock] core/ql_panel_helpers: attached to QOL.core.panel and QOL.ui.PanelHelpers");
})();
