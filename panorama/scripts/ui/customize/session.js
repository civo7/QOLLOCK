// Settings-only transaction. Drafts never mutate MOD_CONFIG until Apply.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    let nextToken = 0;

    function resolveHud(root) {
        const named = root?.id === "Hud" ? root : P.findTraverse(root, "Hud");
        if (P.isAlive(named)) return named;
        const candidate = Q.core.persistence.resolveHudPanel(root);
        // Persistence also accepts a generic UI root. It is a publication host,
        // not evidence that gameplay scripts or native HUD owners exist there.
        return P.isAlive(candidate) && candidate.paneltype === "CitadelHud" ? candidate : null;
    }

    function create(root, hud, window) {
        globalThis.FlushPendingSave();
        const baseline = Object.assign({}, Q.getSettingsConfig());
        const fingerprint = JSON.stringify(baseline);
        const stamp = Q.core.persistence.getConfigChangeStamp(root);
        const token = `${Date.now()}:${++nextToken}`;
        let draft = {};
        let effectiveDraft = null;
        let gesture = null;
        let closed = false;
        const past = [];
        const future = [];
        const locks = new Set();
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const valid = () => !closed && P.isAlive(root) && (!hud || P.isAlive(hud)) && P.isAlive(window) && window.BHasClass("Visible") &&
            resolveHud(root) === hud &&
            Q.core.persistence.getConfigChangeStamp(root) === stamp &&
            JSON.stringify(Q.getSettingsConfig()) === fingerprint;
        const publish = () => valid() && (!hud || Q.presentation.preview.write(hud, draft, token, stamp));
        function remember(before) {
            if (same(before, draft)) return;
            past.push(before);
            if (past.length > 50) past.shift();
            future.length = 0;
        }
        function edit(values) {
            if (!valid()) return false;
            const patch = {};
            for (const [key, value] of Object.entries(values)) {
                const normalized = Q.presentation.normalize(key, value);
                if (normalized === null) return false;
                patch[key] = normalized;
            }
            // The panel scale is a legacy alias for current ammo text scale.
            // Update its canonical owner so preview and normal save agree.
            if (Object.prototype.hasOwnProperty.call(patch, "AMMO_PANEL_SCALE")) patch.AMMO_CURRENT_SCALE = patch.AMMO_PANEL_SCALE;
            const before = draft;
            draft = Object.assign({}, draft, patch);
            for (const key of Object.keys(draft)) if (draft[key] === baseline[key]) delete draft[key];
            effectiveDraft = null;
            if (!gesture) remember(before);
            return publish();
        }
        function beginGesture() {
            if (!valid() || gesture) return false;
            gesture = Object.assign({}, draft);
            return true;
        }
        function endGesture(cancel = false) {
            if (!gesture) return;
            const before = gesture;
            gesture = null;
            if (cancel) { draft = before; effectiveDraft = null; publish(); }
            else remember(before);
        }
        function undo() {
            if (!valid() || gesture || !past.length) return false;
            future.push(draft);
            draft = past.pop();
            effectiveDraft = null;
            return publish();
        }
        function redo() {
            if (!valid() || gesture || !future.length) return false;
            past.push(draft);
            draft = future.pop();
            effectiveDraft = null;
            return publish();
        }
        function reset(element) {
            const values = {};
            for (const field of element.fields) values[field.key] = QOL_DEFAULT_CONFIG[field.key];
            return edit(values);
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
            valid, publish, edit, beginGesture, endGesture, undo, redo, reset, close, apply,
            value: key => (effectiveDraft || (effectiveDraft = Q.mergeConfig(Object.assign({}, baseline, draft))))[key],
            snapshot: () => Object.assign({}, draft),
            canUndo: () => !gesture && !!past.length, canRedo: () => !gesture && !!future.length,
            setLocked: (id, locked) => locked ? locks.add(id) : locks.delete(id), isLocked: id => locks.has(id),
            acknowledged: () => Q.presentation.preview.ack(hud) === token
        };
    }
    Q.ui.customizeSession = { create, resolveHud };
})();
