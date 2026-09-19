// =============================================================================
// QOLLOCK — core/ql_persistence.js
// =============================================================================
// OWNS:        Low-level panel attribute configuration persistence & caching:
//              readStorageConfigRawFromUi, writeStorageConfigRawToUi,
//              getUIRoot, resolveHudPanel.
// DOES NOT OWN: Config validation (ConfigStore), Schema migration (legacy_3_1_9)
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js, core/ql_hud.js
// USED BY:     ql_core.js, ql_app.js, ql_settings_loader.js, feature manifests
// LOAD ORDER:  7th — after core/ql_hero_probe.js
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

    const getCached = (key) => {
        if (typeof Q.getCachedPanel === "function") {
            return Q.getCachedPanel(key);
        }
        const state = (Q.state || (typeof State !== "undefined" ? State : null));
        return state?.cachedPanels?.[key] || null;
    };

    const setCached = (key, panel) => {
        if (typeof Q.setCachedPanel === "function") {
            Q.setCachedPanel(key, panel);
        } else {
            const state = (Q.state || (typeof State !== "undefined" ? State : null));
            if (state?.cachedPanels) {
                state.cachedPanels[key] = panel;
            }
        }
    };

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

    /**
     * Finds and caches the absolute UI root panel by walking the parent chain.
     */
    const getUIRoot = () => {
        const cached = getCached("uiRoot");
        if (isAlive(cached)) return cached;

        let p = null;
        if (Q.core?.panel?.findRoot) {
            p = Q.core.panel.findRoot();
        } else {
            p = typeof $.GetContextPanel === "function" ? $.GetContextPanel() : null;
            let guard = 0;
            while (p && p.GetParent && isAlive(p.GetParent()) && guard < 64) {
                p = p.GetParent();
                guard++;
            }
            if (guard >= 64) {
                logWarn("ui", "GetUIRoot: parent-chain walk hit guard limit — panel hierarchy may be corrupted");
            }
        }
        setCached("uiRoot", p);
        return p || null;
    };

    /**
     * Resolves the primary #Hud panel relative to the given root (or context).
     */
    const resolveHudPanel = (root) => {
        const cached = getCached("cachedHudPanel");
        if (isAlive(cached)) return cached;

        let hud = null;
        if (Q.core?.panel?.findHud) {
            hud = Q.core.panel.findHud(root);
        } else if (Q.core.hud?.findHud) {
            hud = Q.core.hud.findHud();
        } else if (root?.FindChildTraverse) {
            try { hud = root.FindChildTraverse("Hud"); } catch (_) { hud = null; }
        }
        if (isAlive(hud)) {
            setCached("cachedHudPanel", hud);
        }
        return hud || null;
    };

    let _readStorageDiagLogged = false;
    let _writeStorageDiagLogged = false;
    let _cfgCacheRevision = -1;
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
        if (revision === _cfgCacheRevision && _cfgCacheRaw !== "" && !backstopDue) {
            return _cfgCacheRaw;
        }

        const result = readStorageConfigRawUncached(root, hud, rootRev, hudRev);
        _cfgCacheRevision = revision;
        _cfgCacheRaw = result;
        _cfgCacheFullReadMs = nowMs;
        return result;
    };

    /**
     * Persists config string to root and hud panel attributes with paired revision increment.
     */
    const writeStorageConfigRawToUi = (root, rawText) => {
        if (typeof globalThis._TLog === "function") {
            globalThis._TLog("config:WriteToUi", `len=${rawText ? String(rawText).length : 0}`);
        }
        if (!root || !root.SetAttributeString) {
            return { raw: String(rawText || ""), revision: 0, count: 0 };
        }

        const nextRaw = String(rawText || "");
        const hud = resolveHudPanel(root);
        const userEditRevAttr = getUserEditRevAttr();
        const storageKey = getStorageKey();

        let rootRev = 0;
        let hudRev = 0;
        try { rootRev = parseRevisionNumber(root.GetAttributeString(userEditRevAttr, "")); } catch (_) { rootRev = 0; }
        try { hudRev = hud?.GetAttributeString ? parseRevisionNumber(hud.GetAttributeString(userEditRevAttr, "")) : 0; } catch (_) { hudRev = 0; }
        const nextRevision = Math.max(rootRev, hudRev) + 1;

        try { root.SetAttributeString(storageKey, nextRaw); } catch (e) { logError("persist", `root.SetAttributeString(STORAGE_KEY) failed: ${e?.message || e}`); }
        try { root.SetAttributeString(userEditRevAttr, String(nextRevision)); } catch (e) { logError("persist", `root.SetAttributeString(USER_EDIT_REV) failed: ${e?.message || e}`); }

        if (hud?.SetAttributeString) {
            try { hud.SetAttributeString(storageKey, nextRaw); } catch (e) { logError("persist", `hud.SetAttributeString(STORAGE_KEY) failed: ${e?.message || e}`); }
            try { hud.SetAttributeString(userEditRevAttr, String(nextRevision)); } catch (e) { logError("persist", `hud.SetAttributeString(USER_EDIT_REV) failed: ${e?.message || e}`); }
        }

        _cfgCacheRevision = nextRevision;
        _cfgCacheRaw = nextRaw;
        _cfgCacheFullReadMs = Date.now ? Date.now() : (new Date()).getTime();

        if (!_writeStorageDiagLogged) {
            _writeStorageDiagLogged = true;
            $.Msg(`[QOLLock][DIAG][storage] WriteStorageConfig: len=${nextRaw.length} rev=${nextRevision} hud=${hud?.SetAttributeString ? "yes" : "no"}`);
        }

        return {
            raw: nextRaw,
            revision: nextRevision,
            count: hud?.SetAttributeString ? 2 : 1
        };
    };

    const persistenceApi = {
        getUIRoot,
        resolveHudPanel,
        readStorageConfigRawFromUi,
        readStorageConfigRawUncached,
        writeStorageConfigRawToUi,
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
