// ==========================================================================
// ql_config.js — QOLLOCK config merge, normalize, parse, and schema migration
// ==========================================================================
// Shared between HUD context (hud.xml) and Settings context (hud_escape_menu.xml).
// No IIFE — file-scope definitions like ql_shared_presets.js so both contexts
// can access the functions as bare globals.
//
// Functions also published to QOL.* for direct namespace access.
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
    var merged = BuildDefaultConfig();
    if (!config) return merged;
    for (var key in merged) {
        if (config.hasOwnProperty(key)) merged[key] = config[key];
    }
    NormalizeConfigFields(merged, config);
    return merged;
}

// Shared in-place compatibility chain. Import-only schema migrations remain
// at the decoding boundary, where the original schema version is known.
function NormalizeConfigFields(target, source) {
    MigrateSplitZoomKeys(target, source);
    NormalizeNeutralCampTierConfig(target, source);
    NormalizeItemCooldownModeConfig(target, source);
    NormalizeAmmoScaleConfig(target, source);
    NormalizeVoiceTypeConfig(target);
    NormalizeHealthbarTypeConfig(target, source);
    NormalizeColorWarningConfig(target, source);
    NormalizeEnemyColorWarningConfig(target, source);
    NormalizeAllyColorWarningConfig(target, source);
    NormalizeTopbarEnemyHpWarningConfig(target, source);
    NormalizeTopbarAllyHpWarningConfig(target, source);
    NormalizeShopItemNotificationsConfig(target, source);
    NormalizeQuickbuyDependencyConfig(target);
    NormalizeDefaultHeroConfig(target, source);
    return target;
}

// ── Normalize wrappers (delegate to QOL_SCHEMA_UTILS) ──

function NormalizeDefaultHeroConfig(configTarget, sourceConfig) {
    if (GetSharedSchemaUtils() && typeof GetSharedSchemaUtils().NormalizeDefaultHeroConfig === "function") {
        GetSharedSchemaUtils().NormalizeDefaultHeroConfig(configTarget, sourceConfig);
    } else {
        if (configTarget && Object.prototype.hasOwnProperty.call(configTarget, "DEFAULT_HERO")) {
            delete configTarget.DEFAULT_HERO;
        }
        if (sourceConfig && Object.prototype.hasOwnProperty.call(sourceConfig, "DEFAULT_HERO")) {
            delete sourceConfig.DEFAULT_HERO;
        }
    }
}

function NormalizeAmmoScaleConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeAmmoScaleConfig(configTarget, sourceConfig);
}

function MigrateSplitZoomKeys(configTarget, sourceConfig) {
    GetSharedSchemaUtils().MigrateSplitZoomKeys(configTarget, sourceConfig);
}

function NormalizeNeutralCampTierConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeNeutralCampTierConfig(configTarget, sourceConfig);
}

// Alias: ql_settings.js historically called this NormalizeNeutralCampFlags.
// Both names resolve to the same QOL_SCHEMA_UTILS implementation.
function NormalizeNeutralCampFlags(configTarget, sourceConfig) {
    NormalizeNeutralCampTierConfig(configTarget, sourceConfig);
}

function NormalizeVoiceTypeValue(rawValue) {
    return GetSharedSchemaUtils().NormalizeVoiceTypeValue(rawValue);
}

function NormalizeVoiceVolumeValue(rawValue) {
    return GetSharedSchemaUtils().NormalizeVoiceVolumeValue(rawValue);
}

function NormalizeBridgeBuffFilterConfig(configTarget) {
    GetSharedSchemaUtils().NormalizeBridgeBuffFilterConfig(configTarget);
}

function NormalizeVoiceTypeConfig(configTarget) {
    GetSharedSchemaUtils().NormalizeVoiceTypeConfig(configTarget);
}

function NormalizeHealthbarTypeValue(rawValue) {
    return GetSharedSchemaUtils().NormalizeHealthbarTypeValue(rawValue);
}

function NormalizeHealthbarTypeConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeHealthbarTypeConfig(configTarget, sourceConfig);
}

function NormalizeColorWarningConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeColorWarningConfig(configTarget, sourceConfig);
}

function NormalizeEnemyColorWarningConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeEnemyColorWarningConfig(configTarget, sourceConfig);
}

function NormalizeAllyColorWarningConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeAllyColorWarningConfig(configTarget, sourceConfig);
}

function NormalizeTopbarEnemyHpWarningConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeTopbarEnemyHpWarningConfig(configTarget, sourceConfig);
}

function NormalizeTopbarAllyHpWarningConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeTopbarAllyHpWarningConfig(configTarget, sourceConfig);
}

function NormalizeShopItemNotificationsConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeShopItemNotificationsConfig(configTarget, sourceConfig);
}

function NormalizeQuickbuyDependencyConfig(configTarget) {
    GetSharedSchemaUtils().NormalizeQuickbuyDependencyConfig(configTarget);
}

function NormalizeItemCooldownModeConfig(configTarget, sourceConfig) {
    GetSharedSchemaUtils().NormalizeItemCooldownModeConfig(configTarget, sourceConfig);
}

// ── Schema semver comparison ──

function CompareSchemaSemver(a, b) {
    return GetSharedSchemaUtils().CompareSchemaSemver(a, b);
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

// Side-effect-free validation for asynchronous restore/save operations. Unlike
// SafeParseConfig's legacy recovery path, rejection must not clear live state.
function ParseStoredConfig(raw) {
    var unwrapped = UnwrapConfigFromStorage(raw);
    var config = unwrapped && unwrapped.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("Stored settings must contain a configuration object");
    }
    if (!unwrapped.isEnveloped &&
        (Object.prototype.hasOwnProperty.call(config, "schema") || Object.prototype.hasOwnProperty.call(config, "data"))) {
        throw new Error("Stored settings have an invalid envelope");
    }
    var safeConfig = {};
    var known = BuildDefaultConfig();
    var keys = Object.keys(config);
    var recognized = 0;
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (!Object.prototype.hasOwnProperty.call(known, key)) continue;
        if (config[key] === null || typeof config[key] === "object") {
            throw new Error("Invalid stored setting: " + key);
        }
        safeConfig[key] = config[key];
        recognized++;
    }
    if (keys.length > 0 && recognized === 0) {
        throw new Error("Stored settings contain no recognized configuration keys");
    }
    return MergeConfig(safeConfig);
}

function SafeParseConfig(raw) {
    if (!raw || raw === "") return null;
    try {
        var unwrapped = UnwrapConfigFromStorage(raw);
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
// Retained same-context delegates share the parser implementation.

if (typeof QOL !== "undefined") {
    QOL.buildDefaultConfig = BuildDefaultConfig;
    QOL.mergeConfig = MergeConfig;
    QOL.normalizeConfigFields = NormalizeConfigFields;
    QOL.safeParseConfig = SafeParseConfig;
    QOL.parseStoredConfig = ParseStoredConfig;
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
    QOL.normalizeQuickbuyDependencyConfig = NormalizeQuickbuyDependencyConfig;
    QOL.normalizeItemCooldownModeConfig = NormalizeItemCooldownModeConfig;
    QOL.compareSchemaSemver = CompareSchemaSemver;
    QOL.normalizeCompassSpeedSchemaMigration = NormalizeCompassSpeedSchemaMigration;
    QOL.normalizeLanguageSchemaMigration = NormalizeLanguageSchemaMigration;
    QOL.normalizeDefaultHeroConfig = NormalizeDefaultHeroConfig;
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
    if (typeof NormalizeQuickbuyDependencyConfig !== "function") throw new Error("NormalizeQuickbuyDependencyConfig is not a function");
    if (typeof NormalizeCompassSpeedSchemaMigration !== "function") throw new Error("NormalizeCompassSpeedSchemaMigration is not a function");
    if (typeof NormalizeLanguageSchemaMigration !== "function") throw new Error("NormalizeLanguageSchemaMigration is not a function");
    if (typeof NormalizeDefaultHeroConfig !== "function") throw new Error("NormalizeDefaultHeroConfig is not a function");

    // Verify publishing to QOL namespace
    if (typeof QOL !== "undefined") {
        if (typeof QOL.buildDefaultConfig !== "function") throw new Error("QOL.buildDefaultConfig not published");
        if (typeof QOL.mergeConfig !== "function") throw new Error("QOL.mergeConfig not published");
        if (typeof QOL.safeParseConfig !== "function") throw new Error("QOL.safeParseConfig not published");
    }
} catch(e) {
    $.Msg("[QOLLock][ERROR][ql_config] self-test failed: " + (e && e.message ? e.message : String(e)));
}
