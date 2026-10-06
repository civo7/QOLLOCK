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
        cleanup(() => owner.transaction.close());
        for (const timer of [owner.timer, owner.dragTimer]) if (timer !== null) cleanup(() => $.CancelScheduled(timer));
        cleanup(() => P.delete(owner.drag?.proxy));
        for (const panel of owner.hidden) cleanup(() => { if (P.isAlive(panel)) panel.RemoveClass("QOLCustomizeHidden"); });
        for (const panel of owner.active) cleanup(() => { if (P.isAlive(panel)) panel.RemoveClass("QOLCustomizeActive"); });
        for (const { frame, handle } of owner.frames.values()) {
            cleanup(() => P.delete(frame));
            cleanup(() => P.delete(handle));
        }
        cleanup(() => P.delete(owner.overlay));
        cleanup(() => { if (focus && P.isAlive(owner.window) && owner.window.BHasClass("Visible")) owner.window.SetFocus(); });
        cleanup(() => Q.ui.window.requestSettingsListSoftRefresh?.(0));
        cleanup(() => owner.onStop?.(feedback));
    }
    function refreshFields(owner) {
        if (current !== owner) return;
        owner.feedback = null;
        owner.inspector?.sync();
        owner.undo.enabled = owner.transaction.canUndo();
        owner.redo.enabled = owner.transaction.canRedo();
        refreshFrames(owner);
    }
    function select(owner, element) {
        if (current !== owner || owner.drag || owner.applied) return false;
        if (owner.inspector && !owner.inspector.commit()) {
            owner.feedback = "Enter a valid number or #RRGGBB color.";
            owner.status.text = localize(owner.feedback);
            return false;
        }
        owner.selected = element;
        for (const [id, item] of owner.frames) {
            item.frame.SetHasClass("Selected", id === element.id);
            I.setActive(item.button, id === element.id);
        }
        owner.inspector = I.build(owner.fields, element, owner.transaction, () => refreshFields(owner));
        refreshFields(owner);
        return true;
    }
    function finishDrag(owner, cancel = false) {
        if (current !== owner || !owner.drag) return;
        const { proxy } = owner.drag;
        if (owner.dragTimer !== null) $.CancelScheduled(owner.dragTimer);
        owner.dragTimer = null;
        P.delete(proxy);
        owner.transaction.endGesture(cancel);
        owner.drag = null;
        for (const item of owner.frames.values()) item.signature = null;
        refreshFields(owner);
    }
    function updateDrag(owner, reschedule = true) {
        if (current !== owner || !owner.drag) return;
        const drag = owner.drag;
        if (!owner.transaction.valid() || !P.isAlive(drag.frame) || !P.isAlive(drag.proxy) || resolve(owner, drag.element) !== drag.target || !G.isShown(drag.target)) {
            finishDrag(owner, true);
            return;
        }
        // The native compositor reparents and positions the drag visual at the
        // cursor. Establish its origin after that first layout, never from the
        // source frame's old parent coordinates.
        const point = G.absolute(drag.proxy);
        if (!drag.origin) drag.origin = point;
        const delta = { x: point.x - drag.origin.x, y: point.y - drag.origin.y };
        owner.transaction.edit(drag.resize ? G.resizeValues(drag.element, drag.startValues, drag.startBox, delta, owner.overlay)
            : G.dragValues(drag.element, drag.target, drag.startValues, delta));
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
            owner.dragTimer = $.Schedule(0, () => updateDrag(owner));
        });
        $.RegisterEventHandler("DragEnd", frame, () => {
            if (current !== owner || owner.drag?.frame !== frame) return;
            updateDrag(owner, false);
            finishDrag(owner);
        });
    }
    function refreshFrames(owner) {
        const config = Object.assign({}, Q.getSettingsConfig(), owner.transaction.snapshot());
        for (const element of Q.presentation.elements) {
            const item = owner.frames.get(element.id);
            const target = owner.hud ? resolve(owner, element, config) : null;
            const measured = target && (!element.available || element.available(owner.hud, config)) && G.isShown(target)
                ? G.frameBox(element, target, owner.overlay) : null;
            // Settings-only entries can share a native owner (warnings, ranks,
            // quickbuy), but must not place another input surface over it.
            const box = Q.presentation.hasFrame(element) ? measured : null;
            const visible = !!box;
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
            if (item.handle) {
                const canResize = !!box && owner.selected === element && !owner.applied && !owner.transaction.isLocked(element.id);
                if (item.handle.visible !== canResize) item.handle.visible = canResize;
            }
        }
    }
    function watch(owner) {
        if (current !== owner) return;
        if (!P.isAlive(owner.overlay) || (owner.hud && !P.isAlive(owner.hud)) || !P.isAlive(owner.window) || !owner.window.BHasClass("Visible") ||
            (!owner.applied && !owner.transaction.valid())) { stop(); return; }
        try {
            if (!owner.applied && !owner.transaction.publish()) { stop(); return; }
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
    function start(onStop) {
        lastError = "";
        if (current || Q.ui.visualCheck?.isRunning()) return false;
        const context = $.GetContextPanel();
        const root = Q.core.persistence.getUIRoot();
        const hud = Q.ui.customizeSession.resolveHud(root);
        const window = P.findTraverse(context, "SettingsWindow");
        if (!P.isAlive(root) || !P.isAlive(window) || !window.BHasClass("Visible")) return false;
        const overlay = P.create("Panel", context, "QOLCustomizeEditor");
        if (!P.isAlive(overlay)) return false;
        const owner = { context, hud, window, overlay, transaction: Q.ui.customizeSession.create(root, hud, window),
            hidden: [], active: [], frames: new Map(), timer: null, dragTimer: null, drag: null, inspector: null, onStop, applied: false, saving: false };
        current = owner;
        try {
            overlay.AddClass("QOLCustomizeOverlay");
            overlay.hittest = true;
            overlay.hittestchildren = true;
            overlay.acceptsfocus = true;
            overlay.SetPanelEvent("onactivate", () => {});
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
            I.label(tools, "Customize", "ModalTitle").AddClass("QOLCustomizeTitle");
            I.label(tools, "Select an element on the HUD or in the list.");
            I.label(tools, "Press Enter to preview a typed value.");
            const catalog = P.create("Panel", overlay, "QOLCustomizeCatalog");
            catalog.AddClass("QOLCustomizeCatalog");
            catalog.AddClass("QOLUnifiedModalSurface");
            I.label(catalog, "HUD Elements", "ModalTitle").AddClass("QOLCustomizeTitle");
            I.label(catalog, "Search elements");
            const search = P.create("TextEntry", catalog, "QOLCustomizeSearch");
            search.AddClass("QOLCustomizeSearch");
            search.AddClass("ValueInput");
            const choices = P.create("Panel", catalog, "");
            owner.choices = choices;
            choices.AddClass("QOLCustomizeChoices");
            let group = "";
            // Groups are source keys; localized headings do not need ICU collation.
            const ordered = Q.presentation.elements.slice().sort((a, b) => {
                const left = a.group || "HUD", right = b.group || "HUD";
                return left < right ? -1 : left > right ? 1 : 0;
            });
            const headings = [];
            for (const element of ordered) {
                const nextGroup = element.group || "HUD";
                if (group !== nextGroup) { group = nextGroup; headings.push(I.label(choices, group)); }
                const frame = P.create("Button", overlay, "QOLCustomizeFrame_" + element.id, { draggable: Q.presentation.canDrag(element) ? "true" : "false" });
                frame.AddClass("QOLCustomizeFrame");
                frame.hittest = true;
                frame.SetPanelEvent("onactivate", () => select(owner, element));
                frame.SetPanelEvent("onmouseover", () => {
                    if (current === owner && !owner.drag) $.DispatchEvent("UIShowTextTooltip", frame, localize(element.name));
                });
                frame.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", frame));
                let handle = null;
                if (Q.presentation.resizeField(element)) {
                    handle = P.create("Button", frame, "QOLCustomizeResize_" + element.id, { draggable: "true" });
                    handle.AddClass("QOLCustomizeResize");
                    handle.visible = false;
                    handle.SetPanelEvent("onmouseover", () => {
                        if (current === owner && !owner.drag) $.DispatchEvent("UIShowTextTooltip", handle, localize("Drag this corner to resize."));
                    });
                    handle.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", handle));
                    bindDrag(owner, element, handle, true);
                }
                const button = I.button(choices, "QOLCustomizeSelect_" + element.id, element.name, () => select(owner, element));
                owner.frames.set(element.id, { frame, handle, button, caption: button.GetChild(0), signature: null });
                bindDrag(owner, element, frame);
            }
            search.SetPanelEvent("ontextentrychange", () => {
                if (current !== owner) return;
                const query = String(search.text || "").trim().toLowerCase();
                for (const element of Q.presentation.elements) owner.frames.get(element.id).button.visible = !query ||
                    [element.name, element.group || "HUD", ...element.fields.map(field => field.label)]
                        .some(text => (text + " " + localize(text)).toLowerCase().includes(query));
                for (const heading of headings) heading.visible = !query;
            });
            owner.fields = P.create("Panel", tools, "QOLCustomizeFields");
            const history = P.create("Panel", tools, "");
            history.AddClass("QOLCustomizeActions");
            owner.undo = I.button(history, "QOLCustomizeUndo", "Undo", () => { if (current === owner) { owner.transaction.undo(); refreshFields(owner); } });
            owner.redo = I.button(history, "QOLCustomizeRedo", "Redo", () => { if (current === owner) { owner.transaction.redo(); refreshFields(owner); } });
            const actions = P.create("Panel", tools, "");
            actions.AddClass("QOLCustomizeActions");
            owner.apply = I.button(actions, "QOLCustomizeApply", "Apply", () => {
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
                    saveApplied(owner);
                }
            }, true);
            owner.cancel = I.button(actions, "QOLCustomizeCancel", "Cancel", () => { if (current === owner) stop(); });
            owner.status = I.label(tools, "Waiting for HUD preview");
            Q.preview?.hideAll?.();
            Q.tooltip?.hideRowTooltip?.();
            select(owner, Q.presentation.elements[0]);
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
