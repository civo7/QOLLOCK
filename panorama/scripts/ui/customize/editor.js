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
        cleanup(() => owner.chrome?.dispose());
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
    function alignmentReady(owner, pending) {
        if (!owner.transaction.acknowledged()) return false;
        if (!pending.before) return true;
        const { target, bounds, values } = pending.before;
        if (resolve(owner, pending.element) !== target) return false;
        const measured = G.frameBox(pending.element, target, owner.overlay);
        if (!measured) return false;
        for (const field of pending.element.fields.filter(field => field.axis)) {
            const change = owner.transaction.value(field.key) - values[field.key];
            if (!change) continue;
            const parent = target.GetParent();
            const dimension = field.axis === "x" ? "actuallayoutwidth" : "actuallayoutheight";
            const pixels = field.unit === "%" ? change * Number(parent[dimension]) / 100 : change * G.scale(parent, field.axis);
            const expected = bounds[field.axis] + pixels * (field.direction || 1) / G.scale(owner.overlay, field.axis);
            if (!Number.isFinite(expected) || Math.abs(measured[field.axis] - expected) > 2) return false;
        }
        const scaleField = Q.presentation.resizeField(pending.element);
        if (scaleField && values[scaleField.key] !== owner.transaction.value(scaleField.key)) {
            const ratio = owner.transaction.value(scaleField.key) / values[scaleField.key];
            if (Math.abs(measured.width - bounds.width * ratio) > 2 || Math.abs(measured.height - bounds.height * ratio) > 2) return false;
        }
        return true;
    }
    function align(owner, action, accepted = false) {
        if (current !== owner || owner.applied || owner.drag || !owner.selected || owner.transaction.isLocked(owner.selected.id)) return;
        const priorTarget = resolve(owner, owner.selected);
        const priorBounds = G.frameBox(owner.selected, priorTarget, owner.overlay);
        const priorValues = {};
        for (const field of owner.selected.fields) priorValues[field.key] = owner.transaction.value(field.key);
        if (!owner.inspector.commit()) return;
        const pending = { element: owner.selected, action, deadline: Date.now() + 2500,
            before: priorBounds ? { target: priorTarget, bounds: priorBounds, values: priorValues } : null };
        if (!accepted && Object.keys(owner.transaction.snapshot()).length && !alignmentReady(owner, pending)) {
            owner.pendingAlignment = pending;
            refreshFrames(owner);
            return;
        }
        const target = resolve(owner, owner.selected);
        if (!P.isAlive(target) || !G.isShown(target)) return;
        const delta = G.alignDelta(G.frameBox(owner.selected, target, owner.overlay), G.viewport(owner.overlay), action);
        if (!delta) return;
        const values = {};
        for (const field of owner.selected.fields) values[field.key] = owner.transaction.value(field.key);
        owner.transaction.edit(G.dragValues(owner.selected, target, values, G.screenDelta(delta, owner.overlay)));
        refreshFields(owner);
    }
    function showGuides(owner, drag) {
        const bounds = G.frameBox(drag.element, drag.target, owner.overlay);
        for (const axis of ["x", "y"]) {
            const panel = axis === "x" ? owner.guideX : owner.guideY;
            const guide = drag.guides?.[axis];
            const visible = !!bounds && !!guide && owner.transaction.acknowledged() &&
                Math.abs(G.points(bounds, axis)[guide.index] - guide.value) <= 1;
            if (panel.visible !== visible) panel.visible = visible;
            if (visible) QOL_UTILS.SetStyleIfChanged(panel, axis, `${Math.round(guide.value)}px`);
        }
    }
    function refreshHistory(owner) {
        const pending = owner.inspector?.hasPending();
        owner.undo.enabled = !owner.applied && !owner.drag && (owner.transaction.canUndo() || pending);
        owner.redo.enabled = !owner.applied && !owner.drag && !pending && owner.transaction.canRedo();
        owner.reset.enabled = !owner.applied && !owner.drag && !!owner.selected;
    }
    function historyAction(owner, redo) {
        if (current !== owner || owner.applied || owner.drag) return;
        owner.pendingAlignment = null;
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
        owner.pendingAlignment = null;
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
        owner.fields.enabled = !owner.applied;
        for (const item of owner.frames.values()) item.signature = null;
        refreshFields(owner);
    }
    function updateDrag(owner, reschedule = true) {
        if (current !== owner || !owner.drag) return;
        const drag = owner.drag;
        if (!owner.transaction.valid() || !P.isAlive(drag.frame) || (!drag.ending && !P.isAlive(drag.proxy)) || resolve(owner, drag.element) !== drag.target ||
            drag.target.GetParent() !== drag.parent || Q.presentation.scaleTarget(drag.element, drag.target) !== drag.scaleTarget || !G.isShown(drag.target)) {
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
        if (!drag.resize) {
            const neighbors = [];
            if (owner.snapEnabled) for (const [id, item] of owner.frames) {
                if (id !== drag.element.id && item.available && item.target !== drag.target && item.measured) neighbors.push(item.measured);
            }
            const snapped = owner.snapEnabled ? G.snap(drag.startBox, G.canvasDelta(delta, owner.overlay), G.viewport(owner.overlay), neighbors,
                drag.element.fields.filter(field => field.axis).map(field => field.axis)) : { delta: G.canvasDelta(delta, owner.overlay), guides: {} };
            Object.assign(delta, G.screenDelta(snapped.delta, owner.overlay));
            drag.guides = snapped.guides;
        }
        const values = drag.resize ? G.resizeValues(drag.element, drag.startValues, drag.resizeBox, delta, owner.overlay, drag.resize)
            : G.dragValues(drag.element, drag.target, drag.startValues, delta);
        const scaleChanged = drag.resize && Object.entries(values).some(([key, value]) => owner.transaction.value(key) !== value);
        const settled = owner.transaction.acknowledged();
        const measured = G.frameBox(drag.element, drag.target, owner.overlay);
        // Two observed frames with the same accepted draft are required before
        // compensating the anchor. A new scale supersedes that measurement.
        const resizeField = drag.resize && Q.presentation.resizeField(drag.element);
        const ratio = resizeField ? owner.transaction.value(resizeField.key) / drag.startValues[resizeField.key] : 1;
        const sizeReady = !drag.resize || (measured && Math.abs(measured.width - drag.startBox.width * ratio) <= 2 &&
            Math.abs(measured.height - drag.startBox.height * ratio) <= 2);
        const layoutSignature = settled && measured && sizeReady ? JSON.stringify([measured, owner.transaction.snapshot()]) : null;
        const layoutReady = layoutSignature && drag.layoutSignature === layoutSignature;
        drag.layoutSignature = layoutSignature;
        if (drag.resize && !scaleChanged && layoutReady) {
            const snapshot = {};
            for (const field of drag.element.fields) snapshot[field.key] = owner.transaction.value(field.key);
            Object.assign(values, G.anchorValues(drag.element, drag.target, drag.startBox,
                measured, snapshot, owner.overlay, drag.resize));
        }
        const unchanged = Object.entries(values).every(([key, value]) => owner.transaction.value(key) === value);
        if (drag.ending && layoutReady && unchanged) { finishDrag(owner); return; }
        if (!unchanged) owner.transaction.edit(values);
        showGuides(owner, drag);
        if (measured) syncFrame(owner, owner.frames.get(drag.element.id), measured);
        if (drag.ending && Date.now() >= drag.endDeadline) { finishDrag(owner); return; }
        if (reschedule) owner.dragTimer = $.Schedule(0.016, () => updateDrag(owner));
    }
    function bindDrag(owner, element, frame, resize = false) {
        $.RegisterEventHandler("DragStart", frame, (_panel, event) => {
            if (current !== owner || owner.applied || owner.drag || owner.chrome?.isDragging() || !frame.visible || owner.transaction.isLocked(element.id)) return;
            const target = resolve(owner, element);
            if (!P.isAlive(target) || !G.isShown(target) || !(resize ? Q.presentation.resizeField(element) : Q.presentation.canDrag(element))) return;
            if (!select(owner, element)) return;
            if (Object.keys(owner.transaction.snapshot()).length && !owner.transaction.acknowledged()) return;
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
            owner.drag = { frame, proxy, target, element, origin: null, startValues, startBox,
                resizeBox: G.hitBox(startBox, G.viewport(owner.overlay)), resize, parent: target.GetParent(), scaleTarget: Q.presentation.scaleTarget(element, target) };
            event.displayPanel = proxy;
            event.removePositionBeforeDrop = false;
            $.DispatchEvent("UIHideTextTooltip", frame);
            if (P.isAlive(owner.overlay)) owner.overlay.AddClass("Dragging");
            owner.dragTimer = $.Schedule(0, () => updateDrag(owner));
            owner.fields.enabled = false;
            refreshHistory(owner);
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
                updateDrag(owner, false);
                return;
            }
            updateDrag(owner, false);
            finishDrag(owner);
        });
    }
    function syncFrame(owner, item, measured) {
        const bounds = G.hitBox(measured, G.viewport(owner.overlay));
        item.signature = P.syncStyles(item.frame, {
            x: `${Math.round(bounds.x)}px`, y: `${Math.round(bounds.y)}px`,
            width: `${Math.round(bounds.width)}px`, height: `${Math.round(bounds.height)}px`,
            zIndex: bounds.width * bounds.height < 30000 ? "3" : "1"
        }, item.signature).sig;
        item.outlineSignature = P.syncStyles(item.outline, {
            x: `${Math.round(measured.x - bounds.x)}px`, y: `${Math.round(measured.y - bounds.y)}px`,
            width: `${Math.round(measured.width)}px`, height: `${Math.round(measured.height)}px`
        }, item.outlineSignature).sig;
        P.setClass(item.frame, "SmallTarget", measured.width < bounds.width || measured.height < bounds.height);
        const selected = owner.selected?.id === item.id;
        item.borderSignature = P.syncStyles(item.outline, {
            border: selected ? "2px solid #7fe5b8" : item.hovered ? "1px solid rgba(127, 229, 184, 0.75)" :
                owner.showFrames ? "1px solid rgba(127, 229, 184, 0.35)" : "1px solid transparent"
        }, item.borderSignature).sig;
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
            const box = Q.presentation.hasFrame(element) && measured ? G.hitBox(measured, G.viewport(owner.overlay)) : null;
            const visible = !!box;
            item.available = !!measured;
            item.target = target;
            item.measured = measured;
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
                syncFrame(owner, item, measured);
            }
            for (const handle of item.handles) {
                const canResize = !!box && owner.selected === element && !owner.applied && !owner.transaction.isLocked(element.id);
                if (handle.visible !== canResize) handle.visible = canResize;
            }
        }
        refreshCatalog(owner);
        const movable = !!owner.selected && !!owner.hud && !owner.applied && !owner.drag && !owner.pendingAlignment && !owner.transaction.isLocked(owner.selected.id) &&
            Q.presentation.canDrag(owner.selected) && !!owner.frames.get(owner.selected.id)?.available;
        for (const button of owner.alignButtons || []) button.enabled = movable;
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
            owner.chrome.refresh();
            if (owner.pendingAlignment && alignmentReady(owner, owner.pendingAlignment)) {
                const pending = owner.pendingAlignment;
                owner.pendingAlignment = null;
                if (owner.selected === pending.element) align(owner, pending.action, true);
            } else if (owner.pendingAlignment && Date.now() >= owner.pendingAlignment.deadline) {
                owner.pendingAlignment = null;
            }
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
            timer: null, dragTimer: null, drag: null, inspector: null, onStop, applied: false, saving: false, snapEnabled: true };
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
            owner.chrome = Q.ui.customizeChrome.create(overlay, () => current === owner && !owner.drag);
            const view = P.create("Panel", overlay, "QOLCustomizeView");
            owner.view = view;
            view.AddClass("QOLCustomizeView");
            view.AddClass("QOLUnifiedModalSurface");
            owner.chrome.header(view, "QOLCustomizeDragView", "Customize");
            const viewActions = P.create("Panel", view, "");
            viewActions.AddClass("QOLCustomizeActions");
            const panels = I.button(viewActions, "QOLCustomizeTogglePanels", "Hide panels", () => {
                if (current !== owner) return;
                owner.panelsHidden = !owner.panelsHidden;
                overlay.SetHasClass("PanelsHidden", owner.panelsHidden);
                owner.tools.visible = !owner.panelsHidden;
                owner.catalog.visible = !element && !owner.panelsHidden;
                panels.GetChild(0).text = localize(owner.panelsHidden ? "Show panels" : "Hide panels");
            });
            const frames = I.button(viewActions, "QOLCustomizeToggleFrames", "Show frames", () => {
                if (current !== owner) return;
                owner.showFrames = !owner.showFrames;
                overlay.SetHasClass("ShowFrames", owner.showFrames);
                frames.GetChild(0).text = localize(owner.showFrames ? "Hide frames" : "Show frames");
                refreshFrames(owner);
            });
            const snap = I.button(viewActions, "QOLCustomizeToggleSnap", "Magnets", () => {
                if (current !== owner) return;
                owner.snapEnabled = owner.snapEnabled === false ? true : false;
                I.setActive(snap, owner.snapEnabled !== false);
                owner.guideX.visible = false;
                owner.guideY.visible = false;
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
            owner.tools = tools;
            tools.AddClass("QOLCustomizeTools");
            tools.AddClass("QOLUnifiedModalSurface");
            tools.hittest = true;
            owner.chrome.header(tools, "QOLCustomizeDragTools", "Properties");
            const catalog = P.create("Panel", overlay, "QOLCustomizeCatalog");
            owner.catalog = catalog;
            catalog.AddClass("QOLCustomizeCatalog");
            catalog.AddClass("QOLUnifiedModalSurface");
            catalog.visible = !element;
            owner.chrome.header(catalog, "QOLCustomizeDragCatalog", "HUD Elements");
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
                const outline = P.create("Panel", frame, "");
                outline.AddClass("QOLCustomizeOutline");
                outline.hittest = false;
                outline.hittestchildren = false;
                frame.SetPanelEvent("onactivate", () => select(owner, element));
                frame.SetPanelEvent("onmouseover", () => {
                    if (current === owner && !owner.drag) {
                        $.DispatchEvent("UIShowTextTooltip", frame, localize(element.name));
                        const item = owner.frames.get(element.id);
                        item.hovered = true;
                        if (item.measured) syncFrame(owner, item, item.measured);
                    }
                });
                frame.SetPanelEvent("onmouseout", () => {
                    $.DispatchEvent("UIHideTextTooltip", frame);
                    if (current !== owner) return;
                    const item = owner.frames.get(element.id);
                    item.hovered = false;
                    if (item.measured) syncFrame(owner, item, item.measured);
                });
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
                owner.frames.set(element.id, { id: element.id, frame, outline, handles, button, caption: button.GetChild(0), signature: null });
                bindDrag(owner, element, frame);
            }
            search.SetPanelEvent("ontextentrychange", () => {
                if (current !== owner) return;
                owner.query = String(search.text || "").trim().toLowerCase();
                refreshCatalog(owner);
            });
            owner.empty = I.label(choices, "No visible elements");
            owner.fields = P.create("Panel", tools, "QOLCustomizeFields");
            const alignment = P.create("Panel", tools, "QOLCustomizeAlignment");
            alignment.AddClass("QOLCustomizeEnum");
            owner.alignButtons = [];
            for (const [action, text] of [["right", "Align right"],
                ["top", "Align top"], ["middle", "Center vertically"], ["bottom", "Align bottom"]]) {
                owner.alignButtons.push(I.button(alignment, "QOLCustomizeAlign_" + action, text, () => align(owner, action)));
            }
            const history = P.create("Panel", tools, "");
            history.AddClass("QOLCustomizeActions");
            owner.undo = I.button(history, "QOLCustomizeUndo", "Undo", () => historyAction(owner, false));
            owner.redo = I.button(history, "QOLCustomizeRedo", "Redo", () => historyAction(owner, true));
            owner.reset = I.button(history, "QOLCustomizeReset", "Reset", () => {
                if (current !== owner || owner.applied || owner.drag || !owner.selected) return;
                owner.pendingAlignment = null;
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
