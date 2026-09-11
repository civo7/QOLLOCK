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

(function () {
    "use strict";

    // -- Validate dependencies --
    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_logger: QOL.core not found — aborting. " +
              "Is core/ql_namespace.js loaded first?");
        return;
    }

    // -- Configuration --
    var MAX_ENTRIES = 500;
    var ERROR_THROTTLE_MS = 2000;

    // -- Private state --
    var _buffer = [];
    var _throttleTimers = {};
    var _debugEnabled = false;

    function _nowMs() {
        return Date.now ? Date.now() : $.FrameTime() * 1000;
    }

    function _store(msg) {
        _buffer.push(msg);
        if (_buffer.length > MAX_ENTRIES) { _buffer.shift(); }
    }

    function _throttled(key, featureId, level, msg) {
        var now = _nowMs();
        if (_throttleTimers[key] && (now - _throttleTimers[key]) < ERROR_THROTTLE_MS) {
            return;
        }
        _throttleTimers[key] = now;
        var formatted = "[QOLLock][" + level + "][" + featureId + "] " + msg;
        $.Msg(formatted);
        _store(formatted);
    }

    // -- Public API --
    function logError(featureId, msg) {
        if (typeof featureId !== "string" || typeof msg !== "string") return;
        _throttled("err:" + featureId, featureId, "ERROR", msg);
    }

    function logWarn(featureId, msg) {
        if (typeof featureId !== "string" || typeof msg !== "string") return;
        _throttled("warn:" + featureId, featureId, "WARN", msg);
    }

    function logInfo(featureId, msg) {
        if (typeof featureId !== "string" || typeof msg !== "string") return;
        var formatted = "[QOLLock][INFO][" + featureId + "] " + msg;
        $.Msg(formatted);
        _store(formatted);
    }

    function logDebug(featureId, msg) {
        if (!_debugEnabled) return;
        if (typeof featureId !== "string" || typeof msg !== "string") return;
        var formatted = "[QOLLock][DEBUG][" + featureId + "] " + msg;
        $.Msg(formatted);
        _store(formatted);
    }

    function clearThrottle(featureId) {
        if (typeof featureId !== "string") return;
        delete _throttleTimers["err:" + featureId];
        delete _throttleTimers["warn:" + featureId];
    }

    function setDebug(enabled) {
        _debugEnabled = !!enabled;
    }

    function getReport() {
        return _buffer.join("\n");
    }

    function getErrors(n) {
        var errors = [];
        for (var i = _buffer.length - 1; i >= 0 && errors.length < (n || 20); i--) {
            if (_buffer[i].indexOf("[ERROR]") !== -1 || _buffer[i].indexOf("[WARN]") !== -1) {
                errors.push(_buffer[i]);
            }
        }
        return errors;
    }

    function getCount() {
        return _buffer.length;
    }

    function clear() {
        _buffer.length = 0;
    }

    // -- Attach to namespace --
    var loggerApi = {
        error: logError,
        warn: logWarn,
        info: logInfo,
        debug: logDebug,
        logError: logError,
        logWarn: logWarn,
        logInfo: logInfo,
        logDebug: logDebug,
        clearThrottle: clearThrottle,
        setDebug: setDebug,
        getReport: getReport,
        getErrors: getErrors,
        getCount: getCount,
        clear: clear
    };

    QOL.core.logger = loggerApi;
    QOL.core.Logger = loggerApi;

    $.Msg("[QOLLock] core/ql_logger: attached to QOL.core.logger and QOL.core.Logger " +
          "(ring buffer: " + MAX_ENTRIES + " entries)");
})();
