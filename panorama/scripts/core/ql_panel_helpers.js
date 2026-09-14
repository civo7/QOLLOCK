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

(() => {
    "use strict";

    if (!QOL || !QOL.core || !QOL.ui) {
        $.Msg("[QOLLock] core/ql_panel_helpers: namespace not found — aborting. " +
              "Is core/ql_namespace.js loaded first?");
        return;
    }

    // -- Panel safety --
    const isPanelAlive = (panel) => {
        return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
    };

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

    const findHud = (preferredRoot) => {
        if (!preferredRoot && isPanelAlive(_cachedHud)) return _cachedHud;

        const MAX_DEPTH = 64;
        try {
            const ctx = preferredRoot || $.GetContextPanel();
            if (!isPanelAlive(ctx)) return null;
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
                if (!preferredRoot) _cachedHud = ctx;
                return ctx;
            }
            if (!preferredRoot) {
                _cachedHud = absRoot || ctx;
                return _cachedHud;
            }
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
        for (const prop of Object.keys(styles)) {
            try {
                panel.style[prop] = styles[prop];
            } catch (_) {}
        }
        return { changed: true, sig };
    };

    const clearStyleProperty = (panel, prop) => {
        if (!isPanelAlive(panel) || typeof prop !== "string") return false;
        try {
            panel.ClearPropertyFromCode(prop);
            return true;
        } catch (_) {
            return false;
        }
    };

    const findRoot = () => {
        const ctx = $.GetContextPanel();
        if (!isPanelAlive(ctx)) return null;
        let curr = ctx;
        while (curr.GetParent && isPanelAlive(curr.GetParent())) {
            curr = curr.GetParent();
        }
        return curr;
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
        const kids = panel.Children();
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

    const QOL_WASH_COLOR_PALETTE = [
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

    const normalizePaletteIndex = (value) => {
        let numeric = Math.round(Number(value));
        if (!Number.isFinite(numeric) || numeric < 0 || numeric >= QOL_WASH_COLOR_PALETTE.length) {
            numeric = 0;
        }
        return numeric;
    };

    const resolvePaletteColor = (value) => {
        const index = normalizePaletteIndex(value);
        return String(QOL_WASH_COLOR_PALETTE[index] || "");
    };

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
