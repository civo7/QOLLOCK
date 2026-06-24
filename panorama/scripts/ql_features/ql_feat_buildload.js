// ql_feat_buildload.js — Build load/startup config probe
// Extracted from ql_core.js, Step 4
(function() {
    'use strict';
    var _featureId = "ql_feat_buildload";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "normalizeHeroId", "getConfiguredDefaultHeroId", "selectHeroForBuildSave",
        "queueDelayedHeroRestore", "setBuildSaveStatus", "dispatchCitadelConCommand",
        "resetBuildSaveRequestAttributes",
        "readPanelTextMaybe", "extractBuildCategoryPayloadToken",
        "confirmStorageHeroSignatureAbilities", "ensureStorageBuildInitialized",
        "activatePanelSafe", "resolveCachedPanel", "resolveBuildSaveStorageHeroSignal",
        "tryReadBuildSaveStorageHeroFromSettings",
        "tryReadSelectedHeroIncludingStorageFromCommandPanels",
        "extractHeroTokenFromText", "isConnectedToHideout",
        "isStartupLoaderInActiveMatchContext",
        "canReuseLoaderConfirmedAirheartContext",
        "countBuildCategoryHeaders", "getBuildSaveCategoryNameEntry",
        "beginSettingsLoaderSession", "buildDefaultConfig", "buildDefaultPayloadToken", "buildPayloadFromBase64Url", "collectStorageBuildEntryPanels", "deserializeBuildPayloadCompact", "ensureStorageHeroFavoritesHeaderVisible", "enterStartupCorruptRepairPrompt", "extractLastHeroTokenFromText", "finalizeSettingsLoaderSession", "findBrowseBuildsButton", "getLoaderBaseDefaultHeroId", "getSaveSettingsLoaderDetailForMessage", "hasBuildSaveStorageUiReady", "isBrowseBuildsPopupOpen", "isBuildSaveStorageRuntimeSourceStale", "isHudClassActive", "isStartupCorruptRepairPending", "isStorageBuildListEmpty", "mergeConfig", "normalizeAllyColorWarningConfig", "normalizeAmmoScaleConfig", "normalizeColorWarningConfig", "normalizeCompassSpeedSchemaMigration", "normalizeEnemyColorWarningConfig", "normalizeHealthbarTypeConfig", "normalizeLanguageSchemaMigration", "normalizeNeutralCampTierConfig", "normalizeTopbarAllyHpWarningConfig", "normalizeTopbarEnemyHpWarningConfig", "normalizeVoiceTypeConfig", "queueBuildSaveRequestFromLoader", "readPanelTextDeepMaybe", "resetBuildClearRequestAttributes", "resetBuildClearRuntimeState", "resetBuildLoaderForTempDisable", "resetSettingsLoaderSession", "resetStartupDefaultPayloadBootstrapState", "setSettingsLoaderDebugOverlayLine", "setSettingsLoaderStepState", "setStartupCorruptRepairPending", "settingsLoaderBuildProbeSnapshot", "settingsLoaderDebugLog", "settingsLoaderDebugLogThrottled", "settingsLoaderTraceLogThrottled", "stepCorruptRepairClearStorageBuilds", "suppressStartupLoaderForSession", "traceSettingsLoaderProbeHeartbeat", "tryCloseBrowseBuildsPopupForLoader", "tryDismissBuildDeletePopup", "tryOpenHeroShopForHeroProbe", "tryReadAccountIdFromKnownPartyPath", "trySelectFirstStorageBuildEntry", "trySelectNextStorageBuildEntry", "writeStorageConfigRawToUi"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var NormalizeHeroId = _deps.normalizeHeroId;
    var GetConfiguredDefaultHeroId = _deps.getConfiguredDefaultHeroId;
    var SelectHeroForBuildSave = _deps.selectHeroForBuildSave;
    var QueueDelayedHeroRestore = _deps.queueDelayedHeroRestore;
    var SetBuildSaveStatus = _deps.setBuildSaveStatus;
    var DispatchCitadelConCommand = _deps.dispatchCitadelConCommand;
    var ResetBuildSaveRequestAttributes = _deps.resetBuildSaveRequestAttributes;
    var IsPanelValid = Utils.IsPanelValid;
    var ReadPanelTextMaybe = _deps.readPanelTextMaybe;
    var ExtractBuildCategoryPayloadToken = _deps.extractBuildCategoryPayloadToken;
    var ConfirmStorageHeroSignatureAbilities = _deps.confirmStorageHeroSignatureAbilities;
    var EnsureStorageBuildInitialized = _deps.ensureStorageBuildInitialized;
    var ActivatePanelSafe = _deps.activatePanelSafe;
    var ResolveCachedPanel = _deps.resolveCachedPanel;
    var ResolveBuildSaveStorageHeroSignal = _deps.resolveBuildSaveStorageHeroSignal;
    var TryReadBuildSaveStorageHeroFromSettings = _deps.tryReadBuildSaveStorageHeroFromSettings;
    var TryReadSelectedHeroIncludingStorageFromCommandPanels = _deps.tryReadSelectedHeroIncludingStorageFromCommandPanels;
    var ExtractHeroTokenFromText = _deps.extractHeroTokenFromText;
    var IsStartupLoaderInActiveMatchContext = _deps.isStartupLoaderInActiveMatchContext;
    var CanReuseLoaderConfirmedAirheartContext = _deps.canReuseLoaderConfirmedAirheartContext;
        var CountBuildCategoryHeaders = _deps.countBuildCategoryHeaders;
    var GetBuildSaveCategoryNameEntry = _deps.getBuildSaveCategoryNameEntry;
    var BeginSettingsLoaderSession = _deps.beginSettingsLoaderSession;
    var BuildDefaultConfig = _deps.buildDefaultConfig;
    var BuildDefaultPayloadToken = _deps.buildDefaultPayloadToken;
    var BuildPayloadFromBase64Url = _deps.buildPayloadFromBase64Url;
    var CollectStorageBuildEntryPanels = _deps.collectStorageBuildEntryPanels;
    var DeserializeBuildPayloadCompact = _deps.deserializeBuildPayloadCompact;
    var EnsureStorageHeroFavoritesHeaderVisible = _deps.ensureStorageHeroFavoritesHeaderVisible;
    var EnterStartupCorruptRepairPrompt = _deps.enterStartupCorruptRepairPrompt;
    var ExtractLastHeroTokenFromText = _deps.extractLastHeroTokenFromText;
    var FinalizeSettingsLoaderSession = _deps.finalizeSettingsLoaderSession;
    var FindBrowseBuildsButton = _deps.findBrowseBuildsButton;
    var GetLoaderBaseDefaultHeroId = _deps.getLoaderBaseDefaultHeroId;
    var GetSaveSettingsLoaderDetailForMessage = _deps.getSaveSettingsLoaderDetailForMessage;
    var HasBuildSaveStorageUiReady = _deps.hasBuildSaveStorageUiReady;
    var IsBrowseBuildsPopupOpen = _deps.isBrowseBuildsPopupOpen;
    var IsBuildSaveStorageRuntimeSourceStale = _deps.isBuildSaveStorageRuntimeSourceStale;
    var IsHudClassActive = _deps.isHudClassActive;
    var IsStartupCorruptRepairPending = _deps.isStartupCorruptRepairPending;
    var IsStorageBuildListEmpty = _deps.isStorageBuildListEmpty;
    var MergeConfig = _deps.mergeConfig;
    var NormalizeAllyColorWarningConfig = _deps.normalizeAllyColorWarningConfig;
    var NormalizeAmmoScaleConfig = _deps.normalizeAmmoScaleConfig;
    var NormalizeColorWarningConfig = _deps.normalizeColorWarningConfig;
    var NormalizeCompassSpeedSchemaMigration = _deps.normalizeCompassSpeedSchemaMigration;
    var NormalizeEnemyColorWarningConfig = _deps.normalizeEnemyColorWarningConfig;
    var NormalizeHealthbarTypeConfig = _deps.normalizeHealthbarTypeConfig;
    var NormalizeLanguageSchemaMigration = _deps.normalizeLanguageSchemaMigration;
    var NormalizeNeutralCampTierConfig = _deps.normalizeNeutralCampTierConfig;
    var NormalizeTopbarAllyHpWarningConfig = _deps.normalizeTopbarAllyHpWarningConfig;
    var NormalizeTopbarEnemyHpWarningConfig = _deps.normalizeTopbarEnemyHpWarningConfig;
    var NormalizeVoiceTypeConfig = _deps.normalizeVoiceTypeConfig;
    var QueueBuildSaveRequestFromLoader = _deps.queueBuildSaveRequestFromLoader;
    var ReadPanelTextDeepMaybe = _deps.readPanelTextDeepMaybe;
    var ResetBuildClearRequestAttributes = _deps.resetBuildClearRequestAttributes;
    var ResetBuildClearRuntimeState = _deps.resetBuildClearRuntimeState;
    var ResetBuildLoaderForTempDisable = _deps.resetBuildLoaderForTempDisable;
    var ResetSettingsLoaderSession = _deps.resetSettingsLoaderSession;
    var ResetStartupDefaultPayloadBootstrapState = _deps.resetStartupDefaultPayloadBootstrapState;
    var SetSettingsLoaderDebugOverlayLine = _deps.setSettingsLoaderDebugOverlayLine;
    var SetSettingsLoaderStepState = _deps.setSettingsLoaderStepState;
    var SetStartupCorruptRepairPending = _deps.setStartupCorruptRepairPending;
    var SettingsLoaderBuildProbeSnapshot = _deps.settingsLoaderBuildProbeSnapshot;
    var SettingsLoaderDebugLog = _deps.settingsLoaderDebugLog;
    var SettingsLoaderDebugLogThrottled = _deps.settingsLoaderDebugLogThrottled;
    var SettingsLoaderTraceLogThrottled = _deps.settingsLoaderTraceLogThrottled;
    var StepCorruptRepairClearStorageBuilds = _deps.stepCorruptRepairClearStorageBuilds;
    var SuppressStartupLoaderForSession = _deps.suppressStartupLoaderForSession;
    var TraceSettingsLoaderProbeHeartbeat = _deps.traceSettingsLoaderProbeHeartbeat;
    var TryCloseBrowseBuildsPopupForLoader = _deps.tryCloseBrowseBuildsPopupForLoader;
    var TryDismissBuildDeletePopup = _deps.tryDismissBuildDeletePopup;
    var TryOpenHeroShopForHeroProbe = _deps.tryOpenHeroShopForHeroProbe;
    var TryReadAccountIdFromKnownPartyPath = _deps.tryReadAccountIdFromKnownPartyPath;
    var TrySelectFirstStorageBuildEntry = _deps.trySelectFirstStorageBuildEntry;
    var TrySelectNextStorageBuildEntry = _deps.trySelectNextStorageBuildEntry;
    var WriteStorageConfigRawToUi = _deps.writeStorageConfigRawToUi;
    var isConnectedToHideout = _deps.isConnectedToHideout;
    var BUILD_LOADER_TEMP_DISABLED = false;

    // ── One-shot diagnostic sentinels ──
    var _startupConfigLoadDiagLogged = false;
    var _startupConfigDefaultDiagLogged = false;

    // ── Constants (from ql_core.js) ──
    var BUILD_CATEGORY_PAYLOAD_BOOTSTRAP_MAX_RETRIES = 15;
    var BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_POST_SETTLE_MS = 300;
    var BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS = 100;
    var BUILD_CATEGORY_PAYLOAD_DONE_REARM_MAX_ATTEMPTS = 4;
    var BUILD_CATEGORY_PAYLOAD_ENABLED = true;
    var BUILD_CATEGORY_PAYLOAD_HERO_PROBE_MAX_MISSES = 3;
    var BUILD_CATEGORY_PAYLOAD_HERO_PROBE_MAX_MS = 4000;
    var BUILD_CATEGORY_PAYLOAD_HERO_PROBE_RETRY_DELAY_MS = 1500;
    var BUILD_CATEGORY_PAYLOAD_HERO_SCAN_WAIT_MS = 50;
    var BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_DELAY_MS = 50;
    var BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_MAX_WAIT_MS = 8000;
    var BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_POLL_MS = 100;
    var BUILD_CATEGORY_PAYLOAD_INIT_MAX_RETRIES = 10;
    var BUILD_CATEGORY_PAYLOAD_MISSING_SCAN_MAX_ADVANCES = 6;
    var BUILD_CATEGORY_PAYLOAD_SHOP_NOT_OPEN_MAX_RESETS = 30;
    var BUILD_CATEGORY_PAYLOAD_POST_SWITCH_SHOP_OPEN_DELAY_SEC = 0.05;
    var BUILD_CATEGORY_PAYLOAD_PRE_RESTORE_DELAY_SEC = 0.20;
    var BUILD_CATEGORY_PAYLOAD_SCAN_INTERVAL_MS = 1000;
    var BUILD_CATEGORY_PAYLOAD_SOURCE_BOOTSTRAP_MAX_RETRIES = 14;
    var BUILD_CATEGORY_PAYLOAD_SOURCE_BOOTSTRAP_STEP_MS = 50;
    var BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID = "hero_airheart";
    var BUILD_CATEGORY_PAYLOAD_TEXT_SCAN_MAX_PANELS = 1500;
    var BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
    var BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS = 100;
    var BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS = 50;
    var BUILD_CATEGORY_PAYLOAD_WAIT_STORAGE_USER_PROMPT_MS = 12000;
    var BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY = (typeof QOL_COMPACT_SCHEMA_REGISTRY !== "undefined") ? QOL_COMPACT_SCHEMA_REGISTRY : {};
    var BUILD_CATEGORY_LATEST_COMPACT_SEMVER = (typeof QOL_LATEST_COMPACT_SEMVER !== "undefined") ? QOL_LATEST_COMPACT_SEMVER : "3.1.4";
    var BUILD_LOADER_TEMP_DISABLED = false;
    var BUILD_SAVE_MSG_ATTR = "QOL_BUILD_SAVE_MSG";
    var BUILD_SAVE_STATE_ATTR = "QOL_BUILD_SAVE_STATE";
    var BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS = 2;
    var BUILD_SAVE_TOKEN_ATTR = "QOL_BUILD_SAVE_TOKEN";
    var PANEL_ID_HERO_SHOP = "CitadelHudHeroShop";
    var PANEL_ID_SHOP_MODS_SELECTED_BUILD = "ShopModsSelectedBuild";
    var SETTINGS_LOADER_CORRUPT_PROMPT_DETAIL = "Potential corrupt save detected.\nPlease open your shop to resolve.\nPlease patient and allow the loader to run.";

    // ── SetBuildCategoryPayloadProbeReturnHeroFromConfig ──
    function SetBuildCategoryPayloadProbeReturnHeroFromConfig(configObj, sourceLabel) {
        var heroFromConfig = "";
        if (configObj && typeof configObj === "object" && configObj.hasOwnProperty("DEFAULT_HERO")) {
            heroFromConfig = QOL.normalizeHeroId(configObj.DEFAULT_HERO);
        }
        if (heroFromConfig && heroFromConfig !== BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) {
            State.buildCategoryPayloadHeroProbeReturnHero = heroFromConfig;
            State.buildCategoryPayloadHeroProbeReturnHeroSource = sourceLabel ? String(sourceLabel) : "payload_default_hero";
            return heroFromConfig;
        }
        var fallback = QOL.getLoaderBaseDefaultHeroId();
        State.buildCategoryPayloadHeroProbeReturnHero = fallback;
        State.buildCategoryPayloadHeroProbeReturnHeroSource = "base_default_hero";
        return fallback;
    }

    // ── EnsureBuildCategoryPayloadProbeReturnHeroFallback ──
    function EnsureBuildCategoryPayloadProbeReturnHeroFallback() {
        var current = QOL.normalizeHeroId(State.buildCategoryPayloadHeroProbeReturnHero || "");
        if (current && current !== BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) {
            State.buildCategoryPayloadHeroProbeReturnHero = current;
            if (!State.buildCategoryPayloadHeroProbeReturnHeroSource) {
                State.buildCategoryPayloadHeroProbeReturnHeroSource = "payload_default_hero";
            }
            return current;
        }
        return SetBuildCategoryPayloadProbeReturnHeroFromConfig(null, "base_default_hero");
    }

    // ── SetBuildCategoryPayloadProbeReturnHeroFromPayloadToken ──
    function SetBuildCategoryPayloadProbeReturnHeroFromPayloadToken(payloadToken) {
        var token = payloadToken ? String(payloadToken) : "";
        if (!token) return EnsureBuildCategoryPayloadProbeReturnHeroFallback();
        var parsed = TryParseBuildCategoryPayloadConfig(token);
        if (parsed && parsed.ok && parsed.parsed) {
            return SetBuildCategoryPayloadProbeReturnHeroFromConfig(parsed.parsed, "payload_default_hero");
        }
        return EnsureBuildCategoryPayloadProbeReturnHeroFallback();
    }

    // ── GetAccountIdForBuildCategoryPayload ──
    function GetAccountIdForBuildCategoryPayload(root) {
        var knownPathId = TryReadAccountIdFromKnownPartyPath(root);
        if (knownPathId && knownPathId.length > 0) return String(knownPathId);
        if (State.accountPresetSessionLockId && String(State.accountPresetSessionLockId).length > 0) {
            return String(State.accountPresetSessionLockId);
        }
        if (State.accountPresetBootstrapAccountId && String(State.accountPresetBootstrapAccountId).length > 0) {
            return String(State.accountPresetBootstrapAccountId);
        }
        if (State.accountProbeFoundId && String(State.accountProbeFoundId).length > 0) {
            return String(State.accountProbeFoundId);
        }
        return "";
    }

    // ── ShouldRunBuildCategoryPayloadUiAction ──
    function ShouldRunBuildCategoryPayloadUiAction(nowMs, stateField, cooldownMs) {
        if (!stateField || stateField.length === 0) return true;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var nextMs = Number(State[stateField]) || 0;
        if (now < nextMs) return false;
        var cd = Number(cooldownMs);
        if (!isFinite(cd) || cd < 0) cd = BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS;
        State[stateField] = now + cd;
        return true;
    }

    // ── EnsureStoragePayloadSourceVisibleReadOnly ──
    function EnsureStoragePayloadSourceVisibleReadOnly(root, nowMs) {
        if (!root) return false;
        if (IsBuildCategoryPayloadSourceReady(root)) {
            ResetBuildCategoryPayloadReadOnlySourceBootstrapState();
            return true;
        }

        // Don't burn retries while the hideout class hasn't appeared yet
        // (e.g. during launch transition). Defer until connected.
        if (!isConnectedToHideout(root)) return false;

        // Shop is not open and browse popup is not visible. Try to open the shop
        // via the open_item_shop client command (routes through CitadelConCommand ->
        // RunConCommand -> Engine ClientCmd -> server ClientCommand dispatcher).
        // This is the only confirmed working shop-open path in the current build.
        // CitadelEnterUpgradeShop / CitadelToggleUpgradeShop do not exist in any DLL,
        // and CitadelOpenUpgradeShop is a type-0 notification event (native->JS).
        if (!QOL.isHudClassActive(root, "gShopOpen") && !QOL.isBrowseBuildsPopupOpen(root)) {
            if ((State.openItemShopLastMs || 0) <= nowMs - 1000 &&
                ShouldRunBuildCategoryPayloadUiAction(nowMs, "buildCategoryPayloadShopOpenActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                State.openItemShopLastMs = nowMs;
                QOL.dispatchCitadelConCommand("open_item_shop");
            }
            return false;
        }

        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (now < (State.buildCategoryPayloadSourceBootstrapNextMs || 0)) {
            return false;
        }

        var retries = Number(State.buildCategoryPayloadSourceBootstrapRetries) || 0;
        if (retries >= BUILD_CATEGORY_PAYLOAD_SOURCE_BOOTSTRAP_MAX_RETRIES) {
            State.buildCategoryPayloadSourceBootstrapNextMs = now + BUILD_CATEGORY_PAYLOAD_HERO_PROBE_RETRY_DELAY_MS;
            SettingsLoaderDebugLogThrottled(
                "payload_source_bootstrap_exhausted|" + String(retries),
                "payload_source_bootstrap exhausted retries=" + String(retries),
                now
            );
            SetSettingsLoaderStepState("read_payload", "active", "Waiting for build panel source (retry window).");
            SetSettingsLoaderDebugOverlayLine("source_bootstrap exhausted retries=" + String(retries));
            return false;
        }

        var stage = State.buildCategoryPayloadSourceBootstrapStage || "open_shop";
        var acted = false;
        var detail = "";
        var browsePopupOpenNow = QOL.isBrowseBuildsPopupOpen(root);
        var forceBootstrapExhausted = false;
        if (stage === "open_shop") {
            if (browsePopupOpenNow) {
                detail = "Build browser already open.";
            } else if (QOL.isHudClassActive(root, "gShopOpen")) {
                // Shop is open but browse popup isn't. Try opening it via
                // the browse builds button.
                detail = "Shop open; navigating to browse builds.";
            } else {
                // Try active shop open (uses CitadelOpenUpgradeShop etc. from client.dll)
                if (ShouldRunBuildCategoryPayloadUiAction(now, "buildCategoryPayloadShopOpenActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                    acted = TryOpenHeroShopForHeroProbe(root);
                    detail = acted ? "Requested hero shop open." : "Trying to open hero shop.";
                } else {
                    detail = "Waiting before next shop open attempt.";
                }
            }
            State.buildCategoryPayloadSourceBootstrapStage = "browse";
        } else {
            var browseLookup = QOL.findBrowseBuildsButton(root);
            var browseBtn = browseLookup && browseLookup.panel ? browseLookup.panel : null;
            var browsePopupOpen = QOL.isBrowseBuildsPopupOpen(root);
            var browseActed = false;
            var firstBuildSelect = { ok: false, reason: "throttled" };
            if (browsePopupOpen) {
                firstBuildSelect = TrySelectFirstStorageBuildEntry(root, true);
                detail = firstBuildSelect.ok
                    ? "Build browser already open; selected first build."
                    : "Build browser already open; waiting for build entries.";
                var selectedBuildBootstrap = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
                var selectedHeaderCountBootstrap = QOL.countBuildCategoryHeaders(selectedBuildBootstrap);
                var firstReason = String(firstBuildSelect && firstBuildSelect.reason ? firstBuildSelect.reason : "");
                if (!firstBuildSelect.ok && firstReason.indexOf("entry_count:0") === 0 && selectedHeaderCountBootstrap <= 0) {
                    forceBootstrapExhausted = true;
                    detail = "Build browser open with no entries. Escalating bootstrap.";
                }
            } else if (ShouldRunBuildCategoryPayloadUiAction(now, "buildCategoryPayloadBrowseActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                browseActed = QOL.activatePanelSafe(browseBtn);
                firstBuildSelect = TrySelectFirstStorageBuildEntry(root);
            }
            acted = !!(browseActed || firstBuildSelect.ok);
            if (!browsePopupOpen && firstBuildSelect.ok) {
                detail = browseActed
                    ? "Requested browse builds panel and selected first build."
                    : "Selected first build from browse list.";
            } else if (!browsePopupOpen) {
                detail = browseBtn
                    ? (browseActed ? "Requested browse builds panel." : "Browse builds visible; waiting.")
                    : "Searching browse builds panel.";
            }
            detail += " firstBuildSelect=" + (firstBuildSelect.ok ? "1" : "0") + " reason=" + String(firstBuildSelect.reason || "-");
            State.buildCategoryPayloadSourceBootstrapStage = "open_shop";
        }

        State.buildCategoryPayloadSourceBootstrapRetries = forceBootstrapExhausted
            ? BUILD_CATEGORY_PAYLOAD_SOURCE_BOOTSTRAP_MAX_RETRIES
            : (retries + 1);
        State.buildCategoryPayloadSourceBootstrapNextMs = now + BUILD_CATEGORY_PAYLOAD_SOURCE_BOOTSTRAP_STEP_MS;
        SettingsLoaderDebugLogThrottled(
            "payload_source_bootstrap|" + stage + "|" + (acted ? "1" : "0") + "|" + String(State.buildCategoryPayloadSourceBootstrapRetries),
            "payload_source_bootstrap stage=" + stage +
                " acted=" + (acted ? "1" : "0") +
                " retries=" + String(State.buildCategoryPayloadSourceBootstrapRetries) +
                " detail=\"" + detail + "\"" +
                " " + SettingsLoaderBuildProbeSnapshot(root),
            now
        );
        SetSettingsLoaderStepState("read_payload", "active", detail);
        SetSettingsLoaderDebugOverlayLine(
            "source_bootstrap stage=" + stage +
            " acted=" + (acted ? "1" : "0") +
            " retries=" + String(State.buildCategoryPayloadSourceBootstrapRetries)
        );
        return false;
    }

    // ── IsBuildCategoryPayloadStorageConflictStrong ──
    function IsBuildCategoryPayloadStorageConflictStrong(signal) {
        var hero = QOL.normalizeHeroId(signal && signal.hero ? signal.hero : "");
        if (!hero || hero === BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) return false;
        var source = signal && signal.source ? String(signal.source) : "";
        if (source.indexOf("setting:") === 0) return true;
        if (source === "commands" || source.indexOf("commands") === 0) return true;
        return false;
    }

    // ── TryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader ──
    function TryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root) {
        if (!root || !root.FindChildTraverse) return { hero: "", source: "shopFavoritesHeaderMissing" };
        var shopPanel = root.FindChildTraverse(PANEL_ID_HERO_SHOP);
        if (!shopPanel || !shopPanel.FindChildrenWithClassTraverse) {
            return { hero: "", source: "shopFavoritesHeaderMissing" };
        }
        // Primary: extract hero from Favorites header label text.
        // This works in English (text contains the hero name) but may fail in
        // non-English locales where {s:hero_name} resolves to a localized name
        // that doesn't contain the internal hero_* ID.
        var labels = [];
        try { labels = shopPanel.FindChildrenWithClassTraverse("HeroFavoritesHeaderLabel") || []; } catch (e0) { labels = []; }
        var fallbackHero = "";
        for (var i = 0; i < labels.length; i++) {
            var label = labels[i];
            if (!label) continue;
            var txt = ReadPanelTextMaybe(label);
            if (!txt || txt.length === 0) continue;
            var parsed = QOL.normalizeHeroId(QOL.extractHeroTokenFromText(txt) || QOL.extractLastHeroTokenFromText(txt));
            if (!parsed) continue;
            // Language-agnostic: the HeroFavoritesHeaderLabel class already identifies
            // the correct label. "recommended mods" is English-only — accept any hero
            // found in a HeroFavoritesHeaderLabel for the primary source.
            if (!fallbackHero) fallbackHero = parsed;
        }
        if (fallbackHero) return { hero: fallbackHero, source: "shopFavoritesHeader" };

        // Fallback: text parsing failed (likely non-English locale).
        // Use onactivate attribute scanning which contains internal hero IDs
        // like "selecthero hero_airheart" — these are language-agnostic.
        var cmdHero = QOL.normalizeHeroId(TryReadSelectedHeroIncludingStorageFromCommandPanels(root));
        if (cmdHero) return { hero: cmdHero, source: "shopCommands" };

        return { hero: "", source: "shopFavoritesHeaderMissing" };
    }

    // ── ConfirmBuildCategoryPayloadStorageHero ──
    function ConfirmBuildCategoryPayloadStorageHero(root, nowMs, allowUiFallback) {
        var allowFallback = (allowUiFallback !== false);
        var traceNow = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        // Fast path: if Airheart was already confirmed, skip all scanning.
        if (State.buildCategoryPayloadAirheartHeaderConfirmed) {
            return {
                confirmed: true,
                source: "cached_confirmation",
                detail: "Airheart already confirmed this session"
            };
        }
        // GameInterfaceAPI confirmed absent — use UI panel scanning for hero detection.
        var signal = TryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root);
        var hero = QOL.normalizeHeroId(signal.hero);
        var source = signal.source ? String(signal.source) : "shopFavoritesHeaderMissing";
        function traceConfirm(confirmed, traceSource, traceHero, traceDetail) {
            SettingsLoaderTraceLogThrottled(
                "confirm_airheart|" +
                    (confirmed ? "1" : "0") + "|" +
                    (traceSource || "-") + "|" +
                    (traceHero || "-"),
                "confirm_airheart confirmed=" + (confirmed ? "1" : "0") +
                    " source=" + (traceSource || "-") +
                    " hero=" + (traceHero || "-") +
                    " detail=\"" + (traceDetail || "") + "\"",
                traceNow
            );
        }

        if (hero === BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) {
            var directSignature = QOL.confirmStorageHeroSignatureAbilities(root, traceNow, BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS);
            var sigDirect = "hero:" + hero + "|src:" + source + "|sig:" + (directSignature.signature || "-");
            State.buildCategoryPayloadStorageConfirmSig = sigDirect;
            State.buildCategoryPayloadStorageConfirmHits = Number(directSignature.hits) || 0;
            if (directSignature.confirmed) {
                var confirmedDirect = {
                    confirmed: true,
                    source: source + "+signature",
                    detail: "storage hero confirmed source=" + source + " with signature abilities"
                };
                traceConfirm(true, confirmedDirect.source, hero, confirmedDirect.detail);
                return confirmedDirect;
            }
            var pendingDirect = {
                confirmed: false,
                source: source + "+signature",
                detail: directSignature.detail || "Waiting for Airheart signature abilities."
            };
            traceConfirm(false, pendingDirect.source, hero, pendingDirect.detail);
            return pendingDirect;
        }

        if (hero && hero !== BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID && !QOL.isBuildSaveStorageRuntimeSourceStale(source)) {
            var conflictSignature = QOL.confirmStorageHeroSignatureAbilities(root, traceNow, BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS);
            if (conflictSignature.confirmed && (IsBuildCategoryPayloadSourceReady(root) || QOL.hasBuildSaveStorageUiReady(root) || QOL.isHudClassActive(root, "gShopOpen"))) {
                var confirmedByConflictSignature = {
                    confirmed: true,
                    source: "signature_abilities",
                    detail: "storage hero confirmed by signature abilities; ignoring stale " + source + " signal"
                };
                State.buildCategoryPayloadStorageConfirmSig = "hero:" + BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID + "|src:signature_abilities|override:" + source;
                State.buildCategoryPayloadStorageConfirmHits = Number(conflictSignature.hits) || 0;
                traceConfirm(true, confirmedByConflictSignature.source, BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID, confirmedByConflictSignature.detail);
                return confirmedByConflictSignature;
            } else {
                State.buildCategoryPayloadStorageConfirmSig = "";
                State.buildCategoryPayloadStorageConfirmHits = 0;
                var conflictDirect = {
                    confirmed: false,
                    source: source,
                    detail: "storage hero conflict hero=" + hero + " source=" + source
                };
                traceConfirm(false, source, hero, conflictDirect.detail);
                return conflictDirect;
            }
        }

        State.buildCategoryPayloadStorageConfirmSig = "";
        State.buildCategoryPayloadStorageConfirmHits = 0;
        var sourceReady = IsBuildCategoryPayloadSourceReady(root);
        // When header-based hero detection failed (empty hero, likely non-English locale),
        // relax the signature confirmation: only require 1 hit instead of 2, and skip
        // the UI-ready gate. The image-based signature check is language-agnostic and is
        // the most reliable signal when text parsing can't identify the hero.
        var relaxedSigHits = (signal.source === "shopCommands" || signal.source === "shopFavoritesHeaderMissing") ? 1 : BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS;
        var signatureOnly = QOL.confirmStorageHeroSignatureAbilities(root, traceNow, relaxedSigHits);
        var uiReadyForSig = sourceReady || QOL.hasBuildSaveStorageUiReady(root) || QOL.isHudClassActive(root, "gShopOpen");
        if (signatureOnly.confirmed && (uiReadyForSig || relaxedSigHits === 1)) {
            var confirmedSignatureOnly = {
                confirmed: true,
                source: "signature_abilities",
                detail: "storage hero confirmed by signature abilities" + (relaxedSigHits === 1 ? " (relaxed)" : "")
            };
            State.buildCategoryPayloadStorageConfirmSig = "hero:" + BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID + "|src:signature_abilities|sig:" + (signatureOnly.signature || "-");
            State.buildCategoryPayloadStorageConfirmHits = Number(signatureOnly.hits) || 0;
            traceConfirm(true, confirmedSignatureOnly.source, BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID, confirmedSignatureOnly.detail);
            return confirmedSignatureOnly;
        }

        var canUseRuntimeFallback = !!allowFallback && !!(sourceReady || QOL.isHudClassActive(root, "gShopOpen"));
        if (canUseRuntimeFallback) {
            var runtimeSignal = ResolveBuildSaveStorageHeroSignal(root);
            var runtimeHero = QOL.normalizeHeroId(runtimeSignal && runtimeSignal.hero ? runtimeSignal.hero : "");
            var runtimeSource = runtimeSignal && runtimeSignal.source ? String(runtimeSignal.source) : "none";
            var runtimeSourceTagged = "runtime:" + runtimeSource;
            var runtimeUiReady = !!(QOL.hasBuildSaveStorageUiReady(root) || sourceReady);

            if (runtimeHero === BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID && runtimeUiReady) {
                var runtimeSignature = signatureOnly;
                var sigRuntime = "hero:" + runtimeHero + "|src:" + runtimeSourceTagged + "|uiready:" + (runtimeUiReady ? "1" : "0") + "|sig:" + (runtimeSignature.signature || "-");
                State.buildCategoryPayloadStorageConfirmSig = sigRuntime;
                State.buildCategoryPayloadStorageConfirmHits = Number(runtimeSignature.hits) || 0;
                if (runtimeSignature.confirmed) {
                    var confirmedRuntime = {
                        confirmed: true,
                        source: runtimeSourceTagged + "+signature",
                        detail: "storage hero confirmed source=" + runtimeSourceTagged + " with signature abilities"
                    };
                    traceConfirm(true, confirmedRuntime.source, runtimeHero, confirmedRuntime.detail);
                    return confirmedRuntime;
                }
                var pendingRuntime = {
                    confirmed: false,
                    source: runtimeSourceTagged + "+signature",
                    detail: runtimeSignature.detail || "Waiting for Airheart signature abilities."
                };
                traceConfirm(false, pendingRuntime.source, runtimeHero, pendingRuntime.detail);
                return pendingRuntime;
            }

            if (runtimeHero && runtimeHero !== BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID && !QOL.isBuildSaveStorageRuntimeSourceStale(runtimeSource)) {
                var conflictRuntime = {
                    confirmed: false,
                    source: runtimeSourceTagged,
                    detail: "storage hero conflict hero=" + runtimeHero + " source=" + runtimeSourceTagged
                };
                traceConfirm(false, runtimeSourceTagged, runtimeHero, conflictRuntime.detail);
                return conflictRuntime;
            }
        }

        var unresolved = {
            confirmed: false,
            source: source,
            detail: sourceReady
                ? "Waiting for Airheart confirmation."
                : (allowFallback
                    ? "storage hero unresolved source=" + source + " hero=" + (hero || "-")
                    : "storage hero unresolved (strict) source=" + source + " hero=" + (hero || "-"))
        };
        traceConfirm(false, source, hero, unresolved.detail);
        return unresolved;
    }

    // ── CompleteBuildCategoryPayloadHeroProbe ──
    function CompleteBuildCategoryPayloadHeroProbe(accountId, markDone, resultCode, resultDetail, options) {
        _TLog("load:ProbeComplete", "result=" + (resultCode || "success") + " markDone=" + (markDone ? "1" : "0") + " account=" + String(accountId || "").slice(0, 8));
        var now = Date.now ? Date.now() : (new Date()).getTime();
        var returnHeroOnAbort = !(options && options.returnHeroOnAbort === false);
        var shouldPulseShop =
            !!markDone &&
            !State.buildCategoryPayloadPostSwitchShopPulseDone &&
            State.buildCategoryPayloadHeroProbeDidSwitch &&
            !State.buildCategoryPayloadCorruptRepairActive;
        var returnHero = EnsureBuildCategoryPayloadProbeReturnHeroFallback();
        var resolvedResultCode = resultCode ? String(resultCode) : "success";
        var resolvedResultDetail = resultDetail ? String(resultDetail) : "";
        SettingsLoaderDebugLog(
            "probe_complete_start markDone=" + (markDone ? "1" : "0") +
            " account=" + (accountId || "-") +
            " result=" + resolvedResultCode +
            " returnHero=" + (returnHero || "-") +
            " didSwitch=" + (State.buildCategoryPayloadHeroProbeDidSwitch ? "1" : "0")
        );
        if ((markDone || returnHeroOnAbort) && State.buildCategoryPayloadHeroProbeDidSwitch && returnHero.length > 0 && returnHero !== BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) {
            var queuedReturn = false;
            if (typeof QueueDelayedHeroRestore === "function") {
                SetSettingsLoaderStepState(
                    "return_hero",
                    "active",
                    "Returning to original hero in " + String(Number(BUILD_CATEGORY_PAYLOAD_PRE_RESTORE_DELAY_SEC).toFixed(1)) + "s."
                );
                queuedReturn = QOL.queueDelayedHeroRestore(
                    returnHero,
                    "loader_return_original",
                    BUILD_CATEGORY_PAYLOAD_PRE_RESTORE_DELAY_SEC
                );
            }
            if (queuedReturn) {
                SetSettingsLoaderStepState("return_hero", "done", "Queued return to original hero.");
            } else {
                SetSettingsLoaderStepState("return_hero", "active", "Returning to original hero.");
                var switchedBack = QOL.selectHeroForBuildSave(returnHero, "loader_return_original");
                if (switchedBack) {
                    SetSettingsLoaderStepState("return_hero", "done", "Returned to original hero.");
                } else {
                    SetSettingsLoaderStepState("return_hero", "error", "Failed to return hero automatically.");
                    if (resolvedResultCode === "success") {
                        resolvedResultCode = "failed";
                    }
                }
            }
            if (shouldPulseShop) {
                State.buildCategoryPayloadPostSwitchShopPulseDone = true;
                var pulseDelaySec = BUILD_CATEGORY_PAYLOAD_POST_SWITCH_SHOP_OPEN_DELAY_SEC;
                if (queuedReturn) pulseDelaySec += BUILD_CATEGORY_PAYLOAD_PRE_RESTORE_DELAY_SEC;
                $.Schedule(pulseDelaySec, QOL.pulseShopAfterBuildPayloadStartupReturn);
            }
        } else if (markDone) {
            SetSettingsLoaderStepState("return_hero", "skipped", "No hero return needed.");
        }
        if (markDone) {
            if (resolvedResultCode === "success" || resolvedResultCode === "default") {
                State.buildCategoryPayloadStartupConsumedAccountId = accountId ? String(accountId) : "";
                State.buildCategoryPayloadStartupConsumedResult = resolvedResultCode;
                State.buildCategoryPayloadDormant = true;
                State.buildCategoryPayloadDormantReason = resolvedResultCode === "success" ? "load_done" : "load_default";
            }
            State.buildCategoryPayloadHeroProbeDoneAccountId = accountId ? String(accountId) : "";
            QOL.finalizeSettingsLoaderSession(resolvedResultCode, resolvedResultDetail, now);
        } else {
            State.buildCategoryPayloadHeroProbeDoneAccountId = "";
        }
        SetSettingsLoaderDebugOverlayLine(
            "complete markDone=" + (markDone ? "1" : "0") +
            " result=" + resolvedResultCode +
            " returnHero=" + (returnHero || "-")
        );
        ResetBuildCategoryPayloadHeroProbeState();
    }

    // ── DeferBuildCategoryPayloadHeroProbe ──
    function DeferBuildCategoryPayloadHeroProbe(accountId, nowMs) {
        CompleteBuildCategoryPayloadHeroProbe(accountId, false, "", "", { returnHeroOnAbort: false });
        State.buildCategoryPayloadHeroProbeRetryAfterMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_PROBE_RETRY_DELAY_MS;
        SettingsLoaderDebugLog(
            "probe_defer account=" + (accountId || "-") +
            " retryAfterMs=" + String(State.buildCategoryPayloadHeroProbeRetryAfterMs)
        );
        SetSettingsLoaderDebugOverlayLine(
            "defer account=" + (accountId || "-") +
            " retryMs=" + String(BUILD_CATEGORY_PAYLOAD_HERO_PROBE_RETRY_DELAY_MS)
        );
    }

    // ── TryRearmBuildCategoryPayloadProbeIfDoneLocked ──
    function TryRearmBuildCategoryPayloadProbeIfDoneLocked(root, accountId, nowMs, cfg) {
        if (!accountId || accountId.length === 0) return false;
        if (State.buildCategoryPayloadHeroProbeDoneAccountId !== accountId) return false;
        if (State.buildCategoryPayloadLastAppliedText && State.buildCategoryPayloadLastAppliedText.length > 0) return false;
        var sessionResult = State.settingsLoaderResult ? String(State.settingsLoaderResult) : "";
        if (sessionResult && sessionResult !== "success") return false;

        var configuredReturnHero = QOL.getLoaderBaseDefaultHeroId();
        if (!configuredReturnHero || configuredReturnHero === BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) return false;

        if (nowMs < (State.buildCategoryPayloadDoneRearmNextMs || 0)) return false;
        var attempts = Number(State.buildCategoryPayloadDoneRearmAttempts) || 0;
        if (attempts >= BUILD_CATEGORY_PAYLOAD_DONE_REARM_MAX_ATTEMPTS) return false;

        State.buildCategoryPayloadHeroProbeDoneAccountId = "";
        State.buildCategoryPayloadHeroProbeRetryAfterMs = 0;
        State.buildCategoryPayloadHeroProbeMisses = 0;
        ResetBuildCategoryPayloadHeroProbeState();
        State.buildCategoryPayloadDoneRearmAttempts = attempts + 1;
        State.buildCategoryPayloadDoneRearmNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_PROBE_RETRY_DELAY_MS;
        if (State.settingsLoaderSessionCompleted && !State.settingsLoaderSessionActive &&
            State.settingsLoaderResult !== "success") {
            ResetSettingsLoaderSession(false);
        }
        SettingsLoaderDebugLog(
            "probe_rearm_done_lock account=" + accountId +
            " returnHero=" + configuredReturnHero +
            " attempt=" + String(State.buildCategoryPayloadDoneRearmAttempts) +
            " result=" + (State.settingsLoaderResult || "-")
        );
        SetSettingsLoaderDebugOverlayLine(
            "rearm done-lock attempt=" + String(State.buildCategoryPayloadDoneRearmAttempts) +
            " return=" + configuredReturnHero
        );
        return true;
    }

    // ── PrepareBuildCategoryPayloadHeroProbe ──
    // State machine for the config load/bootstrap probe. Discovers and decodes
    // the QOLLOCK config payload stored in an Airheart build category.
    //
    //   "" (initial) → wait_storage → scan_storage → decode → apply → (done)
    //
    // Timeout / degraded paths:
    //   wait_storage (12s timeout) → bootstrap_via_save_enqueue
    //     Only fires if Airheart UI hasn't rendered. Guarded by
    //     currentBuildHasAnyPayload check — won't overwrite existing config.
    //   wait_storage (8-12s degraded) → scan_storage (signature confirmed)
    //     UI header didn't confirm, but signature abilities are visible.
    //
    // Error escalation:
    //   scan_storage miss → retry up to MAX_SCAN_ADVANCES (6) build entries
    //   scan_storage miss + shop NOT open → reset, wait (UI timing, not corruption)
    //   scan_storage miss + shop open → corrupt repair (genuine data loss)
    //   decode failed + non-schema error → corrupt repair after MAX_MISSES (3)
    //   decode failed + schema/registry error → apply defaults, keep builds
    // ── Stage helpers extracted from PrepareBuildCategoryPayloadHeroProbe ──

    function detectProbeAccountChange(accountId) {
        if (State.buildCategoryPayloadHeroProbeAccountId === accountId) return false;
        if (State.buildCategoryPayloadHeroProbeDidSwitch) {
            CompleteBuildCategoryPayloadHeroProbe(State.buildCategoryPayloadHeroProbeAccountId, false);
        }
        SettingsLoaderDebugLog(
            "probe_account_change from=" + (State.buildCategoryPayloadHeroProbeAccountId || "-") +
            " to=" + accountId +
            " didSwitch=" + (State.buildCategoryPayloadHeroProbeDidSwitch ? "1" : "0")
        );
        SetSettingsLoaderDebugOverlayLine("acct_change " + (State.buildCategoryPayloadHeroProbeAccountId || "-") + " -> " + accountId);
        State.buildCategoryPayloadHeroProbeAccountId = accountId;
        State.buildCategoryPayloadHeroProbeDoneAccountId = "";
        State.buildCategoryPayloadHeroProbeRetryAfterMs = 0;
        State.buildCategoryPayloadHeroProbeMisses = 0;
        State.buildCategoryPayloadShopNotOpenResets = 0;
        State.buildCategoryPayloadDoneRearmNextMs = 0;
        State.buildCategoryPayloadDoneRearmAttempts = 0;
        State.buildCategoryPayloadPostSwitchShopPulseDone = false;
        ResetBuildCategoryPayloadHeroProbeState();
        return true;
    }

    function handleProbeDoneCheck(accountId, nowMs) {
        if (State.buildCategoryPayloadHeroProbeDoneAccountId === accountId) return "wait";
        if (nowMs < (State.buildCategoryPayloadHeroProbeRetryAfterMs || 0)) return "wait";
        return null;
    }

    function handleCorruptRepairInit(root, nowMs) {
        var corruptRepairPending = QOL.isStartupCorruptRepairPending(root);
        if (!corruptRepairPending || State.buildCategoryPayloadCorruptRepairActive) return false;
        State.buildCategoryPayloadCorruptRepairActive = true;
        State.buildCategoryPayloadCorruptRepairStartedMs = nowMs;
        State.buildCategoryPayloadCorruptRepairCleared = false;
        State.buildCategoryPayloadCorruptRepairClearRetries = 0;
        State.buildCategoryPayloadCorruptRepairClearNextMs = nowMs;
        State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
        State.buildCategoryPayloadCorruptRepairBrowseReady = false;
        State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
        State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
        State.buildCategoryPayloadCorruptRepairPostClearUntilMs = 0;
        State.buildCategoryPayloadAirheartHeaderConfirmed = false;
        State.buildCategoryPayloadAirheartHeaderConfirmedMs = 0;
        State.buildCategoryPayloadDefaultBootstrapPostSavePrompt = false;
        State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
        State.buildCategoryPayloadHeroProbeNextMs = nowMs;
        SetSettingsLoaderStepState("read_payload", "active", "Corrupt payload detected. Running automatic repair.");
        return true;
    }

    function handleBootstrapViaSaveEnqueue(root, accountId, nowMs, cfg) {
        if (State.buildCategoryPayloadHeroProbeStage !== "bootstrap_via_save_enqueue") return null;
        SetSettingsLoaderStepState("switch_airheart", "done", "Airheart switch command sent.");
        SetSettingsLoaderStepState("confirm_airheart", "active", "Verifying Airheart context.");

        EnsureStoragePayloadSourceVisibleReadOnly(root, nowMs);
        QOL.ensureStorageHeroFavoritesHeaderVisible(root, nowMs);
        if (!State.buildCategoryPayloadAirheartHeaderConfirmed) {
            var allowBootstrapFallback = !!State.buildCategoryPayloadCorruptRepairActive;
            var bootstrapConfirm = ConfirmBuildCategoryPayloadStorageHero(root, nowMs, allowBootstrapFallback);
            if (!bootstrapConfirm.confirmed) {
                SetSettingsLoaderStepState("confirm_airheart", "active", bootstrapConfirm.detail || "Verifying Airheart context for bootstrap.");
                if (State.buildCategoryPayloadCorruptRepairActive && !QOL.isHudClassActive(root, "gShopOpen")) {
                    SetSettingsLoaderStepState("read_payload", "active", SETTINGS_LOADER_CORRUPT_PROMPT_DETAIL);
                }
                State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
                return "wait";
            }
            State.buildCategoryPayloadAirheartHeaderConfirmed = true;
            State.buildCategoryPayloadAirheartHeaderConfirmedMs = nowMs;
        }
        SetSettingsLoaderStepState("confirm_airheart", "done", "Airheart context confirmed.");

        if (State.buildCategoryPayloadCorruptRepairActive && !State.buildCategoryPayloadCorruptRepairCleared) {
            var clearStep = StepCorruptRepairClearStorageBuilds(root, nowMs);
            if (clearStep.state === "failed") {
                finalizeProbeFailure(accountId, clearStep.detail || "Corrupt-save clear failed.");
                return "wait";
            }
            if (clearStep.state !== "done") {
                SetSettingsLoaderStepState("read_payload", "active", clearStep.detail || "Clearing Airheart builds before repair save.");
                State.buildCategoryPayloadHeroProbeNextMs = nowMs + (Number(clearStep.waitMs) || BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS);
                return "wait";
            }
            State.buildCategoryPayloadCorruptRepairCleared = true;
            State.buildCategoryPayloadCorruptRepairPostClearUntilMs = nowMs + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_POST_SETTLE_MS;
            ResetBuildClearRequestAttributes(root);
            ResetBuildClearRuntimeState();
            QOL.resetBuildSaveRequestAttributes(root);
            State.buildCategoryPayloadDefaultBootstrapSaveToken = "";
            TryDismissBuildDeletePopup(root);
            TryCloseBrowseBuildsPopupForLoader(root);
            SetSettingsLoaderStepState("read_payload", "active", clearStep.detail || "Airheart builds cleared. Finalizing clear UI.");
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        if (State.buildCategoryPayloadCorruptRepairCleared) {
            var postClearUntil = Number(State.buildCategoryPayloadCorruptRepairPostClearUntilMs) || 0;
            if (nowMs < postClearUntil) {
                TryDismissBuildDeletePopup(root);
                TryCloseBrowseBuildsPopupForLoader(root);
                SetSettingsLoaderStepState("read_payload", "active", "Finalizing clear UI before save bootstrap.");
                State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
                return "wait";
            }
        }

        if (TryCloseBrowseBuildsPopupForLoader(root)) {
            SetSettingsLoaderStepState("read_payload", "active", "Closing build browser before save bootstrap.");
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        var initReady = QOL.ensureStorageBuildInitialized(root, nowMs);
        if (!initReady) {
            var initRetries = Number(State.buildCategoryPayloadHeroProbeInitRetries) || 0;
            SetSettingsLoaderStepState("read_payload", "active", "Initializing empty Airheart build.");
            if (initRetries >= BUILD_CATEGORY_PAYLOAD_INIT_MAX_RETRIES) {
                finalizeProbeFailure(accountId, "No Airheart build found; auto-initialize failed.");
                return "wait";
            }
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        var bootstrapPayloadToken = State.buildCategoryPayloadDefaultBootstrapPayloadText
            ? String(State.buildCategoryPayloadDefaultBootstrapPayloadText)
            : "";
        if (!bootstrapPayloadToken) {
            bootstrapPayloadToken = QOL.buildDefaultPayloadToken(cfg);
            if (!bootstrapPayloadToken) {
                finalizeProbeFailure(accountId, "Failed to generate default payload for save bootstrap.");
                return "wait";
            }
            State.buildCategoryPayloadDefaultBootstrapPayloadText = bootstrapPayloadToken;
        }

        if (QOL.currentBuildHasPayload(root, bootstrapPayloadToken)) {
            SetSettingsLoaderStepState("read_payload", "active", "Reading storage build payload.");
            State.buildCategoryPayloadHeroProbeStage = "scan_storage";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs;
            return "ready";
        }

        var anyPayloadSkipCount = Number(State.buildCategoryPayloadAnyPayloadGuardSkips) || 0;
        if (QOL.currentBuildHasAnyPayload && QOL.currentBuildHasAnyPayload(root)
            && anyPayloadSkipCount < BUILD_CATEGORY_PAYLOAD_BOOTSTRAP_MAX_RETRIES) {
            State.buildCategoryPayloadAnyPayloadGuardSkips = anyPayloadSkipCount + 1;
            SetSettingsLoaderStepState("read_payload", "active", "Existing payload found in current build; skipping save bootstrap.");
            SetSettingsLoaderStepState("confirm_airheart", "done", "Airheart context verified via existing payload.");
            State.buildCategoryPayloadHeroProbeStage = "scan_storage";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs;
            _TLog("load:ProbeStage", "bootstrap_via_save_enqueue found existing payload → scan_storage skips=" + String(anyPayloadSkipCount + 1));
            return "ready";
        }

        var saveStateEnqueue = root.GetAttributeString ? String(root.GetAttributeString(BUILD_SAVE_STATE_ATTR, "")) : "";
        if (saveStateEnqueue === "pending") {
            SetSettingsLoaderStepState("read_payload", "active", "Waiting for active save pipeline.");
            State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_wait";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        if ((Number(State.buildCategoryPayloadDefaultBootstrapRetries) || 0) >= BUILD_CATEGORY_PAYLOAD_BOOTSTRAP_MAX_RETRIES) {
            finalizeProbeFailure(accountId, "Save bootstrap retry limit reached.");
            return "wait";
        }

        var bootstrapSaveToken = QueueBuildSaveRequestFromLoader(root, bootstrapPayloadToken, nowMs);
        if (!bootstrapSaveToken) {
            State.buildCategoryPayloadDefaultBootstrapRetries = (Number(State.buildCategoryPayloadDefaultBootstrapRetries) || 0) + 1;
            SetSettingsLoaderStepState("read_payload", "active", "Save bootstrap queue failed; retrying.");
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }
        State.buildCategoryPayloadDefaultBootstrapSaveToken = bootstrapSaveToken;
        State.buildCategoryPayloadDefaultBootstrapSaveVerifyHits = 0;
        State.buildCategoryPayloadDefaultBootstrapRetries = (Number(State.buildCategoryPayloadDefaultBootstrapRetries) || 0) + 1;
        SetSettingsLoaderStepState("read_payload", "active", "Save bootstrap queued.");
        State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_wait";
        State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
        return "wait";
    }

    function handleBootstrapViaSaveWait(root, accountId, nowMs) {
        if (State.buildCategoryPayloadHeroProbeStage !== "bootstrap_via_save_wait") return null;
        if (State.buildCategoryPayloadCorruptRepairActive && !State.buildCategoryPayloadCorruptRepairCleared) {
            SetSettingsLoaderStepState("read_payload", "active", "Waiting for clear phase before save bootstrap.");
            State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }
        var verifyPayloadToken = State.buildCategoryPayloadDefaultBootstrapPayloadText
            ? String(State.buildCategoryPayloadDefaultBootstrapPayloadText)
            : "";
        if (!verifyPayloadToken) {
            State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs;
            return "wait";
        }

        var saveStateWait = root.GetAttributeString ? String(root.GetAttributeString(BUILD_SAVE_STATE_ATTR, "")) : "";
        var saveMsgWait = root.GetAttributeString ? String(root.GetAttributeString(BUILD_SAVE_MSG_ATTR, "")) : "";
        var saveTokenWait = root.GetAttributeString ? String(root.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "")) : "";
        var expectedSaveToken = State.buildCategoryPayloadDefaultBootstrapSaveToken
            ? String(State.buildCategoryPayloadDefaultBootstrapSaveToken)
            : "";
        var payloadDetectedAfterSave = QOL.currentBuildHasPayload(root, verifyPayloadToken);

        if (saveStateWait === "pending") {
            if (expectedSaveToken.length > 0 && saveTokenWait && saveTokenWait !== expectedSaveToken) {
                SetSettingsLoaderStepState("read_payload", "active", "Waiting for other save request to finish.");
            } else {
                var pendingDetail = QOL.getSaveSettingsLoaderDetailForMessage(saveMsgWait) || "Running save pipeline.";
                SetSettingsLoaderStepState("read_payload", "active", pendingDetail);
            }
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        var hasTokenMatch = (expectedSaveToken.length === 0) || (saveTokenWait === expectedSaveToken);
        if (saveStateWait === "success" && hasTokenMatch) {
            if (!payloadDetectedAfterSave) {
                var saveVerifyHits = (Number(State.buildCategoryPayloadDefaultBootstrapSaveVerifyHits) || 0) + 1;
                State.buildCategoryPayloadDefaultBootstrapSaveVerifyHits = saveVerifyHits;
                TryCloseBrowseBuildsPopupForLoader(root);
                if (saveVerifyHits < 20) {
                    SetSettingsLoaderStepState("read_payload", "active", "Save reported success. Waiting for payload visibility.");
                    State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
                    return "wait";
                }
                SetSettingsLoaderStepState("read_payload", "active", "Save success did not expose payload. Retrying bootstrap save.");
                State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
                State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
                return "wait";
            }
            State.buildCategoryPayloadDefaultBootstrapSaveVerifyHits = 0;
            TryDismissBuildDeletePopup(root);
            TryCloseBrowseBuildsPopupForLoader(root);
            SetSettingsLoaderStepState("read_payload", "active", "Repair save complete. Waiting for shop UI.");
            State.buildCategoryPayloadHeroProbeStartedMs = nowMs;
            State.buildCategoryPayloadHeroProbeMisses = 0;
            State.buildCategoryPayloadHeroProbeStage = "bootstrap_post_save_shop_prompt";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        if (saveStateWait === "failed" && hasTokenMatch) {
            if ((Number(State.buildCategoryPayloadDefaultBootstrapRetries) || 0) >= BUILD_CATEGORY_PAYLOAD_BOOTSTRAP_MAX_RETRIES) {
                finalizeProbeFailure(accountId, "Save bootstrap failed.");
                return "wait";
            }
            SetSettingsLoaderStepState("read_payload", "active", "Save bootstrap failed; retrying.");
            State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        if (saveStateWait === "success" && !hasTokenMatch) {
            SetSettingsLoaderStepState("read_payload", "active", "Waiting for matching save result token.");
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        if (payloadDetectedAfterSave && saveStateWait !== "pending") {
            SetSettingsLoaderStepState("read_payload", "active", "Repair payload detected. Waiting for shop UI.");
            State.buildCategoryPayloadHeroProbeStartedMs = nowMs;
            State.buildCategoryPayloadHeroProbeMisses = 0;
            State.buildCategoryPayloadHeroProbeStage = "bootstrap_post_save_shop_prompt";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }

        if ((Number(State.buildCategoryPayloadDefaultBootstrapRetries) || 0) >= BUILD_CATEGORY_PAYLOAD_BOOTSTRAP_MAX_RETRIES) {
            finalizeProbeFailure(accountId, "Save bootstrap timed out.");
            return "wait";
        }
        SetSettingsLoaderStepState("read_payload", "active", "Waiting for save bootstrap result.");
        State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
        State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
        return "wait";
    }

    function handleBootstrapPostSaveShopPrompt(root, nowMs) {
        if (State.buildCategoryPayloadHeroProbeStage !== "bootstrap_post_save_shop_prompt") return null;
        SetSettingsLoaderStepState("switch_airheart", "done", "Airheart switch command sent.");
        EnsureStoragePayloadSourceVisibleReadOnly(root, nowMs);
        var postSaveConfirm = ConfirmBuildCategoryPayloadStorageHero(root, nowMs, false);
        if (!postSaveConfirm.confirmed) {
            if (State.buildCategoryPayloadCorruptRepairActive && !QOL.isHudClassActive(root, "gShopOpen")) {
                SetSettingsLoaderStepState("read_payload", "active", SETTINGS_LOADER_CORRUPT_PROMPT_DETAIL);
            } else {
                SetSettingsLoaderStepState("read_payload", "active", "Waiting for shop UI after repair save.");
            }
            SetSettingsLoaderStepState("confirm_airheart", "active", postSaveConfirm.detail || "Verifying Airheart context.");
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }
        if (!IsBuildCategoryPayloadSourceReady(root)) {
            SetSettingsLoaderStepState("confirm_airheart", "active", "Airheart confirmed. Waiting for build source.");
            SetSettingsLoaderStepState("read_payload", "active", "Waiting for build source after repair save.");
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS;
            return "wait";
        }
        SetSettingsLoaderStepState("confirm_airheart", "done", "Airheart context confirmed.");
        SetSettingsLoaderStepState("read_payload", "active", "Applying bootstrap payload.");
        State.buildCategoryPayloadHeroProbeStartedMs = nowMs;
        State.buildCategoryPayloadHeroProbeMisses = 0;
        State.buildCategoryPayloadHeroProbeStage = "scan_bootstrap_token";
        State.buildCategoryPayloadHeroProbeNextMs = nowMs;
        return "ready";
    }

    function finalizeProbeFailure(accountId, detail) {
        SetSettingsLoaderStepState("decode_payload", "skipped", detail || "Bootstrap unavailable.");
        SetSettingsLoaderStepState("apply_config", "skipped", "Config unchanged.");
        CompleteBuildCategoryPayloadHeroProbe(accountId, true, "failed", detail || "Bootstrap failed.");
    }

    function handleWaitStorage(root, accountId, nowMs) {
        if (State.buildCategoryPayloadHeroProbeStage !== "wait_storage") return null;
        EnsureStoragePayloadSourceVisibleReadOnly(root, nowMs);
        QOL.ensureStorageHeroFavoritesHeaderVisible(root, nowMs);
        var storageConfirm = ConfirmBuildCategoryPayloadStorageHero(root, nowMs);
        if (storageConfirm.confirmed) {
            State.buildCategoryPayloadAirheartHeaderConfirmed = true;
            State.buildCategoryPayloadAirheartHeaderConfirmedMs = nowMs;
            SetSettingsLoaderStepState("confirm_airheart", "done", "Airheart context confirmed.");
            SetSettingsLoaderStepState("read_payload", "active", "Reading storage build payload.");
            State.buildCategoryPayloadHeroProbeStage = "scan_storage";
            _TLog("load:ProbeStage", "wait_storage confirmed → scan_storage");
            return "ready";
        }
        SetSettingsLoaderStepState("confirm_airheart", "active", storageConfirm.detail || "Waiting for Airheart context.");
        SettingsLoaderDebugLogThrottled(
            "probe_wait_storage|" + (storageConfirm.source || "-") + "|" + (storageConfirm.confirmed ? "1" : "0") + "|" + String(Number(State.buildCategoryPayloadStorageConfirmHits) || 0),
            "probe_wait_storage confirmed=" + (storageConfirm.confirmed ? "1" : "0") +
                " source=" + (storageConfirm.source || "-") +
                " detail=\"" + (storageConfirm.detail || "") + "\"" +
                " hits=" + String(Number(State.buildCategoryPayloadStorageConfirmHits) || 0) +
                " " + SettingsLoaderBuildProbeSnapshot(root),
            nowMs
        );
        var switchStartMs = Number(State.buildCategoryPayloadHeroProbeSwitchStartMs) || nowMs;
        var waitElapsedMs = nowMs - switchStartMs;
        if (waitElapsedMs >= BUILD_CATEGORY_PAYLOAD_WAIT_STORAGE_USER_PROMPT_MS) {
            SetSettingsLoaderStepState("switch_airheart", "done", "Airheart switch command sent.");
            SetSettingsLoaderStepState("confirm_airheart", "active", "Airheart confirmation delayed. Running save bootstrap.");
            SetSettingsLoaderStepState("read_payload", "active", "Running save pipeline to create first-time payload.");
            State.buildCategoryPayloadDefaultBootstrapPostSavePrompt = false;
            State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
            State.buildCategoryPayloadHeroProbeNextMs = nowMs;
            _TLog("load:ProbeStage", "wait_storage timeout → bootstrap_via_save_enqueue elapsed=" + String(waitElapsedMs));
            SettingsLoaderDebugLog(
                "probe_wait_storage_bootstrap_save account=" + accountId +
                    " elapsedMs=" + String(waitElapsedMs)
            );
            SetSettingsLoaderDebugOverlayLine("bootstrap_save elapsedMs=" + String(waitElapsedMs));
            return "wait";
        }
        if (waitElapsedMs <= BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_MAX_WAIT_MS) {
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_POLL_MS;
            return "wait";
        }
        if (State.buildCategoryPayloadHeroProbeDidSwitch && IsBuildCategoryPayloadSourceReady(root)) {
            var timeoutSignal = ResolveBuildSaveStorageHeroSignal(root);
            if (!IsBuildCategoryPayloadStorageConflictStrong(timeoutSignal)) {
                var timeoutSource = timeoutSignal && timeoutSignal.source ? String(timeoutSignal.source) : "none";
                var timeoutHero = QOL.normalizeHeroId(timeoutSignal && timeoutSignal.hero ? timeoutSignal.hero : "");
                var timeoutSignature = QOL.confirmStorageHeroSignatureAbilities(root, nowMs, BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS);
                if (timeoutSignature.confirmed) {
                    SetSettingsLoaderStepState("confirm_airheart", "done", "Proceeding with signature-confirmed storage context.");
                    SetSettingsLoaderStepState("read_payload", "active", "Reading storage build payload.");
                    SettingsLoaderDebugLog(
                        "probe_wait_storage_timeout_degraded_scan account=" + accountId +
                        " hero=" + (timeoutHero || "-") +
                        " source=" + timeoutSource +
                        " signature=1"
                    );
                    SetSettingsLoaderDebugOverlayLine(
                        "wait_storage_degraded_scan hero=" + (timeoutHero || "-") +
                        " source=" + timeoutSource +
                        " signature=1"
                    );
                    State.buildCategoryPayloadHeroProbeStage = "scan_storage";
                    _TLog("load:ProbeStage", "wait_storage timeout+signature → scan_storage (degraded)");
                    return "ready";
                }
                SetSettingsLoaderStepState("confirm_airheart", "active", timeoutSignature.detail || "Waiting for Airheart signature abilities.");
            }
        }
        // Timed out confirming Airheart. Retry later; do not read from non-storage hero context.
        SetSettingsLoaderStepState("confirm_airheart", "error", "Airheart confirmation timed out, retrying.");
        SettingsLoaderDebugLog(
            "probe_wait_storage_timeout account=" + accountId +
            " switchStartMs=" + String(switchStartMs) +
            " nowMs=" + String(nowMs) +
            " retries=" + String(Number(State.buildCategoryPayloadHeroProbeSwitchRetries) || 0)
        );
        SetSettingsLoaderDebugOverlayLine(
            "wait_storage_timeout retries=" + String(Number(State.buildCategoryPayloadHeroProbeSwitchRetries) || 0)
        );
        ResetBuildCategoryPayloadHeroProbeState();
        State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_PROBE_RETRY_DELAY_MS;
        return "wait";
    }

    function handleRepairCorruptShopPrompt(nowMs) {
        if (State.buildCategoryPayloadHeroProbeStage !== "repair_corrupt_shop_prompt") return false;
        SetSettingsLoaderStepState("switch_airheart", "done", "Airheart switch command sent.");
        SetSettingsLoaderStepState("confirm_airheart", "active", "Verifying Airheart context for repair.");
        SetSettingsLoaderStepState("read_payload", "active", "Corrupt payload detected. Running automatic repair.");
        State.buildCategoryPayloadDefaultBootstrapPostSavePrompt = false;
        State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
        State.buildCategoryPayloadHeroProbeNextMs = nowMs;
        return true;
    }

    function handleColdStartHeroSwitch(root, accountId, nowMs, cfg) {
        State.buildCategoryPayloadHeroProbeStartedMs = nowMs;
        SetSettingsLoaderStepState("start", "done", "Launch protocol started.");
        var returnHero = EnsureBuildCategoryPayloadProbeReturnHeroFallback();
        SettingsLoaderDebugLog(
            "probe_start account=" + accountId +
            " returnHero=" + (returnHero || "-") +
            " storageHero=" + BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID
        );
        SetSettingsLoaderDebugOverlayLine(
            "start account=" + accountId +
            " return=" + (returnHero || "-") +
            " storage=" + BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID
        );

        SetSettingsLoaderStepState("switch_airheart", "active", "Switching to Airheart.");
        var switched = QOL.selectHeroForBuildSave(BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID, "loader_switch_to_storage");
        if (!switched) {
            SetSettingsLoaderStepState("switch_airheart", "active", "Airheart switch unavailable, retrying.");
            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_PROBE_RETRY_DELAY_MS;
            return "wait";
        }

        SetSettingsLoaderStepState("switch_airheart", "done", "Airheart switch command sent.");
        SetSettingsLoaderStepState("confirm_airheart", "active", "Waiting for Airheart confirmation.");
        State.buildCategoryPayloadHeroProbeDidSwitch = true;
        State.buildCategoryPayloadHeroProbeStage = "wait_storage";
        State.buildCategoryPayloadHeroProbeSwitchStartMs = nowMs;
        State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_DELAY_MS;
        _TLog("load:ProbeStage", "hero switch done → wait_storage");
        return "wait";
    }

    function PrepareBuildCategoryPayloadHeroProbe(root, accountId, nowMs, cfg) {
        if (!accountId || accountId.length === 0) return "ready";
        TraceSettingsLoaderProbeHeartbeat(root, accountId, nowMs, "prepare");
        SettingsLoaderDebugLogThrottled(
            "probe_tick|" + accountId + "|" + (State.buildCategoryPayloadHeroProbeStage || "-") + "|" + String(Number(State.buildCategoryPayloadHeroProbeSwitchRetries) || 0),
            "probe_tick account=" + accountId +
                " stage=" + (State.buildCategoryPayloadHeroProbeStage || "-") +
                " doneFor=" + (State.buildCategoryPayloadHeroProbeDoneAccountId || "-") +
                " retryAfter=" + String(Number(State.buildCategoryPayloadHeroProbeRetryAfterMs) || 0),
            nowMs
        );

        detectProbeAccountChange(accountId);

        var doneResult = handleProbeDoneCheck(accountId, nowMs);
        if (doneResult !== null) return doneResult;

        if (handleCorruptRepairInit(root, nowMs)) {}

        if (nowMs < (State.buildCategoryPayloadHeroProbeNextMs || 0)) {
            return "wait";
        }

        var stage = State.buildCategoryPayloadHeroProbeStage || "";
        if (stage.length === 0) {
            return handleColdStartHeroSwitch(root, accountId, nowMs, cfg);
        }

        var waitResult = handleWaitStorage(root, accountId, nowMs);
        if (waitResult !== null) return waitResult;
        if (handleRepairCorruptShopPrompt(nowMs)) return "wait";

        var bootstrapResult = handleBootstrapViaSaveEnqueue(root, accountId, nowMs, cfg);
        if (bootstrapResult !== null) return bootstrapResult;
        var saveWaitResult = handleBootstrapViaSaveWait(root, accountId, nowMs);
        if (saveWaitResult !== null) return saveWaitResult;
        var postSaveResult = handleBootstrapPostSaveShopPrompt(root, nowMs);
        if (postSaveResult !== null) return postSaveResult;

        if (stage === "scan_storage") {
            SetSettingsLoaderStepState("read_payload", "active", "Reading storage build payload.");
            return "ready";
        }

        if (stage === "scan_bootstrap_token") {
            SetSettingsLoaderStepState("read_payload", "active", "Applying bootstrap payload.");
            return "ready";
        }

        ResetBuildCategoryPayloadHeroProbeState();
        SettingsLoaderDebugLog("probe_unknown_stage_reset account=" + accountId + " stage=" + stage);
        return "ready";
    }

    // ── IsBuildCategoryPayloadSourceReady ──
    function IsBuildCategoryPayloadSourceReady(root) {
        if (!root || !root.FindChildTraverse) return false;
        var selectedBuild = GetCachedPanel("shopModsSelectedBuild");
        if (!selectedBuild) {
            selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
            SetCachedPanel("shopModsSelectedBuild", selectedBuild);
        }
        if (!selectedBuild) return false;
        if (selectedBuild.FindChildTraverse && selectedBuild.FindChildTraverse("BuildCategoryName")) return true;
        if (!selectedBuild.FindChildrenWithClassTraverse) return false;
        var categoryNames = selectedBuild.FindChildrenWithClassTraverse("CategoryName") || [];
        if (categoryNames.length > 0) return true;

        // Important: a build can exist with zero categories. Treat that as source-ready
        // so loader transitions into payload-miss/corrupt handling instead of endless shop bootstrap.
        var buildEntries = selectedBuild.FindChildrenWithClassTraverse("FavoriteBuildEntryContainer") || [];
        if (buildEntries.length > 0) return true;
        if (QOL.collectStorageBuildEntryPanels(root).length > 0) return true;
        return false;
    }

    // ── TryFindBuildCategoryPayloadText ──
    function TryFindBuildCategoryPayloadText(root) {
        if (!root) return "";
        var selectedBuild = GetCachedPanel("shopModsSelectedBuild");
        if (!selectedBuild) {
            selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
            SetCachedPanel("shopModsSelectedBuild", selectedBuild);
        }
        if (!selectedBuild) return "";

        var headerName = selectedBuild.FindChildTraverse ? selectedBuild.FindChildTraverse("BuildCategoryName") : null;
        var headerToken = QOL.extractBuildCategoryPayloadToken(ReadPanelTextMaybe(headerName));
        if (headerToken && headerToken.length > 0) return headerToken;

        if (selectedBuild.FindChildrenWithClassTraverse) {
            var categoryNames = selectedBuild.FindChildrenWithClassTraverse("CategoryName") || [];
            for (var classIdx = 0; classIdx < categoryNames.length; classIdx++) {
                var token = QOL.extractBuildCategoryPayloadToken(ReadPanelTextMaybe(categoryNames[classIdx]));
                if (token && token.length > 0) return token;
            }

            // Scan visible build-entry rows/titles as a fallback so payloads can be discovered
            // even when the selected build panel is stale or not the entry that contains token text.
            var visibleEntryClasses = ["FavoriteBuildEntryContainer", "SelectedBuildName", "BuildName"];
            for (var entryClassIdx = 0; entryClassIdx < visibleEntryClasses.length; entryClassIdx++) {
                var panels = selectedBuild.FindChildrenWithClassTraverse(visibleEntryClasses[entryClassIdx]) || [];
                for (var panelIdx = 0; panelIdx < panels.length; panelIdx++) {
                    var deepToken = QOL.extractBuildCategoryPayloadToken(ReadPanelTextDeepMaybe(panels[panelIdx], 48));
                    if (deepToken && deepToken.length > 0) return deepToken;
                }
            }
        }

        // Fallback: when build browser is rendered outside ShopModsSelectedBuild, scan
        // visible build-entry rows from all reachable build UI roots.
        var entryPanels = QOL.collectStorageBuildEntryPanels(root, true);
        for (var entryPanelIdx = 0; entryPanelIdx < entryPanels.length; entryPanelIdx++) {
            var entryToken = QOL.extractBuildCategoryPayloadToken(ReadPanelTextDeepMaybe(entryPanels[entryPanelIdx], 56));
            if (entryToken && entryToken.length > 0) return entryToken;
        }

        var scanned = 0;
        var stack = [selectedBuild];
        while (stack.length > 0 && scanned < BUILD_CATEGORY_PAYLOAD_TEXT_SCAN_MAX_PANELS) {
            var panel = stack.pop();
            if (!panel) continue;
            scanned++;

            var panelToken = QOL.extractBuildCategoryPayloadToken(ReadPanelTextMaybe(panel));
            if (panelToken && panelToken.length > 0) return panelToken;

            var childCount = 0;
            try {
                childCount = panel.GetChildCount ? panel.GetChildCount() : 0;
            } catch (e2) {
                childCount = 0;
            }
            for (var i = 0; i < childCount; i++) {
                var child = null;
                try {
                    child = panel.GetChild(i);
                } catch (e3) {
                    child = null;
                }
                if (child) stack.push(child);
            }
        }

        return "";
    }

    // ── TryParseBuildCategoryPayloadConfig ──
    function TryParseBuildCategoryPayloadConfig(rawText) {
        var payloadToken = QOL.extractBuildCategoryPayloadToken(rawText);
        if (!payloadToken || payloadToken.length === 0) {
            return { ok: false, payload: "", error: "missing_payload" };
        }
        var tokenMatch = payloadToken.match(BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX);
        if (!tokenMatch || !tokenMatch[1] || !tokenMatch[2]) {
            return { ok: false, payload: payloadToken, error: "invalid_prefix" };
        }
        var schemaSemver = String(tokenMatch[1] || "").replace(/-/g, ".");
        // Guard: if the schema registry is empty (e.g. QOL_COMPACT_SCHEMA_REGISTRY
        // global was not set), we cannot decode ANY payload. Apply defaults without
        // triggering corrupt repair — the stored data is valid, we just can't read it.
        var registryKeys = 0;
        for (var _rk in BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY) {
            if (BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY.hasOwnProperty(_rk)) registryKeys++;
        }
        if (registryKeys === 0) {
            return { ok: false, payload: payloadToken, error: "empty_registry" };
        }
        if (!schemaSemver || !BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY.hasOwnProperty(schemaSemver)) {
            return { ok: false, payload: payloadToken, error: "unsupported_schema" };
        }
        var compactCandidate = String(tokenMatch[2] || "").replace(/\s+/g, "");
        if (!compactCandidate || compactCandidate.length === 0) {
            return { ok: false, payload: payloadToken, error: "empty_payload" };
        }
        try {
            var compactBinary = QOL.buildPayloadFromBase64Url(compactCandidate);
            var parsed = QOL.deserializeBuildPayloadCompact(compactBinary, schemaSemver);
            return { ok: true, payload: payloadToken, parsed: parsed, schemaVersion: schemaSemver };
        } catch (err) {
            var msg = (err && err.message) ? String(err.message) : String(err || "parse_error");
            return { ok: false, payload: payloadToken, error: msg };
        }
    }

    // ── MaybeSuppressBuildCategoryPayloadForActiveMatch ──
    function MaybeSuppressBuildCategoryPayloadForActiveMatch(root, nowMs) {
        if (!QOL.isStartupLoaderInActiveMatchContext(root)) return false;
        SettingsLoaderDebugLogThrottled(
            "payload_override_skip_active_match|" + String(State.settingsLoaderSessionActive ? 1 : 0) + "|" + String(State.settingsLoaderSessionCompleted ? 1 : 0) + "|" + (State.buildCategoryPayloadHeroProbeStage || "-"),
            "payload_override skip: active match/reconnect context; startup loader suppressed",
            nowMs
        );
        SuppressStartupLoaderForSession(root, "", "active_match_suppressed", nowMs);
        return true;
    }

    // ── ShouldRunBuildCategoryPayloadOverride ──
    function ShouldRunBuildCategoryPayloadOverride(root, nowMs) {
        if (BUILD_LOADER_TEMP_DISABLED) {
            ResetBuildLoaderForTempDisable(root);
            return false;
        }
        if (!BUILD_CATEGORY_PAYLOAD_ENABLED) return false;
        if (State.buildCategoryPayloadStartupSuppressedForSession) return false;

        var probeStageActive = !!(State.buildCategoryPayloadHeroProbeStage && State.buildCategoryPayloadHeroProbeStage.length > 0);
        var immediateWakeNeeded =
            !!State.settingsLoaderSessionActive ||
            !!State.settingsLoaderSessionCompleted ||
            !!State.buildCategoryPayloadCorruptRepairActive ||
            probeStageActive;

        var activeMatchChecked = false;
        if (!State.buildCategoryPayloadDormant || immediateWakeNeeded) {
            activeMatchChecked = true;
            if (MaybeSuppressBuildCategoryPayloadForActiveMatch(root, nowMs)) return false;
        }

        if (!State.buildCategoryPayloadDormant) return true;

        var repairWakePending = false;
        if (ShouldCheckDormantBuildCategoryPayloadWake(nowMs)) {
            repairWakePending = QOL.isStartupCorruptRepairPending(root);
        }
        var wakeNeeded =
            immediateWakeNeeded ||
            repairWakePending;

        if (wakeNeeded) {
            if (!activeMatchChecked && MaybeSuppressBuildCategoryPayloadForActiveMatch(root, nowMs)) return false;
            State.buildCategoryPayloadDormant = false;
            State.buildCategoryPayloadDormantReason = "";
            State.buildCategoryPayloadDormantWakeCheckNextMs = 0;
            return true;
        }
        return false;
    }

    // ── ShouldCheckDormantBuildCategoryPayloadWake ──
    function ShouldCheckDormantBuildCategoryPayloadWake(nowMs) {
        var now = Number(nowMs) || 0;
        if (now <= 0) now = Date.now ? Date.now() : (new Date()).getTime();
        if (now < (Number(State.buildCategoryPayloadDormantWakeCheckNextMs) || 0)) return false;
        State.buildCategoryPayloadDormantWakeCheckNextMs = now + BUILD_CATEGORY_PAYLOAD_SCAN_INTERVAL_MS;
        return true;
    }

    // ── ApplyBuildCategoryPayloadOverride ──
    // ── Helpers extracted from ApplyBuildCategoryPayloadOverride ──

    function handlePayloadDisabled() {
        if (BUILD_CATEGORY_PAYLOAD_ENABLED) return false;
        State.buildCategoryPayloadNextScanMs = 0;
        State.buildCategoryPayloadLastAppliedAccountId = "";
        State.buildCategoryPayloadLastAppliedText = "";
        State.buildCategoryPayloadLastParseErrorKey = "";
        State.buildCategoryPayloadHeroProbeAccountId = "";
        State.buildCategoryPayloadHeroProbeDoneAccountId = "";
        State.buildCategoryPayloadHeroProbeRetryAfterMs = 0;
        State.buildCategoryPayloadHeroProbeMisses = 0;
        State.buildCategoryPayloadDoneRearmNextMs = 0;
        State.buildCategoryPayloadDoneRearmAttempts = 0;
        State.buildCategoryPayloadStartupConsumedAccountId = "";
        State.buildCategoryPayloadStartupConsumedResult = "";
        State.buildCategoryPayloadDormant = false;
        State.buildCategoryPayloadDormantReason = "";
        State.buildCategoryPayloadDormantWakeCheckNextMs = 0;
        State.buildCategoryPayloadPostSwitchShopPulseDone = false;
        ResetBuildCategoryPayloadProbeInitState();
        ResetBuildCategoryPayloadHeroProbeState();
        ResetSettingsLoaderSession(true);
        SettingsLoaderDebugLog("payload_override_disabled");
        return true;
    }

    function buildAppliedConfig(rawCfg, parsedResult) {
        var rawNow = (rawCfg === undefined || rawCfg === null) ? "" : String(rawCfg);
        var rawObj = {};
        if (rawNow && rawNow.length > 0) {
            try { var u4 = UnwrapConfigFromStorage(rawNow); rawObj = (u4 && u4.config) ? u4.config : {}; } catch (e4) { rawObj = {}; }
        }

        var defaults = QOL.buildDefaultConfig();
        var appliedObj = {};
        for (var rawKey in rawObj) {
            appliedObj[rawKey] = rawObj[rawKey];
        }
        for (var defKey in defaults) {
            appliedObj[defKey] = defaults[defKey];
        }
        for (var parsedKey in parsedResult.parsed) {
            appliedObj[parsedKey] = parsedResult.parsed[parsedKey];
        }

        if (rawObj.hasOwnProperty("DRAG_ENABLED")) {
            appliedObj.DRAG_ENABLED = rawObj.DRAG_ENABLED;
        }
        if (rawObj.hasOwnProperty("PREVIEWS_ENABLED")) {
            appliedObj.PREVIEWS_ENABLED = rawObj.PREVIEWS_ENABLED;
        }
        NormalizeNeutralCampTierConfig(appliedObj, parsedResult.parsed);
        NormalizeAmmoScaleConfig(appliedObj, parsedResult.parsed);
        NormalizeVoiceTypeConfig(appliedObj);
        NormalizeHealthbarTypeConfig(appliedObj, parsedResult.parsed);
        NormalizeColorWarningConfig(appliedObj, parsedResult.parsed);
        NormalizeEnemyColorWarningConfig(appliedObj, parsedResult.parsed);
        NormalizeAllyColorWarningConfig(appliedObj, parsedResult.parsed);
        NormalizeTopbarEnemyHpWarningConfig(appliedObj, parsedResult.parsed);
        NormalizeTopbarAllyHpWarningConfig(appliedObj, parsedResult.parsed);
        NormalizeCompassSpeedSchemaMigration(appliedObj, parsedResult.parsed, parsedResult.schemaVersion || BUILD_CATEGORY_LATEST_COMPACT_SEMVER);
        NormalizeLanguageSchemaMigration(appliedObj, parsedResult.parsed, parsedResult.schemaVersion || BUILD_CATEGORY_LATEST_COMPACT_SEMVER);
        return appliedObj;
    }

    function ApplyBuildCategoryPayloadOverride(root, cfg, nowMs, rawCfg) {
        if (!cfg) return cfg;
        State.buildCategoryPayloadDormant = false;
        State.buildCategoryPayloadDormantReason = "";
        if (handlePayloadDisabled()) return cfg;

        if (State.buildCategoryPayloadStartupSuppressedForSession) {
            SettingsLoaderDebugLogThrottled(
                "payload_override_skip_session_suppressed|" + (State.buildCategoryPayloadStartupSuppressedAccountId || "-") + "|" + (State.buildCategoryPayloadStartupSuppressedReason || "-"),
                "payload_override skip: startup loader suppressed for process session account=" +
                    (State.buildCategoryPayloadStartupSuppressedAccountId || "-") +
                    " reason=" + (State.buildCategoryPayloadStartupSuppressedReason || "-"),
                nowMs
            );
            State.buildCategoryPayloadDormant = true;
            State.buildCategoryPayloadDormantReason = "startup_suppressed_session";
            State.buildCategoryPayloadDormantWakeCheckNextMs = 0;
            return cfg;
        }

        if (QOL.isStartupLoaderInActiveMatchContext(root)) {
            var suppressedAccountId = GetAccountIdForBuildCategoryPayload(root);
            SettingsLoaderDebugLogThrottled(
                "payload_override_skip_active_match|" + String(State.settingsLoaderSessionActive ? 1 : 0) + "|" + String(State.settingsLoaderSessionCompleted ? 1 : 0) + "|" + (State.buildCategoryPayloadHeroProbeStage || "-"),
                "payload_override skip: active match/reconnect context; startup loader suppressed",
                nowMs
            );
            SuppressStartupLoaderForSession(root, suppressedAccountId, "active_match_suppressed", nowMs);
            return cfg;
        }

        var activeBuildSaveState = (root && root.GetAttributeString) ? String(root.GetAttributeString(BUILD_SAVE_STATE_ATTR, "")) : "";
        if (activeBuildSaveState === "pending") {
            // Avoid consuming transient category text while a save request is in-flight.
            SettingsLoaderDebugLogThrottled("payload_override_skip_buildsave_pending", "payload_override skip: build save pending", nowMs);
            return cfg;
        }

        var accountId = GetAccountIdForBuildCategoryPayload(root);
        if (!accountId || accountId.length === 0) {
            if (State.settingsLoaderSessionActive) {
                SetSettingsLoaderStepState("start", "active", "Waiting for account context.");
            }
            SettingsLoaderDebugLogThrottled("payload_override_no_account", "payload_override skip: no account context", nowMs);
            SetSettingsLoaderDebugOverlayLine("skip no account context");
            return cfg;
        }
        var startupConsumedForAccount =
            String(State.buildCategoryPayloadStartupConsumedAccountId || "") === accountId;
        var probeStageActive = !!(State.buildCategoryPayloadHeroProbeStage && State.buildCategoryPayloadHeroProbeStage.length > 0);
        // $.persistentStorage confirmed absent — Airheart probe is always needed on startup.
        if (
            startupConsumedForAccount &&
            !State.settingsLoaderSessionActive &&
            !State.buildCategoryPayloadCorruptRepairActive &&
            !probeStageActive
        ) {
            SettingsLoaderDebugLogThrottled(
                "payload_override_skip_startup_consumed|" + accountId,
                "payload_override skip: startup load already consumed account=" + accountId +
                    " result=" + String(State.buildCategoryPayloadStartupConsumedResult || "-"),
                nowMs
            );
            State.buildCategoryPayloadDormant = true;
            State.buildCategoryPayloadDormantReason = "startup_consumed";
            State.buildCategoryPayloadDormantWakeCheckNextMs = 0;
            return cfg;
        }
        SettingsLoaderDebugLogThrottled(
            "payload_override_account|" + accountId + "|" + (State.buildCategoryPayloadHeroProbeAccountId || "-") + "|" + (State.buildCategoryPayloadHeroProbeDoneAccountId || "-"),
            "payload_override account=" + accountId +
                " probeAccount=" + (State.buildCategoryPayloadHeroProbeAccountId || "-") +
                " probeDone=" + (State.buildCategoryPayloadHeroProbeDoneAccountId || "-"),
            nowMs
        );

        TryRearmBuildCategoryPayloadProbeIfDoneLocked(root, accountId, nowMs, cfg);
        QOL.beginSettingsLoaderSession(accountId, nowMs);

        var probeState = PrepareBuildCategoryPayloadHeroProbe(root, accountId, nowMs, cfg);
        _TLog("load:ProbeState", "state=" + probeState + " stage=" + (State.buildCategoryPayloadHeroProbeStage || "-") + " account=" + String(accountId || "").slice(0, 8));
        if (probeState !== "ready") {
            SettingsLoaderDebugLogThrottled(
                "payload_override_probe_wait|" + probeState + "|" + (State.buildCategoryPayloadHeroProbeStage || "-"),
                "payload_override waiting probeState=" + probeState + " stage=" + (State.buildCategoryPayloadHeroProbeStage || "-"),
                nowMs
            );
            return cfg;
        }

        var probeStage = String(State.buildCategoryPayloadHeroProbeStage || "");
        var shouldFinalizeStorageProbe = (probeStage === "scan_storage" || probeStage === "scan_bootstrap_token");
        if (!shouldFinalizeStorageProbe) {
            // Strict startup rule: consume payload only while actively scanning in storage-hero context.
            SettingsLoaderDebugLogThrottled(
                "payload_override_not_scan_storage|" + (State.buildCategoryPayloadHeroProbeStage || "-"),
                "payload_override ready-but-not-scan_storage stage=" + (State.buildCategoryPayloadHeroProbeStage || "-"),
                nowMs
            );
            return cfg;
        }
        var shouldRetryStorageProbe = false;
        var finalizeResultCode = "success";
        var finalizeResultDetail = "Payload applied.";

        function ReturnCfgWithProbe(nextCfg, finalizeDone) {
            if (shouldRetryStorageProbe) {
                DeferBuildCategoryPayloadHeroProbe(accountId, nowMs);
                shouldRetryStorageProbe = false;
                shouldFinalizeStorageProbe = false;
                return nextCfg;
            }
            if (shouldFinalizeStorageProbe) {
                SettingsLoaderDebugLog(
                    "payload_override_finalize finalizeDone=" + (finalizeDone !== false ? "1" : "0") +
                    " result=" + finalizeResultCode +
                    " detail=\"" + finalizeResultDetail + "\""
                );
                CompleteBuildCategoryPayloadHeroProbe(
                    accountId,
                    finalizeDone !== false,
                    finalizeResultCode,
                    finalizeResultDetail
                );
                shouldFinalizeStorageProbe = false;
            }
            return nextCfg;
        }

        var forceImmediateScan = shouldFinalizeStorageProbe;
        if (forceImmediateScan) {
            var probeStartedMs = Number(State.buildCategoryPayloadHeroProbeStartedMs) || nowMs;
            if ((nowMs - probeStartedMs) > BUILD_CATEGORY_PAYLOAD_HERO_PROBE_MAX_MS) {
                var timeoutSelectedBuild = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
                var timeoutHeaderCount = QOL.countBuildCategoryHeaders(timeoutSelectedBuild);
                var timeoutScanAdvances = Number(State.buildCategoryPayloadMissingScanAdvances) || 0;
                var timeoutEntryCount = QOL.collectStorageBuildEntryPanels(root, true).length;
                var timeoutBrowseOpen = QOL.isBrowseBuildsPopupOpen(root);
                var timeoutLooksStuckNoPayload =
                    probeStage === "scan_storage" &&
                    timeoutHeaderCount <= 0 &&
                    (timeoutScanAdvances > 0 || timeoutEntryCount > 0 || timeoutBrowseOpen);
                if (timeoutLooksStuckNoPayload) {
                    SetSettingsLoaderStepState("read_payload", "error", "Storage payload scan timed out. Running automatic repair.");
                    SetSettingsLoaderStepState("decode_payload", "skipped", "No payload decoded.");
                    SetSettingsLoaderStepState("apply_config", "skipped", "Config unchanged.");
                    SettingsLoaderDebugLog(
                        "payload_override storage timeout escalated to corrupt repair stage=" + probeStage +
                        " scanAdvances=" + String(timeoutScanAdvances) +
                        " entries=" + String(timeoutEntryCount) +
                        " browseOpen=" + (timeoutBrowseOpen ? "1" : "0") +
                        " headers=" + String(timeoutHeaderCount)
                    );
                    QOL.enterStartupCorruptRepairPrompt(root, nowMs, "missing_payload_timeout");
                    return cfg;
                }
                SetSettingsLoaderStepState("read_payload", "error", "Timed out waiting for storage payload. Retrying.");
                SetSettingsLoaderStepState("decode_payload", "skipped", "No payload decoded.");
                SetSettingsLoaderStepState("apply_config", "skipped", "Config unchanged.");
                SettingsLoaderDebugLog("payload_override storage payload wait timeout; deferring retry");
                shouldRetryStorageProbe = true;
                return ReturnCfgWithProbe(cfg, false);
            }
            SettingsLoaderDebugLogThrottled(
                "payload_scan_enter|" + (State.buildCategoryPayloadHeroProbeStage || "-") + "|" + String(Number(State.buildCategoryPayloadHeroProbeMisses) || 0),
                "payload_scan_enter stage=" + (State.buildCategoryPayloadHeroProbeStage || "-") +
                    " misses=" + String(Number(State.buildCategoryPayloadHeroProbeMisses) || 0) +
                    " " + SettingsLoaderBuildProbeSnapshot(root),
                nowMs
            );
            if (probeStage !== "scan_bootstrap_token" && !IsBuildCategoryPayloadSourceReady(root)) {
                // Launch path remains read-only: reveal source UI only, never create/save/modify builds.
                if (!EnsureStoragePayloadSourceVisibleReadOnly(root, nowMs)) {
                    var sourceBootstrapRetries = Number(State.buildCategoryPayloadSourceBootstrapRetries) || 0;
                    var selectedBuildForSource = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
                    var selectedHeaderCountForSource = QOL.countBuildCategoryHeaders(selectedBuildForSource);
                    var sourceEntriesVisible = QOL.collectStorageBuildEntryPanels(root, false).length;
                    var sourceEntriesTotal = QOL.collectStorageBuildEntryPanels(root, true).length;
                    var sourceEmptyByStructure = (selectedHeaderCountForSource <= 0 && sourceEntriesTotal <= 0);
                    if (
                        probeStage === "scan_storage" &&
                        sourceBootstrapRetries >= BUILD_CATEGORY_PAYLOAD_SOURCE_BOOTSTRAP_MAX_RETRIES &&
                        (QOL.isStorageBuildListEmpty(root) || sourceEmptyByStructure)
                    ) {
                        SetSettingsLoaderStepState("read_payload", "active", "No Airheart build source found. Running first-time save bootstrap.");
                        SetSettingsLoaderStepState("decode_payload", "skipped", "Waiting for bootstrap save.");
                        SetSettingsLoaderStepState("apply_config", "skipped", "Config unchanged until bootstrap completes.");
                        SettingsLoaderDebugLog(
                            "payload_override source bootstrap exhausted with empty build source; escalating to bootstrap_via_save_enqueue " +
                            "headers=" + String(selectedHeaderCountForSource) +
                            " entriesVisible=" + String(sourceEntriesVisible) +
                            " entriesTotal=" + String(sourceEntriesTotal)
                        );
                        State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
                        State.buildCategoryPayloadHeroProbeNextMs = nowMs;
                        return cfg;
                    }
                    SetSettingsLoaderStepState("read_payload", "active", "Waiting for build category payload source.");
                    State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_SCAN_WAIT_MS;
                    SettingsLoaderDebugLogThrottled(
                        "payload_override_wait_source_ready",
                        "payload_override waiting for payload source readiness " + SettingsLoaderBuildProbeSnapshot(root),
                        nowMs
                    );
                    return cfg;
                }
            }
            SetSettingsLoaderStepState(
                "read_payload",
                "active",
                probeStage === "scan_bootstrap_token" ? "Applying bootstrap payload." : "Reading build category payload."
            );
            ResetBuildCategoryPayloadReadOnlySourceBootstrapState();
            ResetBuildCategoryPayloadProbeInitState();
        }
        if (!forceImmediateScan) {
            if (nowMs < (State.buildCategoryPayloadNextScanMs || 0)) {
                return cfg;
            }
            State.buildCategoryPayloadNextScanMs = nowMs + BUILD_CATEGORY_PAYLOAD_SCAN_INTERVAL_MS;
        }

        if (State.buildCategoryPayloadLastAppliedAccountId !== accountId) {
            State.buildCategoryPayloadLastAppliedAccountId = accountId;
            State.buildCategoryPayloadLastAppliedText = "";
            State.buildCategoryPayloadLastParseErrorKey = "";
            State.buildCategoryPayloadHeroProbeMisses = 0;
            State.buildCategoryPayloadShopNotOpenResets = 0;
            State.buildCategoryPayloadDoneRearmAttempts = 0;
            ResetBuildCategoryPayloadReadOnlySourceBootstrapState();
            ResetBuildCategoryPayloadProbeInitState();
        }

        var payloadText = "";
        if (probeStage === "scan_bootstrap_token") {
            payloadText = QOL.extractBuildCategoryPayloadToken(State.buildCategoryPayloadDefaultBootstrapPayloadText || "");
        } else {
            payloadText = TryFindBuildCategoryPayloadText(root);
        }
        if (!payloadText || payloadText.length === 0) {
            _TLog("load:PayloadScan", "found=0 stage=" + probeStage);
            if (probeStage === "scan_bootstrap_token") {
                SetSettingsLoaderStepState("read_payload", "active", "Bootstrap payload unavailable, reading storage build payload.");
                State.buildCategoryPayloadHeroProbeStage = "scan_storage";
                State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_SCAN_WAIT_MS;
                return cfg;
            }
            if (shouldFinalizeStorageProbe) {
                State.buildCategoryPayloadHeroProbeMisses += 1;
                if (probeStage === "scan_storage") {
                    var scanAdvances = Number(State.buildCategoryPayloadMissingScanAdvances) || 0;
                    if (scanAdvances < BUILD_CATEGORY_PAYLOAD_MISSING_SCAN_MAX_ADVANCES) {
                        var nextBuildSelect = TrySelectNextStorageBuildEntry(root);
                        if ((!nextBuildSelect || !nextBuildSelect.ok) && scanAdvances === 0) {
                            nextBuildSelect = TrySelectFirstStorageBuildEntry(root);
                        }
                        if (nextBuildSelect && nextBuildSelect.ok) {
                            State.buildCategoryPayloadMissingScanAdvances = scanAdvances + 1;
                            SetSettingsLoaderStepState(
                                "read_payload",
                                "active",
                                "Payload not found in selected build. Scanning next build (" +
                                    String(State.buildCategoryPayloadMissingScanAdvances) + "/" +
                                    String(BUILD_CATEGORY_PAYLOAD_MISSING_SCAN_MAX_ADVANCES) + ")."
                            );
                            State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_SCAN_WAIT_MS;
                            return cfg;
                        }
                    }
                }
                if (State.buildCategoryPayloadHeroProbeMisses < BUILD_CATEGORY_PAYLOAD_MISSING_SCAN_MAX_ADVANCES) {
                    SetSettingsLoaderStepState("read_payload", "active", "Payload not visible yet. Retrying.");
                    State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_SCAN_WAIT_MS;
                    return cfg;
                }
                // Guard: before triggering destructive corrupt repair, check if the
                // shop UI is actually ready. If the shop hasn't opened yet, the payload
                // may simply not be visible — this is a UI timing issue, not data
                // corruption. Deleting all Airheart builds would destroy valid config.
                // Cap shop-not-open resets to prevent infinite probe defer loops when
                // gShopOpen class is never detected (e.g. during game state transitions).
                var shopNotOpenResets = Number(State.buildCategoryPayloadShopNotOpenResets) || 0;
                var shopIsOpen = QOL.isHudClassActive(root, "gShopOpen");
                if (!shopIsOpen) {
                    shopNotOpenResets += 1;
                    State.buildCategoryPayloadShopNotOpenResets = shopNotOpenResets;
                    if (shopNotOpenResets <= BUILD_CATEGORY_PAYLOAD_SHOP_NOT_OPEN_MAX_RESETS) {
                        SetSettingsLoaderStepState("read_payload", "active", "Shop not open yet; waiting before scanning for payload. (" + String(shopNotOpenResets) + "/" + String(BUILD_CATEGORY_PAYLOAD_SHOP_NOT_OPEN_MAX_RESETS) + ")");
                        State.buildCategoryPayloadHeroProbeMisses = 0;
                        State.buildCategoryPayloadHeroProbeNextMs = nowMs + BUILD_CATEGORY_PAYLOAD_HERO_SCAN_WAIT_MS;
                        return cfg;
                    }
                    // Max resets exceeded — the shop is either already open (gShopOpen class
                    // not detected on checked panels) or will never open. Skip corrupt repair
                    // and apply defaults instead of looping forever.
                    SettingsLoaderDebugLog(
                        "payload_override shop_not_open max resets reached (" + String(shopNotOpenResets) + "); giving up and applying defaults"
                    );
                    SetSettingsLoaderDebugOverlayLine("shop guard exhausted; applying defaults");
                } else {
                    State.buildCategoryPayloadShopNotOpenResets = 0;
                }
                // Only enter corrupt repair if the shop is actually open (payload is
                // genuinely missing, not just invisible due to UI timing).
                if (shopIsOpen) {
                    SettingsLoaderDebugLog(
                        "payload_override missing payload max misses reached; entering corrupt repair prompt misses=" +
                            String(Number(State.buildCategoryPayloadHeroProbeMisses) || 0)
                    );
                    QOL.enterStartupCorruptRepairPrompt(root, nowMs, "missing_payload");
                    return cfg;
                }
                // Shop guard exhausted — fall through to the "no payload" default path.
            }
            SetSettingsLoaderStepState("read_payload", "done", "No payload found in storage build.");
            SetSettingsLoaderStepState("decode_payload", "skipped", "Nothing to decode.");
            SetSettingsLoaderStepState("apply_config", "skipped", "Config unchanged.");
            SetBuildCategoryPayloadProbeReturnHeroFromConfig(null, "base_default_hero");
            finalizeResultCode = "default";
            finalizeResultDetail = "No payload found. Kept current/default config.";
            SettingsLoaderDebugLog("payload_override no payload token found in storage build");
            SetSettingsLoaderDebugOverlayLine("payload missing in storage build");
            if (!_startupConfigDefaultDiagLogged) {
                _startupConfigDefaultDiagLogged = true;
                $.Msg("[QOLLock][DIAG][load] Startup config: no build payload found, using defaults. (Did you save settings in a previous session?)");
            }
            return ReturnCfgWithProbe(cfg, true);
        }
        SetSettingsLoaderStepState("read_payload", "done", "Payload token found.");
        _TLog("load:PayloadFound", "len=" + String(payloadText.length));
        SettingsLoaderDebugLogThrottled(
            "payload_token_found|" + String(payloadText.length) + "|" + String(payloadText.slice(0, 16)),
            "payload_token_found len=" + String(payloadText.length) +
                " head=\"" + String(payloadText.slice(0, 24)) + "\"" +
                " " + SettingsLoaderBuildProbeSnapshot(root),
            nowMs
        );
        if (payloadText === State.buildCategoryPayloadLastAppliedText) {
            SetStartupCorruptRepairPending(root, false);
            SetSettingsLoaderStepState("decode_payload", "done", "Payload unchanged.");
            SetSettingsLoaderStepState("apply_config", "done", "Using cached/applied config.");
            SetBuildCategoryPayloadProbeReturnHeroFromPayloadToken(payloadText);
            finalizeResultCode = "success";
            finalizeResultDetail = "Payload unchanged. Using cached config.";
            SettingsLoaderDebugLog("payload_override token unchanged; using cached config");
            SetSettingsLoaderDebugOverlayLine("payload unchanged; cached config");
            return ReturnCfgWithProbe(cfg, true);
        }

        SetSettingsLoaderStepState("decode_payload", "active", "Decoding payload.");
        var parsedResult = TryParseBuildCategoryPayloadConfig(payloadText);
        _TLog("load:ParseResult", "ok=" + (parsedResult.ok ? "1" : "0") + " schema=" + (parsedResult.schemaVersion || "-") + " error=" + (parsedResult.error || "-"));
        if (!parsedResult.ok || !parsedResult.parsed) {
            var errorKey = accountId + "|" + payloadText + "|" + (parsedResult.error || "parse_error");
            State.buildCategoryPayloadLastParseErrorKey = errorKey;
            // Schema/registry errors are NOT data corruption — the stored payload
            // is valid but this code version can't decode it. Apply defaults without
            // deleting Airheart builds (which would destroy the user's config).
            var isNonCorruptError = (parsedResult.error === "unsupported_schema" || parsedResult.error === "empty_registry");
            if (shouldFinalizeStorageProbe && !isNonCorruptError) {
                State.buildCategoryPayloadHeroProbeMisses += 1;
                if (State.buildCategoryPayloadHeroProbeMisses < BUILD_CATEGORY_PAYLOAD_HERO_PROBE_MAX_MISSES) {
                    SetSettingsLoaderStepState("decode_payload", "active", "Decode failed, retrying.");
                    shouldRetryStorageProbe = true;
                    return ReturnCfgWithProbe(cfg, false);
                }
                SettingsLoaderDebugLog(
                    "payload_override decode_failed max misses reached; entering corrupt repair prompt error=\"" +
                    String(parsedResult.error || "unknown") +
                    "\" misses=" + String(Number(State.buildCategoryPayloadHeroProbeMisses) || 0)
                );
                QOL.enterStartupCorruptRepairPrompt(root, nowMs, "decode_failed");
                return cfg;
            }
            SetSettingsLoaderStepState("decode_payload", "error", "Payload decode failed.");
            SetSettingsLoaderStepState("apply_config", "skipped", "Config unchanged.");
            SetBuildCategoryPayloadProbeReturnHeroFromConfig(null, "base_default_hero");
            finalizeResultCode = "default";
            finalizeResultDetail = "Payload decode failed. Kept current/default config.";
            if (!_startupConfigDefaultDiagLogged) {
                _startupConfigDefaultDiagLogged = true;
                $.Msg("[QOLLock][DIAG][load] Startup config: payload found but decode FAILED — " + (parsedResult.error || "unknown") + ". Using defaults.");
            }
            SettingsLoaderDebugLog(
                "payload_override decode_failed error=\"" + String(parsedResult.error || "unknown") +
                "\" misses=" + String(Number(State.buildCategoryPayloadHeroProbeMisses) || 0) +
                " tokenHead=\"" + String(payloadText.slice(0, 24)) + "\"" +
                " " + SettingsLoaderBuildProbeSnapshot(root)
            );
            SetSettingsLoaderDebugOverlayLine(
                "decode failed: " + String(parsedResult.error || "unknown")
            );
            return ReturnCfgWithProbe(cfg, true);
        }
        State.buildCategoryPayloadLastParseErrorKey = "";
        SetSettingsLoaderStepState("decode_payload", "done", "Payload decoded.");
        SetSettingsLoaderStepState("apply_config", "active", "Applying decoded config.");

        var appliedObj = buildAppliedConfig(rawCfg, parsedResult);
        var appliedRaw = WrapConfigForStorage(appliedObj);
        var appliedWrite = WriteStorageConfigRawToUi(root, appliedRaw);
        var appliedRevision = Number(appliedWrite && appliedWrite.revision) || 0;
        SetStartupCorruptRepairPending(root, false);
        State.accountPresetRawOverride = appliedRaw;
        if (appliedRevision > 0 && State.accountPresetBootstrapDone) {
            State.accountPresetLastUserEditRev = appliedRevision;
        }
        State.buildCategoryPayloadLastAppliedAccountId = accountId;
        State.buildCategoryPayloadLastAppliedText = payloadText;
        State.buildCategoryPayloadHeroProbeMisses = 0;
        State.buildCategoryPayloadShopNotOpenResets = 0;
        State.buildCategoryPayloadDoneRearmAttempts = 0;
        var payloadReturnHero = SetBuildCategoryPayloadProbeReturnHeroFromConfig(appliedObj, "payload_default_hero");
        SettingsLoaderDebugLog(
            "payload_override return hero resolved=" + payloadReturnHero +
            " source=" + (State.buildCategoryPayloadHeroProbeReturnHeroSource || "-")
        );
        SetSettingsLoaderDebugOverlayLine("payload return hero=" + payloadReturnHero);
        SetSettingsLoaderStepState("apply_config", "done", "Config applied.");
        SetSettingsLoaderStepState("return_hero", "active", "Finalizing and returning hero.");
        finalizeResultCode = "success";
        finalizeResultDetail = "Payload decoded and applied.";
        if (!_startupConfigLoadDiagLogged) {
            _startupConfigLoadDiagLogged = true;
            $.Msg("[QOLLock][DIAG][load] Startup config applied: source=build_payload account=" + accountId + " payloadLen=" + payloadText.length + " configKeys=" + Object.keys(appliedObj || {}).length);
        }
        SettingsLoaderDebugLog(
            "payload_override applied account=" + accountId +
            " payloadLen=" + String(payloadText.length)
        );
        SetSettingsLoaderDebugOverlayLine("payload applied len=" + String(payloadText.length));
        return ReturnCfgWithProbe(MergeConfig(appliedObj), true);
    }

    // ── ResetBuildCategoryPayloadHeroProbeState ──
    function ResetBuildCategoryPayloadHeroProbeState() {
        State.buildCategoryPayloadHeroProbeStage = "";
        State.buildCategoryPayloadHeroProbeNextMs = 0;
        State.buildCategoryPayloadHeroProbeDidSwitch = false;
        State.buildCategoryPayloadHeroProbeReturnHero = "";
        State.buildCategoryPayloadHeroProbeReturnHeroSource = "";
        State.buildCategoryPayloadHeroProbeStartedMs = 0;
        State.buildCategoryPayloadHeroProbeBootstrapStartedMs = 0;
        State.buildCategoryPayloadHeroProbeSwitchStartMs = 0;
        State.buildCategoryPayloadHeroProbeSwitchRetries = 0;
        State.buildCategoryPayloadHeroProbeScanStartedMs = 0;
        State.buildCategoryPayloadHeroProbeShopProbeTried = false;
        State.buildCategoryPayloadStorageConfirmSig = "";
        State.buildCategoryPayloadStorageConfirmHits = 0;
        State.storageHeroSignatureConfirmSig = "";
        State.storageHeroSignatureConfirmHits = 0;
        State.storageHeroSignatureLastDetail = "";
        State.buildCategoryPayloadMissingScanAdvances = 0;
        State.buildCategoryPayloadCorruptRepairActive = false;
        State.buildCategoryPayloadCorruptRepairStartedMs = 0;
        State.buildCategoryPayloadCorruptRepairCleared = false;
        State.buildCategoryPayloadCorruptRepairClearRetries = 0;
        State.buildCategoryPayloadCorruptRepairClearNextMs = 0;
        State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
        State.buildCategoryPayloadCorruptRepairBrowseReady = false;
        State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
        State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
        State.buildCategoryPayloadCorruptRepairPostClearUntilMs = 0;
        State.buildCategoryPayloadShopOpenActionNextMs = 0;
        State.buildCategoryPayloadFavoritesActionNextMs = 0;
        State.buildCategoryPayloadBrowseActionNextMs = 0;
        State.buildCategoryPayloadPromptEscClosed = false;
        State.buildCategoryPayloadPostSavePromptFallbackUsed = false;
        State.buildCategoryPayloadAirheartHeaderConfirmed = false;
        State.buildCategoryPayloadAirheartHeaderConfirmedMs = 0;
        ResetStartupDefaultPayloadBootstrapState();
        ResetBuildCategoryPayloadReadOnlySourceBootstrapState();
        ResetBuildCategoryPayloadProbeInitState();
    }

    // ── ResetBuildCategoryPayloadReadOnlySourceBootstrapState ──
    function ResetBuildCategoryPayloadReadOnlySourceBootstrapState() {
        State.buildCategoryPayloadSourceBootstrapStage = "";
        State.buildCategoryPayloadSourceBootstrapNextMs = 0;
        State.buildCategoryPayloadSourceBootstrapRetries = 0;
    }

    // ── ResetBuildCategoryPayloadProbeInitState ──
    function ResetBuildCategoryPayloadProbeInitState() {
        State.buildCategoryPayloadHeroProbeInitAttempted = false;
        State.buildCategoryPayloadHeroProbeInitStage = "";
        State.buildCategoryPayloadHeroProbeInitNextMs = 0;
        State.buildCategoryPayloadHeroProbeInitRetries = 0;
        State.buildCategoryPayloadHeroProbeInitCreateAttempts = 0;
        State.buildCategoryPayloadHeroProbeInitCreateVerifyUntilMs = 0;
    }

    // ── Bridge: QOL exports ──
    QOL.applyBuildCategoryPayloadOverride = ApplyBuildCategoryPayloadOverride;
    QOL.shouldRunBuildCategoryPayloadOverride = ShouldRunBuildCategoryPayloadOverride;
    QOL.prepareBuildCategoryPayloadHeroProbe = PrepareBuildCategoryPayloadHeroProbe;
    QOL.completeBuildCategoryPayloadHeroProbe = CompleteBuildCategoryPayloadHeroProbe;
    QOL.resetBuildCategoryPayloadHeroProbeState = ResetBuildCategoryPayloadHeroProbeState;
    QOL.resetBuildCategoryPayloadReadOnlySourceBootstrapState = ResetBuildCategoryPayloadReadOnlySourceBootstrapState;
    QOL.tryFindBuildCategoryPayloadText = TryFindBuildCategoryPayloadText;
    QOL.tryParseBuildCategoryPayloadConfig = TryParseBuildCategoryPayloadConfig;
    QOL.getAccountIdForBuildCategoryPayload = GetAccountIdForBuildCategoryPayload;
    QOL.confirmBuildCategoryPayloadStorageHero = ConfirmBuildCategoryPayloadStorageHero;
    QOL.tryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader = TryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader;
    QOL.resetBuildCategoryPayloadProbeInitState = ResetBuildCategoryPayloadProbeInitState;
    QOL.shouldRunBuildCategoryPayloadUiAction = ShouldRunBuildCategoryPayloadUiAction;
    QOL.isBuildCategoryPayloadSourceReady = IsBuildCategoryPayloadSourceReady;

    // ── Registration ──
    QOL.register("buildLoad", {
        configKeys: [],
        bucket: 0, phase: -1,
        gate: function(cfg) { return true; },
        update: function(root, cfg, nowMs) {
            // Load probe is driven by ApplyBuildCategoryPayloadOverride from ql_core.js
        },
        stateKeys: [
            "buildCategoryPayloadNextScanMs", "buildCategoryPayloadLastAppliedAccountId",
            "buildCategoryPayloadLastAppliedText", "buildCategoryPayloadLastParseErrorKey",
            "buildCategoryPayloadHeroProbeStage", "buildCategoryPayloadHeroProbeNextMs",
            "buildCategoryPayloadHeroProbeDidSwitch", "buildCategoryPayloadHeroProbeReturnHero",
            "buildCategoryPayloadHeroProbeReturnHeroSource", "buildCategoryPayloadHeroProbeAccountId",
            "buildCategoryPayloadHeroProbeDoneAccountId", "buildCategoryPayloadHeroProbeStartedMs",
            "buildCategoryPayloadHeroProbeBootstrapStartedMs", "buildCategoryPayloadHeroProbeSwitchStartMs",
            "buildCategoryPayloadHeroProbeSwitchRetries", "buildCategoryPayloadHeroProbeScanStartedMs",
            "buildCategoryPayloadHeroProbeShopProbeTried", "buildCategoryPayloadHeroProbeRetryAfterMs",
            "buildCategoryPayloadHeroProbeMisses", "buildCategoryPayloadMissingScanAdvances",
            "buildCategoryPayloadStorageConfirmSig", "buildCategoryPayloadStorageConfirmHits",
            "buildCategoryPayloadCorruptRepairActive", "buildCategoryPayloadCorruptRepairStartedMs",
            "buildCategoryPayloadCorruptRepairCleared", "buildCategoryPayloadCorruptRepairClearRetries",
            "buildCategoryPayloadCorruptRepairClearNextMs", "buildCategoryPayloadCorruptRepairClearEmptyHits",
            "buildCategoryPayloadCorruptRepairBrowseReady", "buildCategoryPayloadCorruptRepairLastDeleteTitle",
            "buildCategoryPayloadCorruptRepairSameTitleDeleteHits", "buildCategoryPayloadCorruptRepairPostClearUntilMs",
            "buildCategoryPayloadShopOpenActionNextMs", "buildCategoryPayloadFavoritesActionNextMs",
            "buildCategoryPayloadBrowseActionNextMs", "buildCategoryPayloadDoneRearmNextMs",
            "buildCategoryPayloadDoneRearmAttempts", "buildCategoryPayloadStartupConsumedAccountId",
            "buildCategoryPayloadStartupConsumedResult", "buildCategoryPayloadStartupSuppressedForSession",
            "buildCategoryPayloadStartupSuppressedReason", "buildCategoryPayloadStartupSuppressedAccountId",
            "buildCategoryPayloadDormant", "buildCategoryPayloadDormantReason",
            "buildCategoryPayloadDormantWakeCheckNextMs", "buildCategoryPayloadLoaderSessionCreateAttempts",
            "buildCategoryPayloadSourceBootstrapStage", "buildCategoryPayloadSourceBootstrapNextMs",
            "buildCategoryPayloadSourceBootstrapRetries", "buildCategoryPayloadSessionSwitchConsumed",
            "buildCategoryPayloadHeroProbeInitAttempted", "buildCategoryPayloadHeroProbeInitStage",
            "buildCategoryPayloadHeroProbeInitNextMs", "buildCategoryPayloadHeroProbeInitRetries",
            "buildCategoryPayloadHeroProbeInitCreateAttempts", "buildCategoryPayloadHeroProbeInitCreateVerifyUntilMs",
            "buildCategoryPayloadPostSwitchShopPulseDone", "buildCategoryPayloadPromptEscClosed",
            "buildCategoryPayloadDefaultBootstrapPayloadText", "buildCategoryPayloadDefaultBootstrapRetries",
            "buildCategoryPayloadDefaultBootstrapSaveToken", "buildCategoryPayloadDefaultBootstrapSaveVerifyHits",
            "buildCategoryPayloadDefaultBootstrapPostSavePrompt", "buildCategoryPayloadPostSavePromptFallbackUsed",
            "buildCategoryPayloadAirheartHeaderConfirmed", "buildCategoryPayloadAirheartHeaderConfirmedMs"
        ]
    });

    // ── Self-test ──
    try {
        if (typeof ApplyBuildCategoryPayloadOverride !== "function") throw new Error("ApplyBuildCategoryPayloadOverride missing");
        if (typeof PrepareBuildCategoryPayloadHeroProbe !== "function") throw new Error("PrepareBuildCategoryPayloadHeroProbe missing");
        if (typeof CompleteBuildCategoryPayloadHeroProbe !== "function") throw new Error("CompleteBuildCategoryPayloadHeroProbe missing");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + e.message);
    }
})();
