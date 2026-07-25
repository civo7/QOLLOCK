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

    // Guard against double-initialization (script reload edge case)
    if (QOL && QOL.core && QOL.core.__initialized) {
        $.Msg("[QOLLock] core/ql_namespace: already initialized, skipping.");
        return;
    }

    // Ensure QOL exists (created by ql_shared_presets.js or prior init)
    var QOL = (typeof QOL !== "undefined") ? QOL : {};

    // Create sub-namespace buckets
    QOL.core = QOL.core || {};
    QOL.ui = QOL.ui || {};
    QOL.features = QOL.features || {};
    QOL.adapters = QOL.adapters || {};

    // Mark as initialized so subsequent loads are no-ops
    QOL.core.__initialized = true;

    $.Msg("[QOLLock] core/ql_namespace: buckets ready " +
          "(core=" + (!!QOL.core) +
          " ui=" + (!!QOL.ui) +
          " features=" + (!!QOL.features) +
          " adapters=" + (!!QOL.adapters) + ")");
})();
