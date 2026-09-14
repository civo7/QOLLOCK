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
    var _lastRevision = 0;
    var _configPollTimer = null;
    var _enableKeyMap = null;
    // Step 0a: during migration, read from old system's attribute
    var _CONFIG_ATTRIBUTE = "Deadlock_Mod_Settings_v1";
    var _REV_ATTRIBUTE = (typeof QOL_USER_EDIT_REV_ATTR !== "undefined") ? QOL_USER_EDIT_REV_ATTR :
                         ((typeof USER_EDIT_REV_ATTR !== "undefined") ? USER_EDIT_REV_ATTR : "QOL_USER_EDIT_REV");
    var _lastDiagForceToken = "";
    var _diagWriteNextMs = 0;

    // Build featureId → enableKey map from registered manifests.
    // A manifest declares either enableKey (single legacy toggle) or enableKeys
    // (array, OR semantics — any one toggle boots the feature). Multi-key features
    // need the array form: gating them on one key leaves their other toggles dead.
    function _buildEnableKeyMap() {
        var map = {};
        if (!FeatureRegistry) return map;
        var ids = FeatureRegistry.getRegisteredIds();
        for (var i = 0; i < ids.length; i++) {
            var m = FeatureRegistry.getManifest(ids[i]);
            if (!m) continue;
            if (m.enableKeys && m.enableKeys.length > 0) {
                map[ids[i]] = m.enableKeys;
            } else if (m.enableKey) {
                map[ids[i]] = m.enableKey;
            } else if (m.settings && m.settings.length > 0) {
                var detected = [];
                for (var s = 0; s < m.settings.length; s++) {
                    var k = m.settings[s].key;
                    if (m.settings[s].type === "toggle" && (k.indexOf("ENABLE") !== -1 || k.indexOf("ENABLED") !== -1 || k.indexOf("HUD_") === 0)) {
                        detected.push(k);
                    }
                }
                if (detected.length === 1) {
                    map[ids[i]] = detected[0];
                } else if (detected.length > 1) {
                    map[ids[i]] = detected;
                }
            }
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

    function _parseRev(v) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return 0;
        return Math.floor(n);
    }

    function _getSearchPanels(hudPanel) {
        var panels = [];
        var seen = [];
        function add(p) {
            if (!p || typeof p.GetAttributeString !== "function") return;
            if (seen.indexOf(p) !== -1) return;
            seen.push(p);
            panels.push(p);
        }
        add(hudPanel);
        if (typeof $.GetContextPanel === "function") {
            var ctx = $.GetContextPanel();
            add(ctx);
            var cur = ctx;
            var depth = 0;
            while (cur && cur.GetParent && depth < 64) {
                cur = cur.GetParent();
                add(cur);
                depth++;
            }
        }
        return panels;
    }

    function _readBestConfig(hudPanel) {
        var panels = _getSearchPanels(hudPanel);
        var bestRaw = "";
        var bestRev = -1;
        var bestPanel = null;

        for (var i = 0; i < panels.length; i++) {
            var p = panels[i];
            try {
                var raw = p.GetAttributeString(_CONFIG_ATTRIBUTE, "");
                var rev = _parseRev(p.GetAttributeString(_REV_ATTRIBUTE, "0"));
                if (raw) {
                    if (rev > bestRev) {
                        bestRev = rev;
                        bestRaw = raw;
                        bestPanel = p;
                    } else if (rev === bestRev && !bestRaw) {
                        bestRaw = raw;
                        bestPanel = p;
                    }
                }
            } catch (e) {}
        }
        return { raw: bestRaw, rev: bestRev > 0 ? bestRev : 0, sourcePanel: bestPanel };
    }

    function _syncRootClasses(hudPanel, flatConfig) {
        if (!hudPanel) hudPanel = _findHud();
        if (!hudPanel) return;
        if (!flatConfig) {
            var globalState = (typeof State !== "undefined" && State) ? State :
                              ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
            if (globalState && globalState.lastConfig) flatConfig = globalState.lastConfig;
            else if (ConfigAdapter) flatConfig = ConfigAdapter.exportToFlat();
        }
        if (!flatConfig) return;
        if (QOL && QOL.core && QOL.core.hud && typeof QOL.core.hud.applyRootClasses === "function") {
            try {
                var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                var isHideout = (QOL.isConnectedToHideout && QOL.isConnectedToHideout(hudPanel)) || false;
                QOL.core.hud.applyRootClasses(hudPanel, flatConfig, nowMs, isHideout, true);
            } catch (e) {
                if (Logger) Logger.logWarn("App", "applyRootClasses failed: " + (e.message || e));
            }
        }
    }

    function _applyConfigUpdate(raw, rev, hudPanel, sourcePanel) {
        _lastConfigRaw = raw;
        if (rev > _lastRevision) _lastRevision = rev;

        // Propagate the latest config & revision down to hudPanel if read from an ancestor
        if (hudPanel && sourcePanel && sourcePanel !== hudPanel && typeof hudPanel.SetAttributeString === "function") {
            try {
                hudPanel.SetAttributeString(_CONFIG_ATTRIBUTE, raw);
                hudPanel.SetAttributeString(_REV_ATTRIBUTE, String(_lastRevision));
            } catch (eSync) {}
        }

        var flatConfig = _unwrapEnvelope(raw);
        if (flatConfig) {
            var globalState = (typeof State !== "undefined" && State) ? State :
                              ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
            if (globalState) {
                globalState.lastConfig = flatConfig;
            }
            if (ConfigAdapter) {
                try {
                    // Step 0d: use loadFromFlat which handles flat→nested mapping
                    ConfigAdapter.loadFromFlat(flatConfig, _enableKeyMap);
                    // Runtime toggle detection: sync FeatureRegistry enabled state
                    // with ConfigStore after legacy enableKey injection
                    _syncFeatureEnabledState();
                    if (Logger) Logger.logDebug("App", "config: applied revision " + _lastRevision);
                } catch (e) {
                    if (Logger) Logger.logWarn("App", "config adapter failed: " + (e.message || e));
                }
            }
            _syncRootClasses(hudPanel, flatConfig);
        }
    }

    function _readDiagRequest(hudPanel) {
        if (!hudPanel) return "";
        try {
            var tok = hudPanel.GetAttributeString("QOL_DiagRequest", "");
            if (tok) return tok;
        } catch (e) {}
        var panels = _getSearchPanels(hudPanel);
        for (var i = 0; i < panels.length; i++) {
            try {
                var pTok = panels[i].GetAttributeString("QOL_DiagRequest", "");
                if (pTok) return pTok;
            } catch (e2) {}
        }
        return "";
    }

    function _buildDiagSnapshot(forceToken) {
        var registered = FeatureRegistry ? FeatureRegistry.getRegisteredIds().sort() : [];
        var enabled = FeatureRegistry ? FeatureRegistry.getEnabledIds().sort() : [];
        var errors = FeatureRegistry ? FeatureRegistry.getErrorCounts() : {};
        var disabledList = [];
        if (typeof QOL !== "undefined" && QOL.autoDisabledFeatures) {
            disabledList = QOL.autoDisabledFeatures.slice();
        }
        var globalState = (typeof State !== "undefined" && State) ? State :
                          ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
        if (globalState && globalState.featureAutoDisabled) {
            var keys = Object.keys(globalState.featureAutoDisabled);
            for (var k = 0; k < keys.length; k++) {
                if (globalState.featureAutoDisabled[keys[k]] && disabledList.indexOf(keys[k]) === -1) {
                    disabledList.push(keys[k]);
                }
            }
        }

        var diag = {
            features: registered,
            missing: (globalState && globalState._missingFeatureLogged) ? globalState._missingFeatureLogged : {},
            errors: errors,
            disabled: disabledList,
            logs: (typeof __qolLogBuf !== "undefined" && __qolLogBuf) ? __qolLogBuf.slice() : [],
            diagToken: forceToken || "",
            newFeatures: registered,
            newEnabled: enabled,
            newErrors: errors
        };

        if (QOL && QOL.core && QOL.core.ManifestTests) {
            var tr = QOL.core.ManifestTests.getResults();
            if (tr) {
                diag.testResults = {
                    summary: tr.summary,
                    results: tr.results,
                    timestamp: tr.timestamp,
                    token: tr.token
                };
            }
        }

        return diag;
    }

    function _writeDiagSnapshot(hudPanel, forceToken) {
        if (!hudPanel || typeof hudPanel.SetAttributeString !== "function") return;
        try {
            var diag = _buildDiagSnapshot(forceToken);
            hudPanel.SetAttributeString("QOL_Diag", JSON.stringify(diag));
            if (forceToken && Logger) {
                Logger.logInfo("App", "diag force-sync written, token=" + String(forceToken).substring(0, 16) +
                    " features=" + diag.features.length + " disabled=" + diag.disabled.length);
            }
        } catch (e) {
            if (Logger) Logger.logWarn("App", "writeDiagSnapshot failed: " + (e.message || e));
        }
    }

    function _syncDiagnosticState(hudPanel, nowMs) {
        if (!hudPanel) return;
        var forceSync = false;
        var forceToken = "";
        try {
            forceToken = _readDiagRequest(hudPanel);
            if (forceToken && forceToken !== _lastDiagForceToken) {
                _lastDiagForceToken = forceToken;
                forceSync = true;
                if (Logger) Logger.logInfo("App", "diag force-sync requested, token=" + String(forceToken).substring(0, 16));

                // Command dispatch: manifest test runner ("mt_" or "fs_")
                if (forceToken.indexOf("mt_") === 0 || forceToken.indexOf("fs_") === 0) {
                    if (QOL && QOL.core && QOL.core.ManifestTests) {
                        try {
                            QOL.core.ManifestTests.runAll({
                                token: forceToken,
                                onComplete: function () {
                                    _writeDiagSnapshot(hudPanel, forceToken);
                                }
                            });
                        } catch (mtErr) {
                            if (Logger) Logger.logWarn("App", "manifest test run failed: " + (mtErr.message || mtErr));
                        }
                    }
                }

                // Tree dump summary ("dt_")
                if (forceToken.indexOf("dt_") === 0) {
                    if (QOL && typeof QOL.dumpTreeSummary === "function") {
                        try {
                            QOL.dumpTreeSummary(hudPanel);
                        } catch (dtErr) {
                            if (Logger) Logger.logWarn("App", "tree summary failed: " + (dtErr.message || dtErr));
                        }
                    } else if (Logger) {
                        Logger.logWarn("App", "tree summary requested but QOL.dumpTreeSummary unavailable");
                    }
                }

                _writeDiagSnapshot(hudPanel, forceToken);
                _diagWriteNextMs = nowMs + 5000;
                return;
            }
        } catch (eReq) {}

        if (!forceSync && _diagWriteNextMs && _diagWriteNextMs > nowMs) return;
        _diagWriteNextMs = nowMs + 5000;
        _writeDiagSnapshot(hudPanel, "");
    }

    function _syncLoaderOverlays(hudPanel, nowMs) {
        var globalState = (typeof State !== "undefined" && State) ? State :
                          ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
        if (!globalState) return;
        var settingsShowing = !!(globalState.settingsLoaderSessionActive || globalState.settingsLoaderSessionCompleted);
        var saveShowing = !!(globalState.saveSettingsLoaderSessionActive || globalState.saveSettingsLoaderSessionCompleted);

        if (settingsShowing || saveShowing) {
            if (settingsShowing && QOL && typeof QOL.updateSettingsLoaderOverlay === "function") {
                try { QOL.updateSettingsLoaderOverlay(hudPanel, nowMs); } catch (e1) {}
            }
            if (!settingsShowing && saveShowing && QOL && typeof QOL.updateSaveSettingsLoaderOverlay === "function") {
                try { QOL.updateSaveSettingsLoaderOverlay(hudPanel, nowMs); } catch (e2) {}
            }
        }
    }

    function _syncPendingHeroRestore(nowMs) {
        var globalState = (typeof State !== "undefined" && State) ? State :
                          ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
        if (!globalState || !globalState.heroRestorePendingTarget) return;
        var targetHero = (QOL && QOL.normalizeHeroId) ? QOL.normalizeHeroId(globalState.heroRestorePendingTarget) : globalState.heroRestorePendingTarget;
        if (!targetHero) {
            globalState.heroRestorePendingTarget = "";
            return;
        }
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (now < (globalState.heroRestorePendingNextMs || 0)) return;
        var elapsed = now - (Number(globalState.heroRestorePendingStartedMs) || now);
        if (elapsed >= 1200 || elapsed > 3000) {
            if (QOL && typeof QOL.queueShopPulseAfterHeroRestore === "function") {
                QOL.queueShopPulseAfterHeroRestore(now);
            }
            globalState.heroRestorePendingTarget = "";
            return;
        }
        if ((Number(globalState.heroRestorePendingRetries) || 0) < 3) {
            if (QOL && typeof QOL.selectHeroForBuildSave === "function") {
                QOL.selectHeroForBuildSave(targetHero, "restore_retry");
            }
            globalState.heroRestorePendingRetries = (Number(globalState.heroRestorePendingRetries) || 0) + 1;
            globalState.heroRestorePendingNextMs = now + 450;
            return;
        }
        globalState.heroRestorePendingNextMs = now + 450;
    }

    function _startConfigPolling(hud) {
        if (_configPollTimer) return;

        function poll() {
            if (!_booted) return;
            var nowMs = Date.now ? Date.now() : (new Date()).getTime();
            var hudPanel = _findHud();
            var best = _readBestConfig(hudPanel);
            var raw = best.raw;
            var rev = best.rev;

            var changed = false;
            if (raw && rev > _lastRevision) {
                changed = true;
            } else if (raw && raw !== _lastConfigRaw) {
                changed = true;
            }

            if (changed) {
                _applyConfigUpdate(raw, rev, hudPanel, best.sourcePanel);
            } else {
                _syncRootClasses(hudPanel);
            }

            _syncDiagnosticState(hudPanel, nowMs);
            _syncLoaderOverlays(hudPanel, nowMs);
            _syncPendingHeroRestore(nowMs);

            _configPollTimer = $.Schedule(0.25, poll);
        }
        _configPollTimer = $.Schedule(0.25, poll);
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
        var flatConfig = null;
        try {
            var best = _readBestConfig(hud);
            var raw = best.raw;
            _lastRevision = best.rev;
            if (raw) {
                _lastConfigRaw = raw;
                flatConfig = _unwrapEnvelope(raw);
                if (flatConfig && ConfigAdapter) {
                    // Step 0c: use loadFromFlat for flat→nested transformation
                    // Pass enableKeyMap so legacy ENABLE_X keys inject "enabled: true"
                    ConfigAdapter.loadFromFlat(flatConfig, _enableKeyMap);
                    if (Logger) Logger.logInfo("App", "config loaded via ConfigAdapter");
                }
                storedConfig = JSON.parse(raw);
            }
        } catch (e) {
            if (Logger) Logger.logWarn("App", "config load failed, using defaults: " + (e.message || e));
        }

        var globalState = (typeof State !== "undefined" && State) ? State :
                          ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
        if (globalState) {
            if (!flatConfig && ConfigAdapter) {
                flatConfig = ConfigAdapter.exportToFlat();
            }
            globalState.lastConfig = flatConfig || {};
        }

        // Step 0c: Pass reconstructed per-feature config to FeatureRegistry
        // (ConfigStore.exportAll() returns {featureId: {key: value}} format)
        var featureConfig = ConfigStore.exportAll();
        if (FeatureRegistry) {
            FeatureRegistry.boot(featureConfig);
        }

        _syncRootClasses(hud, flatConfig);
        _writeDiagSnapshot(hud, "");
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
                        schema: (QOL.schemaSemver || QOL.SCHEMA_SEMVER || "3.2.0"),
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

    var appApi = {
        boot: boot,
        shutdown: shutdown,
        isBooted: isBooted,
        getHud: getHud,
        syncRootClasses: _syncRootClasses,
        syncDiagnosticState: _syncDiagnosticState,
        writeDiagSnapshot: _writeDiagSnapshot,
        buildDiagSnapshot: _buildDiagSnapshot
    };

    QOL.core.app = appApi;
    QOL.core.App = appApi;

    $.Msg("[QOLLock] core/ql_app: attached to QOL.core.app and QOL.core.App");

    // Auto-boot: call boot() immediately after all core modules and manifests load.
    QOL.core.App.boot();
})();
