// =============================================================================
// QOLLOCK — core/ql_config_adapter.js
// =============================================================================
// OWNS:        Bridging old flat config (334 keys) into new ConfigStore buckets.
//              Type coercion (old 0/1 → new false/true). Flat ↔ per-feature mapping.
// DOES NOT OWN: Config validation (ConfigStore), persistence (ql_app.js),
//               Feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js, core/ql_config_store.js,
//              legacy/ql_config_defaults.js (QOL_DEFAULT_CONFIG),
//              legacy/ql_core.js (QOL_FEATURE_REGISTRY — old feature key map)
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

    // Step 0b: Map old QOL.register() feature names to new manifest IDs.
    // Keys MUST match the actual QOL.register() name from ql_feat_*.js.
    // "_legacy" means "no new manifest — keep this feature in the old system."
    var OLD_TO_NEW = {
        "ammo": "ql_ammo",
        "bottomBarRuntime": "ql_bottom_bar",
        "damageImpactRuntime": "ql_damage_impact",
        "itemsRuntime": "ql_items",
        "soulsRuntime": "ql_souls",
        "staminaChargeColorRuntime": "ql_stamina",
        "topBarRuntime": "ql_topbar",
        "imagesInChat": "ql_chat_images",
        "colorWarning": "ql_color_warnings",
        "enemyColorWarning": "ql_color_warnings",
        "allyColorWarning": "ql_color_warnings",
        "combatStatus": "ql_combat_status",
        "crosshairStats": "ql_crosshair_stats",
        "damageNumbers": "ql_damage_numbers",
        "heroShop": "ql_heroshop",
        "keyboardRuntime": "ql_keyboard",
        "laneWithParty": "ql_lane_with_party",
        "legacyAudioPassive": "ql_legacy_audio_passive",
        "minimapRuntime": "ql_minimap_runtime",
        "gameplayMouseCursor": "ql_mouse_cursor",
        "nicknames": "ql_nicknames",
        "onDeathArcade": "ql_on_death_arcade",
        "recentPurchases": "ql_recent_purchases",
        "rejuvTimers": "ql_rejuv_hud",  // split from ql_rejuv_timers → ql_rejuv_hud + ql_minimap_timers
        "showRank": "ql_showrank",
        "signatureFlash": "ql_sigflash",
        "spm": "ql_spm",
        "statBonuses": "ql_stat_bonuses",
        "statlocker": "ql_statlocker",
        "statsPosition": "ql_stats_position",
        "targetShapes": "ql_target_shapes",
        "unsecuredSoulsTimer": "ql_unsecured_souls_timer",
        "unspent": "ql_unspent",
        "urnTimer": "ql_urn_timer",
        "zipBoost": "ql_zipboost",
        "betterUnsecuredHud": "ql_better_unsecured_hud",
        "healthbarRuntimeHelpers": "ql_healthbar",
        "perf": "ql_perf",
        // Permanent exceptions — no new manifest, keep in old system
        "buildBridge": "_legacy",
        "coreRoot": "_legacy",
        "buildSave": "_legacy",
        "buildLoad": "_legacy",
        "panelCache": "_legacy"
    };

    function _mapToNewId(oldId) {
        return OLD_TO_NEW[oldId] || oldId;
    }

    function _appendFeatureOwner(map, key, featureId) {
        if (!key || !featureId) return;
        if (!map[key]) map[key] = [];
        if (map[key].indexOf(featureId) === -1) map[key].push(featureId);
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

    // Map each old flat key to the NEW feature ID(s) that own it.
    // Step 0b: Applies OLD_TO_NEW mapping so both loadFromFlat() and exportToFlat()
    // use correct ConfigStore bucket IDs.
    function _buildKeyToFeatureMap() {
        var map = {};
        var unmapped = [];
        // Use the old QOL_FEATURE_REGISTRY to find which feature owns each key
        if (typeof QOL_FEATURE_REGISTRY === "object") {
            var names = Object.keys(QOL_FEATURE_REGISTRY);
            for (var i = 0; i < names.length; i++) {
                var entry = QOL_FEATURE_REGISTRY[names[i]];
                if (!entry || !entry.configKeys) continue;
                var newId = _mapToNewId(names[i]);
                if (newId === names[i] && !OLD_TO_NEW.hasOwnProperty(names[i])) {
                    unmapped.push(names[i]);
                }
                for (var j = 0; j < entry.configKeys.length; j++) {
                    var key = entry.configKeys[j];
                    _appendFeatureOwner(map, key, newId);
                }
            }
            // Step 0b validation: warn about unmapped old feature IDs
            if (unmapped.length > 0) {
                $.Msg("[QOLLock][WARN][ConfigAdapter] " + unmapped.length +
                      " unmapped old feature IDs: " + unmapped.join(", "));
            }
        } else {
            $.Msg("[QOLLock][WARN][ConfigAdapter] QOL_FEATURE_REGISTRY not found — " +
                  "config keys will route to _legacy bucket. Is ql_shared_presets.js loaded?");
        }

        // Fallback: scan FeatureRegistry manifests for keys not found in old registry.
        // When old feature files are removed (cut-over), QOL_FEATURE_REGISTRY loses
        // their entries. This fallback reads keys from the new manifests' settings[]
        // and enableKey fields so the config bridge continues to route correctly.
        _mergeManifestKeys(map);

        return map;
    }

    function _mergeManifestKeys(map) {
        var FR = QOL.core.FeatureRegistry;
        if (!FR) return;
        try {
            var ids = FR.getRegisteredIds();
            for (var i = 0; i < ids.length; i++) {
                var m = FR.getManifest(ids[i]);
                if (!m) continue;
                // A flat key may intentionally drive multiple manifests. Append
                // every owner instead of letting the first manifest claim it.
                if (m.enableKey) _appendFeatureOwner(map, m.enableKey, ids[i]);
                if (m.enableKeys) {
                    for (var e = 0; e < m.enableKeys.length; e++) {
                        if (m.enableKeys[e]) _appendFeatureOwner(map, m.enableKeys[e], ids[i]);
                    }
                }
                if (m.settings) {
                    for (var s = 0; s < m.settings.length; s++) {
                        var sk = m.settings[s].key;
                        if (sk) _appendFeatureOwner(map, sk, ids[i]);
                    }
                }
            }
        } catch(e) {
            $.Msg("[QOLLock][WARN][ConfigAdapter] manifest key scan failed: " +
                  (e.message || e));
        }
    }

    // Step 0e: Normalization stubs — called after loadFromFlat writes flat values.
    // The full normalization chain from ql_config.js MergeConfig is ~11 functions.
    // During initial wiring, we normalize in ConfigAdapter. After full migration,
    // normalization moves to ConfigStore schema-level transforms.
    function _normalizeBucket(featureId, bucket) {
        // AMMO_PANEL_SCALE → derive AMMO_CURRENT_SCALE and AMMO_TOTAL_SCALE
        if (featureId === "ql_ammo" && bucket.hasOwnProperty("AMMO_PANEL_SCALE")) {
            var ammoScale = Number(bucket.AMMO_PANEL_SCALE) || 100;
            if (!bucket.hasOwnProperty("AMMO_CURRENT_SCALE")) bucket.AMMO_CURRENT_SCALE = ammoScale;
            if (!bucket.hasOwnProperty("AMMO_TOTAL_SCALE")) bucket.AMMO_TOTAL_SCALE = ammoScale;
        }
        // HEALTHBAR_TYPE: if old boolean-based type flags are present, derive type
        // (Full normalization deferred — see ql_config.js MergeConfig for the 11 functions)
    }

    // -- Public API --

    /**
     * Load a flat config object into ConfigStore.
     * Called during boot after features have registered their schemas.
     *
     * @param {Object} flatConfig — flat key-value pairs from old storage (unwrapped from envelope)
     */
    function loadFromFlat(flatConfig, enableKeyMap) {
        if (!flatConfig || typeof flatConfig !== "object") return;

        // GameBanana compliance: Souls Per Minute and Unspent Souls are banned by moderators.
        // Enforce permanent disable across all loaded configs, storage, and presets.
        flatConfig.ENABLE_MIN_SOULS = 0;
        flatConfig.ENABLE_UNSPENT_SOULS = 0;

        var keyMap = _buildKeyToFeatureMap();
        var processed = {};
        var totalKeys = 0;

        for (var key in flatConfig) {
            if (!flatConfig.hasOwnProperty(key)) continue;
            var rawValue = flatConfig[key];
            var coerced = _coerceType(key, rawValue);
            totalKeys++;

            // Find features that own this key (now mapped to NEW IDs)
            var featureIds = keyMap[key];
            if (!featureIds || featureIds.length === 0) {
                // Key not registered to any feature — store under a legacy bucket
                if (!processed["_legacy"]) processed["_legacy"] = {};
                processed["_legacy"][key] = coerced;
                continue;
            }

            // Write to each feature's ConfigStore bucket
            for (var f = 0; f < featureIds.length; f++) {
                var fid = featureIds[f];
                if (!processed[fid]) processed[fid] = {};
                processed[fid][key] = coerced;
            }
        }

        // Apply normalization BEFORE loading into ConfigStore (Step 0e)
        for (var featureId in processed) {
            if (processed.hasOwnProperty(featureId)) {
                _normalizeBucket(featureId, processed[featureId]);
            }
        }

        // Inject "enabled: true" for features whose legacy enable key is truthy.
        // Bridges old ENABLE_X toggles into the new "enabled" flag.
        // Cold boot: loadFromFlat → exportAll → FeatureRegistry.boot() sees enabled.
        // Runtime polling: ConfigStore.load() does NOT emit config:changed,
        // so _onConfigChanged does NOT fire. Toggles require a HUD reload/restart.
        if (enableKeyMap) {
            for (var fid in enableKeyMap) {
                if (!enableKeyMap.hasOwnProperty(fid)) continue;
                var ek = enableKeyMap[fid];
                if (!processed[fid]) continue;
                // enableKeyMap[fid] is either a single key or an array of keys with
                // OR semantics (any truthy key boots the feature). Only decide when
                // at least one key is actually present, so hasOwnProperty stays the
                // guard and injection remains bidirectional (all keys 0 → enabled:false).
                var ekList = (typeof ek === "string") ? [ek] : ek;
                var sawKey = false, anyOn = false;
                for (var k = 0; k < ekList.length; k++) {
                    if (!ekList[k] || !processed[fid].hasOwnProperty(ekList[k])) continue;
                    sawKey = true;
                    if (processed[fid][ekList[k]]) anyOn = true;
                }
                if (sawKey) processed[fid]["enabled"] = anyOn;
            }
        }

        // Final safety net: banned features are unconditionally disabled in ConfigStore
        if (processed["ql_spm"]) {
            processed["ql_spm"]["enabled"] = false;
            processed["ql_spm"]["ENABLE_MIN_SOULS"] = false;
        }
        if (processed["ql_unspent"]) {
            processed["ql_unspent"]["enabled"] = false;
            processed["ql_unspent"]["ENABLE_UNSPENT_SOULS"] = false;
        }

        // Load processed data into ConfigStore
        var bucketCount = 0;
        for (featureId in processed) {
            if (processed.hasOwnProperty(featureId)) {
                var bucket = {};
                bucket[featureId] = processed[featureId];
                ConfigStore.load(bucket);
                bucketCount++;
            }
        }

        // Step 0b: runtime report
        $.Msg("[QOLLock] ConfigAdapter: loaded " + totalKeys + " keys into " +
              bucketCount + " feature buckets");
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
