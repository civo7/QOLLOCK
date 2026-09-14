// =============================================================================
// QOLLOCK — core/ql_logger.js
// =============================================================================
// OWNS:        Structured logging: [QOLLock][LEVEL][feature] message format.
//              Ring buffer (500 entries), per-feature 2s throttle.
//              logError/logWarn/logInfo/logDebug + clearThrottle + getReport/getErrors.
// DOES NOT OWN: Feature lifecycle, config, panel access, scheduling
// DEPENDS ON:  core/ql_namespace.js (QOL.core)
// USED BY:     Every module and feature manifest
// LOAD ORDER:  2nd — after ql_namespace.js
//
// Boundary validation: Checks QOL.core exists. Aborts with message if not.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q?.core) {
        $.Msg("[QOLLock] core/ql_logger: QOL.core not found — aborting. Is core/ql_namespace.js loaded first?");
        return;
    }

    const MAX_ENTRIES = 500;
    const ERROR_THROTTLE_MS = 2000;

    const buffer = [];
    const throttleTimers = new Map();
    let debugEnabled = false;

    const nowMs = () => (Date.now ? Date.now() : (new Date()).getTime());

    const store = (msg) => {
        buffer.push(msg);
        if (buffer.length > MAX_ENTRIES) {
            buffer.shift();
        }
    };

    const throttled = (key, featureId, level, msg) => {
        const now = nowMs();
        const last = throttleTimers.get(key);
        if (last && (now - last) < ERROR_THROTTLE_MS) {
            return;
        }
        throttleTimers.set(key, now);
        const formatted = `[QOLLock][${level}][${featureId}] ${msg}`;
        $.Msg(formatted);
        store(formatted);
    };

    // -- Public API --
    const logError = (featureId, msg) => {
        if (typeof featureId !== "string" || typeof msg !== "string") return;
        throttled(`err:${featureId}`, featureId, "ERROR", msg);
    };

    const logWarn = (featureId, msg) => {
        if (typeof featureId !== "string" || typeof msg !== "string") return;
        throttled(`warn:${featureId}`, featureId, "WARN", msg);
    };

    const logInfo = (featureId, msg) => {
        if (typeof featureId !== "string" || typeof msg !== "string") return;
        const formatted = `[QOLLock][INFO][${featureId}] ${msg}`;
        $.Msg(formatted);
        store(formatted);
    };

    const logDebug = (featureId, msg) => {
        if (!debugEnabled) return;
        if (typeof featureId !== "string" || typeof msg !== "string") return;
        const formatted = `[QOLLock][DEBUG][${featureId}] ${msg}`;
        $.Msg(formatted);
        store(formatted);
    };

    const clearThrottle = (featureId) => {
        if (typeof featureId !== "string") return;
        throttleTimers.delete(`err:${featureId}`);
        throttleTimers.delete(`warn:${featureId}`);
    };

    const setDebug = (enabled) => {
        debugEnabled = !!enabled;
    };

    const getReport = () => buffer.join("\n");

    const getErrors = (n = 20) => {
        const errors = [];
        for (let i = buffer.length - 1; i >= 0 && errors.length < n; i--) {
            if (buffer[i].includes("[ERROR]") || buffer[i].includes("[WARN]")) {
                errors.push(buffer[i]);
            }
        }
        return errors;
    };

    const getCount = () => buffer.length;

    const clear = () => {
        buffer.length = 0;
    };

    // -- Attach to namespace --
    const loggerApi = {
        error: logError,
        warn: logWarn,
        info: logInfo,
        debug: logDebug,
        logError,
        logWarn,
        logInfo,
        logDebug,
        clearThrottle,
        setDebug,
        getReport,
        getErrors,
        getCount,
        clear
    };

    Q.core.logger = loggerApi;
    Q.core.Logger = loggerApi;

    $.Msg(`[QOLLock] core/ql_logger: attached to QOL.core.logger and QOL.core.Logger (ring buffer: ${MAX_ENTRIES} entries)`);
})();
