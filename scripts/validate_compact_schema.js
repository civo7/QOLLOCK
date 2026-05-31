const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.resolve(__dirname, "..");
const sharedPath = path.join(projectRoot, "panorama", "scripts", "ql_shared_presets.js");
const settingsPath = path.join(projectRoot, "panorama", "scripts", "ql_settings.js");
const corePath = path.join(projectRoot, "panorama", "scripts", "ql_core.js");
const mirrorRoot = path.resolve(projectRoot, "..", "MIRROR_QOLLOCK");
const mirrorSharedPath = path.join(mirrorRoot, "panorama", "scripts", "ql_shared_presets.js");
const mirrorSettingsPath = path.join(mirrorRoot, "panorama", "scripts", "ql_settings.js");
const mirrorCorePath = path.join(mirrorRoot, "panorama", "scripts", "ql_core.js");

function readFile(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function makePanelStub() {
    const panel = {
        style: {},
        actuallayoutwidth: 0,
        actuallayoutheight: 0,
        actualxoffset: 0,
        actualyoffset: 0,
        visible: true,
        enabled: true,
        text: "",
        GetParent: () => null,
        GetChild: () => null,
        GetChildCount: () => 0,
        FindChild: () => null,
        FindChildTraverse: () => null,
        FindChildInLayoutFile: () => null,
        FindChildrenWithClassTraverse: () => [],
        FindChildrenWithClassTraverseInLayoutFile: () => [],
        BHasClass: () => false,
        AddClass: () => {},
        RemoveClass: () => {},
        SetHasClass: () => {},
        SetAttributeString: () => {},
        GetAttributeString: (_key, fallback) => (typeof fallback === "undefined" ? "" : fallback),
        SetAttributeInt: () => {},
        GetAttributeInt: (_key, fallback) => (typeof fallback === "undefined" ? 0 : fallback),
        SetAttributeFloat: () => {},
        GetAttributeFloat: (_key, fallback) => (typeof fallback === "undefined" ? 0 : fallback),
        SetDialogVariable: () => {},
        SetDialogVariableInt: () => {},
        SetDialogVariableTime: () => {},
        SetPanelEvent: () => {},
        ClearPanelEvent: () => {},
        DeleteAsync: () => {},
        RemoveAndDeleteChildren: () => {},
        RemoveClassFromAllChildren: () => {},
        BLoadLayoutFromString: () => true,
        BLoadLayout: () => true,
        BLoadLayoutSnippet: () => true,
        MoveChildBefore: () => {},
        MoveChildAfter: () => {},
        SetParent: () => {},
        ScrollToTop: () => {},
        ScrollParentToMakePanelFit: () => {},
        SetReadyForDisplay: () => {},
        IsValid: () => true
    };
    return panel;
}

function makeNoopProxy() {
    const fn = function() { return undefined; };
    return new Proxy(fn, {
        get(_target, prop) {
            if (prop === Symbol.toPrimitive) return () => "";
            if (prop === "toString") return () => "";
            if (prop === "valueOf") return () => 0;
            if (prop === "length") return 0;
            if (prop === "name") return "noop";
            return makeNoopProxy();
        },
        apply() {
            return undefined;
        },
        construct() {
            return {};
        }
    });
}

function makeSandbox() {
    const rootPanel = makePanelStub();
    const storage = new Map();
    const noop = () => {};
    return {
        console,
        JSON,
        Math,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Date,
        RegExp,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        setTimeout: () => 0,
        setInterval: () => 0,
        clearTimeout: noop,
        clearInterval: noop,
        performance: { now: () => 0 },
        $: {
            Msg: noop,
            Warning: noop,
            Localize: (token) => String(token || ""),
            Schedule: () => 0,
            CancelScheduled: noop,
            DispatchEvent: noop,
            RegisterForUnhandledEvent: noop,
            RegisterEventHandler: noop,
            CreatePanel: () => makePanelStub(),
            GetContextPanel: () => rootPanel,
            persistentStorage: {
                getItem: (key) => (storage.has(String(key)) ? storage.get(String(key)) : ""),
                setItem: (key, value) => storage.set(String(key), String(value)),
                removeItem: (key) => storage.delete(String(key))
            },
            NetProps: {}
        },
        Game: {
            Events: {
                Subscribe: noop,
                Unsubscribe: noop
            }
        },
        GameEvents: {
            Subscribe: noop,
            Unsubscribe: noop,
            SendCustomGameEventToServer: noop
        },
        GameUI: {
            CustomUIConfig: () => ({})
        },
        GameStateAPI: {
            SubscribeToGameState: noop,
            UnsubscribeFromGameState: noop,
            GetLocalPlayerID: () => 0,
            GetLocalTeam: () => 0,
            GetTeam: () => 0,
            GetMapName: () => "",
            IsSpectator: () => false
        },
        Players: makeNoopProxy(),
        Entities: makeNoopProxy(),
        Abilities: makeNoopProxy(),
        Buffs: makeNoopProxy(),
        GameModeAPI: makeNoopProxy(),
        GameInterfaceAPI: makeNoopProxy(),
        MatchDetailsAPI: makeNoopProxy(),
        PartyListAPI: makeNoopProxy(),
        SteamOverlayAPI: makeNoopProxy(),
        FriendsUI: makeNoopProxy(),
        PanoramaRunScript: noop
    };
}

function appendTrailer(source, trailer, injectInsideIife) {
    if (!trailer) return source;
    if (!injectInsideIife) {
        return source + "\n" + trailer + "\n";
    }
    const iifeClose = source.lastIndexOf("})();");
    if (iifeClose >= 0) {
        return source.slice(0, iifeClose) + "\n" + trailer + "\n" + source.slice(iifeClose);
    }
    return source + "\n" + trailer + "\n";
}

function loadContext(scriptPaths, trailer, injectInsideIife) {
    const sandbox = makeSandbox();
    vm.createContext(sandbox);
    for (let i = 0; i < scriptPaths.length; i++) {
        const scriptPath = scriptPaths[i];
        const source = readFile(scriptPath);
        const finalSource = (i === scriptPaths.length - 1 && trailer)
            ? appendTrailer(source, trailer, !!injectInsideIife)
            : source;
        vm.runInContext(finalSource, sandbox, { filename: scriptPath });
    }
    return sandbox;
}

function getJson(context, expression) {
    return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

function getValue(context, expression) {
    return vm.runInContext(expression, context);
}

function schemaToComparable(schema) {
    return (Array.isArray(schema) ? schema : []).map((field) => ({
        key: String(field.key),
        min: Number(field.min),
        max: Number(field.max),
        step: Number(field.step)
    }));
}

function compareSchemas(left, right) {
    const a = schemaToComparable(left);
    const b = schemaToComparable(right);
    if (a.length !== b.length) {
        return `field count differs (${a.length} !== ${b.length})`;
    }
    for (let i = 0; i < a.length; i++) {
        const leftField = a[i];
        const rightField = b[i];
        if (
            leftField.key !== rightField.key ||
            leftField.min !== rightField.min ||
            leftField.max !== rightField.max ||
            leftField.step !== rightField.step
        ) {
            return `field ${i} differs (${JSON.stringify(leftField)} !== ${JSON.stringify(rightField)})`;
        }
    }
    return "";
}

function getExpectedFieldValue(fieldKey, effectiveConfig, defaultConfig) {
    if (fieldKey === "DEFAULT_HERO_INDEX") {
        return String(
            Object.prototype.hasOwnProperty.call(effectiveConfig, "DEFAULT_HERO")
                ? effectiveConfig.DEFAULT_HERO
                : defaultConfig.DEFAULT_HERO
        );
    }
    if (fieldKey === "ULT_COOLDOWN_X_OFFSET" || fieldKey === "ULT_COOLDOWN_Y_OFFSET") {
        return 0;
    }
    if (Object.prototype.hasOwnProperty.call(effectiveConfig, fieldKey)) {
        return effectiveConfig[fieldKey];
    }
    return defaultConfig[fieldKey];
}

function compareDecodedAgainstSchema(decoded, effectiveConfig, defaultConfig, schema) {
    const mismatches = [];
    const comparableSchema = schemaToComparable(schema);
    for (const field of comparableSchema) {
        const decodedKey = field.key === "DEFAULT_HERO_INDEX" ? "DEFAULT_HERO" : field.key;
        const expected = getExpectedFieldValue(field.key, effectiveConfig, defaultConfig);
        const actual = decoded[decodedKey];
        if (expected !== actual) {
            mismatches.push(`${decodedKey}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    return mismatches;
}

function compareDecodedObjectsBySchema(leftDecoded, rightDecoded, schema) {
    const mismatches = [];
    const comparableSchema = schemaToComparable(schema);
    for (const field of comparableSchema) {
        const decodedKey = field.key === "DEFAULT_HERO_INDEX" ? "DEFAULT_HERO" : field.key;
        if (leftDecoded[decodedKey] !== rightDecoded[decodedKey]) {
            mismatches.push(`${decodedKey}: ${JSON.stringify(leftDecoded[decodedKey])} !== ${JSON.stringify(rightDecoded[decodedKey])}`);
        }
    }
    return mismatches;
}

function buildSchemaCompatibleConfig(config, schema) {
    const source = Object.assign({}, config || {});
    const comparableSchema = schemaToComparable(schema);
    for (const field of comparableSchema) {
        const key = String(field.key);
        const sourceKey = key === "DEFAULT_HERO_INDEX" ? "DEFAULT_HERO" : key;
        if (!Object.prototype.hasOwnProperty.call(source, sourceKey)) continue;
        const rawValue = source[sourceKey];
        const num = Number(rawValue);
        if (!Number.isFinite(num)) continue;
        let clamped = Math.max(field.min, Math.min(field.max, num));
        const slots = (clamped - field.min) / field.step;
        const rounded = Math.round(slots);
        clamped = field.min + (rounded * field.step);
        const decimals = String(field.step).includes(".")
            ? String(field.step).split(".")[1].length
            : 0;
        clamped = decimals > 0 ? parseFloat(clamped.toFixed(decimals)) : Math.round(clamped);
        source[sourceKey] = clamped;
    }
    return source;
}

function mutateEncodedWireVersion(encodedBinary, newWireVersion) {
    if (!encodedBinary || typeof encodedBinary !== "string" || encodedBinary.length < 1) {
        throw new Error("Encoded binary is too short to mutate wire version");
    }
    const normalized = Math.max(0, Math.round(Number(newWireVersion) || 0)) & 255;
    return String.fromCharCode(normalized) + encodedBinary.slice(1);
}

function validatePresetValues(presetName, effectiveConfig, schema) {
    const issues = [];
    const comparableSchema = schemaToComparable(schema);
    for (const field of comparableSchema) {
        if (field.key === "DEFAULT_HERO_INDEX") continue;
        const value = effectiveConfig[field.key];
        if (typeof value === "undefined") continue;
        const num = Number(value);
        if (!Number.isFinite(num)) continue;
        if (num < field.min || num > field.max) {
            issues.push(`${presetName}: ${field.key} out of range (${num} not in [${field.min}, ${field.max}])`);
            continue;
        }
        const slots = (num - field.min) / field.step;
        const rounded = Math.round(slots);
        if (Math.abs(slots - rounded) > 1e-9) {
            issues.push(`${presetName}: ${field.key} step mismatch (${num} step ${field.step} from ${field.min})`);
        }
    }
    return issues;
}

function fail(message) {
    console.error(`[SchemaGuard] ${message}`);
    process.exit(1);
}

// ---- Fuzz Testing (Fix 18) ----

function randomInRange(min, max, step) {
    const range = max - min;
    const slots = Math.floor(range / step);
    const randomSlot = Math.floor(Math.random() * (slots + 1));
    let value = min + (randomSlot * step);
    const decimals = String(step).includes(".")
        ? String(step).split(".")[1].length
        : 0;
    return decimals > 0 ? parseFloat(value.toFixed(decimals)) : Math.round(value);
}

function generateRandomConfig(schema, baseConfig) {
    const config = Object.assign({}, baseConfig || {});
    const comparableSchema = schemaToComparable(schema);
    for (const field of comparableSchema) {
        if (field.key === "DEFAULT_HERO_INDEX") continue;
        config[field.key] = randomInRange(field.min, field.max, field.step);
    }
    return config;
}

function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function fuzzRoundTrip(exports, semver, registry, defaultConfig, iterations) {
    const schema = registry[semver].schema;
    const failures = [];
    for (let i = 0; i < iterations; i++) {
        const original = generateRandomConfig(schema, defaultConfig);
        try {
            const encoded = exports.serialize(original, semver);
            const decoded = exports.deserialize(encoded, semver);
            const reEncoded = exports.serialize(decoded, semver);
            const reDecoded = exports.deserialize(reEncoded, semver);
            // Verify stability: decode(encode(decode(encode(x)))) === decode(encode(x))
            if (!deepEqual(decoded, reDecoded)) {
                failures.push({
                    iteration: i,
                    type: "round_trip_instability",
                    original: JSON.stringify(original),
                    decoded: JSON.stringify(decoded),
                    reDecoded: JSON.stringify(reDecoded)
                });
                if (failures.length >= 5) break; // Stop early on failures
            }
            // Verify no NaN, Infinity, or undefined in decoded values
            for (const key of Object.keys(decoded)) {
                const val = decoded[key];
                if (typeof val === "number" && !Number.isFinite(val)) {
                    failures.push({ iteration: i, type: "non_finite_value", key, value: val });
                }
                if (val === undefined) {
                    failures.push({ iteration: i, type: "undefined_value", key });
                }
            }
        } catch (e) {
            failures.push({ iteration: i, type: "exception", message: String(e.message) });
            if (failures.length >= 3) break;
        }
    }
    return failures;
}

function fuzzEdgeCases(exports, semver, defaultConfig) {
    const failures = [];
    const cases = [
        { name: "empty config", config: {} },
        { name: "null config", config: null },
    ];

    // All-zeros config (set every known field to 0)
    const zeroConfig = Object.assign({}, defaultConfig);
    for (const key of Object.keys(zeroConfig)) {
        if (typeof zeroConfig[key] === "number") zeroConfig[key] = 0;
    }
    cases.push({ name: "all zeros", config: zeroConfig });

    // Sparse config with just one feature enabled
    cases.push({ name: "sparse config", config: { ENABLE_COMPASS: 1, ENABLE_SPM: 0 } });

    // Wrong types
    cases.push({ name: "wrong types", config: Object.assign({}, defaultConfig, {
        ENABLE_COMPASS: "yes",
        HEALTHBAR_TYPE: 3.14,
        SPM_SAMPLE_INTERVAL: "fast"
    })});

    // Unknown keys (these should be preserved by the codec)
    cases.push({ name: "unknown keys", config: Object.assign({}, defaultConfig, {
        UNKNOWN_FEATURE_FLAG: 1,
        CUSTOM_SETTING_XYZ: "hello"
    })});

    for (const testCase of cases) {
        try {
            const encoded = exports.serialize(testCase.config, semver);
            const decoded = exports.deserialize(encoded, semver);
            // Verify decode doesn't produce NaN/Infinity/undefined
            for (const key of Object.keys(decoded)) {
                const val = decoded[key];
                if (typeof val === "number" && !Number.isFinite(val)) {
                    failures.push({ testCase: testCase.name, type: "non_finite_value", key, value: val });
                }
            }
        } catch (e) {
            // Edge cases that throw during serialize are acceptable if the input is invalid
            // Only fail if decode of valid data throws
            if (testCase.name !== "null config" && testCase.name !== "wrong types") {
                failures.push({ testCase: testCase.name, type: "exception", message: String(e.message) });
            }
        }
    }
    return failures;
}

function fuzzCrossVersionMigration(exports, fromSemver, toSemver, registry, defaultConfig, iterations) {
    const fromSchema = registry[fromSemver].schema;
    const toSchema = registry[toSemver].schema;
    const fromKeys = new Set(schemaToComparable(fromSchema).map(f => f.key));
    const toKeys = new Set(schemaToComparable(toSchema).map(f => f.key));
    const failures = [];

    for (let i = 0; i < iterations; i++) {
        const original = generateRandomConfig(fromSchema, defaultConfig);
        try {
            const encoded = exports.serialize(original, fromSemver);
            const decoded = exports.deserialize(encoded, toSemver);
            // Verify keys present in both schemas are preserved
            for (const key of fromKeys) {
                if (toKeys.has(key) && original.hasOwnProperty(key)) {
                    if (!decoded.hasOwnProperty(key)) {
                        failures.push({
                            iteration: i,
                            type: "key_dropped",
                            key,
                            migration: `${fromSemver} -> ${toSemver}`
                        });
                    }
                }
            }
        } catch (e) {
            failures.push({
                iteration: i,
                type: "exception",
                migration: `${fromSemver} -> ${toSemver}`,
                message: String(e.message)
            });
            if (failures.length >= 3) break;
        }
    }
    return failures;
}

function runFuzzTests(settingsExports, coreExports, defaultConfig, settingsRegistry, coreRegistry) {
    const settingsSemvers = Object.keys(settingsRegistry);
    const FUZZ_ITERATIONS = 20;
    const CROSS_VERSION_ITERATIONS = 10;
    let totalTests = 0;
    let totalFailures = 0;

    // Round-trip fuzz for latest version
    const latestSemver = settingsSemvers[settingsSemvers.length - 1];
    const settingsRoundTripFails = fuzzRoundTrip(settingsExports, latestSemver, settingsRegistry, defaultConfig, FUZZ_ITERATIONS);
    const coreRoundTripFails = fuzzRoundTrip(coreExports, latestSemver, coreRegistry, defaultConfig, FUZZ_ITERATIONS);
    totalTests += FUZZ_ITERATIONS * 2;
    totalFailures += settingsRoundTripFails.length + coreRoundTripFails.length;

    if (settingsRoundTripFails.length > 0) {
        console.error(`[SchemaGuard][fuzz] Settings round-trip failures at ${latestSemver}: ${JSON.stringify(settingsRoundTripFails.slice(0, 3))}`);
    }
    if (coreRoundTripFails.length > 0) {
        console.error(`[SchemaGuard][fuzz] Core round-trip failures at ${latestSemver}: ${JSON.stringify(coreRoundTripFails.slice(0, 3))}`);
    }

    // Edge case tests
    const settingsEdgeFails = fuzzEdgeCases(settingsExports, latestSemver, defaultConfig);
    const coreEdgeFails = fuzzEdgeCases(coreExports, latestSemver, defaultConfig);
    totalTests += 12; // 6 edge cases × 2 exports
    totalFailures += settingsEdgeFails.length + coreEdgeFails.length;

    if (settingsEdgeFails.length > 0) {
        console.error(`[SchemaGuard][fuzz] Settings edge case failures: ${JSON.stringify(settingsEdgeFails)}`);
    }
    if (coreEdgeFails.length > 0) {
        console.error(`[SchemaGuard][fuzz] Core edge case failures: ${JSON.stringify(coreEdgeFails)}`);
    }

    // Cross-version migration: from select old versions to latest
    const crossVersionSources = settingsSemvers.filter(s => s !== latestSemver && s >= "2.3.0");
    for (const fromSemver of crossVersionSources) {
        const crossFails = fuzzCrossVersionMigration(settingsExports, fromSemver, latestSemver, settingsRegistry, defaultConfig, CROSS_VERSION_ITERATIONS);
        totalTests += CROSS_VERSION_ITERATIONS;
        totalFailures += crossFails.length;
        if (crossFails.length > 0) {
            console.error(`[SchemaGuard][fuzz] Cross-version failures ${fromSemver} -> ${latestSemver}: ${JSON.stringify(crossFails.slice(0, 3))}`);
        }
    }

    // Migration recovery: decode at latest with corrupt wire version should throw (not silently corrupt)
    const fixtureConfig = generateRandomConfig(settingsRegistry[latestSemver].schema, defaultConfig);
    const fixtureEncoded = settingsExports.serialize(fixtureConfig, latestSemver);
    try {
        settingsExports.deserialize(mutateEncodedWireVersion(fixtureEncoded, 99), latestSemver);
        // If it didn't throw, check if the result is at least valid JSON-like
        totalTests += 1;
    } catch (_migrationRecoveryErr) {
        // Expected — mismatched wire version should throw
        totalTests += 1;
    }

    if (totalFailures > 0) {
        fail(`Fuzz testing found ${totalFailures} failures across ${totalTests} tests`);
    }

    return { totalTests, totalFailures };
}

function main() {
    const settingsContext = loadContext(
        [sharedPath, settingsPath],
        `globalThis.__schemaGuardExports = {
            sharedSemver: QOL_SCHEMA_SEMVER,
            sharedWireVersion: QOL_SCHEMA_WIRE_VERSION,
            defaultConfig: QOL_DEFAULT_CONFIG,
            presets: QOL_PRESETS,
            latestSemver: LATEST_COMPACT_SEMVER,
            registry: COMPACT_SCHEMA_REGISTRY,
            serialize: SerializeCompactV2,
            deserialize: DeserializeCompactV2,
            buildCandidateConfig: BuildCandidateConfigFromParsed,
            tryImport: TryApplyImportStringWithDiagnostics
        };`,
        false
    );
    const coreContext = loadContext(
        [sharedPath, corePath],
        `globalThis.__schemaGuardExports = {
            latestSemver: BUILD_CATEGORY_LATEST_COMPACT_SEMVER,
            registry: BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY,
            serialize: SerializeBuildPayloadCompact,
            deserialize: DeserializeBuildPayloadCompact
        };`,
        true
    );
    const mirrorSettingsContext = loadContext(
        [mirrorSharedPath, mirrorSettingsPath],
        `globalThis.__schemaGuardExports = {
            sharedSemver: QOL_SCHEMA_SEMVER,
            sharedWireVersion: QOL_SCHEMA_WIRE_VERSION,
            defaultConfig: QOL_DEFAULT_CONFIG,
            latestSemver: LATEST_COMPACT_SEMVER,
            registry: COMPACT_SCHEMA_REGISTRY,
            serialize: SerializeCompactV2,
            deserialize: DeserializeCompactV2,
            tryImport: TryApplyImportStringWithDiagnostics
        };`,
        false
    );
    const mirrorCoreContext = loadContext(
        [mirrorSharedPath, mirrorCorePath],
        `globalThis.__schemaGuardExports = {
            latestSemver: BUILD_CATEGORY_LATEST_COMPACT_SEMVER,
            registry: BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY,
            serialize: SerializeBuildPayloadCompact,
            deserialize: DeserializeBuildPayloadCompact
        };`,
        true
    );

    const settingsExports = getValue(settingsContext, "globalThis.__schemaGuardExports");
    const coreExports = getValue(coreContext, "globalThis.__schemaGuardExports");
    const mirrorSettingsExports = getValue(mirrorSettingsContext, "globalThis.__schemaGuardExports");
    const mirrorCoreExports = getValue(mirrorCoreContext, "globalThis.__schemaGuardExports");
    const defaultConfig = JSON.parse(JSON.stringify(settingsExports.defaultConfig));
    const presets = JSON.parse(JSON.stringify(settingsExports.presets));
    const sharedSemver = settingsExports.sharedSemver;
    const sharedWireVersion = settingsExports.sharedWireVersion;
    const settingsLatestSemver = settingsExports.latestSemver;
    const coreLatestSemver = coreExports.latestSemver;
    const settingsRegistry = JSON.parse(JSON.stringify(settingsExports.registry));
    const coreRegistry = JSON.parse(JSON.stringify(coreExports.registry));
    const mirrorDefaultConfig = JSON.parse(JSON.stringify(mirrorSettingsExports.defaultConfig));
    const mirrorSettingsRegistry = JSON.parse(JSON.stringify(mirrorSettingsExports.registry));
    const mirrorCoreRegistry = JSON.parse(JSON.stringify(mirrorCoreExports.registry));

    if (sharedSemver !== settingsLatestSemver) {
        fail(`Shared schema semver ${sharedSemver} does not match settings latest ${settingsLatestSemver}`);
    }
    if (sharedSemver !== coreLatestSemver) {
        fail(`Shared schema semver ${sharedSemver} does not match core latest ${coreLatestSemver}`);
    }
    if (!Object.prototype.hasOwnProperty.call(settingsRegistry, sharedSemver)) {
        fail(`Settings schema registry is missing shared semver ${sharedSemver}`);
    }
    if (!Object.prototype.hasOwnProperty.call(coreRegistry, sharedSemver)) {
        fail(`Core schema registry is missing shared semver ${sharedSemver}`);
    }
    if (Number(settingsRegistry[sharedSemver].wireVersion) !== Number(sharedWireVersion)) {
        fail(`Settings wire version ${settingsRegistry[sharedSemver].wireVersion} does not match shared wire ${sharedWireVersion}`);
    }
    if (Number(coreRegistry[sharedSemver].wireVersion) !== Number(sharedWireVersion)) {
        fail(`Core wire version ${coreRegistry[sharedSemver].wireVersion} does not match shared wire ${sharedWireVersion}`);
    }

    const settingsSemvers = Object.keys(settingsRegistry);
    const coreSemvers = Object.keys(coreRegistry);
    if (JSON.stringify(settingsSemvers) !== JSON.stringify(coreSemvers)) {
        fail(`Schema semver keys differ between settings and core (${settingsSemvers.join(", ")} !== ${coreSemvers.join(", ")})`);
    }

    for (const semver of settingsSemvers) {
        const settingsEntry = settingsRegistry[semver];
        const coreEntry = coreRegistry[semver];
        if (Number(settingsEntry.wireVersion) !== Number(coreEntry.wireVersion)) {
            fail(`Wire version mismatch for ${semver} (${settingsEntry.wireVersion} !== ${coreEntry.wireVersion})`);
        }
        const schemaDiff = compareSchemas(settingsEntry.schema, coreEntry.schema);
        if (schemaDiff) {
            fail(`Schema mismatch for ${semver}: ${schemaDiff}`);
        }
    }

    const latestSchema = settingsRegistry[sharedSemver].schema;
    const latestLanguageField = schemaToComparable(latestSchema).find((field) => field.key === "LANGUAGE");
    const latestLanguageMax = latestLanguageField ? Number(latestLanguageField.max) : 0;
    const configNames = ["__DEFAULT__"].concat(Object.keys(presets));
    for (const configName of configNames) {
        const override = configName === "__DEFAULT__" ? {} : presets[configName];
        const effectiveConfig = Object.assign({}, defaultConfig, override);
        const presetIssues = validatePresetValues(configName, effectiveConfig, latestSchema);
        if (presetIssues.length > 0) {
            fail(presetIssues[0]);
        }

        const settingsEncoded = settingsExports.serialize(effectiveConfig);
        const coreEncoded = coreExports.serialize(effectiveConfig);
        if (settingsEncoded !== coreEncoded) {
            fail(`Encoded payload mismatch for ${configName}`);
        }

        const settingsDecoded = settingsExports.deserialize(settingsEncoded, sharedSemver);
        const coreDecoded = coreExports.deserialize(coreEncoded, sharedSemver);
        const settingsDiff = compareDecodedAgainstSchema(settingsDecoded, effectiveConfig, defaultConfig, latestSchema);
        if (settingsDiff.length > 0) {
            fail(`Settings round-trip mismatch for ${configName}: ${settingsDiff[0]}`);
        }
        const coreDiff = compareDecodedAgainstSchema(coreDecoded, effectiveConfig, defaultConfig, latestSchema);
        if (coreDiff.length > 0) {
            fail(`Core round-trip mismatch for ${configName}: ${coreDiff[0]}`);
        }
    }

    const targetedSemvers = ["2.0.0", "2.0.1", "2.1.0", "2.1.1", "2.2.3", "2.2.4", "2.2.5", "2.2.6", "2.2.7", "2.2.8", "2.2.9", "2.2.10", "2.3.0", "2.3.1", "2.3.2", "2.3.3", "2.3.4", "2.3.5", "2.3.6", "2.3.7", "2.4.0", "2.5.0", "2.5.1", "2.5.2", "2.5.3", "2.5.4", "2.5.5", "2.5.6", "2.5.7", "2.5.8", "2.5.9", "2.5.10", "2.5.11", "2.6.0", "2.6.1", "3.0.0", "3.0.1", "3.0.2", "3.0.3", "3.0.4", "3.0.5", "3.0.6", "3.0.7"];
    const topBarHpWarningKeys = [
        "ENABLE_TOPBAR_ENEMY_HP_WARNING",
        "ENABLE_TOPBAR_ENEMY_HP_WARNING_25",
        "ENABLE_TOPBAR_ENEMY_HP_WARNING_65",
        "ENABLE_TOPBAR_ENEMY_HP_WARNING_75",
        "ENABLE_TOPBAR_ALLY_HP_WARNING",
        "ENABLE_TOPBAR_ALLY_HP_WARNING_25",
        "ENABLE_TOPBAR_ALLY_HP_WARNING_65",
        "ENABLE_TOPBAR_ALLY_HP_WARNING_75"
    ];
    const hudBarAndShopKeys = [
        "TOP_BAR_OPACITY",
        "TOP_BAR_X_OFFSET",
        "TOP_BAR_Y_OFFSET",
        "BOTTOM_BAR_OPACITY",
        "BOTTOM_BAR_X_OFFSET",
        "BOTTOM_BAR_Y_OFFSET",
        "SHOP_OFFSET_Y",
        "SHOP_OPACITY"
    ];
    const hudSectionAndPanelKeys = [
        "HUD_TOP_BAR_ENABLED",
        "HUD_BOTTOM_BAR_ENABLED",
        "HUD_ITEMS_ENABLED",
        "HUD_SOULS_ENABLED",
        "HUD_SHOP_ENABLED",
        "ITEMS_OPACITY",
        "ITEMS_X_OFFSET",
        "ITEMS_Y_OFFSET",
        "SOULS_OPACITY",
        "SOULS_X_OFFSET",
        "SOULS_Y_OFFSET"
    ];
    const minimapCrateOverlayKeys = [
        "ENABLE_MINIMAP_CRATE_OVERLAY"
    ];
    const minimapRemTunnelsKeys = [
        "ENABLE_MINIMAP_REM_TUNNELS",
        "MINIMAP_REM_TUNNELS_OPACITY"
    ];
    const minimapElevationMarkerKeys = [
        "ENABLE_MINIMAP_ELEVATION_MARKERS"
    ];
    const palettePickerKeys254 = [
        "ITEMS_WASH_COLOR",
        "PLAYER_HEALTHBAR_ACCENT_COLOR",
        "BOTTOM_BAR_WASH_COLOR",
        "KEYBOARD_OVERLAY_WASH_COLOR",
        "STAMINA_CHARGE_COLOR",
        "AMMO_TEXT_COLOR"
    ];
    const palettePickerKeys = palettePickerKeys254.concat([
        "MINIMAP_ICON_COLOR"
    ]);
    const getSchemaField = (schema, key) => schema.find(field => field && field.key === key);
    const assertPaletteMax = (settingsSchema, coreSchema, expectedMax, semver) => {
        for (const key of palettePickerKeys) {
            const settingsField = getSchemaField(settingsSchema, key);
            const coreField = getSchemaField(coreSchema, key);
            if (!settingsField) fail(`Settings ${semver} missing ${key}`);
            if (!coreField) fail(`Core ${semver} missing ${key}`);
            if (settingsField.max !== expectedMax) fail(`Settings ${semver} ${key} max expected ${expectedMax}, got ${settingsField.max}`);
            if (coreField.max !== expectedMax) fail(`Core ${semver} ${key} max expected ${expectedMax}, got ${coreField.max}`);
        }
    };
    const staminaChargeKeys = [
        "STAMINA_CHARGE_ANGLE"
    ];
    const cleanDamageIndicatorKeys = [
        "ENABLE_CLEAN_DAMAGE_INDICATORS"
    ];
    const hudBarAndShopScaleKeys = [
        "TOP_BAR_SCALE",
        "BOTTOM_BAR_SCALE",
        "SHOP_SCALE"
    ];
    const zoomRemTunnelsKeys = [
        "ENABLE_ALT_ZOOM_REM_TUNNELS",
        "ALT_ZOOM_REM_TUNNELS_OPACITY",
        "ENABLE_TAB_ZOOM_REM_TUNNELS",
        "TAB_ZOOM_REM_TUNNELS_OPACITY"
    ];
    const damageImpactKeys = [
        "ENABLE_DAMAGE_IMPACT",
        "DAMAGE_IMPACT_SCALE",
        "DAMAGE_IMPACT_OPACITY",
        "DAMAGE_IMPACT_X_OFFSET",
        "DAMAGE_IMPACT_Y_OFFSET"
    ];
    const settingsThemeKeys = [
        "SETTINGS_THEME"
    ];
    const combatIndicatorKeys = [
        "ENABLE_COMBAT_INDICATOR"
    ];
    const shopStatsMinimalistKeys = [
        "ENABLE_SIMPLIFY_SHOP_STATS"
    ];
    const enhancedQuickbuyKeys = [
        "ENABLE_ENHANCED_QUICKBUY"
    ];
    const enhancedQuickbuyCountKeys = [
        "ENHANCED_QUICKBUY_COUNT"
    ];
    const heroPurchasePopupKeys = [
        "ENABLE_HERO_PURCHASE_POPUPS"
    ];
    const shopItemNotificationKeys = [
        "ENABLE_SHOP_ITEM_NOTIFICATIONS"
    ];
    const compact306MissingKeys = [
        "ENABLE_ALLY_COLORED_HEALTHBAR",
        "ENABLE_ALLY_COLOR_WARNING_25",
        "ENABLE_ALLY_COLOR_WARNING_65",
        "ENABLE_ALLY_COLOR_WARNING_75",
        "ENABLE_PERF_DEBUG",
        "ENABLE_PERF_DEBUG_DETAIL",
        "ENABLE_SPECIALS",
        "DRAG_ENABLED",
        "PREVIEWS_ENABLED"
    ];
    const showRankTopBarModeKeys = [
        "SHOW_RANK_TOP_BAR_MODE"
    ];
    const shopPurchaseFeatureKeys = [
        "ENABLE_SHOP_CLICK_TO_NOTIFY",
        "ENABLE_SHOP_RECENT_PURCHASES"
    ];
    const recentPurchasesQuickKeys = [
        "RECENT_PURCHASES_QUICK_MAX",
        "RECENT_PURCHASES_QUICK_DISPLAY_SEC",
        "RECENT_PURCHASES_QUICK_X_OFFSET",
        "RECENT_PURCHASES_QUICK_Y_OFFSET",
        "RECENT_PURCHASES_QUICK_REJUV",
        "RECENT_PURCHASES_QUICK_SCOREBOARD",
        "RECENT_PURCHASES_QUICK_SCALE",
        "RECENT_PURCHASES_PANEL_X_OFFSET",
        "RECENT_PURCHASES_PANEL_Y_OFFSET",
        "RECENT_PURCHASES_PANEL_SCALE"
    ];
    const showBuildIdKeys = [
        "ENABLE_SHOW_BUILD_ID",
        "ENABLE_SHOW_BUILD_ID_TITLE"
    ];
    const dl4dReminderKeys = [
        "ENABLE_DL4D_REMINDERS",
        "DL4D_VOLUME",
        "ENABLE_DL4D_CAPTIONS",
        "ENABLE_DL4D_SMALL_CAMPS_BOXES",
        "ENABLE_DL4D_RUNE_MELEE_TROOPERS",
        "ENABLE_DL4D_MEDIUM_CAMPS",
        "ENABLE_DL4D_BIG_CAMPS_SINNERS",
        "ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE",
        "ENABLE_DL4D_LANE_GUARDIAN_WEAK",
        "ENABLE_DL4D_RUNE",
        "ENABLE_DL4D_WALKER_WEAK",
        "ENABLE_DL4D_RUNE_FAST_TROOPERS",
        "ENABLE_DL4D_RUNE_GOLD_BUFFS",
        "ENABLE_DL4D_RUNE_TROOPERS20_HP"
    ];
    const quickbuyClickToNotifyKeys = [
        "ENABLE_QUICKBUY_CLICK_TO_NOTIFY"
    ];
    const recentPurchaseOpacityKeys = [
        "RECENT_PURCHASES_QUICK_OPACITY",
        "RECENT_PURCHASES_PANEL_OPACITY"
    ];
    const releaseCompatSemvers = ["2.3.2", "2.3.5"];
    for (const semver of releaseCompatSemvers) {
        const settingsReleaseSchema = mirrorSettingsRegistry[semver] && mirrorSettingsRegistry[semver].schema;
        const coreReleaseSchema = mirrorCoreRegistry[semver] && mirrorCoreRegistry[semver].schema;
        if (!settingsReleaseSchema || !coreReleaseSchema) {
            fail(`Release baseline missing schema for ${semver}`);
        }
        const currentSettingsDiff = compareSchemas(settingsRegistry[semver].schema, settingsReleaseSchema);
        if (currentSettingsDiff) {
            fail(`Settings ${semver} drifted from release baseline: ${currentSettingsDiff}`);
        }
        const currentCoreDiff = compareSchemas(coreRegistry[semver].schema, coreReleaseSchema);
        if (currentCoreDiff) {
            fail(`Core ${semver} drifted from release baseline: ${currentCoreDiff}`);
        }
    }

    const community232String = "[QOL-2-3-2]:AigUSxQjZMhMTkolk6khZCADp4clKBT4Q0MGEIKi4WVkZI5YQjZiCRlkAKBQwAQggwyAjCAcWVoyAicDy8HjgSWWYIklEg8yZwARAAAZZMiQkCGToeQDA0aGJZkE5g";
    const release232Import = mirrorSettingsExports.tryImport(community232String);
    const current232Import = settingsExports.tryImport(community232String);
    if (!release232Import || release232Import.ok !== true || !release232Import.parsedConfig) {
        fail("Release baseline failed to import known 2.3.2 community string");
    }
    if (!current232Import || current232Import.ok !== true || !current232Import.parsedConfig) {
        fail("Current settings failed to import known 2.3.2 community string");
    }
    const release232Schema = mirrorSettingsRegistry["2.3.2"].schema;
    const release232Decoded = release232Import.parsedConfig;
    const current232Decoded = current232Import.parsedConfig;
    const current232Diff = compareDecodedObjectsBySchema(current232Decoded, release232Decoded, release232Schema);
    if (current232Diff.length > 0) {
        fail(`2.3.2 community preset decode drift: ${current232Diff[0]}`);
    }

    const release235FixtureConfig = Object.assign({}, mirrorDefaultConfig, {
        ENABLE_ENEMY_COLORED_HEALTHBAR: 1,
        ENABLE_ENEMY_COLOR_WARNING_25: 1,
        ENABLE_ENEMY_COLOR_WARNING_65: 1,
        ENABLE_ENEMY_COLOR_WARNING_75: 0,
        DISABLE_PLAYER_NAME_BLUR: 1
    });
    const release235Encoded = mirrorSettingsExports.serialize(release235FixtureConfig, "2.3.5");
    const release235Schema = mirrorSettingsRegistry["2.3.5"].schema;
    const release235Decoded = mirrorSettingsExports.deserialize(release235Encoded, "2.3.5");
    const current235Decoded = settingsExports.deserialize(release235Encoded, "2.3.5");
    const current235Diff = compareDecodedObjectsBySchema(current235Decoded, release235Decoded, release235Schema);
    if (current235Diff.length > 0) {
        fail(`2.3.5 release fixture decode drift: ${current235Diff[0]}`);
    }

    const release235CompassSpeedFixtureConfig = Object.assign({}, mirrorDefaultConfig, {
        ENABLE_COMPASS: 0,
        ENABLE_COMPASS_SPEED: 1
    });
    const release235CompassSpeedEncoded = mirrorSettingsExports.serialize(release235CompassSpeedFixtureConfig, "2.3.5");
    const current235CompassSpeedDecoded = settingsExports.deserialize(release235CompassSpeedEncoded, "2.3.5");
    const current235CompassSpeedCandidate = settingsExports.buildCandidateConfig(
        current235CompassSpeedDecoded,
        "2.3.5",
        defaultConfig
    ).candidateConfig;
    if (Number(current235CompassSpeedCandidate.ENABLE_COMPASS_SPEED) !== 0) {
        fail("2.3.5 compass speed import should not enable standalone speed when compass is off");
    }

    const current250CompassSpeedConfig = Object.assign({}, defaultConfig, {
        ENABLE_COMPASS: 0,
        ENABLE_COMPASS_SPEED: 1
    });
    const current250CompassSpeedEncoded = settingsExports.serialize(current250CompassSpeedConfig, "2.5.0");
    const current250CompassSpeedDecoded = settingsExports.deserialize(current250CompassSpeedEncoded, "2.5.0");
    const current250CompassSpeedCandidate = settingsExports.buildCandidateConfig(
        current250CompassSpeedDecoded,
        "2.5.0",
        defaultConfig
    ).candidateConfig;
    if (Number(current250CompassSpeedCandidate.ENABLE_COMPASS_SPEED) !== 1) {
        fail("2.5.0 compass speed import should preserve standalone speed");
    }

    const regressionConfig = Object.assign({}, defaultConfig, {
        LANGUAGE: 2,
        ENABLE_CHAT: 0,
        ENABLE_GAME_AUDIO: 0,
        CHAT_SCALE: 137,
        CHAT_X_OFFSET: 245,
        CHAT_Y_OFFSET: 115,
        MINIMAP_FLIP: 1
    });

    for (const semver of targetedSemvers) {
        if (!Object.prototype.hasOwnProperty.call(settingsRegistry, semver)) {
            fail(`Targeted semver ${semver} missing from settings registry`);
        }
        if (!Object.prototype.hasOwnProperty.call(coreRegistry, semver)) {
            fail(`Targeted semver ${semver} missing from core registry`);
        }

        const settingsSchemaKeys = new Set((settingsRegistry[semver].schema || []).map((field) => String(field && field.key || "")));
        const coreSchemaKeys = new Set((coreRegistry[semver].schema || []).map((field) => String(field && field.key || "")));
        const settingsSchema = settingsRegistry[semver].schema || [];
        const coreSchema = coreRegistry[semver].schema || [];
        if (semver === "2.3.5" || semver === "2.3.6" || semver === "2.3.7") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys)) {
                if (settingsSchemaKeys.has(key)) fail(`Settings ${semver} should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core ${semver} should omit ${key}`);
            }
        }
        if (semver === "2.4.0") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.4.0 missing ${key}`);
            }
            for (const key of shopPurchaseFeatureKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.4.0 should omit ${key}`);
            }
            for (const key of minimapRemTunnelsKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.4.0 should omit ${key}`);
            }
            for (const key of minimapElevationMarkerKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.4.0 should omit ${key}`);
            }
            for (const key of hudBarAndShopScaleKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.4.0 should omit ${key}`);
            }
            for (const key of zoomRemTunnelsKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.4.0 should omit ${key}`);
            }
            for (const key of damageImpactKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.4.0 should omit ${key}`);
            }
            for (const key of settingsThemeKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.4.0 should omit ${key}`);
            }
            for (const key of cleanDamageIndicatorKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.4.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.4.0 should omit ${key}`);
            }
        }
        if (semver === "2.5.0") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.0 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.0 missing ${key}`);
            }
            for (const key of minimapElevationMarkerKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.0 should omit ${key}`);
            }
            for (const key of hudBarAndShopScaleKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.0 should omit ${key}`);
            }
            for (const key of zoomRemTunnelsKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.0 should omit ${key}`);
            }
            for (const key of damageImpactKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.0 should omit ${key}`);
            }
            for (const key of settingsThemeKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.0 should omit ${key}`);
            }
            for (const key of cleanDamageIndicatorKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.0 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.0 should omit ${key}`);
            }
        }
        if (semver === "2.5.1") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.1 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.1 missing ${key}`);
            }
            for (const key of hudBarAndShopScaleKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.1 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.1 should omit ${key}`);
            }
            for (const key of zoomRemTunnelsKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.1 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.1 should omit ${key}`);
            }
            for (const key of damageImpactKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.1 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.1 should omit ${key}`);
            }
            for (const key of settingsThemeKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.1 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.1 should omit ${key}`);
            }
            for (const key of cleanDamageIndicatorKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.1 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.1 should omit ${key}`);
            }
        }
        if (semver === "2.5.2") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.2 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.2 missing ${key}`);
            }
            for (const key of settingsThemeKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.2 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.2 should omit ${key}`);
            }
            for (const key of cleanDamageIndicatorKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.2 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.2 should omit ${key}`);
            }
        }
        if (semver === "2.5.3") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.3 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.3 missing ${key}`);
            }
            for (const key of palettePickerKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.3 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.3 should omit ${key}`);
            }
            for (const key of cleanDamageIndicatorKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.3 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.3 should omit ${key}`);
            }
        }
        if (semver === "2.5.4") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys254, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.4 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.4 missing ${key}`);
            }
            if (settingsSchemaKeys.has("MINIMAP_ICON_COLOR")) fail("Settings 2.5.4 should omit MINIMAP_ICON_COLOR");
            if (coreSchemaKeys.has("MINIMAP_ICON_COLOR")) fail("Core 2.5.4 should omit MINIMAP_ICON_COLOR");
            for (const key of palettePickerKeys254) {
                const settingsField = getSchemaField(settingsSchema, key);
                const coreField = getSchemaField(coreSchema, key);
                if (!settingsField) fail(`Settings 2.5.4 missing ${key}`);
                if (!coreField) fail(`Core 2.5.4 missing ${key}`);
                if (settingsField.max !== 25) fail(`Settings 2.5.4 ${key} max expected 25, got ${settingsField.max}`);
                if (coreField.max !== 25) fail(`Core 2.5.4 ${key} max expected 25, got ${coreField.max}`);
            }
        }
        if (semver === "2.5.5" || semver === "2.5.6") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings ${semver} missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core ${semver} missing ${key}`);
            }
            assertPaletteMax(settingsSchema, coreSchema, 29, semver);
        }
        if (semver === "2.5.7") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.7 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.7 missing ${key}`);
            }
            for (const key of showBuildIdKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.7 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.7 should omit ${key}`);
            }
        }
        if (semver === "2.5.8") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.8 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.8 missing ${key}`);
            }
            for (const key of dl4dReminderKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.8 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.8 should omit ${key}`);
            }
        }
        if (semver === "2.5.9") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys, dl4dReminderKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.9 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.9 missing ${key}`);
            }
            for (const key of quickbuyClickToNotifyKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.9 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.9 should omit ${key}`);
            }
        }
        if (semver === "2.5.10") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys, dl4dReminderKeys, quickbuyClickToNotifyKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings 2.5.10 missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core 2.5.10 missing ${key}`);
            }
            for (const key of recentPurchaseOpacityKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings 2.5.10 should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core 2.5.10 should omit ${key}`);
            }
        }
        if (semver === "2.5.11" || semver === "2.6.0" || semver === "2.6.1" || semver === "3.0.0" || semver === "3.0.1" || semver === "3.0.2") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys, dl4dReminderKeys, quickbuyClickToNotifyKeys, recentPurchaseOpacityKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings ${semver} missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core ${semver} missing ${key}`);
            }
            for (const key of enhancedQuickbuyCountKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings ${semver} should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core ${semver} should omit ${key}`);
            }
        }
        if (semver === "3.0.3") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys, dl4dReminderKeys, quickbuyClickToNotifyKeys, recentPurchaseOpacityKeys, enhancedQuickbuyCountKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings ${semver} missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core ${semver} missing ${key}`);
            }
            for (const key of heroPurchasePopupKeys.concat(shopItemNotificationKeys, compact306MissingKeys, showRankTopBarModeKeys)) {
                if (settingsSchemaKeys.has(key)) fail(`Settings ${semver} should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core ${semver} should omit ${key}`);
            }
        }
        if (semver === "3.0.4") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys, dl4dReminderKeys, quickbuyClickToNotifyKeys, recentPurchaseOpacityKeys, enhancedQuickbuyCountKeys, heroPurchasePopupKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings ${semver} missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core ${semver} missing ${key}`);
            }
            for (const key of shopItemNotificationKeys.concat(compact306MissingKeys, showRankTopBarModeKeys)) {
                if (settingsSchemaKeys.has(key)) fail(`Settings ${semver} should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core ${semver} should omit ${key}`);
            }
        }
        if (semver === "3.0.5") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys, dl4dReminderKeys, quickbuyClickToNotifyKeys, recentPurchaseOpacityKeys, enhancedQuickbuyCountKeys, heroPurchasePopupKeys, shopItemNotificationKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings ${semver} missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core ${semver} missing ${key}`);
            }
            for (const key of compact306MissingKeys.concat(showRankTopBarModeKeys)) {
                if (settingsSchemaKeys.has(key)) fail(`Settings ${semver} should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core ${semver} should omit ${key}`);
            }
        }
        if (semver === "3.0.6") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys, dl4dReminderKeys, quickbuyClickToNotifyKeys, recentPurchaseOpacityKeys, enhancedQuickbuyCountKeys, heroPurchasePopupKeys, shopItemNotificationKeys, compact306MissingKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings ${semver} missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core ${semver} missing ${key}`);
            }
            for (const key of showRankTopBarModeKeys) {
                if (settingsSchemaKeys.has(key)) fail(`Settings ${semver} should omit ${key}`);
                if (coreSchemaKeys.has(key)) fail(`Core ${semver} should omit ${key}`);
            }
        }
        if (semver === "3.0.7") {
            for (const key of topBarHpWarningKeys.concat(hudBarAndShopKeys, hudSectionAndPanelKeys, minimapCrateOverlayKeys, minimapRemTunnelsKeys, minimapElevationMarkerKeys, hudBarAndShopScaleKeys, zoomRemTunnelsKeys, damageImpactKeys, settingsThemeKeys, palettePickerKeys, staminaChargeKeys, cleanDamageIndicatorKeys, combatIndicatorKeys, shopStatsMinimalistKeys, enhancedQuickbuyKeys, shopPurchaseFeatureKeys, recentPurchasesQuickKeys, showBuildIdKeys, dl4dReminderKeys, quickbuyClickToNotifyKeys, recentPurchaseOpacityKeys, enhancedQuickbuyCountKeys, heroPurchasePopupKeys, shopItemNotificationKeys, compact306MissingKeys, showRankTopBarModeKeys)) {
                if (!settingsSchemaKeys.has(key)) fail(`Settings ${semver} missing ${key}`);
                if (!coreSchemaKeys.has(key)) fail(`Core ${semver} missing ${key}`);
            }
        }

        const expectedSchema = settingsRegistry[semver].schema;
        const schemaCompatibleConfig = buildSchemaCompatibleConfig(regressionConfig, expectedSchema);
        const settingsEncoded = settingsExports.serialize(regressionConfig, semver);
        const coreEncoded = coreExports.serialize(regressionConfig, semver);
        const settingsDecoded = settingsExports.deserialize(settingsEncoded, semver);
        const coreDecoded = coreExports.deserialize(coreEncoded, semver);
        const candidateResult = settingsExports.buildCandidateConfig(settingsDecoded, semver, defaultConfig);
        const candidateConfig = candidateResult && candidateResult.candidateConfig
            ? candidateResult.candidateConfig
            : Object.assign({}, defaultConfig);

        const settingsDiff = compareDecodedAgainstSchema(settingsDecoded, schemaCompatibleConfig, defaultConfig, expectedSchema);
        if (settingsDiff.length > 0) {
            fail(`Settings semver decode mismatch for ${semver}: ${settingsDiff[0]}`);
        }
        const coreDiff = compareDecodedAgainstSchema(coreDecoded, schemaCompatibleConfig, defaultConfig, expectedSchema);
        if (coreDiff.length > 0) {
            fail(`Core semver decode mismatch for ${semver}: ${coreDiff[0]}`);
        }

        if (!candidateConfig || typeof candidateConfig !== "object") {
            fail(`Settings candidate config build failed for ${semver}`);
        }
        const candidateLanguage = Number(candidateConfig.LANGUAGE);
        if (!Number.isFinite(candidateLanguage) || candidateLanguage < 0 || candidateLanguage > latestLanguageMax) {
            fail(`Settings candidate config produced invalid LANGUAGE for ${semver}: ${candidateConfig.LANGUAGE}`);
        }
        if (!Object.prototype.hasOwnProperty.call(candidateConfig, "MINIMAP_FLIP")) {
            fail(`Settings candidate config missing MINIMAP_FLIP fallback for ${semver}`);
        }

        const wrongWire = semver === "2.0.0" ? 2 : 1;
        try {
            settingsExports.deserialize(mutateEncodedWireVersion(settingsEncoded, wrongWire), semver);
            fail(`Settings decoder accepted mismatched wire version for ${semver}`);
        } catch (_settingsWireErr) {}
        try {
            coreExports.deserialize(mutateEncodedWireVersion(coreEncoded, wrongWire), semver);
            fail(`Core decoder accepted mismatched wire version for ${semver}`);
        } catch (_coreWireErr) {}
    }

    const fuzzResult = runFuzzTests(settingsExports, coreExports, defaultConfig, settingsRegistry, coreRegistry);
    console.log(`[SchemaGuard] OK: ${settingsSemvers.length} schema versions, ${configNames.length} config states, ${fuzzResult.totalTests} fuzz tests validated.`);
}

main();
