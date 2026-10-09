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
    const BRIDGE_URL = "https://predi-i.github.io/qollock-updates/bridge.html";
    const SETTINGS_STORAGE_KEY = "qollock_settings";
    const REQUEST_TIMEOUT_MS = 5000;
    const WATCHDOG_INTERVAL_SEC = 20.0;
    const CACHED_PAGE_RETRY_SEC = 1.0;
    const MAX_INIT_ATTEMPTS = 5;

    const CHUNK_SIZE = 1500;

    let _bridgePanel = null;
    let _bridgeReady = false;
    let _reqCounter = 0;
    let _fragmentCounter = 0;
    let _pendingRequests = {};
    let _requestQueue = [];
    let _activeRequest = null;
    let _watchdogTimer = null;
    let _initAttempts = 0;
    let _oldPageLogged = false;
    let _cachedPageRetryScheduled = false;
    let _hasAutoloaded = false;
    let _autoloadEnabled = false;
    let _autoloadState = null;

    const _b64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    const _utf8ToBase64 = (str) => {
        if (typeof str !== "string") str = String(str);
        const btoaFn = (typeof globalThis !== "undefined" && typeof globalThis.btoa === "function")
            ? globalThis.btoa : null;
        if (btoaFn) {
            try {
                return btoaFn(unescape(encodeURIComponent(str)));
            } catch (_) {}
        }
        try {
            const utf8 = unescape(encodeURIComponent(str));
            let res = "";
            for (let i = 0; i < utf8.length; i += 3) {
                const a = utf8.charCodeAt(i);
                const b = i + 1 < utf8.length ? utf8.charCodeAt(i + 1) : NaN;
                const c = i + 2 < utf8.length ? utf8.charCodeAt(i + 2) : NaN;
                const b1 = (a >> 2) & 0x3F;
                const b2 = ((a & 0x3) << 4) | ((b >> 4) & 0xF);
                const b3 = ((b & 0xF) << 2) | ((c >> 6) & 0x3);
                const b4 = c & 0x3F;
                res += _b64Chars.charAt(b1) + _b64Chars.charAt(b2) +
                    (isNaN(b) ? "=" : _b64Chars.charAt(b3)) +
                    (isNaN(c) ? "=" : _b64Chars.charAt(b4));
            }
            return res;
        } catch (_) {
            return "";
        }
    };

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

    const _isPanelAlive = Q.core.panel.isAlive;
    const _findRootPanel = () => Q.core.persistence
        ? Q.core.persistence.getUIRoot() : Q.core.panel.findRoot();

    const _captureRestoreState = () => {
        const root = _findRootPanel();
        return { root, stamp: Q.core.persistence?.getConfigChangeStamp(root) };
    };

    const _isRestoreStateCurrent = (state) => {
        const current = _captureRestoreState();
        return !!state && _isPanelAlive(state.root) && state.root === current.root &&
            state.stamp !== null && state.stamp !== undefined && state.stamp === current.stamp;
    };

    const _setAutoloadEnabled = (flag) => {
        if (flag && !_autoloadEnabled) _autoloadState = _captureRestoreState();
        _autoloadEnabled = !!flag;
    };

    // Callback consumers do not have to catch a second, unused Promise. Promise
    // consumers still receive the original rejection, and callback errors cannot
    // leave an otherwise completed operation pending forever.
    const _withCallback = (promise, callback) => {
        if (typeof callback === "function") {
            const notify = (err, result) => {
                try { callback(err, result); }
                catch (e) { _logWarn(`Storage callback failed: ${e?.message || e}`); }
            };
            promise.then(result => notify(null, result), err => notify(err, null));
        }
        return promise;
    };

    const _runAutoload = (retry = false) => {
        if (!_autoloadEnabled || _hasAutoloaded || !_bridgeReady) return;
        _hasAutoloaded = true;
        if (!_isRestoreStateCurrent(_autoloadState)) {
            _log("Startup restore skipped: settings changed since initialization.");
            return;
        }
        _loadSettings(_autoloadState).then(result => {
            if (result.skipped) _log("Startup restore skipped: newer user edits exist.");
            else if (result.notFound) _log("No saved settings found; keeping current settings.");
            else _log("Saved settings restored from CEF storage.");
        }, err => {
            _logWarn(`Startup restore${retry ? " retry" : ""} failed: ${err.message || err}`);
            if (!retry && typeof $.Schedule === "function") {
                _hasAutoloaded = false;
                // Retain the original startup stamp across retries.
                $.Schedule(5.0, () => _runAutoload(true));
            }
        });
    };

    const _sendFragment = (f, a) => {
        const message = { q: String(++_fragmentCounter), f, a };
        _bridgePanel.SetURL(BRIDGE_URL + "#" + encodeURIComponent(JSON.stringify(message)));
    };

    const _cancelPendingTimer = (pending) => {
        if (!pending || !pending.timer) return;
        if (typeof $.CancelScheduled === "function") {
            try { $.CancelScheduled(pending.timer); } catch (_) {}
        } else if (typeof clearTimeout === "function") {
            try { clearTimeout(pending.timer); } catch (_) {}
        }
        pending.timer = null;
    };

    const _resetPendingTimer = (pending, reqId) => {
        _cancelPendingTimer(pending);
        const timeoutHandler = () => {
            if (Object.prototype.hasOwnProperty.call(_pendingRequests, reqId)) {
                const timeoutErr = new Error(`Bridge request timed out (${reqId})`);
                _finishRequest(reqId, timeoutErr, null);
            }
        };

        if (typeof $.Schedule === "function") {
            pending.timer = $.Schedule(REQUEST_TIMEOUT_MS / 1000, timeoutHandler);
        } else if (typeof setTimeout === "function") {
            pending.timer = setTimeout(timeoutHandler, REQUEST_TIMEOUT_MS);
        }
    };

    const _processQueue = () => {
        if (_activeRequest !== null) return;
        if (_requestQueue.length === 0) return;
        if (!_bridgeReady) return;

        const nextReq = _requestQueue.shift();
        _activeRequest = nextReq;
        nextReq.start();
    };

    const _finishRequest = (reqId, err, data) => {
        const req = _pendingRequests[reqId];
        if (req) {
            delete _pendingRequests[reqId];
            _cancelPendingTimer(req);
            // A timed-out request may still be waiting for readiness or another request.
            // Remove it before callbacks can enqueue more work or a later handshake drains it.
            for (let i = 0; i < _requestQueue.length; i++) {
                if (_requestQueue[i].id === reqId) {
                    _requestQueue.splice(i, 1);
                    break;
                }
            }
            if (err) {
                if (typeof req.callback === "function") {
                    try { req.callback(err, null); } catch (_) {}
                }
                if (typeof req.reject === "function") {
                    req.reject(err);
                }
            } else {
                if (typeof req.callback === "function") {
                    try { req.callback(null, data); } catch (_) {}
                }
                if (typeof req.resolve === "function") {
                    req.resolve(data);
                }
            }
        }

        if (_activeRequest && _activeRequest.id === reqId) {
            _activeRequest = null;
            _processQueue();
        }
    };

    /**
     * Resolves pending requests upon receiving a QOL_RES: title notification.
     * Supports both single-frame payloads and sequential multi-frame chunked streams.
     */
    const _handleResponse = (payloadStr) => {
        try {
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
            // CEF can deliver each title twice, including chunk acknowledgments.
            if (typeof resp._seq === "number") {
                if (resp._seq <= pending.lastResponseSeq) return;
                pending.lastResponseSeq = resp._seq;
            }

            if (!resp.ok) {
                const err = new Error(resp.error || "CEF bridge request failed");
                _finishRequest(reqId, err, null);
                return;
            }

            // Save chunk acknowledgment (Panorama -> CEF)
            if (typeof resp.savePartAck === "number") {
                const nextPart = resp.savePartAck + 1;
                if (pending.saveChunks && nextPart < pending.saveChunks.length) {
                    _resetPendingTimer(pending, reqId);
                    const b64Key = pending.b64Key;
                    const b64Chunk = pending.saveChunks[nextPart];
                    const total = pending.saveChunks.length;
                    try {
                        _sendFragment("saveChunk", [b64Key, nextPart, total, b64Chunk, reqId, true]);
                    } catch (e) {
                        _finishRequest(reqId, new Error(`Failed to send save chunk ${nextPart}: ${e?.message || e}`), null);
                    }
                    return;
                }
            }

            // Chunked load multi-part stream (CEF -> Panorama)
            if (resp.chunked) {
                if (!Number.isInteger(resp.total) || resp.total <= 0 || resp.total > 5000) {
                    _finishRequest(reqId, new Error(`Invalid chunk total: ${resp.total}`), null);
                    return;
                }
                if (!Number.isInteger(resp.part) || resp.part < 0 || resp.part >= resp.total) {
                    _finishRequest(reqId, new Error(`Invalid chunk part: ${resp.part}`), null);
                    return;
                }
                if (resp.part !== pending.expectedPart) {
                    _finishRequest(reqId, new Error(`Out of order chunk: expected ${pending.expectedPart}, got ${resp.part}`), null);
                    return;
                }

                if (!pending.chunks) {
                    pending.chunks = new Array(resp.total);
                }
                pending.chunks[resp.part] = resp.data;
                pending.expectedPart++;

                const nextPart = pending.expectedPart;
                if (nextPart < resp.total) {
                    _resetPendingTimer(pending, reqId);
                    try {
                        _sendFragment("next", [reqId, nextPart]);
                    } catch (e) {
                        _finishRequest(reqId, new Error(`Failed to request chunk ${nextPart}: ${e?.message || e}`), null);
                    }
                    return;
                }

                // All load chunks received and reassembled
                const assembledData = pending.chunks.join("");
                _finishRequest(reqId, null, assembledData);
                return;
            }

            // Standard single-frame response
            const resultData = resp.data !== undefined ? resp.data : true;
            _finishRequest(reqId, null, resultData);
        } catch (eUnhandled) {
            _logWarn(`Unhandled error in _handleResponse: ${eUnhandled?.message || eUnhandled}`);
        }
    };

    /**
     * Handles HTMLTitle events from the CitadelHTMLPanel.
     */
    const _onHtmlTitle = (panel, title) => {
        if (!title || typeof title !== "string") return;
        if (panel !== _bridgePanel) return;

        if (/^QOL_BRIDGE_READY:frag1(?:$|:)/.test(title)) {
            if (_bridgeReady) return;
            _bridgeReady = true;
            _log("Bridge connected and ready.");
            _processQueue();

            if (_bridgePanel) {
                try {
                    if (typeof _bridgePanel.AddClass === "function") {
                        _bridgePanel.AddClass("BridgeReady");
                    }
                    if (typeof _bridgePanel.SetAttributeString === "function") {
                        _bridgePanel.SetAttributeString("QOL_BridgeReady", "1");
                    }
                } catch (_) {}
            }
            if (_watchdogTimer) {
                if (typeof $.CancelScheduled === "function") {
                    try { $.CancelScheduled(_watchdogTimer); } catch (_) {}
                }
                _watchdogTimer = null;
            }
            _cachedPageRetryScheduled = false;

            _runAutoload();
            return;
        }

        if (title.indexOf("QOL_BRIDGE_READY") === 0) {
            if (_bridgeReady || _initAttempts >= MAX_INIT_ATTEMPTS) return;
            if (!_oldPageLogged) {
                _oldPageLogged = true;
                _logWarn("Outdated cached bridge page: waiting for fragment protocol v1.");
            }
            if (!_cachedPageRetryScheduled && typeof $.Schedule === "function") {
                _cachedPageRetryScheduled = true;
                if (_watchdogTimer && typeof $.CancelScheduled === "function") {
                    try { $.CancelScheduled(_watchdogTimer); } catch (_) {}
                }
                _watchdogTimer = $.Schedule(CACHED_PAGE_RETRY_SEC, _watchdogTick);
            }
            return;
        }

        if (title.indexOf("QOL_BRIDGE_ERROR:") === 0) {
            _bridgeReady = false;
            _logWarn(`Bridge reported error: ${title.slice(17)}`);
            return;
        }

        if (title.indexOf("QOL_RES:") === 0) {
            _handleResponse(title.slice(8));
            return;
        }
    };

    /**
     * Watchdog to verify the bridge achieves ready state after creation.
     */
    const _watchdogTick = () => {
        _watchdogTimer = null;
        _cachedPageRetryScheduled = false;
        if (_bridgeReady) return;
        _initAttempts++;
        if (_initAttempts < MAX_INIT_ATTEMPTS) {
            if (typeof $.Schedule === "function") {
                _watchdogTimer = $.Schedule(WATCHDOG_INTERVAL_SEC, _watchdogTick);
            }
            if (_isPanelAlive(_bridgePanel) && typeof _bridgePanel.SetURL === "function") {
                _log(`Watchdog: bridge not ready yet (attempt ${_initAttempts}/${MAX_INIT_ATTEMPTS}), retrying URL navigation...`);
                _bridgePanel.SetURL(BRIDGE_URL);
            }
        } else {
            _logWarn(`Watchdog: bridge failed to initialize after ${MAX_INIT_ATTEMPTS} attempts.`);
            const queued = _requestQueue.slice(0);
            _requestQueue = [];
            _activeRequest = null;
            const initErr = new Error(`Bridge initialization failed after ${MAX_INIT_ATTEMPTS} attempts`);
            for (let i = 0; i < queued.length; i++) {
                _finishRequest(queued[i].id, initErr, null);
            }
        }
    };

    /**
     * Dispatches a command to CEF via the serialized FIFO request queue.
     */
    const _sendRequest = (startFn, callback, meta) => {
        const requestPromise = new Promise((resolve, reject) => {
            const reqId = `qol_${++_reqCounter}_${Date.now ? Date.now() : (new Date()).getTime()}`;

            const req = {
                id: reqId,
                resolve,
                reject,
                callback,
                timer: null,
                expectedPart: 0,
                lastResponseSeq: 0,
                chunks: null,
                start: () => {
                    if (!_isPanelAlive(_bridgePanel) || typeof _bridgePanel.SetURL !== "function") {
                        const err = new Error("Bridge panel unavailable");
                        return _finishRequest(reqId, err, null);
                    }
                    _resetPendingTimer(req, reqId);
                    try {
                        startFn(reqId);
                    } catch (e) {
                        _finishRequest(reqId, e, null);
                    }
                },
                ...(meta || {})
            };

            _pendingRequests[reqId] = req;
            _requestQueue.push(req);

            // Always arm the timeout timer immediately so unstarted requests cannot hang indefinitely
            _resetPendingTimer(req, reqId);

            if (_bridgeReady) {
                _processQueue();
            } else {
                _logWarn(`Bridge not ready yet; request ${reqId} queued (queue depth: ${_requestQueue.length})`);
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
        if (options && typeof options.autoload === "boolean") {
            _setAutoloadEnabled(options.autoload);
        }

        if (_isPanelAlive(_bridgePanel)) {
            _runAutoload();
            return _bridgePanel;
        }

        const parent = targetParent || (typeof $.GetContextPanel === "function" ? $.GetContextPanel() : null);
        if (!parent) {
            _logWarn("init: no parent panel found to mount storage bridge");
            return null;
        }

        let panel = null;
        if (parent.FindChild) {
            panel = parent.FindChild(BRIDGE_PANEL_ID);
        }

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

        _bridgeReady = false;
        _initAttempts = 0;
        _oldPageLogged = false;
        _cachedPageRetryScheduled = false;

        if (typeof panel.SetURL === "function") {
            try {
                panel.SetURL(BRIDGE_URL);
                _log(`Mounting bridge URL: ${BRIDGE_URL}`);
            } catch (e) {
                _logWarn(`panel.SetURL failed: ${e?.message || e}`);
            }
        }

        if (typeof $.Schedule === "function") {
            if (_watchdogTimer) {
                try { $.CancelScheduled(_watchdogTimer); } catch (_) {}
            }
            _watchdogTimer = $.Schedule(WATCHDOG_INTERVAL_SEC, _watchdogTick);
        }

        return _bridgePanel;
    };

    /**
     * Low-level key/value save with automatic Base64 encoding and multi-part chunking.
     */
    const save = (key, val, callback) => {
        const valStr = typeof val === "string" ? val : JSON.stringify(val);
        const b64Key = _utf8ToBase64(String(key));

        if (valStr.length <= CHUNK_SIZE) {
            const b64Val = _utf8ToBase64(valStr);
            return _sendRequest((id) => {
                _sendFragment("save", [b64Key, b64Val, id, true]);
            }, callback);
        }

        // Multi-part save for large configs (SEC-02)
        const chunks = [];
        for (let i = 0; i < valStr.length;) {
            let end = Math.min(i + CHUNK_SIZE, valStr.length);
            const last = valStr.charCodeAt(end - 1);
            const next = valStr.charCodeAt(end);
            if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--;
            chunks.push(_utf8ToBase64(valStr.slice(i, end)));
            i = end;
        }

        return _sendRequest((id) => {
            const total = chunks.length;
            _sendFragment("saveChunk", [b64Key, 0, total, chunks[0], id, true]);
        }, callback, { b64Key, saveChunks: chunks });
    };

    /**
     * Low-level key/value load.
     */
    const load = (key, callback) => {
        const b64Key = _utf8ToBase64(String(key));
        return _sendRequest((id) => {
            _sendFragment("load", [b64Key, id, true]);
        }, callback);
    };

    /**
     * Low-level key removal.
     */
    const remove = (key, callback) => {
        const b64Key = _utf8ToBase64(String(key));
        return _sendRequest((id) => {
            _sendFragment("remove", [b64Key, id, true]);
        }, callback);
    };

    const _parseStoredSettings = (raw) => {
        if (typeof Q.parseStoredConfig !== "function") throw new Error("Settings parser unavailable");
        return Q.parseStoredConfig(raw);
    };

    /** Save a validated snapshot. Acknowledgment confirms CEF, not just UI sync. */
    const saveSettings = (configOrRaw, callback) => {
        let rawToSave;
        try {
            const config = configOrRaw === undefined
                ? ((typeof MOD_CONFIG !== "undefined" && MOD_CONFIG) || globalThis.MOD_CONFIG || {})
                : configOrRaw;
            rawToSave = typeof config === "string" ? config : WrapConfigForStorage(config);
            rawToSave = WrapConfigForStorage(_parseStoredSettings(rawToSave));
            const root = _findRootPanel();
            if (_isPanelAlive(root)) Q.core.persistence.writeStorageConfigRawToUi(root, rawToSave);
        } catch (err) {
            return _withCallback(Promise.reject(err), callback);
        }
        const promise = save(SETTINGS_STORAGE_KEY, rawToSave).then(() => {
            _log(`saveSettings succeeded (${rawToSave.length} characters).`);
            return { ok: true, timestamp: Date.now() };
        });
        return _withCallback(promise, callback);
    };

    // Validation and normalization happen before publishing any attributes or
    // changing MOD_CONFIG/State. Parsing failures cannot reset a live session.
    const _loadSettings = (state) => load(SETTINGS_STORAGE_KEY).then(data => {
        if (!_isRestoreStateCurrent(state)) {
            return { ok: true, applied: false, skipped: "newer-edits" };
        }
        if (data === null || data === undefined || data === "") {
            return { ok: true, applied: false, raw: "", config: null, notFound: true };
        }
        if (typeof data !== "string") throw new Error("Stored settings response must be a string");
        const parsed = _parseStoredSettings(data);
        const normalizedRaw = WrapConfigForStorage(parsed);
        const publication = Q.core.persistence.writeStorageConfigRawToUi(state.root, normalizedRaw);
        if (!publication.acceptedCount || Q.core.persistence.readStorageConfigRawFromUi(state.root) !== normalizedRaw) {
            throw new Error("Stored settings publication rejected");
        }

        const modCfg = (typeof MOD_CONFIG !== "undefined" && MOD_CONFIG) || globalThis.MOD_CONFIG;
        if (modCfg) {
            for (const key of Object.keys(parsed)) modCfg[key] = parsed[key];
        }
        const runtimeState = (typeof State !== "undefined" && State) || globalThis.State;
        if (runtimeState) runtimeState.lastConfig = parsed;
        const syncFn = globalThis.SyncConfigFromStorage;
        if (typeof syncFn === "function") syncFn();
        // The HUD's revision poll owns ConfigAdapter and feature lifecycle
        // updates. Avoid separately applying a partially synchronized config.
        if (Q.core?.eventBus && typeof Q.core.eventBus.emit === "function") {
            Q.core.eventBus.emit("config:loaded", { config: parsed, raw: normalizedRaw });
        }
        _log(`loadSettings completed (${data.length} characters).`);
        return { ok: true, applied: true, raw: normalizedRaw, config: parsed };
    });

    /** Explicit load may replace preceding edits, never edits made while waiting. */
    const loadSettings = (callback) => {
        const root = _findRootPanel();
        Q.core.persistence?.markConfigEdited(root);
        return _withCallback(_loadSettings(_captureRestoreState()), callback);
    };

    const clearSettings = (callback) => {
        // Clearing storage is also user intent: an older restore must not undo it.
        Q.core.persistence?.markConfigEdited(_findRootPanel());
        return _withCallback(remove(SETTINGS_STORAGE_KEY).then(() => ({ ok: true })), callback);
    };

    const storageBridgeApi = {
        init,
        isReady: () => _bridgeReady,
        getPanel: () => _bridgePanel,
        enableAutoload: _setAutoloadEnabled,
        save,
        load,
        remove,
        saveSettings,
        loadSettings,
        clearSettings,
        _onHtmlTitle,
    };

    Q.core.storageBridge = storageBridgeApi;
    Q.core.storage = storageBridgeApi;
    if (typeof globalThis !== "undefined") {
        globalThis.QOLStorageBridge = storageBridgeApi;
    }

    // Auto-initialize when loaded into a live Panorama panel context
    if (typeof $ !== "undefined" && typeof $.GetContextPanel === "function") {
        try {
            const ctx = $.GetContextPanel();
            const isEscapeMenu = !!(ctx && (ctx.id === "EscapeMenu" || (Q.ROLE && Q.ROLE === "em")));
            init(ctx, { autoload: !isEscapeMenu });
        } catch (e) {
            _logWarn(`Auto-init failed: ${e?.message || e}`);
        }
    }
})();
