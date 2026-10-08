// =============================================================================
// QOLLOCK — core/ql_config_store.js
// =============================================================================
// OWNS:        Schema-validated configuration storage: registerSchema, get, set,
//              all, hasSchema, load, syncFromExternal. Type validation for
//              toggle, slider, dropdown, text, palette. Emits config:changed.
// DOES NOT OWN: Persistence (storage_adapter), UI rendering (settings_renderer),
//               Feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js (QOL.core), core/ql_event_bus.js (EventBus)
// USED BY:     Feature manifests (context.config), settings renderer
// LOAD ORDER:  6th — after ql_panel_helpers.js
//
// Boundary validation: Checks QOL.core and EventBus exist.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q?.core) {
        $.Msg("[QOLLock] core/ql_config_store: QOL.core not found — aborting.");
        return;
    }
    const EventBus = Q.core.EventBus;
    if (!EventBus) {
        $.Msg("[QOLLock] core/ql_config_store: EventBus not found — aborting. Is core/ql_event_bus.js loaded first?");
        return;
    }

    const schemas = {};
    const values = {};
    const persistentOwners = new Map();
    const persistentDefinitions = new Map();
    const persistentValues = new Map();
    const VALID_TYPES = ["toggle", "slider", "dropdown", "text", "palette", "action", "number", "buttongroup", "multitoggle"];
    let catalogSource = null;
    let catalog = new Map();
    const canonicalSetting = setting => {
        if (catalogSource !== Q.settingsFields) {
            catalogSource = Q.settingsFields;
            catalog = new Map((catalogSource || []).map(field => [field.key, field]));
        }
        const result = { ...setting };
        const defaults = typeof QOL_DEFAULT_CONFIG === "object" ? QOL_DEFAULT_CONFIG : {};
        if (Object.prototype.hasOwnProperty.call(defaults, setting.key)) {
            result.default = setting.type === "toggle" ? defaults[setting.key] === 1 || defaults[setting.key] === true : defaults[setting.key];
        }
        const field = catalog.get(setting.key);
        if (field && (setting.type === "slider" || setting.type === "number")) {
            result.type = "slider";
            for (const key of ["min", "max", "step"]) result[key] = field[key];
            const fraction = String(field.step).split(".")[1];
            result.decimals = fraction ? fraction.length : 0;
        }
        if (setting.type === "multitoggle" && Array.isArray(setting.options)) {
            result.options = setting.options.map(option => ({ ...option,
                default: Object.prototype.hasOwnProperty.call(defaults, option.key) ? defaults[option.key] === 1 || defaults[option.key] === true : !!option.default }));
        }
        return result;
    };

    const validateSetting = (schemaEntry) => {
        if (!schemaEntry || typeof schemaEntry.key !== "string") return "key must be a string";
        if (!VALID_TYPES.includes(schemaEntry.type)) return `type must be: ${VALID_TYPES.join(", ")}`;
        if (schemaEntry.type === "multitoggle") {
            if (!Array.isArray(schemaEntry.options) || schemaEntry.options.length === 0) {
                return "multitoggle options must be a non-empty array";
            }
            return null;
        }
        if (!Object.prototype.hasOwnProperty.call(schemaEntry, "default")) return "default is required";
        if (schemaEntry.type === "slider") {
            if (typeof schemaEntry.min !== "number" || typeof schemaEntry.max !== "number") {
                return "slider requires min and max";
            }
            if (schemaEntry.min >= schemaEntry.max) return "min must be < max";
        }
        if (schemaEntry.type === "dropdown") {
            if (schemaEntry.options !== undefined && (!Array.isArray(schemaEntry.options) || schemaEntry.options.length === 0)) {
                return "dropdown options must be a non-empty array";
            }
        }
        return null;
    };

    const validateValue = (schemaEntry, value) => {
        switch (schemaEntry.type) {
            case "toggle":
                return (typeof value === "boolean" || value === 0 || value === 1) ? null : "must be boolean";
            case "slider":
            case "number":
                if (typeof value !== "number" || !Number.isFinite(value)) return "must be finite number";
                if (schemaEntry.type === "slider" && (value < schemaEntry.min || value > schemaEntry.max)) {
                    return `must be between ${schemaEntry.min} and ${schemaEntry.max}`;
                }
                return null;
            case "dropdown":
                if (Array.isArray(schemaEntry.options) && schemaEntry.options.length > 0) {
                    const strVal = String(value);
                    const match = schemaEntry.options.some((opt) => String(opt) === strVal);
                    return match ? null : `must be one of: ${schemaEntry.options.join(", ")}`;
                }
                return null;
            case "buttongroup":
                return (typeof value === "string" || typeof value === "number" || typeof value === "boolean") ? null : "must be primitive";
            case "text":
                return (typeof value === "string") ? null : "must be string";
            case "palette":
                if (typeof value !== "number" || !Number.isInteger(value)) return "must be integer";
                if (QOL_UTILS.SupportsCustomColor(schemaEntry.key) && QOL_UTILS.IsCustomColor(value)) return null;
                if (value < 0 || value > 29) return "must be 0-29";
                return null;
            case "multitoggle":
                return (typeof value === "boolean" || value === 0 || value === 1 || typeof value === "object") ? null : "must be boolean or object";
            case "action":
                return null;
        }
        return null;
    };

    const ensureBucket = (featureId) => {
        if (!values[featureId]) values[featureId] = {};
    };
    const normalizeValue = (setting, value) => {
        if (setting.type === "toggle") return value === true || value === 1;
        if (setting.type === "slider") return Number(value.toFixed(setting.decimals ?? 2));
        return value;
    };
    const definitions = schema => {
        const fields = new Map();
        for (const setting of schema.settings) {
            fields.set(setting.key, setting);
            if (setting.type === "multitoggle") for (const option of setting.options) {
                fields.set(option.key, { ...option, type: "toggle" });
            }
        }
        return fields;
    };
    const isPersistent = key => typeof QOL_DEFAULT_CONFIG === "object" && Object.prototype.hasOwnProperty.call(QOL_DEFAULT_CONFIG, key);
    const contractsMatch = (a, b) => ["type", "default", "min", "max", "step", "decimals"].every(key => Object.is(a[key], b[key])) &&
        (a.type !== "dropdown" || JSON.stringify(a.options) === JSON.stringify(b.options));

    // -- Public API --
    const registerSchema = (featureId, schema) => {
        if (typeof featureId !== "string" || !featureId) return false;
        if (Object.prototype.hasOwnProperty.call(schemas, featureId)) return false;
        if (!schema || !Array.isArray(schema.settings)) return false;
        const settings = schema.settings.map(canonicalSetting);
        for (const setting of settings) if (validateSetting(setting) !== null) return false;
        const fields = definitions({ settings });
        for (const [key, setting] of fields) {
            if (!isPersistent(key) || !persistentDefinitions.has(key)) continue;
            if (!contractsMatch(persistentDefinitions.get(key), setting)) {
                $.Msg(`[QOLLock][WARN][ConfigStore] incompatible shared setting '${key}' in '${featureId}'`);
                return false;
            }
        }
        schemas[featureId] = { ...schema, settings, fields };
        ensureBucket(featureId);
        for (const [key, setting] of fields) {
            let initial = setting.default ?? false;
            if (isPersistent(key)) {
                if (!persistentOwners.has(key)) {
                    persistentOwners.set(key, new Set());
                    persistentDefinitions.set(key, setting);
                    persistentValues.set(key, initial);
                }
                persistentOwners.get(key).add(featureId);
                initial = persistentValues.get(key);
            }
            values[featureId][key] = initial;
        }
        return true;
    };

    const get = (featureId, key) => {
        const bucket = values[featureId];
        return bucket ? bucket[key] : undefined;
    };

    const set = (featureId, key, value) => {
        const schema = schemas[featureId];
        if (!schema) return false;
        const def = schema.fields.get(key);
        if (!def) return false;
        const err = validateValue(def, value);
        if (err) {
            $.Msg(`[QOLLock][WARN][ConfigStore] ${featureId}.${key}: ${err}`);
            return false;
        }
        load({ [featureId]: { [key]: value } });
        return true;
    };

    const all = (featureId) => {
        const bucket = values[featureId];
        if (!bucket) return {};
        return Object.assign({}, bucket);
    };

    // Internal hot-path view used by FeatureRegistry contexts. Read-only.
    const view = (featureId) => values[featureId] || {};

    const exportAll = () => {
        const result = {};
        const ids = Object.keys(schemas);
        for (let i = 0; i < ids.length; i++) {
            result[ids[i]] = all(ids[i]);
        }
        return result;
    };

    const hasSchema = (featureId) => Object.prototype.hasOwnProperty.call(schemas, featureId);

    const load = (data) => {
        if (!data || typeof data !== "object") return 0;
        const shared = new Map();
        const conflicts = new Set();
        const local = new Map();
        const changed = new Map();
        for (const featureId in data) {
            if (!Object.prototype.hasOwnProperty.call(data, featureId) || !Object.prototype.hasOwnProperty.call(schemas, featureId)) continue;
            ensureBucket(featureId);
            const featureData = data[featureId];
            const schema = schemas[featureId];
            if (!featureData || typeof featureData !== "object") continue;
            for (const key in featureData) {
                if (!Object.prototype.hasOwnProperty.call(featureData, key)) continue;
                const setting = schema.fields.get(key);
                if (!setting) continue;
                if (validateValue(setting, featureData[key])) {
                    if (isPersistent(key)) conflicts.add(key);
                    continue;
                }
                const value = normalizeValue(setting, featureData[key]);
                if (isPersistent(key)) {
                    if (shared.has(key) && !Object.is(shared.get(key), value)) conflicts.add(key);
                    shared.set(key, value);
                } else {
                    if (!local.has(featureId)) local.set(featureId, {});
                    local.get(featureId)[key] = value;
                }
            }
        }
        const assign = (featureId, key, value) => {
            if (Object.is(values[featureId][key], value)) return;
            values[featureId][key] = value;
            if (!changed.has(featureId)) changed.set(featureId, {});
            changed.get(featureId)[key] = value;
        };
        for (const [featureId, entries] of local) for (const [key, value] of Object.entries(entries)) assign(featureId, key, value);
        for (const [key, value] of shared) {
            if (conflicts.has(key)) continue;
            persistentValues.set(key, value);
            for (const owner of persistentOwners.get(key)) assign(owner, key, value);
        }
        // All owners see the same complete configuration before any hook runs.
        let count = 0;
        for (const [featureId, changes] of changed) {
            const key = Object.keys(changes)[0];
            count += Object.keys(changes).length;
            EventBus.emit("config:changed", { featureId, key, value: changes[key], changes });
        }
        return count;
    };

    const syncFromExternal = (data) => {
        return load(data);
    };

    Q.core.ConfigStore = {
        canonicalSetting,
        registerSchema,
        get,
        set,
        all,
        view,
        exportAll,
        hasSchema,
        load,
        syncFromExternal
    };

    $.Msg("[QOLLock] core/ql_config_store: attached to QOL.core.ConfigStore");
})();
