// =============================================================================
// QOLLOCK — core/ql_config_adapter.js
// =============================================================================
// OWNS:        Bridging old flat config (334 keys) into new ConfigStore buckets.
//              Type coercion (old 0/1 → new false/true). Flat ↔ per-feature mapping.
// DOES NOT OWN: Config validation (ConfigStore), persistence (ql_app.js),
//               Feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js, core/ql_config_store.js,
//              legacy/ql_config_defaults.js (QOL_DEFAULT_CONFIG)
// USED BY:     ql_app.js (boot: load old config → ConfigStore)
// LOAD ORDER:  After ql_config_store.js and legacy/ql_config_defaults.js
//
// The old system stores config as a flat object:
//   { ENABLE_AMMO_STATUS: 1, AMMO_PANEL_SCALE: 100, ... }
//
// The new ConfigStore expects per-feature buckets with typed values:
//   ConfigStore.get("ql_ammo", "ENABLE_AMMO_STATUS") → true
//
// This adapter bridges the two formats. During migration, it reads the old
// flat config and populates ConfigStore for each registered feature.
//
// Boundary validation: Checks QOL.core and QOL.core.ConfigStore exist.
// =============================================================================

(function () {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_config_adapter: QOL.core not found — aborting.");
        return;
    }
    var ConfigStore = QOL.core.ConfigStore;
    if (!ConfigStore) {
        $.Msg("[QOLLock] core/ql_config_adapter: ConfigStore not found — aborting.");
        return;
    }

    // Old flat defaults — populated by legacy/ql_config_defaults.js
    // Type coercion map: for each flat key, what type it should be in new system
    function _coerceType(key, value) {
        // Toggle keys: numeric 0/1 → boolean
        if (typeof value === "number" && (value === 0 || value === 1)) {
            var toggleKeys = /^ENABLE_|^DISABLE_|^HUD_|^SHOW_|^SUPPORT_|^MINIMAL_|^DRAG_|^PREVIEWS_|^BHOP_|^ON_DEATH_GAME_|^ITEM_FILTER_/;
            if (toggleKeys.test(key)) return !!value;
        }
        // Palette keys: ensure number 0-29
        if (/_COLOR$|_WASH_COLOR$|AMMO_TEXT_COLOR|MINIMAP_ICON_COLOR/.test(key)) {
            return Math.round(Number(value)) || 0;
        }
        // Slider keys: ensure number
        if (/_SCALE$|_SIZE$|_OFFSET$|_OPACITY$|_ANGLE$|_INTERVAL$|_VOLUME$|_COUNT$|_DISPLAY_SEC$/.test(key)) {
            return Number(value);
        }
        return value;
    }

    // Map each old flat key to the feature(s) that own it.
    // Built from canonical type mapping (Phase 0).
    // During migration, the old QOL_FEATURE_REGISTRY is the authoritative source.
    function _buildKeyToFeatureMap() {
        var map = {};
        // Use the old QOL_FEATURE_REGISTRY to find which feature owns each key
        if (typeof QOL_FEATURE_REGISTRY === "object") {
            var names = Object.keys(QOL_FEATURE_REGISTRY);
            for (var i = 0; i < names.length; i++) {
                var entry = QOL_FEATURE_REGISTRY[names[i]];
                if (!entry || !entry.configKeys) continue;
                for (var j = 0; j < entry.configKeys.length; j++) {
                    var key = entry.configKeys[j];
                    if (!map[key]) map[key] = [];
                    map[key].push(names[i]);
                }
            }
        }
        // Also check the new FeatureRegistry manifests
        if (ConfigStore) {
            // FeatureRegistry handles its own key registration
        }
        return map;
    }

    // -- Public API --

    /**
     * Load a flat config object into ConfigStore.
     * Called during boot after features have registered their schemas.
     *
     * @param {Object} flatConfig — flat key-value pairs from old storage
     */
    function loadFromFlat(flatConfig) {
        if (!flatConfig || typeof flatConfig !== "object") return;

        var keyMap = _buildKeyToFeatureMap();
        var processed = {};

        for (var key in flatConfig) {
            if (!flatConfig.hasOwnProperty(key)) continue;
            var rawValue = flatConfig[key];
            var coerced = _coerceType(key, rawValue);

            // Find features that own this key
            var featureIds = keyMap[key];
            if (!featureIds || featureIds.length === 0) {
                // Key not registered to any feature — store under a legacy bucket
                if (!processed["_legacy"]) processed["_legacy"] = {};
                processed["_legacy"][key] = coerced;
                continue;
            }

            // Write to each feature's ConfigStore bucket
            for (var f = 0; f < featureIds.length; f++) {
                // Set directly into ConfigStore (bypasses validation for migration)
                // ConfigStore.set validates and emits events
                var fid = featureIds[f];
                if (!processed[fid]) processed[fid] = {};
                processed[fid][key] = coerced;
            }
        }

        // Load processed data into ConfigStore
        for (var featureId in processed) {
            if (processed.hasOwnProperty(featureId)) {
                var bucket = {};
                bucket[featureId] = processed[featureId];
                ConfigStore.load(bucket);
            }
        }
    }

    /**
     * Export ConfigStore back to flat format for backward compatibility.
     * Called during save to ensure old settings UI still works.
     *
     * @returns {Object} flat key-value pairs
     */
    function exportToFlat() {
        var flat = {};
        // Start with defaults
        if (typeof QOL_DEFAULT_CONFIG === "object") {
            for (var key in QOL_DEFAULT_CONFIG) {
                if (QOL_DEFAULT_CONFIG.hasOwnProperty(key)) {
                    flat[key] = QOL_DEFAULT_CONFIG[key];
                }
            }
        }
        // Override with ConfigStore values from each feature
        var keyMap = _buildKeyToFeatureMap();
        for (var flatKey in keyMap) {
            if (!keyMap.hasOwnProperty(flatKey)) continue;
            var fids = keyMap[flatKey];
            for (var i = 0; i < fids.length; i++) {
                var val = ConfigStore.get(fids[i], flatKey);
                if (val !== undefined) {
                    // Coerce back to old format (boolean → 0/1)
                    flat[flatKey] = (typeof val === "boolean") ? (val ? 1 : 0) : val;
                }
            }
        }
        return flat;
    }

    // -- Attach to namespace --
    QOL.core.ConfigAdapter = {
        loadFromFlat: loadFromFlat,
        exportToFlat: exportToFlat
    };

    $.Msg("[QOLLock] core/ql_config_adapter: attached to QOL.core.ConfigAdapter");
})();
