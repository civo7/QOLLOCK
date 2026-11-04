// Transient settings-to-HUD presentation layer. Never writes storage attributes
// or State.lastConfig. The app's existing config poll is its only HUD consumer.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const payloadAttr = "QOL_CUSTOMIZE_DRAFT";
    const leaseAttr = "QOL_CUSTOMIZE_LEASE";
    const ackAttr = "QOL_CUSTOMIZE_ACK";
    const ackPayloadAttr = "QOL_CUSTOMIZE_ACK_PAYLOAD";
    let appliedPayload = "";
    let appliedHud = null;
    let activeConfig = null;
    let activeSample = null;
    let pendingLayer = null;
    const visibilityOwner = P.createNativeStyleOwner();
    function syncVisibility(hud, visible) {
        const panels = visible && P.isAlive(hud) ? [hud] : [];
        visibilityOwner.retain(panels);
        if (panels.length) visibilityOwner.apply(hud, {}, { QOLCustomizeLiveHud: true });
    }

    function write(hud, draft, token, stamp, sample = "", gesture = false, kind = "") {
        if (!P.isAlive(hud)) return false;
        const raw = JSON.stringify({ token, stamp, values: draft, ...(sample ? { sample } : {}), ...(gesture ? { gesture: true } : {}),
            ...(kind ? { kind } : {}) });
        if (QOL_UTILS.SafeGetAttribute(hud, payloadAttr, "") !== raw) QOL_UTILS.SafeSetAttribute(hud, payloadAttr, raw);
        QOL_UTILS.SafeSetAttribute(hud, leaseAttr, Date.now() + 2500);
        return QOL_UTILS.SafeGetAttribute(hud, payloadAttr, "") === raw;
    }
    function clear(hud, token) {
        if (!P.isAlive(hud)) return;
        let payload;
        try { payload = JSON.parse(QOL_UTILS.SafeGetAttribute(hud, payloadAttr, "")); } catch (_) { return; }
        if (payload.token !== token) return;
        QOL_UTILS.SafeSetAttribute(hud, payloadAttr, "");
        QOL_UTILS.SafeSetAttribute(hud, leaseAttr, "");
        syncVisibility(hud, false);
        // The settings isolate can withdraw before the HUD's next poll. Its
        // verified token permits immediate release of this lease's CSS gate.
        P.setClass(hud, "QOLCustomizeLiveHud", false);
    }
    function consume(hud, canonical, blocked = false) {
        let raw = !blocked && P.isAlive(hud) && hud.BHasClass("QOLCustomizeActive") &&
            Number(QOL_UTILS.SafeGetAttribute(hud, leaseAttr, "0")) >= Date.now()
            ? QOL_UTILS.SafeGetAttribute(hud, payloadAttr, "") : "";
        let payload;
        if (raw) {
            try {
                payload = JSON.parse(raw);
                if (!payload.token || payload.stamp !== Q.core.persistence.getConfigChangeStamp(Q.core.persistence.getUIRoot())) raw = "";
                if (payload.gesture !== undefined && typeof payload.gesture !== "boolean") raw = "";
                if (payload.kind !== undefined && payload.kind !== "preset") raw = "";
                if (!payload.values || typeof payload.values !== "object" || Array.isArray(payload.values)) raw = "";
                if (payload.sample !== undefined && (typeof payload.sample !== "string" ||
                    !Q.presentation.elements.some(element => element.id === payload.sample))) raw = "";
                if (raw) for (const [key, value] of Object.entries(payload.values)) {
                    const normalized = payload.kind === "preset" ? Q.settings.normalize(key, value) : Q.presentation.normalize(key, value);
                    if (normalized === null || normalized !== value) { raw = ""; break; }
                }
            } catch (_) { raw = ""; }
        }
        syncVisibility(hud, !!raw);
        const changed = raw !== appliedPayload || (!!raw && hud !== appliedHud) || (!raw && !!activeConfig) || !!pendingLayer;
        let layer;
        if (changed) {
            const previousConfig = activeConfig;
            const previousSample = activeSample;
            activeConfig = raw ? Q.mergeConfig(Object.assign({}, canonical, payload.values)) : null;
            activeSample = raw && payload.sample ? { hud, raw, id: payload.sample, token: payload.token, stamp: payload.stamp } : null;
            // Consumption is validation, not delivery. Keep the current layer
            // visible to reactive root-class hooks, but do not ACK until the
            // app has loaded all buckets and reconciled their owners.
            QOL_UTILS.SafeSetAttribute(hud, ackAttr, "");
            QOL_UTILS.SafeSetAttribute(hud, ackPayloadAttr, "");
            layer = { changed, config: activeConfig || Q.mergeConfig(canonical), hud, raw,
                token: raw ? payload.token : "", previousConfig, previousSample };
            pendingLayer = layer;
        }
        // ConfigAdapter merges buckets. Passing a sparse canonical snapshot on
        // withdrawal would retain missing draft keys rather than restore them.
        return layer || { changed, config: activeConfig || canonical };
    }
    function commit(layer) {
        if (pendingLayer !== layer || !P.isAlive(layer.hud)) return false;
        if (layer.raw && (QOL_UTILS.SafeGetAttribute(layer.hud, payloadAttr, "") !== layer.raw ||
            !layer.hud.BHasClass("QOLCustomizeActive") ||
            Number(QOL_UTILS.SafeGetAttribute(layer.hud, leaseAttr, "0")) < Date.now())) return false;
        QOL_UTILS.SafeSetAttribute(layer.hud, ackPayloadAttr, layer.raw);
        QOL_UTILS.SafeSetAttribute(layer.hud, ackAttr, layer.token);
        if (QOL_UTILS.SafeGetAttribute(layer.hud, ackAttr, "") !== layer.token ||
            QOL_UTILS.SafeGetAttribute(layer.hud, ackPayloadAttr, "") !== layer.raw) return false;
        appliedPayload = layer.raw;
        appliedHud = layer.hud;
        pendingLayer = null;
        Q.core.EventBus.emit("presentation:preview_changed");
        return true;
    }
    function reject(layer) {
        if (pendingLayer !== layer) return;
        activeConfig = layer.previousConfig;
        activeSample = layer.previousSample;
        pendingLayer = null;
    }
    function reset(hud) {
        syncVisibility(hud, false);
        appliedPayload = "";
        appliedHud = null;
        activeConfig = null;
        activeSample = null;
        pendingLayer = null;
        QOL_UTILS.SafeSetAttribute(hud, ackAttr, "");
        QOL_UTILS.SafeSetAttribute(hud, ackPayloadAttr, "");
        Q.core.EventBus.emit("presentation:preview_changed");
    }
    function settled(hud) {
        const raw = QOL_UTILS.SafeGetAttribute(hud, payloadAttr, "");
        if (!raw || QOL_UTILS.SafeGetAttribute(hud, ackPayloadAttr, "") !== raw) return false;
        try {
            const payload = JSON.parse(raw);
            return !!payload.token && QOL_UTILS.SafeGetAttribute(hud, ackAttr, "") === payload.token;
        } catch (_) { return false; }
    }
    function interacting(hud) {
        if (!P.isAlive(hud) || !hud.BHasClass("QOLCustomizeActive") ||
            Number(QOL_UTILS.SafeGetAttribute(hud, leaseAttr, "0")) < Date.now()) return false;
        try {
            const payload = JSON.parse(QOL_UTILS.SafeGetAttribute(hud, payloadAttr, ""));
            return payload.gesture === true && !!payload.token &&
                payload.stamp === Q.core.persistence.getConfigChangeStamp(Q.core.persistence.getUIRoot());
        } catch (_) { return false; }
    }
    function selected(hud, id) {
        if (!activeSample || activeSample.hud !== hud || activeSample.id !== id || !P.isAlive(hud) ||
            !hud.BHasClass("QOLCustomizeActive") || Number(QOL_UTILS.SafeGetAttribute(hud, leaseAttr, "0")) < Date.now() ||
            activeSample.stamp !== Q.core.persistence.getConfigChangeStamp(Q.core.persistence.getUIRoot())) return false;
        const raw = QOL_UTILS.SafeGetAttribute(hud, payloadAttr, "");
        if (raw === activeSample.raw) return true;
        // Geometry edits can arrive between app polls. Keep the same accepted
        // sample stable during delivery, but retire immediately on selection,
        // token/stamp change, malformed payload or lease withdrawal.
        try {
            const next = JSON.parse(raw);
            return next.sample === id && next.token === activeSample.token && next.stamp === activeSample.stamp;
        } catch (_) { return false; }
    }
    Q.presentation.preview = { write, writePreset: (hud, values, token, stamp) => write(hud, values, token, stamp, "", false, "preset"),
        clear, consume, commit, reject, reset, selected, effective: canonical => activeConfig || canonical,
        ack: hud => QOL_UTILS.SafeGetAttribute(hud, ackAttr, ""),
        settled, interacting };
})();
