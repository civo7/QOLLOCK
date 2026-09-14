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

(function () {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_config_store: QOL.core not found — aborting.");
        return;
    }
    var EventBus = QOL.core.EventBus;
    if (!EventBus) {
        $.Msg("[QOLLock] core/ql_config_store: EventBus not found — aborting. " +
              "Is core/ql_event_bus.js loaded first?");
        return;
    }

    var _schemas = {};
    var _values = {};
    var VALID_TYPES = ["toggle", "slider", "dropdown", "text", "palette", "action", "number", "buttongroup"];

    function _validateSetting(schemaEntry) {
        if (!schemaEntry || typeof schemaEntry.key !== "string") return "key must be a string";
        if (VALID_TYPES.indexOf(schemaEntry.type) === -1) return "type must be: " + VALID_TYPES.join(", ");
        if (!schemaEntry.hasOwnProperty("default")) return "default is required";
        if (schemaEntry.type === "slider") {
            if (typeof schemaEntry.min !== "number" || typeof schemaEntry.max !== "number")
                return "slider requires min and max";
            if (schemaEntry.min >= schemaEntry.max) return "min must be < max";
        }
        if (schemaEntry.type === "dropdown") {
            if (schemaEntry.options !== undefined && (!Array.isArray(schemaEntry.options) || schemaEntry.options.length === 0))
                return "dropdown options must be a non-empty array";
        }
        return null;
    }

    function _validateValue(schemaEntry, value) {
        switch (schemaEntry.type) {
            case "toggle": return (typeof value === "boolean") ? null : "must be boolean";
            case "slider":
            case "number":
                if (typeof value !== "number" || isNaN(value)) return "must be number";
                if (schemaEntry.type === "slider" && (value < schemaEntry.min || value > schemaEntry.max))
                    return "must be between " + schemaEntry.min + " and " + schemaEntry.max;
                return null;
            case "dropdown":
                if (Array.isArray(schemaEntry.options) && schemaEntry.options.length > 0) {
                    var strVal = String(value);
                    var match = schemaEntry.options.some(function(opt) { return String(opt) === strVal; });
                    return match ? null : "must be one of: " + schemaEntry.options.join(", ");
                }
                return null;
            case "buttongroup":
                return (typeof value === "string" || typeof value === "number" || typeof value === "boolean") ? null : "must be primitive";
            case "text": return (typeof value === "string") ? null : "must be string";
            case "palette":
                if (typeof value !== "number" || isNaN(value)) return "must be number";
                if (value < 0 || value > 29) return "must be 0-29";
                return null;
            case "action": return null;
        }
        return null;
    }

    function _ensureBucket(featureId) {
        if (!_values[featureId]) _values[featureId] = {};
    }

    // -- Public API --
    function registerSchema(featureId, schema) {
        if (typeof featureId !== "string" || !featureId) return false;
        if (_schemas.hasOwnProperty(featureId)) return false;
        if (!schema || !Array.isArray(schema.settings)) return false;
        for (var i = 0; i < schema.settings.length; i++) {
            if (_validateSetting(schema.settings[i]) !== null) return false;
        }
        _schemas[featureId] = schema;
        _ensureBucket(featureId);
        for (var j = 0; j < schema.settings.length; j++) {
            var s = schema.settings[j];
            if (!_values[featureId].hasOwnProperty(s.key)) {
                _values[featureId][s.key] = s.default;
            }
        }
        return true;
    }

    function get(featureId, key) {
        var bucket = _values[featureId];
        return bucket ? bucket[key] : undefined;
    }

    function set(featureId, key, value) {
        var schema = _schemas[featureId];
        if (!schema) return false;
        var def = null;
        for (var i = 0; i < schema.settings.length; i++) {
            if (schema.settings[i].key === key) { def = schema.settings[i]; break; }
        }
        if (!def) return false;
        var err = _validateValue(def, value);
        if (err) { $.Msg("[QOLLock][WARN][ConfigStore] " + featureId + "." + key + ": " + err); return false; }
        // Round slider to decimals to prevent float drift
        var stored = value;
        if (def.type === "slider") {
            var decimals = (typeof def.decimals === "number") ? def.decimals : 2;
            stored = Number(Number(value).toFixed(decimals));
        }
        _values[featureId][key] = stored;
        EventBus.emit("config:changed", { featureId: featureId, key: key, value: stored });
        return true;
    }

    function all(featureId) {
        var bucket = _values[featureId];
        if (!bucket) return {};
        var snapshot = {};
        for (var k in bucket) {
            if (bucket.hasOwnProperty(k)) snapshot[k] = bucket[k];
        }
        return snapshot;
    }

    // Internal hot-path view used by FeatureRegistry contexts. Callers must
    // treat the returned bucket as read-only; ConfigStore remains its owner.
    // The public all() API above keeps snapshot semantics for other consumers.
    function view(featureId) {
        return _values[featureId] || {};
    }

    function exportAll() {
        var result = {};
        var ids = Object.keys(_schemas);
        for (var i = 0; i < ids.length; i++) {
            result[ids[i]] = all(ids[i]);
        }
        return result;
    }

    function hasSchema(featureId) {
        return _schemas.hasOwnProperty(featureId);
    }

    function load(data) {
        if (!data || typeof data !== "object") return;
        for (var featureId in data) {
            if (!data.hasOwnProperty(featureId) || !_schemas.hasOwnProperty(featureId)) continue;
            _ensureBucket(featureId);
            var featureData = data[featureId];
            var schema = _schemas[featureId];
            for (var key in featureData) {
                if (!featureData.hasOwnProperty(key)) continue;
                for (var i = 0; i < schema.settings.length; i++) {
                    if (schema.settings[i].key === key &&
                        _validateValue(schema.settings[i], featureData[key]) === null) {
                        var oldVal = _values[featureId][key];
                        var newVal = featureData[key];
                        _values[featureId][key] = newVal;
                        if (oldVal !== newVal) {
                            EventBus.emit("config:changed", { featureId: featureId, key: key, value: newVal });
                        }
                        break;
                    }
                }
            }
        }
    }

    function syncFromExternal(data) {
        if (!data || typeof data !== "object") return 0;
        var changeCount = 0;
        for (var featureId in data) {
            if (!data.hasOwnProperty(featureId) || !_schemas.hasOwnProperty(featureId)) continue;
            _ensureBucket(featureId);
            for (var key in data[featureId]) {
                if (!data[featureId].hasOwnProperty(key)) continue;
                if (_values[featureId][key] !== data[featureId][key]) {
                    if (set(featureId, key, data[featureId][key])) changeCount++;
                }
            }
        }
        return changeCount;
    }

    QOL.core.ConfigStore = {
        registerSchema: registerSchema, get: get, set: set, all: all, view: view,
        exportAll: exportAll, hasSchema: hasSchema, load: load,
        syncFromExternal: syncFromExternal
    };

    $.Msg("[QOLLock] core/ql_config_store: attached to QOL.core.ConfigStore");
})();
