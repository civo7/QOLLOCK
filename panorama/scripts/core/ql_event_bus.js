// =============================================================================
// QOLLOCK — core/ql_event_bus.js
// =============================================================================
// OWNS:        Internal pub/sub event bus: on(event, fn), off(event, fn),
//              emit(event, payload). Error isolation per listener — one
//              crashing listener doesn't break others or the emitter.
// DOES NOT OWN: Config routing, feature lifecycle, logging
// DEPENDS ON:  core/ql_namespace.js (QOL.core)
// USED BY:     Feature manifests (context.events), ConfigStore, FeatureRegistry
// LOAD ORDER:  3rd — after ql_logger.js
//
// Boundary validation: Checks QOL.core exists. Aborts with message if not.
// =============================================================================

(function () {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_event_bus: QOL.core not found — aborting. " +
              "Is core/ql_namespace.js loaded first?");
        return;
    }

    var _listeners = {};

    function on(event, fn) {
        if (typeof event !== "string" || typeof fn !== "function") return;
        if (!_listeners[event]) { _listeners[event] = []; }
        _listeners[event].push(fn);
    }

    function off(event, fn) {
        if (typeof event !== "string") return;
        var list = _listeners[event];
        if (!list) return;
        if (typeof fn === "function") {
            for (var i = list.length - 1; i >= 0; i--) {
                if (list[i] === fn) { list.splice(i, 1); }
            }
        } else {
            delete _listeners[event];
        }
    }

    function emit(event, payload) {
        if (typeof event !== "string") return;
        var list = _listeners[event];
        if (!list || list.length === 0) return;
        for (var i = 0; i < list.length; i++) {
            try {
                list[i](payload);
            } catch (e) {
                // One crashing listener won't break others
                if (typeof $ !== "undefined" && $.Msg) {
                    $.Msg("[QOLLock][WARN][EventBus] listener '" + event +
                          "' threw: " + (e && e.message ? e.message : String(e)));
                }
            }
        }
    }

    QOL.core.EventBus = {
        on: on,
        off: off,
        emit: emit
    };

    $.Msg("[QOLLock] core/ql_event_bus: attached to QOL.core.EventBus");
})();
