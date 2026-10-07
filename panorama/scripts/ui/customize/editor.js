// Owns the editor overlay, selection frames and active-gesture schedules.
// Native HUD panels are measured only; their manifests apply draft settings.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const G = Q.ui.customizeGeometry;
    const I = Q.ui.customizeInspector;
    const localize = text => Q.ui.theme.LocalizeSettingsText(text, true);
    let current = null;
    let lastError = "";
    const recordError = error => { lastError = String(error?.message || error); $.Msg("[QOLLock][Customize] " + lastError); };
    const resolve = (owner, element, config) => Q.presentation.resolve(element, owner.hud,
        config || Object.assign({}, Q.getSettingsConfig(), owner.transaction.snapshot()));

    function stop(focus = true, feedback = null) {
        if (!current) return;
        const owner = current;
        current = null;
        const cleanup = action => {
            try { action(); } catch (error) { $.Msg("[QOLLock][Customize] cleanup: " + error.message); }
        };
        cleanup(() => owner.inspector?.dispose());
        cleanup(() => owner.transaction.close());
        for (const timer of [owner.timer, owner.dragTimer]) if (timer !== null) cleanup(() => $.CancelScheduled(timer));
        cleanup(() => P.delete(owner.drag?.proxy));
        cleanup(() => P.delete(owner.guideX));
        cleanup(() => P.delete(owner.guideY));
        for (const panel of owner.hidden) cleanup(() => { if (P.isAlive(panel)) panel.RemoveClass("QOLCustomizeHidden"); });
        for (const panel of owner.active) cleanup(() => { if (P.isAlive(panel)) panel.RemoveClass("QOLCustomizeActive"); });
        for (const { frame, handles } of owner.frames.values()) {
            cleanup(() => P.delete(frame));
            for (const handle of handles) cleanup(() => P.delete(handle));
        }
        cleanup(() => P.delete(owner.overlay));
        cleanup(() => { if (focus && P.isAlive(owner.window) && owner.window.BHasClass("Visible")) owner.window.SetFocus(); });
        cleanup(() => Q.ui.window.requestSettingsListSoftRefresh?.(0));
        cleanup(() => owner.onStop?.(feedback));
    }
    function refreshFields(owner, options) {
        if (current !== owner) return;
        owner.feedback = null;
        owner.inspector?.sync(options);
        refreshHistory(owner);
        refreshFrames(owner);
    }
    function refreshHistory(owner) {
        const pending = owner.inspector?.hasPending();
        owner.undo.enabled = !owner.applied && !owner.drag && (owner.transaction.canUndo() || pending);
        owner.redo.enabled = !owner.applied && !owner.drag && !pending && owner.transaction.canRedo();
        owner.reset.enabled = !owner.applied && !owner.drag && !!owner.selected;
    }
    function historyAction(owner, redo) {
        if (current !== owner || owner.applied || owner.drag) return;
        if (!owner.inspector.commit()) {
            owner.feedback = "Enter a valid number or #RRGGBB color.";
            return;
        }
        if (redo) owner.transaction.redo(); else owner.transaction.undo();
        refreshFields(owner);
    }
    function select(owner, element, pin = true) {
        if (current !== owner || owner.drag || owner.applied || !owner.transaction.canEditElement(element.id)) return false;
        if (owner.inspector && !owner.inspector.commit()) {
            owner.feedback = "Enter a valid number or #RRGGBB color.";
            owner.status.text = localize(owner.feedback);
            return false;
        }
        owner.inspector?.dispose();
        owner.selected = element;
        owner.selectionPinned = pin;
        for (const [id, item] of owner.frames) {
            item.frame.SetHasClass("Selected", id === element.id);
            I.setActive(item.button, id === element.id);
        }
        owner.inspector = I.build(owner.fields, element, owner.transaction, options => {
            owner.selectionPinned = true;
            refreshFields(owner, options);
        });
        refreshFields(owner);
        return true;
    }
    function finishDrag(owner, cancel = false) {
        if (current !== owner || !owner.drag) return;
        const { proxy } = owner.drag;
        if (owner.dragTimer !== null) $.CancelScheduled(owner.dragTimer);
        owner.dragTimer = null;
        P.delete(proxy);
        if (P.isAlive(owner.overlay)) owner.overlay.RemoveClass("Dragging");
        if (owner.guideX && P.isAlive(owner.guideX)) owner.guideX.visible = false;
        if (owner.guideY && P.isAlive(owner.guideY)) owner.guideY.visible = false;
        owner.transaction.endGesture(cancel);
        owner.drag = null;
        for (const item of owner.frames.values()) item.signature = null;
        refreshFields(owner);
    }
    function updateDrag(owner, reschedule = true) {
        if (current !== owner || !owner.drag) return;
        const drag = owner.drag;
        if (!owner.transaction.valid() || !P.isAlive(drag.frame) || (!drag.ending && !P.isAlive(drag.proxy)) || resolve(owner, drag.element) !== drag.target || !G.isShown(drag.target)) {
            finishDrag(owner, true);
            return;
        }
        // The native compositor reparents and positions the drag visual at the
        // cursor. Establish its origin after that first layout, never from the
        // source frame's old parent coordinates.
        const point = drag.endPoint || G.absolute(drag.proxy);
        drag.lastPoint = point;
        if (!drag.origin) drag.origin = point;
        const delta = { x: point.x - drag.origin.x, y: point.y - drag.origin.y };
        if (!drag.resize && owner.snapEnabled !== false && P.isAlive(owner.overlay) && P.isAlive(drag.target)) {
            const overlayWidth = Number(owner.overlay.actuallayoutwidth) || 1920;
            const overlayHeight = Number(owner.overlay.actuallayoutheight) || 1080;
            const hostScaleX = G.scale(owner.overlay, "x");
            const hostScaleY = G.scale(owner.overlay, "y");
            if (overlayWidth > 0 && hostScaleX > 0) {
                const elemCenterX = drag.startBox.x + drag.startBox.width / 2 + delta.x / hostScaleX;
                const screenCenterX = overlayWidth / 2 / hostScaleX;
                if (Math.abs(elemCenterX - screenCenterX) < 8) {
                    delta.x = (screenCenterX - (drag.startBox.x + drag.startBox.width / 2)) * hostScaleX;
                    if (owner.guideX && P.isAlive(owner.guideX)) {
                        owner.guideX.visible = true;
                        owner.guideX.style.x = `${Math.round(screenCenterX)}px`;
                    }
                } else if (owner.guideX && P.isAlive(owner.guideX)) {
                    owner.guideX.visible = false;
                }
            }
            if (overlayHeight > 0 && hostScaleY > 0) {
                const elemCenterY = drag.startBox.y + drag.startBox.height / 2 + delta.y / hostScaleY;
                const screenCenterY = overlayHeight / 2 / hostScaleY;
                if (Math.abs(elemCenterY - screenCenterY) < 8) {
                    delta.y = (screenCenterY - (drag.startBox.y + drag.startBox.height / 2)) * hostScaleY;
                    if (owner.guideY && P.isAlive(owner.guideY)) {
                        owner.guideY.visible = true;
                        owner.guideY.style.y = `${Math.round(screenCenterY)}px`;
                    }
                } else if (owner.guideY && P.isAlive(owner.guideY)) {
                    owner.guideY.visible = false;
                }
            }
        }
        const values = drag.resize ? G.resizeValues(drag.element, drag.startValues, drag.startBox, delta, owner.overlay, drag.resize)
            : G.dragValues(drag.element, drag.target, drag.startValues, delta);
        // Only compensate an acknowledged layout. Reusing a stale frame would
        // add the same correction repeatedly while the HUD consumes the draft.
        const settled = drag.resize && Q.presentation.preview.settled(owner.hud);
        if (settled && drag.layoutReady) {
            const snapshot = {};
            for (const field of drag.element.fields) snapshot[field.key] = owner.transaction.value(field.key);
            Object.assign(values, G.anchorValues(drag.element, drag.target, drag.startBox,
                G.frameBox(drag.element, drag.target, owner.overlay), snapshot, owner.overlay, drag.resize));
        }
        const unchanged = Object.entries(values).every(([key, value]) => owner.transaction.value(key) === value);
        if (drag.ending && settled && drag.layoutReady && unchanged) { finishDrag(owner); return; }
        drag.layoutReady = !!settled && unchanged;
        if (!unchanged) owner.transaction.edit(values);
        if (drag.ending && Date.now() >= drag.endDeadline) { finishDrag(owner); return; }
        if (reschedule) owner.dragTimer = $.Schedule(0.033, () => updateDrag(owner));
    }
    function bindDrag(owner, element, frame, resize = false) {
        $.RegisterEventHandler("DragStart", frame, (_panel, event) => {
            if (current !== owner || owner.applied || owner.drag || !frame.visible || owner.transaction.isLocked(element.id)) return;
            const target = resolve(owner, element);
            if (!P.isAlive(target) || !G.isShown(target) || !(resize ? Q.presentation.resizeField(element) : Q.presentation.canDrag(element))) return;
            if (!select(owner, element)) return;
            const startBox = G.frameBox(element, target, owner.overlay);
            if (!startBox) return;
            const proxy = P.create("Panel", owner.overlay, "QOLCustomizeDragProxy");
            if (!P.isAlive(proxy)) return;
            proxy.AddClass("QOLCustomizeDragProxy");
            // Keep dimensions after the compositor takes it out of the editor's
            // stylesheet ancestry; the proxy is never a visible resize handle.
            proxy.style.width = "16px";
            proxy.style.height = "16px";
            proxy.style.align = "left top";
            proxy.hittest = false;
            proxy.hittestchildren = false;
            if (!owner.transaction.beginGesture()) { P.delete(proxy); return; }
            const startValues = {};
            for (const field of element.fields) startValues[field.key] = owner.transaction.value(field.key);
            owner.drag = { frame, proxy, target, element, origin: null, startValues, startBox, resize };
            event.displayPanel = proxy;
            event.removePositionBeforeDrop = false;
            $.DispatchEvent("UIHideTextTooltip", frame);
            if (P.isAlive(owner.overlay)) owner.overlay.AddClass("Dragging");
            owner.dragTimer = $.Schedule(0, () => updateDrag(owner));
        });
        $.RegisterEventHandler("DragEnd", frame, (_panel, droppedPanel) => {
            if (current !== owner || owner.drag?.frame !== frame) return;
            const drag = owner.drag;
            // The compositor owns the displayPanel's lifetime. Its last sampled
            // position survives a drop that releases the visual before delivery.
            const visual = droppedPanel === drag.proxy && P.isAlive(droppedPanel) ? droppedPanel : drag.proxy;
            drag.endPoint = P.isAlive(visual) ? G.absolute(visual) : drag.lastPoint || drag.origin;
            drag.ending = true;
            if (owner.drag.resize) {
                owner.drag.endDeadline = Date.now() + 2500;
                return;
            }
            updateDrag(owner, false);
            finishDrag(owner);
        });
    }
    function refreshFrames(owner) {
        const config = Object.assign({}, Q.getSettingsConfig(), owner.transaction.snapshot());
        for (const element of owner.elements) {
            const item = owner.frames.get(element.id);
            const target = owner.hud ? resolve(owner, element, config) : null;
            const measured = target && (!element.available || element.available(owner.hud, config)) && G.isShown(target)
                ? G.frameBox(element, target, owner.overlay) : null;
            // Settings-only entries can share a native owner (warnings, ranks,
            // quickbuy), but must not place another input surface over it.
            const box = Q.presentation.hasFrame(element) ? measured : null;
            const visible = !!box;
            item.available = !!measured;
            if (item.frame.visible !== visible) item.frame.visible = visible;
            const unavailable = !measured && !element.context && !!element.path;
            const caption = localize(element.name);
            if (item.caption.text !== caption) item.caption.text = caption;
            P.setClass(item.button, "Unavailable", unavailable);
            if (owner.selected === element && owner.inspector) {
                const text = unavailable ? localize("Unavailable now") : "";
                if (owner.inspector.availability.text !== text) owner.inspector.availability.text = text;
            }
            const draggable = !!box && !owner.applied && !owner.transaction.isLocked(element.id) && Q.presentation.canDrag(element);
            if (item.draggable !== draggable) {
                // Native XML supports draggable at creation. SetDraggable is
                // only an optional convenience in the existing settings dragger.
                if (typeof item.frame.SetDraggable === "function") item.frame.SetDraggable(draggable);
                item.draggable = draggable;
            }
            if (box) {
                item.signature = P.syncStyles(item.frame, {
                    x: `${Math.round(box.x)}px`, y: `${Math.round(box.y)}px`,
                    width: `${Math.round(box.width)}px`, height: `${Math.round(box.height)}px`,
                    // Small leaves remain selectable inside broader family
                    // frames. Every frame stays below the inspector chrome.
                    zIndex: box.width * box.height < 30000 ? "3" : "1"
                }, item.signature).sig;
            }
            for (const handle of item.handles) {
                const canResize = !!box && owner.selected === element && !owner.applied && !owner.transaction.isLocked(element.id);
                if (handle.visible !== canResize) handle.visible = canResize;
            }
        }
        refreshCatalog(owner);
    }
    function refreshCatalog(owner) {
        let count = 0;
        for (const element of owner.elements) {
            const item = owner.frames.get(element.id);
            const matches = !owner.query || [element.name, element.group || "HUD", ...element.fields.map(field => field.label)]
                .some(text => (text + " " + localize(text)).toLowerCase().includes(owner.query));
            item.button.visible = matches && (owner.showAll || item.available || (owner.selectionPinned && owner.selected === element));
            if (item.button.visible) count++;
        }
        for (const { heading, ids } of owner.headings) heading.visible = !owner.query && ids.some(id => owner.frames.get(id).button.visible);
        owner.empty.visible = !count;
    }
    function watch(owner) {
        if (current !== owner) return;
        if (!P.isAlive(owner.overlay) || (owner.hud && !P.isAlive(owner.hud)) || !P.isAlive(owner.window) || !owner.window.BHasClass("Visible") ||
            (!owner.applied && !owner.transaction.valid())) { stop(); return; }
        try {
            if (!owner.applied && !owner.transaction.publish()) { stop(); return; }
            refreshHistory(owner);
            refreshFrames(owner);
            owner.status.text = localize(owner.feedback || (!owner.hud ? "Edit settings here; live HUD frames appear in a match or sandbox." :
                owner.transaction.acknowledged() ? "Preview active" : "Waiting for HUD preview"));
            owner.timer = $.Schedule(0.2, () => watch(owner));
        } catch (error) {
            recordError(error);
            stop();
        }
    }
    function saveApplied(owner) {
        if (current !== owner || owner.saving) return;
        owner.saving = true;
        owner.apply.enabled = false;
        owner.feedback = "Saving HUD changes...";
        owner.status.text = localize(owner.feedback);
        const completed = error => {
            if (current !== owner) return;
            owner.saving = false;
            if (!error) { stop(true, "HUD changes saved."); return; }
            owner.feedback = "HUD changes applied, but saving failed. Retry save or close.";
            owner.status.text = localize(owner.feedback);
            owner.apply.enabled = true;
            owner.apply.GetChild(0).text = localize("Retry save");
        };
        try { Q.core.storageBridge.saveSettings(Q.getSettingsConfig(), completed); }
        catch (error) { completed(error); }
    }
    function start(onStop, options = {}) {
        lastError = "";
        if (current || Q.ui.visualCheck?.isRunning()) return false;
        const element = options.elementId ? Q.presentation.elements.find(item => item.id === options.elementId) : null;
        if (options.elementId && !element) {
            recordError(new Error(localize("Unknown HUD element.")));
            return false;
        }
        const context = $.GetContextPanel();
        const root = Q.core.persistence.getUIRoot();
        const hud = Q.ui.customizeSession.resolveHud(root);
        const window = P.findTraverse(context, "SettingsWindow");
        if (!P.isAlive(root) || !P.isAlive(window) || !window.BHasClass("Visible")) return false;
        const overlay = P.create("Panel", context, "QOLCustomizeEditor");
        if (!P.isAlive(overlay)) return false;
        const owner = { context, hud, window, overlay, transaction: Q.ui.customizeSession.create(root, hud, window, element),
            elements: element ? [element] : Q.presentation.elements.filter(item => Q.presentation.hasFrame(item) && item.fields.length && !item.context),
            hidden: [], active: [], frames: new Map(), headings: [], query: "", showAll: !hud, selectionPinned: false,
            timer: null, dragTimer: null, drag: null, inspector: null, onStop, applied: false, saving: false };
        current = owner;
        try {
            overlay.AddClass("QOLCustomizeOverlay");
            overlay.hittest = true;
            overlay.hittestchildren = true;
            overlay.acceptsfocus = true;
            overlay.SetPanelEvent("onactivate", () => {});
            overlay.SetPanelEvent("oncancel", () => {
                if (current === owner) Q.ui.window.handleCustomizeCancel();
            });
            const view = P.create("Panel", overlay, "QOLCustomizeView");
            view.AddClass("QOLCustomizeView");
            view.AddClass("QOLUnifiedModalSurface");
            const panels = I.button(view, "QOLCustomizeTogglePanels", "Hide panels", () => {
                if (current !== owner) return;
                owner.panelsHidden = !owner.panelsHidden;
                overlay.SetHasClass("PanelsHidden", owner.panelsHidden);
                panels.GetChild(0).text = localize(owner.panelsHidden ? "Show panels" : "Hide panels");
            });
            const frames = I.button(view, "QOLCustomizeToggleFrames", "Show frames", () => {
                if (current !== owner) return;
                owner.showFrames = !owner.showFrames;
                overlay.SetHasClass("ShowFrames", owner.showFrames);
                frames.GetChild(0).text = localize(owner.showFrames ? "Hide frames" : "Show frames");
            });
            const snap = I.button(view, "QOLCustomizeToggleSnap", "Snap to center", () => {
                if (current !== owner) return;
                owner.snapEnabled = owner.snapEnabled === false ? true : false;
                I.setActive(snap, owner.snapEnabled !== false);
            });
            I.setActive(snap, true);
            const guideX = P.create("Panel", overlay, "QOLCustomizeGuideX");
            guideX.AddClass("QOLCustomizeGuideLine");
            guideX.AddClass("Vertical");
            guideX.hittest = false;
            guideX.visible = false;
            owner.guideX = guideX;
            const guideY = P.create("Panel", overlay, "QOLCustomizeGuideY");
            guideY.AddClass("QOLCustomizeGuideLine");
            guideY.AddClass("Horizontal");
            guideY.hittest = false;
            guideY.visible = false;
            owner.guideY = guideY;
            Q.ui.theme.ApplySettingsThemeClasses(window);
            for (const panel of [hud, context]) if (P.isAlive(panel) && !panel.BHasClass("QOLCustomizeActive")) {
                panel.AddClass("QOLCustomizeActive"); owner.active.push(panel);
            }
            for (const child of context.Children()) {
                if (child === overlay || ["QOLStorageBridge", "EscapeButton", "EscapeBackground"].includes(child.id)) continue;
                if (!child.BHasClass("QOLCustomizeHidden")) { child.AddClass("QOLCustomizeHidden"); owner.hidden.push(child); }
            }
            const tools = P.create("Panel", overlay, "QOLCustomizeTools");
            tools.AddClass("QOLCustomizeTools");
            tools.AddClass("QOLUnifiedModalSurface");
            tools.hittest = true;
            const catalog = P.create("Panel", overlay, "QOLCustomizeCatalog");
            catalog.AddClass("QOLCustomizeCatalog");
            catalog.AddClass("QOLUnifiedModalSurface");
            catalog.visible = !element;
            I.label(catalog, "HUD Elements", "ModalTitle").AddClass("QOLCustomizeTitle");
            I.label(catalog, "Search elements");
            const search = P.create("TextEntry", catalog, "QOLCustomizeSearch");
            search.AddClass("QOLCustomizeSearch");
            search.AddClass("ValueInput");
            const allElements = I.button(catalog, "QOLCustomizeAllElements", "All elements", () => {
                if (current !== owner) return;
                owner.showAll = !owner.showAll;
                I.setActive(allElements, owner.showAll);
                refreshCatalog(owner);
            });
            I.setActive(allElements, owner.showAll);
            const choices = P.create("Panel", catalog, "");
            owner.choices = choices;
            choices.AddClass("QOLCustomizeChoices");
            let group = "";
            // Groups are source keys; localized headings do not need ICU collation.
            const ordered = owner.elements.slice().sort((a, b) => {
                const left = a.group || "HUD", right = b.group || "HUD";
                return left < right ? -1 : left > right ? 1 : 0;
            });
            for (const element of ordered) {
                const nextGroup = element.group || "HUD";
                if (group !== nextGroup) { group = nextGroup; owner.headings.push({ heading: I.label(choices, group), ids: [] }); }
                owner.headings[owner.headings.length - 1].ids.push(element.id);
                const frame = P.create("Button", overlay, "QOLCustomizeFrame_" + element.id, { draggable: Q.presentation.canDrag(element) ? "true" : "false" });
                frame.AddClass("QOLCustomizeFrame");
                frame.hittest = true;
                frame.SetPanelEvent("onactivate", () => select(owner, element));
                frame.SetPanelEvent("onmouseover", () => {
                    if (current === owner && !owner.drag) $.DispatchEvent("UIShowTextTooltip", frame, localize(element.name));
                });
                frame.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", frame));
                const handles = [];
                if (Q.presentation.resizeField(element)) {
                    for (const [name, x, y] of [["", 1, 1], ["TopLeft", -1, -1], ["TopRight", 1, -1], ["BottomLeft", -1, 1]]) {
                        const handle = P.create("Button", frame, "QOLCustomizeResize_" + element.id + name, { draggable: "true" });
                        handle.AddClass("QOLCustomizeResize");
                        if (name) handle.AddClass(name);
                        handle.visible = false;
                        handle.SetPanelEvent("onmouseover", () => {
                            if (current === owner && !owner.drag) $.DispatchEvent("UIShowTextTooltip", handle, localize("Drag this corner to resize."));
                        });
                        handle.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", handle));
                        bindDrag(owner, element, handle, { x, y });
                        handles.push(handle);
                    }
                }
                const button = I.button(choices, "QOLCustomizeSelect_" + element.id, element.name, () => select(owner, element));
                owner.frames.set(element.id, { frame, handles, button, caption: button.GetChild(0), signature: null });
                bindDrag(owner, element, frame);
            }
            search.SetPanelEvent("ontextentrychange", () => {
                if (current !== owner) return;
                owner.query = String(search.text || "").trim().toLowerCase();
                refreshCatalog(owner);
            });
            owner.empty = I.label(choices, "No visible elements");
            owner.fields = P.create("Panel", tools, "QOLCustomizeFields");
            const history = P.create("Panel", tools, "");
            history.AddClass("QOLCustomizeActions");
            owner.undo = I.button(history, "QOLCustomizeUndo", "Undo", () => historyAction(owner, false));
            owner.redo = I.button(history, "QOLCustomizeRedo", "Redo", () => historyAction(owner, true));
            owner.reset = I.button(history, "QOLCustomizeReset", "Reset", () => {
                if (current !== owner || owner.applied || owner.drag || !owner.selected) return;
                if (owner.transaction.reset(owner.selected)) refreshFields(owner);
            });
            for (const [button, text] of [[owner.undo, "Undo the last change."], [owner.redo, "Restore the change canceled by Undo."],
                [owner.reset, "Reset the selected element to defaults."]]) {
                button.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", button, localize(text)));
                button.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", button));
            }
            const actions = P.create("Panel", tools, "");
            actions.AddClass("QOLCustomizeActions");
            owner.apply = I.button(actions, "QOLCustomizeApply", "Save", () => {
                if (current !== owner || owner.saving) return;
                if (owner.applied) { saveApplied(owner); return; }
                if (!owner.inspector.commit()) {
                    owner.feedback = "Enter a valid number or #RRGGBB color.";
                    owner.status.text = localize(owner.feedback);
                    return;
                }
                if (owner.transaction.apply()) {
                    owner.applied = true;
                    owner.fields.enabled = false;
                    owner.choices.enabled = false;
                    owner.cancel.GetChild(0).text = localize("Close");
                    owner.undo.enabled = false;
                    owner.redo.enabled = false;
                    owner.reset.enabled = false;
                    saveApplied(owner);
                }
            }, true);
            owner.cancel = I.button(actions, "QOLCustomizeCancel", "Cancel", () => { if (current === owner) stop(); });
            owner.status = I.label(tools, "Waiting for HUD preview");
            Q.preview?.hideAll?.();
            Q.tooltip?.hideRowTooltip?.();
            refreshFrames(owner);
            select(owner, element || owner.elements.find(item => owner.frames.get(item.id).available) || owner.elements[0], !!element);
            watch(owner);
            overlay.SetFocus();
            return current === owner;
        } catch (error) {
            recordError(error);
            stop();
            return false;
        }
    }
    Q.ui.customize = { start, stop, isRunning: () => !!current, onMenuClosed: () => stop(false),
        failureText: () => lastError ? localize("Editor error:") + " " + lastError : "" };
})();
