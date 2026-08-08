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
    var _enablingInProgress = {};  // reentry guard: prevents recursion during onEnable/boot
    var _errors = {};
    var _configChangedHandler = null;
    var _schedulerErrorHandler = null;  // P2: listens for scheduler:error to track poll loop streaks
    var _schedulerOkHandler = null;      // P2: listens for scheduler:tick_ok to reset consecutive error counter
    var ERROR_STREAK_MAX = 10;

    function _isSettingsIsolate() {
        try {
            var ctx = $.GetContextPanel();
            return ctx && ctx.id === "EscapeMenu";
        } catch (e) { return false; }
    }

    function _safeEnableFeature(id) {
        if (_instances.hasOwnProperty(id)) return;       // already enabled
        if (_enablingInProgress[id]) return;              // reentry guard
        var manifest = _manifests[id];
        if (!manifest) return;
        _enablingInProgress[id] = true;
        try {
            var context = createContext(id);
            var instance = manifest.create(context);
            if (!instance || typeof instance.onEnable !== "function") {
                delete _enablingInProgress[id];
                return;
            }
            if (!_isSettingsIsolate()) {
                instance.onEnable();                      // call BEFORE setting _instances
            }
            _instances[id] = instance;                    // only on success
            _enabled[id] = true;
            _errors[id] = 0;                              // start tracking errors
        } catch (e) {
            if (Logger) Logger.logError("FeatureRegistry", "enable failed for '" + id +
                "': " + (e.message || e));
            _errors[id] = (_errors[id] || 0) + 1;         // track consecutive failures
            // _instances NOT set → retryable on next attempt
        }
        delete _enablingInProgress[id];
    }

    function _safeDisableFeature(id) {
        var instance = _instances[id];
        if (!instance) return;
        try {
            if (typeof instance.onDisable === "function") { instance.onDisable(); }
        } catch (e) {
            _errors[id] = (_errors[id] || 0) + 1;
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
        // Only auto-enable if the feature's "enabled" config is explicitly true.
        // Prevents auto-enable from unrelated config key changes (dormant bug:
        // ConfigStore.load() doesn't emit events, but ConfigStore.set() does).
        if (!_instances.hasOwnProperty(payload.featureId) &&
            _manifests.hasOwnProperty(payload.featureId) &&
            ConfigStore.get(payload.featureId, "enabled") === true) {
            _safeEnableFeature(payload.featureId);
        }
        var instance = _instances[payload.featureId];
        if (instance && typeof instance.onSettingsChanged === "function") {
            payload.changes = {};
            payload.changes[payload.key] = payload.value;
            try { instance.onSettingsChanged(payload); }
            catch (e) {
                _errors[payload.featureId] = (_errors[payload.featureId] || 0) + 1;
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
        var total = ids.length;
        var enabledCount = 0;
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            if (_instances.hasOwnProperty(id)) continue;        // already enabled
            if (_enablingInProgress[id]) continue;              // reentry guard
            var manifest = _manifests[id];

            var shouldEnable = manifest.enabledByDefault === true;
            if (config && config.hasOwnProperty(id) && config[id].hasOwnProperty("enabled")) {
                shouldEnable = !!config[id].enabled;
            }

            if (!shouldEnable) continue;

            _enablingInProgress[id] = true;
            try {
                var context = createContext(id);
                var instance = manifest.create(context);
                if (instance && typeof instance.onEnable === "function") {
                    if (!_isSettingsIsolate()) { instance.onEnable(); }
                }
                _instances[id] = instance;                     // only on success
                _enabled[id] = true;
                _errors[id] = 0;
                enabledCount++;
            } catch (e) {
                if (Logger) Logger.logError("FeatureRegistry", "boot failed for '" + id +
                    "': " + (e.message || e));
                _errors[id] = (_errors[id] || 0) + 1;
                // _enabled NOT set → not stuck, retryable on next re-sync
            }
            delete _enablingInProgress[id];
        }
        $.Msg("[QOLLock] FeatureRegistry: boot complete — " + enabledCount + "/" +
              total + " features enabled");
        if (!_configChangedHandler) {
            _configChangedHandler = _onConfigChanged;
            EventBus.on("config:changed", _configChangedHandler);
        }
        // P2: listen for poll loop errors so we can auto-disable after consecutive failures
        if (!_schedulerErrorHandler) {
            _schedulerErrorHandler = function(payload) {
                if (!payload || !payload.featureId) return;
                var id = payload.featureId;
                if (!_manifests.hasOwnProperty(id)) return;  // not one of ours
                var streak = (_errors[id] || 0) + 1;
                _errors[id] = streak;
                if (streak >= ERROR_STREAK_MAX) {
                    if (Logger) Logger.logError("FeatureRegistry",
                        "auto-disabled '" + id + "' after " + streak +
                        " consecutive poll errors: " + (payload.message || ""));
                    _safeDisableFeature(id);
                    delete _errors[id]; // reset streak after disable
                }
            };
            EventBus.on("scheduler:error", _schedulerErrorHandler);
        }
        // P2: reset consecutive error counter on successful poll ticks
        if (!_schedulerOkHandler) {
            _schedulerOkHandler = function(payload) {
                if (!payload || !payload.featureId) return;
                if (_manifests.hasOwnProperty(payload.featureId) && _errors[payload.featureId] > 0) {
                    _errors[payload.featureId] = 0;
                }
            };
            EventBus.on("scheduler:tick_ok", _schedulerOkHandler);
        }
    }

    function shutdown() {
        // P2: cancel in-flight manifest tests before tearing down instances
        try { if (QOL.core && QOL.core.ManifestTests) { QOL.core.ManifestTests.cancel(); } } catch(e) { /* best-effort */ }
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
        // P2: unregister scheduler error listener
        if (_schedulerErrorHandler) {
            EventBus.off("scheduler:error", _schedulerErrorHandler);
            _schedulerErrorHandler = null;
        }
        if (_schedulerOkHandler) {
            EventBus.off("scheduler:tick_ok", _schedulerOkHandler);
            _schedulerOkHandler = null;
        }
        _instances = {};
        _enabled = {};
    }

    function isEnabled(featureId) { return !!_enabled[featureId]; }
    function isRegistered(featureId) { return _manifests.hasOwnProperty(featureId); }
    function getRegisteredIds() { return Object.keys(_manifests); }
    function getEnabledIds() { return Object.keys(_instances); }
    function getErrorCounts() {
        var snapshot = {};
        for (var k in _errors) { if (_errors.hasOwnProperty(k)) { snapshot[k] = _errors[k]; } }
        return snapshot;
    }
    function getManifest(featureId) { return _manifests[featureId] || null; }
    function getInstance(featureId) {
        if (!featureId || typeof featureId !== "string") return null;
        return _instances.hasOwnProperty(featureId) ? _instances[featureId] : null;
    }
    function enableFeature(id) { _safeEnableFeature(id); }
    function disableFeature(id) { _safeDisableFeature(id); }

    QOL.core.FeatureRegistry = {
        register: register, boot: boot, shutdown: shutdown,
        createContext: createContext, isEnabled: isEnabled,
        isRegistered: isRegistered, getRegisteredIds: getRegisteredIds,
        getEnabledIds: getEnabledIds, getErrorCounts: getErrorCounts,
        getManifest: getManifest, getInstance: getInstance,
        enable: enableFeature, disable: disableFeature
    };

    $.Msg("[QOLLock] core/ql_feature_registry: attached to QOL.core.FeatureRegistry");
})();
