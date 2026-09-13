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

    function activate(panel) {
        if (!isPanelAlive(panel)) return false;
        try { $.DispatchEvent("Activated", panel, "mouse"); return true; } catch (e1) {}
        try { $.DispatchEvent("Activated", panel); return true; } catch (e2) {}
        return false;
    }

    function isVisible(panel) {
        if (!isPanelAlive(panel)) return false;
        try {
            if (panel.visible === false || panel.visible === "false") return false;
            if (panel.BHasClass && (panel.BHasClass("hidden") || panel.BHasClass("Hidden") || panel.BHasClass("Collapsed"))) return false;
            return true;
        } catch (e) { return false; }
    }

    function readText(panel) {
        if (!isPanelAlive(panel)) return "";
        try {
            if (typeof panel.text === "string") return panel.text;
            if (panel.GetAttributeString) {
                var attr = panel.GetAttributeString("text", "");
                if (attr) return attr;
            }
        } catch (e) {}
        return "";
    }

    function readTextDeep(panel, maxDepth) {
        if (!isPanelAlive(panel)) return "";
        var depth = typeof maxDepth === "number" ? maxDepth : 4;
        var direct = readText(panel);
        if (direct) return direct;
        if (depth <= 0 || !panel.Children) return "";
        var kids = panel.Children();
        for (var i = 0; i < kids.length; i++) {
            var t = readTextDeep(kids[i], depth - 1);
            if (t) return t;
        }
        return "";
    }

    function readId(panel) {
        if (!panel) return "";
        try { return panel.id ? String(panel.id) : ""; } catch (e) { return ""; }
    }

    function hasClassToken(panel, token) {
        if (!isPanelAlive(panel) || !token) return false;
        try {
            return typeof panel.BHasClass === "function" && panel.BHasClass(token);
        } catch (e) { return false; }
    }

    function findChild(parent, id) {
        if (!isPanelAlive(parent) || !id) return null;
        try { return parent.FindChild ? parent.FindChild(id) : null; } catch (e) { return null; }
    }

    function findTraverse(root, id) {
        if (!isPanelAlive(root) || !id) return null;
        try { return root.FindChildTraverse ? root.FindChildTraverse(id) : null; } catch (e) { return null; }
    }

    var QOL_WASH_COLOR_PALETTE = [
        "",
        "#f7f4e8",
        "#bfc7cf",
        "#33363f",
        "#ff3b47",
        "#ff6f61",
        "#ff8a2a",
        "#ffb52e",
        "#ffe45c",
        "#a8f04f",
        "#45d66b",
        "#63f0b5",
        "#24c6a8",
        "#44e3ff",
        "#64bfff",
        "#3f78ff",
        "#6157ff",
        "#9b5cff",
        "#c15cff",
        "#ff4de3",
        "#ff78bd",
        "#ff5d89",
        "#9a6743",
        "#d9a441",
        "#8cff4f",
        "#7c4dff",
        "#b8142f",
        "#b9f4ff",
        "#d7b2ff",
        "#05070a"
    ];

    function normalizePaletteIndex(value) {
        var numeric = Math.round(Number(value));
        if (!isFinite(numeric)) numeric = 0;
        if (numeric < 0) numeric = 0;
        if (numeric >= QOL_WASH_COLOR_PALETTE.length) numeric = 0;
        return numeric;
    }

    function resolvePaletteColor(value) {
        var index = normalizePaletteIndex(value);
        var color = QOL_WASH_COLOR_PALETTE[index] || "";
        return color ? String(color) : "";
    }

    function setWashColor(panel, color) {
        if (!isPanelAlive(panel)) return false;
        try {
            if (color) {
                panel.style.washColor = String(color);
            } else {
                panel.ClearPropertyFromCode("wash-color");
                panel.style.washColor = "";
            }
            return true;
        } catch (e) { return false; }
    }

    function setWashColorFromPalette(panel, value) {
        var color = resolvePaletteColor(value);
        return setWashColor(panel, color);
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
        findChild: findChild,
        findTraverse: findTraverse,
        setClass: setClass,
        setVisible: setVisible,
        syncStyles: syncStyles,
        clearStyleProperty: clearStyleProperty,
        activate: activate,
        isVisible: isVisible,
        readText: readText,
        readTextDeep: readTextDeep,
        readId: readId,
        hasClassToken: hasClassToken,
        setWashColor: setWashColor,
        setWashColorFromPalette: setWashColorFromPalette,
        normalizePaletteIndex: normalizePaletteIndex,
        resolvePaletteColor: resolvePaletteColor,
        washColorPalette: QOL_WASH_COLOR_PALETTE
    };

    QOL.core = QOL.core || {};
    QOL.core.panel = panelApi;
    QOL.ui = QOL.ui || {};
    QOL.ui.PanelHelpers = panelApi;

    // Backward-compat aliases on root QOL namespace
    QOL.activatePanelSafe = activate;
    QOL.isPanelVisibleMaybe = isVisible;
    QOL.readPanelTextMaybe = readText;
    QOL.readPanelTextDeepMaybe = readTextDeep;
    QOL.readPanelIdTextMaybe = readId;
    QOL.panelHasClassToken = hasClassToken;
    QOL.setWashColorSafe = setWashColor;
    QOL.resolveWashColorFromPalette = resolvePaletteColor;
    QOL.normalizePaletteColorIndex = normalizePaletteIndex;
    QOL.washColorPalette = QOL_WASH_COLOR_PALETTE;

    $.Msg("[QOLLock] core/ql_panel_helpers: attached to QOL.core.panel and QOL.ui.PanelHelpers");
})();
