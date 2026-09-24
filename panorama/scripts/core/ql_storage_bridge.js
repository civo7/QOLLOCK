// =============================================================================
// QOLLOCK — core/ql_storage_bridge.js
// =============================================================================
// OWNS:        Local persistent storage using Chromium Embedded Framework (CEF)
//              CitadelHTMLPanel with localStorage backend.
//              Provides synchronous & asynchronous save/load/clear operations
//              without requiring cloud servers, hero switches, or shop builds.
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js, core/ql_persistence.js
// LOAD ORDER:  Included in hud.xml and hud_escape_menu.xml after core/ql_persistence.js
// =============================================================================

(function () {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : {});

    Q.core = Q.core || {};

    const BRIDGE_PANEL_ID = "QOLStorageBridge";
    const BRIDGE_LOCAL_URL = "https://predi-i.github.io/qollock-updates/bridge.html";
    const SETTINGS_STORAGE_KEY = "qollock_settings";
    const REQUEST_TIMEOUT_MS = 5000;
    const WATCHDOG_INTERVAL_SEC = 2.5;
    const MAX_INIT_ATTEMPTS = 5;

    let _bridgePanel = null;
    let _bridgeReady = false;
    let _isPageLoaded = false;
    let _reqCounter = 0;
    let _pendingRequests = {};
    let _readyCallbacks = [];
    let _watchdogTimer = null;
    let _initAttempts = 0;
    let _hasAutoloaded = false;
    let _autoloadEnabled = false;

    const _log = (msg) => {
        if (typeof QOL_INFO === "function") {
            QOL_INFO("storage", msg);
        } else if (typeof $ !== "undefined" && typeof $.Msg === "function") {
            $.Msg(`[QOLLock][StorageBridge] ${msg}`);
        }
    };

    const _logWarn = (msg) => {
        if (typeof QOL_WARN === "function") {
            QOL_WARN("storage", msg);
        } else if (typeof $ !== "undefined" && typeof $.Msg === "function") {
            $.Msg(`[QOLLock][WARN][StorageBridge] ${msg}`);
        }
    };

    const _isPanelAlive = (p) => {
        if (!p) return false;
        if (Q.core?.panel?.isAlive) return Q.core.panel.isAlive(p);
        return typeof p.IsValid === "function" && p.IsValid();
    };

    const _findRootPanel = () => {
        if (Q.core?.panel?.findRoot) {
            const root = Q.core.panel.findRoot();
            if (_isPanelAlive(root)) return root;
        }
        if (typeof $.GetContextPanel === "function") {
            let p = $.GetContextPanel();
            let guard = 0;
            while (p && p.GetParent && _isPanelAlive(p.GetParent()) && guard < 64) {
                p = p.GetParent();
                guard++;
            }
            return p || null;
        }
        return null;
    };

    /**
     * Injects the CEF localStorage IPC script into the Chromium document.
     */
    const _injectBridgeScript = () => {
        if (!_isPanelAlive(_bridgePanel) || typeof _bridgePanel.SetURL !== "function") return;

        const jsCode = "javascript:(function(){" +
            "window.__qolSave = function(k, v, id) {" +
                "try {" +
                    "localStorage.setItem(k, v);" +
                    "document.title = 'QOL_RES:' + JSON.stringify({ id: id, ok: true });" +
                "} catch (e) {" +
                    "document.title = 'QOL_RES:' + JSON.stringify({ id: id, ok: false, error: String(e && e.message ? e.message : e) });" +
                "}" +
            "};" +
            "window.__qolLoad = function(k, id) {" +
                "try {" +
                    "var val = localStorage.getItem(k);" +
                    "document.title = 'QOL_RES:' + JSON.stringify({ id: id, ok: true, data: val });" +
                "} catch (e) {" +
                    "document.title = 'QOL_RES:' + JSON.stringify({ id: id, ok: false, error: String(e && e.message ? e.message : e) });" +
                "}" +
            "};" +
            "window.__qolRemove = function(k, id) {" +
                "try {" +
                    "localStorage.removeItem(k);" +
                    "document.title = 'QOL_RES:' + JSON.stringify({ id: id, ok: true });" +
                "} catch (e) {" +
                    "document.title = 'QOL_RES:' + JSON.stringify({ id: id, ok: false, error: String(e && e.message ? e.message : e) });" +
                "}" +
            "};" +
            "document.title = 'QOL_BRIDGE_READY:' + Date.now();" +
        "})();void(0);";

        try {
            _bridgePanel.SetURL(jsCode);
        } catch (e) {
            _logWarn(`_injectBridgeScript failed: ${e?.message || e}`);
        }
    };

    /**
     * Resolves pending requests upon receiving a QOL_RES: title notification.
     */
    const _handleResponse = (payloadStr) => {
        let resp = null;
        try {
            resp = JSON.parse(payloadStr);
        } catch (e) {
            _logWarn(`_handleResponse JSON parse failed: ${e?.message || e} (raw: ${payloadStr})`);
            return;
        }

        const reqId = resp && resp.id;
        if (!reqId || !Object.prototype.hasOwnProperty.call(_pendingRequests, reqId)) {
            return;
        }

        const pending = _pendingRequests[reqId];
        delete _pendingRequests[reqId];

        if (pending.timer && typeof $.CancelScheduled === "function") {
            try { $.CancelScheduled(pending.timer); } catch (_) {}
        } else if (pending.timer && typeof clearTimeout === "function") {
            try { clearTimeout(pending.timer); } catch (_) {}
        }

        if (resp.ok) {
            if (typeof pending.callback === "function") {
                try { pending.callback(null, resp.data !== undefined ? resp.data : true); } catch (_) {}
            }
            if (typeof pending.resolve === "function") {
                pending.resolve(resp.data !== undefined ? resp.data : true);
            }
        } else {
            const err = new Error(resp.error || "CEF bridge request failed");
            if (typeof pending.callback === "function") {
                try { pending.callback(err, null); } catch (_) {}
            }
            if (typeof pending.reject === "function") {
                pending.reject(err);
            }
        }
    };

    /**
     * Handles HTMLTitle events from the CitadelHTMLPanel.
     */
    const _onHtmlTitle = (panel, title) => {
        if (!title || typeof title !== "string") return;

        if (title.indexOf("QOL_BRIDGE_READY") === 0) {
            _bridgeReady = true;
            _log("Bridge connected and ready.");
            const callbacks = _readyCallbacks.slice(0);
            _readyCallbacks = [];
            for (let i = 0; i < callbacks.length; i++) {
                try { callbacks[i](); } catch (e) { _logWarn(`readyCallback error: ${e?.message || e}`); }
            }

            if (_autoloadEnabled && !_hasAutoloaded) {
                _hasAutoloaded = true;
                storageBridgeApi.loadSettings((err, res) => {
                    if (err) {
                        _logWarn(`Startup autoload failed: ${err.message || err}`);
                    } else if (res && res.notFound) {
                        _log("No saved settings found in CEF storage; using defaults.");
                    } else if (res && res.ok) {
                        _log("Saved settings restored successfully from CEF storage.");
                    }
                }).catch(() => {});
            }
            return;
        }

        if (title.indexOf("QOL_RES:") === 0) {
            _handleResponse(title.slice(8));
            return;
        }

        // Local directory listing page loaded (Index of C:/)
        if (!_isPageLoaded) {
            _isPageLoaded = true;
            _log(`CEF directory loaded (${title.slice(0, 40)}), injecting bridge script...`);
            _injectBridgeScript();
        }
    };

    /**
     * Watchdog to verify the bridge achieves ready state after creation.
     */
    const _watchdogTick = () => {
        if (_bridgeReady) return;
        _initAttempts++;
        if (_initAttempts < MAX_INIT_ATTEMPTS) {
            if (_isPanelAlive(_bridgePanel) && typeof _bridgePanel.SetURL === "function") {
                _log(`Watchdog: bridge not ready yet (attempt ${_initAttempts}/${MAX_INIT_ATTEMPTS}), retrying...`);
                _injectBridgeScript();
            }
            if (typeof $.Schedule === "function") {
                _watchdogTimer = $.Schedule(WATCHDOG_INTERVAL_SEC, _watchdogTick);
            }
        } else {
            _logWarn(`Watchdog: bridge failed to initialize after ${MAX_INIT_ATTEMPTS} attempts.`);
        }
    };

    /**
     * Dispatches a command to CEF and registers a pending request.
     */
    const _sendRequest = (jsExpr, callback) => {
        const requestPromise = new Promise((resolve, reject) => {
            const reqId = `qol_${++_reqCounter}_${Date.now ? Date.now() : (new Date()).getTime()}`;

            const execute = () => {
                if (!_isPanelAlive(_bridgePanel) || typeof _bridgePanel.SetURL !== "function") {
                    const err = new Error("Bridge panel unavailable");
                    if (typeof callback === "function") callback(err, null);
                    return reject(err);
                }

                let timer = null;
                const timeoutHandler = () => {
                    if (Object.prototype.hasOwnProperty.call(_pendingRequests, reqId)) {
                        const pending = _pendingRequests[reqId];
                        delete _pendingRequests[reqId];
                        const timeoutErr = new Error(`Bridge request timed out (${reqId})`);
                        if (typeof pending.callback === "function") {
                            try { pending.callback(timeoutErr, null); } catch (_) {}
                        }
                        if (typeof pending.reject === "function") {
                            try { pending.reject(timeoutErr); } catch (_) {}
                        }
                    }
                };

                if (typeof $.Schedule === "function") {
                    timer = $.Schedule(REQUEST_TIMEOUT_MS / 1000, timeoutHandler);
                } else if (typeof setTimeout === "function") {
                    timer = setTimeout(timeoutHandler, REQUEST_TIMEOUT_MS);
                }

                _pendingRequests[reqId] = { resolve, reject, callback, timer };

                const fullJs = `javascript:${jsExpr(reqId)};void(0);`;
                try {
                    _bridgePanel.SetURL(fullJs);
                } catch (e) {
                    delete _pendingRequests[reqId];
                    if (timer && typeof $.CancelScheduled === "function") {
                        try { $.CancelScheduled(timer); } catch (_) {}
                    } else if (timer && typeof clearTimeout === "function") {
                        try { clearTimeout(timer); } catch (_) {}
                    }
                    if (typeof callback === "function") callback(e, null);
                    reject(e);
                }
            };

            if (_bridgeReady) {
                execute();
            } else {
                _readyCallbacks.push(execute);
            }
        });

        if (typeof callback === "function") {
            requestPromise.catch(() => {});
        }

        return requestPromise;
    };

    /**
     * Initializes or locates the CitadelHTMLPanel bridge.
     */
    const init = (targetParent, options) => {
        if (_isPanelAlive(_bridgePanel)) return _bridgePanel;

        if (options && typeof options.autoload === "boolean") {
            _autoloadEnabled = options.autoload;
        }

        const parent = targetParent || _findRootPanel() || (typeof $.GetContextPanel === "function" ? $.GetContextPanel() : null);
        if (!parent) {
            _logWarn("init: no parent panel found to mount storage bridge");
            return null;
        }

        let panel = parent.FindChildTraverse ? parent.FindChildTraverse(BRIDGE_PANEL_ID) : null;
        if (!_isPanelAlive(panel)) {
            if (typeof $.CreatePanel === "function") {
                try {
                    panel = $.CreatePanel("CitadelHTMLPanel", parent, BRIDGE_PANEL_ID);
                } catch (e) {
                    _logWarn(`$.CreatePanel(CitadelHTMLPanel) failed: ${e?.message || e}`);
                    return null;
                }
            }
        }

        if (!_isPanelAlive(panel)) {
            _logWarn("init: failed to find or create CitadelHTMLPanel");
            return null;
        }

        _bridgePanel = panel;
        _bridgeReady = false;
        _isPageLoaded = false;

        // Panel presentation setup: keep minimal, non-interactive, but visible so Chromium timers tick
        panel.AddClass("QOLStorageBridge");
        panel.hittest = false;
        panel.acceptsfocus = false;
        if (panel.style) {
            panel.style.width = "2px";
            panel.style.height = "2px";
            panel.style.opacity = "0.01";
            panel.style.visibility = "visible";
        }

        if (typeof $.RegisterEventHandler === "function") {
            try {
                $.RegisterEventHandler("HTMLTitle", panel, _onHtmlTitle);
            } catch (e) {
                _logWarn(`RegisterEventHandler(HTMLTitle) failed: ${e?.message || e}`);
            }
        }

        if (typeof panel.SetURL === "function") {
            try {
                panel.SetURL(BRIDGE_LOCAL_URL);
                _log(`Mounting bridge URL: ${BRIDGE_LOCAL_URL}`);
            } catch (e) {
                _logWarn(`panel.SetURL failed: ${e?.message || e}`);
            }
        }

        if (typeof $.Schedule === "function") {
            _watchdogTimer = $.Schedule(WATCHDOG_INTERVAL_SEC, _watchdogTick);
        }

        return _bridgePanel;
    };

    /**
     * Low-level key/value save.
     */
    const save = (key, val, callback) => {
        const valStr = typeof val === "string" ? val : JSON.stringify(val);
        const escapedKey = JSON.stringify(String(key));
        const escapedVal = JSON.stringify(valStr);
        return _sendRequest((id) => `window.__qolSave && window.__qolSave(${escapedKey}, ${escapedVal}, '${id}')`, callback);
    };

    /**
     * Low-level key/value load.
     */
    const load = (key, callback) => {
        const escapedKey = JSON.stringify(String(key));
        return _sendRequest((id) => `window.__qolLoad && window.__qolLoad(${escapedKey}, '${id}')`, callback);
    };

    /**
     * Low-level key removal.
     */
    const remove = (key, callback) => {
        const escapedKey = JSON.stringify(String(key));
        return _sendRequest((id) => `window.__qolRemove && window.__qolRemove(${escapedKey}, '${id}')`, callback);
    };

    /**
     * High-level: saves QOLLOCK configuration to CEF local storage and updates UI attributes.
     */
    const saveSettings = (configOrRaw, callback) => {
        let rawToSave = "";
        let configObj = null;

        if (typeof configOrRaw === "string") {
            rawToSave = configOrRaw;
            try {
                const unwrapped = typeof UnwrapConfigFromStorage === "function"
                    ? UnwrapConfigFromStorage(rawToSave) : null;
                configObj = unwrapped ? unwrapped.config : JSON.parse(rawToSave);
            } catch (_) {
                configObj = null;
            }
        } else if (configOrRaw && typeof configOrRaw === "object") {
            configObj = configOrRaw;
            if (typeof WrapConfigForStorage === "function") {
                rawToSave = WrapConfigForStorage(configObj);
            } else {
                rawToSave = JSON.stringify(configObj);
            }
        } else {
            const modCfg = (typeof MOD_CONFIG !== "undefined" && MOD_CONFIG)
                ? MOD_CONFIG
                : ((typeof globalThis !== "undefined" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG : null);
            configObj = modCfg || {};
            if (typeof WrapConfigForStorage === "function") {
                rawToSave = WrapConfigForStorage(configObj);
            } else {
                rawToSave = JSON.stringify(configObj);
            }
        }

        const root = _findRootPanel();
        if (root && Q.core?.persistence?.writeStorageConfigRawToUi) {
            try {
                Q.core.persistence.writeStorageConfigRawToUi(root, rawToSave);
            } catch (e) {
                _logWarn(`writeStorageConfigRawToUi failed: ${e?.message || e}`);
            }
        }

        return new Promise((resolve, reject) => {
            save(SETTINGS_STORAGE_KEY, rawToSave, (err) => {
                if (err) {
                    _logWarn(`saveSettings failed: ${err.message || err}`);
                    if (typeof callback === "function") callback(err, null);
                    return reject(err);
                }
                _log(`saveSettings succeeded (${rawToSave.length} bytes).`);
                const result = { ok: true, timestamp: Date.now ? Date.now() : (new Date()).getTime() };
                if (typeof callback === "function") {
                    callback(null, result);
                }
                resolve(result);
            });
        });
    };

    /**
     * High-level: loads QOLLOCK configuration from CEF local storage and applies it.
     */
    const loadSettings = (callback) => {
        return new Promise((resolve, reject) => {
            load(SETTINGS_STORAGE_KEY, (err, data) => {
                if (err) {
                    _logWarn(`loadSettings error: ${err.message || err}`);
                    if (typeof callback === "function") callback(err, null);
                    return reject(err);
                }

                if (!data || data === "" || data === "null") {
                    const notFoundResult = { ok: true, raw: "", config: null, notFound: true };
                    if (typeof callback === "function") {
                        callback(null, notFoundResult);
                    }
                    return resolve(notFoundResult);
                }

                const rawText = String(data);
                let parsed = null;

                if (typeof UnwrapConfigFromStorage === "function") {
                    const unwrap = UnwrapConfigFromStorage(rawText);
                    if (unwrap && unwrap.config) {
                        parsed = unwrap.config;
                    }
                }
                if (!parsed && typeof SafeParseConfig === "function") {
                    parsed = SafeParseConfig(rawText);
                }
                if (!parsed) {
                    try { parsed = JSON.parse(rawText); } catch (_) { parsed = null; }
                }

                const root = _findRootPanel();
                if (root && Q.core?.persistence?.writeStorageConfigRawToUi) {
                    try {
                        Q.core.persistence.writeStorageConfigRawToUi(root, rawText);
                    } catch (e) {
                        _logWarn(`loadSettings: writeStorageConfigRawToUi failed: ${e?.message || e}`);
                    }
                }

                if (parsed && typeof parsed === "object") {
                    const modCfg = (typeof MOD_CONFIG !== "undefined" && MOD_CONFIG)
                        ? MOD_CONFIG
                        : ((typeof globalThis !== "undefined" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG : null);
                    if (modCfg) {
                        if (typeof MergeConfig === "function") {
                            const merged = MergeConfig(parsed);
                            for (const k in merged) {
                                if (Object.prototype.hasOwnProperty.call(merged, k)) {
                                    modCfg[k] = merged[k];
                                }
                            }
                        } else {
                            for (const k in parsed) {
                                if (Object.prototype.hasOwnProperty.call(parsed, k)) {
                                    modCfg[k] = parsed[k];
                                }
                            }
                        }
                    }

                    const state = (typeof State !== "undefined" && State)
                        ? State
                        : ((typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : null);
                    if (state) {
                        state.lastConfig = parsed;
                    }

                    if (Q.core?.configAdapter && typeof Q.core.configAdapter.loadFromFlat === "function") {
                        try {
                            const enableKeyMap = (typeof Q.core.app?._getEnableKeyMap === "function")
                                ? Q.core.app._getEnableKeyMap() : null;
                            Q.core.configAdapter.loadFromFlat(parsed, enableKeyMap);
                        } catch (eAdapter) {
                            _logWarn(`loadSettings: ConfigAdapter.loadFromFlat failed: ${eAdapter?.message || eAdapter}`);
                        }
                    }

                    const syncFn = (typeof globalThis !== "undefined" && globalThis.SyncConfigFromStorage)
                        ? globalThis.SyncConfigFromStorage : null;
                    if (typeof syncFn === "function") {
                        try { syncFn(); } catch (_) {}
                    }

                    if (Q.core?.eventBus && typeof Q.core.eventBus.emit === "function") {
                        try { Q.core.eventBus.emit("config:loaded", { config: parsed, raw: rawText }); } catch (_) {}
                    }
                }

                _log(`loadSettings completed (${rawText.length} bytes).`);
                const result = { ok: true, raw: rawText, config: parsed };
                if (typeof callback === "function") {
                    callback(null, result);
                }
                resolve(result);
            });
        });
    };

    /**
     * High-level: clears QOLLOCK configuration from CEF local storage.
     */
    const clearSettings = (callback) => {
        return new Promise((resolve, reject) => {
            remove(SETTINGS_STORAGE_KEY, (err) => {
                if (err) {
                    _logWarn(`clearSettings failed: ${err.message || err}`);
                    if (typeof callback === "function") callback(err, null);
                    return reject(err);
                }
                _log("clearSettings succeeded.");
                const result = { ok: true };
                if (typeof callback === "function") {
                    callback(null, result);
                }
                resolve(result);
            });
        });
    };

    const storageBridgeApi = {
        init,
        isReady: () => _bridgeReady,
        getPanel: () => _bridgePanel,
        enableAutoload: (flag) => { _autoloadEnabled = !!flag; },
        save,
        load,
        remove,
        saveSettings,
        loadSettings,
        clearSettings,
        _onHtmlTitle,
        _injectBridgeScript,
    };

    Q.core.storageBridge = storageBridgeApi;
    Q.core.storage = storageBridgeApi;
    if (typeof globalThis !== "undefined") {
        globalThis.QOLStorageBridge = storageBridgeApi;
    }

    // Auto-initialize when loaded into a live Panorama panel context
    if (typeof $ !== "undefined" && typeof $.GetContextPanel === "function") {
        try {
            init($.GetContextPanel(), { autoload: true });
        } catch (e) {
            _logWarn(`Auto-init failed: ${e?.message || e}`);
        }
    }
})();
