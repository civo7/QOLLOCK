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
    let activeConfig = null;

    function write(hud, draft, token, stamp) {
        if (!P.isAlive(hud)) return false;
        const raw = JSON.stringify({ token, stamp, values: draft });
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
                if (!payload.values || typeof payload.values !== "object" || Array.isArray(payload.values)) raw = "";
                if (raw) for (const [key, value] of Object.entries(payload.values)) {
                    if (Q.presentation.normalize(key, value) !== value) { raw = ""; break; }
                }
            } catch (_) { raw = ""; }
        }
        const changed = raw !== appliedPayload;
        if (changed) {
            appliedPayload = raw;
            activeConfig = raw ? Q.mergeConfig(Object.assign({}, canonical, payload.values)) : null;
            QOL_UTILS.SafeSetAttribute(hud, ackAttr, raw ? payload.token : "");
            QOL_UTILS.SafeSetAttribute(hud, ackPayloadAttr, raw);
        }
        // ConfigAdapter merges buckets. Passing a sparse canonical snapshot on
        // withdrawal would retain missing draft keys rather than restore them.
        return { changed, config: activeConfig || (changed ? Q.mergeConfig(canonical) : canonical) };
    }
    function reset(hud) {
        appliedPayload = "";
        activeConfig = null;
        QOL_UTILS.SafeSetAttribute(hud, ackAttr, "");
        QOL_UTILS.SafeSetAttribute(hud, ackPayloadAttr, "");
    }
    Q.presentation.preview = { write, clear, consume, reset, effective: canonical => activeConfig || canonical,
        ack: hud => QOL_UTILS.SafeGetAttribute(hud, ackAttr, ""),
        settled: hud => !!QOL_UTILS.SafeGetAttribute(hud, payloadAttr, "") &&
            QOL_UTILS.SafeGetAttribute(hud, ackPayloadAttr, "") === QOL_UTILS.SafeGetAttribute(hud, payloadAttr, "") };
})();
