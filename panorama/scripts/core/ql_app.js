// =============================================================================
// QOLLOCK — core/ql_app.js
// =============================================================================
// OWNS:        Application boot sequence: find Hud → load config → boot features.
//              500ms config polling bridge (HUD ↔ Settings cross-isolate sync).
// DOES NOT OWN: Feature logic, config schema, scheduling, logging, panel access
// DEPENDS ON:  All core modules (namespace, logger, event_bus, config_store,
//              scheduler, panel_helpers, feature_registry, config_adapter)
// USED BY:     hud.xml (loaded LAST in <scripts> block, after all feature manifests)
// LOAD ORDER:  8th (LAST) — after all core modules and feature manifests
//
// Boundary validation: Checks all dependencies exist. Aborts with clear messages.
// =============================================================================

(function () {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_app: QOL.core not found — aborting.");
        return;
    }
    var ConfigStore = QOL.core.ConfigStore;
    var ConfigAdapter = QOL.core.ConfigAdapter;
    var FeatureRegistry = QOL.core.FeatureRegistry;
    var Logger = QOL.core.Logger;
    var PanelHelpers = QOL.ui.PanelHelpers;

    if (!ConfigStore || !FeatureRegistry) {
        $.Msg("[QOLLock] core/ql_app: dependencies missing " +
              "(ConfigStore=" + !!ConfigStore + ", FeatureRegistry=" + !!FeatureRegistry +
              ") — aborting.");
        return;
    }

    var _hudPanel = null;
    var _booted = false;
    var _lastConfigRaw = "";
    var _configPollTimer = null;
    var _enableKeyMap = null;
    // Step 0a: during migration, read from old system's attribute
    var _CONFIG_ATTRIBUTE = "Deadlock_Mod_Settings_v1";

    // Build featureId → enableKey map from registered manifests
    function _buildEnableKeyMap() {
        var map = {};
        if (!FeatureRegistry) return map;
        var ids = FeatureRegistry.getRegisteredIds();
        for (var i = 0; i < ids.length; i++) {
            var m = FeatureRegistry.getManifest(ids[i]);
            if (m && m.enableKey) map[ids[i]] = m.enableKey;
        }
        return map;
    }

    // Sync FeatureRegistry enabled state with ConfigStore after config changes.
    // Detects runtime toggles of legacy ENABLE_X keys and calls
    // FeatureRegistry.enable()/disable() to match old system's real-time responsiveness.
    function _syncFeatureEnabledState() {
        if (!FeatureRegistry || !ConfigStore || !_enableKeyMap) return;
        for (var id in _enableKeyMap) {
            if (!_enableKeyMap.hasOwnProperty(id)) continue;
            var nowEnabled = ConfigStore.get(id, "enabled");
            var wasEnabled = FeatureRegistry.isEnabled(id);
            if (nowEnabled && !wasEnabled) {
                FeatureRegistry.enable(id);
                if (Logger) Logger.logInfo("App", "runtime enable: " + id);
            } else if (!nowEnabled && wasEnabled) {
                FeatureRegistry.disable(id);
                if (Logger) Logger.logInfo("App", "runtime disable: " + id);
            }
        }
    }

    function _findHud() {
        if (_hudPanel && PanelHelpers && PanelHelpers.isPanelAlive(_hudPanel)) return _hudPanel;
        if (PanelHelpers) {
            _hudPanel = PanelHelpers.findHud();
            return _hudPanel;
        }
        // Fallback if PanelHelpers not loaded
        var hud = $.GetContextPanel().FindChildTraverse("Hud");
        if (!hud) {
            var absRoot = $.GetContextPanel();
            var depth = 0;
            while (absRoot.GetParent() && depth < 64) {
                absRoot = absRoot.GetParent();
                depth++;
            }
            hud = absRoot.FindChildTraverse("Hud");
        }
        if (hud) _hudPanel = hud;
        return hud;
    }

    // Step 0a+0d: unwrap the old system's config envelope {schema, data} → flat object
    function _unwrapEnvelope(raw) {
        if (!raw) return null;
        try {
            var envelope = JSON.parse(raw);
            // Old system wraps config: { schema: "3.1.9", data: { KEY: value, ... } }
            if (envelope && envelope.data && typeof envelope.data === "object") {
                return envelope.data;
            }
            // If no envelope wrapper, assume the raw JSON is already flat config
            if (envelope && typeof envelope === "object" && !envelope.schema) {
                return envelope;
            }
        } catch (e) {}
        return null;
    }

    function _startConfigPolling(hud) {
        if (_configPollTimer) return;
        try {
            if (typeof hud.GetAttributeString === "function") {
                _lastConfigRaw = hud.GetAttributeString(_CONFIG_ATTRIBUTE, "");
            }
        } catch (e) { /* will poll on next tick */ }

        function poll() {
            if (!_booted) return;
            var hudPanel = _findHud();
            if (!hudPanel) {
                _configPollTimer = $.Schedule(0.5, poll);
                return;
            }
            var raw = "";
            try {
                if (typeof hudPanel.GetAttributeString === "function") {
                    raw = hudPanel.GetAttributeString(_CONFIG_ATTRIBUTE, "");
                }
            } catch (e) {
                _configPollTimer = $.Schedule(0.5, poll);
                return;
            }
            // Step 0d: only reprocess if raw changed (caching guard)
            if (raw !== _lastConfigRaw) {
                _lastConfigRaw = raw;
                var flatConfig = _unwrapEnvelope(raw);
                if (flatConfig && ConfigAdapter) {
                    try {
                        // Step 0d: use loadFromFlat which handles flat→nested mapping
                        ConfigAdapter.loadFromFlat(flatConfig, _enableKeyMap);
                        // Runtime toggle detection: sync FeatureRegistry enabled state
                        // with ConfigStore after legacy enableKey injection
                        _syncFeatureEnabledState();
                        if (Logger) Logger.logDebug("App", "config poll: updated from attribute");
                    } catch (e) {
                        if (Logger) Logger.logWarn("App", "config poll adapter failed: " + (e.message || e));
                    }
                }
            }
            _configPollTimer = $.Schedule(0.5, poll);
        }
        _configPollTimer = $.Schedule(0.5, poll);
    }

    // -- Public API --
    function boot() {
        if (_booted) {
            $.Msg("[QOLLock] App: already booted — skipping.");
            return true;
        }

        $.Msg("[QOLLock] App: booting QOLLock v" +
              (QOL.VERSION || "?.?.?") + " (build " + (QOL.BUILD || "?") + ")");

        var hud = _findHud();
        if (!hud) {
            $.Msg("[QOLLock] App: Hud panel not found — cannot boot.");
            return false;
        }

        // Build enableKey map from registered manifests (for legacy config bridging)
        _enableKeyMap = _buildEnableKeyMap();

        // Step 0a+0c: Load config from old system's attribute, unwrap envelope,
        // use ConfigAdapter to handle flat→nested mapping
        var storedConfig = null;
        try {
            if (typeof hud.GetAttributeString === "function") {
                var raw = hud.GetAttributeString(_CONFIG_ATTRIBUTE, "");
                if (raw) {
                    var flatConfig = _unwrapEnvelope(raw);
                    if (flatConfig && ConfigAdapter) {
                        // Step 0c: use loadFromFlat for flat→nested transformation
                        // Pass enableKeyMap so legacy ENABLE_X keys inject "enabled: true"
                        ConfigAdapter.loadFromFlat(flatConfig, _enableKeyMap);
                        if (Logger) Logger.logInfo("App", "config loaded via ConfigAdapter");
                    }
                    storedConfig = JSON.parse(raw);
                }
            }
        } catch (e) {
            if (Logger) Logger.logWarn("App", "config load failed, using defaults: " + (e.message || e));
        }

        // Step 0c: Pass reconstructed per-feature config to FeatureRegistry
        // (ConfigStore.exportAll() returns {featureId: {key: value}} format)
        var featureConfig = ConfigStore.exportAll();
        if (FeatureRegistry) {
            FeatureRegistry.boot(featureConfig);
        }

        _startConfigPolling(hud);
        _booted = true;

        // P0: Boot health summary — one-line check for registration + errors.
        if (FeatureRegistry) {
            var ids = FeatureRegistry.getRegisteredIds();
            var enabled = [];
            for (var i = 0; i < ids.length; i++) {
                if (FeatureRegistry.isEnabled(ids[i])) enabled.push(ids[i]);
            }
            var errors = (Logger && Logger.getErrors) ? Logger.getErrors(10) : null;
            $.Msg("[QOLLock] Boot health: " + ids.length + " registered, " +
                  enabled.length + " enabled, " + (errors && errors.length ? errors.length + " errors" : "0 errors"));
        }

        // Step 0f: Diagnostic canary — verify config bridge is working.
        // Only test features that have been wired (schema registered).
        if (Logger) {
            var canaryFeature = ConfigStore.hasSchema("ql_ammo") ? "ql_ammo" :
                               ConfigStore.hasSchema("ql_cast_failed_hint") ? "ql_cast_failed_hint" : null;
            if (canaryFeature) {
                var canaryVal = ConfigStore.get(canaryFeature, "ENABLE_AMMO_STATUS");
                var canaryScale = ConfigStore.get(canaryFeature, "AMMO_PANEL_SCALE");
                Logger.logInfo("App", "ConfigBridge canary (" + canaryFeature + "): ENABLE_AMMO_STATUS=" +
                    canaryVal + " AMMO_PANEL_SCALE=" + canaryScale +
                    " (undefined=broken, default=no-user-config)");
                if (canaryScale !== undefined && (typeof canaryScale !== "number" || canaryScale < 50 || canaryScale > 200)) {
                    Logger.logWarn("App", "Normalization canary FAIL: AMMO_PANEL_SCALE=" + canaryScale);
                }
            } else {
                Logger.logInfo("App", "ConfigBridge canary: no wired features to test (expected until Step 2)");
            }
        }

        return true;
    }

    function _stopConfigPolling() {
        if (_configPollTimer) { $.CancelScheduled(_configPollTimer); _configPollTimer = null; }
    }

    function shutdown() {
        if (!_booted) return;
        _stopConfigPolling();
        if (FeatureRegistry) FeatureRegistry.shutdown();
        // Save config to Hud panel attribute (write back to old system's attribute during migration)
        if (ConfigStore) {
            var hud = _findHud();
            if (hud && typeof hud.SetAttributeString === "function") {
                try {
                    var flatExport = ConfigAdapter ? ConfigAdapter.exportToFlat() : {};
                    // Wrap in old system's envelope format for backward compat
                    var envelope = JSON.stringify({
                        schema: (QOL.schemaSemver || QOL.SCHEMA_SEMVER || "3.1.9"),
                        data: flatExport
                    });
                    hud.SetAttributeString(_CONFIG_ATTRIBUTE, envelope);
                } catch (e) {
                    if (Logger) Logger.logWarn("App", "config save failed: " + (e.message || e));
                }
            }
        }
        _booted = false;
    }

    function isBooted() { return _booted; }
    function getHud() { return _hudPanel || _findHud(); }

    QOL.core.App = {
        boot: boot,
        shutdown: shutdown,
        isBooted: isBooted,
        getHud: getHud
    };

    $.Msg("[QOLLock] core/ql_app: attached to QOL.core.App");

    // Auto-boot: call boot() immediately after all core modules and manifests load.
    QOL.core.App.boot();
})();
