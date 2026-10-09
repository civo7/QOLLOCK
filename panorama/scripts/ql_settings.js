"use strict";

// QOL_DEFAULT_CONFIG always available — ql_shared_presets.js loads first in settings context
var MOD_CONFIG = Object.assign({}, QOL_DEFAULT_CONFIG);

// Phase 0.2: Publish config accessor for extracted modules.
// Extracted files call QOL.getSettingsConfig() at use time (not load time)
// to ensure they always see the current config. Read-only from their perspective.
QOL.getSettingsConfig = function() { return MOD_CONFIG; };

// hud_escape_menu.xml loads utilities and their shared namespace before settings.
var Utils = QOL.utils;
var SafeLog = QOL_UTILS.SafeLog;
var SafeGetAttribute = QOL_UTILS.SafeGetAttribute;
var SafeSetAttribute = QOL_UTILS.SafeSetAttribute;
var WarnLog = QOL_UTILS.WarnLog;

// Phase 2: Inject arcade dependencies (ql_arcade_games.js loads before ql_settings.js)

function FindRootPanel() {
    return QOL.core.panel.findRoot();
}

if (QOL.arcade && QOL.arcade.init) QOL.arcade.init({
    localize: LocalizeSettingsText,
    prepareModal: PrepareSettingsModalOpen,
    warnLog: WarnLog,
    findRoot: FindRootPanel
});

const RUNTIME_PRESET_ATTR = "QOL_RUNTIME_PRESET";
var STORAGE_KEY = (typeof STORAGE_KEY !== "undefined") ? STORAGE_KEY : ((typeof QOL_STORAGE_KEY !== "undefined") ? QOL_STORAGE_KEY : "Deadlock_Mod_Settings_v1");
var USER_EDIT_REV_ATTR = (typeof USER_EDIT_REV_ATTR !== "undefined") ? USER_EDIT_REV_ATTR : ((typeof QOL_USER_EDIT_REV_ATTR !== "undefined") ? QOL_USER_EDIT_REV_ATTR : "QOL_USER_EDIT_REV");
var LATEST_COMPACT_SEMVER = QOL_LATEST_COMPACT_SEMVER;
var DEFAULT_CONFIG = QOL_DEFAULT_CONFIG;
const MOD_DISPLAY_VERSION = QOL.VERSION;
var currentTab = "Support";
var gCurrentSettingsSectionTitle = "";
var currentSearchQuery = "";
var gSearchCollectMode = false;
var gSearchCollectState = null;
var gEnumSectionSyncCallbacks = [];
var gSearchResultRenderMode = false;
var gSearchSectionIndexCacheKey = "";
var gSearchSectionIndexCache = null;
var gConfigDiffLabelCacheKey = "";
var gConfigDiffLabelMap = null;
var gSettingsOpenGuardUntilMs = 0;
var gSettingsToggleDebounceUntilMs = 0;
var gRuntimeToggleState = {};
var gRuntimeSliderState = {};
var gRuntimeButtonGroupConfig = {};
var gRuntimeButtonGroupRefreshers = {};
var gRuntimeSliderResetters = {};
var gArcadeOnDeathSyncFns = [];
var gSettingsUiBuilt = false;
var gUserEditRevision = 0;
var gLastSavedConfigRaw = "";
var gConfigFeedbackLabel = null;
var gConfigFeedbackClearToken = 0;
var gSettingsListRefreshToken = 0;
var gSettingsListRefreshForcePending = false;
var gSettingsListLastRenderSig = "";
var gSettingsListRowSyncFns = [];
var gSettingsListRowSyncFnsBySig = {};
var gSettingsListActiveRenderSig = "";
var gSettingsListContentPanelBySig = {};
var gSettingsListSoftRefreshToken = 0;
var gSettingsListSearchModeActive = false;
var gSettingsTransitionWatchToken = 0;
var gSettingsTransitionWatchRunning = false;
var gSettingsOpenedInHideout = false;
var gSettingsTransitionCloseCooldownUntilMs = 0;
// Window match transition watchdog extracted to ui/window.js

// Cloud sync / shop build save & clear subsystem extracted to panorama/scripts/ui/cloud_sync.js

function ReadConfigRawFromStorage() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    var readRaw = function(target) {
        if (!target || !target.GetAttributeString) return "";
        try { return String(target.GetAttributeString(STORAGE_KEY, "") || ""); } catch (e0) { return ""; }
    };
    var parseRev = QOL_UTILS.ParseRevisionNumber;
    var readRev = function(target) {
        if (!target || !target.GetAttributeString) return 0;
        try { return parseRev(target.GetAttributeString(USER_EDIT_REV_ATTR, "")); } catch (e1) { return 0; }
    };
    var sources = [
        { raw: readRaw(panel), rev: readRev(panel), rank: 3 },
        { raw: readRaw(hud), rev: readRev(hud), rank: 2 },
        { raw: readRaw(root), rev: readRev(root), rank: 1 }
    ];
    var chosen = null;
    for (var i = 0; i < sources.length; i++) {
        var source = sources[i];
        if (!source.raw) continue;
        if (!chosen || source.rev > chosen.rev || (source.rev === chosen.rev && source.rank > chosen.rank)) {
            chosen = source;
        }
    }
    gUserEditRevision = Math.max(gUserEditRevision, sources[0].rev, sources[1].rev, sources[2].rev);
    var chosenRaw = chosen ? chosen.raw : "";
    if (chosenRaw && panel && panel.SetAttributeString && sources[0].raw !== chosenRaw) {
        panel.SetAttributeString(STORAGE_KEY, chosenRaw);
    }
    return chosenRaw;
}

// NormalizeConfig — canonical normalization / migration chain.
// Called from both SyncConfigFromStorage (on load) and SaveAndSync (on save).
// Normalize functions are provided by ql_config.js as file-scope globals.
function NormalizeConfig(config, parsed) {
    return QOL.normalizeConfigFields(config, parsed);
}

function SyncConfigFromStorage() {
    var raw = ReadConfigRawFromStorage();
    // $.persistentStorage confirmed absent — panel attrs are the only persistence.
    // QOL_DEFAULT_CONFIG always available — same context as ql_shared_presets.js
    var nextConfig = Object.assign({}, QOL_DEFAULT_CONFIG);
    if (raw && raw.length > 0) {
        try {
            nextConfig = QOL.parseStoredConfig(raw);
        } catch (e) { $.Msg("[QOLLock][WARN][config] SyncConfigFromStorage parse/merge failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
    MOD_CONFIG = nextConfig;
    gLastSavedConfigRaw = WrapConfigForStorage(MOD_CONFIG);
    // $.persistentStorage confirmed absent — statlocker state persists via panel attrs only.
    if (QOL.arcade) QOL.arcade.updateBridgePollerState();
}

// PersistStatlockerProfileState — config persistence is via Skyrunner builds.
// $.persistentStorage confirmed absent (2026-06-11). Exists as a no-op
// because SaveAndSync() → ApplyPresetConfig() calls it.
function PersistStatlockerProfileState(rawConfig, configObj) {
    // no-op: persistence handled by Skyrunner builds
}

function GetRuntimePresetName() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    if (root && root.GetAttributeString) {
        var rootValue = root.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (rootValue) return String(rootValue);
    }
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (e0) { hud = null; }
    if (hud && hud.GetAttributeString) {
        var hudValue = hud.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (hudValue) return String(hudValue);
    }
    if (panel && panel.GetAttributeString) {
        var localValue = panel.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (localValue) return String(localValue);
    }
    return "";
}

function SetRuntimePresetName(presetName) {
    var value = String(presetName || "");
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (e0) { hud = null; }
    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(RUNTIME_PRESET_ATTR, value);
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(RUNTIME_PRESET_ATTR, value);
    }
    if (hud && hud.SetAttributeString) {
        try { hud.SetAttributeString(RUNTIME_PRESET_ATTR, value); } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    }
}

function PublishPaletteColorBridge(configId, value) {
    var attrName = "";
    if (configId === "PLAYER_HEALTHBAR_ACCENT_COLOR") {
        attrName = PLAYER_HEALTHBAR_ACCENT_COLOR_ATTR;
    } else if (configId === "BOTTOM_BAR_WASH_COLOR") {
        attrName = BOTTOM_BAR_WASH_COLOR_ATTR;
    } else if (configId === "KEYBOARD_OVERLAY_WASH_COLOR") {
        attrName = KEYBOARD_OVERLAY_WASH_COLOR_ATTR;
    } else if (configId === "STAMINA_CHARGE_COLOR") {
        attrName = STAMINA_CHARGE_COLOR_ATTR;
    } else if (configId === "AMMO_TEXT_COLOR") {
        attrName = AMMO_TEXT_COLOR_ATTR;
    } else if (configId === "MINIMAP_ICON_COLOR") {
        attrName = MINIMAP_ICON_COLOR_ATTR;
    }
    if (!attrName) return "";
    const bridgeValue = String(QOL_UTILS.SupportsCustomColor(configId)
        ? QOL_UTILS.NormalizePaletteColorIndex(value)
        : Math.max(0, Math.min(29, Math.round(Number(value) || 0))));
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    try { if (panel && panel.SetAttributeString) panel.SetAttributeString(attrName, bridgeValue); } catch(ePanel) { WarnLog("settings", "op failed: " + (ePanel && ePanel.message ? ePanel.message : String(ePanel || ""))); }
    try { if (root && root.SetAttributeString) root.SetAttributeString(attrName, bridgeValue); } catch(eRoot) { WarnLog("settings", "op failed: " + (eRoot && eRoot.message ? eRoot.message : String(eRoot || ""))); }
    try { if (hud && hud.SetAttributeString) hud.SetAttributeString(attrName, bridgeValue); } catch(eHudSet) { WarnLog("settings", "op failed: " + (eHudSet && eHudSet.message ? eHudSet.message : String(eHudSet || ""))); }
    // $.persistentStorage confirmed absent — accent color persisted via panel attrs only.
    return bridgeValue;
}

function PublishPaletteColorBridges() {
    PublishPaletteColorBridge("PLAYER_HEALTHBAR_ACCENT_COLOR", MOD_CONFIG.PLAYER_HEALTHBAR_ACCENT_COLOR);
    PublishPaletteColorBridge("BOTTOM_BAR_WASH_COLOR", MOD_CONFIG.BOTTOM_BAR_WASH_COLOR);
    PublishPaletteColorBridge("KEYBOARD_OVERLAY_WASH_COLOR", MOD_CONFIG.KEYBOARD_OVERLAY_WASH_COLOR);
    PublishPaletteColorBridge("STAMINA_CHARGE_COLOR", MOD_CONFIG.STAMINA_CHARGE_COLOR);
    PublishPaletteColorBridge("AMMO_TEXT_COLOR", MOD_CONFIG.AMMO_TEXT_COLOR);
    PublishPaletteColorBridge("MINIMAP_ICON_COLOR", MOD_CONFIG.MINIMAP_ICON_COLOR);
}

// Settings publication owns one pending debounce, independently of durable CEF
// saves. Generation and source identity make uncancelled native callbacks inert.
const settingsSaveQueue = (() => {
    const delaySec = 0.3;
    let pending = null, generation = 0;
    const cancel = () => {
        generation++;
        const previous = pending; pending = null;
        if (previous && previous.handle !== null) {
            try { $.CancelScheduled(previous.handle); } catch (_) {}
        }
    };
    const isCurrent = record => {
        try {
            return QOL.core.panel.isAlive(record.context) && QOL.core.panel.isAlive(record.root) &&
                $.GetContextPanel() === record.context && FindRootPanel() === record.root;
        } catch (_) { return false; }
    };
    const mark = () => {
        cancel();
        const context = $.GetContextPanel(), root = FindRootPanel();
        if (!QOL.core.panel.isAlive(context) || !QOL.core.panel.isAlive(root)) return;
        QOL.core.persistence.markConfigEdited(root);
        const record = { context, root, handle: null, token: generation };
        pending = record;
        record.handle = $.Schedule(delaySec, () => {
            if (record.token !== generation || pending !== record) return;
            pending = null;
            if (isCurrent(record)) SaveAndSync();
        });
    };
    const flush = () => {
        if (!pending) return;
        const record = pending; cancel();
        if (isCurrent(record)) SaveAndSync();
    };
    return { mark, flush, cancel };
})();

function MarkConfigDirty() {
    settingsSaveQueue.mark();
}

// Flushes any pending debounced save immediately (e.g. before import/reset).
function FlushPendingSave() {
    settingsSaveQueue.flush();
}

function SaveAndSync() {
    settingsSaveQueue.cancel();
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var publisher = QOL.core.persistence;
    var hud = publisher.resolveHudPanel(root);
    NormalizeConfig(MOD_CONFIG, MOD_CONFIG);
    if (typeof globalThis.RefreshActivePresetConfigMarkerBeforeSave === "function") {
        globalThis.RefreshActivePresetConfigMarkerBeforeSave();
    }
    var data = WrapConfigForStorage(MOD_CONFIG);
    var alreadyPublished = data === gLastSavedConfigRaw;
    if (alreadyPublished) {
        var panels = [panel, root, hud];
        for (var i = 0; i < panels.length; i++) {
            var target = panels[i];
            if (!QOL.core.panel.isAlive(target) || SafeGetAttribute(target, STORAGE_KEY, "") !== data) {
                alreadyPublished = false;
                break;
            }
        }
    }
    if (alreadyPublished) {
        PublishPaletteColorBridges();
        return;
    }
    var publication = publisher.writeStorageConfigRawToUi(root, data, {
        extraPanels: [panel], minimumRevision: gUserEditRevision
    });
    gUserEditRevision = publication.revision;
    if (publication.complete) gLastSavedConfigRaw = data;
    if (!publication.acceptedCount) return;
    PersistStatlockerProfileState(data, MOD_CONFIG);
    PublishPaletteColorBridges();
    if (QOL.arcade) QOL.arcade.updateBridgePollerState();
    ApplySettingsThemeClasses(panel && panel.FindChildTraverse ? panel.FindChildTraverse("SettingsWindow") : null);
    QueueActivePresetHighlightRefresh(0.05);
    RefreshEnumSections();
}

// Window shell, navigation, list caching, and event listeners delegated to panorama/scripts/ui/window.js

SyncConfigFromStorage();
