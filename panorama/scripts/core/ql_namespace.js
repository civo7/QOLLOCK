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

(() => {
    "use strict";

    // Guard against double-initialization (script reload edge case).
    const existing = (typeof globalThis !== "undefined") ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (existing?.core?.__initialized) {
        $.Msg("[QOLLock] core/ql_namespace: already initialized, skipping.");
        return;
    }

    // Ensure QOL namespace exists (created by ql_shared_presets.js or prior init)
    const Q = existing || {};
    if (typeof globalThis !== "undefined") {
        globalThis.QOL = Q;
    }

    // Create sub-namespace buckets
    Q.VERSION = Q.VERSION || "3.2.0";
    try {
        const ctxId = $.GetContextPanel()?.id || "";
        Q.ROLE = (ctxId === "EscapeMenu") ? "em" : "hud";
    } catch (_) {
        Q.ROLE = "hud";
    }

    Q.core = Q.core || {};
    Q.ui = Q.ui || {};
    Q.features = Q.features || {};
    Q.adapters = Q.adapters || {};

    // Forward/backward compat aliases
    Q.core.panel = Q.core.panel || {};
    Q.ui.PanelHelpers = Q.core.panel;
    Q.core.hud = Q.core.hud || {};
    Q.core.time = Q.core.time || {};
    Q.core.perf = Q.core.perf || {};
    Q.core.Scheduler = Q.core.perf;
    Q.core.registry = Q.core.registry || {};
    Q.core.FeatureRegistry = Q.core.registry;
    Q.core.logger = Q.core.logger || {};
    Q.core.Logger = Q.core.logger;
    Q.core.app = Q.core.app || {};
    Q.core.App = Q.core.app;

    // Resilient QOL.import fallback for transitional features
    if (!Q.import) {
        Q.import = (names) => {
            const out = {};
            if (!Array.isArray(names)) return out;
            for (const k of names) {
                if (k === "state") {
                    out.state = Q.state || (typeof State !== "undefined" ? State : {});
                } else if (k === "utils") {
                    out.utils = (typeof QOL_UTILS !== "undefined" ? QOL_UTILS : {});
                } else if (k === "getCachedPanel") {
                    out.getCachedPanel = Q.getCachedPanel || ((key) => (typeof State !== "undefined" && State.cachedPanels ? State.cachedPanels[key] : null));
                } else if (k === "setCachedPanel") {
                    out.setCachedPanel = Q.setCachedPanel || ((key, val) => {
                        if (typeof State !== "undefined" && State.cachedPanels) { State.cachedPanels[key] = val; }
                    });
                } else {
                    out[k] = Q[k];
                }
            }
            return out;
        };
    }

    // Mark as initialized so subsequent loads are no-ops
    Q.core.__initialized = true;

    $.Msg(`[QOLLock] core/ql_namespace: buckets ready (core=${!!Q.core} ui=${!!Q.ui} features=${!!Q.features} adapters=${!!Q.adapters} role=${Q.ROLE})`);
})();
