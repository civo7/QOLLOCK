// =============================================================================
// QOLLOCK — panorama/scripts/ql_settings_tooltips.js
// =============================================================================
// Clean, robust ES6 rewrite of the settings floating tooltip subsystem.
// OWNS: Floating tooltip panel, row hover show/hide, layout-safe positioning,
//       perf impact calculation helpers, created-by/voice metadata helpers.
// DOES NOT OWN: Tab layouts, declarative renderer, window shell, config persistence.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------
    const TIER_NONE = "none";
    const TIER_LOW = "low";
    const TIER_MEDIUM = "medium";
    const TIER_HIGH = "high";

    const TIER_ORDER = { none: 0, low: 1, medium: 2, high: 3 };
    const TIER_LABELS = { none: "None", low: "Low", medium: "Medium", high: "High" };

    const COLD_HOVER_DELAY_SEC = 0.08;
    const DEFER_HIDE_SEC = 0.06;
    const WARM_RECENT_MS = 250;
    const SCROLL_SUPPRESS_MS = 250;
    const TRACK_INTERVAL_SEC = 0.03;
    const GAP = 8;
    const EDGE_MARGIN = 8;

    const THEME_CLASS = "QOLSettingsTooltipThemeActive";

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------
    let _panel = null;
    let _bodyLabel = null;
    let _perfPrefixLabel = null;
    let _perfValueLabel = null;
    let _creatorPrefixLabel = null;
    let _creatorValueLabel = null;
    let _voiceAuthorPrefixLabel = null;
    let _voiceAuthorValueLabel = null;
    let _voiceActorPrefixLabel = null;
    let _voiceActorValueLabel = null;

    let _activeAnchor = null;
    let _lastVisibleTime = 0;
    let _suppressUntilMs = 0;
    let _lastAnchorLocalY = NaN;
    let _lastListScrollY = NaN;
    let _lastHostScrollY = NaN;
    let _lastThumbScrollY = NaN;
    let _lastX = NaN;
    let _lastY = NaN;
    let _hoverCursorY = NaN;

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------
    const isAlive = QOL_UTILS.IsPanelValid;

    const localize = (text, keepRaw = true) => {
        if (!text) return "";
        if (typeof LocalizeSettingsText === "function") return LocalizeSettingsText(text, keepRaw);
        if (typeof $.Localize === "function" && String(text).startsWith("#")) return $.Localize(text);
        return String(text);
    };

    const getHost = () => {
        const ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        if (!ctx) return null;
        const win = ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsWindow") : null;
        return (win && isAlive(win.GetParent?.())) ? win.GetParent() : ctx;
    };

    const captureCursorY = () => {
        try {
            const gameUi = (typeof GameUI !== "undefined") ? GameUI : (typeof globalThis !== "undefined" ? globalThis.GameUI : null);
            if (gameUi && typeof gameUi.GetCursorPosition === "function") {
                const c = gameUi.GetCursorPosition();
                if (c && typeof c.y === "number" && isFinite(c.y) && c.y > 0) {
                    return c.y;
                }
            }
        } catch (_) {}
        return NaN;
    };

    const readCursorY = () => {
        if (isFinite(_hoverCursorY) && _hoverCursorY > 0) {
            return _hoverCursorY;
        }
        return captureCursorY();
    };

    const readPanelScrollOffsetY = (panel) => {
        if (!isAlive(panel)) return 0;
        try {
            const sy0 = Number(panel.scrolloffset_y);
            if (isFinite(sy0) && sy0 !== 0) return sy0;
        } catch (_) {}
        try {
            const syA = Number(panel.actualscrolloffset_y);
            if (isFinite(syA) && syA !== 0) return syA;
        } catch (_) {}
        try {
            const sy1 = Number(panel.scrolloffsetY);
            if (isFinite(sy1) && sy1 !== 0) return sy1;
        } catch (_) {}
        try {
            const sy2 = Number(panel.ScrollOffsetY);
            if (isFinite(sy2) && sy2 !== 0) return sy2;
        } catch (_) {}
        try {
            if (typeof panel.GetScrollOffset === "function") {
                const so = panel.GetScrollOffset();
                if (so && so.length >= 2) {
                    const sy3 = Number(so[1]);
                    if (isFinite(sy3) && sy3 !== 0) return sy3;
                }
            }
        } catch (_) {}
        return 0;
    };

    const getListScrollOffsetY = (list) => {
        if (!isAlive(list)) return 0;
        const direct = readPanelScrollOffsetY(list);
        if (isFinite(direct) && direct > 0) return direct;

        try {
            let thumb = null;
            const scrollBar = list.FindChildTraverse ? list.FindChildTraverse("VerticalScrollBar") : null;
            if (scrollBar && scrollBar.FindChildTraverse) {
                thumb = scrollBar.FindChildTraverse("ScrollThumb");
            }
            if (!thumb && list.FindChildTraverse) {
                thumb = list.FindChildTraverse("ScrollThumb");
            }
            if (!thumb && list.FindChildrenWithClassTraverse) {
                const thumbs = list.FindChildrenWithClassTraverse("ScrollThumb");
                if (thumbs && thumbs.length > 0) thumb = thumbs[0];
            }

            if (isAlive(thumb)) {
                let sty = Number(thumb.actualyoffset);
                if (!isFinite(sty)) sty = Number(thumb.scrolloffset_y);
                if (!isFinite(sty)) sty = Number(thumb.actualscrolloffset_y);
                if (!isFinite(sty) && typeof globalThis.GetPanelYOffsetWithinAncestor === "function") {
                    sty = Number(globalThis.GetPanelYOffsetWithinAncestor(thumb, scrollBar || list));
                }
                const barH = Number(scrollBar?.actuallayoutheight) || Number(list.actuallayoutheight) || 500;
                const thumbH = Number(thumb.actuallayoutheight) || 40;
                const track = Math.max(1, barH - thumbH);
                if (isFinite(sty) && sty > 0 && track > 0) {
                    let contentH = 0;
                    if (typeof list.Children === "function") {
                        const kids = list.Children();
                        for (let i = 0; i < kids.length; i++) {
                            const k = kids[i];
                            if (k && k.id !== "VerticalScrollBar" && k.id !== "HorizontalScrollBar") {
                                const kh = Number(k.actuallayoutheight);
                                if (isFinite(kh) && kh > contentH) contentH = kh;
                            }
                        }
                    }
                    const listH = Number(list.actuallayoutheight) || 500;
                    if (contentH > listH) {
                        const ratio = Math.max(0, Math.min(1, sty / track));
                        return ratio * (contentH - listH);
                    }
                }
            }
        } catch (_) {}
        return 0;
    };

    const getAncestorOffset = (panel, ancestor, axis) => {
        if (!isAlive(panel) || !isAlive(ancestor)) return 0;
        if (axis === "x" && typeof globalThis.GetPanelXOffsetWithinAncestor === "function") {
            return Number(globalThis.GetPanelXOffsetWithinAncestor(panel, ancestor)) || 0;
        }
        if (axis === "y" && typeof globalThis.GetPanelYOffsetWithinAncestor === "function") {
            return Number(globalThis.GetPanelYOffsetWithinAncestor(panel, ancestor)) || 0;
        }
        return 0;
    };

    const isDescendantOf = (panel, ancestor) => {
        if (!isAlive(panel) || !isAlive(ancestor)) return false;
        let cur = panel;
        let guard = 0;
        while (cur && guard < 64) {
            if (cur === ancestor) return true;
            if (typeof cur.GetParent !== "function") break;
            cur = cur.GetParent();
            guard++;
        }
        return false;
    };

    const getVisualAnchorY = (anchor, list, host) => {
        if (!isAlive(anchor)) return NaN;

        try {
            if (typeof anchor.GetPositionWithinAncestor === "function" && isAlive(host)) {
                const p = anchor.GetPositionWithinAncestor(host);
                if (p && typeof p.y === "number" && isFinite(p.y)) return p.y;
                if (Array.isArray(p) && isFinite(p[1])) return p[1];
            }
        } catch (_) {}
        try {
            if (typeof anchor.GetPositionWithinWindow === "function") {
                const p = anchor.GetPositionWithinWindow();
                if (p && typeof p.y === "number" && isFinite(p.y)) return p.y;
                if (Array.isArray(p) && isFinite(p[1])) return p[1];
            }
        } catch (_) {}

        const cursorY = readCursorY();
        if (_activeAnchor === anchor && isFinite(cursorY) && cursorY > 0) {
            const anchorH = Number(anchor.actuallayoutheight) || 40;
            return cursorY - (anchorH * 0.5);
        }

        const layoutY = getAncestorOffset(anchor, host, "y");
        if (!isFinite(layoutY)) return NaN;

        if (isAlive(list) && isDescendantOf(anchor, list)) {
            const scrollOffset = getListScrollOffsetY(list);
            return layoutY - scrollOffset;
        }

        return layoutY;
    };

    const isPanelVisibleInList = (anchor, list, host) => {
        if (!isAlive(anchor)) return false;
        if (!isAlive(list)) return true;

        const anchorHeight = Number(anchor.actuallayoutheight);
        const listHeight = Number(list.actuallayoutheight);
        if (!isFinite(anchorHeight) || !isFinite(listHeight) || listHeight <= 0) return true;

        const listY = getAncestorOffset(list, host, "y");
        if (!isFinite(listY)) return true;

        const cursorY = readCursorY();
        if (isFinite(cursorY) && cursorY > 0) {
            return (cursorY >= listY - 4 && cursorY <= listY + listHeight + 4);
        }

        const visualAnchorY = getVisualAnchorY(anchor, list, host);
        if (!isFinite(visualAnchorY)) return true;

        if ((visualAnchorY + anchorHeight <= listY + 2) || (visualAnchorY >= listY + listHeight - 2)) {
            return false;
        }
        return true;
    };

    // -------------------------------------------------------------------------
    // Tooltip DOM Management
    // -------------------------------------------------------------------------
    const P = Q.core.panel;
    const tooltipTree = P.createOwnedTree();
    const deadlines = new Map();
    let lifetimeOwner = null;
    const cancelTask = kind => {
        const task = deadlines.get(kind);
        deadlines.delete(kind);
        if (task && task.handle !== null) { try { $.CancelScheduled(task.handle); } catch (_) {} }
    };
    const currentOwner = () => {
        try {
            const context = $.GetContextPanel();
            return { context, host: getHost(), window: P.findTraverse(context, "SettingsWindow") };
        } catch (_) { return { context: null, host: null, window: null }; }
    };
    const sameOwner = (a, b) => a && b && a.context === b.context && a.host === b.host && a.window === b.window;
    const currentScope = owner => owner && isAlive(owner.context) && isAlive(owner.host) && sameOwner(owner, currentOwner());
    const anchorInScope = (anchor, owner) => {
        try {
            if (!isAlive(anchor) || !isDescendantOf(anchor, owner.context)) return false;
            for (let node = anchor, depth = 0; isAlive(node) && depth < 64; node = node.GetParent(), depth++) {
                if (node.id === "SettingsWindow") return node === owner.window;
                if (node === owner.context) return true;
            }
        } catch (_) {}
        return false;
    };
    const retireTooltip = () => {
        P.setClass(_panel, "Visible", false);
        tooltipTree.clear();
        _panel = _bodyLabel = _perfPrefixLabel = _perfValueLabel = _creatorPrefixLabel = _creatorValueLabel = null;
        _voiceAuthorPrefixLabel = _voiceAuthorValueLabel = _voiceActorPrefixLabel = _voiceActorValueLabel = null;
    };
    const bindOwner = () => {
        const next = currentOwner();
        if (!sameOwner(lifetimeOwner, next)) {
            hideRowTooltip(); retireTooltip(); lifetimeOwner = next;
            _lastVisibleTime = 0;
            _suppressUntilMs = 0;
        }
        return currentScope(next) ? lifetimeOwner : null;
    };
    const scheduleTask = (kind, delay, callback, anchor = null) => {
        cancelTask(kind);
        const owner = lifetimeOwner;
        if (!currentScope(owner)) return;
        const task = { handle: null };
        deadlines.set(kind, task);
        try { task.handle = $.Schedule(delay, () => {
            if (deadlines.get(kind) !== task) return;
            deadlines.delete(kind);
            if (lifetimeOwner !== owner) return;
            if (!currentScope(owner) || (anchor && !anchorInScope(anchor, owner))) {
                hideRowTooltip(); retireTooltip(); lifetimeOwner = null; return;
            }
            try { callback(); }
            catch (error) {
                hideRowTooltip(); retireTooltip();
                QOL_UTILS.WarnLog("settings", "tooltip failed: " + (error?.message || String(error)));
            }
        }); } catch (error) {
            deadlines.delete(kind);
            hideRowTooltip(); retireTooltip();
            QOL_UTILS.WarnLog("settings", "tooltip schedule failed: " + (error?.message || String(error)));
        }
    };
    const ensureTooltipPanel = () => {
        const owner = bindOwner();
        if (!owner) return null;
        tooltipTree.sweep();
        let ready = true;
        const node = (type, suffix, parent, cls) => {
            const panel = tooltipTree.child(parent, type, "QOLSettingsRowFloatingTooltip" + suffix);
            if (!isAlive(panel)) { ready = false; return null; }
            P.setClass(panel, cls, true);
            if (!panel.BHasClass(cls)) ready = false;
            return panel;
        };
        try {
            _panel = node("Panel", "", owner.host, "QOLCustomRowTooltip");
            if (!_panel) return null;
            _bodyLabel = node("Label", "Text", _panel, "QOLCustomRowTooltipText");
            const perf = node("Panel", "PerfRow", _panel, "QOLCustomRowTooltipPerfRow");
            _perfPrefixLabel = node("Label", "PerfPrefix", perf, "QOLCustomRowTooltipPerfPrefix");
            _perfValueLabel = node("Label", "PerfValue", perf, "QOLCustomRowTooltipPerfValue");
            const creator = node("Panel", "CreatorRow", _panel, "QOLCustomRowTooltipCreatorRow");
            _creatorPrefixLabel = node("Label", "CreatorPrefix", creator, "QOLCustomRowTooltipCreatorPrefix");
            _creatorValueLabel = node("Label", "CreatorValue", creator, "QOLCustomRowTooltipCreatorValue");
            const author = node("Panel", "VoiceMetaAuthorRow", _panel, "QOLCustomRowTooltipVoiceMetaRow");
            _voiceAuthorPrefixLabel = node("Label", "VoiceMetaAuthorPrefix", author, "QOLCustomRowTooltipVoiceMetaPrefix");
            _voiceAuthorValueLabel = node("Label", "VoiceMetaAuthorValue", author, "QOLCustomRowTooltipVoiceMetaAuthorValue");
            const actor = node("Panel", "VoiceMetaActorRow", _panel, "QOLCustomRowTooltipVoiceMetaRow");
            _voiceActorPrefixLabel = node("Label", "VoiceMetaActorPrefix", actor, "QOLCustomRowTooltipVoiceMetaPrefix");
            _voiceActorValueLabel = node("Label", "VoiceMetaActorValue", actor, "QOLCustomRowTooltipVoiceMetaActorValue");
        } catch (_) { ready = false; }
        if (!ready) { P.setClass(_panel, "Visible", false); return null; }
        return _panel;
    };

    const positionTooltip = (anchor) => {
        if (!isAlive(_panel) || !isAlive(anchor)) return;
        const host = _panel.GetParent ? _panel.GetParent() : null;
        if (!isAlive(host)) return;

        const ctx = $.GetContextPanel ? $.GetContextPanel() : host;

        // Resolve SettingsWindow and SettingsList: first traverse upward from anchor, then fallback to ctx
        let settingsWin = null;
        let settingsList = null;
        let cur = anchor;
        let guard = 0;
        while (cur && isAlive(cur) && guard < 32) {
            if (!settingsList && cur.id === "SettingsList") settingsList = cur;
            if (cur.id === "SettingsWindow") {
                settingsWin = cur;
                break;
            }
            cur = cur.GetParent ? cur.GetParent() : null;
            guard++;
        }
        if (!settingsWin && ctx) {
            settingsWin = ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsWindow") : null;
        }
        if (!settingsList && ctx) {
            settingsList = ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsList") : null;
        }

        const isInsideWindow = isAlive(settingsWin) && (anchor === settingsWin || isDescendantOf(anchor, settingsWin));

        const hostW = Number(host.actuallayoutwidth) || 1920;
        const hostH = Number(host.actuallayoutheight) || 1080;
        const tipW = Number(_panel.actuallayoutwidth) || 280;
        const tipH = Number(_panel.actuallayoutheight) || 90;

        const anchorX = getAncestorOffset(anchor, host, "x");
        let visualAnchorY = getVisualAnchorY(anchor, settingsList, host);
        if (!isFinite(visualAnchorY)) {
            visualAnchorY = getAncestorOffset(anchor, host, "y");
        }
        const anchorW = Number(anchor.actuallayoutwidth) || 580;
        const anchorH = Number(anchor.actuallayoutheight) || 40;

        let winX = NaN;
        let winY = NaN;
        let winW = NaN;
        let winH = NaN;

        if (isAlive(settingsWin)) {
            winX = getAncestorOffset(settingsWin, host, "x");
            winY = getAncestorOffset(settingsWin, host, "y");
            winW = Number(settingsWin.actuallayoutwidth) || 720;
            winH = Number(settingsWin.actuallayoutheight) || 720;
        }

        // Check obstacles on the right: Friends list (#RightSide)
        let rightBoundary = hostW - EDGE_MARGIN;
        const rightSide = ctx ? ctx.FindChildTraverse?.("RightSide") : null;
        if (isAlive(rightSide) && Number(rightSide.actuallayoutwidth) > 0) {
            const rx = getAncestorOffset(rightSide, host, "x");
            if (isFinite(rx) && rx > (winX + (winW || 0))) {
                rightBoundary = Math.min(rightBoundary, rx - EDGE_MARGIN);
            }
        }

        let xRight, xLeft;
        if (isInsideWindow && isFinite(winX) && winW > 0) {
            xRight = Math.round(winX + winW + GAP);
            xLeft = Math.round(winX - tipW - GAP);
        } else {
            xRight = Math.round(anchorX + anchorW + GAP);
            xLeft = Math.round(anchorX - tipW - GAP);
        }

        const spaceRight = rightBoundary - (isInsideWindow && isFinite(winX) && winW > 0 ? (winX + winW) : (anchorX + anchorW));
        const spaceLeft = (isInsideWindow && isFinite(winX)) ? winX : anchorX;

        let x;
        if (spaceRight >= (tipW + GAP)) {
            // Tier 1: Fits cleanly to the right
            x = xRight;
        } else if (spaceLeft >= (tipW + GAP)) {
            // Tier 2: Fits cleanly to the left (standard in 1080p / 16:10 open void)
            x = xLeft;
        } else {
            // Tier 3: Inside safe zone over label, away from scrollbar
            if (isFinite(winX)) {
                x = Math.max(EDGE_MARGIN, winX + 160);
            } else {
                x = Math.max(EDGE_MARGIN, Math.min(hostW - tipW - EDGE_MARGIN, xRight));
            }
        }

        // Vertical centering on row, clamped strictly within SettingsWindow bounds
        let anchorCenterY;
        const cursorY = readCursorY();
        if (isFinite(cursorY) && cursorY > 0 && isAlive(settingsList) && isDescendantOf(anchor, settingsList)) {
            anchorCenterY = cursorY;
        } else {
            anchorCenterY = visualAnchorY + (anchorH * 0.5);
        }
        const targetY = Math.round(anchorCenterY - (tipH * 0.5));

        let yMin = EDGE_MARGIN;
        let yMax = Math.max(yMin, Math.round(hostH - tipH - EDGE_MARGIN));

        if (isFinite(winY) && isFinite(winH) && winH > 0) {
            yMin = Math.max(yMin, Math.round(winY + 8));
            yMax = Math.min(yMax, Math.round(winY + winH - tipH - 8));
            if (yMax < yMin) yMax = yMin;
        }

        const y = Math.max(yMin, Math.min(yMax, targetY));

        if (
            isFinite(_lastX) &&
            isFinite(_lastY) &&
            Math.abs(_lastX - x) < 0.5 &&
            Math.abs(_lastY - y) < 0.5
        ) {
            return;
        }

        _lastX = x;
        _lastY = y;
        if (_panel.style) {
            let hostScaleX = 1.0;
            let hostScaleY = 1.0;
            if (typeof host.actualuiscale_x === "number" && isFinite(host.actualuiscale_x) && host.actualuiscale_x > 0) {
                hostScaleX = host.actualuiscale_x;
            } else {
                const actW = Number(host.actuallayoutwidth);
                const desW = Number(host.desiredlayoutwidth);
                if (isFinite(actW) && actW > 0 && isFinite(desW) && desW > 0) {
                    hostScaleX = actW / desW;
                }
            }
            if (typeof host.actualuiscale_y === "number" && isFinite(host.actualuiscale_y) && host.actualuiscale_y > 0) {
                hostScaleY = host.actualuiscale_y;
            } else {
                const actH = Number(host.actuallayoutheight);
                const desH = Number(host.desiredlayoutheight);
                if (isFinite(actH) && actH > 0 && isFinite(desH) && desH > 0) {
                    hostScaleY = actH / desH;
                }
            }

            const styleX = Math.round(x / hostScaleX);
            const styleY = Math.round(y / hostScaleY);

            _panel.style.x = `${styleX}px`;
            _panel.style.y = `${styleY}px`;
        }
    };

    // -------------------------------------------------------------------------
    // Scroll Snapshot & Dynamic Motion Tracking
    // -------------------------------------------------------------------------
    const readScrollSnapshot = () => {
        const host = getHost();
        const ctx = $.GetContextPanel ? $.GetContextPanel() : host;
        if (!ctx) return { listY: 0, hostY: 0, thumbY: 0 };
        let settingsList = null;
        try { settingsList = ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsList") : null; } catch (_) {}
        let settingsContentHost = null;
        try { settingsContentHost = ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsContentHost") : null; } catch (_) {}

        let thumbY = 0;
        if (settingsList) {
            try {
                let thumb = null;
                const scrollBar = settingsList.FindChildTraverse ? settingsList.FindChildTraverse("VerticalScrollBar") : null;
                if (scrollBar && scrollBar.FindChildTraverse) {
                    thumb = scrollBar.FindChildTraverse("ScrollThumb");
                }
                if (!thumb && settingsList.FindChildTraverse) {
                    thumb = settingsList.FindChildTraverse("ScrollThumb");
                }
                if (!thumb && settingsList.FindChildrenWithClassTraverse) {
                    const thumbs = settingsList.FindChildrenWithClassTraverse("ScrollThumb");
                    if (thumbs && thumbs.length > 0) thumb = thumbs[0];
                }
                if (isAlive(thumb)) {
                    let sty = Number(thumb.actualyoffset);
                    if (!isFinite(sty)) sty = Number(thumb.scrolloffset_y);
                    if (!isFinite(sty)) sty = Number(thumb.actualscrolloffset_y);
                    if (!isFinite(sty) && typeof globalThis.GetPanelYOffsetWithinAncestor === "function") {
                        sty = Number(globalThis.GetPanelYOffsetWithinAncestor(thumb, scrollBar || settingsList));
                    }
                    if (isFinite(sty)) thumbY = sty;
                }
            } catch (_) {}
        }

        return {
            listY: readPanelScrollOffsetY(settingsList),
            hostY: readPanelScrollOffsetY(settingsContentHost),
            thumbY: isFinite(thumbY) ? thumbY : 0
        };
    };

    const primeScrollSnapshot = () => {
        const snap = readScrollSnapshot();
        _lastListScrollY = Number(snap.listY);
        _lastHostScrollY = Number(snap.hostY);
        _lastThumbScrollY = Number(snap.thumbY);

        const host = getHost();
        let curY = NaN;
        if (isAlive(_activeAnchor) && isAlive(host)) {
            const ctx = $.GetContextPanel ? $.GetContextPanel() : host;
            const settingsList = ctx ? ctx.FindChildTraverse?.("SettingsList") : null;
            curY = getVisualAnchorY(_activeAnchor, settingsList, host);
        }
        _lastAnchorLocalY = curY;
    };

    const didScrollChange = () => {
        const snap = readScrollSnapshot();
        const listY = isFinite(Number(snap.listY)) ? Number(snap.listY) : 0;
        const hostY = isFinite(Number(snap.hostY)) ? Number(snap.hostY) : 0;
        const thumbY = isFinite(Number(snap.thumbY)) ? Number(snap.thumbY) : 0;

        let changed = false;
        if (isFinite(_lastListScrollY) && Math.abs(listY - _lastListScrollY) >= 1) changed = true;
        if (isFinite(_lastHostScrollY) && Math.abs(hostY - _lastHostScrollY) >= 1) changed = true;
        if (isFinite(_lastThumbScrollY) && Math.abs(thumbY - _lastThumbScrollY) >= 1) changed = true;

        _lastListScrollY = listY;
        _lastHostScrollY = hostY;
        _lastThumbScrollY = thumbY;

        return changed;
    };

    const stopTracking = () => cancelTask("track");

    const tickTracking = () => {
        if (!tooltipTree.sweep()) { hideRowTooltip(); return; }
        if (!isVisible()) return;
        const anchor = _activeAnchor;
        if (!isAlive(anchor)) {
            hideRowTooltip();
            return;
        }

        const host = getHost();
        const ctx = $.GetContextPanel ? $.GetContextPanel() : host;
        const settingsList = ctx ? ctx.FindChildTraverse?.("SettingsList") : null;
        let curY = NaN;
        if (isAlive(host)) {
            curY = getVisualAnchorY(anchor, settingsList, host);
        }

        const anchorMoved = isFinite(_lastAnchorLocalY) && isFinite(curY) && Math.abs(curY - _lastAnchorLocalY) >= 1;
        const scrollChanged = didScrollChange();

        if (anchorMoved || scrollChanged) {
            suppressForMs(SCROLL_SUPPRESS_MS);
            hideRowTooltip();
            return;
        }

        if (settingsList && isDescendantOf(anchor, settingsList)) {
            if (!isPanelVisibleInList(anchor, settingsList, host)) {
                hideRowTooltip();
                return;
            }
        }

        positionTooltip(anchor);
        scheduleTask("track", TRACK_INTERVAL_SEC, tickTracking, _activeAnchor);
    };

    const ensureTracking = () => {
        if (deadlines.has("track")) return;
        scheduleTask("track", TRACK_INTERVAL_SEC, tickTracking, _activeAnchor);
    };

    // -------------------------------------------------------------------------
    // Show / Hide Lifecycle
    // -------------------------------------------------------------------------
    const cancelHide = () => cancelTask("hide");
    const cancelShow = () => cancelTask("show");

    const isVisible = () => {
        if (!isAlive(_panel) || !_panel.BHasClass) return false;
        try { return !!_panel.BHasClass("Visible"); } catch (_) { return false; }
    };

    const hideRowTooltip = () => {
        cancelShow();
        cancelHide();
        stopTracking();
        cancelTask("settle");
        _activeAnchor = null;
        _hoverCursorY = NaN;
        _lastX = NaN;
        _lastY = NaN;
        if (isAlive(_panel)) {
            P.setClass(_panel, "Visible", false);
            _lastVisibleTime = Date.now();
        }
    };

    const hideTooltipDeferred = (_reason) => {
        cancelShow();
        cancelHide();
        scheduleTask("hide", DEFER_HIDE_SEC, () => {
            hideRowTooltip();
        });
    };

    const renderTooltip = (anchor, perfTier, bodyText, createdBy, options) => {
        cancelHide();
        const panel = ensureTooltipPanel();
        if (!panel || !isAlive(anchor)) return;

        _activeAnchor = anchor;
        if (!isFinite(_hoverCursorY)) {
            _hoverCursorY = captureCursorY();
        }
        const bodyLine = localize(bodyText, true);
        const creatorName = String(createdBy || "").trim();
        const tier = normalizePerfTier(perfTier);

        const voiceMeta = options?.voiceMeta || null;
        const voiceAuthor = String(voiceMeta?.author || "").trim();
        const voiceActor = String(voiceMeta?.voiceActor || "").trim();
        const isVoiceMode = (voiceAuthor.length > 0 || voiceActor.length > 0);

        _bodyLabel.text = bodyLine;
        _perfPrefixLabel.text = localize("FPS Impact:", true);
        _perfValueLabel.text = getPerfDisplayLabel(tier);
        _creatorPrefixLabel.text = localize("Created By:", true);
        _creatorValueLabel.text = creatorName;
        _voiceAuthorPrefixLabel.text = localize("Author:", true);
        _voiceAuthorValueLabel.text = voiceAuthor;
        _voiceActorPrefixLabel.text = localize("Voice Actor:", true);
        _voiceActorValueLabel.text = voiceActor;

        const hasPerf = !!(perfTier && perfTier !== "hidden" && perfTier !== "suppress");
        panel.SetHasClass("NoBody", bodyLine.length === 0);
        panel.SetHasClass("NoPerf", !hasPerf);
        panel.SetHasClass("NoCreator", creatorName.length === 0 || isVoiceMode);
        panel.SetHasClass("VoiceMetaMode", isVoiceMode);
        panel.SetHasClass("NoVoiceMeta", !isVoiceMode);
        panel.SetHasClass("NoVoiceMetaAuthor", voiceAuthor.length === 0);
        panel.SetHasClass("NoVoiceMetaActor", voiceActor.length === 0);
        panel.SetHasClass("FooterSaveWarningTooltip", !!options?.footerSaveWarning);

        panel.SetHasClass("PerfNone", tier === TIER_NONE);
        panel.SetHasClass("PerfLow", tier === TIER_LOW);
        panel.SetHasClass("PerfMedium", tier === TIER_MEDIUM);
        panel.SetHasClass("PerfHigh", tier === TIER_HIGH);

        positionTooltip(anchor);
        panel.SetHasClass("Visible", true);
        primeScrollSnapshot();
        ensureTracking();

        // Frame 0 layout settle check
        scheduleTask("settle", 0.0, () => {
            if (_activeAnchor === anchor && isVisible()) {
                positionTooltip(anchor);
            }
        }, anchor);
    };

    const executeShow = (...args) => {
        try { renderTooltip(...args); }
        catch (error) {
            hideRowTooltip(); retireTooltip();
            QOL_UTILS.WarnLog("settings", "tooltip failed: " + (error?.message || String(error)));
        }
    };

    const showRowTooltip = (anchor, _perfText, bodyText, perfTier, createdBy, options) => {
        const owner = bindOwner();
        if (!owner || !anchorInScope(anchor, owner)) return;

        if (!hasMeaningfulContent(perfTier, bodyText, createdBy, options)) {
            hideRowTooltip();
            return;
        }

        _activeAnchor = anchor;
        _hoverCursorY = captureCursorY();

        const host = getHost();
        const ctx = $.GetContextPanel ? $.GetContextPanel() : host;
        const settingsList = ctx ? ctx.FindChildTraverse?.("SettingsList") : null;
        if (settingsList && isDescendantOf(anchor, settingsList)) {
            if (!isPanelVisibleInList(anchor, settingsList, host)) return;
        }

        // Establish scroll baseline at the moment hover begins
        primeScrollSnapshot();

        // If suppressed from active scrolling, wait until suppression expires rather than dropping the hover forever
        if (isSuppressed()) {
            cancelShow();
            const delaySec = Math.max(COLD_HOVER_DELAY_SEC, ((_suppressUntilMs - Date.now()) / 1000) + 0.02);
            scheduleTask("show", delaySec, () => {
                if (!isAlive(anchor) || isSuppressed()) return;
                if (didScrollChange()) {
                    suppressForMs(SCROLL_SUPPRESS_MS);
                    return;
                }
                if (settingsList && isDescendantOf(anchor, settingsList)) {
                    if (!isPanelVisibleInList(anchor, settingsList, host)) return;
                }
                executeShow(anchor, perfTier, bodyText, createdBy, options);
            }, anchor);
            return;
        }

        cancelHide();
        const isWarm = isVisible() || ((Date.now() - _lastVisibleTime) < WARM_RECENT_MS);
        if (options?.immediate || isWarm) {
            cancelShow();
            executeShow(anchor, perfTier, bodyText, createdBy, options);
        } else {
            cancelShow();
            scheduleTask("show", COLD_HOVER_DELAY_SEC, () => {
                if (!isAlive(anchor) || isSuppressed()) return;
                if (didScrollChange()) {
                    suppressForMs(SCROLL_SUPPRESS_MS);
                    return;
                }
                if (settingsList && isDescendantOf(anchor, settingsList)) {
                    if (!isPanelVisibleInList(anchor, settingsList, host)) return;
                }
                executeShow(anchor, perfTier, bodyText, createdBy, options);
            }, anchor);
        }
    };

    // -------------------------------------------------------------------------
    // Suppression
    // -------------------------------------------------------------------------
    const suppressForMs = (ms) => {
        const val = Number(ms) || 0;
        _suppressUntilMs = Date.now() + Math.max(0, val);
    };

    const isSuppressed = () => Date.now() < _suppressUntilMs;

    // -------------------------------------------------------------------------
    // Text Tooltips & Theme
    // -------------------------------------------------------------------------
    const setThemeActive = (isActive) => {
        const ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        let root = ctx;
        while (root && root.GetParent && isAlive(root.GetParent())) root = root.GetParent();
        if (root?.SetHasClass) {
            root.SetHasClass(THEME_CLASS, !!isActive);
            const tooltipManager = root.FindChildTraverse ? root.FindChildTraverse("TooltipManager") : null;
            if (tooltipManager?.SetHasClass) {
                tooltipManager.SetHasClass(THEME_CLASS, !!isActive);
            }
        }
    };

    const setSettingsTooltipPerfTierClass = (perfTier) => {
        const tier = normalizePerfTier(perfTier);
        const isNone = tier === TIER_NONE;
        const isLow = tier === TIER_LOW;
        const isMedium = tier === TIER_MEDIUM;
        const isHigh = tier === TIER_HIGH;
        const ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        let root = ctx;
        while (root && root.GetParent && isAlive(root.GetParent())) root = root.GetParent();
        if (root?.SetHasClass) {
            root.SetHasClass("QOLSettingsTooltipPerfNone", isNone);
            root.SetHasClass("QOLSettingsTooltipPerfLow", isLow);
            root.SetHasClass("QOLSettingsTooltipPerfMedium", isMedium);
            root.SetHasClass("QOLSettingsTooltipPerfHigh", isHigh);
        }
        const tooltipManager = root?.FindChildTraverse ? root.FindChildTraverse("TooltipManager") : null;
        if (tooltipManager?.SetHasClass) {
            tooltipManager.SetHasClass("QOLSettingsTooltipPerfNone", isNone);
            tooltipManager.SetHasClass("QOLSettingsTooltipPerfLow", isLow);
            tooltipManager.SetHasClass("QOLSettingsTooltipPerfMedium", isMedium);
            tooltipManager.SetHasClass("QOLSettingsTooltipPerfHigh", isHigh);
        }
    };

    const showTextTooltip = (anchor, text, perfTier) => {
        if (!isAlive(anchor) || !text) return;
        setSettingsTooltipPerfTierClass(perfTier || TIER_NONE);
        $.DispatchEvent("UIShowTextTooltip", anchor, text);
    };

    const hideTextTooltip = () => {
        setSettingsTooltipPerfTierClass(TIER_NONE);
        $.DispatchEvent("UIHideTextTooltip");
    };

    // -------------------------------------------------------------------------
    // Perf Impact & Metadata Helpers (100% Backward Compatible)
    // -------------------------------------------------------------------------
    const normalizePerfTier = (val) => {
        const key = String(val || "").toLowerCase();
        return TIER_ORDER.hasOwnProperty(key) ? key : TIER_NONE;
    };

    const maxPerfTier = (a, b) => {
        const na = normalizePerfTier(a);
        const nb = normalizePerfTier(b);
        return (TIER_ORDER[nb] > TIER_ORDER[na]) ? nb : na;
    };

    const getPerfDisplayLabel = (tier) => {
        const t = normalizePerfTier(tier);
        return localize(TIER_LABELS[t] || "None", true);
    };

    const buildPerfLineForTier = (tier) => {
        return `FPS Impact: ${getPerfDisplayLabel(tier)}`;
    };

    const getPerfWeightForTier = (tier) => TIER_ORDER[normalizePerfTier(tier)] || 0;

    const isPerfConfigEnabled = (configKey) => {
        const key = String(configKey || "");
        const cfg = (typeof MOD_CONFIG !== "undefined") ? MOD_CONFIG : null;
        if (!key || !cfg || !cfg.hasOwnProperty(key)) return false;
        const value = cfg[key];
        if (value === null || value === undefined) return false;
        if (typeof value === "boolean") return value === true;
        if (typeof value === "number") return Number(value) > 0;
        if (typeof value === "string") {
            const normalized = String(value).trim().toLowerCase();
            if (!normalized) return false;
            if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "none") return false;
            return true;
        }
        return !!value;
    };

    const getSummedPerfTier = (configKeys) => {
        if (!Array.isArray(configKeys) || configKeys.length === 0) return TIER_NONE;
        let totalWeight = 0;
        let maxTier = TIER_NONE;
        const seen = {};
        const tiers = globalThis.SETTING_PERF_IMPACT_TIERS || {};
        for (const rawKey of configKeys) {
            const key = String(rawKey || "");
            if (!key || seen[key]) continue;
            seen[key] = true;
            if (!tiers.hasOwnProperty(key)) continue;
            if (!isPerfConfigEnabled(key)) continue;
            const tier = normalizePerfTier(tiers[key]);
            totalWeight += getPerfWeightForTier(tier);
            maxTier = maxPerfTier(maxTier, tier);
        }
        if (totalWeight <= 0) return TIER_NONE;
        let sumTier = TIER_LOW;
        if (totalWeight >= 4) sumTier = TIER_HIGH;
        else if (totalWeight >= 2) sumTier = TIER_MEDIUM;
        return maxPerfTier(maxTier, sumTier);
    };

    const getEstimatedPerfTier = (configId, _type, options) => {
        let tier = TIER_NONE;
        const tiers = globalThis.SETTING_PERF_IMPACT_TIERS || {};
        const key = String(configId || "");
        if (key && tiers[key]) tier = maxPerfTier(tier, tiers[key]);
        if (Array.isArray(options)) {
            for (const opt of options) {
                if (opt?.key && tiers[opt.key]) tier = maxPerfTier(tier, tiers[opt.key]);
            }
        }
        return tier;
    };

    const buildPerfImpactLine = (configId, type, options) => {
        const tier = getEstimatedPerfTier(configId, type, options);
        return { tier, line: buildPerfLineForTier(tier) };
    };

    const buildSectionPerfLine = (_titleRow, enableConfigId, enableType, enableOptions) => {
        let tier = TIER_NONE;
        if (enableConfigId) tier = getEstimatedPerfTier(enableConfigId, enableType || "toggle", enableOptions);
        return { tier, line: buildPerfLineForTier(tier) };
    };

    const hasMeaningfulContent = (perfTier, bodyText, createdBy, options) => {
        if (perfTier && perfTier !== "hidden" && perfTier !== "suppress") return true;
        if (String(bodyText || "").trim().length > 0) return true;
        if (String(createdBy || "").trim().length > 0) return true;
        if (options?.voiceMeta && (options.voiceMeta.author || options.voiceMeta.voiceActor)) return true;
        return false;
    };

    const getSettingCreatedBy = (configId, label) => {
        const byConfig = globalThis.SETTING_CREATED_BY_BY_CONFIG || {};
        if (configId && byConfig[configId]) return String(byConfig[configId]);
        const byLabel = globalThis.SETTING_CREATED_BY_BY_LABEL || {};
        if (label && byLabel[label]) return String(byLabel[label]);
        return "";
    };

    const getSectionCreatedBy = (title) => {
        const byTitle = globalThis.SECTION_CREATED_BY_BY_TITLE || {};
        return (title && byTitle[title]) ? String(byTitle[title]) : "";
    };

    const getSectionDescriptionOverride = (tabName, title, fallback) => {
        const overrides = globalThis.SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE || {};
        const key = `${tabName}|${title}`;
        return overrides[key] ? String(overrides[key]) : String(fallback || "");
    };

    const getSettingDescriptionOverride = (configId, label, fallback, categoryKey) => {
        const catRowOverrides = globalThis.SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW || {};
        if (categoryKey && label && catRowOverrides[`${categoryKey}|${label}`]) {
            return String(catRowOverrides[`${categoryKey}|${label}`]);
        }
        if (label === "Size") return "Scales the element.";
        if (label === "Opacity") return "Changes the element's transparency.";
        if (label === "Horizontal Offset") return "Moves the element horizontally.";
        if (label === "Vertical Offset") return "Moves the element vertically.";
        const configOverrides = globalThis.SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG || {};
        if (configId && configOverrides[configId]) return String(configOverrides[configId]);
        return String(fallback || "");
    };

    const getCurrentCategoryKey = () => {
        const tab = String(globalThis.currentTab || "");
        const sec = String(globalThis.gCurrentSettingsSectionTitle || "");
        return (tab && sec) ? `${tab} / ${sec}` : tab;
    };

    const getCreatedByFromConfigKeys = (configKeys) => {
        if (!Array.isArray(configKeys) || configKeys.length === 0) return "";
        const seen = {};
        const names = [];
        const createdByByConfig = globalThis.SETTING_CREATED_BY_BY_CONFIG || {};
        for (const rawKey of configKeys) {
            const key = String(rawKey || "");
            if (!key || seen[key]) continue;
            seen[key] = true;
            if (!createdByByConfig.hasOwnProperty(key)) continue;
            const name = String(createdByByConfig[key] || "").trim();
            if (!name) continue;
            if (names.indexOf(name) === -1) names.push(name);
        }
        return names.join(", ");
    };

    const bindSectionPerfTooltip = (titleRow, titleName, fallbackDesc, tabName, enableConfigId, enableType, enableOptions) => {
        if (!isAlive(titleRow) || !titleRow.SetPanelEvent) return;
        const author = getSectionCreatedBy(titleName);
        const desc = getSectionDescriptionOverride(tabName, titleName, fallbackDesc || "");
        titleRow.SetPanelEvent("onmouseover", () => {
            cancelHide();
            const info = buildSectionPerfLine(titleRow, enableConfigId, enableType, enableOptions);
            const tier = info.tier || TIER_NONE;
            const localizedDesc = localize(desc);
            if (!hasMeaningfulContent(tier, localizedDesc, author)) {
                hideRowTooltip();
                return;
            }
            showRowTooltip(titleRow, "", localizedDesc, tier, author);
        });
        titleRow.SetPanelEvent("onmouseout", () => {
            hideTooltipDeferred("section_mouseout");
        });
    };

    // -------------------------------------------------------------------------
    // Public API Export
    // -------------------------------------------------------------------------
    Q.tooltip = {
        showRowTooltip,
        hideRowTooltip,
        dispose() { hideRowTooltip(); retireTooltip(); tooltipTree.dispose(); lifetimeOwner = null; },
        hideTooltipDeferred,
        cancelHide,
        isVisible,
        showTextTooltip,
        hideTextTooltip,
        setThemeActive,
        buildPerfImpactLine,
        buildSectionPerfLine,
        bindSectionPerfTooltip,
        hasMeaningfulContent,
        getSettingCreatedBy,
        getSectionCreatedBy,
        getSectionDescriptionOverride,
        getSettingDescriptionOverride,
        getCurrentCategoryKey,
        getEstimatedPerfTier,
        getSummedPerfTier,
        normalizePerfTier,
        maxPerfTier,
        buildPerfLineForTier,
        getPerfDisplayLabel,
        isPerfConfigEnabled,
        getCreatedByFromConfigKeys,
        getPerfWeightForTier,
        suppressForMs,
        isSuppressed,
        TIER_NONE,
        TIER_LOW,
        TIER_MEDIUM,
        TIER_HIGH
    };
})();
