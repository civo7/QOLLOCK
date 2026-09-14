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
    const VALID_TYPES = ["toggle", "slider", "dropdown", "text", "palette", "action", "number", "buttongroup"];

    const validateSetting = (schemaEntry) => {
        if (!schemaEntry || typeof schemaEntry.key !== "string") return "key must be a string";
        if (!VALID_TYPES.includes(schemaEntry.type)) return `type must be: ${VALID_TYPES.join(", ")}`;
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
                return (typeof value === "boolean") ? null : "must be boolean";
            case "slider":
            case "number":
                if (typeof value !== "number" || isNaN(value)) return "must be number";
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
                if (typeof value !== "number" || isNaN(value)) return "must be number";
                if (value < 0 || value > 29) return "must be 0-29";
                return null;
            case "action":
                return null;
        }
        return null;
    };

    const ensureBucket = (featureId) => {
        if (!values[featureId]) values[featureId] = {};
    };

    // -- Public API --
    const registerSchema = (featureId, schema) => {
        if (typeof featureId !== "string" || !featureId) return false;
        if (Object.prototype.hasOwnProperty.call(schemas, featureId)) return false;
        if (!schema || !Array.isArray(schema.settings)) return false;
        for (let i = 0; i < schema.settings.length; i++) {
            if (validateSetting(schema.settings[i]) !== null) return false;
        }
        schemas[featureId] = schema;
        ensureBucket(featureId);
        for (let j = 0; j < schema.settings.length; j++) {
            const s = schema.settings[j];
            if (!Object.prototype.hasOwnProperty.call(values[featureId], s.key)) {
                values[featureId][s.key] = s.default;
            }
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
        let def = null;
        for (let i = 0; i < schema.settings.length; i++) {
            if (schema.settings[i].key === key) {
                def = schema.settings[i];
                break;
            }
        }
        if (!def) return false;
        const err = validateValue(def, value);
        if (err) {
            $.Msg(`[QOLLock][WARN][ConfigStore] ${featureId}.${key}: ${err}`);
            return false;
        }
        let stored = value;
        if (def.type === "slider") {
            const decimals = (typeof def.decimals === "number") ? def.decimals : 2;
            stored = Number(Number(value).toFixed(decimals));
        }
        values[featureId][key] = stored;
        EventBus.emit("config:changed", { featureId, key, value: stored });
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
        if (!data || typeof data !== "object") return;
        for (const featureId in data) {
            if (!Object.prototype.hasOwnProperty.call(data, featureId) || !Object.prototype.hasOwnProperty.call(schemas, featureId)) continue;
            ensureBucket(featureId);
            const featureData = data[featureId];
            const schema = schemas[featureId];
            for (const key in featureData) {
                if (!Object.prototype.hasOwnProperty.call(featureData, key)) continue;
                for (let i = 0; i < schema.settings.length; i++) {
                    if (schema.settings[i].key === key && validateValue(schema.settings[i], featureData[key]) === null) {
                        const oldVal = values[featureId][key];
                        const newVal = featureData[key];
                        values[featureId][key] = newVal;
                        if (oldVal !== newVal) {
                            EventBus.emit("config:changed", { featureId, key, value: newVal });
                        }
                        break;
                    }
                }
            }
        }
    };

    const syncFromExternal = (data) => {
        if (!data || typeof data !== "object") return 0;
        let changeCount = 0;
        for (const featureId in data) {
            if (!Object.prototype.hasOwnProperty.call(data, featureId) || !Object.prototype.hasOwnProperty.call(schemas, featureId)) continue;
            ensureBucket(featureId);
            for (const key in data[featureId]) {
                if (!Object.prototype.hasOwnProperty.call(data[featureId], key)) continue;
                if (values[featureId][key] !== data[featureId][key]) {
                    if (set(featureId, key, data[featureId][key])) changeCount++;
                }
            }
        }
        return changeCount;
    };

    Q.core.ConfigStore = {
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
