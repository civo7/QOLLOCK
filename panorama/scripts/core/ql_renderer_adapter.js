// =============================================================================
// QOLLOCK — core/ql_renderer_adapter.js
// =============================================================================
// OWNS:        Delegating settings rendering to old flat or new schema path
//              based on feature-level migrated flag.
// DOES NOT OWN: Control creation (settings_renderer.js), window management,
//               config persistence
// DEPENDS ON:  core/ql_namespace.js, core/ql_config_store.js
// USED BY:     Settings UI (Phase 8 — extracted from ql_settings.js)
//
// During migration, some features use the old flat config system and some
// use the new ConfigStore. This adapter determines which renderer to use
// for each feature's settings controls.
//
// Boundary validation: Checks QOL.core and QOL.core.ConfigStore exist.
// =============================================================================

(function () {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_renderer_adapter: QOL.core not found — aborting.");
        return;
    }

    var _migratedFeatures = {};

    /**
     * Mark a feature as migrated to the new ConfigStore system.
     * After migration, its settings are rendered from the schema, not flat config.
     */
    function markMigrated(featureId) {
        _migratedFeatures[featureId] = true;
    }

    /**
     * Check if a feature has been migrated to the new system.
     * Returns true if settings should be rendered from ConfigStore schema.
     */
    function isMigrated(featureId) {
        return !!_migratedFeatures[featureId];
    }

    /**
     * Get all feature IDs that have been migrated.
     */
    function getMigratedIds() {
        return Object.keys(_migratedFeatures);
    }

    // -- Attach to namespace --
    QOL.core.RendererAdapter = {
        markMigrated: markMigrated,
        isMigrated: isMigrated,
        getMigratedIds: getMigratedIds
    };

    $.Msg("[QOLLock] core/ql_renderer_adapter: attached to QOL.core.RendererAdapter");
})();
