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
    const WATCHDOG_INTERVAL_SEC = 20.0;
    const MAX_INIT_ATTEMPTS = 5;

    const CHUNK_SIZE = 1500;

    let _bridgePanel = null;
    let _bridgeReady = false;
    let _isPageLoaded = false;
    let _reqCounter = 0;
    let _pendingRequests = {};
    let _requestQueue = [];
    let _activeRequest = null;
    let _watchdogTimer = null;
    let _initAttempts = 0;
    let _hasAutoloaded = false;
    let _autoloadEnabled = false;

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
            "var CHUNK_SIZE = 1500;" +
            "var _loadBuffers = Object.create(null);" +
            "var _saveBuffers = Object.create(null);" +
            "var _sendSeq = 0;" +
            "function isValidId(id) { return typeof id === 'string' && /^qol_\\d+_\\d+$/.test(id); }" +
            "function decodeText(text, isB64) {" +
                "if (!isB64 || typeof text !== 'string') return String(text);" +
                "try { return decodeURIComponent(escape(atob(text))); } catch (_) { try { return atob(text); } catch (__) { return String(text); } }" +
            "}" +
            "function send(id, ok, data, err, extra) {" +
                "var resp = { id: id, ok: !!ok, _seq: ++_sendSeq };" +
                "if (data !== undefined) resp.data = data;" +
                "if (err) resp.error = String(err);" +
                "if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) resp[k] = extra[k]; } }" +
                "document.title = 'QOL_RES:' + JSON.stringify(resp);" +
            "}" +
            "window.__qolSave = function(k, v, id, isB64) {" +
                "if (!isValidId(id)) return;" +
                "try { localStorage.setItem(decodeText(k, isB64), decodeText(v, isB64)); send(id, true); } catch (e) { send(id, false, undefined, e && e.message ? e.message : e); }" +
            "};" +
            "window.__qolSaveChunk = function(key, part, total, chunk, id, isB64) {" +
                "if (!isValidId(id)) return;" +
                "try {" +
                    "if (!Number.isInteger(part) || !Number.isInteger(total) || part < 0 || part >= total || total > 5000) { send(id, false, undefined, 'Invalid save chunk boundaries'); return; }" +
                    "if (!_saveBuffers[id]) { _saveBuffers[id] = new Array(total); setTimeout(function() { if (_saveBuffers[id]) delete _saveBuffers[id]; }, 30000); }" +
                    "_saveBuffers[id][part] = decodeText(chunk, isB64);" +
                    "if (part + 1 === total) { var full = _saveBuffers[id].join(''); delete _saveBuffers[id]; localStorage.setItem(decodeText(key, isB64), full); send(id, true); }" +
                    "else { send(id, true, undefined, null, { savePartAck: part }); }" +
                "} catch (e) { if (_saveBuffers[id]) delete _saveBuffers[id]; send(id, false, undefined, e && e.message ? e.message : e); }" +
            "};" +
            "window.__qolLoad = function(k, id, isB64) {" +
                "if (!isValidId(id)) return;" +
                "try {" +
                    "var val = localStorage.getItem(decodeText(k, isB64));" +
                    "if (val === null || val === undefined || val.length <= CHUNK_SIZE) { send(id, true, val); return; }" +
                    "var chunks = [];" +
                    "for (var i = 0; i < val.length; i += CHUNK_SIZE) chunks.push(val.slice(i, i + CHUNK_SIZE));" +
                    "_loadBuffers[id] = chunks;" +
                    "setTimeout(function() { if (_loadBuffers[id]) delete _loadBuffers[id]; }, 30000);" +
                    "send(id, true, chunks[0], null, { chunked: true, part: 0, total: chunks.length });" +
                "} catch (e) { send(id, false, undefined, e && e.message ? e.message : e); }" +
            "};" +
            "window.__qolNextChunk = function(id, part) {" +
                "if (!isValidId(id)) return;" +
                "try {" +
                    "var chunks = _loadBuffers[id];" +
                    "if (!chunks || !Number.isInteger(part) || part < 0 || part >= chunks.length) { if (_loadBuffers[id]) delete _loadBuffers[id]; send(id, false, undefined, 'Invalid chunk index'); return; }" +
                    "var chunkData = chunks[part];" +
                    "if (part + 1 === chunks.length) delete _loadBuffers[id];" +
                    "send(id, true, chunkData, null, { chunked: true, part: part, total: chunks.length });" +
                "} catch (e) { if (_loadBuffers[id]) delete _loadBuffers[id]; send(id, false, undefined, e && e.message ? e.message : e); }" +
            "};" +
            "window.__qolRemove = function(k, id, isB64) {" +
                "if (!isValidId(id)) return;" +
                "try { localStorage.removeItem(decodeText(k, isB64)); send(id, true); } catch (e) { send(id, false, undefined, e && e.message ? e.message : e); }" +
            "};" +
            "document.title = 'QOL_BRIDGE_READY:' + Date.now();" +
        "})();void(0);";

        try {
            _bridgePanel.SetURL(jsCode);
        } catch (e) {
            _logWarn(`_injectBridgeScript failed: ${e?.message || e}`);
        }
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
                    const nextJs = `javascript:window.__qolSaveChunk && window.__qolSaveChunk('${b64Key}', ${nextPart}, ${total}, '${b64Chunk}', '${reqId}', true);void(0);`;
                    try {
                        _bridgePanel.SetURL(nextJs);
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
                    const nextChunkJs = `javascript:window.__qolNextChunk && window.__qolNextChunk('${reqId}', ${nextPart});void(0);`;
                    try {
                        _bridgePanel.SetURL(nextChunkJs);
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

        if (title.indexOf("QOL_BRIDGE_READY") === 0) {
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

            if (_autoloadEnabled && !_hasAutoloaded) {
                _hasAutoloaded = true;
                storageBridgeApi.loadSettings((err, res) => {
                    if (err) {
                        _logWarn(`Startup autoload failed: ${err.message || err}`);
                        _hasAutoloaded = false;
                        if (typeof $.Schedule === "function") {
                            $.Schedule(5.0, () => {
                                if (!_hasAutoloaded && _bridgeReady) {
                                    _hasAutoloaded = true;
                                    storageBridgeApi.loadSettings((rErr, rRes) => {
                                        if (rErr) {
                                            _logWarn(`Startup autoload retry failed: ${rErr.message || rErr}`);
                                        } else if (rRes && rRes.ok) {
                                            _log("Saved settings restored successfully on retry from CEF storage.");
                                        }
                                    }).catch(() => {});
                                }
                            });
                        }
                    } else if (res && res.notFound) {
                        _log("No saved settings found in CEF storage; using defaults.");
                    } else if (res && res.ok) {
                        _log("Saved settings restored successfully from CEF storage.");
                    }
                }).catch(() => {});
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

        // Local directory listing page loaded (Index of C:/ in tests or dev)
        if (!_isPageLoaded && (title.indexOf("Index of") === 0 || title.indexOf("Directory listing") === 0)) {
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
                if (_isPageLoaded) {
                    _log(`Watchdog: directory loaded but bridge not ready (attempt ${_initAttempts}/${MAX_INIT_ATTEMPTS}), re-injecting script...`);
                    _injectBridgeScript();
                } else {
                    _log(`Watchdog: bridge not ready yet (attempt ${_initAttempts}/${MAX_INIT_ATTEMPTS}), retrying URL navigation...`);
                    _bridgePanel.SetURL(BRIDGE_LOCAL_URL);
                }
            }
            if (typeof $.Schedule === "function") {
                _watchdogTimer = $.Schedule(WATCHDOG_INTERVAL_SEC, _watchdogTick);
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
            _autoloadEnabled = options.autoload;
        }

        if (_isPanelAlive(_bridgePanel)) {
            if (_bridgeReady && _autoloadEnabled && !_hasAutoloaded) {
                _hasAutoloaded = true;
                storageBridgeApi.loadSettings().catch(() => {});
            }
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
        _isPageLoaded = false;

        if (typeof panel.SetURL === "function") {
            try {
                panel.SetURL(BRIDGE_LOCAL_URL);
                _log(`Mounting bridge URL: ${BRIDGE_LOCAL_URL}`);
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
                _bridgePanel.SetURL(`javascript:window.__qolSave && window.__qolSave('${b64Key}', '${b64Val}', '${id}', true);void(0);`);
            }, callback);
        }

        // Multi-part save for large configs (SEC-02)
        const chunks = [];
        for (let i = 0; i < valStr.length; i += CHUNK_SIZE) {
            chunks.push(_utf8ToBase64(valStr.slice(i, i + CHUNK_SIZE)));
        }

        return _sendRequest((id) => {
            const total = chunks.length;
            _bridgePanel.SetURL(`javascript:window.__qolSaveChunk && window.__qolSaveChunk('${b64Key}', 0, ${total}, '${chunks[0]}', '${id}', true);void(0);`);
        }, callback, { b64Key, saveChunks: chunks });
    };

    /**
     * Low-level key/value load.
     */
    const load = (key, callback) => {
        const b64Key = _utf8ToBase64(String(key));
        return _sendRequest((id) => {
            _bridgePanel.SetURL(`javascript:window.__qolLoad && window.__qolLoad('${b64Key}', '${id}', true);void(0);`);
        }, callback);
    };

    /**
     * Low-level key removal.
     */
    const remove = (key, callback) => {
        const b64Key = _utf8ToBase64(String(key));
        return _sendRequest((id) => {
            _bridgePanel.SetURL(`javascript:window.__qolRemove && window.__qolRemove('${b64Key}', '${id}', true);void(0);`);
        }, callback);
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

                if (typeof SafeParseConfig === "function") {
                    parsed = SafeParseConfig(rawText);
                }
                if (!parsed && typeof UnwrapConfigFromStorage === "function") {
                    const unwrap = UnwrapConfigFromStorage(rawText);
                    if (unwrap && unwrap.config) {
                        parsed = unwrap.config;
                    }
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
                    delete parsed.__proto__;
                    delete parsed.constructor;
                    delete parsed.prototype;
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
            const ctx = $.GetContextPanel();
            const isEscapeMenu = !!(ctx && (ctx.id === "EscapeMenu" || (Q.ROLE && Q.ROLE === "em")));
            init(ctx, { autoload: !isEscapeMenu });
        } catch (e) {
            _logWarn(`Auto-init failed: ${e?.message || e}`);
        }
    }
})();
