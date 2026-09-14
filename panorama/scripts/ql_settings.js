"use strict";

// QOL_DEFAULT_CONFIG always available — ql_shared_presets.js loads first in settings context
var MOD_CONFIG = Object.assign({}, QOL_DEFAULT_CONFIG);

// Phase 0.2: Publish config accessor for extracted modules.
// Extracted files call QOL.getSettingsConfig() at use time (not load time)
// to ensure they always see the current config. Read-only from their perspective.
QOL.getSettingsConfig = function() { return MOD_CONFIG; };

// ── QOL.import() for settings context (ql_utils.js now loaded via hud_escape_menu.xml) ──
var _deps = QOL.import(["utils"]);
var Utils = _deps.utils;
var SafeLog = (Utils && Utils.SafeLog) ? Utils.SafeLog : function(fn, label) { try { return fn(); } catch(e) { return null; } };
var SafeGetAttribute = (Utils && Utils.SafeGetAttribute) ? Utils.SafeGetAttribute : function(p, a, d) { try { return String((p && p.GetAttributeString) ? p.GetAttributeString(a, d || "") : d || ""); } catch(e) { return d || ""; } };
var SafeSetAttribute = (Utils && Utils.SafeSetAttribute) ? Utils.SafeSetAttribute : function(p, a, v) { try { if (p && p.SetAttributeString) { p.SetAttributeString(a, String(v != null ? v : "")); return true; } } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); } return false; };
var WarnLog = (Utils && Utils.WarnLog) ? Utils.WarnLog : function(cat, msg) { $.Msg("[QOLLock][WARN][" + cat + "] " + msg); };

// Phase 2: Inject arcade dependencies (ql_arcade_games.js loads before ql_settings.js)

function FindRootPanel() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) {
        root = root.GetParent();
    }
    return root;
}

if (QOL.arcade && QOL.arcade.init) QOL.arcade.init({
    localize: LocalizeSettingsText,
    prepareModal: PrepareSettingsModalOpen,
    warnLog: WarnLog,
    findRoot: FindRootPanel
});

const DEFAULT_CONFIG = QOL_DEFAULT_CONFIG;

const HITMARKERS_RUNTIME_OPTIONS = [
    { label: "Off", command: "citadel_crosshair_hit_marker_duration 0.000000" },
    { label: "On", command: "citadel_crosshair_hit_marker_duration 0.100000" }
];
const AUDIO_BEEP_TEST_RUNTIME_OPTIONS = [
    { label: ".5", soundEvent: "BuffReminder.Test0_5" },
    { label: "1", soundEvent: "BuffReminder.Test1" },
    { label: "5", soundEvent: "BuffReminder.Test5" },
    { label: "8", soundEvent: "BuffReminder.Test8" },
    { label: "12", soundEvent: "BuffReminder.Test12" },
    { label: "16", soundEvent: "BuffReminder.Test16" },
    { label: "30", soundEvent: "BuffReminder.Test30" },
    { label: "50", soundEvent: "BuffReminder.Test50" },
    { label: "100", soundEvent: "BuffReminder.Test100" }
];
const SHOW_MEMORY_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showmem 0" },
    { label: "On", command: "cl_showmem 1" }
];
const SHOW_POSITION_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showpos 0" },
    { label: "On", command: "cl_showpos 1" }
];
const SHOW_TICK_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showtick 0" },
    { label: "On", command: "cl_showtick 1" }
];
const SHOW_FPS_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showfps 0" },
    { label: "On", command: "cl_showfps 1" }
];
const SHOW_FRAME_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showframenumber false" },
    { label: "On", command: "cl_showframenumber true" }
];
const RUNTIME_BUTTON_GROUP_DEFAULT_INDEX = {
    HITMARKERS_RUNTIME: 1,
    AUDIO_BEEP_TEST_RUNTIME: 1
};

// Slider shapes and CreateSliderRow extracted to panorama/scripts/ui/controls.js

// Settings metadata tables extracted to ui/ql_settings_metadata.js
const HEALTHBAR_TYPE_DROPDOWN_OPTIONS = [
    { label: "Default", value: 0 },
    { label: "Minimalist", value: 1 },
    { label: "Fighting Game", value: 2 },
    { label: "Klutz's Bar", value: 3 },
    { label: "Budhud", value: 4 },
    { label: "Minecraft", value: 5 }
];
const COLOR_WARNING_THRESHOLD_OPTIONS = [
    { label: "25%", key: "ENABLE_COLOR_WARNING_25" },
    { label: "65%", key: "ENABLE_COLOR_WARNING_65" },
    { label: "75%", key: "ENABLE_COLOR_WARNING_75" }
];
const TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS = [
    { label: "25%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_25" },
    { label: "65%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_65" },
    { label: "75%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_75" }
];
const TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS = [
    { label: "25%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_25" },
    { label: "65%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_65" },
    { label: "75%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_75" }
];
const NEUTRAL_CAMP_TIER_OPTIONS = [
    { label: "Tier 1", key: "ENABLE_ONE_TIME_TIER1" },
    { label: "Tier 2", key: "ENABLE_ONE_TIME_TIER2" },
    { label: "Tier 3", key: "ENABLE_ONE_TIME_TIER3" },
    { label: "Buff", key: "ENABLE_INTERVAL" }
];
const BRIDGE_BUFF_FILTER_OPTIONS = [
    { label: "1st", key: "ENABLE_BUFF_SOUND_1" },
    { label: "2nd", key: "ENABLE_BUFF_SOUND_2" },
    { label: "3rd", key: "ENABLE_BUFF_SOUND_3" }
];
const RECENT_PURCHASE_REPOSITION_OPTIONS = [
    { label: "Rejuvenator", key: "RECENT_PURCHASES_QUICK_REJUV" },
    { label: "Scoreboard", key: "RECENT_PURCHASES_QUICK_SCOREBOARD" }
];
// Player Stats side picker — mutually exclusive Left/Right bound to a single config key.
const STATS_POSITION_SIDE_OPTIONS = [
    { label: "Left", value: 0 },
    { label: "Right", value: 1 }
];
const DEFAULT_HERO_OPTIONS = [
    "hero_inferno",
    "hero_gigawatt",
    "hero_hornet",
    "hero_ghost",
    "hero_atlas",
    "hero_wraith",
    "hero_forge",
    "hero_chrono",
    "hero_dynamo",
    "hero_kelvin",
    "hero_haze",
    "hero_astro",
    "hero_bebop",
    "hero_nano",
    "hero_orion",
    "hero_krill",
    "hero_shiv",
    "hero_tengu",
    "hero_warden",
    "hero_yamato",
    "hero_lash",
    "hero_viscous",
    "hero_synth",
    "hero_mirage",
    "hero_viper",
    "hero_magician",
    "hero_vampirebat",
    "hero_drifter",
    "hero_priest",
    "hero_frank",
    "hero_bookworm",
    "hero_doorman",
    "hero_punkgoat",
    "hero_necro",
    "hero_fencer",
    "hero_familiar",
    "hero_werewolf",
    "hero_unicorn"
];
const DEFAULT_HERO_DISPLAY_NAMES = {
    hero_inferno: "Infernus",
    hero_gigawatt: "Seven",
    hero_hornet: "Vindicta",
    hero_ghost: "Lady Geist",
    hero_atlas: "Abrams",
    hero_wraith: "Wraith",
    hero_forge: "McGinnis",
    hero_chrono: "Paradox",
    hero_dynamo: "Dynamo",
    hero_kelvin: "Kelvin",
    hero_haze: "Haze",
    hero_astro: "Holliday",
    hero_bebop: "Bebop",
    hero_nano: "Calico",
    hero_orion: "Grey Talon",
    hero_krill: "Mo & Krill",
    hero_shiv: "Shiv",
    hero_tengu: "Ivy",
    hero_warden: "Warden",
    hero_yamato: "Yamato",
    hero_lash: "Lash",
    hero_viscous: "Viscous",
    hero_synth: "Pocket",
    hero_mirage: "Mirage",
    hero_viper: "Vyper",
    hero_magician: "Sinclair",
    hero_vampirebat: "Mina",
    hero_drifter: "Drifter",
    hero_priest: "Venator",
    hero_frank: "Victor",
    hero_bookworm: "Paige",
    hero_doorman: "Doorman",
    hero_punkgoat: "Billy",
    hero_necro: "Graves",
    hero_fencer: "Apollo",
    hero_familiar: "Rem",
    hero_werewolf: "Silver",
    hero_unicorn: "Celeste"
};
const DEFAULT_HERO_DROPDOWN_OPTIONS = DEFAULT_HERO_OPTIONS.map(function(heroId) {
    return { label: DEFAULT_HERO_DISPLAY_NAMES[heroId] || heroId, value: heroId };
}).sort(function(a, b) {
    var labelA = String(a && a.label ? a.label : "").toLowerCase();
    var labelB = String(b && b.label ? b.label : "").toLowerCase();
    if (labelA < labelB) return -1;
    if (labelA > labelB) return 1;
    return 0;
});
function GetDefaultHeroIconPath(heroId) {
    var normalizedHeroId = String(heroId || "");
    var heroAlias = normalizedHeroId.indexOf("hero_") === 0 ? normalizedHeroId.substring(5) : normalizedHeroId;
    if (!heroAlias) heroAlias = "werewolf";
    var heroIconAliasMap = {
        viper: "kali",
        krill: "digger",
        forge: "engineer",
        ghost: "spectre",
        orion: "archer",
        atlas: "bull",
        dynamo: "sumo"
    };
    if (heroIconAliasMap.hasOwnProperty(heroAlias)) {
        heroAlias = heroIconAliasMap[heroAlias];
    }
    return "s2r://panorama/images/heroes/" + heroAlias + "_mm_psd.vtex";
}
function GetLanguageIconPath(languageValue) {
    var normalizedValue = String(languageValue === undefined || languageValue === null ? "" : languageValue);
    var languageIconName = "english";
    if (normalizedValue === String(SETTINGS_LANGUAGE_RUSSIAN)) {
        languageIconName = "russian";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_UKRAINIAN)) {
        languageIconName = "ukraine";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_POLISH)) {
        languageIconName = "poland";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_BULGARIAN)) {
        languageIconName = "bulgaria";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_BELARUSIAN)) {
        languageIconName = "belarus";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_JAPANESE)) {
        languageIconName = "japan";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_CHINESE)) {
        languageIconName = "chinese";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_FRENCH)) {
        languageIconName = "french";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_PORTUGUESE)) {
        languageIconName = "portuguese";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE)) {
        languageIconName = "brazil";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_SPANISH)) {
        languageIconName = "spanish";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_KOREAN)) {
        languageIconName = "korean";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_ITALIAN)) {
        languageIconName = "italian";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_TURKISH)) {
        languageIconName = "turkish";
    }
    return "s2r://panorama/images/qollock/" + languageIconName + "_png.vtex";
}
const COMPACT_DEFAULT_HERO_FIELD = "DEFAULT_HERO_INDEX";

// QOL_PRESETS always available — ql_shared_presets.js loads first
const PRESETS = QOL_PRESETS;
const BREAD_PRESET_NAME = "BreadRollius";
const LEGACY_BREAD_PRESET_NAME = "Bread";

// (Storage/color bridge constants now live in ql_bridge.js — Phase 4)
const RUNTIME_PRESET_ATTR = "QOL_RUNTIME_PRESET";
// (Build save/clear bridge constants now live in ql_bridge.js — Phase 4)
const SETTINGS_SAVE_LOADER_ENABLED = true;
const SETTINGS_SAVE_HOVER_WARNING = "DO NOT USE THIS IN QUEUE OR MATCH";
const SETTINGS_SAVE_DISABLED_WARNING = "CURRENTLY IN EARLY ACCESS ON DISCORD DISABLED DUE TO BUGS";
// (HERO_HINT_ATTR now lives in ql_bridge.js — Phase 4)
const SETTING_ROW_RESET_KEYS_ATTR = "QOL_ROW_RESET_KEYS";
const RUNTIME_ROW_KIND_ATTR = "QOL_RUNTIME_ROW_KIND";
const RUNTIME_ROW_KEY_ATTR = "QOL_RUNTIME_ROW_KEY";
const MOD_VERSION = 32;
// QOL_SCHEMA_SEMVER always available — ql_shared_presets.js loads first
const MOD_DISPLAY_VERSION = QOL_SCHEMA_SEMVER;
const EXPORT_SCHEMA_SEMVER = MOD_DISPLAY_VERSION;
const COMPACT_WIRE_VERSION_2_0_0 = 1;
const COMPACT_WIRE_VERSION_2_0_1 = 2;
const EXPORT_SCHEMA_WIRE_VERSION = (String(EXPORT_SCHEMA_SEMVER || "") === "2.0.0")
    ? COMPACT_WIRE_VERSION_2_0_0
    : COMPACT_WIRE_VERSION_2_0_1;
const EXPORT_SCHEMA_TOKEN_VERSION = String(EXPORT_SCHEMA_SEMVER || "").replace(/\./g, "-");
const EXPORT_PREFIX = "[QOL-" + EXPORT_SCHEMA_TOKEN_VERSION + "]:";
const EXPORT_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
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
const SETTINGS_LIST_REFRESH_DEBOUNCE_SEC = 0.06;
const SETTINGS_TRANSITION_WATCH_INTERVAL_SEC = 0.25;
const SETTINGS_TRANSITION_CLOSE_COOLDOWN_MS = 1000;
const SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC = [0.0, 0.2, 0.6];
// Theme management and localization helpers extracted to ui/theme.js


const HERO_HINT_PUBLISH_INTERVAL_SEC = 1.0;
const BILLIARDS_TABLE_WIDTH = 640;
const BILLIARDS_TABLE_HEIGHT = 380;
const BILLIARDS_BALL_RADIUS = 11;
const BILLIARDS_POCKET_RADIUS = 22;
const BILLIARDS_FRICTION = 0.972;
const BILLIARDS_BOUNCE = 0.92;
const BILLIARDS_MIN_SPEED = 0.08;

const ARCADE_DEFAULT_DIFFICULTY_OPTIONS = [
    { label: "Easy", id: "EASY" },
    { label: "Medium", id: "MEDIUM" },
    { label: "Hard", id: "HARD" }
];

const QOL_COLOR_PALETTE_OPTIONS = [
    { label: "Default", value: 0, hex: "" },
    { label: "White", value: 1, hex: "#f7f4e8" },
    { label: "Silver", value: 2, hex: "#bfc7cf" },
    { label: "Charcoal", value: 3, hex: "#33363f" },
    { label: "Brown", value: 22, hex: "#9a6743" },
    { label: "Gold", value: 23, hex: "#d9a441" },
    { label: "Red", value: 4, hex: "#ff3b47" },
    { label: "Coral", value: 5, hex: "#ff6f61" },
    { label: "Orange", value: 6, hex: "#ff8a2a" },
    { label: "Amber", value: 7, hex: "#ffb52e" },
    { label: "Yellow", value: 8, hex: "#ffe45c" },
    { label: "Lime", value: 9, hex: "#a8f04f" },
    { label: "Poison", value: 24, hex: "#8cff4f" },
    { label: "Green", value: 10, hex: "#45d66b" },
    { label: "Mint", value: 11, hex: "#63f0b5" },
    { label: "Teal", value: 12, hex: "#24c6a8" },
    { label: "Cyan", value: 13, hex: "#44e3ff" },
    { label: "Sky", value: 14, hex: "#64bfff" },
    { label: "Blue", value: 15, hex: "#3f78ff" },
    { label: "Indigo", value: 16, hex: "#6157ff" },
    { label: "Void", value: 25, hex: "#7c4dff" },
    { label: "Violet", value: 17, hex: "#9b5cff" },
    { label: "Purple", value: 18, hex: "#c15cff" },
    { label: "Magenta", value: 19, hex: "#ff4de3" },
    { label: "Pink", value: 20, hex: "#ff78bd" },
    { label: "Rose", value: 21, hex: "#ff5d89" },
    { label: "Crimson", value: 26, hex: "#b8142f" },
    { label: "Ice", value: 27, hex: "#b9f4ff" },
    { label: "Lavender", value: 28, hex: "#d7b2ff" },
    { label: "Black", value: 29, hex: "#05070a" }
];

function QOLFilterFriendsList() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    var searchInput = root ? root.FindChildTraverse("FriendSearchInput") : null;
    if (!searchInput) return;

    var searchText = (searchInput.text || "").toLowerCase();
    var friendsContainer = root ? root.FindChildTraverse("FriendsCategories") : null;
    if (!friendsContainer) return;

    for (var i = 0; i < friendsContainer.GetChildCount(); i++) {
        var categoryPanel = friendsContainer.GetChild(i);
        if (!categoryPanel) continue;

        var friendEntries = categoryPanel.FindChildTraverse("FriendEntries");
        if (!friendEntries && categoryPanel.GetChildCount() > 1) {
            friendEntries = categoryPanel.GetChild(1);
        }
        if (!friendEntries) continue;

        for (var j = 0; j < friendEntries.GetChildCount(); j++) {
            var playerPanel = friendEntries.GetChild(j);
            if (!playerPanel) continue;

            var userNameHost = playerPanel.FindChildInLayoutFile ? playerPanel.FindChildInLayoutFile("UserName") : null;
            var nameLabel = null;
            if (userNameHost && userNameHost.GetChildCount && userNameHost.GetChildCount() > 0) {
                nameLabel = userNameHost.GetChild(0);
            }

            if (nameLabel && typeof nameLabel.text === "string") {
                var playerName = nameLabel.text.toLowerCase();
                playerPanel.visible = (searchText.length === 0 || playerName.indexOf(searchText) !== -1);
            } else {
                playerPanel.visible = true;
            }
        }
    }

    var searchClear = root ? root.FindChildTraverse("FriendSearchClear") : null;
    if (searchClear) {
        searchClear.visible = (searchText.length > 0);
    }
}

function QOLClearFriendsSearch() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    var searchInput = root ? root.FindChildTraverse("FriendSearchInput") : null;
    if (!searchInput) return;

    searchInput.text = "";
    if (searchInput.ClearSelection) searchInput.ClearSelection();
    QOLFilterFriendsList();
}

function QOLBindFriendsSearchHandlers() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    if (!root) return false;

    var searchInput = root.FindChildTraverse("FriendSearchInput");
    var searchClear = root.FindChildTraverse("FriendSearchClear");
    if (!searchInput || !searchClear) return false;

    searchInput.SetPanelEvent("ontextentrychange", function() {
        QOLFilterFriendsList();
    });
    searchClear.SetPanelEvent("onactivate", function() {
        QOLClearFriendsSearch();
    });
    QOLFilterFriendsList();
    return true;
}

function EnsureDiscordTextureLogo(targetBtn, logoId, logoClass) {
    if (!targetBtn) return;
    var resolvedLogoId = logoId || "FooterDiscordLogoTexture";
    var resolvedLogoClass = logoClass || "FooterDiscordLogoTexture";

    var legacyCssLogo = targetBtn.FindChildTraverse("FooterDiscordLogoCss");
    if (legacyCssLogo && legacyCssLogo.DeleteAsync) legacyCssLogo.DeleteAsync(0);

    var logoImage = targetBtn.FindChildTraverse(resolvedLogoId);
    if (!logoImage) {
        logoImage = $.CreatePanel("Image", targetBtn, resolvedLogoId);
    }
    if (!logoImage) return;

    logoImage.AddClass(resolvedLogoClass);
    logoImage.SetImage("s2r://panorama/images/qollock/discord_logo_png.vtex");
}

function EnsureDiscordFooterTextureLogo(discordFooterBtn) {
    EnsureDiscordTextureLogo(discordFooterBtn, "FooterDiscordLogoTexture", "FooterDiscordLogoTexture");
}

function QOLEnsureFriendsSearchHandlers() {
    if (!QOLBindFriendsSearchHandlers()) {
        $.Schedule(0.5, QOLEnsureFriendsSearchHandlers);
    }
}

function SetPanelNonInteractive(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    panel.hittest = false;
    panel.hittestchildren = false;
}

// Phase C.3: Fixed fallback — was always setting "1.00" regardless of opacityValue.
var SetPanelOpacitySafe = (Utils && Utils.SetPanelOpacitySafe) ? Utils.SetPanelOpacitySafe : function(panel, opacityValue, fallbackValue) { if (panel && panel.style) { try { var v = Number(opacityValue); if (!isFinite(v)) v = Number(fallbackValue); if (!isFinite(v)) v = 1.0; panel.style.opacity = v.toFixed(2); } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); } } };

function GetPanelRectRelativeToContext(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return null;
    var context = $.GetContextPanel();
    var root = FindRootPanel();
    if (!context || !root) return null;
    var panelX = GetPanelXOffsetWithinAncestor(panel, root);
    var panelY = GetPanelYOffsetWithinAncestor(panel, root);
    var contextX = GetPanelXOffsetWithinAncestor(context, root);
    var contextY = GetPanelYOffsetWithinAncestor(context, root);
    if (!isFinite(panelX) || !isFinite(panelY) || !isFinite(contextX) || !isFinite(contextY)) return null;
    var width = Number(panel.actuallayoutwidth);
    var height = Number(panel.actuallayoutheight);
    if (!isFinite(width) || width < 0) width = 0;
    if (!isFinite(height) || height < 0) height = 0;
    return {
        x: Math.round(panelX - contextX),
        y: Math.round(panelY - contextY),
        width: Math.round(width),
        height: Math.round(height)
    };
}

var LATEST_COMPACT_SEMVER = QOL_LATEST_COMPACT_SEMVER;

function IsInHideoutForBuildSave() {
    // Game.GetMapInfo confirmed absent — use panel class detection for hideout detection.
    var root = FindRootPanel();
    if (root && root.BHasClass) {
        try {
            if (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout")) return true;
        } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    }
    var hud = root && root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
    if (hud && hud.BHasClass) {
        try {
            if (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout")) return true;
        } catch(e2) { WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
    }
    return false;
}

function GetNowMs() {
    try {
        return Date.now ? Date.now() : (new Date()).getTime();
    } catch (e0) {
        return (new Date()).getTime();
    }
}

function HasPanelClassToken(panel, className) {
    if (!panel || !panel.BHasClass || !className) return false;
    try {
        return panel.BHasClass(className);
    } catch (e0) {
        return false;
    }
}

function IsSettingsInActiveMatchContext() {
    var root = FindRootPanel();
    if (!root) return false;

    var hud = root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
    var gameplayHud = root.FindChildTraverse ? root.FindChildTraverse("gameplay_hud") : null;
    var hideout = IsInHideoutForBuildSave();

    var hasAnyClass = function(className) {
        return HasPanelClassToken(root, className) ||
            HasPanelClassToken(hud, className) ||
            HasPanelClassToken(gameplayHud, className);
    };

    if (
        hasAnyClass("GameStateGameInProgress") ||
        hasAnyClass("GameStatePostGame") ||
        hasAnyClass("GameStatePostGamePlayOfTheGame") ||
        hasAnyClass("inPostGame")
    ) {
        return true;
    }

    if (
        !hideout &&
        (
            hasAnyClass("connectedToGame") ||
            hasAnyClass("joined_team") ||
            hasAnyClass("GameStatePreGame") ||
            hasAnyClass("GameStatePreGameWait") ||
            hasAnyClass("GameStateWaitForMapToLoad") ||
            hasAnyClass("GameStateHeroSelection") ||
            hasAnyClass("GameStateMatchIntro")
        )
    ) {
        return true;
    }

    // Game.GetMapInfo confirmed absent — match detection via panel classes only.
    return false;
}

function StopSettingsGameTransitionWatch() {
    gSettingsTransitionWatchToken++;
    gSettingsTransitionWatchRunning = false;
}

function TryCloseSettingsForGameTransition(reason) {
    if (!IsSettingsWindowVisible()) return false;
    if (!gSettingsOpenedInHideout) return false;
    if (!IsSettingsInActiveMatchContext()) return false;

    var now = GetNowMs();
    if (now < gSettingsTransitionCloseCooldownUntilMs) return false;
    gSettingsTransitionCloseCooldownUntilMs = now + SETTINGS_TRANSITION_CLOSE_COOLDOWN_MS;

    $.ForceCloseModSettings();
    return true;
}

function HandleSettingsGameTransitionSignal(reason) {
    if (!IsSettingsWindowVisible()) return;
    if (!gSettingsOpenedInHideout) return;

    for (var i = 0; i < SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC.length; i++) {
        (function(delaySec) {
            $.Schedule(delaySec, function() {
                TryCloseSettingsForGameTransition(reason);
            });
        })(SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC[i]);
    }
}

function StartSettingsGameTransitionWatch() {
    StopSettingsGameTransitionWatch();
    gSettingsTransitionWatchRunning = true;
    var token = gSettingsTransitionWatchToken;

    function tick() {
        if (token !== gSettingsTransitionWatchToken) return;
        if (!IsSettingsWindowVisible()) {
            gSettingsTransitionWatchRunning = false;
            return;
        }

        if (TryCloseSettingsForGameTransition("watchdog")) {
            gSettingsTransitionWatchRunning = false;
            return;
        }

        $.Schedule(SETTINGS_TRANSITION_WATCH_INTERVAL_SEC, tick);
    }

    $.Schedule(SETTINGS_TRANSITION_WATCH_INTERVAL_SEC, tick);
}

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
    var parseRev = (Utils && Utils.ParseRevisionNumber) || function(v) { var n = Number(v); if (!isFinite(n) || n < 0) return 0; return Math.floor(n); };
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
    MigrateSplitZoomKeys(config, parsed);
    NormalizeNeutralCampFlags(config, parsed);
    NormalizeItemCooldownModeConfig(config, parsed);
    NormalizeAmmoScaleConfig(config, parsed);
    NormalizeVoiceTypeConfig(config);
    NormalizeHealthbarTypeConfig(config, parsed);
    NormalizeColorWarningConfig(config, parsed);
    NormalizeEnemyColorWarningConfig(config, parsed);
    NormalizeAllyColorWarningConfig(config, parsed);
    NormalizeTopbarEnemyHpWarningConfig(config, parsed);
    NormalizeTopbarAllyHpWarningConfig(config, parsed);
    NormalizeShopItemNotificationsConfig(config, parsed);
    NormalizeQuickbuyDependencyConfig(config);
}

function SyncConfigFromStorage() {
    var raw = ReadConfigRawFromStorage();
    // $.persistentStorage confirmed absent — panel attrs are the only persistence.
    // QOL_DEFAULT_CONFIG always available — same context as ql_shared_presets.js
    var nextConfig = Object.assign({}, QOL_DEFAULT_CONFIG);
    if (raw && raw.length > 0) {
        try {
            var unwrapped = UnwrapConfigFromStorage(raw);
            var parsed = (unwrapped && unwrapped.config) ? unwrapped.config : {};
            for (var key in parsed) {
                if (nextConfig.hasOwnProperty(key)) {
                    nextConfig[key] = parsed[key];
                }
            }
            NormalizeConfig(nextConfig, parsed);
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
    var bridgeValue = String(Math.max(0, Math.min(29, Math.round(Number(value) || 0))));
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

// Debounced save: prevents rapid-fire saves during slider drags etc.
// Uses a token-counter pattern so only the last scheduled flush actually fires.
var gSaveDebounceToken = 0;
var SAVE_DEBOUNCE_SEC = 0.3;

function MarkConfigDirty() {
    var token = ++gSaveDebounceToken;
    $.Schedule(SAVE_DEBOUNCE_SEC, function() {
        if (gSaveDebounceToken === token) {
            gSaveDebounceToken = 0;
            SaveAndSync();
        }
    });
}

// Flushes any pending debounced save immediately (e.g. before import/reset).
function FlushPendingSave() {
    if (gSaveDebounceToken > 0) {
        gSaveDebounceToken = 0;
        SaveAndSync();
    }
}

function SaveAndSync() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    if (!hud && panel && panel.GetParent) {
        var cur = panel.GetParent();
        while (cur) {
            if (cur.id === "Hud" || (cur.paneltype && cur.paneltype === "CitadelHud") || (cur.BHasClass && cur.BHasClass("WindowRoot") && cur !== root)) {
                hud = cur;
                break;
            }
            cur = (cur.GetParent && typeof cur.GetParent === "function") ? cur.GetParent() : null;
        }
    }
    if (!hud && root && (root.id === "Hud" || (root.paneltype && root.paneltype === "CitadelHud"))) {
        hud = root;
    }
    if (!hud && typeof QOL !== "undefined" && QOL.core && QOL.core.PanelHelpers && typeof QOL.core.PanelHelpers.findHud === "function") {
        try { hud = QOL.core.PanelHelpers.findHud(panel) || QOL.core.PanelHelpers.findHud(root); } catch(ePh) {}
    }
    NormalizeConfig(MOD_CONFIG, MOD_CONFIG);
    if (typeof globalThis.RefreshActivePresetConfigMarkerBeforeSave === "function") {
        globalThis.RefreshActivePresetConfigMarkerBeforeSave();
    }
    var data = WrapConfigForStorage(MOD_CONFIG);
    if (data === gLastSavedConfigRaw) {
        PublishPaletteColorBridges();
        return;
    }
    gLastSavedConfigRaw = data;
    var parseRev = (Utils && Utils.ParseRevisionNumber) || function(v) { var n = Number(v); if (!isFinite(n) || n < 0) return 0; return Math.floor(n); };
    var panelRev = (panel && panel.GetAttributeString) ? parseRev(panel.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var rootRev = (root && root.GetAttributeString) ? parseRev(root.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var hudRev = (hud && hud.GetAttributeString) ? parseRev(hud.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var nextRev = Math.max(gUserEditRevision, panelRev, rootRev, hudRev) + 1;
    gUserEditRevision = nextRev;
    // Write data + revision as a paired update per panel so an interrupted
    // save never orphans new data with an old revision number.
    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(STORAGE_KEY, data);
        panel.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev));
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(STORAGE_KEY, data);
        root.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev));
    }
    if (hud && hud.SetAttributeString) {
        try { hud.SetAttributeString(STORAGE_KEY, data); } catch(eHudStorage) { WarnLog("settings", "op failed: " + (eHudStorage && eHudStorage.message ? eHudStorage.message : String(eHudStorage || ""))); }
        try { hud.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev)); } catch(eHudRev) { WarnLog("settings", "op failed: " + (eHudRev && eHudRev.message ? eHudRev.message : String(eHudRev || ""))); }
    }
    PersistStatlockerProfileState(data, MOD_CONFIG);
    PublishPaletteColorBridges();
    if (QOL.arcade) QOL.arcade.updateBridgePollerState();
    ApplySettingsThemeClasses(panel && panel.FindChildTraverse ? panel.FindChildTraverse("SettingsWindow") : null);
    QueueActivePresetHighlightRefresh(0.05);
    RefreshEnumSections();
}

function GetSettingsListPanel() {
    var root = $.GetContextPanel();
    if (!root || !root.FindChildTraverse) return null;
    var list = null;
    try { list = root.FindChildTraverse("SettingsList"); } catch (e0) { list = null; }
    if (!list || !list.IsValid || !list.IsValid()) return null;
    return list;
}

function BuildSettingsListRenderSignature() {
    var langKey = GetSettingsLanguageKey();
    var themeKey = GetSettingsThemeKey();
    return String(currentTab || "") + "|" + langKey + "|" + themeKey;
}

function IsPanelValidSafe(panel) {
    if (Utils && Utils.IsPanelValid) {
        return Utils.IsPanelValid(panel);
    }
    return !!(panel && panel.IsValid && panel.IsValid());
}

function MakeSettingsListSignatureKey(sig) {
    return String(sig || "").replace(/[^A-Za-z0-9_]/g, "_");
}

function EnsureSettingsListHosts(list) {
    if (!IsPanelValidSafe(list)) return null;
    var cacheHost = list.FindChildTraverse("SettingsListCacheHost");
    if (!IsPanelValidSafe(cacheHost)) {
        cacheHost = $.CreatePanel("Panel", list, "SettingsListCacheHost");
    }
    cacheHost.AddClass("SettingsListContentHost");

    var searchHost = list.FindChildTraverse("SettingsListSearchHost");
    if (!IsPanelValidSafe(searchHost)) {
        searchHost = $.CreatePanel("Panel", list, "SettingsListSearchHost");
    }
    searchHost.AddClass("SettingsListContentHost");
    searchHost.AddClass("SettingsListSearchHost");

    return {
        cacheHost: cacheHost,
        searchHost: searchHost
    };
}

function PruneInvalidSettingsListContentCaches() {
    for (var sig in gSettingsListContentPanelBySig) {
        if (!gSettingsListContentPanelBySig.hasOwnProperty(sig)) continue;
        if (!IsPanelValidSafe(gSettingsListContentPanelBySig[sig])) {
            delete gSettingsListContentPanelBySig[sig];
        }
    }
}

function EnsureSettingsListContentPanelForSignature(list, renderSig, forceRebuild) {
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.cacheHost)) {
        return { panel: null, created: false };
    }

    PruneInvalidSettingsListContentCaches();

    var sig = String(renderSig || "");
    var panel = gSettingsListContentPanelBySig[sig];
    var created = false;

    if (!IsPanelValidSafe(panel)) panel = null;

    if (forceRebuild === true && panel) {
        delete gSettingsListRowSyncFnsBySig[sig];
    }

    if (!panel) {
        var panelId = "SettingsListSig_" + MakeSettingsListSignatureKey(sig);
        panel = hosts.cacheHost.FindChildTraverse(panelId);
        if (!IsPanelValidSafe(panel)) {
            panel = $.CreatePanel("Panel", hosts.cacheHost, panelId);
        }
        panel.AddClass("SettingsListCachedTabContent");
        gSettingsListContentPanelBySig[sig] = panel;
        created = true;
    } else if (panel.GetParent && panel.GetParent() !== hosts.cacheHost) {
        panel.SetParent(hosts.cacheHost);
    }

    return {
        panel: panel,
        created: created
    };
}

function SetActiveSettingsListRenderSignature(renderSig) {
    gSettingsListActiveRenderSig = String(renderSig || "");
    if (!gSettingsListRowSyncFnsBySig.hasOwnProperty(gSettingsListActiveRenderSig)) {
        gSettingsListRowSyncFnsBySig[gSettingsListActiveRenderSig] = [];
    }
}

function ShowSettingsListTabPanel(list, renderSig) {
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.cacheHost) || !IsPanelValidSafe(hosts.searchHost)) return;
    var sig = String(renderSig || "");

    hosts.searchHost.SetHasClass("Hidden", true);
    for (var key in gSettingsListContentPanelBySig) {
        if (!gSettingsListContentPanelBySig.hasOwnProperty(key)) continue;
        var panel = gSettingsListContentPanelBySig[key];
        if (!IsPanelValidSafe(panel)) continue;
        panel.SetHasClass("Hidden", key !== sig);
    }
}

function IsSettingsSearchActiveQuery() {
    return String(currentSearchQuery || "").trim().length > 0;
}

// Debounced settings-search render: a full result rebuild tears down and recreates
// every matched row (CreateRow per match), so firing it on every keystroke makes
// fast typing/deleting/retyping lag. Coalesce a burst of keystrokes into a single
// rebuild after a short idle window. Token-counter pattern (same as gSaveDebounceToken):
// only the last scheduled render actually fires.
var gSearchRenderDebounceToken = 0;
var SEARCH_RENDER_DEBOUNCE_SEC = 0.12;

function RunSettingsSearchRenderNow() {
    var liveList = GetSettingsListPanel();
    if (liveList) UpdateListContent(liveList, true);
}

function ScheduleSettingsSearchRender() {
    var token = ++gSearchRenderDebounceToken;
    $.Schedule(SEARCH_RENDER_DEBOUNCE_SEC, function() {
        if (gSearchRenderDebounceToken !== token) return;
        gSearchRenderDebounceToken = 0;
        RunSettingsSearchRenderNow();
    });
}

// Cancels any pending debounced render (e.g. when another path renders immediately).
function CancelSettingsSearchRender() {
    gSearchRenderDebounceToken++;
}

// Renders immediately and cancels any pending debounce (e.g. on Enter/submit).
function FlushSettingsSearchRender() {
    gSearchRenderDebounceToken++;
    RunSettingsSearchRenderNow();
}

function RenderSettingsSearchResultsOnly(list) {
    if (!list || !list.IsValid || !list.IsValid()) return false;
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.searchHost)) return false;
    QOL.preview.hideAll();
    SetActiveSettingsListRenderSignature("__search__");
    ResetSettingsListRowSyncRegistry();
    ShowSettingsListTabPanel(list, "");
    hosts.searchHost.SetHasClass("Hidden", false);
    hosts.searchHost.RemoveAndDeleteChildren();
    var rendered = RenderSearchResults(hosts.searchHost, currentSearchQuery);
    gSettingsListSearchModeActive = rendered === true;
    UpdatePresetHighlightPollingState();
    return rendered === true;
}

function ResetSettingsListRowSyncRegistry() {
    var sig = String(gSettingsListActiveRenderSig || "");
    gSettingsListRowSyncFns = [];
    gSettingsListRowSyncFnsBySig[sig] = [];
}

function RegisterSettingsListRowSync(fn) {
    if (typeof fn !== "function") return;
    var sig = String(gSettingsListActiveRenderSig || "");
    if (!gSettingsListRowSyncFnsBySig.hasOwnProperty(sig)) {
        gSettingsListRowSyncFnsBySig[sig] = [];
    }
    gSettingsListRowSyncFnsBySig[sig].push(fn);
    gSettingsListRowSyncFns = gSettingsListRowSyncFnsBySig[sig];
}

function RunSettingsListRowSync() {
    var sig = String(gSettingsListActiveRenderSig || "");
    var bucket = gSettingsListRowSyncFnsBySig[sig];
    if (!Array.isArray(bucket) || bucket.length <= 0) return;
    for (var i = bucket.length - 1; i >= 0; i--) {
        var fn = bucket[i];
        if (typeof fn !== "function") {
            bucket.splice(i, 1);
            continue;
        }
        var keep = true;
        try {
            keep = (fn() !== false);
        } catch (e0) {
            keep = false;
        }
        if (!keep) {
            bucket.splice(i, 1);
        }
    }
    gSettingsListRowSyncFnsBySig[sig] = bucket;
    gSettingsListRowSyncFns = bucket;
}

function RefreshRuntimeControlVisuals() {
    for (var key in gRuntimeButtonGroupRefreshers) {
        if (!gRuntimeButtonGroupRefreshers.hasOwnProperty(key)) continue;
        var refreshFn = gRuntimeButtonGroupRefreshers[key];
        if (typeof refreshFn !== "function") continue;
        try { refreshFn(); } catch (e0) { $.Msg("[QOLLock][WARN][settings] Button group refresh callback failed for key=" + key + ": " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }
    if (Array.isArray(gArcadeOnDeathSyncFns)) {
        for (var i = gArcadeOnDeathSyncFns.length - 1; i >= 0; i--) {
            var syncFn = gArcadeOnDeathSyncFns[i];
            var keep = true;
            if (typeof syncFn !== "function") {
                keep = false;
            } else {
                try { keep = (syncFn() !== false); } catch (e1) { $.Msg("[QOLLock][WARN][settings] Arcade sync callback failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); keep = false; }
            }
            if (!keep) gArcadeOnDeathSyncFns.splice(i, 1);
        }
    }
}

function SoftRefreshSettingsListContent(list) {
    var targetList = list || GetSettingsListPanel();
    if (!targetList || !targetList.IsValid || !targetList.IsValid()) return false;
    RefreshRuntimeControlVisuals();
    RunSettingsListRowSync();
    QueueActivePresetHighlightRefresh(0.02);
    return true;
}

function RequestSettingsListRefresh(delaySec, forceRebuild) {
    var delay = Number(delaySec);
    if (!isFinite(delay) || delay < 0) delay = 0;
    if (forceRebuild === true) gSettingsListRefreshForcePending = true;
    gSettingsListRefreshToken += 1;
    var refreshToken = gSettingsListRefreshToken;

    $.Schedule(delay, function() {
        if (refreshToken !== gSettingsListRefreshToken) return;
        var list = GetSettingsListPanel();
        var shouldForce = (gSettingsListRefreshForcePending === true);
        gSettingsListRefreshForcePending = false;
        if (!list) return;
        UpdateListContent(list, shouldForce);
    });
}

function RefreshSettingsLanguageUiAfterConfigChange(previousLanguage) {
    if (Math.round(Number(previousLanguage)) === GetSettingsLanguage()) return false;
    InvalidateSearchSectionIndexCache();

    $.Schedule(0.02, function() {
        if (typeof $.BuildUI === "function" && IsSettingsWindowVisible()) {
            $.BuildUI();
            return;
        }

        var rootPanel = $.GetContextPanel();
        var tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
        var settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
        SyncTabActiveStates(tabBar);
        if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
            RequestSettingsListRefresh(0, true);
        }
    });
    return true;
}

function RefreshSettingsListContent() {
    RequestSettingsListSoftRefresh(0);
}

function RequestSettingsListSoftRefresh(delaySec) {
    var delay = Number(delaySec);
    if (!isFinite(delay) || delay < 0) delay = 0;
    gSettingsListSoftRefreshToken += 1;
    var refreshToken = gSettingsListSoftRefreshToken;
    $.Schedule(delay, function() {
        if (refreshToken !== gSettingsListSoftRefreshToken) return;
        SoftRefreshSettingsListContent(GetSettingsListPanel());
    });
}

// Section reset helpers extracted to panorama/scripts/ui/controls.js

function SetConfigFeedbackMessage(message, tone, holdMs) {
    if (typeof QOL !== "undefined" && QOL.ui && QOL.ui.configTab && typeof QOL.ui.configTab.setConfigFeedbackMessage === "function") {
        return QOL.ui.configTab.setConfigFeedbackMessage(message, tone, holdMs);
    }
    if (typeof globalThis.SetConfigFeedbackMessage === "function" && globalThis.SetConfigFeedbackMessage !== SetConfigFeedbackMessage) {
        return globalThis.SetConfigFeedbackMessage(message, tone, holdMs);
    }
}

function CloseSettingsSideModalsIfOpen() {
    if (typeof QOL !== "undefined" && QOL.ui && QOL.ui.modal && typeof QOL.ui.modal.closeSettingsSideModalsIfOpen === "function") {
        QOL.ui.modal.closeSettingsSideModalsIfOpen();
    } else if (typeof globalThis.CloseSettingsSideModalsIfOpen === "function" && globalThis.CloseSettingsSideModalsIfOpen !== CloseSettingsSideModalsIfOpen) {
        globalThis.CloseSettingsSideModalsIfOpen();
    }
}

function SyncTabActiveStates(tabBar) {
    if (!tabBar || !tabBar.IsValid || !tabBar.IsValid()) return;
    var settingsWindow = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (settingsWindow && settingsWindow.SetHasClass) {
        settingsWindow.SetHasClass("SettingsLangRU", IsRussianSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangPL", IsPolishSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangBG", IsBulgarianSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangBY", IsBelarusianSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangFR", IsFrenchSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangPT", IsPortugueseSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangPTBR", IsBrazilianPortugueseSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangES", IsSpanishSettingsLanguage());
        ApplySettingsThemeClasses(settingsWindow);
    }
    var tabListHost = tabBar.FindChildTraverse("SettingsTabRailTabs");
    if (tabListHost) {
        var children = tabListHost.Children();
        for (var i = 0; i < children.length; i++) {
            var groupPanel = children[i];
            if (!groupPanel || !groupPanel.IsValid || !groupPanel.IsValid()) continue;
            var groupChildren = groupPanel.Children ? groupPanel.Children() : [];
            for (var gc = 0; gc < groupChildren.length; gc++) {
                var maybeTabsHost = groupChildren[gc];
                if (!maybeTabsHost || !maybeTabsHost.IsValid || !maybeTabsHost.IsValid()) continue;
                var tabs = maybeTabsHost.Children ? maybeTabsHost.Children() : [];
                for (var ti = 0; ti < tabs.length; ti++) {
                    var tabBtn = tabs[ti];
                    if (!tabBtn || !tabBtn.id || tabBtn.id.indexOf("TabButton_") !== 0) continue;
                    tabBtn.SetHasClass("Active", tabBtn.id === ("TabButton_" + currentTab.replace(" ", "")));
                    var tabLabel = tabBtn.FindChildTraverse("TabLabel");
                    if (tabLabel) {
                        var baseTabName = String(tabBtn.id).slice("TabButton_".length);
                        var displayTabName = GetSettingsTabDisplayName(baseTabName);
                        // Localize every tab name, including Config ("Settings"). Proper nouns
                        // not present in the translation map (e.g. MOGLOCK) pass through unchanged.
                        tabLabel.text = LocalizeSettingsText(displayTabName, true);
                    }
                }
            }
        }
    }
    var supportFooterBtn = tabBar.FindChildTraverse("FooterSupportTabButton");
    if (supportFooterBtn) {
        supportFooterBtn.DeleteAsync(0);
    }

    var tabFooter = tabBar.FindChildTraverse("SettingsTabRailFooter");
    // Highlight the version label when the hidden Dev tab is active
    var footerVersionLabel = tabFooter ? tabFooter.FindChildTraverse("FooterVersionLabel") : null;
    if (footerVersionLabel && footerVersionLabel.IsValid && footerVersionLabel.IsValid()) {
        footerVersionLabel.SetHasClass("Active", currentTab === "Dev");
    }
    var isRuFooter = IsRussianSettingsLanguage();
    var newsFooterBtn = tabFooter ? tabFooter.FindChildTraverse("FooterNewsLinkButton") : null;
    var staleDiscordFooterBtn = tabBar.FindChildTraverse("FooterDiscordLinkButton");
    if (staleDiscordFooterBtn) {
        staleDiscordFooterBtn.DeleteAsync(0);
        staleDiscordFooterBtn = null;
    }
    if (newsFooterBtn) {
        newsFooterBtn.DeleteAsync(0);
        newsFooterBtn = null;
    }
    var saveFooterBtn = tabFooter ? tabFooter.FindChildTraverse("FooterSaveBuildButton") : null;
}

function UpdateSettingsSearchUiState(rootPanel) {
    var root = rootPanel || $.GetContextPanel();
    if (!root || !root.FindChildTraverse) return;
    var searchWrap = root.FindChildTraverse("SettingsSearchWrap");
    var searchInput = root.FindChildTraverse("SettingsSearchInput");
    var hasText = false;
    if (searchInput && searchInput.IsValid && searchInput.IsValid()) {
        hasText = String(searchInput.text || "").length > 0;
    }
    if (searchWrap && searchWrap.IsValid && searchWrap.IsValid()) {
        searchWrap.SetHasClass("HasSearchText", hasText);
    }
}

function ClearSettingsSearchQuery(rootPanel) {
    currentSearchQuery = "";
    var root = rootPanel || $.GetContextPanel();
    var searchInput = root ? root.FindChildTraverse("SettingsSearchInput") : null;
    if (searchInput && searchInput.IsValid && searchInput.IsValid()) {
        if ((searchInput.text || "") !== "") {
            searchInput.text = "";
        }
        if (searchInput.ClearSelection) {
            searchInput.ClearSelection();
        }
    }
    UpdateSettingsSearchUiState(root);
}

function CloseOpenSettingsDropdowns(rootPanel, options) {
    var root = rootPanel || $.GetContextPanel();
    if (!root || !root.IsValid || !root.IsValid()) return;
    var skipFocusTransfer = !!(options && options.skipFocusTransfer === true);

    var searchRoots = [];
    var seenRoots = [];
    var cursor = root;
    while (cursor && cursor.IsValid && cursor.IsValid()) {
        if (seenRoots.indexOf(cursor) === -1) {
            seenRoots.push(cursor);
            searchRoots.push(cursor);
        }
        if (!cursor.GetParent) break;
        cursor = cursor.GetParent();
    }

    var dropdownPanels = [];
    for (var rootIndex = 0; rootIndex < searchRoots.length; rootIndex++) {
        var searchRoot = searchRoots[rootIndex];
        if (!searchRoot || !searchRoot.IsValid || !searchRoot.IsValid()) continue;
        var foundDropdowns = [];
        try { foundDropdowns = searchRoot.FindChildrenWithClassTraverse ? (searchRoot.FindChildrenWithClassTraverse("QOLSettingsDropDown") || []) : []; } catch (e0) { foundDropdowns = []; }
        for (var foundIndex = 0; foundIndex < foundDropdowns.length; foundIndex++) {
            var foundDropdown = foundDropdowns[foundIndex];
            if (!foundDropdown || !foundDropdown.IsValid || !foundDropdown.IsValid()) continue;
            if (dropdownPanels.indexOf(foundDropdown) !== -1) continue;
            dropdownPanels.push(foundDropdown);
        }
    }
    for (var iDropdown = 0; iDropdown < dropdownPanels.length; iDropdown++) {
        var dropdownPanel = dropdownPanels[iDropdown];
        if (!dropdownPanel || !dropdownPanel.IsValid || !dropdownPanel.IsValid()) continue;
        var menuPanel = null;
        var dropdownWasOpen = false;
        try { dropdownWasOpen = dropdownPanel.BHasClass && dropdownPanel.BHasClass("DropDownMenuVisible"); } catch (eDropdownOpen) { dropdownWasOpen = false; }
        for (var searchIndex = 0; searchIndex < searchRoots.length && !menuPanel; searchIndex++) {
            var menuSearchRoot = searchRoots[searchIndex];
            if (!menuSearchRoot || !menuSearchRoot.IsValid || !menuSearchRoot.IsValid()) continue;
            try { menuPanel = menuSearchRoot.FindChildTraverse(String(dropdownPanel.id || "") + "DropDownMenu"); } catch (e4) { menuPanel = null; }
        }
        if (menuPanel && menuPanel.IsValid && menuPanel.IsValid()) {
            try { dropdownWasOpen = dropdownWasOpen || !!menuPanel.visible; } catch(eMenuVisible) { WarnLog("settings", "op failed: " + (eMenuVisible && eMenuVisible.message ? eMenuVisible.message : String(eMenuVisible || ""))); }
            try { dropdownWasOpen = dropdownWasOpen || (menuPanel.BHasClass && menuPanel.BHasClass("DropDownMenuVisible")); } catch(eMenuClass) { WarnLog("settings", "op failed: " + (eMenuClass && eMenuClass.message ? eMenuClass.message : String(eMenuClass || ""))); }
        }
        try { dropdownPanel.SetHasClass("DropDownMenuVisible", false); } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        try { dropdownPanel.RemoveClass("DropDownMenuVisible"); } catch(e2) { WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try { dropdownPanel.visible = true; } catch(e2b) { WarnLog("settings", "op failed: " + (e2b && e2b.message ? e2b.message : String(e2b || ""))); }
        if (!skipFocusTransfer && dropdownWasOpen) {
            try { dropdownPanel.SetFocus(); } catch(e3) { WarnLog("settings", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
        }
        if (menuPanel && menuPanel.IsValid && menuPanel.IsValid()) {
            try { menuPanel.SetHasClass("DropDownMenuVisible", false); } catch(e5) { WarnLog("settings", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }
            try { menuPanel.RemoveClass("DropDownMenuVisible"); } catch(e6) { WarnLog("settings", "op failed: " + (e6 && e6.message ? e6.message : String(e6 || ""))); }
            try { menuPanel.visible = false; } catch(e7) { WarnLog("settings", "op failed: " + (e7 && e7.message ? e7.message : String(e7 || ""))); }
        }
    }

    var floatingMenus = [];
    for (var floatingRootIndex = 0; floatingRootIndex < searchRoots.length; floatingRootIndex++) {
        var floatingSearchRoot = searchRoots[floatingRootIndex];
        if (!floatingSearchRoot || !floatingSearchRoot.IsValid || !floatingSearchRoot.IsValid()) continue;
        var foundMenus = [];
        try { foundMenus = floatingSearchRoot.FindChildrenWithClassTraverse ? (floatingSearchRoot.FindChildrenWithClassTraverse("DropDownMenuVisible") || []) : []; } catch (e8) { foundMenus = []; }
        for (var foundMenuIndex = 0; foundMenuIndex < foundMenus.length; foundMenuIndex++) {
            var foundMenu = foundMenus[foundMenuIndex];
            if (!foundMenu || !foundMenu.IsValid || !foundMenu.IsValid()) continue;
            if (floatingMenus.indexOf(foundMenu) !== -1) continue;
            floatingMenus.push(foundMenu);
        }
    }
    for (var iMenu = 0; iMenu < floatingMenus.length; iMenu++) {
        var floatingMenu = floatingMenus[iMenu];
        if (!floatingMenu || !floatingMenu.IsValid || !floatingMenu.IsValid()) continue;
        try { floatingMenu.SetHasClass("DropDownMenuVisible", false); } catch(e9) { WarnLog("settings", "op failed: " + (e9 && e9.message ? e9.message : String(e9 || ""))); }
        try { floatingMenu.RemoveClass("DropDownMenuVisible"); } catch(e10) { WarnLog("settings", "op failed: " + (e10 && e10.message ? e10.message : String(e10 || ""))); }
        try { floatingMenu.visible = false; } catch(e11) { WarnLog("settings", "op failed: " + (e11 && e11.message ? e11.message : String(e11 || ""))); }
    }
}

function SetActiveTabAndRefresh(tabName) {
    if (!tabName || currentTab === tabName) return;
    var root = $.GetContextPanel();
    var tabBar = root.FindChildTraverse("SettingsTabBar");
    var list = root.FindChildTraverse("SettingsList");
    CloseOpenSettingsDropdowns(root);
    ClearSettingsSearchQuery(root);

    if (
        list && list.IsValid && list.IsValid() &&
        tabBar && tabBar.IsValid && tabBar.IsValid() &&
        !list.BHasClass("TabFading")
    ) {
        list.AddClass("TabFading");
        $.Schedule(0.2, function() {
            if (!list || !list.IsValid || !list.IsValid()) return;
            if (!tabBar || !tabBar.IsValid || !tabBar.IsValid()) return;
            currentTab = tabName;
            SyncTabActiveStates(tabBar);
            UpdateListContent(list, true);
            UpdatePresetHighlightPollingState();
            list.RemoveClass("TabFading");
        });
        return;
    }

    currentTab = tabName;
    SyncTabActiveStates(tabBar);
    if (list && list.IsValid && list.IsValid()) {
        UpdateListContent(list, true);
    }
    UpdatePresetHighlightPollingState();
}

// Config, presets, controls, and support subsystems extracted to panorama/scripts/ui/

function NormalizeSearchText(value) {
    if (value === undefined || value === null) return "";
    return String(value).toLowerCase();
}
// Settings tab definitions extracted to ui/ql_settings_tabs.js


function GetActiveSearchCollectSection() {
    if (!gSearchCollectState) return null;
    if (!gSearchCollectState.currentSection) {
        var fallbackSection = {
            title: "",
            rows: []
        };
        gSearchCollectState.sections.push(fallbackSection);
        gSearchCollectState.currentSection = fallbackSection;
    }
    return gSearchCollectState.currentSection;
}

function BuildSearchAliasList(label, configId, description, extraLabels) {
    var aliases = [];
    var seen = {};
    var pushAlias = function(value) {
        var normalized = NormalizeSearchText(value).trim();
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        aliases.push(normalized);
    };

    pushAlias(label);
    pushAlias(configId);
    pushAlias(description);

    if (Array.isArray(extraLabels)) {
        for (var i = 0; i < extraLabels.length; i++) {
            pushAlias(extraLabels[i]);
        }
    }

    var configText = String(configId || "");
    if (configText) {
        var compactConfig = NormalizeSearchText(configText).replace(/[^a-z0-9]+/g, "");
        pushAlias(compactConfig);
        var configTokens = configText.split(/[^A-Za-z0-9]+/);
        var acronym = "";
        for (var t = 0; t < configTokens.length; t++) {
            var token = String(configTokens[t] || "");
            if (!token || token === "ENABLE" || token === "DISABLE" || token === "SHOW" || token === "HIDE" || token === "USE" || token === "MODE") continue;
            pushAlias(token);
            if (/^[A-Z0-9]+$/.test(token) && token.length >= 2) {
                pushAlias(token.toLowerCase());
            }
            acronym += token.charAt(0);
        }
        if (acronym.length >= 2) pushAlias(acronym);
    }

    return aliases;
}

function BuildSearchCollectedRow(label, configId, type, min, max, step, options, subInfo, extraLabels) {
    var activeSection = GetActiveSearchCollectSection();
    return {
        label: label || "",
        configId: configId || "",
        type: type || "",
        min: min,
        max: max,
        step: step,
        options: options,
        subInfo: subInfo || "",
        tabTitle: gSearchCollectState ? String(gSearchCollectState.tab || "") : "",
        sectionTitle: activeSection ? String(activeSection.title || "") : "",
        aliases: BuildSearchAliasList(label, configId, subInfo, extraLabels)
    };
}

function BuildSearchSectionIndexCacheKey() {
    var langKey = GetSettingsLanguageKey();
    return "lang=" + langKey;
}

function InvalidateSearchSectionIndexCache() {
    gSearchSectionIndexCacheKey = "";
    gSearchSectionIndexCache = null;
    gConfigDiffLabelCacheKey = "";
    gConfigDiffLabelMap = null;
}

function GetCachedSearchSectionIndex() {
    var cacheKey = BuildSearchSectionIndexCacheKey();
    if (gSearchSectionIndexCache && gSearchSectionIndexCacheKey === cacheKey) {
        return gSearchSectionIndexCache;
    }
    var freshIndex = BuildSearchSectionIndex();
    gSearchSectionIndexCache = freshIndex;
    gSearchSectionIndexCacheKey = cacheKey;
    return freshIndex;
}

function IsSearchRowMatch(row, q) {
    return NormalizeSearchText(row.label).indexOf(q) !== -1 ||
        NormalizeSearchText(row.subInfo).indexOf(q) !== -1 ||
        NormalizeSearchText(row.configId).indexOf(q) !== -1 ||
        NormalizeSearchText(row.sectionTitle).indexOf(q) !== -1 ||
        NormalizeSearchText(row.tabTitle).indexOf(q) !== -1 ||
        (Array.isArray(row.aliases) && row.aliases.join(" ").indexOf(q) !== -1);
}

function BuildSearchSectionIndex() {
    var originalTab = currentTab;
    var index = [];
    try {
        var searchTabs = GetSettingsTabOrder();
        for (var i = 0; i < searchTabs.length; i++) {
            var tab = searchTabs[i];
            var tabLabel = LocalizeSettingsText(tab, true);
            var state = {
                tab: tabLabel,
                sections: [],
                currentSection: null
            };

            gSearchCollectMode = true;
            gSearchCollectState = state;
            currentTab = tab;
            try {
                RenderCurrentTabContent(null);
            } finally {
                gSearchCollectMode = false;
                gSearchCollectState = null;
            }

            var nonEmptySections = [];
            for (var s = 0; s < state.sections.length; s++) {
                if (state.sections[s].rows && state.sections[s].rows.length > 0) {
                    nonEmptySections.push(state.sections[s]);
                }
            }
            index.push({
                tab: tabLabel,
                sections: nonEmptySections
            });
        }
        return index;
    } finally {
        currentTab = originalTab;
        gSearchCollectMode = false;
        gSearchCollectState = null;
    }
}

function AnimateSearchResultPanel(panel, order) {
    if (!panel || !panel.IsValid()) return;
    panel.AddClass("SearchAnimatedItem");
    // Keep search results visible immediately while query is active.
    if (String(currentSearchQuery || "").trim().length > 0) {
        panel.AddClass("SearchAnimatedItemVisible");
        return;
    }
    var delay = 0.005 + (Math.min(order, 24) * 0.012);
    $.Schedule(delay, function() {
        if (panel.IsValid()) {
            panel.AddClass("SearchAnimatedItemVisible");
        }
    });
}

function RenderSearchResults(list, query) {
    var q = NormalizeSearchText(query).trim();
    if (q.length === 0) return false;

    var tabIndex = GetCachedSearchSectionIndex();
    var matchedTabs = [];

    for (var t = 0; t < tabIndex.length; t++) {
        var tabEntry = tabIndex[t];
        var includeWholeTab = NormalizeSearchText(tabEntry.tab).indexOf(q) !== -1;
        var matchedSections = [];

        for (var s = 0; s < tabEntry.sections.length; s++) {
            var section = tabEntry.sections[s];
            var sectionTitleMatch = NormalizeSearchText(section.title).indexOf(q) !== -1;
            var matchedRows = [];
            for (var r = 0; r < section.rows.length; r++) {
                if (IsSearchRowMatch(section.rows[r], q)) {
                    matchedRows.push(section.rows[r]);
                }
            }
            if (includeWholeTab || sectionTitleMatch) {
                matchedSections.push({
                    title: section.title,
                    rows: section.rows
                });
            } else if (matchedRows.length > 0) {
                matchedSections.push({
                    title: section.title,
                    rows: matchedRows
                });
            }
        }

        if (matchedSections.length > 0) {
            matchedTabs.push({
                tab: tabEntry.tab,
                sections: matchedSections
            });
        }
    }

    var animOrder = 0;

    var title = $.CreatePanel("Label", list, "");
    title.AddClass("GroupHeader");
    title.text = LocalizeSettingsText("Search Results", true);
    AnimateSearchResultPanel(title, animOrder++);

    if (matchedTabs.length === 0) {
        var noResults = $.CreatePanel("Label", list, "");
        noResults.AddClass("SearchEmptyLabel");
        noResults.text = LocalizeSettingsText("No results found", true);
        AnimateSearchResultPanel(noResults, animOrder++);
        return true;
    }

    for (var mt = 0; mt < matchedTabs.length; mt++) {
        var tabLabel = $.CreatePanel("Label", list, "");
        tabLabel.AddClass("SearchSectionLabel");
        tabLabel.text = matchedTabs[mt].tab;
        AnimateSearchResultPanel(tabLabel, animOrder++);

        for (var ms = 0; ms < matchedTabs[mt].sections.length; ms++) {
            var sectionEntry = matchedTabs[mt].sections[ms];
            if (sectionEntry.title && sectionEntry.title.length > 0) {
                var sectionTitlePanel = CreateSectionTitle(list, sectionEntry.title);
                AnimateSearchResultPanel(sectionTitlePanel, animOrder++);
            }
            for (var mr = 0; mr < sectionEntry.rows.length; mr++) {
                var row = sectionEntry.rows[mr];
                var rowPanel = null;
                var inlineSecondaryOption = null;
                if (Array.isArray(row.options)) {
                    for (var optionIndex = 0; optionIndex < row.options.length; optionIndex++) {
                        var searchOption = row.options[optionIndex];
                        if (searchOption && searchOption.inlineSecondaryCheckbox) {
                            inlineSecondaryOption = searchOption;
                            break;
                        }
                    }
                }
                gSearchResultRenderMode = true;
                try {
                    if (inlineSecondaryOption) {
                        rowPanel = CreateInlineSecondaryCheckboxToggleRow(
                            list,
                            row.label,
                            row.configId,
                            inlineSecondaryOption.secondaryLabel || "",
                            inlineSecondaryOption.inlineSecondaryCheckbox,
                            row.subInfo,
                            inlineSecondaryOption.secondaryDescription || "",
                            inlineSecondaryOption.rowOptions || {}
                        );
                    } else {
                        rowPanel = CreateRow(list, row.label, row.configId, row.type, row.min, row.max, row.step, row.options, row.subInfo);
                    }
                } finally {
                    gSearchResultRenderMode = false;
                }
                AnimateSearchResultPanel(rowPanel, animOrder++);
            }
            if (ms < matchedTabs[mt].sections.length - 1) {
                var sectionSep = CreateSeparator(list);
                AnimateSearchResultPanel(sectionSep, animOrder++);
            }
        }
        if (mt < matchedTabs.length - 1) {
            var tabSep = CreateSeparator(list);
            AnimateSearchResultPanel(tabSep, animOrder++);
        }
    }
    return true;
}

function RenderCurrentTabContent(list) {
    gCurrentSettingsSectionTitle = "";
    if (!gSearchCollectMode && currentTab !== "Presets") {
        if (typeof globalThis.ResetPresetButtonRegistry === "function") {
            globalThis.ResetPresetButtonRegistry();
        }
    }
    if (typeof QOL !== "undefined" && QOL.ui && QOL.ui.window && typeof QOL.ui.window.renderTab === "function") {
        QOL.ui.window.renderTab(currentTab, list);
        return;
    }
}

var UpdateListContent = function(list, forceRebuild) {
    if (!list || !list.IsValid()) return;
    QOL.tooltip.hideRowTooltip();
    CloseOpenSettingsDropdowns($.GetContextPanel(), { skipFocusTransfer: true });
    var shouldForce = (forceRebuild === true);
    var leavingSearchMode = false;
    var renderSig = BuildSettingsListRenderSignature();
    var searchActive = IsSettingsSearchActiveQuery();
    SetActiveSettingsListRenderSignature(renderSig);

    if (searchActive) {
        RenderSettingsSearchResultsOnly(list);
        gSettingsListLastRenderSig = renderSig;
        return;
    }

    if (gSettingsListSearchModeActive) {
        shouldForce = true;
        gSettingsListSearchModeActive = false;
        leavingSearchMode = true;
    }

    if (!shouldForce && renderSig === gSettingsListLastRenderSig) {
        ShowSettingsListTabPanel(list, renderSig);
        SoftRefreshSettingsListContent(list);
        return;
    }

    var shouldRebuildCurrentSig = shouldForce && !leavingSearchMode;
    var panelEntry = EnsureSettingsListContentPanelForSignature(list, renderSig, shouldRebuildCurrentSig);
    var contentPanel = panelEntry ? panelEntry.panel : null;
    var contentCreated = panelEntry ? (panelEntry.created === true) : false;
    if (!contentPanel || !contentPanel.IsValid || !contentPanel.IsValid()) return;

    ShowSettingsListTabPanel(list, renderSig);

    if (contentCreated || shouldRebuildCurrentSig) {
        QOL.preview.hideAll();
        ResetSettingsListRowSyncRegistry();
        contentPanel.RemoveAndDeleteChildren();
        RenderCurrentTabContent(contentPanel);
    } else {
        SoftRefreshSettingsListContent(list);
    }

    gSettingsListLastRenderSig = renderSig;
    QueueActivePresetHighlightRefresh(0.02);
};

// Window dragging logic extracted to ui/drag.js

$.BuildUI = function() {
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    var list = $.GetContextPanel().FindChildTraverse("SettingsList");
    var body = $.GetContextPanel().FindChildTraverse("SettingsBody");
    if (!list || !win) return;
    SyncConfigFromStorage();
    var tabHost = body || win;
    win.SetPanelEvent("oncancel", function() {
        $.ForceCloseModSettings();
    });
    if (currentTab === "Layout") currentTab = "Overlay";
    if (currentTab === "Main") currentTab = "Presets";
    if (currentTab === "HUDControls") currentTab = "UI";
    var tabBar = tabHost.FindChildTraverse("SettingsTabBar");
    if (tabBar) {
        var hasLegacyLayoutTab = tabBar.FindChildTraverse("TabButton_Layout");
        var hasLegacyMainTab = tabBar.FindChildTraverse("TabButton_Main");
        var hasPresetsTab = tabBar.FindChildTraverse("TabButton_Presets");
        var hasCrosshairTab = tabBar.FindChildTraverse("TabButton_Crosshair");
        var hasHealthbarTab = tabBar.FindChildTraverse("TabButton_Healthbar");
        var hasHudTab = tabBar.FindChildTraverse("TabButton_HUD");
        var hasUiTab = tabBar.FindChildTraverse("TabButton_UI");
        var hasOverlayTab = tabBar.FindChildTraverse("TabButton_Overlay");
        var hasMinimapTab = tabBar.FindChildTraverse("TabButton_Minimap");
        var hasAudioTab = tabBar.FindChildTraverse("TabButton_Audio");
        var hasConfigTab = tabBar.FindChildTraverse("TabButton_Config");
        if (hasLegacyLayoutTab || hasLegacyMainTab || !hasPresetsTab || !hasCrosshairTab || !hasHealthbarTab || !hasHudTab || !hasUiTab || !hasOverlayTab || !hasMinimapTab || !hasAudioTab || !hasConfigTab) {
            tabBar.DeleteAsync(0);
            tabBar = null;
        }
    }
    var tabListHost = null;
    var contentHost = tabHost.FindChildTraverse("SettingsContentHost");
    if (!contentHost) {
        contentHost = $.CreatePanel("Panel", tabHost, "SettingsContentHost");
    }
    if (list.GetParent && list.GetParent() !== contentHost) {
        list.SetParent(contentHost);
    }

    if (!tabBar) {
        var staleTabBar = win.FindChildTraverse("SettingsTabBar");
        if (staleTabBar && staleTabBar.GetParent && staleTabBar.GetParent() !== tabHost) {
            staleTabBar.DeleteAsync(0);
        }
        tabBar = $.CreatePanel("Panel", tabHost, "SettingsTabBar");
    }
    tabHost.MoveChildBefore(tabBar, contentHost);

    var legacySearchWrap = tabBar.FindChildTraverse("SettingsSearchWrap");
    if (legacySearchWrap) legacySearchWrap.DeleteAsync(0);
    var legacyActions = tabBar.FindChildTraverse("SettingsTabRailActions");
    if (legacyActions) legacyActions.DeleteAsync(0);
    var legacySpacer = tabBar.FindChildTraverse("SettingsTabRailSpacer");
    if (legacySpacer) legacySpacer.DeleteAsync(0);

    tabListHost = tabBar.FindChildTraverse("SettingsTabRailTabs");
    if (!tabListHost) {
        tabListHost = $.CreatePanel("Panel", tabBar, "SettingsTabRailTabs");
    }

    if (typeof tabListHost.RemoveAndDeleteChildren === "function") {
        tabListHost.RemoveAndDeleteChildren();
    }

    var tabGroups = GetSettingsTabGroups();
    for (var gi = 0; gi < tabGroups.length; gi++) {
        var group = tabGroups[gi];
        var groupPanel = $.CreatePanel("Panel", tabListHost, "SettingsTabRailGroup_" + group.title.replace(" ", ""));
        groupPanel.AddClass("SettingsTabRailGroup");
        var groupLabel = $.CreatePanel("Label", groupPanel, "");
        groupLabel.AddClass("SettingsTabRailGroupLabel");
        groupLabel.text = LocalizeSettingsText(group.title, true);
        var groupRule = $.CreatePanel("Panel", groupPanel, "");
        groupRule.AddClass("SettingsTabRailGroupRule");

        var groupTabs = $.CreatePanel("Panel", groupPanel, "");
        groupTabs.AddClass("SettingsTabRailGroupTabs");

        for (var ti = 0; ti < group.tabs.length; ti++) {
            (function(catName) {
                var tabClassSuffix = String(catName || "").replace(/[^A-Za-z0-9]/g, "");
                var tabId = "TabButton_" + catName.replace(" ", "");
                var tab = $.CreatePanel("Button", groupTabs, tabId);
                tab.AddClass("TabItem");
                tab.AddClass("TabItem_" + tabClassSuffix);
                var tabIconSrc = GetSettingsTabIconSource(catName);
                if (tabIconSrc) {
                    var tabIcon = $.CreatePanel("Image", tab, "TabIcon", {
                        src: tabIconSrc,
                        defaultsrc: "",
                        scaling: "contain"
                    });
                    tabIcon.AddClass("TabIcon");
                    tabIcon.AddClass("TabIcon_" + tabClassSuffix);
                }
                var tabLbl = $.CreatePanel("Label", tab, "TabLabel");
                var displayName = GetSettingsTabDisplayName(catName);
                // Localize every tab name, including Config ("Settings"). Proper nouns
                // not present in the translation map (e.g. MOGLOCK) pass through unchanged.
                tabLbl.text = LocalizeSettingsText(displayName, true);
                tab.SetHasClass("Active", catName === currentTab);
                tab.SetPanelEvent("onactivate", function() {
                    SetActiveTabAndRefresh(catName);
                });
            })(group.tabs[ti]);
        }
    }
    var tabSpacerMain = tabBar.FindChildTraverse("SettingsTabRailSpacerMain");
    if (!tabSpacerMain) {
        tabSpacerMain = $.CreatePanel("Panel", tabBar, "SettingsTabRailSpacerMain");
    }
    tabSpacerMain.AddClass("SettingsTabRailSpacerMain");

    var tabFooter = tabBar.FindChildTraverse("SettingsTabRailFooter");
    if (!tabFooter) {
        tabFooter = $.CreatePanel("Panel", tabBar, "SettingsTabRailFooter");
    }
    tabFooter.AddClass("SettingsTabRailFooter");
    var footerRule = tabFooter.FindChildTraverse("SettingsTabRailFooterRule");
    if (!footerRule) {
        footerRule = $.CreatePanel("Panel", tabFooter, "SettingsTabRailFooterRule");
    }
    footerRule.AddClass("SettingsTabRailFooterRule");

    var isRuFooter = IsRussianSettingsLanguage();
    var newsFooterBtn = tabFooter.FindChildTraverse("FooterNewsLinkButton");
    if (newsFooterBtn) {
        newsFooterBtn.DeleteAsync(0);
        newsFooterBtn = null;
    }

    var saveFooterBtn = tabFooter.FindChildTraverse("FooterSaveBuildButton");
    var discordFooterBtn = tabFooter.FindChildTraverse("FooterDiscordRailButton");
    if (!discordFooterBtn) {
        discordFooterBtn = $.CreatePanel("Button", tabFooter, "FooterDiscordRailButton");
    }
    discordFooterBtn.AddClass("TabItem");
    discordFooterBtn.AddClass("FooterDiscordRailBtn");
    var discordFooterLabel = discordFooterBtn.FindChildTraverse("TabLabel");
    if (!discordFooterLabel) {
        discordFooterLabel = $.CreatePanel("Label", discordFooterBtn, "TabLabel");
    }
    discordFooterLabel.text = LocalizeSettingsText("DISCORD", true);
    discordFooterBtn.SetPanelEvent("onactivate", function() {
        $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/npCvuMcTY7");
    });
    EnsureDiscordTextureLogo(discordFooterBtn, "FooterDiscordLogoTexture", "FooterDiscordLogoTexture");
    var discordFooterIcon = discordFooterBtn.FindChildTraverse("FooterDiscordLogoTexture");
    if (discordFooterIcon && discordFooterBtn.MoveChildBefore) {
        try { discordFooterBtn.MoveChildBefore(discordFooterIcon, discordFooterLabel); } catch(eMoveDiscordIcon) { WarnLog("settings", "op failed: " + (eMoveDiscordIcon && eMoveDiscordIcon.message ? eMoveDiscordIcon.message : String(eMoveDiscordIcon || ""))); }
    }

    if (!saveFooterBtn) {
        saveFooterBtn = $.CreatePanel("Button", tabFooter, "FooterSaveBuildButton");
    }
        saveFooterBtn.AddClass("TabItem");
        saveFooterBtn.AddClass("FooterSaveBuildTab");
        var saveFooterLabel = saveFooterBtn.FindChildTraverse("TabLabel");
        if (!saveFooterLabel) {
            saveFooterLabel = $.CreatePanel("Label", saveFooterBtn, "TabLabel");
        }
        var saveFooterIcon = saveFooterBtn.FindChildTraverse("TabIcon");
        if (!saveFooterIcon) {
            saveFooterIcon = $.CreatePanel("Image", saveFooterBtn, "TabIcon", {
                src: "s2r://panorama/images/icons/icon_download.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
        }
        saveFooterIcon.AddClass("TabIcon");
        saveFooterIcon.AddClass("FooterSaveBuildIcon");
        if (saveFooterBtn.MoveChildBefore) {
            try { saveFooterBtn.MoveChildBefore(saveFooterIcon, saveFooterLabel); } catch(eMoveSaveIcon) { WarnLog("settings", "op failed: " + (eMoveSaveIcon && eMoveSaveIcon.message ? eMoveSaveIcon.message : String(eMoveSaveIcon || ""))); }
        }
        var footerSaveDefaultText = LocalizeSettingsText("SAVE", true);
        saveFooterLabel.text = footerSaveDefaultText;
        saveFooterBtn.SetPanelEvent("onmouseover", function() {
            if (!saveFooterBtn || !saveFooterBtn.IsValid || !saveFooterBtn.IsValid()) return;
            QOL.tooltip.hideTextTooltip();
            QOL.tooltip.cancelHide();
            QOL.tooltip.showRowTooltip(
                saveFooterBtn,
                "",
                SETTINGS_SAVE_LOADER_ENABLED ? SETTINGS_SAVE_HOVER_WARNING : SETTINGS_SAVE_DISABLED_WARNING,
                PERF_IMPACT_TIER_NONE,
                "",
                { footerSaveWarning: true }
            );
        });
        saveFooterBtn.SetPanelEvent("onmouseout", function() {
            QOL.tooltip.hideTooltipDeferred("footer_save_mouseout");
        });
        saveFooterBtn.SetPanelEvent("onactivate", function() {
            QOL.tooltip.hideRowTooltip();
            ActivateBuildSaveFromUi(saveFooterBtn, saveFooterLabel);
        });
        if (tabFooter.MoveChildBefore) {
            try { tabFooter.MoveChildBefore(discordFooterBtn, saveFooterBtn); } catch(eMoveDiscordFooter) { WarnLog("settings", "op failed: " + (eMoveDiscordFooter && eMoveDiscordFooter.message ? eMoveDiscordFooter.message : String(eMoveDiscordFooter || ""))); }
        }

    var footerVersionLabel = tabFooter.FindChildTraverse("FooterVersionLabel");
    if (footerVersionLabel) {
        footerVersionLabel.DeleteAsync(0);
        footerVersionLabel = null;
    }
    // Use Button so onactivate fires — otherwise identical to the other footer buttons
    footerVersionLabel = $.CreatePanel("Button", tabFooter, "FooterVersionLabel");
    footerVersionLabel.AddClass("TabItem");
    footerVersionLabel.AddClass("FooterVersionLabel");
    var footerVersionIcon = $.CreatePanel("Image", footerVersionLabel, "FooterVersionIcon", {
        src: "s2r://panorama/images/icons/properties/charge.vsvg",
        defaultsrc: "",
        scaling: "contain"
    });
    footerVersionIcon.AddClass("TabIcon");
    footerVersionIcon.AddClass("FooterVersionIcon");
    var footerVersionText = $.CreatePanel("Label", footerVersionLabel, "FooterVersionLabelText");
    footerVersionText.AddClass("TabLabel");
    footerVersionText.AddClass("FooterVersionLabelText");
    footerVersionText.text = MOD_DISPLAY_VERSION;

    // Single click switches to hidden Dev tab (perf controls)
    footerVersionLabel.SetPanelEvent("onactivate", function() {
        SetActiveTabAndRefresh("Dev");
    });

    var staleDiscordFooterBtn = tabFooter.FindChildTraverse("FooterDiscordLinkButton");
    if (staleDiscordFooterBtn) {
        staleDiscordFooterBtn.DeleteAsync(0);
        staleDiscordFooterBtn = null;
    }

    var supportFooterBtn = tabFooter.FindChildTraverse("FooterSupportTabButton");
    if (supportFooterBtn) {
        supportFooterBtn.DeleteAsync(0);
    }

    var sideNavCreditRow = tabFooter.FindChildTraverse("SideNavCreditRow");
    if (sideNavCreditRow) {
        sideNavCreditRow.DeleteAsync(0);
    }
    var staleSideNavCreditRowTabs = tabListHost.FindChildTraverse("SideNavCreditRow");
    if (staleSideNavCreditRowTabs) {
        staleSideNavCreditRowTabs.DeleteAsync(0);
    }
    var staleSideNavCoffeeBtn = tabBar.FindChildTraverse("SideNavCoffeeBtn");
    if (staleSideNavCoffeeBtn) staleSideNavCoffeeBtn.DeleteAsync(0);
    var staleSideNavSupportBtn = tabBar.FindChildTraverse("SideNavSupportBtn");
    if (staleSideNavSupportBtn) staleSideNavSupportBtn.DeleteAsync(0);

    tabBar.MoveChildBefore(tabListHost, tabSpacerMain);
    tabBar.MoveChildBefore(tabSpacerMain, tabFooter);

    var headerHost = win.FindChildTraverse("SettingsHeader");
    var searchWrapExisting = headerHost ? headerHost.FindChildTraverse("SettingsSearchWrap") : null;
    if (!searchWrapExisting) {
        var searchWrapAny = tabHost.FindChildTraverse("SettingsSearchWrap");
        if (!searchWrapAny) {
            searchWrapAny = contentHost.FindChildTraverse("SettingsSearchWrap");
        }
        if (searchWrapAny) {
            searchWrapExisting = searchWrapAny;
            if (headerHost) {
                searchWrapExisting.SetParent(headerHost);
            }
        } else if (headerHost) {
            searchWrapExisting = $.CreatePanel("Panel", headerHost, "SettingsSearchWrap");
        }
    } else if (searchWrapExisting.GetParent && headerHost && searchWrapExisting.GetParent() !== headerHost) {
        searchWrapExisting.SetParent(headerHost);
    }
    if (searchWrapExisting) {
        searchWrapExisting.AddClass("SettingsHeaderSearchWrap");
        searchWrapExisting.hittest = true;
        searchWrapExisting.hittestchildren = true;
        searchWrapExisting.style.zIndex = "4";
        var searchIconExisting = searchWrapExisting.FindChildTraverse("SettingsNavigationSearchIcon");
        if (!searchIconExisting) {
            searchIconExisting = $.CreatePanel("Image", searchWrapExisting, "SettingsNavigationSearchIcon", {
                src: "s2r://panorama/images/control_icons/24px/search.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
        }
        var searchInputExisting = searchWrapExisting.FindChildTraverse("SettingsSearchInput");
        if (!searchInputExisting) {
            searchInputExisting = $.CreatePanel("TextEntry", searchWrapExisting, "SettingsSearchInput");
        }
        // Keep the query + clear-button state in sync immediately (both cheap), but
        // debounce the expensive list rebuild so a burst of keystrokes coalesces into
        // a single render instead of one full teardown+rebuild per character.
        var syncSearchQueryState = function() {
            currentSearchQuery = searchInputExisting.text || "";
            UpdateSettingsSearchUiState($.GetContextPanel());
        };
        searchInputExisting.SetPanelEvent("ontextentrychange", function() {
            syncSearchQueryState();
            ScheduleSettingsSearchRender();
        });
        // Enter/submit renders immediately (no point waiting out the debounce window).
        searchInputExisting.SetPanelEvent("oninputsubmit", function() {
            syncSearchQueryState();
            FlushSettingsSearchRender();
        });
        var searchClearExisting = searchWrapExisting.FindChildTraverse("SettingsSearchClear");
        if (!searchClearExisting) {
            searchClearExisting = $.CreatePanel("Button", searchWrapExisting, "SettingsSearchClear");
            var searchClearLabel = $.CreatePanel("Label", searchClearExisting, "");
            searchClearLabel.text = "X";
        }
        searchClearExisting.hittest = true;
        searchClearExisting.hittestchildren = true;
        var searchClearLabelExisting = null;
        try {
            var clearChildren = searchClearExisting.Children ? searchClearExisting.Children() : [];
            if (clearChildren && clearChildren.length > 0) {
                searchClearLabelExisting = clearChildren[0];
            }
        } catch (eClearChildren) {
            searchClearLabelExisting = null;
        }
        if (!searchClearLabelExisting) {
            searchClearLabelExisting = $.CreatePanel("Label", searchClearExisting, "");
            searchClearLabelExisting.text = "X";
        }
        searchClearLabelExisting.hittest = false;
        searchClearLabelExisting.hittestchildren = false;
        searchClearExisting.SetPanelEvent("onactivate", function() {
            var rootPanel = $.GetContextPanel();
            ClearSettingsSearchQuery(rootPanel);
            CancelSettingsSearchRender();
            var liveList = GetSettingsListPanel();
            if (liveList) UpdateListContent(liveList, true);
        });
        if ((searchInputExisting.text || "") !== currentSearchQuery) {
            searchInputExisting.text = currentSearchQuery;
        }
        UpdateSettingsSearchUiState($.GetContextPanel());
    }

    var staleSubHeader = contentHost.FindChildTraverse("SettingsSubHeaderBar");
    if (staleSubHeader) staleSubHeader.DeleteAsync(0);

    var staleSubHeaderActions = tabHost.FindChildTraverse("SettingsSubHeaderActions");
    if (staleSubHeaderActions) staleSubHeaderActions.DeleteAsync(0);

    var dragBtnRailExisting = tabHost.FindChildTraverse("DragToggleBtnRail");
    if (dragBtnRailExisting) dragBtnRailExisting.DeleteAsync(0);
    var previewBtnRailExisting = tabHost.FindChildTraverse("PreviewToggleBtnRail");
    if (previewBtnRailExisting) previewBtnRailExisting.DeleteAsync(0);

    var impBtnRailExisting = tabHost.FindChildTraverse("ImportSettingsBtnRail");
    if (impBtnRailExisting) impBtnRailExisting.DeleteAsync(0);
    var expBtnRailExisting = tabHost.FindChildTraverse("ExportSettingsBtnRail");
    if (expBtnRailExisting) expBtnRailExisting.DeleteAsync(0);

    SyncTabActiveStates(tabBar);
    UpdateListContent(list, true);
    UpdatePresetHighlightPollingState();

    var header = win.FindChildTraverse("SettingsHeader");
    if (header) {
        var headerTitle = header.FindChildTraverse("SettingsTitle");
        var headerLogo = header.FindChildTraverse("SettingsHeaderMogLogo");
        if (!headerLogo) {
            headerLogo = $.CreatePanel("Image", header, "SettingsHeaderMogLogo", {
                src: GetSettingsTheme() === SETTINGS_THEME_MUNFINS ? SETTINGS_HEADER_MUNFINS_LOGO_SRC : (GetSettingsTheme() === SETTINGS_THEME_DEFAULT ? SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC : SETTINGS_HEADER_MOG_LOGO_THEME_SRC),
                defaultsrc: "",
                scaling: "contain"
            });
        }
        headerLogo.hittest = false;
        headerLogo.hittestchildren = false;
        try { headerLogo.SetImage(GetSettingsTheme() === SETTINGS_THEME_MUNFINS ? SETTINGS_HEADER_MUNFINS_LOGO_SRC : (GetSettingsTheme() === SETTINGS_THEME_DEFAULT ? SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC : SETTINGS_HEADER_MOG_LOGO_THEME_SRC)); } catch(eHeaderLogo) { WarnLog("settings", "op failed: " + (eHeaderLogo && eHeaderLogo.message ? eHeaderLogo.message : String(eHeaderLogo || ""))); }
        if (headerTitle) {
    headerTitle.text = LocalizeSettingsText("LOCK", true);
            headerTitle.AddClass("SettingsHeaderTitleWordmark");
            headerTitle.hittest = false;
            headerTitle.hittestchildren = false;
            var headerTitleAccent = header.FindChildTraverse("SettingsTitleAccent");
            if (!headerTitleAccent) {
                headerTitleAccent = $.CreatePanel("Label", header, "SettingsTitleAccent");
            }
            headerTitleAccent.AddClass("SettingsHeaderTitleWordmark");
    headerTitleAccent.text = GetSettingsTheme() === SETTINGS_THEME_MUNFINS ? "Munfins" : LocalizeSettingsText("QOL", true);
            headerTitleAccent.hittest = false;
            headerTitleAccent.hittestchildren = false;
            if (header.MoveChildBefore) {
                try { header.MoveChildBefore(headerLogo, headerTitle); } catch(eMoveHeaderLogo) { WarnLog("settings", "op failed: " + (eMoveHeaderLogo && eMoveHeaderLogo.message ? eMoveHeaderLogo.message : String(eMoveHeaderLogo || ""))); }
                try { header.MoveChildBefore(headerTitleAccent, headerTitle); } catch(eMoveHeaderAccent) { WarnLog("settings", "op failed: " + (eMoveHeaderAccent && eMoveHeaderAccent.message ? eMoveHeaderAccent.message : String(eMoveHeaderAccent || ""))); }
            }
        }
        var headerVer = header.FindChildTraverse("ModVersionLabelTop");
        if (headerVer) {
            try { headerVer.DeleteAsync(0); } catch(eDeleteHeaderVer) { WarnLog("settings", "op failed: " + (eDeleteHeaderVer && eDeleteHeaderVer.message ? eDeleteHeaderVer.message : String(eDeleteHeaderVer || ""))); }
            headerVer = null;
        }
        headerVer = $.CreatePanel("Button", header, "ModVersionLabelTop");
        headerVer.AddClass("HeaderMoglockLinkButton");
        headerVer.visible = GetSettingsTheme() !== SETTINGS_THEME_MUNFINS;
        headerVer.style.visibility = GetSettingsTheme() === SETTINGS_THEME_MUNFINS ? "collapse" : "visible";
        headerVer.hittest = true;
        headerVer.hittestchildren = true;
        headerVer.style.zIndex = "7";
        try { headerVer.SetPanelEvent("onactivate", function () {
            try { $.DispatchEvent("ExternalBrowserGoToURL", "https://moglock.gg/"); } catch(eHeaderMoglockClick1) { WarnLog("settings", "op failed: " + (eHeaderMoglockClick1 && eHeaderMoglockClick1.message ? eHeaderMoglockClick1.message : String(eHeaderMoglockClick1 || ""))); }
        }); } catch(eHeaderMoglockClick) { WarnLog("settings", "op failed: " + (eHeaderMoglockClick && eHeaderMoglockClick.message ? eHeaderMoglockClick.message : String(eHeaderMoglockClick || ""))); }
        var headerVerPrefix = $.CreatePanel("Label", headerVer, "ModVersionLabelTopPrefix");
    headerVerPrefix.text = LocalizeSettingsText("by", true);
        var headerVerDomain = $.CreatePanel("Label", headerVer, "ModVersionLabelTopDomain");
    headerVerDomain.text = LocalizeSettingsText("moglock.gg", true);
        ApplySettingsHeaderLogoTheme(GetSettingsTheme());
        var closeBtnHeader = header.FindChildTraverse("CloseBtn");
        if (closeBtnHeader) {
            var headerDiscordBtn = header.FindChildTraverse("HeaderDiscordLinkButton");
            if (headerDiscordBtn) {
                headerDiscordBtn.DeleteAsync(0);
                headerDiscordBtn = null;
            }

            var headerCenterHost = header.FindChildTraverse("SettingsHeaderCenterHost");
            if (!headerCenterHost) {
                headerCenterHost = $.CreatePanel("Panel", header, "SettingsHeaderCenterHost");
            }
            headerCenterHost.style.zIndex = "4";
            header.MoveChildBefore(headerCenterHost, closeBtnHeader);
            if (header.MoveChildBefore) {
                try { header.MoveChildBefore(headerVer, headerCenterHost); } catch(eMoveHeaderVerBack) { WarnLog("settings", "op failed: " + (eMoveHeaderVerBack && eMoveHeaderVerBack.message ? eMoveHeaderVerBack.message : String(eMoveHeaderVerBack || ""))); }
            }

            if (searchWrapExisting && searchWrapExisting.IsValid && searchWrapExisting.IsValid()) {
                if (searchWrapExisting.GetParent && searchWrapExisting.GetParent() !== headerCenterHost) {
                    searchWrapExisting.SetParent(headerCenterHost);
                }
            }
            closeBtnHeader.style.horizontalAlign = "right";
            closeBtnHeader.style.verticalAlign = "center";
            closeBtnHeader.SetPanelEvent("onactivate", function() {
                $.ForceCloseModSettings();
            });
        }
    }

    var footer = win.FindChildTraverse("SettingsFooter");
    if (footer) {
        footer.DeleteAsync(0);
    }

    if (typeof globalThis.SetupSettingsWindowDragging === "function") {
        globalThis.SetupSettingsWindowDragging(win.FindChildTraverse("SettingsHeader"), win);
    }
    QOLEnsureFriendsSearchHandlers();
    gSettingsUiBuilt = true;

};

$.ToggleSettingsWindow = function() {
    var nowToggleMs = GetNowMs();
    if (nowToggleMs < gSettingsToggleDebounceUntilMs) return;
    gSettingsToggleDebounceUntilMs = nowToggleMs + 220;
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (win) {
        win.ToggleClass("Visible");
        if (win.BHasClass("Visible")) {
            gSettingsOpenGuardUntilMs = GetNowMs() + 350;
            gSettingsOpenedInHideout = IsInHideoutForBuildSave();
            try { QOL.tooltip.setThemeActive(true); } catch(eTooltipOpen) { WarnLog("settings", "op failed: " + (eTooltipOpen && eTooltipOpen.message ? eTooltipOpen.message : String(eTooltipOpen || ""))); }
            try {
                if (!gSettingsUiBuilt) {
                    $.BuildUI();
                } else {
                    SyncConfigFromStorage();
                    var list = $.GetContextPanel().FindChildTraverse("SettingsList");
                    if (list) {
                        UpdateListContent(list, true);
                    }
                    UpdatePresetHighlightPollingState();
                }
            } catch (eBuildOpen) {
            }
            try {
                if (QOL.updateChecker && QOL.updateChecker.onSettingsOpened) {
                    QOL.updateChecker.onSettingsOpened();
                }
            } catch (eUpdateCheck) {
                WarnLog("update_checker", "op failed: " + (eUpdateCheck && eUpdateCheck.message ? eUpdateCheck.message : String(eUpdateCheck || "")));
            }
            try { win.SetFocus(); } catch(eFocusOpen) { WarnLog("settings", "op failed: " + (eFocusOpen && eFocusOpen.message ? eFocusOpen.message : String(eFocusOpen || ""))); }
            if (gSettingsOpenedInHideout) {
                StartSettingsGameTransitionWatch();
            }
        } else {
            StopSettingsGameTransitionWatch();
            gSettingsOpenedInHideout = false;
            QOL.tooltip.setThemeActive(false);
            QOL.tooltip.hideRowTooltip();
            StopPresetHighlightPolling();
            QOL.preview.hideAll();
            CloseSettingsSideModalsIfOpen();
            if (QOL.arcade) QOL.arcade.closeAllModals();
        }
    }
};

$.ForceCloseModSettings = function() {
    if (GetNowMs() < gSettingsOpenGuardUntilMs) return;
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (win) {
        win.RemoveClass("Visible");
    }
    StopSettingsGameTransitionWatch();
    gSettingsOpenedInHideout = false;
    QOL.tooltip.setThemeActive(false);
    QOL.tooltip.hideRowTooltip();
    StopPresetHighlightPolling();
    QOL.preview.hideAll();
    CloseSettingsSideModalsIfOpen();
    if (QOL.arcade) QOL.arcade.closeAllModals();
    $.DispatchEvent("CitadelResumePlaying", $.GetContextPanel());
};

try {
    $.RegisterForUnhandledEvent("CitadelResumePlaying", function() {
        if (GetNowMs() < gSettingsOpenGuardUntilMs) return;
        var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
        if (win) {
            win.RemoveClass("Visible");
        }
        StopSettingsGameTransitionWatch();
        gSettingsOpenedInHideout = false;
        QOL.tooltip.setThemeActive(false);
        QOL.tooltip.hideRowTooltip();
        StopPresetHighlightPolling();
        QOL.preview.hideAll();
        CloseSettingsSideModalsIfOpen();
		if (QOL.arcade) QOL.arcade.closeAllModals();
    });
} catch(e) {
    $.Msg("[QOLLock][Settings] CitadelResumePlaying event not available: " + (e && e.message ? e.message : String(e)));
}

try {
    $.RegisterForUnhandledEvent("CitadelGameStateChanged", function() {
        HandleSettingsGameTransitionSignal("CitadelGameStateChanged");
    });
} catch(e) {
    $.Msg("[QOLLock][Settings] CitadelGameStateChanged event not available: " + (e && e.message ? e.message : String(e)));
}

// NOTE: CitadelConnectedToGame + CitadelMatchStateChanged removed —
// neither event name exists in the engine (verified against decompiled
// panoramauiclient.dll + dispatch_events.txt, 2026-06-20).
// The correct event is CitadelConnectedToGameServer but it fires at a
// different lifecycle point. HandleSettingsGameTransitionSignal is
// already triggered by CitadelGameStateChanged + CitadelResumePlaying.

SyncConfigFromStorage();
QOL.preview.startHeroHintPublisher();
