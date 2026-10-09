// OWNS: Pure adapters for the shared historical compact/envelope codecs.
// DOES NOT OWN: UI/build actions, loader queues, persistence or runtime State.
// Shared schemas/wire versions remain unchanged; current tools use core.codec.

(function () {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : null);

    if (!Q) {
        $.Msg("[QOLLock] core/ql_codec: QOL not found — aborting.");
        return;
    }

    Q.core = Q.core || {};

    const getDefaults = () => {
        if (typeof Q.buildDefaultConfig === "function") {
            return Q.buildDefaultConfig();
        }
        if (typeof BuildDefaultConfig === "function") {
            return BuildDefaultConfig();
        }
        if (typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG) {
            return QOL_DEFAULT_CONFIG;
        }
        return {};
    };

    const getCodec = () => (typeof QOL_CODEC === "object" && QOL_CODEC ? QOL_CODEC : {});
    const getSchemaUtils = () => (typeof QOL_COMPACT_SCHEMA_UTILS === "object" && QOL_COMPACT_SCHEMA_UTILS ? QOL_COMPACT_SCHEMA_UTILS : null);

    const getLatestCompactSemver = () => (typeof QOL_LATEST_COMPACT_SEMVER !== "undefined" ? QOL_LATEST_COMPACT_SEMVER : "4.0.0");
    const getCompactSchemaRegistry = () => (typeof QOL_COMPACT_SCHEMA_REGISTRY !== "undefined" ? QOL_COMPACT_SCHEMA_REGISTRY : {});
    const getCompactWireToSemver = () => (typeof QOL_COMPACT_SCHEMA_WIRE_TO_SEMVER !== "undefined" ? QOL_COMPACT_SCHEMA_WIRE_TO_SEMVER : {});
    const getCompactDefaultHeroField = () => (typeof QOL_COMPACT_DEFAULT_HERO_FIELD !== "undefined" ? QOL_COMPACT_DEFAULT_HERO_FIELD : "DEFAULT_HERO");
    const getCompactDefaultHeroOptions = () => (typeof QOL_COMPACT_DEFAULT_HERO_OPTIONS !== "undefined" ? QOL_COMPACT_DEFAULT_HERO_OPTIONS : []);

    const getSchema = (semver) => {
        const utils = getSchemaUtils();
        if (utils?.GetSchema) return utils.GetSchema(semver);
        return getCompactSchemaRegistry()[semver]?.schema || null;
    };

    const getWireVersion = (semver) => {
        const utils = getSchemaUtils();
        if (utils?.GetWireVersion) return utils.GetWireVersion(semver);
        return getCompactSchemaRegistry()[semver]?.wireVersion ?? 2;
    };

    const resolveSemverFromWire = (wireVersion) => {
        const utils = getSchemaUtils();
        if (utils?.ResolveSemverFromWire) return utils.ResolveSemverFromWire(wireVersion);
        return getCompactWireToSemver()[wireVersion] || getLatestCompactSemver();
    };

    // ── Base64 / Base64Url transforms ──

    const buildPayloadDecodeBase64 = (str) => {
        const codec = getCodec();
        if (typeof codec.DecodeBase64 === "function") {
            return codec.DecodeBase64(str);
        }
        return "";
    };

    const buildPayloadEncodeBase64 = (binaryStr) => {
        const codec = getCodec();
        if (typeof codec.EncodeBase64Raw === "function") {
            return codec.EncodeBase64Raw(binaryStr);
        }
        return "";
    };

    const buildPayloadFromBase64Url = (urlStr) => {
        const codec = getCodec();
        if (typeof codec.FromBase64Url === "function") {
            return codec.FromBase64Url(urlStr);
        }
        let padded = String(urlStr || "").replace(/-/g, "+").replace(/_/g, "/");
        while (padded.length % 4 !== 0) padded += "=";
        return buildPayloadDecodeBase64(padded);
    };

    const buildPayloadToBase64Url = (binaryStr) => {
        const codec = getCodec();
        if (typeof codec.ToBase64Url === "function") {
            return codec.ToBase64Url(binaryStr);
        }
        return buildPayloadEncodeBase64(binaryStr)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    };

    // ── Serialization & Deserialization ──

    const serializeBuildPayloadCompact = (config, semverOverride) => {
        const semver = String(semverOverride || getLatestCompactSemver());
        const wireVersion = getWireVersion(semver);
        const schema = getSchema(semver);
        if (!semverOverride && getCodec().RequiresSettingsEnvelope(config, schema)) return WrapConfigForStorage(config);
        const defaults = getDefaults();
        const codec = getCodec();
        const defaultHeroField = getCompactDefaultHeroField();
        const defaultHeroOptions = getCompactDefaultHeroOptions();

        if (typeof codec.SerializeCompactBinary === "function") {
            return codec.SerializeCompactBinary(config, schema, wireVersion, (field, cfg) => {
                let val = (cfg && Object.prototype.hasOwnProperty.call(cfg, field.key)) ? cfg[field.key] : field.min;
                if (field.key === "ULT_COOLDOWN_X_OFFSET" || field.key === "ULT_COOLDOWN_Y_OFFSET") {
                    val = 0;
                }
                if (field.key === defaultHeroField) {
                    const configuredHero = (cfg && cfg.DEFAULT_HERO) ? String(cfg.DEFAULT_HERO) : "";
                    let heroIndex = defaultHeroOptions.indexOf(configuredHero);
                    if (heroIndex < 0) {
                        const defaultHero = (defaults && defaults.DEFAULT_HERO) ? String(defaults.DEFAULT_HERO) : "";
                        heroIndex = defaultHeroOptions.indexOf(defaultHero);
                    }
                    if (heroIndex < 0) heroIndex = 0;
                    val = heroIndex;
                }
                return val;
            });
        }
        throw new Error("Build payload serializer unavailable");
    };

    const deserializeBuildPayloadCompact = (binaryStr, expectedSemver) => {
        const raw = String(binaryStr || "");
        if (raw.charAt(0) === "{") return getCodec().ReadSettingsEnvelope(raw, expectedSemver);
        if (raw.length < 1) throw new Error("Compact string too short");
        const wireVersion = raw.charCodeAt(0) & 255;
        let semver = "";
        if (expectedSemver) {
            const expected = String(expectedSemver);
            const expectedWireVersion = getWireVersion(expected);
            if (expectedWireVersion !== wireVersion) throw new Error("Build payload schema wire version mismatch");
            semver = expected;
        } else {
            semver = resolveSemverFromWire(wireVersion);
        }
        const schema = getSchema(semver);
        const codec = getCodec();
        const defaultHeroField = getCompactDefaultHeroField();
        const defaultHeroOptions = getCompactDefaultHeroOptions();

        if (typeof codec.DeserializeCompactBinary === "function") {
            return codec.DeserializeCompactBinary(
                raw,
                schema,
                (field, value, parsed) => {
                    if (field.key === defaultHeroField) {
                        let heroIndex = Math.round(value);
                        if (heroIndex < 0 || heroIndex >= defaultHeroOptions.length) heroIndex = 0;
                        const defaults = getDefaults();
                        const fallbackHeroId = (defaults && defaults.DEFAULT_HERO) ? String(defaults.DEFAULT_HERO) : "";
                        const resolvedHeroId = defaultHeroOptions[heroIndex] || fallbackHeroId || "hero_werewolf";
                        parsed.DEFAULT_HERO = resolvedHeroId;
                        return true;
                    }
                    return false;
                },
                (missingField, parsed) => {
                    if (!missingField?.key) return;
                    const defaults = getDefaults();
                    if (missingField.key === defaultHeroField) {
                        const fallbackHero = (defaults && defaults.DEFAULT_HERO) ? String(defaults.DEFAULT_HERO) : "hero_werewolf";
                        parsed.DEFAULT_HERO = fallbackHero;
                    } else if (defaults && Object.prototype.hasOwnProperty.call(defaults, missingField.key)) {
                        parsed[missingField.key] = defaults[missingField.key];
                    }
                }
            );
        }
        throw new Error("Build payload deserializer unavailable");
    };

    const codecApi = {
        decodeBase64: buildPayloadDecodeBase64,
        encodeBase64: buildPayloadEncodeBase64,
        fromBase64Url: buildPayloadFromBase64Url,
        toBase64Url: buildPayloadToBase64Url,
        serializeBuildPayloadCompact,
        deserializeBuildPayloadCompact,
        getSchema,
        getWireVersion,
        resolveSemverFromWire,
        getLatestCompactSemver,
        getCompactSchemaRegistry,
        getCompactWireToSemver,
        getCompactDefaultHeroField,
        getCompactDefaultHeroOptions
    };

    Q.core.codec = codecApi;

    $.Msg("[QOLLock] core/ql_codec: attached to QOL.core.codec");
})();
