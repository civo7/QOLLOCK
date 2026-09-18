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
            const globalState = (typeof State !== "undefined" && State) ? State :
                              ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
            if (globalState?.lastConfig) flatConfig = globalState.lastConfig;
            else if (ConfigAdapter) flatConfig = ConfigAdapter.exportToFlat();
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
                diag.testResults = {
                    summary: tr.summary,
                    results: tr.results,
                    timestamp: tr.timestamp,
                    token: tr.token
                };
            }
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
                            if (forceToken.startsWith("audit_") && typeof QOL.core.ManifestTests.runEngineAudit === "function") {
                                QOL.core.ManifestTests.runEngineAudit();
                            }
                            QOL.core.ManifestTests.runAll({
                                token: forceToken,
                                onComplete: () => {
                                    _writeDiagSnapshot(hudPanel, forceToken);
                                }
                            });
                        } catch (mtErr) {
                            if (Logger) Logger.logWarn("App", `manifest test run failed: ${mtErr.message || mtErr}`);
                        }
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

    const _syncLoaderOverlays = (hudPanel, nowMs) => {
        const globalState = (typeof State !== "undefined" && State) ? State :
                          ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
        if (!globalState) return;
        const settingsShowing = Boolean(globalState.settingsLoaderSessionActive || globalState.settingsLoaderSessionCompleted);
        const saveShowing = Boolean(globalState.saveSettingsLoaderSessionActive || globalState.saveSettingsLoaderSessionCompleted);

        if (settingsShowing || saveShowing) {
            if (settingsShowing && QOL && typeof QOL.updateSettingsLoaderOverlay === "function") {
                try { QOL.updateSettingsLoaderOverlay(hudPanel, nowMs); } catch (_) {}
            }
            if (!settingsShowing && saveShowing && QOL && typeof QOL.updateSaveSettingsLoaderOverlay === "function") {
                try { QOL.updateSaveSettingsLoaderOverlay(hudPanel, nowMs); } catch (_) {}
            }
        }
    };

    const _syncPendingHeroRestore = (nowMs) => {
        const globalState = (typeof State !== "undefined" && State) ? State :
                          ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
        if (!globalState?.heroRestorePendingTarget) return;
        const targetHero = (QOL && QOL.normalizeHeroId) ? QOL.normalizeHeroId(globalState.heroRestorePendingTarget) : globalState.heroRestorePendingTarget;
        if (!targetHero) {
            globalState.heroRestorePendingTarget = "";
            return;
        }
        const now = Number(nowMs) || _nowMs();
        if (now < (globalState.heroRestorePendingNextMs || 0)) return;
        const elapsed = now - (Number(globalState.heroRestorePendingStartedMs) || now);
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
    };

    const _startConfigPolling = (hud) => {
        if (_configPollTimer) return;

        const poll = () => {
            if (!_booted) return;
            const nowMs = _nowMs();
            const hudPanel = _findHud();
            const best = _readBestConfig(hudPanel);
            const { raw, rev } = best;

            let changed = false;
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
        };
        _configPollTimer = $.Schedule(0.25, poll);
    };

    // -- Public API --
    const boot = () => {
        if (_booted) {
            $.Msg("[QOLLock] App: already booted — skipping.");
            return true;
        }

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
            globalState.lastConfig = flatConfig || {};
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
        _stopConfigPolling();
        if (FeatureRegistry) FeatureRegistry.shutdown();
        if (ConfigStore) {
            const hud = _findHud();
            if (hud && typeof hud.SetAttributeString === "function") {
                try {
                    const flatExport = ConfigAdapter ? ConfigAdapter.exportToFlat() : {};
                    const envelope = JSON.stringify({
                        schema: (QOL.schemaSemver || QOL.SCHEMA_SEMVER || "3.2.0"),
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
