// =============================================================================
// QOLLOCK — core/ql_persistence.js
// =============================================================================
// OWNS:        Low-level panel attribute configuration persistence & caching:
//              readStorageConfigRawFromUi, writeStorageConfigRawToUi,
//              getUIRoot, resolveHudPanel.
// DOES NOT OWN: Config validation/normalization, compact codecs or durable CEF saves.
// DEPENDS ON:  Shared utilities/namespace and core/ql_panel_helpers.js.
// USED BY:     HUD and settings contexts; loaded before core/ql_storage_bridge.js.
// =============================================================================

(function () {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : null);

    if (!Q || !Q.core) {
        $.Msg("[QOLLock] core/ql_persistence: QOL.core not found — aborting.");
        return;
    }

    const isAlive = Q.core.panel.isAlive;

    const getStorageKey = () => {
        if (typeof STORAGE_KEY !== "undefined") return STORAGE_KEY;
        if (typeof QOL_STORAGE_KEY !== "undefined") return QOL_STORAGE_KEY;
        return "Deadlock_Mod_Settings_v1";
    };

    const getUserEditRevAttr = () => {
        if (typeof USER_EDIT_REV_ATTR !== "undefined") return USER_EDIT_REV_ATTR;
        if (typeof QOL_USER_EDIT_REV_ATTR !== "undefined") return QOL_USER_EDIT_REV_ATTR;
        return "QOL_USER_EDIT_REV";
    };

    const logWarn = (tag, msg) => {
        if (typeof QOL_WARN === "function") {
            QOL_WARN(tag, msg);
        } else {
            $.Msg(`[QOLLock][WARN][${tag}] ${msg}`);
        }
    };

    const logError = (tag, msg) => {
        if (typeof QOL_ERROR === "function") {
            QOL_ERROR(tag, msg);
        } else {
            $.Msg(`[QOLLock][ERROR][${tag}] ${msg}`);
        }
    };

    const parseRevisionNumber = QOL_UTILS.ParseRevisionNumber;
    const EDIT_REV_ATTR = "QOL_CONFIG_EDIT_REV";

    // Resolve from current context on each access. A live previous root/Hud
    // may be detached, so handle validity cannot key persistence publication.
    const getUIRoot = () => Q.core.panel.findRoot();
    const resolveHudPanel = root => Q.core.panel.findHud(root || $.GetContextPanel());

    let _readStorageDiagLogged = false;
    let _writeStorageDiagLogged = false;
    let _cfgCacheRevision = -1;
    let _cfgCacheRoot = null;
    let _cfgCacheHud = null;
    let _cfgCacheRaw = "";
    let _cfgCacheFullReadMs = 0;
    const CONFIG_FULL_REREAD_INTERVAL_MS = 2000;

    /**
     * Uncached raw config read from panel attributes.
     */
    const readStorageConfigRawUncached = (root, hud, rootRev, hudRev) => {
        let result = "";
        let source = "none";
        let rootLen = 0;
        let hudLen = 0;
        const storageKey = getStorageKey();

        if (root?.GetAttributeString) {
            let rootRaw = "";
            try { rootRaw = String(root.GetAttributeString(storageKey, "") || ""); } catch (_) { rootRaw = ""; }
            rootLen = rootRaw.length;

            if (!hud || !hud.GetAttributeString) {
                result = rootRaw;
                if (rootLen > 0) source = "root_attr";
            } else {
                let hudRaw = "";
                try { hudRaw = String(hud.GetAttributeString(storageKey, "") || ""); } catch (_) { hudRaw = ""; }
                hudLen = hudRaw.length;

                if (!hudRaw) {
                    result = rootRaw;
                    source = rootLen > 0 ? "root_attr" : "none";
                } else if (!rootRaw) {
                    result = hudRaw;
                    source = "hud_attr";
                } else {
                    result = (hudRev >= rootRev) ? hudRaw : rootRaw;
                    source = `attr_rev(${rootRev}/${hudRev})`;
                }
            }
        }

        if (!_readStorageDiagLogged) {
            _readStorageDiagLogged = true;
            $.Msg(`[QOLLock][DIAG][storage] ReadStorageConfig: source=${source} resultLen=${result.length} rootAttrLen=${rootLen} hudAttrLen=${hudLen}`);
        }
        return result;
    };

    // Dirty edits have their own generation: changing a slider must invalidate
    // an in-flight restore even before its debounced data write is published.
    const markConfigEdited = (root) => {
        if (!isAlive(root)) return;
        const hud = resolveHudPanel(root);
        const readEdit = (panel) => parseRevisionNumber(QOL_UTILS.SafeGetAttribute(panel, EDIT_REV_ATTR, "0"));
        const revision = Math.max(readEdit(root), readEdit(hud)) + 1;
        QOL_UTILS.SafeSetAttribute(root, EDIT_REV_ATTR, revision);
        if (hud !== root) QOL_UTILS.SafeSetAttribute(hud, EDIT_REV_ATTR, revision);
    };

    const getConfigChangeStamp = (root) => {
        if (!isAlive(root)) return null;
        const hud = resolveHudPanel(root);
        const revisionAttr = getUserEditRevAttr();
        const read = (panel, attr) => parseRevisionNumber(QOL_UTILS.SafeGetAttribute(panel, attr, "0"));
        return [read(root, revisionAttr), read(hud, revisionAttr), read(root, EDIT_REV_ATTR), read(hud, EDIT_REV_ATTR)].join("|");
    };

    /**
     * Revision-gated cached config read.
     */
    const readStorageConfigRawFromUi = (root) => {
        if (!root || !root.GetAttributeString) return "";

        const hud = resolveHudPanel(root);
        const userEditRevAttr = getUserEditRevAttr();

        let rootRev = 0;
        let hudRev = 0;
        try { rootRev = parseRevisionNumber(root.GetAttributeString(userEditRevAttr, "")); } catch (_) { rootRev = 0; }
        if (hud?.GetAttributeString) {
            try { hudRev = parseRevisionNumber(hud.GetAttributeString(userEditRevAttr, "")); } catch (_) { hudRev = 0; }
        }
        const revision = (hudRev > rootRev) ? hudRev : rootRev;

        const nowMs = Date.now ? Date.now() : (new Date()).getTime();
        const backstopDue = (nowMs - _cfgCacheFullReadMs) >= CONFIG_FULL_REREAD_INTERVAL_MS;
        if (root === _cfgCacheRoot && hud === _cfgCacheHud && revision === _cfgCacheRevision && _cfgCacheRaw !== "" && !backstopDue) {
            return _cfgCacheRaw;
        }

        const result = readStorageConfigRawUncached(root, hud, rootRev, hudRev);
        _cfgCacheRoot = root;
        _cfgCacheHud = hud;
        _cfgCacheRevision = revision;
        _cfgCacheRaw = result;
        _cfgCacheFullReadMs = nowMs;
        return result;
    };

    /**
     * Persists config string to root and hud panel attributes with paired revision increment.
     */
    const writeStorageConfigRawToUi = (root, rawText, options = {}) => {
        if (typeof globalThis._TLog === "function") {
            globalThis._TLog("config:WriteToUi", `len=${rawText ? String(rawText).length : 0}`);
        }
        if (!isAlive(root) || !root.SetAttributeString) {
            return { raw: String(rawText || ""), revision: 0, count: 0, acceptedCount: 0, complete: false, failures: [] };
        }

        const nextRaw = String(rawText || "");
        const hud = resolveHudPanel(root);
        const userEditRevAttr = getUserEditRevAttr();
        const storageKey = getStorageKey();

        const hosts = [...new Set([root, hud, ...(options.extraPanels || [])])].filter(panel => isAlive(panel) && panel.SetAttributeString);
        const read = (panel, key) => String(panel.GetAttributeString(key, "") || "");
        const revisions = hosts.map(panel => { try { return parseRevisionNumber(read(panel, userEditRevAttr)); } catch (_) { return 0; } });
        const nextRevision = Math.max(parseRevisionNumber(options.minimumRevision), ...revisions) + 1;
        const revisionText = String(nextRevision), failures = [];
        let acceptedCount = 0;
        for (const panel of hosts) {
            let previousRaw, previousRevision, phase = "read";
            try {
                previousRaw = read(panel, storageKey);
                previousRevision = read(panel, userEditRevAttr);
                phase = "payload";
                if (panel.SetAttributeString(storageKey, nextRaw) === false || read(panel, storageKey) !== nextRaw) throw Error("payload rejected");
                phase = "revision";
                if (panel.SetAttributeString(userEditRevAttr, revisionText) === false || read(panel, userEditRevAttr) !== revisionText) throw Error("revision rejected");
                acceptedCount++;
            } catch (error) {
                // Native attributes are not an atomic transaction. Restore the
                // previous pair when possible and report rejected rollback too.
                let rolledBack = phase === "read";
                if (phase !== "read") {
                    try {
                        if (read(panel, storageKey) !== previousRaw) panel.SetAttributeString(storageKey, previousRaw);
                        if (read(panel, userEditRevAttr) !== previousRevision) panel.SetAttributeString(userEditRevAttr, previousRevision);
                        rolledBack = read(panel, storageKey) === previousRaw && read(panel, userEditRevAttr) === previousRevision;
                    } catch (_) { rolledBack = false; }
                }
                failures.push({ panelId: String(panel.id || ""), phase, rolledBack });
                logError("persist", `${panel.id || "panel"} config ${phase} failed; rollback=${rolledBack}: ${error?.message || error}`);
            }
        }

        // Native writes can fail independently. Cache actual read-back, never
        // an attempted payload that neither native panel accepted.
        _cfgCacheRoot = _cfgCacheHud = null;
        _cfgCacheRevision = -1;
        _cfgCacheRaw = "";
        _cfgCacheFullReadMs = 0;

        if (!_writeStorageDiagLogged) {
            _writeStorageDiagLogged = true;
            $.Msg(`[QOLLock][DIAG][storage] WriteStorageConfig: len=${nextRaw.length} rev=${nextRevision} hud=${hud?.SetAttributeString ? "yes" : "no"}`);
        }

        return {
            raw: nextRaw,
            revision: nextRevision,
            count: hosts.length,
            acceptedCount,
            complete: hosts.length > 0 && acceptedCount === hosts.length,
            failures
        };
    };

    const persistenceApi = {
        getUIRoot,
        resolveHudPanel,
        readStorageConfigRawFromUi,
        readStorageConfigRawUncached,
        writeStorageConfigRawToUi,
        markConfigEdited,
        getConfigChangeStamp,
        parseRevisionNumber
    };

    Q.core.persistence = persistenceApi;

    // Backward-compatible delegates on root QOL namespace
    Q.getUIRoot = getUIRoot;
    Q.resolveHudPanel = resolveHudPanel;
    Q.readStorageConfigRawFromUi = readStorageConfigRawFromUi;
    Q.readStorageConfigRawUncached = readStorageConfigRawUncached;
    Q.writeStorageConfigRawToUi = writeStorageConfigRawToUi;

    $.Msg("[QOLLock] core/ql_persistence: attached to QOL.core.persistence");
})();
