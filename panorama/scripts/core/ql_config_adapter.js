// OWNS: Accepted flat configuration <-> registered feature buckets and type coercion.
// DOES NOT OWN: Validation, persistence, feature lifecycle or historical codecs.
// Ownership comes from active manifest declarations; shared keys update all owners.
// Depends on core namespace/ConfigStore and the shared defaults/catalog.

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

    const appendFeatureOwner = (map, key, featureId) => {
        if (!key || !featureId) return;
        if (!map[key]) map[key] = [];
        if (!map[key].includes(featureId)) map[key].push(featureId);
    };

    const KNOWN_TOGGLE_KEYS = new Set([
        "MINIMAP_FLIP",
        "MINIMAP_ROTATE_WITH_PLAYER",
        "AUTO_CORRUPT_REPAIR",
        "ALT_ZOOM_DRAW_OVER_UI",
        "TAB_ZOOM_DRAW_OVER_UI",
        "RECENT_PURCHASES_QUICK_REJUV",
        "RECENT_PURCHASES_QUICK_SCOREBOARD",
        "STATS_POSITION_HIDE_NORMAL",
        "STATS_POSITION_HIDE_SCOREBOARD"
    ]);

    const coerceType = (key, value) => {
        // Declared toggles take precedence; numeric fields must not become
        // booleans merely because their prefix is HUD_ or MINIMAL_.
        if (KNOWN_TOGGLE_KEYS.has(key) && typeof value === "number" && (value === 0 || value === 1)) return !!value;
        if (/_SCALE$|_SIZE$|_OFFSET$|_OPACITY$|_ANGLE$|_INTERVAL$|_VOLUME$|_COUNT$|_DISPLAY_SEC$/.test(key)) return Number(value);
        if (typeof value === "number" && (value === 0 || value === 1)) {
            const toggleKeys = /^ENABLE_|^DISABLE_|^HUD_|^SHOW_|^SUPPORT_|^MINIMAL_|^DRAG_|^PREVIEWS_|^BHOP_|^ON_DEATH_GAME_|^ITEM_FILTER_/;
            if (toggleKeys.test(key)) return !!value;
        }
        // Palette keys: ensure number 0-29
        if (/_COLOR$|_WASH_COLOR$|AMMO_TEXT_COLOR|MINIMAP_ICON_COLOR/.test(key)) {
            return Math.round(Number(value)) || 0;
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
                if (m.enableKey) {
                    appendFeatureOwner(map, m.enableKey, ids[i]);
                    KNOWN_TOGGLE_KEYS.add(m.enableKey);
                }
                if (m.enableKeys) {
                    for (let e = 0; e < m.enableKeys.length; e++) {
                        if (m.enableKeys[e]) {
                            appendFeatureOwner(map, m.enableKeys[e], ids[i]);
                            KNOWN_TOGGLE_KEYS.add(m.enableKeys[e]);
                        }
                    }
                }
                if (m.settings) {
                    for (let s = 0; s < m.settings.length; s++) {
                        const setting = m.settings[s];
                        const sk = setting.key;
                        if (sk) {
                            appendFeatureOwner(map, sk, ids[i]);
                            if (setting.type === "toggle") {
                                KNOWN_TOGGLE_KEYS.add(sk);
                            }
                        }
                        if (setting.type === "multitoggle" && Array.isArray(setting.options)) {
                            for (let o = 0; o < setting.options.length; o++) {
                                const ok = setting.options[o]?.key;
                                if (ok) {
                                    appendFeatureOwner(map, ok, ids[i]);
                                    KNOWN_TOGGLE_KEYS.add(ok);
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            $.Msg(`[QOLLock][WARN][ConfigAdapter] manifest key scan failed: ${e?.message || e}`);
        }
    };

    const buildKeyToFeatureMap = () => {
        const map = {};
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

        flatConfig = { ...flatConfig, ENABLE_MIN_SOULS: 0, ENABLE_UNSPENT_SOULS: 0 };
        delete flatConfig.DEFAULT_HERO;

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
        if (processed["_legacy"]) {
            delete processed["_legacy"]["DEFAULT_HERO"];
        }

        ConfigStore.load(processed);
        const bucketCount = Object.keys(processed).length;

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
        delete flat.DEFAULT_HERO;
        return flat;
    };

    Q.core.ConfigAdapter = {
        loadFromFlat,
        exportToFlat
    };

    $.Msg("[QOLLock] core/ql_config_adapter: attached to QOL.core.ConfigAdapter");
})();
