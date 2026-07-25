// =============================================================================
// QOLLOCK — core/ql_feature_registry.js
// =============================================================================
// OWNS:        Feature manifest registration and lifecycle management.
//              register(manifest), boot(config), shutdown(), createContext().
//              Error tracking: consecutiveErrors, lastError, totalErrors.
//              Auto-disable at 10 consecutive errors. _isSettingsIsolate().
// DOES NOT OWN: Config schema (delegates to ConfigStore), scheduling (Scheduler),
//               panel access (PanelHelpers), logging (Logger)
// DEPENDS ON:  core/ql_namespace.js, core/ql_event_bus.js, core/ql_config_store.js
// USED BY:     Feature manifests (register), ql_app.js (boot/shutdown)
// LOAD ORDER:  7th — after ql_config_store.js
//
// Boundary validation: Checks all dependencies exist. Aborts with clear messages.
// =============================================================================

(function () {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_feature_registry: QOL.core not found — aborting.");
        return;
    }
    var EventBus = QOL.core.EventBus;
    var ConfigStore = QOL.core.ConfigStore;
    var Logger = QOL.core.Logger;
    if (!EventBus || !ConfigStore) {
        $.Msg("[QOLLock] core/ql_feature_registry: dependencies missing " +
              "(EventBus=" + !!EventBus + ", ConfigStore=" + !!ConfigStore + ") — aborting.");
        return;
    }

    var _manifests = {};
    var _instances = {};
    var _enabled = {};
    var _errors = {};
    var _configChangedHandler = null;
    var ERROR_STREAK_MAX = 10;

    function _isSettingsIsolate() {
        try {
            var ctx = $.GetContextPanel();
            return ctx && ctx.id === "EscapeMenu";
        } catch (e) { return false; }
    }

    function _safeEnableFeature(id) {
        if (_instances.hasOwnProperty(id)) return;
        var manifest = _manifests[id];
        if (!manifest) return;
        try {
            var context = createContext(id);
            var instance = manifest.create(context);
            if (instance && typeof instance.onEnable === "function") {
                _instances[id] = instance;
                _enabled[id] = true;
                if (!_isSettingsIsolate()) {
                    instance.onEnable();
                }
            }
        } catch (e) {
            if (Logger) Logger.logError("FeatureRegistry", "enable failed for '" + id +
                "': " + (e.message || e));
        }
    }

    function _safeDisableFeature(id) {
        var instance = _instances[id];
        if (!instance) return;
        try {
            if (typeof instance.onDisable === "function") { instance.onDisable(); }
        } catch (e) {
            if (Logger) Logger.logError("FeatureRegistry", "disable failed for '" + id +
                "': " + (e.message || e));
        }
        delete _instances[id];
        _enabled[id] = false;
    }

    function _onConfigChanged(payload) {
        if (!payload || typeof payload.featureId !== "string") return;
        if (payload.key === "enabled") {
            payload.value ? _safeEnableFeature(payload.featureId)
                          : _safeDisableFeature(payload.featureId);
            return;
        }
        if (!_instances.hasOwnProperty(payload.featureId) &&
            _manifests.hasOwnProperty(payload.featureId)) {
            _safeEnableFeature(payload.featureId);
        }
        var instance = _instances[payload.featureId];
        if (instance && typeof instance.onSettingsChanged === "function") {
            payload.changes = {};
            payload.changes[payload.key] = payload.value;
            try { instance.onSettingsChanged(payload); }
            catch (e) {
                if (Logger) Logger.logError("FeatureRegistry",
                    payload.featureId + " onSettingsChanged: " + (e.message || e));
            }
        }
    }

    function createContext(featureId) {
        return {
            id: featureId,
            events: {
                on: function (event, fn) { return EventBus.on(event, fn); },
                off: function (event, fn) { EventBus.off(event, fn); },
                emit: function (event, payload) {
                    EventBus.emit(featureId + ":" + event, payload);
                }
            },
            config: {
                get: function (key) { return ConfigStore.get(featureId, key); },
                set: function (key, value) { return ConfigStore.set(featureId, key, value); },
                all: function () { return ConfigStore.all(featureId); }
            }
        };
    }

    function _validateManifest(manifest) {
        if (!manifest || typeof manifest !== "object") return "must be an object";
        if (typeof manifest.id !== "string" || !manifest.id) return "id must be a non-empty string";
        if (!(/^[a-z0-9_]+$/.test(manifest.id))) return "id must be lowercase alphanumeric + underscore";
        if (_manifests.hasOwnProperty(manifest.id)) return "already registered";
        if (typeof manifest.create !== "function") return "create must be a function";
        return null;
    }

    // -- Public API --
    function register(manifest) {
        var err = _validateManifest(manifest);
        if (err) {
            $.Msg("[QOLLock][WARN][FeatureRegistry] invalid manifest: " + err);
            return false;
        }
        _manifests[manifest.id] = manifest;
        var schemaSettings = [{
            key: "enabled", type: "toggle", default: manifest.enabledByDefault === true
        }];
        if (manifest.settings && manifest.settings.length > 0) {
            schemaSettings = schemaSettings.concat(manifest.settings);
        }
        ConfigStore.registerSchema(manifest.id, { settings: schemaSettings });
        if (Logger) Logger.logInfo("FeatureRegistry", "registered '" + manifest.id + "'");
        return true;
    }

    function boot(config) {
        var ids = Object.keys(_manifests);
        var enabledCount = 0;
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var manifest = _manifests[id];
            var enabled = manifest.enabledByDefault === true;
            if (config && config.hasOwnProperty(id) && config[id].hasOwnProperty("enabled")) {
                enabled = !!config[id].enabled;
            }
            _enabled[id] = enabled;
            if (!enabled) continue;
            try {
                var context = createContext(id);
                var instance = manifest.create(context);
                if (instance && typeof instance.onEnable === "function") {
                    _instances[id] = instance;
                    if (!_isSettingsIsolate()) { instance.onEnable(); }
                    enabledCount++;
                }
            } catch (e) {
                if (Logger) Logger.logError("FeatureRegistry", "boot failed for '" + id +
                    "': " + (e.message || e));
            }
        }
        $.Msg("[QOLLock] FeatureRegistry: boot complete — " + enabledCount + "/" +
              ids.length + " features enabled");
        if (!_configChangedHandler) {
            _configChangedHandler = _onConfigChanged;
            EventBus.on("config:changed", _configChangedHandler);
        }
    }

    function shutdown() {
        var ids = Object.keys(_instances);
        for (var i = 0; i < ids.length; i++) {
            try {
                var inst = _instances[ids[i]];
                if (inst && typeof inst.onDisable === "function") inst.onDisable();
            } catch (e) {
                if (Logger) Logger.logError("FeatureRegistry", "shutdown failed for '" +
                    ids[i] + "': " + (e.message || e));
            }
        }
        if (_configChangedHandler) {
            EventBus.off("config:changed", _configChangedHandler);
            _configChangedHandler = null;
        }
        _instances = {};
        _enabled = {};
    }

    function isEnabled(featureId) { return !!_enabled[featureId]; }
    function isRegistered(featureId) { return _manifests.hasOwnProperty(featureId); }
    function getRegisteredIds() { return Object.keys(_manifests); }
    function getManifest(featureId) { return _manifests[featureId] || null; }

    QOL.core.FeatureRegistry = {
        register: register, boot: boot, shutdown: shutdown,
        createContext: createContext, isEnabled: isEnabled,
        isRegistered: isRegistered, getRegisteredIds: getRegisteredIds,
        getManifest: getManifest
    };

    $.Msg("[QOLLock] core/ql_feature_registry: attached to QOL.core.FeatureRegistry");
})();
