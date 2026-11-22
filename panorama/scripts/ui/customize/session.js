// Settings-only transaction. Drafts never mutate MOD_CONFIG until Apply.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    let nextToken = 0;
    const scopedElements = element => {
        if (element.id === "shop") return Q.presentation.elements.filter(item => item.requiresShop);
        return ["ammo", "playerStats"].includes(element.id)
            ? [element, ...Q.presentation.elements.filter(item => item.parentId === element.id)] : [element];
    };

    function resolveHud(root) {
        const named = root?.id === "Hud" ? root : P.findTraverse(root, "Hud");
        if (P.isAlive(named)) return named;
        const candidate = Q.core.persistence.resolveHudPanel(root);
        // Persistence also accepts a generic UI root. It is a publication host,
        // not evidence that gameplay scripts or native HUD owners exist there.
        return P.isAlive(candidate) && candidate.paneltype === "CitadelHud" ? candidate : null;
    }

    function create(root, hud, window, element = null) {
        globalThis.FlushPendingSave();
        const baseline = Object.assign({}, Q.getSettingsConfig());
        const fingerprint = JSON.stringify(baseline);
        const stamp = Q.core.persistence.getConfigChangeStamp(root);
        const token = `${Date.now()}:${++nextToken}`;
        let draft = {};
        let effectiveDraft = null;
        let gesture = null;
        let gestureGeneration = 0;
        let sample = "";
        let closed = false;
        const past = [];
        const future = [];
        const locks = new Set();
        let editGroup = null;
        const editableElements = element ? scopedElements(element) : Q.presentation.elements;
        const allowedElements = new Set(editableElements.map(item => item.id));
        const allowedKeys = new Set();
        const geometryKeys = new Set();
        const geometryGenerations = new Map();
        let geometryGeneration = 0;
        for (const item of editableElements) for (const field of item.fields) {
            allowedKeys.add(field.key);
            if (field.axis || field.resize) geometryKeys.add(field.key);
        }
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const valid = () => !closed && P.isAlive(root) && (!hud || P.isAlive(hud)) && P.isAlive(window) && window.BHasClass("Visible") &&
            resolveHud(root) === hud &&
            Q.core.persistence.getConfigChangeStamp(root) === stamp &&
            JSON.stringify(Q.getSettingsConfig()) === fingerprint;
        const publish = () => valid() && (!hud || Q.presentation.preview.write(hud, draft, token, stamp, sample, !!gesture));
        function selection(id) {
            if (!valid() || !allowedElements.has(id)) return false;
            sample = id;
            return publish();
        }
        function noteGeometry(before) {
            for (const key of geometryKeys) {
                if ((before[key] ?? baseline[key]) !== (draft[key] ?? baseline[key])) geometryGenerations.set(key, ++geometryGeneration);
            }
        }
        function remember(before) {
            if (same(before, draft)) return;
            past.push(before);
            if (past.length > 50) past.shift();
            future.length = 0;
        }
        function edit(values, group = null, activate = true) {
            if (!valid()) return false;
            const patch = {};
            for (const [key, value] of Object.entries(values)) {
                if (!allowedKeys.has(key)) return false;
                const normalized = Q.presentation.normalize(key, value);
                if (normalized === null) return false;
                patch[key] = normalized;
            }
            // The panel scale is a legacy alias for current ammo text scale.
            // Update its canonical owner so preview and normal save agree.
            if (Object.prototype.hasOwnProperty.call(patch, "AMMO_PANEL_SCALE")) patch.AMMO_CURRENT_SCALE = patch.AMMO_PANEL_SCALE;
            // Old disabled stats configs can contain dormant placement. Keep
            // that compatibility gate until an explicit position edit;
            // editing the surface then needs no separate manual mode switch.
            if (activate && allowedKeys.has("ENABLE_STATS_POSITION") &&
                ["STATS_POSITION_X_OFFSET", "STATS_POSITION_Y_OFFSET"]
                    .some(key => Object.prototype.hasOwnProperty.call(patch, key))) patch.ENABLE_STATS_POSITION = 1;
            const before = draft;
            draft = Object.assign({}, draft, patch);
            for (const key of Object.keys(draft)) if (draft[key] === baseline[key]) delete draft[key];
            effectiveDraft = null;
            noteGeometry(before);
            if (!gesture) {
                const now = Date.now();
                // Native color-field movement emits many RGB updates. Keep a
                // short burst as one edit without holding a canvas gesture open.
                const continued = group && editGroup?.id === group && now - editGroup.time < 300;
                if (!continued) remember(before);
                if (!same(before, draft)) editGroup = group ? { id: group, time: now } : null;
            }
            return publish();
        }
        function beginGesture() {
            if (!valid() || gesture) return false;
            gesture = Object.assign({}, draft);
            gestureGeneration++;
            editGroup = null;
            publish();
            return true;
        }
        function endGesture(cancel = false) {
            if (!gesture) return;
            const before = gesture;
            gesture = null;
            if (cancel) {
                const previous = draft;
                draft = before;
                effectiveDraft = null;
                noteGeometry(previous);
                publish();
            }
            else {
                remember(before);
                publish();
                if (same(before, draft)) return null;
                const accepted = draft;
                const generation = gestureGeneration;
                let used = false;
                const validCorrection = () => !used && valid() && !gesture && gestureGeneration === generation &&
                    draft === accepted && past[past.length - 1] === before;
                // A late native resize measurement may correct its anchor in
                // the same undo entry. Any intervening edit/history/gesture
                // invalidates this one-shot capability; it cannot overwrite
                // newer intent or keep editor navigation locked while waiting.
                return { valid: validCorrection, edit(values) {
                    if (!validCorrection()) return false;
                    used = true;
                    gesture = Object.assign({}, draft);
                    try { return edit(values); }
                    finally { gesture = null; }
                } };
            }
        }
        function undo() {
            if (!valid() || gesture || !past.length) return false;
            editGroup = null;
            const before = draft;
            future.push(draft);
            draft = past.pop();
            effectiveDraft = null;
            noteGeometry(before);
            return publish();
        }
        function redo() {
            if (!valid() || gesture || !future.length) return false;
            editGroup = null;
            const before = draft;
            past.push(draft);
            draft = future.pop();
            effectiveDraft = null;
            noteGeometry(before);
            return publish();
        }
        function reset(element) {
            if (!allowedElements.has(element.id)) return false;
            const values = {};
            const config = Q.mergeConfig(Object.assign({}, baseline, draft));
            // Reset presentation without changing enable/hide switches or
            // content modes/filters. Ammo includes independent digit geometry.
            const fields = [...element.fields.filter(field => !field.hidden),
                ...scopedElements(element).slice(1).flatMap(item => item.fields)].filter(field => field.type !== "toggle" && field.reset !== false);
            for (const field of fields) if (!field.when || field.when({ value: key => config[key] })) values[field.key] = QOL_DEFAULT_CONFIG[field.key];
            return edit(values, null, false);
        }
        function close() {
            if (closed) return;
            closed = true;
            Q.presentation.preview.clear(hud, token);
        }
        function apply() {
            if (!valid() || gesture) return false;
            Object.assign(Q.getSettingsConfig(), draft);
            // Follow the existing dirty/save path. Publication is not a disk ACK.
            globalThis.MarkConfigDirty();
            globalThis.FlushPendingSave();
            close();
            return true;
        }
        return {
            valid, publish, selection, edit, beginGesture, endGesture, undo, redo, reset, close, apply,
            value: key => (effectiveDraft || (effectiveDraft = Q.mergeConfig(Object.assign({}, baseline, draft))))[key],
            snapshot: () => Object.assign({}, draft),
            geometryGeneration: key => geometryGenerations.get(key) || 0,
            canUndo: () => !gesture && !!past.length, canRedo: () => !gesture && !!future.length,
            canEditElement: id => allowedElements.has(id),
            setLocked: (id, locked) => {
                if (allowedElements.has(id)) { if (locked) locks.add(id); else locks.delete(id); }
            },
            isLocked: id => !allowedElements.has(id) || locks.has(id),
            acknowledged: () => Q.presentation.preview.ack(hud) === token && Q.presentation.preview.settled(hud)
        };
    }
    Q.ui.customizeSession = { create, resolveHud, scopedElements };
})();
