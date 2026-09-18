// =============================================================================
// QOLLOCK — core/ql_codec.js
// =============================================================================
// OWNS:        Build category payload compact binary codec (v2 wire format),
//              Base64/Base64Url transforms, token packaging, and loader queueing.
// DOES NOT OWN: Full config schema migration (legacy_3_1_9), UI rendering.
// DEPENDS ON:  core/ql_namespace.js, ql_shared_presets.js (QOL_CODEC, schema registry)
// USED BY:     ql_core.js, manifests/ql_build_payload, manifests/ql_build_storage,
//              validate_compact_schema.js
// LOAD ORDER:  After core/ql_persistence.js
// =============================================================================

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

    const getState = () => (Q.state || (typeof State !== "undefined" ? State : {}));

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

    const getLatestCompactSemver = () => (typeof QOL_LATEST_COMPACT_SEMVER !== "undefined" ? QOL_LATEST_COMPACT_SEMVER : "3.2.0");
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

    const BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS = 100;
    const BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
    const BUILD_CORRUPT_REPAIR_PENDING_ATTR = "QOL_CORRUPT_REPAIR_PENDING";
    const BUILD_SAVE_REQUEST_ATTR = "QOL_BUILD_SAVE_REQUEST";
    const BUILD_SAVE_STATE_ATTR = "QOL_BUILD_SAVE_STATE";
    const BUILD_SAVE_MSG_ATTR = "QOL_BUILD_SAVE_MSG";
    const BUILD_SAVE_TOKEN_ATTR = "QOL_BUILD_SAVE_TOKEN";

    const getPayloadExportPrefix = () => {
        const semver = (typeof QOL_SCHEMA_SEMVER === "string" && QOL_SCHEMA_SEMVER.length > 0)
            ? QOL_SCHEMA_SEMVER
            : "3.2.0";
        return `[QOL-${semver.replace(/\./g, "-")}]:`;
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

    const buildDefaultPayloadToken = (cfg) => {
        const defaults = getDefaults();
        const payloadConfig = Object.assign({}, defaults);

        const defaultHero = (typeof Q.getConfiguredDefaultHeroId === "function")
            ? Q.getConfiguredDefaultHeroId(cfg)
            : (cfg && cfg.DEFAULT_HERO ? String(cfg.DEFAULT_HERO) : "");

        if (defaultHero && defaultHero.length > 0) {
            payloadConfig.DEFAULT_HERO = defaultHero;
        }
        const compact = serializeBuildPayloadCompact(payloadConfig);
        const encoded = buildPayloadToBase64Url(compact);
        if (!encoded || encoded.length === 0) return "";
        return getPayloadExportPrefix() + encoded;
    };

    // ── Loader Queueing & Actions ──

    const queueBuildSaveRequestFromLoader = (root, payloadText, nowMs) => {
        if (!root?.SetAttributeString) return "";
        const payload = payloadText ? String(payloadText).replace(/\s+/g, "") : "";
        if (!payload || !BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX.test(payload)) return "";

        let existingState = "";
        try { existingState = String(root.GetAttributeString(BUILD_SAVE_STATE_ATTR, "") || ""); } catch (_) {}
        if (existingState === "pending") {
            let existingToken = "";
            try { existingToken = String(root.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "") || ""); } catch (_) {}
            return existingToken;
        }
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        const token = `startup_${now}_${Math.floor(Math.random() * 1000000)}`;
        root.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, payload);
        root.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, token);
        root.SetAttributeString(BUILD_SAVE_MSG_ATTR, "queued");
        root.SetAttributeString(BUILD_SAVE_STATE_ATTR, "pending");
        return token;
    };

    const shouldRunBuildCategoryPayloadUiAction = (nowMs, stateField, cooldownMs) => {
        if (!stateField || stateField.length === 0) return true;
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        const state = getState();
        const nextMs = Number(state[stateField]) || 0;
        if (now < nextMs) return false;
        let cd = Number(cooldownMs);
        if (!Number.isFinite(cd) || cd < 0) cd = BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS;
        state[stateField] = now + cd;
        return true;
    };

    const resetBuildCategoryPayloadProbeInitState = () => {
        const state = getState();
        state.buildCategoryPayloadHeroProbeInitAttempted = false;
        state.buildCategoryPayloadHeroProbeInitStage = "";
        state.buildCategoryPayloadHeroProbeInitNextMs = 0;
        state.buildCategoryPayloadHeroProbeInitRetries = 0;
        state.buildCategoryPayloadHeroProbeInitCreateAttempts = 0;
        state.buildCategoryPayloadHeroProbeInitCreateVerifyUntilMs = 0;
    };

    const setStartupCorruptRepairPending = (root, pending) => {
        if (!root?.SetAttributeString) return;
        try {
            root.SetAttributeString(BUILD_CORRUPT_REPAIR_PENDING_ATTR, pending ? "1" : "");
        } catch (_) {}
    };

    const BUILD_CATEGORY_PAYLOAD_TOKEN_EXTRACT_REGEX = /^\[QOL-\d+-\d+-\d+\]:([A-Za-z0-9\-_]+)$/i;

    const extractBuildCategoryPayloadToken = (rawText) => {
        if (!rawText) return "";
        const normalized = String(rawText).replace(/\s+/g, "");
        if (!normalized || normalized.length === 0) return "";
        const match = normalized.match(BUILD_CATEGORY_PAYLOAD_TOKEN_EXTRACT_REGEX);
        if (!match || !match[1]) return "";
        return String(match[1]);
    };

    const isBrowseBuildsPopupOpen = (root) => {
        if (!root?.FindChildTraverse) return false;
        const ids = ["PopupBuildBrowser", "BrowseBuilds", "HeroBuildSelector"];
        const isAlive = QOL_UTILS.IsPanelValid;
        for (let i = 0; i < ids.length; i++) {
            let panel = null;
            try { panel = root.FindChildTraverse(ids[i]); } catch (_) { panel = null; }
            if (panel && isAlive(panel) && panel.visible !== false) return true;
        }
        return false;
    };

    const tryOpenBuildBrowserPopup = (root) => {
        if (isBrowseBuildsPopupOpen(root)) return true;
        try {
            if (typeof CitadelOpenBuildBrowser === "function") {
                CitadelOpenBuildBrowser(1);
            }
        } catch (_) {}
        return isBrowseBuildsPopupOpen(root);
    };

    const codecApi = {
        decodeBase64: buildPayloadDecodeBase64,
        encodeBase64: buildPayloadEncodeBase64,
        fromBase64Url: buildPayloadFromBase64Url,
        toBase64Url: buildPayloadToBase64Url,
        serializeBuildPayloadCompact,
        deserializeBuildPayloadCompact,
        buildDefaultPayloadToken,
        extractBuildCategoryPayloadToken,
        isBrowseBuildsPopupOpen,
        tryOpenBuildBrowserPopup,
        queueBuildSaveRequestFromLoader,
        shouldRunBuildCategoryPayloadUiAction,
        resetBuildCategoryPayloadProbeInitState,
        setStartupCorruptRepairPending,
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

    // Backward-compat delegates on QOL root
    Q.serializeBuildPayloadCompact = serializeBuildPayloadCompact;
    Q.deserializeBuildPayloadCompact = deserializeBuildPayloadCompact;
    Q.buildDefaultPayloadToken = buildDefaultPayloadToken;
    Q.buildPayloadFromBase64Url = buildPayloadFromBase64Url;
    Q.buildPayloadToBase64Url = buildPayloadToBase64Url;
    Q.extractBuildCategoryPayloadToken = extractBuildCategoryPayloadToken;
    Q.isBrowseBuildsPopupOpen = isBrowseBuildsPopupOpen;
    Q.tryOpenBuildBrowserPopup = tryOpenBuildBrowserPopup;
    Q.queueBuildSaveRequestFromLoader = queueBuildSaveRequestFromLoader;
    Q.shouldRunBuildCategoryPayloadUiAction = shouldRunBuildCategoryPayloadUiAction;
    Q.resetBuildCategoryPayloadProbeInitState = resetBuildCategoryPayloadProbeInitState;
    Q.setStartupCorruptRepairPending = setStartupCorruptRepairPending;

    $.Msg("[QOLLock] core/ql_codec: attached to QOL.core.codec");
})();
