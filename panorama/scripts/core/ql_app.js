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
// =============================================================================

(() => {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_app: QOL.core not found — aborting.");
        return;
    }
    const { ConfigStore, ConfigAdapter, FeatureRegistry, Logger } = QOL.core;
    const PanelHelpers = QOL.ui?.PanelHelpers || QOL.core.panel;
    const _nowMs = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.PerfNowMs) ? QOL_UTILS.PerfNowMs : () => (Date.now ? Date.now() : (new Date()).getTime());
    const _parseRev = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.ParseRevisionNumber) ? QOL_UTILS.ParseRevisionNumber : (v) => { const n = Number(v); return (!Number.isFinite(n) || n < 0) ? 0 : Math.floor(n); };

    if (!ConfigStore || !FeatureRegistry) {
        $.Msg(`[QOLLock] core/ql_app: dependencies missing (ConfigStore=${Boolean(ConfigStore)}, FeatureRegistry=${Boolean(FeatureRegistry)}) — aborting.`);
        return;
    }

    let _hudPanel = null;
    let _booted = false;
    let _lastConfigRaw = "";
    let _lastRevision = 0;
    let _configPollTimer = null;
    let _enableKeyMap = null;

    const _CONFIG_ATTRIBUTE = "Deadlock_Mod_Settings_v1";
    const _REV_ATTRIBUTE = (typeof QOL_USER_EDIT_REV_ATTR !== "undefined")
        ? QOL_USER_EDIT_REV_ATTR
        : ((typeof USER_EDIT_REV_ATTR !== "undefined") ? USER_EDIT_REV_ATTR : "QOL_USER_EDIT_REV");
    let _lastDiagForceToken = "";
    let _diagWriteNextMs = 0;
    let _lastBenchmarkReport = null;
    let _benchmarkStressActive = false;
    let _benchmarkStressConfig = null;
    let _benchmarkSavedUserConfig = null;
    let _benchmarkSavedRevision = 0;
    let _benchmarkSavedConfigRaw = "";
    let _benchmarkRestoreTimer = null;

    const _buildEnableKeyMap = () => {
        const map = {};
        if (!FeatureRegistry) return map;
        const ids = FeatureRegistry.getRegisteredIds();
        for (let i = 0; i < ids.length; i++) {
            const m = FeatureRegistry.getManifest(ids[i]);
            if (!m) continue;
            if (m.enableKeys && m.enableKeys.length > 0) {
                map[ids[i]] = m.enableKeys;
            } else if (m.enableKey) {
                map[ids[i]] = m.enableKey;
            } else if (m.settings && m.settings.length > 0) {
                const detected = [];
                for (let s = 0; s < m.settings.length; s++) {
                    const k = m.settings[s].key;
                    if (m.settings[s].type === "toggle" && (k.includes("ENABLE") || k.includes("ENABLED") || k.startsWith("HUD_"))) {
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
    };

    const _buildMaximalConfig = () => {
        let base = {};
        if (typeof QOL !== "undefined" && typeof QOL.buildDefaultConfig === "function") {
            try { base = QOL.buildDefaultConfig(); } catch (_) {}
        }
        if (!base || Object.keys(base).length === 0) {
            if (ConfigAdapter && typeof ConfigAdapter.exportToFlat === "function") {
                try { base = ConfigAdapter.exportToFlat(); } catch (_) {}
            }
        }
        const maxCfg = Object.assign({}, base);
        for (const k in maxCfg) {
            if (/^(ENABLE_|DISABLE_|HUD_.*_ENABLED$|SUPPORT_|SHOW_|MINIMAL_)/.test(k)) {
                if (k.startsWith("DISABLE_")) continue;
                maxCfg[k] = 1;
            }
        }
        if (FeatureRegistry && typeof FeatureRegistry.getRegisteredIds === "function") {
            const ids = FeatureRegistry.getRegisteredIds();
            for (let i = 0; i < ids.length; i++) {
                const m = FeatureRegistry.getManifest(ids[i]);
                if (!m) continue;
                if (m.enableKey) maxCfg[m.enableKey] = 1;
                if (Array.isArray(m.enableKeys)) {
                    for (let k = 0; k < m.enableKeys.length; k++) maxCfg[m.enableKeys[k]] = 1;
                }
                if (Array.isArray(m.settings)) {
                    for (let s = 0; s < m.settings.length; s++) {
                        const setting = m.settings[s];
                        const sk = setting.key;
                        if (!sk || sk.startsWith("DISABLE_")) continue;
                        if (setting.type === "toggle") {
                            maxCfg[sk] = 1;
                        } else if (setting.type === "multitoggle" && Array.isArray(setting.options)) {
                            for (let o = 0; o < setting.options.length; o++) {
                                const ok = setting.options[o]?.key;
                                if (ok && !ok.startsWith("DISABLE_")) maxCfg[ok] = 1;
                            }
                        }
                    }
                }
            }
        }
        return maxCfg;
    };

    const _syncFeatureEnabledState = () => {
        if (!FeatureRegistry || !ConfigStore) return;
        const ids = (typeof FeatureRegistry.getRegisteredIds === "function")
            ? FeatureRegistry.getRegisteredIds()
            : Object.keys(_enableKeyMap || {});
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const nowEnabled = (typeof FeatureRegistry.isFeatureSupposedToBeEnabled === "function")
                ? FeatureRegistry.isFeatureSupposedToBeEnabled(id)
                : !!ConfigStore.get(id, "enabled");
            const wasEnabled = FeatureRegistry.isEnabled(id);
            if (nowEnabled && !wasEnabled) {
                FeatureRegistry.enable(id);
                if (Logger) Logger.logInfo("App", `runtime enable: ${id}`);
            } else if (!nowEnabled && wasEnabled) {
                FeatureRegistry.disable(id);
                if (Logger) Logger.logInfo("App", `runtime disable: ${id}`);
            }
        }
    };

    const _findHud = () => {
        if (_hudPanel && PanelHelpers && PanelHelpers.isPanelAlive(_hudPanel)) return _hudPanel;
        if (PanelHelpers?.findHud) {
            _hudPanel = PanelHelpers.findHud();
            return _hudPanel;
        }
        return null;
    };

    const _getSearchPanels = (hudPanel) => {
        const panels = [];
        const seen = new Set();
        const add = (p) => {
            if (!p || typeof p.GetAttributeString !== "function") return;
            if (seen.has(p)) return;
            seen.add(p);
            panels.push(p);
        };
        add(hudPanel);
        if (typeof $.GetContextPanel === "function") {
            const ctx = $.GetContextPanel();
            add(ctx);
            let cur = ctx;
            let depth = 0;
            while (cur && cur.GetParent && depth < 64) {
                cur = cur.GetParent();
                add(cur);
                depth++;
            }
        }
        return panels;
    };

    const _readBestConfig = (hudPanel) => {
        const panels = _getSearchPanels(hudPanel);
        let bestRaw = "";
        let bestRev = -1;
        let bestPanel = null;

        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            try {
                const raw = p.GetAttributeString(_CONFIG_ATTRIBUTE, "");
                const rev = _parseRev(p.GetAttributeString(_REV_ATTRIBUTE, "0"));
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
            } catch (_) {}
        }
        return { raw: bestRaw, rev: bestRev > 0 ? bestRev : 0, sourcePanel: bestPanel };
    };

    const _syncRootClasses = (hudPanel, flatConfig) => {
        if (!hudPanel) hudPanel = _findHud();
        if (!hudPanel) return;
        if (!flatConfig) {
            if (_benchmarkStressActive && _benchmarkStressConfig) {
                flatConfig = _benchmarkStressConfig;
            } else {
                const globalState = (typeof State !== "undefined" && State) ? State :
                                  ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
                if (globalState?.lastConfig) flatConfig = globalState.lastConfig;
                else if (ConfigAdapter) flatConfig = ConfigAdapter.exportToFlat();
            }
        }
        if (!flatConfig) return;
        if (QOL?.core?.hud && typeof QOL.core.hud.applyRootClasses === "function") {
            try {
                const nowMs = _nowMs();
                const isHideout = (QOL.isConnectedToHideout && QOL.isConnectedToHideout(hudPanel)) || false;
                QOL.core.hud.applyRootClasses(hudPanel, flatConfig, nowMs, isHideout, true);
            } catch (e) {
                if (Logger) Logger.logWarn("App", `applyRootClasses failed: ${e.message || e}`);
            }
        }
    };

    const _applyConfigUpdate = (raw, rev, hudPanel, sourcePanel) => {
        _lastConfigRaw = raw;
        if (rev > _lastRevision) _lastRevision = rev;

        if (hudPanel && sourcePanel && sourcePanel !== hudPanel && typeof hudPanel.SetAttributeString === "function") {
            try {
                hudPanel.SetAttributeString(_CONFIG_ATTRIBUTE, raw);
                hudPanel.SetAttributeString(_REV_ATTRIBUTE, String(_lastRevision));
            } catch (_) {}
        }

        const flatConfig = QOL.safeParseConfig(raw) || QOL.buildDefaultConfig();
        if (flatConfig) {
            const globalState = (typeof State !== "undefined" && State) ? State :
                              ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
            if (globalState) {
                globalState.lastConfig = flatConfig;
            }
            if (ConfigAdapter) {
                try {
                    ConfigAdapter.loadFromFlat(flatConfig, _enableKeyMap);
                    _syncFeatureEnabledState();
                    if (Logger) Logger.logDebug("App", `config: applied revision ${_lastRevision}`);
                } catch (e) {
                    if (Logger) Logger.logWarn("App", `config adapter failed: ${e.message || e}`);
                }
            }
            _syncRootClasses(hudPanel, flatConfig);
        }
    };

    const _restoreStressBenchmark = (hudPanel, reason) => {
        if (!_benchmarkStressActive) return;
        _benchmarkStressActive = false;
        _benchmarkStressConfig = null;
        if (_benchmarkRestoreTimer) {
            try { $.CancelScheduled(_benchmarkRestoreTimer); } catch (_) {}
            _benchmarkRestoreTimer = null;
        }

        const saved = _benchmarkSavedUserConfig;
        _benchmarkSavedUserConfig = null;
        const savedRev = _benchmarkSavedRevision;
        const savedRaw = _benchmarkSavedConfigRaw;

        if (saved) {
            try {
                const globalState = (typeof State !== "undefined" && State) ? State :
                                  ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
                if (globalState) {
                    globalState.lastConfig = saved;
                }
                if (ConfigAdapter && typeof ConfigAdapter.loadFromFlat === "function") {
                    ConfigAdapter.loadFromFlat(saved, _enableKeyMap);
                }
                _syncFeatureEnabledState();
                _syncRootClasses(hudPanel, saved);
                _lastRevision = savedRev;
                _lastConfigRaw = savedRaw;
                const restoredIds = (FeatureRegistry && typeof FeatureRegistry.getEnabledIds === "function")
                    ? FeatureRegistry.getEnabledIds() : [];
                if (Logger) Logger.logInfo("Benchmark", `Stress benchmark restored (${reason || "normal"}): original user config restored (${restoredIds.length} manifests active)`);
                $.Msg(`[QOLLock][Benchmark] Stress benchmark finished (${reason || "normal"}). Restored to ${restoredIds.length} active manifests.`);
            } catch (e) {
                if (Logger) Logger.logWarn("Benchmark", `Benchmark stress restore failed: ${e?.message || e}`);
            }
        }
    };

    const _readDiagRequest = (hudPanel) => {
        if (!hudPanel) return "";
        try {
            const tok = hudPanel.GetAttributeString("QOL_DiagRequest", "");
            if (tok) return tok;
        } catch (_) {}
        const panels = _getSearchPanels(hudPanel);
        for (let i = 0; i < panels.length; i++) {
            try {
                const pTok = panels[i].GetAttributeString("QOL_DiagRequest", "");
                if (pTok) return pTok;
            } catch (_) {}
        }
        return "";
    };

    const _buildDiagSnapshot = (forceToken) => {
        const registered = FeatureRegistry ? FeatureRegistry.getRegisteredIds().sort() : [];
        const enabled = FeatureRegistry ? FeatureRegistry.getEnabledIds().sort() : [];
        const errors = FeatureRegistry ? FeatureRegistry.getErrorCounts() : {};
        let disabledList = [];
        if (typeof QOL !== "undefined" && QOL.autoDisabledFeatures) {
            disabledList = QOL.autoDisabledFeatures.slice();
        }
        const globalState = (typeof State !== "undefined" && State) ? State :
                          ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
        if (globalState?.featureAutoDisabled) {
            const keys = Object.keys(globalState.featureAutoDisabled);
            for (let k = 0; k < keys.length; k++) {
                if (globalState.featureAutoDisabled[keys[k]] && !disabledList.includes(keys[k])) {
                    disabledList.push(keys[k]);
                }
            }
        }

        const diag = {
            features: registered,
            missing: globalState?._missingFeatureLogged ? globalState._missingFeatureLogged : {},
            errors,
            disabled: disabledList,
            logs: (typeof __qolLogBuf !== "undefined" && __qolLogBuf) ? __qolLogBuf.slice() : [],
            diagToken: forceToken || "",
            newFeatures: registered,
            newEnabled: enabled,
            newErrors: errors
        };

        if (QOL?.core?.ManifestTests) {
            const tr = QOL.core.ManifestTests.getResults();
            if (tr) {
                diag.testResults = tr;
            }
        }

        if (_lastBenchmarkReport) {
            diag.benchmark = _lastBenchmarkReport;
        }

        return diag;
    };

    const _writeDiagSnapshot = (hudPanel, forceToken) => {
        if (!hudPanel || typeof hudPanel.SetAttributeString !== "function") return;
        try {
            const diag = _buildDiagSnapshot(forceToken);
            hudPanel.SetAttributeString("QOL_Diag", JSON.stringify(diag));
            if (forceToken && Logger) {
                Logger.logInfo("App", `diag force-sync written, token=${String(forceToken).substring(0, 16)} features=${diag.features.length} disabled=${diag.disabled.length}`);
            }
        } catch (e) {
            if (Logger) Logger.logWarn("App", `writeDiagSnapshot failed: ${e.message || e}`);
        }
    };

    const _syncDiagnosticState = (hudPanel, nowMs) => {
        if (!hudPanel) return;
        let forceSync = false;
        let forceToken = "";
        try {
            forceToken = _readDiagRequest(hudPanel);
            if (forceToken && forceToken !== _lastDiagForceToken) {
                _lastDiagForceToken = forceToken;
                forceSync = true;
                if (Logger) Logger.logInfo("App", `diag force-sync requested, token=${String(forceToken).substring(0, 16)}`);

                if (forceToken.startsWith("mt_") || forceToken.startsWith("fs_") || forceToken.startsWith("audit_")) {
                    if (QOL?.core?.ManifestTests) {
                        try {
                            const engineAudit = forceToken.startsWith("audit_")
                                ? QOL.core.ManifestTests.runEngineAudit()
                                : null;
                            QOL.core.ManifestTests.runAll({
                                token: forceToken,
                                engineAudit,
                                onComplete: () => {
                                    _writeDiagSnapshot(hudPanel, forceToken);
                                }
                            });
                        } catch (mtErr) {
                            if (Logger) Logger.logWarn("App", `manifest test run failed: ${mtErr.message || mtErr}`);
                        }
                    }
                }

                if (forceToken.startsWith("bm_")) {
                    const parts = forceToken.split("_");
                    const durSec = parseFloat(parts[1]) || 10;
                    const isStress = parts[2] === "stress";

                    if (isStress) {
                        try {
                            const globalState = (typeof State !== "undefined" && State) ? State :
                                              ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
                            if (!_benchmarkStressActive) {
                                let savedFlatConfig = null;
                                if (ConfigAdapter && typeof ConfigAdapter.exportToFlat === "function") {
                                    savedFlatConfig = ConfigAdapter.exportToFlat();
                                } else if (globalState?.lastConfig && Object.keys(globalState.lastConfig).length > 0) {
                                    savedFlatConfig = Object.assign({}, globalState.lastConfig);
                                } else if (typeof QOL !== "undefined" && typeof QOL.buildDefaultConfig === "function") {
                                    savedFlatConfig = QOL.buildDefaultConfig();
                                }

                                _benchmarkStressActive = true;
                                _benchmarkSavedUserConfig = savedFlatConfig;
                                _benchmarkSavedRevision = _lastRevision;
                                _benchmarkSavedConfigRaw = _lastConfigRaw;
                            }

                            const maxConfig = _buildMaximalConfig();
                            _benchmarkStressConfig = maxConfig;

                            if (globalState) {
                                globalState.lastConfig = maxConfig;
                            }
                            if (ConfigAdapter && typeof ConfigAdapter.loadFromFlat === "function") {
                                ConfigAdapter.loadFromFlat(maxConfig, _enableKeyMap);
                            }
                            _syncFeatureEnabledState();
                            _syncRootClasses(hudPanel, maxConfig);

                            if (_benchmarkRestoreTimer) {
                                try { $.CancelScheduled(_benchmarkRestoreTimer); } catch (_) {}
                                _benchmarkRestoreTimer = null;
                            }
                            _benchmarkRestoreTimer = $.Schedule(durSec + 3.0, () => {
                                _restoreStressBenchmark(hudPanel, "safety-timeout");
                            });

                            const enabledIds = (FeatureRegistry && typeof FeatureRegistry.getEnabledIds === "function")
                                ? FeatureRegistry.getEnabledIds() : [];
                            const totalIds = (FeatureRegistry && typeof FeatureRegistry.getRegisteredIds === "function")
                                ? FeatureRegistry.getRegisteredIds() : [];
                            if (Logger) {
                                Logger.logInfo("Benchmark", `Stress setup started: ${enabledIds.length}/${totalIds.length} manifests active, root HUD classes applied for ${durSec}s`);
                            }
                            $.Msg(`[QOLLock][Benchmark] Stress setup active: ${enabledIds.length} feature manifests running, root HUD classes active for ${durSec}s`);
                        } catch (e) {
                            _benchmarkStressActive = false;
                            if (Logger) Logger.logWarn("Benchmark", `Benchmark stress setup failed: ${e?.message || e}`);
                        }
                    } else {
                        const enabledIds = (FeatureRegistry && typeof FeatureRegistry.getEnabledIds === "function")
                            ? FeatureRegistry.getEnabledIds() : [];
                        if (Logger) {
                            Logger.logInfo("Benchmark", `Normal benchmark started: ${enabledIds.length} manifests active (current config) for ${durSec}s`);
                        }
                        $.Msg(`[QOLLock][Benchmark] Normal benchmark started: ${enabledIds.length} active manifests for ${durSec}s`);
                    }

                    if (QOL?.core?.Scheduler?.startBenchmark) {
                        try {
                            QOL.core.Scheduler.startBenchmark(durSec, (report, stats) => {
                                if (isStress) {
                                    _restoreStressBenchmark(hudPanel, "complete");
                                }
                                _lastBenchmarkReport = {
                                    token: forceToken,
                                    report,
                                    stats,
                                    timestamp: _nowMs()
                                };
                                _writeDiagSnapshot(hudPanel, forceToken);
                            });
                        } catch (bmErr) {
                            if (isStress) _restoreStressBenchmark(hudPanel, "error");
                            if (Logger) Logger.logWarn("Benchmark", `Benchmark start failed: ${bmErr.message || bmErr}`);
                        }
                    } else if (Logger) {
                        if (isStress) _restoreStressBenchmark(hudPanel, "unavailable");
                        Logger.logWarn("Benchmark", "Benchmark requested but Scheduler.startBenchmark unavailable");
                    }
                }

                if (forceToken.startsWith("dt_")) {
                    if (QOL && typeof QOL.dumpTreeSummary === "function") {
                        try {
                            QOL.dumpTreeSummary(hudPanel);
                        } catch (dtErr) {
                            if (Logger) Logger.logWarn("App", `tree summary failed: ${dtErr.message || dtErr}`);
                        }
                    } else if (Logger) {
                        Logger.logWarn("App", "tree summary requested but QOL.dumpTreeSummary unavailable");
                    }
                }

                _writeDiagSnapshot(hudPanel, forceToken);
                _diagWriteNextMs = nowMs + 5000;
                return;
            }
        } catch (_) {}

        if (!forceSync && _diagWriteNextMs && _diagWriteNextMs > nowMs) return;
        _diagWriteNextMs = nowMs + 5000;
        _writeDiagSnapshot(hudPanel, "");
    };

    const _startConfigPolling = (hud) => {
        if (_configPollTimer) return;

        let _nextRootClassSyncMs = 0;

        const poll = () => {
            if (!_booted) return;
            const hudPanel = _hudPanel || _findHud();
            if (hudPanel && typeof hudPanel.IsValid === "function" && !hudPanel.IsValid()) {
                shutdown();
                return;
            }
            const nowMs = _nowMs();
            const best = _readBestConfig(hudPanel);
            const { raw, rev } = best;

            let changed = false;
            if (raw && rev > _lastRevision) {
                changed = true;
            } else if (raw && raw !== _lastConfigRaw) {
                changed = true;
            }

            if (changed) {
                if (_benchmarkStressActive) {
                    // While stress test is running, do not clobber maximal benchmark config.
                    // Buffer incoming user config updates so they are cleanly restored at completion.
                    const newest = (typeof QOL !== "undefined" && QOL.safeParseConfig) ? QOL.safeParseConfig(raw) : null;
                    if (newest) _benchmarkSavedUserConfig = newest;
                    _benchmarkSavedRevision = rev;
                    _benchmarkSavedConfigRaw = raw;
                } else {
                    _applyConfigUpdate(raw, rev, hudPanel, best.sourcePanel);
                    _nextRootClassSyncMs = nowMs + 1000;
                }
            } else if (nowMs >= _nextRootClassSyncMs) {
                _syncRootClasses(hudPanel, _benchmarkStressActive ? _benchmarkStressConfig : undefined);
                _nextRootClassSyncMs = nowMs + 1000;
            }

            _syncDiagnosticState(hudPanel, nowMs);

            _configPollTimer = $.Schedule(0.25, poll);
        };
        _configPollTimer = $.Schedule(0.25, poll);
    };

    let _engineEventsRegistered = false;
    const _registerEngineEvents = () => {
        if (_engineEventsRegistered) return;
        if (typeof $.RegisterForUnhandledEvent !== "function") return;
        _engineEventsRegistered = true;

        try {
            $.RegisterForUnhandledEvent("CitadelGameStateChanged", () => {
                const hud = _hudPanel || _findHud();
                if (hud && typeof hud.IsValid === "function" && !hud.IsValid()) {
                    shutdown();
                    return;
                }
                try {
                    if (typeof ClearPanelCache === "function") ClearPanelCache();
                    if (typeof PanelCache !== "undefined" && typeof PanelCache.clear === "function") PanelCache.clear();
                    if (QOL?.panelCache && typeof QOL.panelCache.clear === "function") QOL.panelCache.clear();
                } catch (_) {}
                if (hud) _syncRootClasses(hud);
                if (QOL?.core?.EventBus) {
                    try { QOL.core.EventBus.emit("engine:game_state_changed"); } catch (_) {}
                }
            });
        } catch (e) {
            if (Logger) Logger.logDebug("App", `CitadelGameStateChanged event not available: ${e?.message || e}`);
        }

        try {
            $.RegisterForUnhandledEvent("CitadelUserMsg_ForceShopClosed", () => {
                if (QOL?.core?.EventBus) {
                    try { QOL.core.EventBus.emit("engine:shop_closed"); } catch (_) {}
                }
            });
        } catch (e) {
            if (Logger) Logger.logDebug("App", `CitadelUserMsg_ForceShopClosed event not available: ${e?.message || e}`);
        }

        try {
            $.RegisterForUnhandledEvent("CitadelOpenUpgradeShop", () => {
                if (QOL?.core?.EventBus) {
                    try { QOL.core.EventBus.emit("engine:shop_opened"); } catch (_) {}
                }
            });
        } catch (e) {
            if (Logger) Logger.logDebug("App", `CitadelOpenUpgradeShop event not available: ${e?.message || e}`);
        }

        try {
            $.RegisterForUnhandledEvent("CitadelExitUpgradeShop", () => {
                if (QOL?.core?.EventBus) {
                    try { QOL.core.EventBus.emit("engine:shop_closed"); } catch (_) {}
                }
            });
        } catch (e) {
            if (Logger) Logger.logDebug("App", `CitadelExitUpgradeShop event not available: ${e?.message || e}`);
        }

        try {
            $.RegisterForUnhandledEvent("CitadelScoreboardToggle", () => {
                if (QOL?.core?.EventBus) {
                    try { QOL.core.EventBus.emit("engine:scoreboard_toggle"); } catch (_) {}
                }
            });
        } catch (e) {
            if (Logger) Logger.logDebug("App", `CitadelScoreboardToggle event not available: ${e?.message || e}`);
        }

        try {
            $.RegisterForUnhandledEvent("CitadelToggleEscapeMenu", () => {
                if (QOL?.core?.EventBus) {
                    try { QOL.core.EventBus.emit("engine:escape_menu_toggled"); } catch (_) {}
                }
            });
        } catch (e) {
            if (Logger) Logger.logDebug("App", `CitadelToggleEscapeMenu event not available: ${e?.message || e}`);
        }
    };

    // -- Public API --
    const boot = () => {
        if (_booted) {
            if (_hudPanel && typeof _hudPanel.IsValid === "function" && !_hudPanel.IsValid()) {
                $.Msg("[QOLLock] App: previous HUD panel invalid — shutting down before reboot.");
                shutdown();
            } else {
                $.Msg("[QOLLock] App: already booted — skipping.");
                return true;
            }
        }

        _registerEngineEvents();

        $.Msg(`[QOLLock] App: booting QOLLock v${QOL.VERSION || "?.?.?"} (build ${QOL.BUILD || "?"})`);

        const hud = _findHud();
        if (!hud) {
            $.Msg("[QOLLock] App: Hud panel not found — cannot boot.");
            return false;
        }

        _enableKeyMap = _buildEnableKeyMap();

        const best = _readBestConfig(hud);
        _lastRevision = best.rev;
        _lastConfigRaw = best.raw;
        let flatConfig = null;
        if (best.raw) {
            flatConfig = (typeof QOL !== "undefined" && typeof QOL.safeParseConfig === "function")
                ? QOL.safeParseConfig(best.raw)
                : null;
            if (flatConfig && ConfigAdapter) {
                ConfigAdapter.loadFromFlat(flatConfig, _enableKeyMap);
                if (Logger) Logger.logInfo("App", "config loaded via ConfigAdapter");
            }
        }

        const globalState = (typeof State !== "undefined" && State) ? State :
                          ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
        if (globalState) {
            globalState.lastConfig = (flatConfig && Object.keys(flatConfig).length > 0)
                ? flatConfig
                : ((ConfigAdapter && typeof ConfigAdapter.exportToFlat === "function") ? ConfigAdapter.exportToFlat() : {});
        }

        const featureConfig = ConfigStore.exportAll();
        if (FeatureRegistry) {
            FeatureRegistry.boot(featureConfig);
        }

        _syncRootClasses(hud, flatConfig);
        _writeDiagSnapshot(hud, "");
        _startConfigPolling(hud);
        _booted = true;

        if (FeatureRegistry) {
            const ids = FeatureRegistry.getRegisteredIds();
            const enabled = [];
            for (let i = 0; i < ids.length; i++) {
                if (FeatureRegistry.isEnabled(ids[i])) enabled.push(ids[i]);
            }
            const errors = Logger?.getErrors ? Logger.getErrors(10) : null;
            $.Msg(`[QOLLock] Boot health: ${ids.length} registered, ${enabled.length} enabled, ${errors && errors.length ? errors.length + " errors" : "0 errors"}`);
        }

        return true;
    };

    const _stopConfigPolling = () => {
        if (_configPollTimer) {
            $.CancelScheduled(_configPollTimer);
            _configPollTimer = null;
        }
    };

    const shutdown = () => {
        if (!_booted) return;
        if (_benchmarkStressActive) {
            _restoreStressBenchmark(_findHud(), "shutdown");
        }
        _stopConfigPolling();
        if (FeatureRegistry) FeatureRegistry.shutdown();
        if (ConfigStore) {
            const hud = _findHud();
            if (hud && typeof hud.SetAttributeString === "function") {
                try {
                    const flatExport = ConfigAdapter ? ConfigAdapter.exportToFlat() : {};
                    const envelope = JSON.stringify({
                        schema: (QOL.schemaSemver || QOL.SCHEMA_SEMVER || "4.0.0"),
                        data: flatExport
                    });
                    hud.SetAttributeString(_CONFIG_ATTRIBUTE, envelope);
                } catch (e) {
                    if (Logger) Logger.logWarn("App", `config save failed: ${e.message || e}`);
                }
            }
        }
        _booted = false;
    };

    const isBooted = () => _booted;
    const getHud = () => _hudPanel || _findHud();

    const appApi = {
        boot,
        shutdown,
        isBooted,
        getHud,
        syncRootClasses: _syncRootClasses,
        syncDiagnosticState: _syncDiagnosticState,
        writeDiagSnapshot: _writeDiagSnapshot,
        buildDiagSnapshot: _buildDiagSnapshot
    };

    QOL.core.app = appApi;
    QOL.core.App = appApi;

    $.Msg("[QOLLock] core/ql_app: attached to QOL.core.app and QOL.core.App");

    QOL.core.App.boot();
})();
