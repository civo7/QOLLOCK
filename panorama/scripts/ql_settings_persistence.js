// ql_settings_persistence.js — Config serialization utilities (base64 encoding,
// compact wire format v2 serialize/deserialize, schema-aware config apply)
// Extracted from ql_settings.js, Phase 5
(function() {
    'use strict';

    // ── Base64 encoding ──

function EncodeBase64Raw(str) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.EncodeBase64Raw === "function") {
        return QOL_CODEC.EncodeBase64Raw(str);
    }
    return "";
}

function EncodeBase64(str) {
    var raw = EncodeBase64Raw(str);
    return raw && raw.length > 0 ? raw.match(/.{1,40}/g).join(" ") : "";
}

function DecodeBase64(str) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DecodeBase64 === "function") {
        return QOL_CODEC.DecodeBase64(str);
    }
    return "";
}

// ── Compatibility aliases (commit 1.1: redirect to shared module) ──
// These allow existing code to continue working without changes.
// They will be replaced with direct QOL_COMPACT_SCHEMA_UTILS.* calls in commit 1.2.
var COMPACT_SCHEMA_REGISTRY = QOL_COMPACT_SCHEMA_REGISTRY;
var COMPACT_SCHEMA_WIRE_TO_SEMVER = QOL_COMPACT_SCHEMA_WIRE_TO_SEMVER;
var LATEST_COMPACT_SEMVER = QOL_LATEST_COMPACT_SEMVER;
function GetCompactSchema(semver)      { return QOL_COMPACT_SCHEMA_UTILS.GetSchema(semver); }
function GetCompactWireVersion(semver) { return QOL_COMPACT_SCHEMA_UTILS.GetWireVersion(semver); }
function ResolveCompactSemverFromWireVersion(wv) { return QOL_COMPACT_SCHEMA_UTILS.ResolveSemverFromWire(wv); }
function AreCompactSemversWireCompatible(a, b) { return QOL_COMPACT_SCHEMA_UTILS.AreSemversWireCompatible(a, b); }

function GetDefaultHeroOptions() {
    if (typeof QOL_COMPACT_DEFAULT_HERO_OPTIONS !== "undefined" && Array.isArray(QOL_COMPACT_DEFAULT_HERO_OPTIONS)) {
        return QOL_COMPACT_DEFAULT_HERO_OPTIONS;
    }
    if (typeof globalThis !== "undefined") {
        if (Array.isArray(globalThis.DEFAULT_HERO_OPTIONS)) return globalThis.DEFAULT_HERO_OPTIONS;
        if (globalThis.QOL && globalThis.QOL.ui && globalThis.QOL.ui.metadata && Array.isArray(globalThis.QOL.ui.metadata.DEFAULT_HERO_OPTIONS)) {
            return globalThis.QOL.ui.metadata.DEFAULT_HERO_OPTIONS;
        }
    }
    return [];
}

function GetCompactDefaultHeroField() {
    if (typeof QOL_COMPACT_DEFAULT_HERO_FIELD !== "undefined" && QOL_COMPACT_DEFAULT_HERO_FIELD) {
        return QOL_COMPACT_DEFAULT_HERO_FIELD;
    }
    if (typeof globalThis !== "undefined") {
        if (globalThis.COMPACT_DEFAULT_HERO_FIELD) return globalThis.COMPACT_DEFAULT_HERO_FIELD;
        if (globalThis.QOL && globalThis.QOL.ui && globalThis.QOL.ui.metadata && globalThis.QOL.ui.metadata.COMPACT_DEFAULT_HERO_FIELD) {
            return globalThis.QOL.ui.metadata.COMPACT_DEFAULT_HERO_FIELD;
        }
    }
    return "DEFAULT_HERO_INDEX";
}

function GetDefaultConfig() {
    if (typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG) {
        return QOL_DEFAULT_CONFIG;
    }
    if (typeof globalThis !== "undefined") {
        if (typeof globalThis.DEFAULT_CONFIG === "object" && globalThis.DEFAULT_CONFIG) return globalThis.DEFAULT_CONFIG;
        if (typeof globalThis.QOL_DEFAULT_CONFIG === "object" && globalThis.QOL_DEFAULT_CONFIG) return globalThis.QOL_DEFAULT_CONFIG;
        if (globalThis.QOL && typeof globalThis.QOL.defaultConfig === "object" && globalThis.QOL.defaultConfig) return globalThis.QOL.defaultConfig;
    }
    return {};
}

// ── Serialization helpers (remain in ql_settings.js — export/import specific) ──

function GetStepDecimals(step) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.GetStepDecimals === "function") {
        return QOL_CODEC.GetStepDecimals(step);
    }
    var s = String(step);
    var idx = s.indexOf(".");
    return idx === -1 ? 0 : (s.length - idx - 1);
}

function ToBase64Url(binaryStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.ToBase64Url === "function") {
        return QOL_CODEC.ToBase64Url(binaryStr);
    }
    return EncodeBase64Raw(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function FromBase64Url(urlStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.FromBase64Url === "function") {
        return QOL_CODEC.FromBase64Url(urlStr);
    }
    var padded = String(urlStr || "").replace(/-/g, "+").replace(/_/g, "/");
    while (padded.length % 4 !== 0) padded += "=";
    return DecodeBase64(padded);
}

function SerializeCompactV2(config, semverOverride) {
    var semver = String(semverOverride || LATEST_COMPACT_SEMVER);
    var wireVersion = GetCompactWireVersion(semver);
    var schema = GetCompactSchema(semver);
    var compactHeroField = GetCompactDefaultHeroField();
    var heroOptions = GetDefaultHeroOptions();
    var defConfig = GetDefaultConfig();
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.SerializeCompactBinary === "function") {
        return QOL_CODEC.SerializeCompactBinary(config, schema, wireVersion, function(field, cfg) {
            var val = cfg && cfg.hasOwnProperty(field.key) ? cfg[field.key] : field.min;
            if (field.key === "ULT_COOLDOWN_X_OFFSET" || field.key === "ULT_COOLDOWN_Y_OFFSET") {
                val = 0;
            }
            if (field.key === compactHeroField) {
                var configuredHero = String((cfg && cfg.DEFAULT_HERO) || "");
                var configuredHeroIndex = heroOptions.indexOf(configuredHero);
                if (configuredHeroIndex < 0) {
                    configuredHeroIndex = heroOptions.indexOf(String(defConfig.DEFAULT_HERO || ""));
                }
                if (configuredHeroIndex < 0) configuredHeroIndex = 0;
                val = configuredHeroIndex;
            }
            return val;
        });
    }
    throw new Error("Compact serializer unavailable");
}

function DeserializeCompactV2(binaryStr, expectedSemver) {
    var raw = String(binaryStr || "");
    if (raw.length < 1) throw new Error("Compact string too short");
    var wireVersion = raw.charCodeAt(0) & 255;
    var semver = "";
    if (expectedSemver) {
        var expected = String(expectedSemver);
        var expectedWireVersion = GetCompactWireVersion(expected);
        if (expectedWireVersion !== wireVersion) throw new Error("Compact schema wire version mismatch");
        semver = expected;
    } else {
        semver = ResolveCompactSemverFromWireVersion(wireVersion);
    }
    var schema = GetCompactSchema(semver);
    var compactHeroField = GetCompactDefaultHeroField();
    var heroOptions = GetDefaultHeroOptions();
    var defConfig = GetDefaultConfig();
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DeserializeCompactBinary === "function") {
        return QOL_CODEC.DeserializeCompactBinary(
            raw,
            schema,
            function(field, value, parsed) {
                if (field.key === compactHeroField) {
                    var heroIndex = Math.round(value);
                    if (heroIndex < 0 || heroIndex >= heroOptions.length) heroIndex = 0;
                    var fallbackHeroId = String(defConfig.DEFAULT_HERO || "");
                    var resolvedHeroId = heroOptions[heroIndex] || fallbackHeroId || "hero_werewolf";
                    parsed.DEFAULT_HERO = resolvedHeroId;
                    return true;
                }
                return false;
            },
            function(missingField, parsed) {
                if (!missingField || !missingField.key) return;
                if (missingField.key === compactHeroField) {
                    parsed.DEFAULT_HERO = String(defConfig.DEFAULT_HERO || "hero_werewolf");
                } else if (defConfig.hasOwnProperty(missingField.key)) {
                    parsed[missingField.key] = defConfig[missingField.key];
                }
            }
        );
    }
    throw new Error("Compact deserializer unavailable");
}

function ApplyParsedConfig(parsed) {
    for (var key in parsed) {
        if (MOD_CONFIG.hasOwnProperty(key)) {
            MOD_CONFIG[key] = parsed[key];
        }
    }
    MigrateSplitZoomKeys(MOD_CONFIG, parsed);
    NormalizeNeutralCampFlags(MOD_CONFIG, parsed);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, parsed);
    NormalizeAmmoScaleConfig(MOD_CONFIG, parsed);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, parsed);
    NormalizeColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeAllyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarEnemyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarAllyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeShopItemNotificationsConfig(MOD_CONFIG, parsed);
    NormalizeQuickbuyDependencyConfig(MOD_CONFIG);
    NormalizeLanguageSchemaMigration(MOD_CONFIG, parsed, LATEST_COMPACT_SEMVER);
    NormalizeDefaultHeroConfig(MOD_CONFIG, parsed);
}

function ClampToSchemaField(value, field) {
    if (!field) return { value: value, changed: false };
    var n = Number(value);
    if (!isFinite(n)) return { value: value, changed: false };
    var clamped = Math.max(Number(field.min), Math.min(Number(field.max), n));
    var step = Number(field.step);
    if (isFinite(step) && step > 0) {
        clamped = field.min + (Math.round((clamped - field.min) / step) * step);
    }
    var decimals = GetStepDecimals(field.step);
    clamped = decimals > 0 ? parseFloat(clamped.toFixed(decimals)) : Math.round(clamped);
    return { value: clamped, changed: NormalizeComparableConfigValue(clamped) !== NormalizeComparableConfigValue(value) };
}

function BuildSchemaFieldMap(version) {
    var map = {};
    var schema = [];
    var schemaSemver = String(version || LATEST_COMPACT_SEMVER);
    try { schema = GetCompactSchema(schemaSemver) || []; } catch (e0) { $.Msg("[QOLLock][WARN][schema] GetCompactSchema failed for v" + schemaSemver + ": " + (e0 && e0.message ? e0.message : String(e0 || ""))); schema = []; }
    for (var i = 0; i < schema.length; i++) {
        var field = schema[i];
        if (!field || !field.key) continue;
        map[String(field.key)] = field;
    }
    return map;
}

function ApplyParsedConfigWithDiagnostics(parsed, schemaVersion) {
    var diagnostics = {
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    if (!parsed || typeof parsed !== "object") return diagnostics;

    var preservedDragEnabled = MOD_CONFIG.DRAG_ENABLED;
    var preservedPreviewsEnabled = MOD_CONFIG.PREVIEWS_ENABLED;
    var preservedUpdateCheckerEnabled = MOD_CONFIG.ENABLE_UPDATE_CHECKER;
    var fieldMap = BuildSchemaFieldMap(schemaVersion);
    var defConfig = GetDefaultConfig();
    for (var defaultKey in defConfig) {
        MOD_CONFIG[defaultKey] = defConfig[defaultKey];
    }
    for (var key in parsed) {
        if (!MOD_CONFIG.hasOwnProperty(key)) {
            diagnostics.unknownKeys++;
            continue;
        }
        var nextValue = parsed[key];
        var field = fieldMap[key] || null;
        if (field && typeof nextValue === "number") {
            var clampResult = ClampToSchemaField(nextValue, field);
            nextValue = clampResult.value;
            if (clampResult.changed) diagnostics.clampedKeys++;
        }
        MOD_CONFIG[key] = nextValue;
        diagnostics.appliedKeys++;
    }
    MigrateSplitZoomKeys(MOD_CONFIG, parsed);
    NormalizeNeutralCampFlags(MOD_CONFIG, parsed);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, parsed);
    NormalizeAmmoScaleConfig(MOD_CONFIG, parsed);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, parsed);
    NormalizeColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeAllyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarEnemyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarAllyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeShopItemNotificationsConfig(MOD_CONFIG, parsed);
    NormalizeQuickbuyDependencyConfig(MOD_CONFIG);
    NormalizeCompassSpeedSchemaMigration(MOD_CONFIG, parsed, schemaVersion || LATEST_COMPACT_SEMVER);
    NormalizeLanguageSchemaMigration(MOD_CONFIG, parsed, schemaVersion || LATEST_COMPACT_SEMVER);
    MOD_CONFIG.DRAG_ENABLED = preservedDragEnabled;
    MOD_CONFIG.PREVIEWS_ENABLED = preservedPreviewsEnabled;
    if (preservedUpdateCheckerEnabled !== undefined) {
        MOD_CONFIG.ENABLE_UPDATE_CHECKER = preservedUpdateCheckerEnabled;
    }
    SetRuntimePresetName("");
    return diagnostics;
}


    // ── Public API ──
    QOL.persistence = {
        // Base64
        encodeBase64Raw: EncodeBase64Raw,
        encodeBase64: EncodeBase64,
        decodeBase64: DecodeBase64,
        toBase64Url: ToBase64Url,
        fromBase64Url: FromBase64Url,
        // Compact wire format
        serializeCompactV2: SerializeCompactV2,
        deserializeCompactV2: DeserializeCompactV2,
        applyParsedConfig: ApplyParsedConfig,
        applyParsedConfigWithDiagnostics: ApplyParsedConfigWithDiagnostics,
        buildSchemaFieldMap: BuildSchemaFieldMap,
        clampToSchemaField: ClampToSchemaField
    };
})();
