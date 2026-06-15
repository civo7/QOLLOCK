// ==========================================================================
// ql_config.js — QOLLOCK config merge, normalize, parse, and schema migration
// ==========================================================================
// Shared between HUD context (hud.xml) and Settings context (hud_escape_menu.xml).
// No IIFE — file-scope definitions like ql_shared_presets.js so both contexts
// can access the functions as bare globals.
//
// Functions also published to QOL.* namespace for feature files using QOL.import().
//
// Dependencies: ql_shared_presets.js must be loaded before this file
//   - QOL_DEFAULT_CONFIG (bare global, 256 default key/value pairs)
//   - QOL_SCHEMA_UTILS   (bare global, canonical normalize implementations)
//   - QOL namespace       (for publishing)
// ==========================================================================

"use strict";

// ── BuildDefaultConfig ──

function BuildDefaultConfig() {
    var sharedDefault = (typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG) ? QOL_DEFAULT_CONFIG : {};
    return Object.assign({}, sharedDefault);
}

// ── Schema utils accessor ──

function GetSharedSchemaUtils() {
    if (typeof QOL_SCHEMA_UTILS === "object" && QOL_SCHEMA_UTILS) return QOL_SCHEMA_UTILS;
    return null;
}

// ── MergeConfig — canonical merge + normalize chain ──

function MergeConfig(config) {
    var _dbgHasConfig = !!config;
    var _dbgConfigKeys = config ? Object.keys(config).length : 0;
    var merged = BuildDefaultConfig();
    var _dbgMergedKeysBefore = Object.keys(merged).length;
    if (!config) { $.Msg("[QOLLock][DBG][MergeConfig] null config, returning defaults (" + _dbgMergedKeysBefore + " keys)"); return merged; }
    var _copyCount = 0;
    for (var key in merged) {
        if (config.hasOwnProperty(key)) { merged[key] = config[key]; _copyCount++; }
    }
    $.Msg("[QOLLock][DBG][MergeConfig] input=" + _dbgConfigKeys + " keys, merged=" + _dbgMergedKeysBefore + " keys, copied=" + _copyCount + " healthbarType=" + merged.HEALTHBAR_TYPE);
    MigrateSplitZoomKeys(merged, config);
    NormalizeNeutralCampTierConfig(merged, config);
    NormalizeItemCooldownModeConfig(merged, config);
    NormalizeAmmoScaleConfig(merged, config);
    NormalizeVoiceTypeConfig(merged);
    NormalizeHealthbarTypeConfig(merged, config);
    NormalizeColorWarningConfig(merged, config);
    NormalizeEnemyColorWarningConfig(merged, config);
    NormalizeAllyColorWarningConfig(merged, config);
    NormalizeTopbarEnemyHpWarningConfig(merged, config);
    NormalizeTopbarAllyHpWarningConfig(merged, config);
    NormalizeShopItemNotificationsConfig(merged, config);
    return merged;
}

// ── Normalize wrappers (delegate to QOL_SCHEMA_UTILS, with inline fallbacks) ──

function NormalizeAmmoScaleConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeAmmoScaleConfig === "function") {
        utils.NormalizeAmmoScaleConfig(configTarget, sourceConfig);
    }
}

function MigrateSplitZoomKeys(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.MigrateSplitZoomKeys === "function") {
        utils.MigrateSplitZoomKeys(configTarget, sourceConfig);
    }
}

function NormalizeNeutralCampTierConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeNeutralCampTierConfig === "function") {
        utils.NormalizeNeutralCampTierConfig(configTarget, sourceConfig);
    }
}

// Alias: ql_settings.js historically called this NormalizeNeutralCampFlags.
// Both names resolve to the same QOL_SCHEMA_UTILS implementation.
function NormalizeNeutralCampFlags(configTarget, sourceConfig) {
    NormalizeNeutralCampTierConfig(configTarget, sourceConfig);
}

function NormalizeVoiceTypeValue(rawValue) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeVoiceTypeValue === "function") {
        return utils.NormalizeVoiceTypeValue(rawValue);
    }
    var asInt = Math.round(Number(rawValue));
    if (asInt === 4 || asInt === 0 || asInt === 5 || asInt === 6 || asInt === 7 || asInt === 8) return asInt;
    return 0;
}

function NormalizeVoiceVolumeValue(rawValue) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeVoiceVolumeValue === "function") {
        return utils.NormalizeVoiceVolumeValue(rawValue);
    }
    var asInt = Math.round(Number(rawValue));
    if (!isFinite(asInt)) asInt = 100;
    if (asInt < 0) asInt = 0;
    if (asInt > 100) asInt = 100;
    return asInt;
}

function NormalizeBridgeBuffFilterConfig(configTarget) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeBridgeBuffFilterConfig === "function") {
        utils.NormalizeBridgeBuffFilterConfig(configTarget);
    }
}

function NormalizeVoiceTypeConfig(configTarget) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeVoiceTypeConfig === "function") {
        utils.NormalizeVoiceTypeConfig(configTarget);
        return;
    }
    if (!configTarget) return;
    configTarget.VOICE_TYPE = NormalizeVoiceTypeValue(configTarget.VOICE_TYPE);
    configTarget.VOICE_VOLUME = NormalizeVoiceVolumeValue(configTarget.VOICE_VOLUME);
    NormalizeBridgeBuffFilterConfig(configTarget);
}

function NormalizeHealthbarTypeValue(rawValue) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeHealthbarTypeValue === "function") {
        return utils.NormalizeHealthbarTypeValue(rawValue);
    }
    return Math.round(Number(rawValue)) || 0;
}

function NormalizeHealthbarTypeConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeHealthbarTypeConfig === "function") {
        utils.NormalizeHealthbarTypeConfig(configTarget, sourceConfig);
        return;
    }
    if (!configTarget) return;
    configTarget.HEALTHBAR_TYPE = NormalizeHealthbarTypeValue(configTarget.HEALTHBAR_TYPE);
}

function NormalizeColorWarningConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeColorWarningConfig === "function") {
        utils.NormalizeColorWarningConfig(configTarget, sourceConfig);
    }
}

function NormalizeEnemyColorWarningConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeEnemyColorWarningConfig === "function") {
        utils.NormalizeEnemyColorWarningConfig(configTarget, sourceConfig);
    }
}

function NormalizeAllyColorWarningConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeAllyColorWarningConfig === "function") {
        utils.NormalizeAllyColorWarningConfig(configTarget, sourceConfig);
    }
}

function NormalizeTopbarEnemyHpWarningConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeTopbarEnemyHpWarningConfig === "function") {
        utils.NormalizeTopbarEnemyHpWarningConfig(configTarget, sourceConfig);
    }
}

function NormalizeTopbarAllyHpWarningConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeTopbarAllyHpWarningConfig === "function") {
        utils.NormalizeTopbarAllyHpWarningConfig(configTarget, sourceConfig);
    }
}

function NormalizeShopItemNotificationsConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeShopItemNotificationsConfig === "function") {
        utils.NormalizeShopItemNotificationsConfig(configTarget, sourceConfig);
    }
}

function NormalizeItemCooldownModeConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeItemCooldownModeConfig === "function") {
        utils.NormalizeItemCooldownModeConfig(configTarget, sourceConfig);
    }
}

// ── Schema semver comparison ──

function CompareSchemaSemver(a, b) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.CompareSchemaSemver === "function") {
        return utils.CompareSchemaSemver(a, b);
    }
    var aa = String(a || "").split(".");
    var bb = String(b || "").split(".");
    for (var i = 0; i < 3; i++) {
        var av = Math.max(0, Math.round(Number(aa[i]) || 0));
        var bv = Math.max(0, Math.round(Number(bb[i]) || 0));
        if (av < bv) return -1;
        if (av > bv) return 1;
    }
    return 0;
}

// ── Schema migrations ──

function NormalizeCompassSpeedSchemaMigration(configTarget, sourceConfig, schemaVersion) {
    if (!configTarget || !sourceConfig) return;
    // Resolve the latest compact semver: use BUILD_CATEGORY_LATEST_COMPACT_SEMVER
    // (HUD context) or LATEST_COMPACT_SEMVER (Settings context).
    var latestSemver = "0.0.0";
    if (typeof BUILD_CATEGORY_LATEST_COMPACT_SEMVER !== "undefined") latestSemver = BUILD_CATEGORY_LATEST_COMPACT_SEMVER;
    else if (typeof LATEST_COMPACT_SEMVER !== "undefined") latestSemver = LATEST_COMPACT_SEMVER;
    if (CompareSchemaSemver(schemaVersion || latestSemver, "2.5.0") >= 0) return;
    if (!sourceConfig.hasOwnProperty("ENABLE_COMPASS_SPEED")) return;
    if (Number(sourceConfig.ENABLE_COMPASS_SPEED) !== 1) return;
    if (Number(sourceConfig.ENABLE_COMPASS) === 1) return;

    // Before 2.5.0, speed was only reachable through Compass itself.
    configTarget.ENABLE_COMPASS_SPEED = 0;
}

function NormalizeLanguageSchemaMigration(configTarget, sourceConfig, schemaVersion) {
    if (!configTarget || !sourceConfig) return;
    var latestSemver = "0.0.0";
    if (typeof BUILD_CATEGORY_LATEST_COMPACT_SEMVER !== "undefined") latestSemver = BUILD_CATEGORY_LATEST_COMPACT_SEMVER;
    else if (typeof LATEST_COMPACT_SEMVER !== "undefined") latestSemver = LATEST_COMPACT_SEMVER;
    if (CompareSchemaSemver(schemaVersion || latestSemver, "3.0.2") >= 0) return;
    if (!sourceConfig.hasOwnProperty("LANGUAGE")) return;
    var legacyLanguage = Math.round(Number(sourceConfig.LANGUAGE));
    if (!isFinite(legacyLanguage)) return;
    if (legacyLanguage === 2) configTarget.LANGUAGE = 6;
    else if (legacyLanguage === 3) configTarget.LANGUAGE = 7;
    else if (legacyLanguage === 4) configTarget.LANGUAGE = 8;
    else if (legacyLanguage === 5) configTarget.LANGUAGE = 9;
    else if (legacyLanguage === 6) configTarget.LANGUAGE = 10;
}

// ── SafeParseConfig — config load entry point ──

function SafeParseConfig(raw) {
    if (!raw || raw === "") return null;
    try {
        var unwrapped = (typeof UnwrapConfigFromStorage === "function")
            ? UnwrapConfigFromStorage(raw)
            : null;
        if (!unwrapped || !unwrapped.config) return null;
        return MergeConfig(unwrapped.config);
    } catch (parseErr) {
        $.Msg("[QOLLock][ERROR][config] JSON parse or merge failed: " + String(parseErr.message || parseErr));
        $.Msg("[QOLLock][INFO][config] config parse failed — using defaults");
        $.Msg("\n====================================================================\n");
        $.Msg("[QOLLOCK] WARNING: Your settings were corrupted and have been reset to defaults.\n");
        $.Msg("[QOLLOCK] Open Qollock Settings to check for recovery options.\n");
        $.Msg("====================================================================\n");
        // Clear corrupt config so this doesn't repeat every tick
        try {
            var uiRoot = null;
            // Try to get the UI root to clear corrupt config from panel attrs.
            // $.GetContextPanel() works in both HUD and Settings contexts.
            try { uiRoot = $.GetContextPanel(); } catch (e0) { uiRoot = null; }
            if (uiRoot && uiRoot.SetAttributeString) {
                var storageKey = (typeof QOL_STORAGE_KEY !== "undefined") ? QOL_STORAGE_KEY : "Deadlock_Mod_Settings_v1";
                uiRoot.SetAttributeString(storageKey, "");
            }
        } catch (eClear) {
            $.Msg("[QOLLock][WARN][config] Failed to clear corrupt config from panel attrs: " + (eClear && eClear.message ? eClear.message : String(eClear || "")));
        }
        return null;
    }
}

// ── Publish to QOL namespace ──
// These are the symbols that feature files can import via QOL.import([...]).

if (typeof QOL !== "undefined") {
    QOL.buildDefaultConfig = BuildDefaultConfig;
    QOL.mergeConfig = MergeConfig;
    QOL.safeParseConfig = SafeParseConfig;
    QOL.getSharedSchemaUtils = GetSharedSchemaUtils;
    QOL.normalizeAmmoScaleConfig = NormalizeAmmoScaleConfig;
    QOL.migrateSplitZoomKeys = MigrateSplitZoomKeys;
    QOL.normalizeNeutralCampTierConfig = NormalizeNeutralCampTierConfig;
    QOL.normalizeNeutralCampFlags = NormalizeNeutralCampFlags;
    QOL.normalizeVoiceTypeValue = NormalizeVoiceTypeValue;
    QOL.normalizeVoiceVolumeValue = NormalizeVoiceVolumeValue;
    QOL.normalizeBridgeBuffFilterConfig = NormalizeBridgeBuffFilterConfig;
    QOL.normalizeVoiceTypeConfig = NormalizeVoiceTypeConfig;
    QOL.normalizeHealthbarTypeValue = NormalizeHealthbarTypeValue;
    QOL.normalizeHealthbarTypeConfig = NormalizeHealthbarTypeConfig;
    QOL.normalizeColorWarningConfig = NormalizeColorWarningConfig;
    QOL.normalizeEnemyColorWarningConfig = NormalizeEnemyColorWarningConfig;
    QOL.normalizeAllyColorWarningConfig = NormalizeAllyColorWarningConfig;
    QOL.normalizeTopbarEnemyHpWarningConfig = NormalizeTopbarEnemyHpWarningConfig;
    QOL.normalizeTopbarAllyHpWarningConfig = NormalizeTopbarAllyHpWarningConfig;
    QOL.normalizeShopItemNotificationsConfig = NormalizeShopItemNotificationsConfig;
    QOL.normalizeItemCooldownModeConfig = NormalizeItemCooldownModeConfig;
    QOL.compareSchemaSemver = CompareSchemaSemver;
    QOL.normalizeCompassSpeedSchemaMigration = NormalizeCompassSpeedSchemaMigration;
    QOL.normalizeLanguageSchemaMigration = NormalizeLanguageSchemaMigration;
}

// ── Self-test ──

try {
    if (typeof BuildDefaultConfig !== "function") throw new Error("BuildDefaultConfig is not a function");
    if (typeof MergeConfig !== "function") throw new Error("MergeConfig is not a function");
    if (typeof SafeParseConfig !== "function") throw new Error("SafeParseConfig is not a function");
    if (typeof NormalizeVoiceTypeConfig !== "function") throw new Error("NormalizeVoiceTypeConfig is not a function");
    if (typeof NormalizeHealthbarTypeConfig !== "function") throw new Error("NormalizeHealthbarTypeConfig is not a function");
    if (typeof CompareSchemaSemver !== "function") throw new Error("CompareSchemaSemver is not a function");
    if (typeof NormalizeNeutralCampTierConfig !== "function") throw new Error("NormalizeNeutralCampTierConfig is not a function");
    if (typeof NormalizeNeutralCampFlags !== "function") throw new Error("NormalizeNeutralCampFlags is not a function");
    if (typeof NormalizeCompassSpeedSchemaMigration !== "function") throw new Error("NormalizeCompassSpeedSchemaMigration is not a function");
    if (typeof NormalizeLanguageSchemaMigration !== "function") throw new Error("NormalizeLanguageSchemaMigration is not a function");

    // Verify publishing to QOL namespace
    if (typeof QOL !== "undefined") {
        if (typeof QOL.buildDefaultConfig !== "function") throw new Error("QOL.buildDefaultConfig not published");
        if (typeof QOL.mergeConfig !== "function") throw new Error("QOL.mergeConfig not published");
        if (typeof QOL.safeParseConfig !== "function") throw new Error("QOL.safeParseConfig not published");
    }
} catch(e) {
    $.Msg("[QOLLock][ERROR][ql_config] self-test failed: " + (e && e.message ? e.message : String(e)));
}
