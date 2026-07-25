// =============================================================================
// QOLLOCK — core/ql_app.js
// =============================================================================
// OWNS:        Application boot sequence: find Hud → load config → boot features.
//              500ms config polling bridge (HUD ↔ Settings cross-isolate sync).
// DOES NOT OWN: Feature logic, config schema, scheduling, logging, panel access
// DEPENDS ON:  All core modules (namespace, logger, event_bus, config_store,
//              scheduler, panel_helpers, feature_registry)
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

    function _startConfigPolling(hud) {
        if (_configPollTimer) return;
        try {
            if (typeof hud.GetAttributeString === "function") {
                _lastConfigRaw = hud.GetAttributeString("qollock_config", "");
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
                    raw = hudPanel.GetAttributeString("qollock_config", "");
                }
            } catch (e) {
                _configPollTimer = $.Schedule(0.5, poll);
                return;
            }
            if (raw !== _lastConfigRaw) {
                _lastConfigRaw = raw;
                if (raw && ConfigStore) {
                    try {
                        var parsed = JSON.parse(raw);
                        var changed = ConfigStore.syncFromExternal(parsed);
                        if (changed > 0 && Logger) {
                            Logger.logInfo("App", "config poll: " + changed + " changed setting(s)");
                        }
                    } catch (e) {
                        if (Logger) Logger.logWarn("App", "config poll parse failed");
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

        // Load persisted config from panel attribute
        var storedConfig = {};
        try {
            if (typeof hud.GetAttributeString === "function") {
                var raw = hud.GetAttributeString("qollock_config", "");
                if (raw) storedConfig = JSON.parse(raw);
            }
        } catch (e) {
            if (Logger) Logger.logWarn("App", "config load failed, using defaults");
        }

        if (ConfigStore && storedConfig) {
            ConfigStore.load(storedConfig);
        }

        if (FeatureRegistry) {
            FeatureRegistry.boot(storedConfig);
        }

        _startConfigPolling(hud);
        _booted = true;
        if (Logger) Logger.logInfo("App", "boot complete");
        return true;
    }

    function shutdown() {
        if (!_booted) return;
        if (FeatureRegistry) FeatureRegistry.shutdown();
        // Save config to Hud panel attribute
        if (ConfigStore) {
            var hud = _findHud();
            if (hud && typeof hud.SetAttributeString === "function") {
                try {
                    hud.SetAttributeString("qollock_config",
                        JSON.stringify(ConfigStore.all("*") || {}));
                } catch (e) {
                    if (Logger) Logger.logWarn("App", "config save failed");
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
})();
