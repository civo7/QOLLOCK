// ql_feat_buildsave.js — Build save state machine: hero switch, category write, verify
// Extracted from ql_core.js, Step 3
(function() {
    'use strict';
    var _featureId = "ql_feat_buildsave";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "normalizeHeroId", "getConfiguredDefaultHeroId", "selectHeroForBuildSave",
        "queueDelayedHeroRestore", "tryAdvanceStorageSwitchStage",
        "tryAdvanceStorageSwitchSettleStage", "setBuildSaveStatus",
        "canReuseLoaderConfirmedSkyrunnerContext", "readPanelTextMaybe",
        "extractBuildCategoryPayloadToken", "resolveCachedPanel",
        "confirmStorageHeroSignatureAbilities", "ensureStorageBuildInitialized",
        "activatePanelSafe",
        "finalizeSaveSettingsLoaderSession", "beginSaveSettingsLoaderSession",
        "updateSaveSettingsLoaderFromBuildSaveState", "setSaveSettingsLoaderStepState",
        "getSaveSettingsLoaderStepState", "saveSettingsLoaderEnabled",
        "captureBuildSaveTargetSelection", "ensureShopFavoritesNavActive", "ensureStorageHeroFavoritesHeaderVisible", "getBuildSaveHudPanel", "hasBuildSaveStorageUiReady", "isBuildSaveStorageRuntimeSourceStale", "isBuildSaveTargetSelectionMatch", "isHudClassActive", "resolveBuildSaveStorageHeroSignal", "tryCloseHeroShopForLoader", "tryOpenHeroShopForHeroProbe", "tryReselectBuildSaveTargetByTitle"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var NormalizeHeroId = _deps.normalizeHeroId;
    var GetConfiguredDefaultHeroId = _deps.getConfiguredDefaultHeroId;
    var SelectHeroForBuildSave = _deps.selectHeroForBuildSave;
    var QueueDelayedHeroRestore = _deps.queueDelayedHeroRestore;
    var TryAdvanceStorageSwitchStage = _deps.tryAdvanceStorageSwitchStage;
    var TryAdvanceStorageSwitchSettleStage = _deps.tryAdvanceStorageSwitchSettleStage;
    var SetBuildSaveStatus = _deps.setBuildSaveStatus;
    var CanReuseLoaderConfirmedSkyrunnerContext = _deps.canReuseLoaderConfirmedSkyrunnerContext;
    var IsPanelValid = Utils.IsPanelValid;
    var ReadPanelTextMaybe = _deps.readPanelTextMaybe;
    var ExtractBuildCategoryPayloadToken = _deps.extractBuildCategoryPayloadToken;
    var ResolveCachedPanel = _deps.resolveCachedPanel;
    var ConfirmStorageHeroSignatureAbilities = _deps.confirmStorageHeroSignatureAbilities;
    var EnsureStorageBuildInitialized = _deps.ensureStorageBuildInitialized;
    var ActivatePanelSafe = _deps.activatePanelSafe;
    var FinalizeSaveSettingsLoaderSession = _deps.finalizeSaveSettingsLoaderSession;
    var BeginSaveSettingsLoaderSession = _deps.beginSaveSettingsLoaderSession;
    var UpdateSaveSettingsLoaderFromBuildSaveState = _deps.updateSaveSettingsLoaderFromBuildSaveState;
    var SetSaveSettingsLoaderStepState = _deps.setSaveSettingsLoaderStepState;
    var GetSaveSettingsLoaderStepState = _deps.getSaveSettingsLoaderStepState;
    var SAVE_SETTINGS_LOADER_ENABLED = _deps.saveSettingsLoaderEnabled;
    var CaptureBuildSaveTargetSelection = _deps.captureBuildSaveTargetSelection;
    var EnsureShopFavoritesNavActive = _deps.ensureShopFavoritesNavActive;
    var EnsureStorageHeroFavoritesHeaderVisible = _deps.ensureStorageHeroFavoritesHeaderVisible;
    var GetBuildSaveHudPanel = _deps.getBuildSaveHudPanel;
    var HasBuildSaveStorageUiReady = _deps.hasBuildSaveStorageUiReady;
    var IsBuildSaveStorageRuntimeSourceStale = _deps.isBuildSaveStorageRuntimeSourceStale;
    var IsBuildSaveTargetSelectionMatch = _deps.isBuildSaveTargetSelectionMatch;
    var IsHudClassActive = _deps.isHudClassActive;
    var ResolveBuildSaveStorageHeroSignal = _deps.resolveBuildSaveStorageHeroSignal;
    var TryCloseHeroShopForLoader = _deps.tryCloseHeroShopForLoader;
    var TryOpenHeroShopForHeroProbe = _deps.tryOpenHeroShopForHeroProbe;
    var TryReselectBuildSaveTargetByTitle = _deps.tryReselectBuildSaveTargetByTitle;

    // ── Constants (from ql_core.js) ──
    var BUILD_CATEGORY_PAYLOAD_INIT_MAX_RETRIES = 10;
    var BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
    var BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS = 100;
    var BUILD_SAVE_ACTION_DELAY_MS = 20;
    var BUILD_SAVE_AFTER_WRITE_DELAY_MS = 30;
    var BUILD_SAVE_MAX_RETRIES = 12;
    var BUILD_SAVE_MSG_ATTR = "QOL_BUILD_SAVE_MSG";
    var BUILD_SAVE_REQUEST_ATTR = "QOL_BUILD_SAVE_REQUEST";
    var BUILD_SAVE_RETURN_DELAY_SEC = 0.3;
    var BUILD_SAVE_STATE_ATTR = "QOL_BUILD_SAVE_STATE";
    var BUILD_SAVE_STORAGE_CONFIRM_MAX_REOPEN_ATTEMPTS = 3;
    var BUILD_SAVE_STORAGE_CONFIRM_POLL_MS = 200;
    var BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_MIN_ELAPSED_MS = 1000;
    var BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_MIN_RETRIES = 8;
    var BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_REQUIRED_HITS = 2;
    var BUILD_SAVE_STORAGE_CONFIRM_REOPEN_COOLDOWN_MS = 1200;
    var BUILD_SAVE_STORAGE_CONFIRM_REOPEN_MIN_RETRIES = 6;
    var BUILD_SAVE_STORAGE_CONFIRM_TIMEOUT_MS = 4000;
    var BUILD_SAVE_STORAGE_HERO_ID = "hero_skyrunner";
    var BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS = 2;
    var BUILD_SAVE_TARGET_LOCK_MAX_DRIFT_RETRIES = 12;
    var BUILD_SAVE_TARGET_LOCK_QUIET_MS = 150;
    var BUILD_SAVE_TARGET_LOCK_RETRY_DELAY_MS = 80;
    var BUILD_SAVE_TARGET_LOCK_STABLE_HITS = 3;
    var BUILD_SAVE_TIMEOUT_MS = 12000;
    var BUILD_SAVE_TOKEN_ATTR = "QOL_BUILD_SAVE_TOKEN";
    var BUILD_SAVE_VERIFY_DELAY_MS = 200;
    var PANEL_ID_SHOP_MODS_SELECTED_BUILD = "ShopModsSelectedBuild";
    // SAVE_SETTINGS_LOADER_ENABLED is imported via _deps (line 43).

    // ── ResetBuildSaveRequestAttributes ──
function ResetBuildSaveRequestAttributes(root) {
    if (!root || !root.SetAttributeString) return;
    root.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, "");
    root.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, "");
    root.SetAttributeString(BUILD_SAVE_MSG_ATTR, "");
    root.SetAttributeString(BUILD_SAVE_STATE_ATTR, "");
}

    // ── ResetBuildSaveRuntimeState ──
    function ResetBuildSaveRuntimeState() {
        State.buildSaveActiveToken = "";
        State.buildSaveStage = "";
        State.buildSaveStartedMs = 0;
        State.buildSaveNextActionMs = 0;
        State.buildSaveRetries = 0;
        State.buildSaveDidSwitchToStorageHero = false;
        State.buildSaveCaptureStartedMs = 0;
        State.buildSaveReturnHero = "";
        State.buildSaveStorageHeroConfirmed = false;
        State.buildSaveStorageHeroConfirmedSource = "";
        State.buildSaveStorageConfirmRetries = 0;
        State.buildSaveStorageSwitchRetries = 0;
        State.buildSaveStorageConfirmStartedMs = 0;
        State.buildSaveStorageLastSwitchMs = 0;
        State.buildSaveStorageShopReopenNextMs = 0;
        State.buildSaveStorageShopReopenAttempts = 0;
        State.buildSaveFavoritesActionNextMs = 0;
        State.buildSaveStorageProvisionalHits = 0;
        State.storageHeroSignatureConfirmSig = "";
        State.storageHeroSignatureConfirmHits = 0;
        State.storageHeroSignatureLastDetail = "";
        State.buildSaveMutationClosed = false;
        State.buildSaveTargetBuildPanel = null;
        State.buildSaveTargetBuildSig = "";
        State.buildSaveTargetBuildTitle = "";
        State.buildSaveTargetStableHits = 0;
        State.buildSaveTargetDriftRetries = 0;
        State.buildSaveTargetQuietUntilMs = 0;
    }

    // ── GetBuildSaveCategoryNameEntry ──
    function GetBuildSaveCategoryNameEntry(root) {
        var hudBuilds = QOL.getBuildSaveHudPanel(root);
        var entry = hudBuilds && hudBuilds.FindChildTraverse ? hudBuilds.FindChildTraverse("CategoryNameTextEntry") : null;
        if (!entry && root && root.FindChildTraverse) entry = root.FindChildTraverse("CategoryNameTextEntry");
        return entry || null;
    }

    // ── IsBuildSaveEditModeActive ──
    function IsBuildSaveEditModeActive(root) {
        var hudBuilds = QOL.getBuildSaveHudPanel(root);
        if (!hudBuilds || !hudBuilds.BHasClass) return false;
        try {
            return !!hudBuilds.BHasClass("gEditingBuilds");
        } catch(e0) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e0 && e0.message ? e0.message : String(e0 || ""))); }
        return false;
    }

    // ── HasFocusedBuildCategory ──
    function HasFocusedBuildCategory(selectedBuild) {
        if (!selectedBuild || !selectedBuild.FindChildrenWithClassTraverse) return false;
        var focusedPanels = selectedBuild.FindChildrenWithClassTraverse("Focused") || [];
        for (var i = 0; i < focusedPanels.length; i++) {
            var panel = focusedPanels[i];
            if (!panel || !panel.FindChildTraverse) continue;
            try {
                if (panel.FindChildTraverse("BuildCategoryHeader")) return true;
            } catch(e0) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        return false;
    }

    // ── FocusFirstBuildCategory ──
    function FocusFirstBuildCategory(selectedBuild) {
        if (!selectedBuild || !selectedBuild.FindChildrenWithClassTraverse) return false;
        if (HasFocusedBuildCategory(selectedBuild)) return true;
        var headers = selectedBuild.FindChildrenWithClassTraverse("BuildCategory") || [];
        for (var i = 0; i < headers.length; i++) {
            var panel = headers[i];
            if (!panel) continue;
            var panelId = "";
            try {
                panelId = panel.id ? String(panel.id) : "";
            } catch (e0) {
                panelId = "";
            }
            if (panelId !== "BuildCategoryHeader") continue;
            QOL.activatePanelSafe(panel);
            var panelParent = null;
            try { panelParent = panel.GetParent ? panel.GetParent() : null; } catch (e1) { panelParent = null; }
            QOL.activatePanelSafe(panelParent);
        }

        if (HasFocusedBuildCategory(selectedBuild)) return true;

        var stack = [selectedBuild];
        var scanned = 0;
        var activatedAny = false;
        while (stack.length > 0 && scanned < 1200) {
            var node = stack.pop();
            if (!node) continue;
            scanned++;
            var nodeId = "";
            try { nodeId = node.id ? String(node.id) : ""; } catch (e2) { nodeId = ""; }
            if (nodeId === "BuildCategoryHeader") {
                if (QOL.activatePanelSafe(node)) activatedAny = true;
                var nodeParent = null;
                try { nodeParent = node.GetParent ? node.GetParent() : null; } catch (e3) { nodeParent = null; }
                if (QOL.activatePanelSafe(nodeParent)) activatedAny = true;
            }
            var childCount = 0;
            try { childCount = node.GetChildCount ? node.GetChildCount() : 0; } catch (e4) { childCount = 0; }
            for (var c = 0; c < childCount; c++) {
                var child = null;
                try { child = node.GetChild(c); } catch (e5) { child = null; }
                if (child) stack.push(child);
            }
        }

        return HasFocusedBuildCategory(selectedBuild);
    }

    // ── DefocusBuildSaveCategoryEntry ──
    function DefocusBuildSaveCategoryEntry(root, selectedBuild) {
        var activated = false;
        var host = selectedBuild;
        if (!host && root && root.FindChildTraverse) {
            host = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
        }
        var header = host && host.FindChildTraverse ? host.FindChildTraverse("BuildCategoryHeader") : null;
        if (header && QOL.activatePanelSafe(header)) activated = true;
        var headerParent = null;
        try { headerParent = header && header.GetParent ? header.GetParent() : null; } catch (e0) { headerParent = null; }
        if (headerParent && QOL.activatePanelSafe(headerParent)) activated = true;
        if (!activated && host && QOL.activatePanelSafe(host)) activated = true;
        if (!activated) {
            var hudBuilds = QOL.getBuildSaveHudPanel(root);
            if (hudBuilds && QOL.activatePanelSafe(hudBuilds)) activated = true;
        }
        return activated;
    }

    // ── CountBuildCategoryHeaders ──
    function CountBuildCategoryHeaders(selectedBuild) {
        if (!selectedBuild || !selectedBuild.FindChildrenWithClassTraverse) return 0;
        var count = 0;

        var byBuildCategoryName = selectedBuild.FindChildrenWithClassTraverse("BuildCategoryName") || [];
        if (byBuildCategoryName.length > count) count = byBuildCategoryName.length;

        var byCategoryName = selectedBuild.FindChildrenWithClassTraverse("CategoryName") || [];
        if (byCategoryName.length > count) count = byCategoryName.length;

        var headers = selectedBuild.FindChildrenWithClassTraverse("BuildCategory") || [];
        var legacyCount = 0;
        for (var i = 0; i < headers.length; i++) {
            var panel = headers[i];
            if (!panel) continue;
            var panelId = "";
            try { panelId = panel.id ? String(panel.id) : ""; } catch (e0) { panelId = ""; }
            if (panelId === "BuildCategoryHeader") legacyCount++;
        }
        if (legacyCount > count) count = legacyCount;
        return count;
    }

    // ── HasWritableBuildCategoryEntry ──
    function HasWritableBuildCategoryEntry(root) {
        var entry = GetBuildSaveCategoryNameEntry(root);
        if (!entry || !IsPanelValid(entry)) return false;
        var text = QOL.readPanelTextMaybe(entry);
        return !!(text && String(text).trim().length > 0);
    }

    // ── EnsureBuildSaveTargetSelectionLocked ──
    function EnsureBuildSaveTargetSelectionLocked(root, nowMs, requestToken, selectedBuild, strictLock) {
        var strict = (strictLock === true);
        if (!root || !selectedBuild || !IsPanelValid(selectedBuild)) {
            State.buildSaveTargetStableHits = 0;
            State.buildSaveTargetQuietUntilMs = 0;
            return false;
        }

        if (!State.buildSaveTargetBuildSig && !State.buildSaveTargetBuildTitle) {
            QOL.captureBuildSaveTargetSelection(root, selectedBuild, nowMs);
        }

        if (!QOL.isBuildSaveTargetSelectionMatch(root, selectedBuild)) {
            if (State.buildSaveMutationClosed) {
                FinishBuildSaveRequest(root, requestToken, "failed", "target_drift_after_commit");
                return false;
            }

            State.buildSaveTargetStableHits = 0;
            State.buildSaveTargetQuietUntilMs = 0;
            State.buildSaveTargetDriftRetries = (Number(State.buildSaveTargetDriftRetries) || 0) + 1;
            State.buildSaveMutationClosed = false;

            var reselect = QOL.tryReselectBuildSaveTargetByTitle(root, State.buildSaveTargetBuildTitle);
            if ((!reselect || !reselect.ok) && IsPanelValid(State.buildSaveTargetBuildPanel)) {
                QOL.activatePanelSafe(State.buildSaveTargetBuildPanel);
            }

            QOL.setBuildSaveStatus(root, "pending", "locking_target_build", requestToken);
            State.buildSaveStage = "lock_target_build";
            State.buildSaveNextActionMs = nowMs + BUILD_SAVE_TARGET_LOCK_RETRY_DELAY_MS;


            if ((Number(State.buildSaveTargetDriftRetries) || 0) > BUILD_SAVE_TARGET_LOCK_MAX_DRIFT_RETRIES) {
                FinishBuildSaveRequest(root, requestToken, "failed", "target_lock_failed");
            }
            return false;
        }

        State.buildSaveTargetDriftRetries = 0;
        if (!strict) return true;

        State.buildSaveTargetStableHits = (Number(State.buildSaveTargetStableHits) || 0) + 1;
        if (State.buildSaveTargetStableHits < BUILD_SAVE_TARGET_LOCK_STABLE_HITS) {
            QOL.setBuildSaveStatus(root, "pending", "locking_target_build", requestToken);
            State.buildSaveNextActionMs = nowMs + BUILD_SAVE_TARGET_LOCK_RETRY_DELAY_MS;
            return false;
        }

        if (!(Number(State.buildSaveTargetQuietUntilMs) > nowMs)) {
            if (!State.buildSaveTargetQuietUntilMs || State.buildSaveTargetQuietUntilMs <= 0) {
                State.buildSaveTargetQuietUntilMs = nowMs + BUILD_SAVE_TARGET_LOCK_QUIET_MS;
            }
            if (nowMs < State.buildSaveTargetQuietUntilMs) {
                QOL.setBuildSaveStatus(root, "pending", "locking_target_build", requestToken);
                State.buildSaveNextActionMs = nowMs + BUILD_SAVE_TARGET_LOCK_RETRY_DELAY_MS;
                return false;
            }
        }

        return true;
    }

    // ── ConfirmBuildSaveStorageHero ──
    function ConfirmBuildSaveStorageHero(root, nowMs) {
        _TLog("save:ConfirmStorage", "nowMs=" + nowMs);
        if (State.buildSaveStorageHeroConfirmed) return true;
        // Language-agnostic bypass: if the load pipeline (ql_feat_buildload.js)
        // has already confirmed Skyrunner via switch+timeout, trust that
        // confirmation and skip text-based hero detection. This prevents the
        // save pipeline from failing on non-English locales where
        // tryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader cannot
        // parse localized hero names.
        if (State.buildCategoryPayloadSkyrunnerHeaderConfirmed) {
            State.buildSaveStorageHeroConfirmed = true;
            State.buildSaveStorageHeroConfirmedSource = "loader_bypass";
            return true;
        }
        var signal = QOL.tryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root);
        var hero = QOL.normalizeHeroId(signal.hero);
        var source = signal.source ? String(signal.source) : "shopFavoritesHeaderMissing";
        if (hero === BUILD_SAVE_STORAGE_HERO_ID) {
            var directSignature = QOL.confirmStorageHeroSignatureAbilities(root, nowMs, BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS);
            if (!directSignature.confirmed) {
                State.buildSaveStorageProvisionalHits = 0;
                return false;
            }
            State.buildSaveStorageHeroConfirmed = true;
            State.buildSaveStorageHeroConfirmedSource = source + "+signature";
            State.buildSaveStorageProvisionalHits = 0;
            return true;
        }
        if (hero && hero !== BUILD_SAVE_STORAGE_HERO_ID) {
            var conflictSignature = QOL.confirmStorageHeroSignatureAbilities(root, nowMs, BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS);
            if (conflictSignature.confirmed && (QOL.hasBuildSaveStorageUiReady(root) || QOL.isBuildCategoryPayloadSourceReady(root) || QOL.isHudClassActive(root, "gShopOpen"))) {
                State.buildSaveStorageHeroConfirmed = true;
                State.buildSaveStorageHeroConfirmedSource = "signature_abilities";
                State.buildSaveStorageProvisionalHits = 0;
                return true;
            } else {
                State.buildSaveStorageProvisionalHits = 0;
                return false;
            }
        }

        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var retries = Number(State.buildSaveStorageConfirmRetries) || 0;
        var switchedAtMs = Number(State.buildSaveStorageLastSwitchMs) || 0;
        var elapsedSinceSwitchMs = switchedAtMs > 0 ? (now - switchedAtMs) : 0;
        var uiReady = QOL.hasBuildSaveStorageUiReady(root);
        var sourceReady = QOL.isBuildCategoryPayloadSourceReady(root);
        var runtimeSignal = QOL.resolveBuildSaveStorageHeroSignal(root);
        var runtimeHero = QOL.normalizeHeroId(runtimeSignal && runtimeSignal.hero ? runtimeSignal.hero : "");
        var runtimeSource = runtimeSignal && runtimeSignal.source ? String(runtimeSignal.source) : "none";
        var runtimeConflict =
            !!runtimeHero &&
            runtimeHero !== BUILD_SAVE_STORAGE_HERO_ID &&
            !QOL.isBuildSaveStorageRuntimeSourceStale(runtimeSource);
        var signatureOnly = QOL.confirmStorageHeroSignatureAbilities(root, nowMs, BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS);

        if (signatureOnly.confirmed && uiReady && (QOL.isHudClassActive(root, "gShopOpen") || sourceReady)) {
            State.buildSaveStorageHeroConfirmed = true;
            State.buildSaveStorageHeroConfirmedSource = "signature_abilities";
            State.buildSaveStorageProvisionalHits = 0;
            return true;
        }

        if (!runtimeConflict &&
            signatureOnly.confirmed &&
            uiReady &&
            (QOL.isHudClassActive(root, "gShopOpen") || sourceReady) &&
            retries >= BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_MIN_RETRIES &&
            elapsedSinceSwitchMs >= BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_MIN_ELAPSED_MS) {
            State.buildSaveStorageProvisionalHits = (Number(State.buildSaveStorageProvisionalHits) || 0) + 1;
            if (State.buildSaveStorageProvisionalHits >= BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_REQUIRED_HITS) {
                State.buildSaveStorageHeroConfirmed = true;
                State.buildSaveStorageHeroConfirmedSource = "provisional_ui_ready";
                return true;
            }
        } else {
            State.buildSaveStorageProvisionalHits = 0;
        }

        return false;
    }

    // ── EnsureBuildSaveStorageContextUi ──
    function EnsureBuildSaveStorageContextUi(root, nowMs) {
        _TLog("save:ContextUi", "nowMs=" + nowMs);
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var acted = false;
        if (QOL.ensureStorageHeroFavoritesHeaderVisible(root, now)) acted = true;

        if (QOL.ensureShopFavoritesNavActive(root, now, "buildSaveFavoritesActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
            acted = true;
        }

        var signal = QOL.tryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root);
        var source = signal && signal.source ? String(signal.source) : "shopFavoritesHeaderMissing";
        var retries = Number(State.buildSaveStorageConfirmRetries) || 0;
        if (source !== "shopFavoritesHeaderMissing" || retries < BUILD_SAVE_STORAGE_CONFIRM_REOPEN_MIN_RETRIES) {
            return acted;
        }
        var reopenAttempts = Number(State.buildSaveStorageShopReopenAttempts) || 0;
        if (reopenAttempts >= BUILD_SAVE_STORAGE_CONFIRM_MAX_REOPEN_ATTEMPTS) {
            return acted;
        }

        var reopenReadyAt = Number(State.buildSaveStorageShopReopenNextMs) || 0;
        if (now < reopenReadyAt) return acted;
        State.buildSaveStorageShopReopenNextMs = now + BUILD_SAVE_STORAGE_CONFIRM_REOPEN_COOLDOWN_MS;
        State.buildSaveStorageShopReopenAttempts = reopenAttempts + 1;

        var closed = QOL.tryCloseHeroShopForLoader(root);
        var opened = QOL.tryOpenHeroShopForHeroProbe(root, now);
        var navActivated = QOL.ensureShopFavoritesNavActive(root, now, "buildSaveFavoritesActionNextMs", 0);
        if (closed || opened || navActivated) acted = true;

        return acted;
    }

    // ── IsBuildSaveMutationStage ──
    function IsBuildSaveMutationStage(stageName) {
        var stage = stageName ? String(stageName) : "";
        return (
            stage === "start" ||
            stage === "wait_editor" ||
            stage === "wait_category_focus" ||
            stage === "write" ||
            stage === "save" ||
            stage === "verify"
        );
    }

    // ── FinishBuildSaveRequest ──
    function FinishBuildSaveRequest(root, token, state, message) {
        _TLog("save:Finish", state + " " + (message || ""));
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var didSwitchToStorageHero = !!State.buildSaveDidSwitchToStorageHero;
        var returnHero = QOL.normalizeHeroId(State.buildSaveReturnHero) || QOL.getConfiguredDefaultHeroId(State.lastConfig);
        if (State.buildSaveDidSwitchToStorageHero) {
            if (typeof QueueDelayedHeroRestore === "function") {
                QOL.queueDelayedHeroRestore(returnHero, "build_save_finish", BUILD_SAVE_RETURN_DELAY_SEC);
            } else {
                var switchedBack = QOL.selectHeroForBuildSave(returnHero);
            }
        }
        if (SAVE_SETTINGS_LOADER_ENABLED) {
            var detail = message ? String(message) : "";
            if (state === "success") {
                if (QOL.getSaveSettingsLoaderStepState("verify_save") === "active") {
                    QOL.setSaveSettingsLoaderStepState("verify_save", "done", "Payload verified.");
                }
                QOL.finalizeSaveSettingsLoaderSession("success", "Settings saved.", nowMs, didSwitchToStorageHero);
            } else {
                QOL.finalizeSaveSettingsLoaderSession("failed", detail || "Save failed.", nowMs, didSwitchToStorageHero);
            }
        }
        ResetBuildSaveRuntimeState();
        if (root) ResetBuildSaveRequestAttributes(root);
        QOL.setBuildSaveStatus(root, state, message, token);
    }

    // ── TriggerBuildEditMode ──
    function TriggerBuildEditMode(selectedBuild) {
        var activated = false;
        try {
            if (typeof CitadelHudHeroBuildsEditSelectedBuild === "function") {
                CitadelHudHeroBuildsEditSelectedBuild();
                activated = true;
            }
        } catch (e0) {
            $.Msg("[QOLLock][WARN][" + _featureId + "] CitadelHudHeroBuildsEditSelectedBuild failed: " + (e0 && e0.message ? String(e0.message) : String(e0)));
        }
        if (selectedBuild && selectedBuild.FindChildTraverse) {
            var editButton = selectedBuild.FindChildTraverse("EditHeroBuildButton");
            if (QOL.activatePanelSafe(editButton)) {
                activated = true;
            }
        }
        return activated;
    }

    // ── TriggerBuildSaveCommit ──
    function TriggerBuildSaveCommit(selectedBuild) {
        var activated = false;
        try {
            if (typeof CitadelHudHeroBuildsSaveEdits === "function") {
                CitadelHudHeroBuildsSaveEdits();
                activated = true;
            }
        } catch (e0) {
            $.Msg("[QOLLock][WARN][" + _featureId + "] CitadelHudHeroBuildsSaveEdits failed: " + (e0 && e0.message ? String(e0.message) : String(e0)));
        }
        if (selectedBuild && selectedBuild.FindChildTraverse) {
            var saveButton = selectedBuild.FindChildTraverse("SaveBuildButton");
            if (QOL.activatePanelSafe(saveButton)) {
                activated = true;
            }
        }
        return activated;
    }

    // ── SetBuildCategoryNameText ──
    function SetBuildCategoryNameText(root, payloadText) {
        if (!root || !payloadText) return false;
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var didSet = false;
        var entry = GetBuildSaveCategoryNameEntry(root);
        if (entry) {
            var before = QOL.readPanelTextMaybe(entry);
            var setViaMethod = false;
            if (typeof entry.SetText === "function") {
                try {
                    entry.SetText(payloadText);
                    setViaMethod = true;
                    didSet = true;
                } catch(e0m) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e0m && e0m.message ? e0m.message : String(e0m || ""))); }
            }
            try {
                if (!setViaMethod) {
                    entry.text = payloadText;
                    didSet = true;
                    try { $.DispatchEvent("TextEntryChanged", entry); } catch(e1) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e1 && e1.message ? e1.message : String(e1 || ""))); }
                } else {
                    try { $.DispatchEvent("TextEntryChanged", entry); } catch(e3) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e3 && e3.message ? e3.message : String(e3 || ""))); }
                }
            } catch(e5) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e5 && e5.message ? e5.message : String(e5 || ""))); }
            if (typeof entry.Submit === "function") {
                try {
                    entry.Submit();
                    didSet = true;
                } catch(e6m) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e6m && e6m.message ? e6m.message : String(e6m || ""))); }
            }
            try { $.DispatchEvent("TextEntrySubmit", entry); } catch(e7) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e7 && e7.message ? e7.message : String(e7 || ""))); }
            DefocusBuildSaveCategoryEntry(root, null);
            var after = QOL.readPanelTextMaybe(entry);
        }
        return didSet;
    }

    // ── CommitCategoryNameEdit ──
    function CommitCategoryNameEdit(root, selectedBuild, payloadText) {
        var entry = GetBuildSaveCategoryNameEntry(root);
        if (!entry) return false;
        var didCommit = false;
        var currentText = QOL.readPanelTextMaybe(entry);
        if (currentText !== payloadText) {
            try {
                entry.text = payloadText;
            } catch(e1) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }
        try { $.DispatchEvent("TextEntryChanged", entry); didCommit = true; } catch(e2) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try { $.DispatchEvent("TextEntrySubmit", entry); didCommit = true; } catch(e3) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_buildsave", (e3 && e3.message ? e3.message : String(e3 || ""))); }

        // Simulate clicking away from the text field before pressing Save.
        var header = selectedBuild && selectedBuild.FindChildTraverse ? selectedBuild.FindChildTraverse("BuildCategoryHeader") : null;
        if (header) {
            if (QOL.activatePanelSafe(header)) {
                didCommit = true;
            }
        }
        if (DefocusBuildSaveCategoryEntry(root, selectedBuild)) didCommit = true;
        return didCommit;
    }

    // ── CurrentBuildHasPayload ──
    function CurrentBuildHasPayload(root, payloadText) {
        var expectedToken = QOL.extractBuildCategoryPayloadToken(payloadText);
        if (!expectedToken || expectedToken.length === 0) return false;

        var selectedBuild = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
        var seen = [];
        function checkToken(token) {
            if (!token || token.length === 0) return false;
            seen.push(token);
            return token === expectedToken;
        }

        var directEntry = GetBuildSaveCategoryNameEntry(root);
        if (checkToken(QOL.extractBuildCategoryPayloadToken(QOL.readPanelTextMaybe(directEntry)))) return true;

        if (selectedBuild && selectedBuild.FindChildTraverse) {
            var directHeader = selectedBuild.FindChildTraverse("BuildCategoryName");
            if (checkToken(QOL.extractBuildCategoryPayloadToken(QOL.readPanelTextMaybe(directHeader)))) return true;
            var directEntryInBuild = selectedBuild.FindChildTraverse("CategoryNameTextEntry");
            if (checkToken(QOL.extractBuildCategoryPayloadToken(QOL.readPanelTextMaybe(directEntryInBuild)))) return true;
        }

        if (!selectedBuild || !selectedBuild.FindChildrenWithClassTraverse) {
            return false;
        }

        var classNames = ["CategoryName", "CategoryNameTextEntry", "BuildCategoryName"];
        for (var c = 0; c < classNames.length; c++) {
            var labels = selectedBuild.FindChildrenWithClassTraverse(classNames[c]) || [];
            for (var i = 0; i < labels.length; i++) {
                var token = QOL.extractBuildCategoryPayloadToken(QOL.readPanelTextMaybe(labels[i]));
                if (checkToken(token)) return true;
            }
        }
        return false;
    }

    // ── CurrentBuildHasAnyPayload ──
    // Unlike CurrentBuildHasPayload (which requires an exact token match), this
    // checks whether the currently selected build contains ANY valid QOLLOCK
    // payload. Used as a guard in bootstrap_via_save_enqueue to avoid
    // overwriting an existing user config with a fresh default payload.
    function CurrentBuildHasAnyPayload(root) {
        var selectedBuild = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;

        function hasToken(text) {
            if (!text || String(text).length === 0) return false;
            return !!QOL.extractBuildCategoryPayloadToken(String(text));
        }

        var directEntry = GetBuildSaveCategoryNameEntry(root);
        if (hasToken(QOL.readPanelTextMaybe(directEntry))) return true;

        if (selectedBuild && selectedBuild.FindChildTraverse) {
            var directHeader = selectedBuild.FindChildTraverse("BuildCategoryName");
            if (hasToken(QOL.readPanelTextMaybe(directHeader))) return true;
            var directEntryInBuild = selectedBuild.FindChildTraverse("CategoryNameTextEntry");
            if (hasToken(QOL.readPanelTextMaybe(directEntryInBuild))) return true;
        }

        if (!selectedBuild || !selectedBuild.FindChildrenWithClassTraverse) {
            return false;
        }

        var classNames = ["CategoryName", "CategoryNameTextEntry", "BuildCategoryName"];
        for (var c = 0; c < classNames.length; c++) {
            var labels = selectedBuild.FindChildrenWithClassTraverse(classNames[c]) || [];
            for (var i = 0; i < labels.length; i++) {
                if (hasToken(QOL.readPanelTextMaybe(labels[i]))) return true;
            }
        }
        return false;
    }

    // ── AdvanceBuildSaveRequestStage ──
    // State machine for the save pipeline. Stages flow forward with regression
    // paths when external UI state (signature abilities, edit mode, category
    // focus) is lost mid-operation.
    //
    //   switch_to_storage → confirm_storage_context → lock_target_build → start
    //     → wait_editor → wait_category_focus → write → save → verify → (done)
    //
    // Regressions:
    //   write → confirm_storage_context  (Skyrunner signature abilities lost)
    //   save  → wait_category_focus      (focused category entry lost)
    //   verify → wait_category_focus     (entry empty, retry before giving up)
    //
    // Timeout: 12s overall (BUILD_SAVE_TIMEOUT_MS). Per-stage retry budgets
    // reset on stage transition (buildSaveRetriesStage tracking).
    // ── Stage helpers extracted from AdvanceBuildSaveRequestStage ──
    // Each stage handler checks State.buildSaveStage and returns true if it
    // handled the tick (caller should return), false/nothing if not its stage.

    function resetBuildSaveRetryBudget(requestToken) {
        if (State.buildSaveLastTraceStage !== State.buildSaveStage) {
            State.buildSaveLastTraceStage = State.buildSaveStage;
            _TLog("save:AdvanceStage", (State.buildSaveStage || "-") + " token=" + String(requestToken || "").slice(0, 8));
        }
        // Per-stage retry budget: reset counter when entering a new stage so
        // that an early stage (e.g. shop-wait) consuming many retries doesn't
        // starve later stages (e.g. write, verify) of their retry budget.
        var currentStage = State.buildSaveStage || "";
        if (State.buildSaveRetriesStage !== currentStage) {
            State.buildSaveRetriesStage = currentStage;
            State.buildSaveRetries = 0;
        }
    }

    function tryAdvanceStorageSwitch(root, nowMs, requestToken) {
        if (QOL.tryAdvanceStorageSwitchStage(root, nowMs, requestToken, {
            stageKey: "buildSaveStage",
            nextActionKey: "buildSaveNextActionMs",
            didSwitchFlagKey: "buildSaveDidSwitchToStorageHero",
            onSwitchSuccess: function(nowValue) {
                State.buildSaveStorageLastSwitchMs = nowValue;
                State.buildSaveStorageProvisionalHits = 0;
            },
            setStatus: function(activeRoot, token) {
                QOL.setBuildSaveStatus(activeRoot, "pending", "switching_to_skyrunner", token);
            }
        })) {
            return true;
        }
        return false;
    }

    function tryAdvanceStorageSwitchSettle(root, nowMs, requestToken) {
        if (QOL.tryAdvanceStorageSwitchSettleStage(nowMs, {
            stageKey: "buildSaveStage",
            nextActionKey: "buildSaveNextActionMs",
            nextStage: "confirm_storage_context",
            debugMessage: "post hero switch delay done; entering confirm_storage_context",
            onEnterNextStage: function(nowValue) {
                State.buildSaveStorageConfirmStartedMs = nowValue;
                State.buildSaveStorageConfirmRetries = 0;
                State.buildSaveStorageSwitchRetries = 0;
                State.buildSaveStorageShopReopenAttempts = 0;
                State.buildSaveStorageShopReopenNextMs = 0;
                if (!(Number(State.buildSaveStorageLastSwitchMs) > 0)) {
                    State.buildSaveStorageLastSwitchMs = nowValue;
                }
                QOL.setBuildSaveStatus(root, "pending", "confirming_skyrunner", requestToken);
            }
        })) {
            return true;
        }
        return false;
    }

    function handleConfirmStorageContext(root, nowMs, requestToken) {
        if (State.buildSaveStage !== "confirm_storage_context") return false;
        if (!ConfirmBuildSaveStorageHero(root, nowMs)) {
            EnsureBuildSaveStorageContextUi(root, nowMs);
            State.buildSaveStorageConfirmRetries = (Number(State.buildSaveStorageConfirmRetries) || 0) + 1;
            var confirmStartedMs = Number(State.buildSaveStorageConfirmStartedMs) || nowMs;
            if (!(confirmStartedMs > 0)) confirmStartedMs = nowMs;
            State.buildSaveStorageConfirmStartedMs = confirmStartedMs;
            if ((nowMs - confirmStartedMs) > BUILD_SAVE_STORAGE_CONFIRM_TIMEOUT_MS) {
                FinishBuildSaveRequest(root, requestToken, "failed", "storage_not_confirmed");
                return true;
            }
            var confirmMessage = "confirming_skyrunner";
            var signatureDetail = State.storageHeroSignatureLastDetail ? String(State.storageHeroSignatureLastDetail) : "";
            if (signatureDetail.indexOf("signature") !== -1) confirmMessage = "validating_skyrunner_signature";
            QOL.setBuildSaveStatus(root, "pending", confirmMessage, requestToken);
            State.buildSaveNextActionMs = nowMs + BUILD_SAVE_STORAGE_CONFIRM_POLL_MS;
            return true;
        }
        var confirmSource = State.buildSaveStorageHeroConfirmedSource || "unknown";
        _TLog("save:ConfirmDone", "source=" + confirmSource + " retries=" + (Number(State.buildSaveStorageConfirmRetries) || 0));
        State.buildSaveStage = "lock_target_build";
        QOL.setBuildSaveStatus(root, "pending", "locking_target_build", requestToken);
        State.buildSaveNextActionMs = nowMs;
        return true;
    }

    function handleShopNotReady(root, nowMs, requestToken, selectedBuild) {
        if (selectedBuild) return false;
        State.buildSaveRetries += 1;
        State.buildSaveNextActionMs = nowMs + BUILD_SAVE_ACTION_DELAY_MS;
        QOL.setBuildSaveStatus(root, "pending", "waiting_for_shop", requestToken);
        if (State.buildSaveRetries > BUILD_SAVE_MAX_RETRIES) {
            _TLog("save:Failed", "reason=shop_not_ready retries=" + State.buildSaveRetries);
            FinishBuildSaveRequest(root, requestToken, "failed", "shop_not_ready");
        }
        return true;
    }

    function handleLockTargetBuild(root, nowMs, requestToken, selectedBuild) {
        if (State.buildSaveStage === "lock_target_build") {
            if (!EnsureBuildSaveTargetSelectionLocked(root, nowMs, requestToken, selectedBuild, true)) {
                return true;
            }
            _TLog("save:AdvanceStage", "lock_target_build done → start token=" + String(requestToken || "").slice(0, 8));
            _TLog("save:TargetLocked", "title=\"" + (State.buildSaveTargetBuildTitle || "") + "\" sig=" + (State.buildSaveTargetBuildSig || "-"));
            QOL.setBuildSaveStatus(root, "pending", "target_locked", requestToken);
            State.buildSaveStage = "start";
            State.buildSaveNextActionMs = nowMs;
            return true;
        }
        if (IsBuildSaveMutationStage(State.buildSaveStage)) {
            if (!EnsureBuildSaveTargetSelectionLocked(root, nowMs, requestToken, selectedBuild, false)) {
                return true;
            }
            if (State.buildSaveStage === "start" || State.buildSaveStage === "wait_editor" || State.buildSaveStage === "wait_category_focus") {
                DefocusBuildSaveCategoryEntry(root, selectedBuild);
            }
        }
        return false;
    }

    function handleStartWaitEditor(root, nowMs, requestToken, selectedBuild) {
        if (State.buildSaveStage !== "start" && State.buildSaveStage !== "wait_editor") return false;
        var editModeActive = IsBuildSaveEditModeActive(root);
        if (!editModeActive) {
            var editTriggered = TriggerBuildEditMode(selectedBuild);
            State.buildSaveStage = "wait_editor";
            State.buildSaveRetries += 1;
            State.buildSaveNextActionMs = nowMs + BUILD_SAVE_ACTION_DELAY_MS;
            QOL.setBuildSaveStatus(root, "pending", "opening_edit_mode", requestToken);
            _TLog("save:EditMode", "active=0 triggered=" + (editTriggered ? "1" : "0") + " retries=" + State.buildSaveRetries);
            var categoryNameEntry = GetBuildSaveCategoryNameEntry(root);
            if (categoryNameEntry && editTriggered && State.buildSaveRetries >= 2) {
                _TLog("save:EditMode", "skipping to wait_category_focus — category entry visible at retries=" + State.buildSaveRetries);
                State.buildSaveStage = "wait_category_focus";
                State.buildSaveNextActionMs = nowMs;
                return true;
            }
            if (State.buildSaveRetries > BUILD_SAVE_MAX_RETRIES) {
                _TLog("save:Failed", "reason=edit_mode_unavailable retries=" + State.buildSaveRetries);
                FinishBuildSaveRequest(root, requestToken, "failed", "edit_mode_unavailable");
            }
            return true;
        }
        State.buildSaveStage = "wait_category_focus";
        _TLog("save:AdvanceStage", "edit_mode ok → wait_category_focus");
        return true;
    }

    function handleWaitCategoryFocus(root, nowMs, requestToken, selectedBuild) {
        if (State.buildSaveStage !== "wait_category_focus") return false;
        if (!FocusFirstBuildCategory(selectedBuild)) {
            if (HasWritableBuildCategoryEntry(root) && IsBuildSaveEditModeActive(root)) {
                State.buildSaveStage = "write";
                State.buildSaveNextActionMs = nowMs;
                QOL.setBuildSaveStatus(root, "pending", "writing_category_name", requestToken);
                return true;
            }
            var headerCount = CountBuildCategoryHeaders(selectedBuild);
            if (headerCount <= 0) {
                var initReady = QOL.ensureStorageBuildInitialized(root, nowMs);
                var initRetries = Number(State.buildCategoryPayloadHeroProbeInitRetries) || 0;
                State.buildSaveNextActionMs = nowMs + BUILD_SAVE_ACTION_DELAY_MS;
                if (!initReady) {
                    QOL.setBuildSaveStatus(root, "pending", "initializing_storage_build", requestToken);
                    if (initRetries >= BUILD_CATEGORY_PAYLOAD_INIT_MAX_RETRIES) {
                        _TLog("save:Failed", "reason=category_init_unavailable initRetries=" + initRetries);
                        FinishBuildSaveRequest(root, requestToken, "failed", "category_init_unavailable");
                    }
                    return true;
                }
                if (HasWritableBuildCategoryEntry(root)) {
                    State.buildSaveStage = "write";
                    State.buildSaveNextActionMs = nowMs;
                    QOL.setBuildSaveStatus(root, "pending", "writing_category_name", requestToken);
                    return true;
                }
                State.buildSaveRetries += 1;
                QOL.setBuildSaveStatus(root, "pending", "focusing_category", requestToken);
                if (State.buildSaveRetries > BUILD_SAVE_MAX_RETRIES) {
                    FinishBuildSaveRequest(root, requestToken, "failed", "category_focus_unavailable");
                }
                return true;
            } else {
                State.buildSaveRetries += 1;
                State.buildSaveNextActionMs = nowMs + BUILD_SAVE_ACTION_DELAY_MS;
                QOL.setBuildSaveStatus(root, "pending", "focusing_category", requestToken);
            }
            if (State.buildSaveRetries > BUILD_SAVE_MAX_RETRIES) {
                FinishBuildSaveRequest(root, requestToken, "failed", "category_focus_unavailable");
            }
            return true;
        }
        State.buildSaveStage = "write";
        _TLog("save:CategoryFocus", "ok=1");
        return true;
    }

    function handleWrite(root, nowMs, requestToken, selectedBuild, payloadText) {
        if (State.buildSaveStage !== "write") return false;
        var writeSignature = QOL.confirmStorageHeroSignatureAbilities(root, nowMs, BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS);
        if (!writeSignature.confirmed) {
            _TLog("save:WriteCheck", "signature not confirmed — falling back to confirm_storage_context");
            State.buildSaveStorageHeroConfirmed = false;
            State.buildSaveStorageHeroConfirmedSource = "";
            State.buildSaveStorageConfirmStartedMs = nowMs;
            State.buildSaveStage = "confirm_storage_context";
            State.buildSaveNextActionMs = nowMs + BUILD_SAVE_STORAGE_CONFIRM_POLL_MS;
            QOL.setBuildSaveStatus(root, "pending", "validating_skyrunner_signature", requestToken);
            return true;
        }
        if (!SetBuildCategoryNameText(root, payloadText)) {
            State.buildSaveRetries += 1;
            State.buildSaveNextActionMs = nowMs + BUILD_SAVE_ACTION_DELAY_MS;
            QOL.setBuildSaveStatus(root, "pending", "writing_category_name", requestToken);
            _TLog("save:WriteAttempt", "ok=0 retries=" + State.buildSaveRetries);
            if (State.buildSaveRetries > BUILD_SAVE_MAX_RETRIES) {
                _TLog("save:Failed", "reason=write_failed retries=" + State.buildSaveRetries);
                FinishBuildSaveRequest(root, requestToken, "failed", "write_failed");
            }
            return true;
        }
        _TLog("save:AdvanceStage", "write done → save");
        _TLog("save:WriteDone", "textLen=" + String(payloadText ? payloadText.length : 0));
        State.buildSaveStage = "save";
        State.buildSaveNextActionMs = nowMs + BUILD_SAVE_AFTER_WRITE_DELAY_MS;
        return true;
    }

    function handleSave(root, nowMs, requestToken, selectedBuild, payloadText) {
        if (State.buildSaveStage !== "save") return false;
        if (!HasFocusedBuildCategory(selectedBuild)) {
            if (!HasWritableBuildCategoryEntry(root)) {
                State.buildSaveStage = "wait_category_focus";
                State.buildSaveNextActionMs = nowMs + BUILD_SAVE_ACTION_DELAY_MS;
                return true;
            }
        }
        var committed = CommitCategoryNameEdit(root, selectedBuild, payloadText);
        var saveTriggered = TriggerBuildSaveCommit(selectedBuild);
        State.buildSaveMutationClosed = true;
        _TLog("save:AdvanceStage", "save triggered → verify ok=" + (saveTriggered ? "1" : "0"));
        _TLog("save:SaveCommit", "committed=" + (committed ? "1" : "0") + " triggered=" + (saveTriggered ? "1" : "0"));
        State.buildSaveStage = "verify";
        State.buildSaveRetries += 1;
        State.buildSaveNextActionMs = nowMs + BUILD_SAVE_VERIFY_DELAY_MS;
        QOL.setBuildSaveStatus(root, "pending", "saving", requestToken);
        return true;
    }

    function handleVerify(root, nowMs, requestToken, selectedBuild, payloadText) {
        if (State.buildSaveStage !== "verify") return false;
        if (CurrentBuildHasPayload(root, payloadText)) {
            _TLog("save:VerifyOk", "payload confirmed in build");
            FinishBuildSaveRequest(root, requestToken, "success", "saved");
            return true;
        }

        var verifyEntry = GetBuildSaveCategoryNameEntry(root);
        var verifyEntryText = QOL.readPanelTextMaybe(verifyEntry);
        var verifyEntryToken = QOL.extractBuildCategoryPayloadToken(verifyEntryText);
        if (
            (!verifyEntryText || verifyEntryText.length === 0 || !verifyEntryToken) &&
            State.buildSaveRetries < BUILD_SAVE_MAX_RETRIES &&
            !State.buildSaveMutationClosed
        ) {
            TriggerBuildEditMode(selectedBuild);
            State.buildSaveStage = "wait_category_focus";
            State.buildSaveNextActionMs = nowMs + BUILD_SAVE_ACTION_DELAY_MS;
            QOL.setBuildSaveStatus(root, "pending", "retrying_write", requestToken);
            return true;
        }

        if (State.buildSaveRetries > BUILD_SAVE_MAX_RETRIES) {
            _TLog("save:Failed", "reason=verify_failed retries=" + State.buildSaveRetries);
            FinishBuildSaveRequest(root, requestToken, "failed", "verify_failed");
            return true;
        }
        var saveTriggeredAgain = TriggerBuildSaveCommit(selectedBuild);
        State.buildSaveRetries += 1;
        State.buildSaveNextActionMs = nowMs + BUILD_SAVE_VERIFY_DELAY_MS;
        QOL.setBuildSaveStatus(root, "pending", "verifying", requestToken);
        return true;
    }

    function AdvanceBuildSaveRequestStage(root, nowMs, requestToken, payloadText) {
        resetBuildSaveRetryBudget(requestToken);
        if (tryAdvanceStorageSwitch(root, nowMs, requestToken)) return;
        if (tryAdvanceStorageSwitchSettle(root, nowMs, requestToken)) return;

        if (handleConfirmStorageContext(root, nowMs, requestToken)) return;

        var selectedBuild = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
        if (handleShopNotReady(root, nowMs, requestToken, selectedBuild)) return;
        if (handleLockTargetBuild(root, nowMs, requestToken, selectedBuild)) return;

        if (handleStartWaitEditor(root, nowMs, requestToken, selectedBuild)) return;
        if (handleWaitCategoryFocus(root, nowMs, requestToken, selectedBuild)) return;
        if (handleWrite(root, nowMs, requestToken, selectedBuild, payloadText)) return;
        if (handleSave(root, nowMs, requestToken, selectedBuild, payloadText)) return;
        if (handleVerify(root, nowMs, requestToken, selectedBuild, payloadText)) return;

        $.Msg("[QOLLock][WARN][save] unrecognized stage \"" + (State.buildSaveStage || "") + "\" — falling back to switch_to_storage");
        State.buildSaveStage = "switch_to_storage";
        State.buildSaveNextActionMs = nowMs + BUILD_SAVE_ACTION_DELAY_MS;
    }

    // ── TryHandleBuildSaveUnavailableRoot ──
    function TryHandleBuildSaveUnavailableRoot(root, nowMs) {
        if (root && root.GetAttributeString) return false;
        if (SAVE_SETTINGS_LOADER_ENABLED && State.saveSettingsLoaderSessionActive) {
            QOL.finalizeSaveSettingsLoaderSession("failed", "Save context unavailable.", nowMs, false);
        }
        ResetBuildSaveRuntimeState();
        return true;
    }

    // ── TryFinalizeBuildSaveWhenNotPending ──
    function TryFinalizeBuildSaveWhenNotPending(root, nowMs, configuredReturnHero, requestState, requestMessage) {
        if (requestState === "pending") return false;
        _TLog("save:FinalizeNotPending", "state=" + (requestState || "empty") + " msg=" + String(requestMessage || "-").slice(0, 24) + " switchedHero=" + (State.buildSaveDidSwitchToStorageHero ? "1" : "0") + " activeSession=" + (State.saveSettingsLoaderSessionActive ? "1" : "0"));
        if (SAVE_SETTINGS_LOADER_ENABLED && State.saveSettingsLoaderSessionActive) {
            var endCode = requestState === "success" ? "success" : "failed";
            var endDetail = requestMessage ? String(requestMessage) : (requestState === "success" ? "Settings save complete." : "Save ended.");
            var switchedForFinalize = !!State.buildSaveDidSwitchToStorageHero;
            QOL.finalizeSaveSettingsLoaderSession(endCode, endDetail, nowMs, switchedForFinalize);
        }
        if (State.buildSaveDidSwitchToStorageHero) {
            var pendingReturnHero = QOL.normalizeHeroId(State.buildSaveReturnHero) || configuredReturnHero;
            if (typeof QueueDelayedHeroRestore === "function") {
                QOL.queueDelayedHeroRestore(pendingReturnHero, "build_save_state_exit", BUILD_SAVE_RETURN_DELAY_SEC);
            } else {
                var switchedBackEarly = QOL.selectHeroForBuildSave(pendingReturnHero);
            }
        }
        ResetBuildSaveRuntimeState();
        return true;
    }

    // ── EnsureBuildSaveRequestToken ──
    function EnsureBuildSaveRequestToken(root, nowMs) {
        var requestToken = root.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "");
        if (!requestToken || requestToken.length === 0) {
            var prevState = String(root.GetAttributeString(BUILD_SAVE_STATE_ATTR, "") || "-");
            var prevReq = String(root.GetAttributeString(BUILD_SAVE_REQUEST_ATTR, "") || "-").slice(0, 30);
            requestToken = String(nowMs);
            root.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, requestToken);
            _TLog("save:EnsureToken", "new token=" + String(requestToken).slice(0, 8) + " prevState=" + prevState + " prevReq=" + prevReq);
        }
        if (SAVE_SETTINGS_LOADER_ENABLED) {
            QOL.beginSaveSettingsLoaderSession(requestToken, nowMs);
        }
        return requestToken;
    }

    // ── ResolveBuildSavePayloadText ──
    function ResolveBuildSavePayloadText(root, requestToken) {
        var payloadText = root.GetAttributeString(BUILD_SAVE_REQUEST_ATTR, "");
        payloadText = payloadText ? String(payloadText).replace(/\s+/g, "") : "";
        if (!payloadText || payloadText.length === 0) {
            FinishBuildSaveRequest(root, requestToken, "failed", "missing_payload");
            return "";
        }
        if (!BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX.test(payloadText)) {
            FinishBuildSaveRequest(root, requestToken, "failed", "invalid_payload");
            return "";
        }
        return payloadText;
    }

    // ── EnsureBuildSaveRequestRuntimeInitialized ──
    function EnsureBuildSaveRequestRuntimeInitialized(root, nowMs, requestToken, configuredReturnHero, payloadText) {
        if (State.buildSaveActiveToken === requestToken) return;
        var reuseLoaderSkyrunnerSave = QOL.canReuseLoaderConfirmedSkyrunnerContext(root, nowMs);
        State.buildSaveActiveToken = requestToken;
        State.buildSaveStage = reuseLoaderSkyrunnerSave ? "lock_target_build" : "switch_to_storage";
        State.buildSaveStartedMs = nowMs;
        State.buildSaveNextActionMs = nowMs;
        State.buildSaveRetries = 0;
        State.buildSaveDidSwitchToStorageHero = false;
        State.buildSaveReturnHero = configuredReturnHero;
        State.buildSaveStorageHeroConfirmed = !!reuseLoaderSkyrunnerSave;
        State.buildSaveStorageHeroConfirmedSource = reuseLoaderSkyrunnerSave ? "startup_loader_reuse" : "";
        State.buildSaveStorageConfirmRetries = 0;
        State.buildSaveStorageSwitchRetries = 0;
        State.buildSaveStorageConfirmStartedMs = 0;
        State.buildSaveStorageLastSwitchMs = 0;
        State.buildSaveStorageShopReopenNextMs = 0;
        State.buildSaveStorageShopReopenAttempts = 0;
        State.buildSaveFavoritesActionNextMs = 0;
        State.buildSaveStorageProvisionalHits = 0;
        if (!reuseLoaderSkyrunnerSave) {
            State.storageHeroSignatureConfirmSig = "";
            State.storageHeroSignatureConfirmHits = 0;
            State.storageHeroSignatureLastDetail = "";
        }
        State.buildSaveMutationClosed = false;
        State.buildSaveTargetBuildPanel = null;
        State.buildSaveTargetBuildSig = "";
        State.buildSaveTargetBuildTitle = "";
        State.buildSaveTargetStableHits = 0;
        State.buildSaveTargetDriftRetries = 0;
        State.buildSaveTargetQuietUntilMs = 0;
        State.buildSaveCaptureStartedMs = nowMs;
        QOL.resetBuildCategoryPayloadProbeInitState();
        QOL.setBuildSaveStatus(root, "pending", reuseLoaderSkyrunnerSave ? "reuse_skyrunner_context" : "starting", requestToken);
    }

    // ── TickBuildSaveRequestRuntime ──
    function TickBuildSaveRequestRuntime(root, nowMs, requestToken, payloadText) {
        if (SAVE_SETTINGS_LOADER_ENABLED) {
            QOL.updateSaveSettingsLoaderFromBuildSaveState(State.buildSaveStage, root.GetAttributeString(BUILD_SAVE_MSG_ATTR, ""));
        }
        if (nowMs < (State.buildSaveNextActionMs || 0)) return;
        if (nowMs - (State.buildSaveStartedMs || nowMs) > BUILD_SAVE_TIMEOUT_MS) {
            FinishBuildSaveRequest(root, requestToken, "failed", "timeout");
            return;
        }
        AdvanceBuildSaveRequestStage(root, nowMs, requestToken, payloadText);
    }

    // ── Bridge: QOL exports ──
    QOL.resetBuildSaveRuntimeState = ResetBuildSaveRuntimeState;
    QOL.resetBuildSaveRequestAttributes = ResetBuildSaveRequestAttributes;
    QOL.advanceBuildSaveRequestStage = AdvanceBuildSaveRequestStage;
    QOL.tickBuildSaveRequestRuntime = TickBuildSaveRequestRuntime;
    QOL.finishBuildSaveRequest = FinishBuildSaveRequest;
    QOL.tryHandleBuildSaveUnavailableRoot = TryHandleBuildSaveUnavailableRoot;
    QOL.tryFinalizeBuildSaveWhenNotPending = TryFinalizeBuildSaveWhenNotPending;
    QOL.ensureBuildSaveRequestToken = EnsureBuildSaveRequestToken;
    QOL.resolveBuildSavePayloadText = ResolveBuildSavePayloadText;
    QOL.ensureBuildSaveRequestRuntimeInitialized = EnsureBuildSaveRequestRuntimeInitialized;
    QOL.countBuildCategoryHeaders = CountBuildCategoryHeaders;
    QOL.currentBuildHasPayload = CurrentBuildHasPayload;
    QOL.currentBuildHasAnyPayload = CurrentBuildHasAnyPayload;
    QOL.getBuildSaveCategoryNameEntry = GetBuildSaveCategoryNameEntry;
    QOL.isBuildSaveMutationStage = IsBuildSaveMutationStage;
    QOL.isBuildSaveEditModeActive = IsBuildSaveEditModeActive;
    QOL.hasFocusedBuildCategory = HasFocusedBuildCategory;
    QOL.hasWritableBuildCategoryEntry = HasWritableBuildCategoryEntry;
    QOL.ensureBuildSaveTargetSelectionLocked = EnsureBuildSaveTargetSelectionLocked;
    QOL.confirmBuildSaveStorageHero = ConfirmBuildSaveStorageHero;
    QOL.ensureBuildSaveStorageContextUi = EnsureBuildSaveStorageContextUi;
    QOL.triggerBuildEditMode = TriggerBuildEditMode;
    QOL.triggerBuildSaveCommit = TriggerBuildSaveCommit;
    QOL.focusFirstBuildCategory = FocusFirstBuildCategory;
    QOL.defocusBuildSaveCategoryEntry = DefocusBuildSaveCategoryEntry;
    QOL.setBuildCategoryNameText = SetBuildCategoryNameText;
    QOL.commitCategoryNameEdit = CommitCategoryNameEdit;

    // ── Registration ──
    QOL.register("buildSave", {
        configKeys: [],
        bucket: 0, phase: -1,
        gate: function(cfg) { return true; },
        update: function(root, cfg, nowMs) {
            // Save state machine is driven by ProcessBuildSaveRequest in ql_core.js
        },
        stateKeys: [
            "buildSaveActiveToken", "buildSaveStage", "buildSaveStartedMs",
            "buildSaveNextActionMs", "buildSaveRetries", "buildSaveRetriesStage", "buildSaveDidSwitchToStorageHero",
            "buildSaveCaptureStartedMs", "buildSaveReturnHero",
            "buildSaveStorageHeroConfirmed", "buildSaveStorageHeroConfirmedSource",
            "buildSaveStorageConfirmRetries", "buildSaveStorageSwitchRetries",
            "buildSaveStorageConfirmStartedMs", "buildSaveStorageLastSwitchMs",
            "buildSaveStorageShopReopenNextMs", "buildSaveStorageShopReopenAttempts",
            "buildSaveFavoritesActionNextMs", "buildSaveStorageProvisionalHits",
            "buildSaveMutationClosed", "buildSaveTargetBuildPanel",
            "buildSaveTargetBuildSig", "buildSaveTargetBuildTitle",
            "buildSaveTargetStableHits", "buildSaveTargetDriftRetries",
            "buildSaveTargetQuietUntilMs", "buildSaveLastTraceStage"
        ]
    });

    // ── Self-test ──
    try {
        if (typeof AdvanceBuildSaveRequestStage !== "function") throw new Error("AdvanceBuildSaveRequestStage missing");
        if (typeof TickBuildSaveRequestRuntime !== "function") throw new Error("TickBuildSaveRequestRuntime missing");
        if (typeof FinishBuildSaveRequest !== "function") throw new Error("FinishBuildSaveRequest missing");
        if (typeof ResetBuildSaveRuntimeState !== "function") throw new Error("ResetBuildSaveRuntimeState missing");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + e.message);
    }
})();
