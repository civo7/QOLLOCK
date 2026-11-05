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
    const geometryKey = (element, values) => JSON.stringify(element.fields.filter(field => field.axis || field.resize)
        .map(field => [field.key, values[field.key]]));
    const fontResize = element => element.id === "ammoCurrent" || element.id === "ammoMax";
    const ammoFamily = element => element?.id === "ammo" || element?.parentId === "ammo";
    const pointerTarget = (owner, element) => !ammoFamily(element) || owner.selected === element ||
        (!ammoFamily(owner.selected) && element.id === "ammo");
    function syncShop(owner, selected) {
        if (!P.isAlive(owner.hud) || Q.ui.customizeSession.resolveHud(owner.root) !== owner.hud) return;
        const open = owner.hud.BHasClass("gShopOpen");
        if (owner.shopOpened && open) owner.shopObservedOpen = true;
        if (["shop", "recentPurchases"].includes(selected?.id)) {
            if (!owner.shopOpened && !open) {
                // Maintainer-verified toggle; never dispatch it again on polls or reselection.
                owner.shopOpened = Q.ui.consoleTab.runConsoleCommand("citadel_open_hero_sheet");
                owner.shopObservedOpen = owner.hud.BHasClass("gShopOpen");
            }
        } else if (owner.shopOpened) {
            // Balance a queued open even before its global class arrives. Once observed,
            // a natively closed shop must stay closed rather than being toggled open.
            if (open || !owner.shopObservedOpen) Q.ui.consoleTab.runConsoleCommand("citadel_open_hero_sheet");
            owner.shopOpened = false;
            owner.shopObservedOpen = false;
        }
    }
    const geometryGeneration = (owner, element) => Math.max(0, ...element.fields.filter(field => field.axis || field.resize)
        .map(field => owner.transaction.geometryGeneration(field.key)));
    function flowWidth(owner, element, target) {
        if (element.id !== "ammoMax") return null;
        // Both extracted ammo_panel layouts flow right. Current's native
        // content width shifts Max's origin independently of its own offset.
        const currentAmmo = Q.presentation.elements.find(item => item.id === "ammoCurrent");
        const sibling = currentAmmo && resolve(owner, currentAmmo);
        if (!P.isAlive(sibling) || sibling.GetParent() !== target.GetParent()) return null;
        const width = Number(sibling.actuallayoutwidth);
        return width > 0 ? width / G.scale(target.GetParent(), "x") : null;
    }
    function flowDelta(owner, element, before) {
        if (element.id !== "ammoMax" || before.flowWidth === null || before.flowWidth === undefined) return 0;
        const width = flowWidth(owner, element, before.target);
        return width === null ? null : (width - before.flowWidth) * G.scale(before.target.GetParent(), "x") / G.scale(owner.overlay, "x");
    }
    const measuredPanels = (element, target) => typeof element.measurePanels === "function"
        ? element.measurePanels(target).filter(G.isShown) : [];
    const samePanels = (a, b) => a.length === b.length && a.every((panel, index) => panel === b[index]);
    const observationContext = (owner, element, target) => ({
        parent: target.GetParent(), scaleTarget: Q.presentation.scaleTarget(element, target),
        panels: measuredPanels(element, target),
        measured: element.id === "healthbar" ? P.findChild(target, "QOLHealthbarGeometry") :
            element.measureId ? P.findChild(target, element.measureId) || P.findTraverse(target, element.measureId) : null,
        density: JSON.stringify([G.scale(owner.overlay, "x"), G.scale(owner.overlay, "y"),
            G.scale(target.GetParent(), "x"), G.scale(target.GetParent(), "y")]),
        origins: JSON.stringify([G.absolute(owner.overlay), G.absolute(target.GetParent())]),
        generation: JSON.stringify(element.fields.filter(field => !field.axis && !field.resize)
            .map(field => [field.key, owner.transaction.value(field.key)]))
    });
    const sameContext = (a, b) => !!a && !!b && a.parent === b.parent && a.scaleTarget === b.scaleTarget &&
        a.measured === b.measured && samePanels(a.panels, b.panels) && a.density === b.density && a.origins === b.origins;
    function observe(owner, element, target, bounds) {
        const item = owner.frames.get(element.id), values = {};
        for (const field of element.fields) values[field.key] = owner.transaction.value(field.key);
        const context = observationContext(owner, element, target);
        if (item.observed?.target !== target || !sameContext(item.observed?.context, context) ||
            item.observed.context.generation !== context.generation) item.geometryHistory = new Map();
        const sizeField = Q.presentation.resizeField(element);
        const observed = { target, bounds, values, context, generation: geometryGeneration(owner, element),
            sizeGeneration: sizeField ? owner.transaction.geometryGeneration(sizeField.key) : 0,
            axisGenerations: Object.fromEntries(element.fields.filter(field => field.axis)
                .map(field => [field.axis, owner.transaction.geometryGeneration(field.key)])),
            flowWidth: flowWidth(owner, element, target) };
        item.observed = observed;
        item.contextCandidate = null;
        item.layoutCandidate = null;
        item.geometryHistory.set(geometryKey(element, values), observed);
        if (item.geometryHistory.size > 50) item.geometryHistory.delete(item.geometryHistory.keys().next().value);
    }

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
        cleanup(() => syncShop(owner, null));
        for (const timer of [owner.timer, owner.dragTimer, owner.settleTimer, owner.activationTimer]) if (timer !== null) cleanup(() => $.CancelScheduled(timer));
        cleanup(() => P.delete(owner.drag?.proxy));
        cleanup(() => P.delete(owner.drag?.preview));
        cleanup(() => P.delete(owner.guideX));
        cleanup(() => P.delete(owner.guideY));
        for (const panel of owner.hidden) cleanup(() => { if (P.isAlive(panel)) panel.RemoveClass("QOLCustomizeHidden"); });
        for (const panel of owner.active) cleanup(() => { if (P.isAlive(panel)) panel.RemoveClass("QOLCustomizeActive"); });
        for (const { frame, cornerHost, handles } of owner.frames.values()) {
            cleanup(() => P.delete(frame));
            cleanup(() => P.delete(cornerHost));
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
    function acceptNavigation(owner) {
        if (!owner.transaction.valid()) return false;
        if (!owner.inspector || owner.inspector.commit()) return true;
        // An incomplete entry must not trap the canvas or element navigation.
        // Keep valid pending peers, then restore rejected text to the accepted
        // draft. Save continues to use the strict commit path.
        owner.inspector.commit({}, true);
        owner.inspector.sync();
        owner.feedback = null;
        return owner.transaction.valid();
    }
    function stableLayout(owner, element, context, key, measured) {
        const item = owner.frames.get(element.id);
        const signature = JSON.stringify([key, measured]);
        const candidate = item.layoutCandidate;
        const same = sameContext(candidate?.context, context) && candidate.signature === signature;
        const ready = same && Date.now() - candidate.time >= 16;
        if (!same) item.layoutCandidate = { context, signature, time: Date.now() };
        return ready;
    }
    function alignmentReady(owner, pending) {
        if (!pending.before) return owner.transaction.acknowledged();
        const { target, bounds, values } = pending.before;
        if (resolve(owner, pending.element) !== target) return false;
        const context = observationContext(owner, pending.element, target);
        if (pending.before.context && !sameContext(pending.before.context, context)) {
            const fresh = owner.frames.get(pending.element.id)?.observed;
            if (fresh !== pending.before && sameContext(fresh?.context, context)) return alignmentReady(owner, { element: pending.element, before: fresh });
            const prior = pending.before.context;
            if (prior.parent !== context.parent || prior.scaleTarget !== context.scaleTarget || prior.measured !== context.measured ||
                !samePanels(prior.panels, context.panels)) return false;
            // Density/origin changes preserve this owner's local coordinates.
            // Project the old measurement into the new canvas before checking
            // an offset that was already awaiting native layout.
            const oldScale = JSON.parse(prior.density), newScale = JSON.parse(context.density);
            const oldOrigin = JSON.parse(prior.origins), newOrigin = JSON.parse(context.origins);
            const projected = { ...bounds };
            for (const [axis, size, index] of [["x", "width", 0], ["y", "height", 1]]) {
                const local = (bounds[axis] * oldScale[index] + oldOrigin[0][axis] - oldOrigin[1][axis]) / oldScale[index + 2];
                projected[axis] = (newOrigin[1][axis] + local * newScale[index + 2] - newOrigin[0][axis]) / newScale[index];
                projected[size] = bounds[size] * oldScale[index] / oldScale[index + 2] * newScale[index + 2] / newScale[index];
            }
            return alignmentReady(owner, { element: pending.element, before: { ...pending.before, bounds: projected, context } });
        }
        const currentValues = {};
        for (const field of pending.element.fields) currentValues[field.key] = owner.transaction.value(field.key);
        const key = geometryKey(pending.element, currentValues);
        if (key === geometryKey(pending.element, values)) {
            if (pending.before.generation === undefined || pending.before.generation === geometryGeneration(owner, pending.element)) return true;
            // Reset/Undo may restore an old key before its withdrawal reaches
            // native layout. Returning to the same values is a new geometry
            // request, not evidence that the old box has returned as well.
            if (!owner.transaction.acknowledged()) return false;
            const restored = G.frameBox(pending.element, target, owner.overlay);
            const sizeField = Q.presentation.resizeField(pending.element);
            const sizeChanged = sizeField && pending.before.sizeGeneration !== owner.transaction.geometryGeneration(sizeField.key);
            const axes = pending.element.fields.filter(field => field.axis &&
                pending.before.axisGenerations?.[field.axis] !== owner.transaction.geometryGeneration(field.key)).map(field => field.axis);
            if (sizeChanged) axes.push(...(fontResize(pending.element) ? ["height"] : ["width", "height"]));
            const flow = axes.includes("x") ? flowDelta(owner, pending.element, pending.before) : 0;
            if (!restored || flow === null || !axes.every(axis => Math.abs(restored[axis] - bounds[axis] - (axis === "x" ? flow : 0)) <= 2)) return false;
            return !sizeChanged || !fontResize(pending.element) || stableLayout(owner, pending.element, context, key, restored);
        }
        if (!owner.transaction.acknowledged()) return false;
        const measured = G.frameBox(pending.element, target, owner.overlay);
        if (!measured) return false;
        // Undo/Redo can restore scale and offsets together. Their earlier native
        // measurement includes the owner's scale anchor; a plain offset delta
        // cannot predict that origin for centered/bottom-aligned layouts.
        const known = owner.frames.get(pending.element.id)?.geometryHistory?.get(key);
        const scaleField = Q.presentation.resizeField(pending.element);
        const scaleChanged = scaleField && values[scaleField.key] !== currentValues[scaleField.key];
        const offsetChanged = pending.element.fields.some(field => field.axis && values[field.key] !== currentValues[field.key]);
        if (scaleChanged && offsetChanged && !fontResize(pending.element) && known?.target === target && sameContext(known.context, context) && known.context.generation === context.generation) {
            return ["x", "y", "width", "height"].every(axis => Math.abs(measured[axis] - known.bounds[axis]) <= 2);
        }
        if (scaleChanged) {
            const ratio = currentValues[scaleField.key] / values[scaleField.key];
            if (!G.scaleBoundsMatch(measured, bounds, ratio, fontResize(pending.element) ? ["height"] : undefined)) return false;
            if (offsetChanged || fontResize(pending.element)) {
                // A fresh combined edit has no recorded native scale anchor.
                // Center/bottom anchoring changes its origin as well as the
                // offsets. Wait for stable resized layout instead of requiring
                // an impossible position computed from the old unscaled box.
                // Ammo digit widths can also change with the native number of
                // characters; font height acknowledges size, not a width ratio.
                return stableLayout(owner, pending.element, context, key, measured);
            }
        }
        for (const field of pending.element.fields.filter(field => field.axis)) {
            const change = owner.transaction.value(field.key) - values[field.key];
            if (!change) continue;
            const parent = target.GetParent();
            const pixels = change * G.positionUnitPixels(field, parent);
            const expected = bounds[field.axis] + pixels * (field.direction || 1) / G.scale(owner.overlay, field.axis);
            const flow = field.axis === "x" ? flowDelta(owner, pending.element, pending.before) : 0;
            if (flow === null || !Number.isFinite(expected) || Math.abs(measured[field.axis] - expected - flow) > 2) return false;
        }
        return true;
    }
    function showGuides(owner, drag) {
        const bounds = drag.previewBox;
        for (const axis of ["x", "y"]) {
            const panel = axis === "x" ? owner.guideX : owner.guideY;
            const guide = drag.guides?.[axis];
            const visible = !!bounds && !!guide &&
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
        if (!acceptNavigation(owner)) return;
        if (redo) owner.transaction.redo(); else owner.transaction.undo();
        refreshFields(owner);
    }
    function select(owner, element, pin = true) {
        if (current !== owner || owner.drag || owner.applied || !owner.transaction.canEditElement(element.id)) return false;
        if (!acceptNavigation(owner)) return false;
        if (!owner.transaction.selection(element.id)) return false;
        syncShop(owner, element);
        // A new grab of the same surface must keep its live inspector/pickers.
        // Selection metadata is still renewed, but no panel tree is replaced.
        if (owner.selected === element && owner.inspector) {
            owner.selectionPinned = pin;
            refreshFields(owner);
            return true;
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
        }, owner.paletteDock, () => {
            const item = owner.frames.get(element.id), observed = item?.observed;
            if (!observed || observed.target !== item.target || !P.isAlive(item.target) ||
                !sameContext(observed.context, observationContext(owner, element, item.target))) return null;
            const size = Q.presentation.resizeField(element);
            if (size && observed.sizeGeneration !== owner.transaction.geometryGeneration(size.key)) return null;
            return { ...observed, host: owner.overlay, view: G.viewport(owner.overlay) };
        });
        refreshFields(owner);
        return true;
    }
    function finishDrag(owner, cancel = false) {
        if (current !== owner || !owner.drag) return;
        const { proxy, preview } = owner.drag;
        if (owner.dragTimer !== null) $.CancelScheduled(owner.dragTimer);
        owner.dragTimer = null;
        P.delete(proxy);
        P.delete(preview);
        if (P.isAlive(owner.overlay)) owner.overlay.RemoveClass("Dragging");
        if (owner.guideX && P.isAlive(owner.guideX)) owner.guideX.visible = false;
        if (owner.guideY && P.isAlive(owner.guideY)) owner.guideY.visible = false;
        const correction = owner.transaction.endGesture(cancel);
        owner.drag = null;
        owner.fields.enabled = !owner.applied;
        for (const item of owner.frames.values()) item.signature = null;
        refreshFields(owner);
        return correction;
    }
    function updateDrag(owner) {
        try { updateDragState(owner); }
        catch (error) {
            recordError(error);
            finishDrag(owner, true);
            owner.feedback = "Dragging was interrupted. Grab the element again.";
        }
    }
    function updateDragState(owner) {
        if (current !== owner || !owner.drag) return;
        const drag = owner.drag;
        if (!owner.transaction.valid() || !P.isAlive(drag.frame) || resolve(owner, drag.element) !== drag.target ||
            drag.target.GetParent() !== drag.parent || Q.presentation.scaleTarget(drag.element, drag.target) !== drag.scaleTarget || !G.isShown(drag.target) ||
            (drag.element.available && !drag.element.available(owner.hud, { ...Q.getSettingsConfig(), ...owner.transaction.snapshot() }))) {
            finishDrag(owner, true);
            return;
        }
        if (drag.context.panels.length) {
            const panels = measuredPanels(drag.element, drag.target);
            // A late sample may join an intact union. Retired/replaced content
            // cannot continue a gesture captured against the previous panels.
            if (!drag.context.panels.every(panel => panels.includes(panel))) { finishDrag(owner, true); return; }
        }
        // Use the cursor only when available at capture. Otherwise sample the
        // native displayPanel after its compositor has placed it.
        const point = drag.endPoint || (drag.pointer ? G.cursorPoint() : G.windowPoint(drag.proxy)) || (drag.ending ? drag.lastPoint : null);
        if (point) {
            drag.lastPoint = point;
            if (!drag.origin) drag.origin = point;
            const delta = G.windowDelta({ x: point.x - drag.origin.x, y: point.y - drag.origin.y }, owner.overlay, owner.unitProbe);
            if (drag.moved || delta.x !== 0 || delta.y !== 0) {
                drag.moved = true;
                if (!updateDragPreview(owner, drag, delta)) return;
            }
        }
        if (drag.ending) {
            if (drag.values) owner.transaction.edit(drag.values);
            const correction = finishDrag(owner);
            if (drag.resize && drag.values && correction) settleResize(owner, drag, correction);
            return;
        }
        owner.dragTimer = $.Schedule(0.016, () => updateDrag(owner));
    }
    function dragPreviewBounds(owner, drag) {
        const bounds = { ...drag.startBox };
        if (drag.resize) {
            const field = Q.presentation.resizeField(drag.element);
            const ratio = drag.values[field.key] / drag.startValues[field.key];
            bounds.width *= ratio;
            bounds.height *= ratio;
            if (drag.resize.x < 0) bounds.x += drag.startBox.width - bounds.width;
            if (drag.resize.y < 0) bounds.y += drag.startBox.height - bounds.height;
            return bounds;
        }
        // Show normalized/clamped settings, rather than a rectangle
        // beyond a declared offset limit that cannot be dropped there.
        const accepted = {};
        for (const axis of ["x", "y"]) {
            const field = drag.element.fields.find(item => item.axis === axis);
            if (!field) { accepted[axis] = 0; continue; }
            const change = (drag.values[field.key] - drag.startValues[field.key]) * (field.direction || 1);
            accepted[axis] = change * G.positionUnitPixels(field, drag.parent);
        }
        const offset = G.canvasDelta(accepted, owner.overlay);
        bounds.x += offset.x;
        bounds.y += offset.y;
        return bounds;
    }
    function updateDragPreview(owner, drag, delta) {
        if (!drag.resize) {
            const neighbors = [];
            if (owner.snapEnabled) for (const [id, item] of owner.frames) {
                const family = drag.element.parentId;
                if (id !== drag.element.id && item.available && item.target !== drag.target && item.measured &&
                    id !== family && (!family || item.element.parentId !== family) && item.element.parentId !== drag.element.id) neighbors.push(item.measured);
            }
            const snapped = owner.snapEnabled ? G.snap(drag.startBox, delta, G.viewport(owner.overlay), neighbors,
                drag.element.fields.filter(field => field.axis).map(field => field.axis)) : { delta, guides: {} };
            delta = snapped.delta;
            drag.guides = snapped.guides;
        }
        const pixels = G.screenDelta(delta, owner.overlay);
        const previousValues = drag.values;
        drag.values = drag.resize ? G.resizeValues(drag.element, drag.startValues, drag.resizeBox, pixels, owner.overlay, drag.resize)
            : G.dragValues(drag.element, drag.target, drag.startValues, pixels);
        if (!drag.resize && drag.element.fields.some(field => field.axis && drag.values[field.key] === undefined)) {
            finishDrag(owner, true);
            return false;
        }
        if (drag.resize && previousValues && owner.transaction.acknowledged()) {
            const field = Q.presentation.resizeField(drag.element);
            const measured = G.frameBox(drag.element, drag.target, owner.overlay);
            if (G.scaleBoundsMatch(measured, drag.startBox, previousValues[field.key] / drag.startValues[field.key],
                fontResize(drag.element) ? ["height"] : undefined)) {
                const values = {};
                for (const item of drag.element.fields) values[item.key] = owner.transaction.value(item.key);
                Object.assign(drag.values, G.anchorValues(drag.element, drag.target, drag.startBox, measured, values, owner.overlay, drag.resize));
            }
        }
        const bounds = dragPreviewBounds(owner, drag);
        drag.previewBox = bounds;
        // The transaction groups every live update into one Undo entry.
        // Input bounds stay fixed; visual children follow live intent.
        const signature = JSON.stringify(drag.values);
        if (signature !== drag.editSignature) {
            if (!owner.transaction.edit(drag.values)) { finishDrag(owner, true); return false; }
            drag.editSignature = signature;
            owner.inspector?.sync();
        }
        syncFrame(owner, owner.frames.get(drag.element.id), bounds);
        drag.previewSignature = P.syncStyles(drag.preview, {
            x: `${Math.round(bounds.x)}px`, y: `${Math.round(bounds.y)}px`,
            width: `${Math.round(bounds.width)}px`, height: `${Math.round(bounds.height)}px`
        }, drag.previewSignature).sig;
        showGuides(owner, drag);
        return true;
    }
    function settleResize(owner, drag, correction) {
        const deadline = Date.now() + 2500;
        let signature = null;
        const field = Q.presentation.resizeField(drag.element);
        const ratio = drag.values[field.key] / drag.startValues[field.key];
        const update = () => {
            owner.settleTimer = null;
            if (current !== owner || !correction.valid() || owner.drag || resolve(owner, drag.element) !== drag.target ||
                drag.target.GetParent() !== drag.parent || Q.presentation.scaleTarget(drag.element, drag.target) !== drag.scaleTarget ||
                !sameContext(drag.context, observationContext(owner, drag.element, drag.target)) ||
                !G.isShown(drag.target) || Date.now() >= deadline) return;
            const measured = G.frameBox(drag.element, drag.target, owner.overlay);
            const next = owner.transaction.acknowledged() && G.scaleBoundsMatch(measured, drag.startBox, ratio,
                fontResize(drag.element) ? ["height"] : undefined) ? JSON.stringify(measured) : null;
            if (next && next === signature) {
                const values = {};
                for (const item of drag.element.fields) values[item.key] = owner.transaction.value(item.key);
                correction.edit(G.anchorValues(drag.element, drag.target, drag.startBox, measured, values, owner.overlay, drag.resize));
                refreshFields(owner);
                return;
            }
            signature = next;
            owner.settleTimer = $.Schedule(0.016, update);
        };
        if (owner.settleTimer !== null) $.CancelScheduled(owner.settleTimer);
        update();
    }
    function bindDrag(owner, element, frame, resize = false) {
        frame.SetPanelEvent("onactivate", () => {
            if (current === owner && pointerTarget(owner, element) && !owner.drag && !owner.applied && !owner.justDropped) select(owner, element);
        });
        $.RegisterEventHandler("DragStart", frame, (_panel, event) => {
            if (current !== owner || owner.applied || owner.drag || owner.chrome?.isDragging() || !frame.visible || !pointerTarget(owner, element)) return false;
            if (owner.transaction.isLocked(element.id)) return false;
            const origin = G.cursorPoint();
            const target = resolve(owner, element);
            const config = Object.assign({}, Q.getSettingsConfig(), owner.transaction.snapshot());
            if (!P.isAlive(target) || !G.isShown(target) || (element.available && !element.available(owner.hud, config)) ||
                !(resize ? Q.presentation.resizeField(element) : Q.presentation.canDrag(element))) return false;
            if (!resize && element.fields.some(field => field.axis && field.unit === "%" &&
                !(Number(target.GetParent()?.[field.axis === "x" ? "actuallayoutwidth" : "actuallayoutheight"]) > 0))) return false;
            if (!select(owner, element)) return false;
            const startBox = G.frameBox(element, target, owner.overlay);
            if (!startBox) return false;
            const proxy = P.create("Panel", owner.overlay, "QOLCustomizeDragProxy");
            if (!P.isAlive(proxy)) return false;
            proxy.AddClass("QOLCustomizeDragProxy");
            // Keep dimensions after the compositor takes it out of the editor's
            // stylesheet ancestry; the proxy is never a visible resize handle.
            proxy.style.width = "16px";
            proxy.style.height = "16px";
            proxy.style.align = "left top";
            proxy.hittest = false;
            proxy.hittestchildren = false;
            if (!owner.transaction.beginGesture()) { P.delete(proxy); return false; }
            const preview = P.create("Panel", owner.overlay, "QOLCustomizeGestureOutline");
            if (!P.isAlive(preview)) { P.delete(proxy); owner.transaction.endGesture(true); return false; }
            preview.AddClass("QOLCustomizeGestureOutline");
            preview.hittest = false;
            preview.hittestchildren = false;
            P.syncStyles(preview, { x: `${Math.round(startBox.x)}px`, y: `${Math.round(startBox.y)}px`,
                width: `${Math.round(startBox.width)}px`, height: `${Math.round(startBox.height)}px` });
            if (owner.settleTimer !== null) $.CancelScheduled(owner.settleTimer);
            owner.settleTimer = null;
            const startValues = {};
            for (const field of element.fields) startValues[field.key] = owner.transaction.value(field.key);
            owner.drag = { frame, proxy, preview, target, element, context: observationContext(owner, element, target), origin, pointer: !!origin, startValues, startBox,
                inputBox: { ...owner.frames.get(element.id).inputBounds },
                resizeBox: { ...owner.frames.get(element.id).inputBounds }, resize, parent: target.GetParent(), scaleTarget: Q.presentation.scaleTarget(element, target) };
            event.displayPanel = proxy;
            event.removePositionBeforeDrop = false;
            $.DispatchEvent("UIHideTextTooltip", frame);
            if (P.isAlive(owner.overlay)) owner.overlay.AddClass("Dragging");
            owner.dragTimer = $.Schedule(0, () => updateDrag(owner));
            owner.fields.enabled = false;
            refreshHistory(owner);
            return true;
        });
        $.RegisterEventHandler("DragEnd", frame, () => {
            if (current !== owner || owner.drag?.frame !== frame) return;
            const drag = owner.drag;
            // Some native controls deliver activation on the same release.
            // It must not select another overlapping surface after a drop.
            owner.justDropped = true;
            if (owner.activationTimer !== null) $.CancelScheduled(owner.activationTimer);
            owner.activationTimer = $.Schedule(0, () => { owner.activationTimer = null; owner.justDropped = false; });
            // Native teardown may release the visual before this callback.
            drag.endPoint = (drag.pointer ? G.cursorPoint() : G.windowPoint(drag.proxy)) || drag.lastPoint || drag.origin;
            drag.ending = true;
            updateDrag(owner);
        });
    }
    function syncFrame(owner, item, measured) {
        const held = owner.drag?.element.id === item.id;
        const desired = G.inputBox(measured, G.viewport(owner.overlay), Array.from(owner.frames.values())
            .filter(other => other.id !== item.id && other.available && other.measured).map(other => other.measured));
        const bounds = held ? owner.drag.inputBox : desired;
        if (!held) {
            item.inputBounds = bounds;
            const styles = { x: `${Math.round(bounds.x)}px`, y: `${Math.round(bounds.y)}px`,
                width: `${Math.round(bounds.width)}px`, height: `${Math.round(bounds.height)}px` };
            item.signature = P.syncStyles(item.frame, { ...styles,
                zIndex: String(item.priority || (bounds.width * bounds.height < 30000 ? 3 : 1))
            }, item.signature).sig;
            if (item.cornerHost) item.cornerSignature = P.syncStyles(item.cornerHost, styles, item.cornerSignature).sig;
        }
        P.setClass(item.frame, "Capturing", held);
        const corners = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
        for (let i = 0; i < item.handles.length; i++) {
            const handle = item.handles[i], marker = handle.GetChild(0), [x, y] = corners[i];
            // Leave a central move target even when neighbor padding is trimmed.
            const width = `${Math.max(1, Math.min(24, Math.floor((bounds.width - 16) / 2)))}px`;
            const height = `${Math.max(1, Math.min(24, Math.floor((bounds.height - 16) / 2)))}px`;
            for (const panel of [handle, marker]) {
                QOL_UTILS.SetStyleIfChanged(panel, "width", width);
                QOL_UTILS.SetStyleIfChanged(panel, "height", height);
            }
            const dx = desired.x - bounds.x + (x > 0 ? desired.width - bounds.width : 0);
            const dy = desired.y - bounds.y + (y > 0 ? desired.height - bounds.height : 0);
            QOL_UTILS.SetStyleIfChanged(marker, "x", `${Math.round(dx)}px`);
            QOL_UTILS.SetStyleIfChanged(marker, "y", `${Math.round(dy)}px`);
        }
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
        const view = G.viewport(owner.overlay);
        if (owner.paletteWindow) {
            const visible = !owner.panelsHidden && owner.paletteDock.visible;
            if (owner.paletteWindow.visible !== visible) owner.paletteWindow.visible = visible;
        }
        if (view && owner.fields) {
            const density = G.scale(owner.overlay, "y");
            const chromeHeight = (Number(owner.tools.actuallayoutheight) - Number(owner.fields.actuallayoutheight)) / density;
            // The inspector fits its content until the viewport requires a
            // scroll region. Reserve history/actions while native measurement
            // is unavailable; update when its real chrome has layout.
            const reserve = Number.isFinite(chromeHeight) && chromeHeight > 0 ? chromeHeight : 220;
            const height = Math.max(32, Math.floor(Math.min(600, view.height * 0.88 - reserve)));
            QOL_UTILS.SetStyleIfChanged(owner.fields, "maxHeight", height + "px");
        }
        const draft = owner.transaction.snapshot();
        const config = Object.assign({}, Q.getSettingsConfig(), draft);
        for (const element of owner.elements) {
            const item = owner.frames.get(element.id);
            const target = owner.hud ? resolve(owner, element, config) : null;
            const shown = target && (!element.available || element.available(owner.hud, config)) && G.isShown(target);
            const held = owner.drag?.element.id === element.id && owner.drag.target === target &&
                target.GetParent() === owner.drag.parent && Q.presentation.scaleTarget(element, target) === owner.drag.scaleTarget;
            // Live preview can invalidate native layout for a frame. Its absence
            // is not visibility/lifetime evidence and must not collapse the
            // native Button that owns capture. Use only this gesture's saved box.
            const measured = shown ? G.frameBox(element, target, owner.overlay) || (held ? owner.drag.startBox : null) : null;
            // Settings-only entries can share a native owner (warnings, ranks,
            // quickbuy), but must not place another input surface over it.
            const box = Q.presentation.hasFrame(element) && measured ? G.hitBox(measured, G.viewport(owner.overlay)) : null;
            const visible = !!box;
            item.available = !!measured;
            item.target = target;
            item.measured = measured;
            const context = target && observationContext(owner, element, target);
            const changedContext = item.observed?.target === target && !sameContext(item.observed.context, context);
            let contextReady = !changedContext;
            if (changedContext && measured && !owner.drag && owner.transaction.acknowledged()) {
                // Rebase a changed native context only when it is not masking
                // an accepted offset/scale still awaiting its native layout.
                if (alignmentReady(owner, { element, before: item.observed })) {
                    const signature = JSON.stringify(measured);
                    contextReady = sameContext(item.contextCandidate?.context, context) && item.contextCandidate.signature === signature;
                    item.contextCandidate = { context, signature };
                }
            }
            if (measured && !owner.drag && ((!Object.keys(draft).length && !geometryGeneration(owner, element)) || owner.transaction.acknowledged()) && contextReady &&
                (changedContext || !item.observed || item.observed.target !== target || alignmentReady(owner, { element, before: item.observed }))) {
                observe(owner, element, target, measured);
            } else if (!measured) { item.observed = null; item.geometryHistory = null; item.contextCandidate = null; item.layoutCandidate = null; }
            if (item.frame.visible !== visible) item.frame.visible = visible;
            const interactive = pointerTarget(owner, element);
            if (item.frame.hittest !== interactive) item.frame.hittest = interactive;
            const unavailable = !measured && !element.context && !!element.path;
            const caption = localize(element.name);
            if (item.caption.text !== caption) item.caption.text = caption;
            P.setClass(item.button, "Unavailable", unavailable);
            if (owner.selected === element && owner.inspector) {
                const text = unavailable ? localize("Unavailable now") : "";
                if (owner.inspector.availability.text !== text) owner.inspector.availability.text = text;
                if (owner.inspector.availability.visible !== unavailable) owner.inspector.availability.visible = unavailable;
            }
            const canResize = !!box && owner.selected === element && !owner.applied && !owner.transaction.isLocked(element.id);
            if (item.cornerHost && item.cornerHost.visible !== canResize) item.cornerHost.visible = canResize;
            for (const handle of item.handles) {
                if (handle.visible !== canResize) handle.visible = canResize;
            }
        }
        for (const item of owner.frames.values()) if (item.available) {
            syncFrame(owner, item, owner.drag?.element.id === item.id && owner.drag.previewBox || item.measured);
        }
        refreshCatalog(owner);
        owner.inspector?.refreshRanges();
    }
    function refreshCatalog(owner) {
        let count = 0;
        for (const element of owner.elements) {
            const item = owner.frames.get(element.id);
            const matches = !owner.query || [element.name, element.group || "HUD", ...element.fields.map(field => field.label)]
                .some(text => (text + " " + localize(text)).toLowerCase().includes(owner.query));
            const visible = matches && (owner.showAll || item.available || (owner.selectionPinned && owner.selected === element));
            if (item.button.visible !== visible) item.button.visible = visible;
            if (visible) count++;
        }
        for (const { heading, ids } of owner.headings) {
            const visible = !owner.query && ids.some(id => owner.frames.get(id).button.visible);
            if (heading.visible !== visible) heading.visible = visible;
        }
        if (owner.empty.visible !== !count) owner.empty.visible = !count;
    }
    function watch(owner) {
        if (current !== owner) return;
        if (!P.isAlive(owner.overlay) || (owner.hud && !P.isAlive(owner.hud)) || !P.isAlive(owner.window) || !owner.window.BHasClass("Visible") ||
            (!owner.applied && !owner.transaction.valid())) { stop(); return; }
        try {
            if (!owner.applied && !owner.transaction.publish()) { stop(); return; }
            if (owner.shopOpened && owner.hud?.BHasClass("gShopOpen")) owner.shopObservedOpen = true;
            refreshHistory(owner);
            refreshFrames(owner);
            owner.chrome.refresh();
            const status = localize(owner.feedback || (!owner.hud ? "Edit settings here; live HUD frames appear in a match or sandbox." :
                !owner.frames.get(owner.selected?.id)?.available ? "This element is not visible in the current HUD." :
                owner.transaction.acknowledged() ? "HUD settings updated" : "Updating HUD..."));
            if (owner.status.text !== status) owner.status.text = status;
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
        if (current || Q.ui.visualCheck?.isRunning() || Q.ui.presetPreview?.isRunning()) return false;
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
        const owner = { root, context, hud, window, overlay, transaction: Q.ui.customizeSession.create(root, hud, window, element),
            elements: element ? Q.ui.customizeSession.scopedElements(element) : Q.presentation.elements.filter(item => Q.presentation.hasFrame(item) && item.fields.length && !item.context),
            hidden: [], active: [], frames: new Map(), headings: [], query: "", showAll: !hud, selectionPinned: false,
            timer: null, dragTimer: null, settleTimer: null, activationTimer: null, drag: null, inspector: null, onStop, applied: false, saving: false, snapEnabled: true };
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
            owner.unitProbe = P.create("Panel", overlay, "QOLCustomizeUnitProbe");
            if (!P.isAlive(owner.unitProbe)) throw new Error("Unable to create Customize coordinate probe");
            P.syncStyles(owner.unitProbe, { align: "left top", x: "100px", y: "100px", width: "1px", height: "1px" });
            owner.unitProbe.hittest = false;
            owner.unitProbe.hittestchildren = false;
            owner.chrome = Q.ui.customizeChrome.create(overlay, () => current === owner && !owner.drag, owner.unitProbe);
            const view = P.create("Panel", overlay, "QOLCustomizeView");
            owner.view = view;
            view.AddClass("QOLCustomizeView");
            view.AddClass("QOLUnifiedModalSurface");
            const topBar = Q.presentation.elements.find(item => item.id === "topBar");
            owner.chrome.header(view, "QOLCustomizeDragView", "Customize", (bounds, viewport) => {
                const frame = owner.frames.get("topBar");
                const target = !frame && owner.hud && topBar ? resolve(owner, topBar) : null;
                const content = frame?.measured || (target && G.isShown(target) ? G.frameBox(topBar, target, overlay) : null);
                if (!content) return null;
                const y = content.y + content.height + 15;
                return y + bounds.height <= viewport.height ? { x: (viewport.width - bounds.width) / 2, y } : null;
            });
            const viewActions = P.create("Panel", view, "");
            viewActions.AddClass("QOLCustomizeActions");
            const panels = I.button(viewActions, "QOLCustomizeTogglePanels", "Hide panels", () => {
                if (current !== owner) return;
                owner.panelsHidden = !owner.panelsHidden;
                overlay.SetHasClass("PanelsHidden", owner.panelsHidden);
                owner.tools.visible = !owner.panelsHidden;
                owner.catalog.visible = (!element || owner.elements.length > 1) && !owner.panelsHidden;
                panels.GetChild(0).text = localize(owner.panelsHidden ? "Show panels" : "Hide panels");
                refreshFrames(owner);
            });
            const frames = I.button(viewActions, "QOLCustomizeToggleFrames", "Show frames", () => {
                if (current !== owner) return;
                owner.showFrames = !owner.showFrames;
                overlay.SetHasClass("ShowFrames", owner.showFrames);
                frames.GetChild(0).text = localize(owner.showFrames ? "Hide frames" : "Show frames");
                refreshFrames(owner);
            });
            const snap = I.button(viewActions, "QOLCustomizeToggleSnap", "Snapping", () => {
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
            catalog.visible = !element || owner.elements.length > 1;
            owner.chrome.header(catalog, "QOLCustomizeDragCatalog", "HUD Elements");
            const searchWrap = P.create("Panel", catalog, "QOLCustomizeSearchWrap");
            searchWrap.AddClass("QOLCustomizeSearchWrap");
            const search = P.create("TextEntry", searchWrap, "QOLCustomizeSearch", { placeholder: localize("Search elements") });
            search.AddClass("QOLCustomizeSearch");
            const searchIcon = P.create("Image", searchWrap, "", {
                src: "s2r://panorama/images/control_icons/24px/search.vsvg", scaling: "contain"
            });
            searchIcon.AddClass("QOLCustomizeSearchIcon");
            searchIcon.hittest = false;
            searchIcon.hittestchildren = false;
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
                frame.hittestchildren = false;
                const outline = P.create("Panel", frame, "");
                outline.AddClass("QOLCustomizeOutline");
                outline.hittest = false;
                outline.hittestchildren = false;
                bindDrag(owner, element, frame);
                frame.SetPanelEvent("onmouseover", () => {
                    if (current !== owner || owner.drag) return;
                    owner.frames.get(element.id).hovered = true;
                    $.DispatchEvent("UIShowTextTooltip", frame, localize(element.name));
                    refreshFrames(owner);
                });
                frame.SetPanelEvent("onmouseout", () => {
                    $.DispatchEvent("UIHideTextTooltip", frame);
                    if (current !== owner) return;
                    owner.frames.get(element.id).hovered = false;
                    refreshFrames(owner);
                });
                const handles = [];
                let cornerHost = null;
                if (Q.presentation.resizeField(element)) {
                    // Selected corners have their own sibling layer. Elevating
                    // the whole frame would hide smaller overlapping selections.
                    cornerHost = P.create("Panel", overlay, "QOLCustomizeCorners_" + element.id);
                    cornerHost.AddClass("QOLCustomizeCorners");
                    cornerHost.hittest = false;
                    cornerHost.hittestchildren = true;
                    cornerHost.visible = false;
                    for (const [name, x, y] of [["", 1, 1], ["TopLeft", -1, -1], ["TopRight", 1, -1], ["BottomLeft", -1, 1]]) {
                        const handle = P.create("Button", cornerHost, "QOLCustomizeResize_" + element.id + name, { draggable: "true" });
                        handle.hittest = true;
                        handle.hittestchildren = false;
                        handle.AddClass("QOLCustomizeResize");
                        if (name) handle.AddClass(name);
                        handle.visible = false;
                        const marker = P.create("Panel", handle, "");
                        marker.AddClass("QOLCustomizeResizeMarker");
                        if (name) marker.AddClass(name);
                        marker.hittest = false; marker.hittestchildren = false;
                        bindDrag(owner, element, handle, { x, y });
                        handle.SetPanelEvent("onmouseover", () => { if (!owner.drag) $.DispatchEvent("UIShowTextTooltip", handle, localize("Drag this corner to resize.")); });
                        handle.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", handle));
                        handles.push(handle);
                    }
                }
                const button = I.button(choices, "QOLCustomizeSelect_" + element.id, element.name, () => select(owner, element));
                owner.frames.set(element.id, { id: element.id, element, priority: element.framePriority, frame, cornerHost, outline, handles, button, caption: button.GetChild(0), signature: null });
            }
            search.SetPanelEvent("ontextentrychange", () => {
                if (current !== owner) return;
                owner.query = String(search.text || "").trim().toLowerCase();
                refreshCatalog(owner);
            });
            owner.empty = I.label(choices, "No visible elements");
            owner.fields = P.create("Panel", tools, "QOLCustomizeFields");
            const paletteWindow = P.create("Panel", overlay, "QOLCustomizePaletteWindow");
            owner.paletteWindow = paletteWindow;
            paletteWindow.AddClass("QOLCustomizePaletteWindow");
            paletteWindow.AddClass("QOLUnifiedModalSurface");
            paletteWindow.hittest = true;
            paletteWindow.visible = false;
            owner.chrome.header(paletteWindow, "QOLCustomizeDragPalette", "Color palette", bounds => {
                const properties = G.box(tools, overlay);
                return properties ? { x: properties.x - bounds.width - 12, y: properties.y } : null;
            });
            owner.paletteDock = P.create("Panel", paletteWindow, "QOLCustomizePaletteDock");
            owner.paletteDock.AddClass("QOLCustomizePaletteDock");
            owner.paletteDock.visible = false;
            const resetRow = P.create("Panel", tools, "QOLCustomizeResetRow");
            resetRow.AddClass("QOLCustomizeResetRow");
            const history = P.create("Panel", tools, "QOLCustomizeHistory");
            history.AddClass("QOLCustomizeHistory");
            owner.undo = I.button(history, "QOLCustomizeUndo", "Undo", () => historyAction(owner, false));
            owner.redo = I.button(history, "QOLCustomizeRedo", "Redo", () => historyAction(owner, true));
            owner.reset = I.button(resetRow, "QOLCustomizeReset", "Reset", () => {
                if (current !== owner || owner.applied || owner.drag || !owner.selected) return;
                owner.transaction.reset(owner.selected);
                // Reset also retires unfinished input when the accepted draft
                // already matches defaults and needs no history entry.
                refreshFields(owner);
            });
            for (const button of [owner.undo, owner.redo]) button.AddClass("QOLCustomizeQuiet");
            owner.reset.AddClass("QOLCustomizeReset");
            for (const [button, text] of [[owner.undo, "Undo the last change."], [owner.redo, "Restore the change canceled by Undo."],
                [owner.reset, "Reset the selected element to defaults."]]) {
                button.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", button, localize(text)));
                button.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", button));
            }
            const actions = P.create("Panel", tools, "QOLCustomizeFooter");
            actions.AddClass("QOLCustomizeFooter");
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
                    owner.paletteDock.enabled = false;
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
