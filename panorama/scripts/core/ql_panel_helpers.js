// =============================================================================
// QOLLOCK — core/ql_panel_helpers.js
// =============================================================================
// OWNS:        Safe panel utility functions: isPanelAlive, findHud, syncStyles,
//              safeCreatePanel, safeDeletePanel, setClass, setVisible and
//              instance-local ownership of exclusively QOL-created trees.
//              isPanelAlive uses typeof check (not truthy) — mandatory for
//              correct destroyed-panel detection.
// DOES NOT OWN: Panel caching (PanelCache), feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js (QOL.core, QOL.ui)
// USED BY:     Feature manifests, settings renderer
// LOAD ORDER:  5th — after ql_scheduler.js
//
// Boundary validation: Checks QOL.core and QOL.ui exist.
// =============================================================================

(() => {
    "use strict";

    if (!QOL || !QOL.core || !QOL.ui) {
        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLock] core/ql_panel_helpers: namespace not found — aborting. " +
                  "Is core/ql_namespace.js loaded first?");
        }
        return;
    }

    // -- Panel safety --
    const isPanelAlive = QOL_UTILS.IsPanelValid;

    const safeCreatePanel = (type, parent, id, properties) => {
        if (!isPanelAlive(parent) || typeof type !== "string" || !type) return null;
        try {
            if (properties) {
                return $.CreatePanel(type, parent, id || "", properties);
            }
            return $.CreatePanel(type, parent, id || "");
        } catch (e) {
            $.Msg(`[QOLLock][WARN][PanelHelpers] CreatePanel('${type}') threw: ${e && e.message ? e.message : String(e)}`);
            return null;
        }
    };

    const safeDeletePanel = (panel) => {
        if (!isPanelAlive(panel)) return;
        try {
            panel.DeleteAsync(0);
        } catch (_) {
            /* panel may already be destroyed */
        }
    };

    // -- Hud resolution --
    let _cachedHud = null;
    let _cachedHudContext = null;

    const findHud = (preferredRoot) => {
        const MAX_DEPTH = 64;
        try {
            const ctx = preferredRoot || $.GetContextPanel();
            if (!isPanelAlive(ctx)) return null;
            if (!preferredRoot && ctx === _cachedHudContext && isPanelAlive(_cachedHud)) return _cachedHud;
            if (!preferredRoot) { _cachedHud = null; _cachedHudContext = ctx; }
            if (ctx.id === "Hud" || ctx.paneltype === "CitadelHud") {
                if (!preferredRoot) _cachedHud = ctx;
                return ctx;
            }
            let hud = ctx.FindChildTraverse ? ctx.FindChildTraverse("Hud") : null;
            if (isPanelAlive(hud)) {
                if (!preferredRoot) _cachedHud = hud;
                return hud;
            }
            let absRoot = ctx;
            let depth = 0;
            while (depth < MAX_DEPTH) {
                const parent = absRoot.GetParent ? absRoot.GetParent() : null;
                if (!parent || !isPanelAlive(parent)) break;
                absRoot = parent;
                depth++;
            }
            if (absRoot && (absRoot.id === "Hud" || absRoot.paneltype === "CitadelHud")) {
                if (!preferredRoot) _cachedHud = absRoot;
                return absRoot;
            }
            hud = (absRoot && absRoot.FindChildTraverse) ? absRoot.FindChildTraverse("Hud") : null;
            if (isPanelAlive(hud)) {
                if (!preferredRoot) _cachedHud = hud;
                return hud;
            }
            if (ctx.id === "Hud" || ctx.paneltype === "CitadelHud" || (ctx.BHasClass && ctx.BHasClass("WindowRoot"))) {
                return ctx;
            }
            // A temporary menu/loading root must not mask a HUD created later.
            return absRoot || ctx;
        } catch (_) {
            return null;
        }
    };

    // -- Class helpers --
    const setClass = (panel, className, active) => {
        if (!isPanelAlive(panel) || typeof className !== "string" || !className) return false;
        try {
            const has = panel.BHasClass(className);
            if (active && !has) {
                panel.SetHasClass(className, true);
                return true;
            }
            if (!active && has) {
                panel.SetHasClass(className, false);
                return true;
            }
        } catch (e) {
            $.Msg(`[QOLLock][WARN][PanelHelpers] setClass('${className}') threw: ${e && e.message ? e.message : String(e)}`);
        }
        return false;
    };

    const setVisible = (panel, visible) => {
        if (!isPanelAlive(panel)) return;
        try {
            panel.visible = Boolean(visible);
        } catch (_) {}
    };

    // -- Style helpers --
    const syncStyles = (panel, styles, lastSig) => {
        if (!isPanelAlive(panel) || typeof styles !== "object" || !styles) {
            return { changed: false, sig: lastSig || "" };
        }
        const parts = [];
        for (const prop of Object.keys(styles)) {
            parts.push(`${prop}=${styles[prop]}`);
        }
        const sig = parts.join(";");
        if (sig === lastSig) return { changed: false, sig };
        let succeeded = true;
        for (const prop of Object.keys(styles)) {
            try {
                panel.style[prop] = styles[prop];
            } catch (_) { succeeded = false; }
        }
        // Never cache a partial write as applied: the next call must retry.
        return { changed: true, sig: succeeded ? sig : null };
    };

    const clearStyleProperty = (panel, prop) => {
        if (!isPanelAlive(panel) || typeof prop !== "string") return false;
        try {
            return panel.ClearPropertyFromCode(prop.replace(/[A-Z]/g, c => "-" + c.toLowerCase())) !== false;
        } catch (_) {
            return false;
        }
    };

    const findRoot = (panel) => {
        try {
            let curr = panel || $.GetContextPanel();
            if (!isPanelAlive(curr)) return null;
            while (curr.GetParent) {
                const parent = curr.GetParent();
                if (!isPanelAlive(parent)) break;
                curr = parent;
            }
            return curr;
        } catch (_) { return null; }
    };

    const activate = (panel) => {
        if (!isPanelAlive(panel)) return false;
        try {
            $.DispatchEvent("Activated", panel, "mouse");
            return true;
        } catch (_) {}
        try {
            $.DispatchEvent("Activated", panel);
            return true;
        } catch (_) {}
        return false;
    };

    const isVisible = (panel) => {
        if (!isPanelAlive(panel)) return false;
        try {
            if (panel.visible === false || panel.visible === "false") return false;
            if (panel.BHasClass && (panel.BHasClass("hidden") || panel.BHasClass("Hidden") || panel.BHasClass("Collapsed"))) {
                return false;
            }
            return true;
        } catch (_) {
            return false;
        }
    };

    const readText = (panel) => {
        if (!isPanelAlive(panel)) return "";
        try {
            if (typeof panel.text === "string") return panel.text;
            if (panel.GetAttributeString) {
                const attr = panel.GetAttributeString("text", "");
                if (attr) return attr;
            }
        } catch (_) {}
        return "";
    };

    const readTextDeep = (panel, maxDepth = 4) => {
        if (!isPanelAlive(panel)) return "";
        const direct = readText(panel);
        if (direct) return direct;
        if (maxDepth <= 0 || !panel.Children) return "";
        let kids;
        try { kids = panel.Children(); } catch (_) { return ""; }
        for (let i = 0; i < kids.length; i++) {
            const t = readTextDeep(kids[i], maxDepth - 1);
            if (t) return t;
        }
        return "";
    };

    const readId = (panel) => {
        if (!panel) return "";
        try {
            return panel.id ? String(panel.id) : "";
        } catch (_) {
            return "";
        }
    };

    const hasClassToken = (panel, token) => {
        if (!isPanelAlive(panel) || !token) return false;
        try {
            return typeof panel.BHasClass === "function" && panel.BHasClass(token);
        } catch (_) {
            return false;
        }
    };

    const findChild = (parent, id) => {
        if (!isPanelAlive(parent) || !id) return null;
        try {
            return parent.FindChild ? parent.FindChild(id) : null;
        } catch (_) {
            return null;
        }
    };

    const findTraverse = (root, id) => {
        if (!isPanelAlive(root) || !id) return null;
        try {
            return root.FindChildTraverse ? root.FindChildTraverse(id) : null;
        } catch (_) {
            return null;
        }
    };

    // Instance-local ownership of exclusively QOL-created IDs. Native parent
    // selection, content, signatures and scheduling stay with the caller.
    const createOwnedTree = () => {
        const nodes = new Map(), retired = new Set();
        const retire = panel => {
            if (!isPanelAlive(panel)) return;
            setVisible(panel, false);
            safeDeletePanel(panel);
            retired.add(panel);
        };
        const discard = id => {
            const record = nodes.get(id);
            if (!record) return;
            nodes.delete(id);
            // Expected ancestry tracks children even after native reparenting.
            for (const [childId, child] of [...nodes]) {
                if (child.parent === record.panel) discard(childId);
            }
            retire(record.panel);
        };
        const sweep = () => {
            const previousSize = nodes.size;
            for (const [id, record] of [...nodes]) {
                if (!isPanelAlive(record.panel) || !isPanelAlive(record.parent) ||
                    findChild(record.parent, id) !== record.panel) discard(id);
            }
            for (const panel of retired) {
                if (!isPanelAlive(panel)) retired.delete(panel);
                else safeDeletePanel(panel);
            }
            return nodes.size === previousSize;
        };
        const child = (parent, type, id, properties) => {
            if (!id) return null;
            const next = findChild(parent, id);
            const previous = nodes.get(id);
            if (previous && (previous.panel !== next || previous.parent !== parent)) discard(id);
            if (!isPanelAlive(parent)) return null;
            // A rapid re-enable can still find the previous instance's tree
            // before DeleteAsync finishes. Never adopt that pending deletion.
            if (isPanelAlive(next) && (!nodes.has(id) || retired.has(next))) { retire(next); return null; }
            const creation = { hittest: "false", hittestchildren: "false", ...properties };
            const panel = isPanelAlive(next) ? next : safeCreatePanel(type, parent, id, creation);
            if (!isPanelAlive(panel)) return null;
            if (!nodes.has(id)) nodes.set(id, { panel, parent });
            // Keep the owned node recorded before potentially failing native
            // property writes; later reconciliation retries these flags.
            for (const key of ["hittest", "hittestchildren"]) {
                if ((creation[key] === false || creation[key] === "false") && panel[key] !== false) panel[key] = false;
            }
            return panel;
        };
        const clear = () => { for (const id of [...nodes.keys()].reverse()) discard(id); sweep(); };
        const dispose = () => { clear(); retired.clear(); };
        return { child, sweep, remove: discard, clear, dispose };
    };

    // ql_utils.js is loaded first in every context that includes panel helpers.
    const QOL_WASH_COLOR_PALETTE = QOL_UTILS.QOL_WASH_COLOR_PALETTE;
    const normalizePaletteIndex = QOL_UTILS.NormalizePaletteColorIndex;
    const resolvePaletteColor = QOL_UTILS.ResolveWashColorFromPalette;

    const setWashColor = (panel, color) => {
        if (!isPanelAlive(panel)) return false;
        try {
            if (color) {
                panel.style.washColor = String(color);
            } else {
                panel.ClearPropertyFromCode("wash-color");
                panel.style.washColor = "";
            }
            return true;
        } catch (_) {
            return false;
        }
    };

    const setWashColorFromPalette = (panel, value) => {
        const color = resolvePaletteColor(value);
        return setWashColor(panel, color);
    };

    // -- Attach to namespace --
    const panelApi = {
        isAlive: isPanelAlive,
        isPanelAlive,
        create: safeCreatePanel,
        createPanel: safeCreatePanel,
        delete: safeDeletePanel,
        deletePanel: safeDeletePanel,
        createOwnedTree,
        findRoot,
        findHud,
        findChild,
        findTraverse,
        setClass,
        setVisible,
        syncStyles,
        clearStyleProperty,
        activate,
        isVisible,
        readText,
        readTextDeep,
        readId,
        hasClassToken,
        setWashColor,
        setWashColorFromPalette,
        normalizePaletteIndex,
        resolvePaletteColor,
        washColorPalette: QOL_WASH_COLOR_PALETTE
    };

    QOL.core = QOL.core || {};
    QOL.core.panel = panelApi;
    QOL.core.PanelHelpers = panelApi;
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

    if (typeof $ !== "undefined" && $.Msg) {
        $.Msg("[QOLLock] core/ql_panel_helpers: attached to QOL.core.panel and QOL.ui.PanelHelpers");
    }
})();
