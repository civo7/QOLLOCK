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
    let _configPollGeneration = 0;
    let _enableKeyMap = null;

    const _CONFIG_ATTRIBUTE = "Deadlock_Mod_Settings_v1";
    const _REV_ATTRIBUTE = (typeof QOL_USER_EDIT_REV_ATTR !== "undefined")
        ? QOL_USER_EDIT_REV_ATTR
        : ((typeof USER_EDIT_REV_ATTR !== "undefined") ? USER_EDIT_REV_ATTR : "QOL_USER_EDIT_REV");
    let _lastDiagForceToken = "";
    let _diagWriteNextMs = 0;
    let _lastBenchmarkReport = null;
    let _stressBenchmark = null;
    let _benchmarkRequest = null;

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
        const fields = new Map(QOL.settingsFields.map(field => [field.key, field]));
        const enableToggle = key => {
            const field = fields.get(key);
            if (!field || field.kind !== "toggle" || key.startsWith("DISABLE_")) return;
            // Suppression controls reduce the exercised HUD rather than expand it.
            maxCfg[key] = field.role === "stateVisibility" || /(^|_)HIDE_/.test(key) ? 0 : 1;
        };
        for (const k in maxCfg) {
            if (/^(ENABLE_|DISABLE_|HUD_.*_ENABLED$|SUPPORT_|SHOW_|MINIMAL_)/.test(k)) {
                enableToggle(k);
            }
        }
        if (FeatureRegistry && typeof FeatureRegistry.getRegisteredIds === "function") {
            const ids = FeatureRegistry.getRegisteredIds();
            for (let i = 0; i < ids.length; i++) {
                const m = FeatureRegistry.getManifest(ids[i]);
                if (!m) continue;
                if (m.enableKey) enableToggle(m.enableKey);
                if (Array.isArray(m.enableKeys)) {
                    for (let k = 0; k < m.enableKeys.length; k++) enableToggle(m.enableKeys[k]);
                }
                if (Array.isArray(m.settings)) {
                    for (let s = 0; s < m.settings.length; s++) {
                        const setting = m.settings[s];
                        const sk = setting.key;
                        if (!sk || sk.startsWith("DISABLE_")) continue;
                        if (setting.type === "toggle") {
                            enableToggle(sk);
                        } else if (setting.type === "multitoggle" && Array.isArray(setting.options)) {
                            enableToggle(sk);
                            for (let o = 0; o < setting.options.length; o++) {
                                const ok = setting.options[o]?.key;
                                if (ok) enableToggle(ok);
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
                FeatureRegistry.enable(id, { automatic: true });
                if (FeatureRegistry.isEnabled(id) && Logger) Logger.logInfo("App", `runtime enable: ${id}`);
            } else if (!nowEnabled && wasEnabled) {
                FeatureRegistry.disable(id, { automatic: true });
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

    let _cachedSearchPanels = null;
    let _cachedSearchHud = null;
    let _cachedSearchContext = null;
    let _cachedSearchParents = [];

    const _getSearchPanels = (hudPanel) => {
        const ctx = typeof $.GetContextPanel === "function" ? $.GetContextPanel() : null;
        if (_cachedSearchPanels && _cachedSearchHud === hudPanel && _cachedSearchContext === ctx) {
            let current = ctx, unchanged = true;
            for (const parent of _cachedSearchParents) {
                if (!current || !current.GetParent || current.GetParent() !== parent) { unchanged = false; break; }
                current = parent;
            }
            if (unchanged) return _cachedSearchPanels;
        }
        const panels = [];
        const parents = [];
        const seen = new Set();
        const add = (p) => {
            if (!p || typeof p.GetAttributeString !== "function") return;
            if (seen.has(p)) return;
            seen.add(p);
            panels.push(p);
        };
        add(hudPanel);
        if (ctx) {
            add(ctx);
            let cur = ctx;
            let depth = 0;
            while (cur && cur.GetParent && depth < 64) {
                cur = cur.GetParent();
                parents.push(cur);
                add(cur);
                depth++;
            }
        }
        _cachedSearchPanels = panels;
        _cachedSearchHud = hudPanel;
        _cachedSearchContext = ctx;
        _cachedSearchParents = parents;
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
            if (_stressBenchmark?.config) {
                flatConfig = _stressBenchmark.config;
            } else {
                const globalState = (typeof State !== "undefined" && State) ? State :
                                  ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
                if (globalState?.lastConfig) flatConfig = globalState.lastConfig;
                else if (ConfigAdapter) flatConfig = ConfigAdapter.exportToFlat();
            }
        }
        if (!flatConfig) return;
        if (!_stressBenchmark) flatConfig = QOL.presentation?.preview?.effective(flatConfig) || flatConfig;
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
        const stress = _stressBenchmark;
        if (!stress) return;
        const generation = _configPollGeneration;
        _stressBenchmark = null;
        if (stress.timer !== null) {
            try { $.CancelScheduled(stress.timer); } catch (_) {}
            stress.timer = null;
        }

        const saved = stress.savedConfig;
        const savedRev = stress.savedRevision;
        const savedRaw = stress.savedRaw;

        if (saved) {
            try {
                const globalState = (typeof State !== "undefined" && State) ? State :
                                  ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
                if (globalState) {
                    globalState.lastConfig = saved;
                }
                _lastRevision = savedRev;
                _lastConfigRaw = savedRaw;
                if (ConfigAdapter && typeof ConfigAdapter.loadFromFlat === "function") {
                    ConfigAdapter.loadFromFlat(saved, _enableKeyMap);
                }
                if (_stressBenchmark || generation !== _configPollGeneration) return;
                _syncFeatureEnabledState();
                if (_stressBenchmark || generation !== _configPollGeneration) return;
                _syncRootClasses(hudPanel, saved);
                if (_stressBenchmark || generation !== _configPollGeneration) return;
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
        // The current registry retires failed owners without the legacy lists;
        // poll-error streaks are cleared on retirement and cannot identify them.
        for (const id of registered) {
            if (!enabled.includes(id) && FeatureRegistry.isFeatureSupposedToBeEnabled(id) && !disabledList.includes(id)) {
                disabledList.push(id);
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
            const observation = QOL.core.ManifestTests.getHudStateObservation();
            if (observation) diag.hudStateObservation = observation;
            const tr = QOL.core.ManifestTests.getResults();
            if (tr) {
                diag.testResults = tr;
            }
        }

        if (_lastBenchmarkReport) {
            diag.benchmark = _lastBenchmarkReport;
        }
        const fpsScan = QOL.core.FpsInvestigation?.getStatus();
        if (fpsScan) diag.fpsScan = fpsScan;
        const minimapScan = QOL.core.MinimapInvestigation?.getStatus();
        const configScan = QOL.core.ConfigInvestigation?.getStatus();
        if (configScan) diag.configInvestigation = configScan;
        if (minimapScan) diag.minimapScan = minimapScan;

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

    const _stopBenchmarkRequest = () => {
        const request = _benchmarkRequest;
        const lease = _stressBenchmark;
        _benchmarkRequest = null;
        if (request) request.stopping = true;
        try { request?.handle?.stop?.(); }
        catch (e) { if (Logger) Logger.logWarn("Benchmark", `Benchmark stop failed: ${e?.message || e}`); }
        finally { if (request) request.stopping = false; }
        try {
            if (request?.isFpsScan && lease && _stressBenchmark === lease) _restoreStressBenchmark(_hudPanel, "cancelled");
        } finally {
            const finalize = request?.finalizeNative;
            if (request) request.finalizeNative = null;
            finalize?.();
        }
    };

    const _emitNativePacket = (session, packet, value) => {
        const json = JSON.stringify(value), characters = Array.from(json), chunks = [];
        for (let i = 0; i < characters.length; i += 350) chunks.push(characters.slice(i, i + 350).join(""));
        const hash = QOL.core.MinimapInvestigation.digest(json);
        chunks.forEach((data, index) => $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({
            type: "packet", session, packet, index, total: chunks.length, hash, data
        })));
    };

    const _startRequestedBenchmark = (hudPanel, forceToken) => {
        _stopBenchmarkRequest();
        if (_benchmarkRequest) return;
        const isFpsScan = forceToken.startsWith("fps_");
        const request = { handle: null, isFpsScan };
        _benchmarkRequest = request;
        const parts = forceToken.split("_");
        const isMinimapScan = isFpsScan && parts[1] === "minimap";
        const isConfigScan = isFpsScan && parts[1] === "config";
        const isNativeSuite = isMinimapScan || isConfigScan;
        const nativeSession = isNativeSuite ? parts[1] + "_" + (QOL.core.MinimapInvestigation?.digest?.(forceToken) || "missing") + "_" + Date.now() : forceToken;
        const durSec = isFpsScan ? (isConfigScan ? 3300 : isMinimapScan ? 1800 : 420) : parseFloat(parts[1]) || 10;
        const selectedIds = isNativeSuite && /^\d+$/.test(parts[2] || "") ? parts.slice(3).join("_").split(",").filter(Boolean) : [];
        const isStress = isFpsScan ? parts[1] === "expanded" || isNativeSuite : parts[2] === "stress";
        const leasedConfig = isStress || isFpsScan;
        const initialFailures = isConfigScan ? FeatureRegistry.getErrorTotals() : null;
        let fpsConfiguration = null;

        if (leasedConfig) {
            let stress = null;
            try {
                const globalState = (typeof State !== "undefined" && State) ? State :
                                  ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
                const previous = _stressBenchmark;
                let savedFlatConfig = previous ? previous.savedConfig : null;
                if (!previous) {
                    // Runtime buckets may contain a leased Customize draft.
                    // Only canonical settings belong in the restoration snapshot.
                    if (globalState?.lastConfig && Object.keys(globalState.lastConfig).length > 0) {
                        savedFlatConfig = QOL.mergeConfig(globalState.lastConfig);
                    } else if (ConfigAdapter && typeof ConfigAdapter.exportToFlat === "function") {
                        savedFlatConfig = ConfigAdapter.exportToFlat();
                    } else if (typeof QOL !== "undefined" && typeof QOL.buildDefaultConfig === "function") {
                        savedFlatConfig = QOL.buildDefaultConfig();
                    }
                }
                stress = { savedConfig: savedFlatConfig,
                    savedRevision: previous ? previous.savedRevision : _lastRevision,
                    savedRaw: previous ? previous.savedRaw : _lastConfigRaw,
                    config: null, timer: null };
                _stressBenchmark = stress;
                if (previous && previous.timer !== null) {
                    try { $.CancelScheduled(previous.timer); } catch (_) {}
                    previous.timer = null;
                }

                const maxConfig = isStress ? _buildMaximalConfig() : QOL.mergeConfig(savedFlatConfig || QOL.buildDefaultConfig());
                if (isMinimapScan) maxConfig.MINIMAP_CAMP_NAMES = 1;
                stress.config = maxConfig;

                if (globalState) {
                    globalState.lastConfig = maxConfig;
                }
                if (ConfigAdapter && typeof ConfigAdapter.loadFromFlat === "function") {
                    ConfigAdapter.loadFromFlat(maxConfig, _enableKeyMap);
                }
                if (_stressBenchmark !== stress) return;
                _syncFeatureEnabledState();
                if (_stressBenchmark !== stress) return;
                _syncRootClasses(hudPanel, maxConfig);
                if (_stressBenchmark !== stress) return;
                if (isConfigScan) {
                    const failures = Object.entries(FeatureRegistry.getErrorTotals()).filter(([id, count]) => count > (initialFailures[id] || 0)).map(([id]) => id);
                    const unhealthy = Object.entries(FeatureRegistry.getErrorCounts()).filter(([, count]) => count > 0).map(([id]) => id);
                    const missing = FeatureRegistry.getRegisteredIds().filter(id => FeatureRegistry.isFeatureSupposedToBeEnabled(id) && !FeatureRegistry.isEnabled(id));
                    const invalid = [...new Set([...failures, ...unhealthy, ...missing])];
                    if (invalid.length) throw Error("Expanded baseline failed: " + invalid.join(", "));
                }
                if (isFpsScan) {
                    const baseline = { ...maxConfig };
                    const checkLease = restoring => {
                        const cleanup = restoring && request.stopping && _benchmarkRequest === null;
                        if ((_benchmarkRequest !== request && !cleanup) || _stressBenchmark !== stress) throw Error("temporary configuration lease retired");
                    };
                    fpsConfiguration = { baseline, canonical: savedFlatConfig ? { ...savedFlatConfig } : null,
                        initialFailures,
                        restoreTarget: () => stress.savedConfig ? { ...stress.savedConfig } : null,
                        read: () => ({ flat: { ...stress.config }, registered: ConfigAdapter.exportToFlat() }),
                        apply: patch => {
                        const restoring = Object.keys(patch).length === 0;
                        checkLease(restoring);
                        const config = { ...baseline, ...patch };
                        stress.config = config;
                        if (globalState) globalState.lastConfig = config;
                        ConfigAdapter.loadFromFlat(config, _enableKeyMap);
                        checkLease(restoring);
                        _syncFeatureEnabledState();
                        checkLease(restoring);
                        _syncRootClasses(hudPanel, config);
                        checkLease(restoring);
                        return FeatureRegistry.getRegisteredIds().filter(id => FeatureRegistry.isFeatureSupposedToBeEnabled(id));
                    } };
                }

                stress.timer = $.Schedule(durSec + 3.0, () => {
                    if (_stressBenchmark !== stress) return;
                    stress.timer = null;
                    try {
                        if (isFpsScan && _benchmarkRequest === request) request.handle?.stop("safety-timeout");
                    } finally {
                        if (_stressBenchmark === stress) _restoreStressBenchmark(hudPanel, "safety-timeout");
                    }
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
                if (_stressBenchmark === stress) _restoreStressBenchmark(hudPanel, "setup-error");
                if (_benchmarkRequest === request) {
                    _benchmarkRequest = null;
                    if (isConfigScan) {
                        const failure = { kind: "config-suite", reason: "setup-error", error: String(e), initialFailures,
                            actualFailures: FeatureRegistry.getErrorTotals(), expectedConfig: stress?.savedConfig,
                            actualConfig: ConfigAdapter.exportToFlat() };
                        _lastBenchmarkReport = { token: forceToken, report: failure.error, stats: { kind: "config-suite", reason: "setup-error" }, timestamp: _nowMs() };
                        _writeDiagSnapshot(hudPanel, forceToken);
                        $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({ type: "start", session: nativeSession, kind: "config-suite" }));
                        _emitNativePacket(nativeSession, "setup-failure", failure);
                        $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({ type: "end", session: nativeSession, reason: "setup-error" }));
                    }
                }
                if (Logger) Logger.logWarn("Benchmark", `Benchmark stress setup failed: ${e?.message || e}`);
                return;
            }
        } else {
            const enabledIds = (FeatureRegistry && typeof FeatureRegistry.getEnabledIds === "function")
                ? FeatureRegistry.getEnabledIds() : [];
            if (Logger) {
                Logger.logInfo("Benchmark", `Normal benchmark started: ${enabledIds.length} manifests active (current config) for ${durSec}s`);
            }
            $.Msg(`[QOLLock][Benchmark] Normal benchmark started: ${enabledIds.length} active manifests for ${durSec}s`);
        }

        if (_benchmarkRequest !== request) return;
        if (QOL?.core?.Scheduler?.startBenchmark) {
            try {
                const complete = (report, stats) => {
                    if (_benchmarkRequest !== request) return;
                    if (leasedConfig) {
                        _restoreStressBenchmark(hudPanel, "complete");
                    }
                    if (_benchmarkRequest !== request) return;
                    _benchmarkRequest = null;
                    _lastBenchmarkReport = {
                        token: forceToken,
                        report,
                        stats,
                        timestamp: _nowMs()
                    };
                    _writeDiagSnapshot(hudPanel, forceToken);
                };
                if (isFpsScan) $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({ type: "start", session: nativeSession,
                    ...(isNativeSuite ? { kind: isConfigScan ? "config-suite" : "minimap-suite" } : {}) }));
                const handle = isNativeSuite ? (isConfigScan ? QOL.core.ConfigInvestigation : QOL.core.MinimapInvestigation).start({
                    root: hudPanel, baseline: fpsConfiguration.baseline, canonical: fpsConfiguration.canonical,
                    configuration: fpsConfiguration, selectedIds,
                    onProgress: () => _writeDiagSnapshot(hudPanel, forceToken),
                    onPacket: (packet, value) => _emitNativePacket(nativeSession, packet, value),
                    onWindow: window => $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({ type: "window", session: nativeSession, ...window })),
                    onComplete: result => {
                        const { report, ...stats } = result;
                        const expectedConfig = fpsConfiguration.restoreTarget();
                        complete(report, stats);
                        const finalize = () => {
                            _emitNativePacket(nativeSession, "app-restoration", { expectedConfig,
                                status: _benchmarkRequest && _benchmarkRequest !== request ? "successor-owned" : "restoration-observed",
                                actualConfig: ConfigAdapter.exportToFlat(), enabledIds: FeatureRegistry.getEnabledIds().slice().sort(),
                                successorActive: !!_benchmarkRequest, stressLeaseActive: !!_stressBenchmark,
                                ...(isMinimapScan ? { owners: Object.fromEntries(QOL.core.MinimapPlan.owners.map(id => [id, FeatureRegistry.getInstance(id)?.diagnostics?.inspect() || { active: false }])) } : {}),
                                observationScope: "immediate configuration/hooks state; queued native reconstruction may still be pending" });
                            $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({ type: "end", session: nativeSession, reason: result.reason }));
                        };
                        if (request.stopping) request.finalizeNative = finalize;
                        else finalize();
                    }
                }) : isFpsScan ? QOL.core.FpsInvestigation.start({
                    root: hudPanel, mode: isStress ? "expanded" : "current",
                    configuration: fpsConfiguration,
                    onProgress: () => _writeDiagSnapshot(hudPanel, forceToken),
                    onWindow: window => $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({ type: "window", session: forceToken, ...window })),
                    onComplete: result => {
                        const { report, ...stats } = result;
                        $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({ type: "end", session: forceToken, reason: result.reason }));
                        $.Msg(report); complete(report, stats);
                    }
                }) : QOL.core.Scheduler.startBenchmark(durSec, complete,
                    isStress ? null : { capturePanelLookups: true, panelRoot: hudPanel });
                if (_benchmarkRequest === request) request.handle = handle;
                else handle?.stop?.();
            } catch (bmErr) {
                if (_benchmarkRequest === request) {
                    _benchmarkRequest = null;
                    if (leasedConfig) _restoreStressBenchmark(hudPanel, "error");
                    if (isNativeSuite && !_benchmarkRequest) {
                        _lastBenchmarkReport = { token: forceToken, report: "Native investigation failed: " + String(bmErr),
                            stats: { kind: isConfigScan ? "config-suite" : "minimap-suite", reason: "setup-error" }, timestamp: _nowMs() };
                        _writeDiagSnapshot(hudPanel, forceToken);
                    }
                }
                if (isNativeSuite) $.Msg("[QOLLOCK:NativeFPS] " + JSON.stringify({ type: "end", session: nativeSession, reason: "setup-error: " + String(bmErr) }));
                if (Logger) Logger.logWarn("Benchmark", `Benchmark start failed: ${bmErr.message || bmErr}`);
            }
        } else if (Logger) {
            _benchmarkRequest = null;
            if (leasedConfig) _restoreStressBenchmark(hudPanel, "unavailable");
            Logger.logWarn("Benchmark", "Benchmark requested but Scheduler.startBenchmark unavailable");
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

                if (forceToken.startsWith("state_")) {
                    QOL.core.ManifestTests.observeHudStates(forceToken, () => _writeDiagSnapshot(hudPanel, forceToken));
                }

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

                if (forceToken.startsWith("bm_")) _startRequestedBenchmark(hudPanel, forceToken);
                if (forceToken.startsWith("fps_stop_")) {
                    if (_benchmarkRequest?.isFpsScan) _benchmarkRequest.handle?.stop("cancelled");
                } else if (forceToken.startsWith("fps_")) _startRequestedBenchmark(hudPanel, forceToken);

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

        // Explicit requests publish above; idle gameplay needs no periodic JSON.
        if (!forceSync) {
            if (!_stressBenchmark && !_benchmarkRequest) return;
            if (_diagWriteNextMs && _diagWriteNextMs > nowMs) return;
            _diagWriteNextMs = nowMs + 5000;
            _writeDiagSnapshot(hudPanel, "");
        }
    };

    const _startConfigPolling = (hud) => {
        if (_configPollTimer !== null) return;
        const generation = ++_configPollGeneration;
        let _nextRootClassSyncMs = 0;

        const poll = () => {
            if (!_booted || generation !== _configPollGeneration) return;
            _configPollTimer = null;
            const hudPanel = hud;
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
                if (_stressBenchmark) {
                    // While stress test is running, do not clobber maximal benchmark config.
                    // Buffer incoming user config updates so they are cleanly restored at completion.
                    const newest = (typeof QOL !== "undefined" && QOL.safeParseConfig) ? QOL.safeParseConfig(raw) : null;
                    if (newest) _stressBenchmark.savedConfig = newest;
                    _stressBenchmark.savedRevision = rev;
                    _stressBenchmark.savedRaw = raw;
                    if (_benchmarkRequest?.isFpsScan) _benchmarkRequest.handle?.stop("config changed");
                } else {
                    if (_benchmarkRequest?.isFpsScan) _benchmarkRequest.handle?.stop("config changed");
                    _applyConfigUpdate(raw, rev, hudPanel, best.sourcePanel);
                    _nextRootClassSyncMs = nowMs + 1000;
                }
            } else if (nowMs >= _nextRootClassSyncMs) {
                _syncRootClasses(hudPanel, _stressBenchmark ? _stressBenchmark.config : undefined);
                _nextRootClassSyncMs = nowMs + 1000;
            }

            // Drafts only affect registered presentation keys. Keep canonical
            // state/storage separate, and restore it on expiry/exit/conflict.
            const preview = QOL.presentation?.preview;
            if (preview) {
                const canonical = globalThis.State?.lastConfig || QOL.buildDefaultConfig();
                const layer = preview.consume(hudPanel, canonical, !!_stressBenchmark);
                if (layer.changed && !_stressBenchmark) {
                    try {
                        ConfigAdapter.loadFromFlat(layer.config, _enableKeyMap);
                        _syncFeatureEnabledState();
                        _syncRootClasses(hudPanel, layer.config);
                        if (!preview.commit(layer)) preview.reject(layer);
                    } catch (e) {
                        preview.reject(layer);
                        if (Logger) Logger.logWarn("App", `preview delivery failed: ${e.message || e}`);
                    }
                }
            }

            _syncDiagnosticState(hudPanel, nowMs);

            // A leased editor gesture needs responsive delivery; ordinary HUD
            // synchronization retains its existing cadence after release/exit.
            if (_booted && generation === _configPollGeneration) {
                _configPollTimer = $.Schedule(!_stressBenchmark && QOL.presentation?.preview?.interacting(hudPanel) ? 0.05 : 0.25, poll);
            }
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
        _configPollGeneration++;
        const timer = _configPollTimer;
        _configPollTimer = null;
        if (timer !== null) {
            try { $.CancelScheduled(timer); } catch (_) { /* generation retires failed cancellation */ }
        }
    };

    const shutdown = () => {
        if (!_booted) return;
        const hud = _hudPanel;
        _stopConfigPolling();
        _booted = false;
        _stopBenchmarkRequest();
        if (_stressBenchmark) {
            _restoreStressBenchmark(hud, "shutdown");
        }
        if (QOL.presentation?.preview) {
            QOL.presentation.preview.reset(_hudPanel);
            ConfigAdapter.loadFromFlat(globalThis.State?.lastConfig || QOL.buildDefaultConfig(), _enableKeyMap);
        }
        if (FeatureRegistry) FeatureRegistry.shutdown();
        if (ConfigStore && PanelHelpers.isPanelAlive(hud) && typeof hud.SetAttributeString === "function") {
            try {
                // Teardown owns only its captured HUD and must preserve settings
                // published since its last poll, including on the same panel.
                const best = _readBestConfig(hud);
                if (best.rev <= _lastRevision && (!best.raw || best.raw === _lastConfigRaw)) {
                    const flatExport = ConfigAdapter ? ConfigAdapter.exportToFlat() : {};
                    const envelope = JSON.stringify({
                        schema: (QOL.schemaSemver || QOL.SCHEMA_SEMVER || "4.0.0"),
                        data: flatExport
                    });
                    hud.SetAttributeString(_CONFIG_ATTRIBUTE, envelope);
                }
            } catch (e) {
                if (Logger) Logger.logWarn("App", `config save failed: ${e.message || e}`);
            }
        }
        _cachedSearchPanels = null;
        _cachedSearchHud = null;
        _cachedSearchContext = null;
        _cachedSearchParents = [];
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
