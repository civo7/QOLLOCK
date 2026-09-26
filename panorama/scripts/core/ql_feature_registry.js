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

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q?.core) {
        $.Msg("[QOLLock] core/ql_feature_registry: QOL.core not found — aborting.");
        return;
    }
    const EventBus = Q.core.EventBus;
    const ConfigStore = Q.core.ConfigStore;
    const Logger = Q.core.Logger;
    if (!EventBus || !ConfigStore) {
        $.Msg(`[QOLLock] core/ql_feature_registry: dependencies missing (EventBus=${!!EventBus}, ConfigStore=${!!ConfigStore}) — aborting.`);
        return;
    }

    const manifests = {};
    const instances = {};
    const enabledMap = {};
    const enablingInProgress = {};  // reentry guard: prevents recursion during onEnable/boot
    const errorStreaks = {};
    let configChangedHandler = null;
    let schedulerErrorHandler = null;  // listens for scheduler:error to track poll loop streaks
    let schedulerOkHandler = null;     // listens for scheduler:tick_ok to reset consecutive error counter
    const ERROR_STREAK_MAX = 10;

    const isSettingsIsolate = () => {
        try {
            const ctx = $.GetContextPanel();
            return ctx?.id === "EscapeMenu";
        } catch (_) {
            return false;
        }
    };

    const createContext = (featureId) => ({
        id: featureId,
        events: {
            on: (event, fn) => EventBus.on(event, fn),
            off: (event, fn) => EventBus.off(event, fn),
            emit: (event, payload) => {
                EventBus.emit(`${featureId}:${event}`, payload);
            }
        },
        config: {
            get: (key) => ConfigStore.get(featureId, key),
            getBool: (key) => Boolean(ConfigStore.get(featureId, key)),
            set: (key, value) => ConfigStore.set(featureId, key, value),
            all: () => ConfigStore.all(featureId),
            view: () => (ConfigStore.view ? ConfigStore.view(featureId) : ConfigStore.all(featureId))
        }
    });

    const safeEnableFeature = (id) => {
        if (Object.prototype.hasOwnProperty.call(instances, id)) return; // already enabled
        if (enablingInProgress[id]) return;                             // reentry guard
        const manifest = manifests[id];
        if (!manifest) return;
        enablingInProgress[id] = true;
        let instance = null;
        try {
            const context = createContext(id);
            instance = manifest.create(context);
            if (!instance || typeof instance.onEnable !== "function") {
                delete enablingInProgress[id];
                return;
            }
            if (!isSettingsIsolate()) {
                instance.onEnable();                                    // call BEFORE setting instances
            }
            instances[id] = instance;                                   // only on success
            enabledMap[id] = true;
            errorStreaks[id] = 0;                                       // start tracking errors
        } catch (e) {
            // A failed onEnable may already own listeners, panels and schedules.
            // Unwind its partial setup before allowing a later enable retry.
            try { instance?.onDisable?.(); } catch (_) { /* preserve original failure */ }
            try { Q.core.Scheduler?.cancelAllForFeature?.(id); } catch (_) { /* best-effort */ }
            if (Logger) Logger.logError("FeatureRegistry", `enable failed for '${id}': ${e?.message || e}`);
            errorStreaks[id] = (errorStreaks[id] || 0) + 1;
        }
        delete enablingInProgress[id];
    };

    const safeDisableFeature = (id) => {
        const instance = instances[id];
        if (!instance) return;
        try {
            if (typeof instance.onDisable === "function") {
                instance.onDisable();
            }
        } catch (e) {
            errorStreaks[id] = (errorStreaks[id] || 0) + 1;
            if (Logger) Logger.logError("FeatureRegistry", `disable failed for '${id}': ${e?.message || e}`);
        }
        try {
            if (Q.core.Scheduler?.cancelAllForFeature) {
                Q.core.Scheduler.cancelAllForFeature(id);
            }
        } catch (_) { /* best-effort */ }
        delete instances[id];
        enabledMap[id] = false;
    };

    const isFeatureSupposedToBeEnabled = (id, configSlice) => {
        const manifest = manifests[id];
        if (!manifest) return false;
        const cfg = configSlice || (ConfigStore && ConfigStore.hasSchema(id) ? ConfigStore.all(id) : null);
        if (!cfg) return manifest.enabledByDefault === true;

        if (typeof manifest.isEnabled === "function") {
            try {
                return !!manifest.isEnabled(cfg);
            } catch (_) {}
        }

        if (manifest.enableKey && Object.prototype.hasOwnProperty.call(cfg, manifest.enableKey)) {
            const v = cfg[manifest.enableKey];
            return (v === true || v === 1 || String(v) === "true");
        }
        if (Array.isArray(manifest.enableKeys) && manifest.enableKeys.length > 0) {
            for (let i = 0; i < manifest.enableKeys.length; i++) {
                const k = manifest.enableKeys[i];
                if (Object.prototype.hasOwnProperty.call(cfg, k)) {
                    const val = cfg[k];
                    if (val === true || val === 1 || String(val) === "true") {
                        return true;
                    }
                }
            }
            return false;
        }
        if (!manifest.enableKey && (!manifest.enableKeys || manifest.enableKeys.length === 0) && manifest.enabledByDefault === true) {
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(cfg, "enabled")) {
            return !!cfg.enabled;
        }
        return manifest.enabledByDefault === true;
    };

    const onConfigChanged = (payload) => {
        if (!payload || typeof payload.featureId !== "string") return;
        const manifest = manifests[payload.featureId];
        const hasEnableKey = manifest && manifest.enableKey && payload.key === manifest.enableKey;
        const hasEnableKeys = manifest && Array.isArray(manifest.enableKeys) && manifest.enableKeys.includes(payload.key);
        const hasCustomEnabled = manifest && typeof manifest.isEnabled === "function";
        const isEnableKey = payload.key === "enabled" || hasEnableKey || hasEnableKeys || hasCustomEnabled;
        if (isEnableKey) {
            const shouldEnable = isFeatureSupposedToBeEnabled(payload.featureId);
            const isCurrentlyEnabled = Object.prototype.hasOwnProperty.call(instances, payload.featureId);
            if (shouldEnable && !isCurrentlyEnabled) {
                safeEnableFeature(payload.featureId);
            } else if (!shouldEnable && isCurrentlyEnabled) {
                safeDisableFeature(payload.featureId);
                return;
            }
        }
        if (!Object.prototype.hasOwnProperty.call(instances, payload.featureId) &&
            Object.prototype.hasOwnProperty.call(manifests, payload.featureId) &&
            isFeatureSupposedToBeEnabled(payload.featureId)) {
            safeEnableFeature(payload.featureId);
        }
        const instance = instances[payload.featureId];
        if (instance && typeof instance.onSettingsChanged === "function") {
            payload.changes = { [payload.key]: payload.value };
            try {
                instance.onSettingsChanged(payload);
                errorStreaks[payload.featureId] = 0;
            } catch (e) {
                errorStreaks[payload.featureId] = (errorStreaks[payload.featureId] || 0) + 1;
                if (Logger) Logger.logError("FeatureRegistry", `${payload.featureId} onSettingsChanged: ${e?.message || e}`);
            }
        }
    };

    const validateManifest = (manifest) => {
        if (!manifest || typeof manifest !== "object") return "must be an object";
        if (typeof manifest.id !== "string" || !manifest.id) return "id must be a non-empty string";
        if (!(/^[a-z0-9_]+$/.test(manifest.id))) return "id must be lowercase alphanumeric + underscore";
        if (Object.prototype.hasOwnProperty.call(manifests, manifest.id)) return "already registered";
        if (typeof manifest.create !== "function") return "create must be a function";
        return null;
    };

    // -- Public API --
    const register = (manifest) => {
        const err = validateManifest(manifest);
        if (err) {
            $.Msg(`[QOLLock][WARN][FeatureRegistry] invalid manifest: ${err}`);
            return false;
        }
        manifests[manifest.id] = manifest;
        let schemaSettings = [{
            key: "enabled", type: "toggle", default: manifest.enabledByDefault === true
        }];
        if (manifest.settings && manifest.settings.length > 0) {
            schemaSettings = schemaSettings.concat(manifest.settings);
        }
        ConfigStore.registerSchema(manifest.id, { settings: schemaSettings });
        if (Logger) Logger.logInfo("FeatureRegistry", `registered '${manifest.id}'`);
        return true;
    };

    const boot = (config) => {
        const ids = Object.keys(manifests);
        const total = ids.length;
        let enabledCount = 0;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            if (Object.prototype.hasOwnProperty.call(instances, id)) continue; // already enabled
            if (enablingInProgress[id]) continue;                              // reentry guard
            const manifest = manifests[id];

            const slice = (config && Object.prototype.hasOwnProperty.call(config, id)) ? config[id] : null;
            const shouldEnable = isFeatureSupposedToBeEnabled(id, slice);

            if (!shouldEnable) continue;

            enablingInProgress[id] = true;
            let instance = null;
            try {
                const context = createContext(id);
                instance = manifest.create(context);
                if (instance && typeof instance.onEnable === "function") {
                    if (!isSettingsIsolate()) {
                        instance.onEnable();
                    }
                }
                instances[id] = instance;
                enabledMap[id] = true;
                errorStreaks[id] = 0;
                enabledCount++;
            } catch (e) {
                try { instance?.onDisable?.(); } catch (_) { /* preserve original failure */ }
                try { Q.core.Scheduler?.cancelAllForFeature?.(id); } catch (_) { /* best-effort */ }
                if (Logger) Logger.logError("FeatureRegistry", `boot failed for '${id}': ${e?.message || e}`);
                errorStreaks[id] = (errorStreaks[id] || 0) + 1;
            }
            delete enablingInProgress[id];
        }

        $.Msg(`[QOLLock] FeatureRegistry: boot complete — ${enabledCount}/${total} features enabled`);

        if (!configChangedHandler) {
            configChangedHandler = onConfigChanged;
            EventBus.on("config:changed", configChangedHandler);
        }

        if (!schedulerErrorHandler) {
            schedulerErrorHandler = (payload) => {
                if (!payload?.featureId) return;
                const id = payload.featureId;
                if (!Object.prototype.hasOwnProperty.call(manifests, id)) return;
                const streak = (errorStreaks[id] || 0) + 1;
                errorStreaks[id] = streak;
                if (streak >= ERROR_STREAK_MAX) {
                    if (Logger) Logger.logError("FeatureRegistry", `auto-disabled '${id}' after ${streak} consecutive poll errors: ${payload.message || ""}`);
                    safeDisableFeature(id);
                    delete errorStreaks[id];
                }
            };
            EventBus.on("scheduler:error", schedulerErrorHandler);
        }

        if (!schedulerOkHandler) {
            schedulerOkHandler = (payload) => {
                if (!payload?.featureId) return;
                if (Object.prototype.hasOwnProperty.call(manifests, payload.featureId) && errorStreaks[payload.featureId] > 0) {
                    errorStreaks[payload.featureId] = 0;
                }
            };
            EventBus.on("scheduler:tick_ok", schedulerOkHandler);
        }
    };

    const shutdown = () => {
        try {
            if (Q.core?.ManifestTests?.cancel) {
                Q.core.ManifestTests.cancel();
            }
        } catch (_) { /* best-effort */ }

        const ids = Object.keys(instances);
        for (let i = 0; i < ids.length; i++) {
            try {
                const inst = instances[ids[i]];
                if (inst && typeof inst.onDisable === "function") inst.onDisable();
            } catch (e) {
                if (Logger) Logger.logError("FeatureRegistry", `shutdown failed for '${ids[i]}': ${e?.message || e}`);
            }
            try {
                if (Q.core.Scheduler?.cancelAllForFeature) {
                    Q.core.Scheduler.cancelAllForFeature(ids[i]);
                }
            } catch (_) { /* best-effort */ }
        }

        if (configChangedHandler) {
            EventBus.off("config:changed", configChangedHandler);
            configChangedHandler = null;
        }
        if (schedulerErrorHandler) {
            EventBus.off("scheduler:error", schedulerErrorHandler);
            schedulerErrorHandler = null;
        }
        if (schedulerOkHandler) {
            EventBus.off("scheduler:tick_ok", schedulerOkHandler);
            schedulerOkHandler = null;
        }

        for (const k of Object.keys(instances)) delete instances[k];
        for (const k of Object.keys(enabledMap)) delete enabledMap[k];
    };

    const isEnabled = (featureId) => !!enabledMap[featureId];
    const isRegistered = (featureId) => Object.prototype.hasOwnProperty.call(manifests, featureId);
    const getRegisteredIds = () => Object.keys(manifests);
    const getEnabledIds = () => Object.keys(instances);
    const getErrorCounts = () => Object.assign({}, errorStreaks);
    const getManifest = (featureId) => manifests[featureId] || null;
    const getInstance = (featureId) => {
        if (!featureId || typeof featureId !== "string") return null;
        return Object.prototype.hasOwnProperty.call(instances, featureId) ? instances[featureId] : null;
    };
    const enableFeature = (id) => { safeEnableFeature(id); };
    const disableFeature = (id) => { safeDisableFeature(id); };

    const registryApi = {
        register,
        boot,
        shutdown,
        createContext,
        isEnabled,
        isRegistered,
        isFeatureSupposedToBeEnabled,
        getRegisteredIds,
        getEnabledIds,
        getErrorCounts,
        getManifest,
        getInstance,
        enable: enableFeature,
        disable: disableFeature
    };

    Q.core.registry = registryApi;
    Q.core.FeatureRegistry = registryApi;

    $.Msg("[QOLLock] core/ql_feature_registry: attached to QOL.core.registry and QOL.core.FeatureRegistry");
})();
