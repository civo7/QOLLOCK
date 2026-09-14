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

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q?.core) {
        $.Msg("[QOLLock] core/ql_config_adapter: QOL.core not found — aborting.");
        return;
    }
    const ConfigStore = Q.core.ConfigStore;
    if (!ConfigStore) {
        $.Msg("[QOLLock] core/ql_config_adapter: ConfigStore not found — aborting.");
        return;
    }

    const OLD_TO_NEW = {
        ammo: "ql_ammo",
        bottomBarRuntime: "ql_bottom_bar",
        damageImpactRuntime: "ql_damage_impact",
        itemsRuntime: "ql_items",
        soulsRuntime: "ql_souls",
        staminaChargeColorRuntime: "ql_stamina",
        topBarRuntime: "ql_topbar",
        imagesInChat: "ql_chat_images",
        colorWarning: "ql_color_warnings",
        enemyColorWarning: "ql_color_warnings",
        allyColorWarning: "ql_color_warnings",
        combatStatus: "ql_combat_status",
        crosshairStats: "ql_crosshair_stats",
        damageNumbers: "ql_damage_numbers",
        heroShop: "ql_heroshop",
        keyboardRuntime: "ql_keyboard",
        laneWithParty: "ql_lane_with_party",
        legacyAudioPassive: "ql_legacy_audio_passive",
        minimapRuntime: "ql_minimap_runtime",
        gameplayMouseCursor: "ql_mouse_cursor",
        nicknames: "ql_nicknames",
        onDeathArcade: "ql_on_death_arcade",
        recentPurchases: "ql_recent_purchases",
        rejuvTimers: "ql_rejuv_hud",
        showRank: "ql_showrank",
        signatureFlash: "ql_sigflash",
        spm: "ql_spm",
        statBonuses: "ql_stat_bonuses",
        statlocker: "ql_statlocker",
        statsPosition: "ql_stats_position",
        targetShapes: "ql_target_shapes",
        unsecuredSoulsTimer: "ql_unsecured_souls_timer",
        unspent: "ql_unspent",
        urnTimer: "ql_urn_timer",
        zipBoost: "ql_zipboost",
        betterUnsecuredHud: "ql_better_unsecured_hud",
        healthbarRuntimeHelpers: "ql_healthbar",
        perf: "ql_perf",
        // Permanent exceptions — no new manifest, keep in old system
        buildBridge: "_legacy",
        coreRoot: "_legacy",
        buildSave: "_legacy",
        buildLoad: "_legacy",
        panelCache: "_legacy"
    };

    const mapToNewId = (oldId) => OLD_TO_NEW[oldId] || oldId;

    const appendFeatureOwner = (map, key, featureId) => {
        if (!key || !featureId) return;
        if (!map[key]) map[key] = [];
        if (!map[key].includes(featureId)) map[key].push(featureId);
    };

    const coerceType = (key, value) => {
        // Toggle keys: numeric 0/1 → boolean
        if (typeof value === "number" && (value === 0 || value === 1)) {
            const toggleKeys = /^ENABLE_|^DISABLE_|^HUD_|^SHOW_|^SUPPORT_|^MINIMAL_|^DRAG_|^PREVIEWS_|^BHOP_|^ON_DEATH_GAME_|^ITEM_FILTER_/;
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
    };

    const mergeManifestKeys = (map) => {
        const FR = Q.core.FeatureRegistry;
        if (!FR) return;
        try {
            const ids = FR.getRegisteredIds();
            for (let i = 0; i < ids.length; i++) {
                const m = FR.getManifest(ids[i]);
                if (!m) continue;
                if (m.enableKey) appendFeatureOwner(map, m.enableKey, ids[i]);
                if (m.enableKeys) {
                    for (let e = 0; e < m.enableKeys.length; e++) {
                        if (m.enableKeys[e]) appendFeatureOwner(map, m.enableKeys[e], ids[i]);
                    }
                }
                if (m.settings) {
                    for (let s = 0; s < m.settings.length; s++) {
                        const sk = m.settings[s].key;
                        if (sk) appendFeatureOwner(map, sk, ids[i]);
                    }
                }
            }
        } catch (e) {
            $.Msg(`[QOLLock][WARN][ConfigAdapter] manifest key scan failed: ${e?.message || e}`);
        }
    };

    const buildKeyToFeatureMap = () => {
        const map = {};
        const unmapped = [];
        if (typeof QOL_FEATURE_REGISTRY === "object" && QOL_FEATURE_REGISTRY) {
            const names = Object.keys(QOL_FEATURE_REGISTRY);
            for (let i = 0; i < names.length; i++) {
                const entry = QOL_FEATURE_REGISTRY[names[i]];
                if (!entry?.configKeys) continue;
                const newId = mapToNewId(names[i]);
                if (newId === names[i] && !Object.prototype.hasOwnProperty.call(OLD_TO_NEW, names[i])) {
                    unmapped.push(names[i]);
                }
                for (let j = 0; j < entry.configKeys.length; j++) {
                    const key = entry.configKeys[j];
                    appendFeatureOwner(map, key, newId);
                }
            }
            if (unmapped.length > 0) {
                $.Msg(`[QOLLock][WARN][ConfigAdapter] ${unmapped.length} unmapped old feature IDs: ${unmapped.join(", ")}`);
            }
        } else {
            $.Msg("[QOLLock][WARN][ConfigAdapter] QOL_FEATURE_REGISTRY not found — config keys will route to _legacy bucket. Is ql_shared_presets.js loaded?");
        }

        mergeManifestKeys(map);
        return map;
    };

    const normalizeBucket = (featureId, bucket) => {
        if (featureId === "ql_ammo" && Object.prototype.hasOwnProperty.call(bucket, "AMMO_PANEL_SCALE")) {
            const ammoScale = Number(bucket.AMMO_PANEL_SCALE) || 100;
            if (!Object.prototype.hasOwnProperty.call(bucket, "AMMO_CURRENT_SCALE")) bucket.AMMO_CURRENT_SCALE = ammoScale;
            if (!Object.prototype.hasOwnProperty.call(bucket, "AMMO_TOTAL_SCALE")) bucket.AMMO_TOTAL_SCALE = ammoScale;
        }
    };

    // -- Public API --
    const loadFromFlat = (flatConfig, enableKeyMap) => {
        if (!flatConfig || typeof flatConfig !== "object") return;

        flatConfig.ENABLE_MIN_SOULS = 0;
        flatConfig.ENABLE_UNSPENT_SOULS = 0;

        const keyMap = buildKeyToFeatureMap();
        const processed = {};
        let totalKeys = 0;

        for (const key in flatConfig) {
            if (!Object.prototype.hasOwnProperty.call(flatConfig, key)) continue;
            const rawValue = flatConfig[key];
            const coerced = coerceType(key, rawValue);
            totalKeys++;

            const featureIds = keyMap[key];
            if (!featureIds || featureIds.length === 0) {
                if (!processed["_legacy"]) processed["_legacy"] = {};
                processed["_legacy"][key] = coerced;
                continue;
            }

            for (let f = 0; f < featureIds.length; f++) {
                const fid = featureIds[f];
                if (!processed[fid]) processed[fid] = {};
                processed[fid][key] = coerced;
            }
        }

        for (const featureId in processed) {
            if (Object.prototype.hasOwnProperty.call(processed, featureId)) {
                normalizeBucket(featureId, processed[featureId]);
            }
        }

        if (enableKeyMap) {
            for (const fid in enableKeyMap) {
                if (!Object.prototype.hasOwnProperty.call(enableKeyMap, fid)) continue;
                const ek = enableKeyMap[fid];
                if (!processed[fid]) continue;
                const ekList = (typeof ek === "string") ? [ek] : ek;
                let sawKey = false;
                let anyOn = false;
                for (let k = 0; k < ekList.length; k++) {
                    if (!ekList[k] || !Object.prototype.hasOwnProperty.call(processed[fid], ekList[k])) continue;
                    sawKey = true;
                    if (processed[fid][ekList[k]]) anyOn = true;
                }
                if (sawKey) processed[fid]["enabled"] = anyOn;
            }
        }

        if (processed["ql_spm"]) {
            processed["ql_spm"]["enabled"] = false;
            processed["ql_spm"]["ENABLE_MIN_SOULS"] = false;
        }
        if (processed["ql_unspent"]) {
            processed["ql_unspent"]["enabled"] = false;
            processed["ql_unspent"]["ENABLE_UNSPENT_SOULS"] = false;
        }

        let bucketCount = 0;
        for (const featureId in processed) {
            if (Object.prototype.hasOwnProperty.call(processed, featureId)) {
                ConfigStore.load({ [featureId]: processed[featureId] });
                bucketCount++;
            }
        }

        $.Msg(`[QOLLock] ConfigAdapter: loaded ${totalKeys} keys into ${bucketCount} feature buckets`);
    };

    const exportToFlat = () => {
        const flat = {};
        if (typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG) {
            for (const key in QOL_DEFAULT_CONFIG) {
                if (Object.prototype.hasOwnProperty.call(QOL_DEFAULT_CONFIG, key)) {
                    flat[key] = QOL_DEFAULT_CONFIG[key];
                }
            }
        }
        const keyMap = buildKeyToFeatureMap();
        for (const flatKey in keyMap) {
            if (!Object.prototype.hasOwnProperty.call(keyMap, flatKey)) continue;
            const fids = keyMap[flatKey];
            for (let i = 0; i < fids.length; i++) {
                const val = ConfigStore.get(fids[i], flatKey);
                if (val !== undefined) {
                    flat[flatKey] = (typeof val === "boolean") ? (val ? 1 : 0) : val;
                }
            }
        }
        return flat;
    };

    Q.core.ConfigAdapter = {
        loadFromFlat,
        exportToFlat
    };

    $.Msg("[QOLLock] core/ql_config_adapter: attached to QOL.core.ConfigAdapter");
})();
