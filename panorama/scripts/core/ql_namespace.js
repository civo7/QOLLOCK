// =============================================================================
// QOLLOCK — core/ql_namespace.js
// =============================================================================
// OWNS:        QOL.core, QOL.ui, QOL.features, QOL.adapters namespace buckets
// DOES NOT OWN: Any module logic, config, state, or feature lifecycle
// DEPENDS ON:  Nothing — pure bootstrap, loaded FIRST before all other core modules
// USED BY:     Every core module and feature manifest
// LOAD ORDER:  1st — before ql_logger.js
//
// Creates the sub-namespace buckets that all new infrastructure modules
// attach themselves to. Guard against double-initialization (script reload).
//
// Boundary validation: None needed — this is the root bootstrap.
// =============================================================================

(function () {
    "use strict";

    // Guard against double-initialization (script reload edge case).
    // Read from globalThis explicitly to avoid var-hoisting shadowing.
    var _existing = (typeof globalThis !== "undefined") ? globalThis.QOL : QOL;
    if (_existing && _existing.core && _existing.core.__initialized) {
        $.Msg("[QOLLock] core/ql_namespace: already initialized, skipping.");
        return;
    }

    // Ensure QOL namespace exists (created by ql_shared_presets.js or prior init)
    if (typeof globalThis !== "undefined" && globalThis.QOL) {
        var QOL = globalThis.QOL;
    } else {
        var QOL = (typeof QOL !== "undefined") ? QOL : {};
        if (typeof globalThis !== "undefined") { globalThis.QOL = QOL; }
    }

    // Create sub-namespace buckets
    QOL.VERSION = QOL.VERSION || "3.2.0";
    try {
        var _ctxId = ($.GetContextPanel() && $.GetContextPanel().id) || "";
        QOL.ROLE = (_ctxId === "EscapeMenu") ? "em" : "hud";
    } catch(e) {
        QOL.ROLE = "hud";
    }

    QOL.core = QOL.core || {};
    QOL.ui = QOL.ui || {};
    QOL.features = QOL.features || {};
    QOL.adapters = QOL.adapters || {};

    // Forward/backward compat aliases
    QOL.core.panel = QOL.core.panel || {};
    QOL.ui.PanelHelpers = QOL.core.panel;
    QOL.core.hud = QOL.core.hud || {};
    QOL.core.time = QOL.core.time || {};
    QOL.core.perf = QOL.core.perf || {};
    QOL.core.Scheduler = QOL.core.perf;
    QOL.core.registry = QOL.core.registry || {};
    QOL.core.FeatureRegistry = QOL.core.registry;
    QOL.core.logger = QOL.core.logger || {};
    QOL.core.Logger = QOL.core.logger;
    QOL.core.app = QOL.core.app || {};
    QOL.core.App = QOL.core.app;

    // Resilient QOL.import fallback for transitional features
    if (!QOL.import) {
        QOL.import = function(names) {
            var out = {};
            if (!Array.isArray(names)) return out;
            for (var i = 0; i < names.length; i++) {
                var k = names[i];
                if (k === "state") {
                    out.state = (typeof QOL !== "undefined" && QOL.state) || (typeof State !== "undefined" ? State : {});
                } else if (k === "utils") {
                    out.utils = (typeof QOL_UTILS !== "undefined" ? QOL_UTILS : {});
                } else if (k === "getCachedPanel") {
                    out.getCachedPanel = (typeof QOL !== "undefined" && QOL.getCachedPanel) || function(key) { return (typeof State !== "undefined" && State.cachedPanels) ? State.cachedPanels[key] : null; };
                } else if (k === "setCachedPanel") {
                    out.setCachedPanel = (typeof QOL !== "undefined" && QOL.setCachedPanel) || function(key, val) { if (typeof State !== "undefined" && State.cachedPanels) { State.cachedPanels[key] = val; } };
                } else {
                    out[k] = (typeof QOL !== "undefined" ? QOL[k] : undefined);
                }
            }
            return out;
        };
    }

    // Mark as initialized so subsequent loads are no-ops
    QOL.core.__initialized = true;

    $.Msg("[QOLLock] core/ql_namespace: buckets ready " +
          "(core=" + (!!QOL.core) +
          " ui=" + (!!QOL.ui) +
          " features=" + (!!QOL.features) +
          " adapters=" + (!!QOL.adapters) +
          " role=" + QOL.ROLE + ")");
})();
