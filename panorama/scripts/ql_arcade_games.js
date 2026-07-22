// ql_arcade_games.js — Arcade games (Minesweeper, Flappy Bat, Aim Trainer, Train Tracking,
// Whack-a-Rem, Blackjack) + On-Death arcade bridge
// Extracted from ql_settings.js, Phase 2
(function() {
    'use strict';

    // ── QOL.import() for settings context (ql_utils.js loads before ql_shared_presets.js) ──
    var _deps = QOL.import(["utils"]);
    var Utils = _deps.utils;

    // Dependencies injected by ql_settings.js at init time
    var _Localize, _PrepareModal, _WarnLog, _FindRoot;
    
    QOL.arcade = {
        init: function(deps) {
            _Localize = deps.localize || function(t) { return t; };
            _PrepareModal = deps.prepareModal || function() {};
            _WarnLog = deps.warnLog || function() {};
            _FindRoot = deps.findRoot || function() { return null; };
        },
        updateBridgePollerState: UpdateOnDeathArcadeBridgePollerState,
        isAnyModalOpen: IsAnyArcadeModalOpen,
        closeAllModals: CloseAllArcadeModalsIfOpen,
        // Phase 2 Step C: Export modal openers for settings UI buttons
        openMinesweeper: OpenMinesweeperModal,
        openFlappy: OpenFlappyModal,
        openAimTrainer: OpenAimTrainerModal,
        openTrainTracking: OpenTrainTrackingModal,
        openWhackRem: OpenWhackRemModal,
        openBlackjack: OpenBlackjackModal,
        openRandom: OpenRandomArcadeModal
    };
    
const ON_DEATH_ARCADE_REQUEST_ATTR = "QOL_ON_DEATH_ARCADE_REQUEST";
const ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR = "QOL_ON_DEATH_ARCADE_REQUEST_TOKEN";
const ON_DEATH_ARCADE_ACTIVE_ATTR = "QOL_ON_DEATH_ARCADE_ACTIVE";
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
var gMinimapSizePreviewPanel = null;
var gMinimapSizePreviewCircle = null;
var gMinimapSizePreviewLabel = null;
var gMinimapSizePreviewHideToken = 0;
var gMinimapPreviewBaseRight = 30;
var gMinimapPreviewBaseBottom = 30;

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
var gZoomMinimapPreviewPanel = null;
var gZoomMinimapPreviewCircle = null;
var gZoomMinimapPreviewLabel = null;
var gZoomMinimapPreviewHideToken = 0;
var gZoomPreviewBaseX = 0;
var gZoomPreviewBaseY = 0;
var gZoomPreviewMode = "ALT";
var gZipBoostPreviewPanel = null;
var gZipBoostPreviewBox = null;
var gZipBoostPreviewLabel = null;
var gZipBoostPreviewHideToken = 0;
var gZipBoostPreviewBaseX = -520;
var gZipBoostPreviewBaseY = 20;
var gCrosshairStatsPreviewPanel = null;
var gCrosshairStatsPreviewBox = null;
var gCrosshairStatsPreviewLabel = null;
var gCrosshairStatsPreviewHideToken = 0;
var gCrosshairStatsPreviewBaseX = 130;
var gCrosshairStatsPreviewBaseY = 0;
var gUnsecuredSoulsPreviewPanel = null;
var gUnsecuredSoulsPreviewLabel = null;
var gUnsecuredSoulsPreviewHideToken = 0;
var gUnsecuredSoulsPreviewBaseX = -520;
var gUnsecuredSoulsPreviewBaseY = 110;
var gCompassPreviewPanel = null;
var gCompassPreviewBox = null;
var gCompassPreviewLabel = null;
var gCompassPreviewHideToken = 0;
var gCompassPreviewBaseX = 0;
var gCompassPreviewBaseY = 120;
// Speed has its own independent preview panel (mirrors the in-game QOLSpeedRoot,
// a sibling of the compass root — not a child of it).
var gSpeedPreviewPanel = null;
var gSpeedPreviewLabel = null;
var gSpeedPreviewHideToken = 0;
var gKeyboardOverlayPreviewPanel = null;
var gKeyboardOverlayPreviewBox = null;
var gKeyboardOverlayPreviewLabel = null;
var gKeyboardOverlayPreviewHideToken = 0;
var gKeyboardOverlayPreviewBaseX = 150;
var gKeyboardOverlayPreviewBaseY = 300;
var gItemCooldownPreviewPanel = null;
var gItemCooldownPreviewRow = null;
var gItemCooldownPreviewIcon = null;
var gItemCooldownPreviewLabel = null;
var gItemCooldownPreviewHideToken = 0;
var gAmmoPreviewPanel = null;
var gAmmoPreviewCurrentLabel = null;
var gAmmoPreviewTotalLabel = null;
var gAmmoPreviewHideToken = 0;
var gReloadCooldownPreviewPanel = null;
var gReloadCooldownPreviewRing = null;
var gReloadCooldownPreviewLabel = null;
var gReloadCooldownPreviewHideToken = 0;
var gUnitTargetPreviewPanel = null;
var gUnitTargetPreviewImage = null;
var gUnitTargetPreviewBinding = null;
var gUnitTargetPreviewHideToken = 0;
var gDamageReportPreviewPanel = null;
var gDamageReportPreviewBox = null;
var gDamageReportPreviewLabel = null;
var gDamageReportPreviewHideToken = 0;
var gShopPreviewPanel = null;
var gShopPreviewBox = null;
var gShopPreviewLabel = null;
var gShopPreviewHideToken = 0;
var gUnsecuredPlusPreviewPanel = null;
var gUnsecuredPlusPreviewIcon = null;
var gUnsecuredPlusPreviewText = null;
var gUnsecuredPlusPreviewValue = null;
var gUnsecuredPlusPreviewHideToken = 0;
var gRuntimeToggleState = {};
var gRuntimeSliderState = {};
var gRuntimeButtonGroupConfig = {};
var gRuntimeButtonGroupRefreshers = {};
var gRuntimeSliderResetters = {};
var gMinesweeperState = null;
var gMinesweeperTimerToken = 0;
var gFlappyState = null;
var gFlappyLoopToken = 0;
var gAimTrainerState = null;
var gAimTrainerLoopToken = 0;
var gTrainTrackingState = null;
var gTrainTrackingLoopToken = 0;
var gWhackRemState = null;
var gWhackRemLoopToken = 0;
var gArcadeSoundLastIndexByKey = {};
var gBlackjackState = null;
var gOnDeathArcadeBridgePollToken = 0;
var gOnDeathArcadeBridgePollRunning = false;
var gOnDeathArcadeLastRequestToken = "";
var gOnDeathArcadeSessionActive = false;
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

const SETTINGS_LANGUAGE_ENGLISH = 0;
const SETTINGS_LANGUAGE_RUSSIAN = 1;
const SETTINGS_LANGUAGE_UKRAINIAN = 2;
const SETTINGS_LANGUAGE_POLISH = 3;
const SETTINGS_LANGUAGE_BULGARIAN = 4;
const SETTINGS_LANGUAGE_JAPANESE = 5;
const SETTINGS_LANGUAGE_CHINESE = 6;
const SETTINGS_LANGUAGE_FRENCH = 7;
const SETTINGS_LANGUAGE_PORTUGUESE = 8;
const SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE = 9;
const SETTINGS_LANGUAGE_SPANISH = 10;
const SETTINGS_LANGUAGE_BELARUSIAN = 11;
const SETTINGS_LANGUAGE_KOREAN = 12;
const SETTINGS_LANGUAGE_ITALIAN = 13;
const SETTINGS_LANGUAGE_TURKISH = 14;
const SETTINGS_LANGUAGE_OPTIONS = [
    { label: "English", value: SETTINGS_LANGUAGE_ENGLISH },
    { label: "Russian", value: SETTINGS_LANGUAGE_RUSSIAN },
    { label: "Ukrainian", value: SETTINGS_LANGUAGE_UKRAINIAN },
    { label: "Polish", value: SETTINGS_LANGUAGE_POLISH },
    { label: "Bulgarian", value: SETTINGS_LANGUAGE_BULGARIAN },
    { label: "Belarusian", value: SETTINGS_LANGUAGE_BELARUSIAN },
    { label: "Japanese", value: SETTINGS_LANGUAGE_JAPANESE },
    { label: "Korean", value: SETTINGS_LANGUAGE_KOREAN },
    { label: "Chinese", value: SETTINGS_LANGUAGE_CHINESE },
    { label: "French", value: SETTINGS_LANGUAGE_FRENCH },
    { label: "Italian", value: SETTINGS_LANGUAGE_ITALIAN },
    { label: "Turkish", value: SETTINGS_LANGUAGE_TURKISH },
    { label: "Portuguese", value: SETTINGS_LANGUAGE_PORTUGUESE },
    { label: "BR Portuguese", value: SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE },
    { label: "Spanish", value: SETTINGS_LANGUAGE_SPANISH }
];
const SETTINGS_THEME_DEFAULT = 0;
const SETTINGS_THEME_CREAM = 1;
const SETTINGS_THEME_KITTEN = 2;
const SETTINGS_THEME_EMO = 3;
const SETTINGS_THEME_OCEAN = 4;
const SETTINGS_THEME_PSYCHO = 5;
const SETTINGS_THEME_MUNFINS = 6;
const SETTINGS_THEME_CLASS_NAMES = [
    "SettingsThemeDefault",
    "SettingsThemeCream",
    "SettingsThemeKitten",
    "SettingsThemeEmo",
    "SettingsThemeOcean",
    "SettingsThemePsycho",
    "SettingsThemeMunfins"
];
const SETTINGS_THEME_ROOT_CLASS_NAMES = [
    "QOLThemeDefault",
    "QOLThemeCream",
    "QOLThemeKitten",
    "QOLThemeEmo",
    "QOLThemeOcean",
    "QOLThemePsycho",
    "QOLThemeMunfins"
];
const SETTINGS_THEME_OPTIONS = [
    { label: "Default", value: SETTINGS_THEME_DEFAULT },
    { label: "Emo", value: SETTINGS_THEME_EMO },
    { label: "Munfins", value: SETTINGS_THEME_MUNFINS },
    { label: "Ocean", value: SETTINGS_THEME_OCEAN },
    { label: "Kitten", value: SETTINGS_THEME_KITTEN },
    { label: "Cream", value: SETTINGS_THEME_CREAM },
    { label: "Psycho", value: SETTINGS_THEME_PSYCHO }
];
const SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC = "s2r://panorama/images/qollock/mog_site_logo2_png.vtex";
const SETTINGS_HEADER_MOG_LOGO_THEME_SRC = "s2r://panorama/images/qollock/mog_site_logo2_white_png.vtex";
const SETTINGS_HEADER_MUNFINS_LOGO_SRC = "s2r://panorama/images/qollock/munfins_logo_png.vtex";

function GetSettingsLanguage() {
    var raw = Math.round(Number(MOD_CONFIG && MOD_CONFIG.LANGUAGE));
    if (raw === SETTINGS_LANGUAGE_RUSSIAN) return SETTINGS_LANGUAGE_RUSSIAN;
    if (raw === SETTINGS_LANGUAGE_UKRAINIAN) return SETTINGS_LANGUAGE_UKRAINIAN;
    if (raw === SETTINGS_LANGUAGE_POLISH) return SETTINGS_LANGUAGE_POLISH;
    if (raw === SETTINGS_LANGUAGE_BULGARIAN) return SETTINGS_LANGUAGE_BULGARIAN;
    if (raw === SETTINGS_LANGUAGE_BELARUSIAN) return SETTINGS_LANGUAGE_BELARUSIAN;
    if (raw === SETTINGS_LANGUAGE_JAPANESE) return SETTINGS_LANGUAGE_JAPANESE;
    if (raw === SETTINGS_LANGUAGE_CHINESE) return SETTINGS_LANGUAGE_CHINESE;
    if (raw === SETTINGS_LANGUAGE_FRENCH) return SETTINGS_LANGUAGE_FRENCH;
    if (raw === SETTINGS_LANGUAGE_PORTUGUESE) return SETTINGS_LANGUAGE_PORTUGUESE;
    if (raw === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE) return SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE;
    if (raw === SETTINGS_LANGUAGE_SPANISH) return SETTINGS_LANGUAGE_SPANISH;
    if (raw === SETTINGS_LANGUAGE_KOREAN) return SETTINGS_LANGUAGE_KOREAN;
    if (raw === SETTINGS_LANGUAGE_ITALIAN) return SETTINGS_LANGUAGE_ITALIAN;
    if (raw === SETTINGS_LANGUAGE_TURKISH) return SETTINGS_LANGUAGE_TURKISH;
    return SETTINGS_LANGUAGE_ENGLISH;
}

function IsRussianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_RUSSIAN;
}

function IsUkrainianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_UKRAINIAN;
}

function IsPolishSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_POLISH;
}

function IsBulgarianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_BULGARIAN;
}

function IsBelarusianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_BELARUSIAN;
}

function IsJapaneseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_JAPANESE;
}

function IsChineseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_CHINESE;
}

function IsFrenchSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_FRENCH;
}

function IsPortugueseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_PORTUGUESE;
}

function IsBrazilianPortugueseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE;
}

function IsSpanishSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_SPANISH;
}

function GetSettingsLanguageKey() {
    var lang = GetSettingsLanguage();
    if (lang === SETTINGS_LANGUAGE_RUSSIAN) return "ru";
    if (lang === SETTINGS_LANGUAGE_UKRAINIAN) return "uk";
    if (lang === SETTINGS_LANGUAGE_POLISH) return "pl";
    if (lang === SETTINGS_LANGUAGE_BULGARIAN) return "bg";
    if (lang === SETTINGS_LANGUAGE_BELARUSIAN) return "by";
    if (lang === SETTINGS_LANGUAGE_JAPANESE) return "ja";
    if (lang === SETTINGS_LANGUAGE_CHINESE) return "zh";
    if (lang === SETTINGS_LANGUAGE_FRENCH) return "fr";
    if (lang === SETTINGS_LANGUAGE_PORTUGUESE) return "pt";
    if (lang === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE) return "pt-br";
    if (lang === SETTINGS_LANGUAGE_SPANISH) return "es";
    if (lang === SETTINGS_LANGUAGE_KOREAN) return "ko";
    if (lang === SETTINGS_LANGUAGE_ITALIAN) return "it";
    if (lang === SETTINGS_LANGUAGE_TURKISH) return "tr";
    return "en";
}

function GetSettingsTheme() {
    var raw = Math.round(Number(MOD_CONFIG && MOD_CONFIG.SETTINGS_THEME));
    if (raw === SETTINGS_THEME_CREAM) return SETTINGS_THEME_CREAM;
    if (raw === SETTINGS_THEME_KITTEN) return SETTINGS_THEME_KITTEN;
    if (raw === SETTINGS_THEME_EMO) return SETTINGS_THEME_EMO;
    if (raw === SETTINGS_THEME_OCEAN) return SETTINGS_THEME_OCEAN;
    if (raw === SETTINGS_THEME_PSYCHO) return SETTINGS_THEME_PSYCHO;
    if (raw === SETTINGS_THEME_MUNFINS) return SETTINGS_THEME_MUNFINS;
    return SETTINGS_THEME_DEFAULT;
}

function GetSettingsThemeKey() {
    var theme = GetSettingsTheme();
    if (theme === SETTINGS_THEME_CREAM) return "cream";
    if (theme === SETTINGS_THEME_KITTEN) return "kitten";
    if (theme === SETTINGS_THEME_EMO) return "emo";
    if (theme === SETTINGS_THEME_OCEAN) return "ocean";
    if (theme === SETTINGS_THEME_PSYCHO) return "psycho";
    if (theme === SETTINGS_THEME_MUNFINS) return "munfins";
    return "default";
}

function ApplySettingsHeaderLogoTheme(theme) {
    var root = _FindRoot();
    var context = $.GetContextPanel ? $.GetContextPanel() : null;
    var logo = null;
    if (context && context.FindChildTraverse) logo = context.FindChildTraverse("SettingsHeaderMogLogo");
    if (!logo && root && root.FindChildTraverse) logo = root.FindChildTraverse("SettingsHeaderMogLogo");
    var src = theme === SETTINGS_THEME_MUNFINS
        ? SETTINGS_HEADER_MUNFINS_LOGO_SRC
        : (theme === SETTINGS_THEME_DEFAULT ? SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC : SETTINGS_HEADER_MOG_LOGO_THEME_SRC);
    if (logo && logo.SetImage) {
        try { logo.SetImage(src); } catch(eLogoTheme) { _WarnLog("settings", "op failed: " + (eLogoTheme && eLogoTheme.message ? eLogoTheme.message : String(eLogoTheme || ""))); }
    }

    var header = null;
    if (context && context.FindChildTraverse) header = context.FindChildTraverse("SettingsHeader");
    if (!header && root && root.FindChildTraverse) header = root.FindChildTraverse("SettingsHeader");
    if (!header || !header.FindChildTraverse) return;

    var title = header.FindChildTraverse("SettingsTitle");
    var titleAccent = header.FindChildTraverse("SettingsTitleAccent");
    var moglockLink = header.FindChildTraverse("ModVersionLabelTop");
    if (title) title.text = _Localize("LOCK", true);
    if (titleAccent) titleAccent.text = theme === SETTINGS_THEME_MUNFINS ? "Munfins" : _Localize("QOL", true);
    if (moglockLink) {
        moglockLink.visible = theme !== SETTINGS_THEME_MUNFINS;
        moglockLink.style.visibility = theme === SETTINGS_THEME_MUNFINS ? "collapse" : "visible";
    }
}

function ApplySettingsThemeClasses(settingsWindow) {
    var root = _FindRoot();
    var context = $.GetContextPanel ? $.GetContextPanel() : null;
    var theme = GetSettingsTheme();
    var panels = [];
    if (!settingsWindow && context && context.FindChildTraverse) {
        settingsWindow = context.FindChildTraverse("SettingsWindow");
    }
    if (settingsWindow) panels.push(settingsWindow);
    if (context && context !== settingsWindow) panels.push(context);
    if (root && root !== settingsWindow) panels.push(root);
    for (var p = 0; p < panels.length; p++) {
        var panel = panels[p];
        if (!panel || !panel.SetHasClass) continue;
        for (var i = 0; i < SETTINGS_THEME_CLASS_NAMES.length; i++) {
            panel.SetHasClass(SETTINGS_THEME_CLASS_NAMES[i], i === theme);
            panel.SetHasClass(SETTINGS_THEME_ROOT_CLASS_NAMES[i], i === theme);
        }
    }
    ApplySettingsHeaderLogoTheme(theme);
}

function NormalizeLatinSettingsText(text) {
    var raw = String(text || "");
    return raw
        .replace(/[\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5]/g, "a")
        .replace(/[\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5]/g, "A")
        .replace(/[\u00e7]/g, "c")
        .replace(/[\u00c7]/g, "C")
        .replace(/[\u00e8\u00e9\u00ea\u00eb]/g, "e")
        .replace(/[\u00c8\u00c9\u00ca\u00cb]/g, "E")
        .replace(/[\u00ec\u00ed\u00ee\u00ef]/g, "i")
        .replace(/[\u00cc\u00cd\u00ce\u00cf]/g, "I")
        .replace(/[\u00f1]/g, "n")
        .replace(/[\u00d1]/g, "N")
        .replace(/[\u00f2\u00f3\u00f4\u00f5\u00f6]/g, "o")
        .replace(/[\u00d2\u00d3\u00d4\u00d5\u00d6]/g, "O")
        .replace(/[\u00f9\u00fa\u00fb\u00fc]/g, "u")
        .replace(/[\u00d9\u00da\u00db\u00dc]/g, "U")
        .replace(/[\u00fd\u00ff]/g, "y")
        .replace(/[\u00dd\u0178]/g, "Y")
        .replace(/[\u0153]/g, "oe")
        .replace(/[\u0152]/g, "OE")
        .replace(/[\u00e6]/g, "ae")
        .replace(/[\u00c6]/g, "AE")
        // Turkish-specific letters (o/O and u/U with diaeresis and c/C with cedilla are
        // already covered above): dotless/dotted i, g-breve, s-cedilla.
        .replace(/[\u0131]/g, "i")
        .replace(/[\u0130]/g, "I")
        .replace(/[\u011f]/g, "g")
        .replace(/[\u011e]/g, "G")
        .replace(/[\u015f]/g, "s")
        .replace(/[\u015e]/g, "S")
        .replace(/[\u2019\u2018]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/\u2026/g, "...")
        .replace(/[^\x20-\x7E]/g, "");
}

function ShouldLocalizeTabContent() {

    return currentTab !== "Presets";
}

function _Localize(text, force) {
    if (text === undefined || text === null) return "";
    var raw = String(text);
    if (!force && !ShouldLocalizeTabContent()) return raw;

    var lang = GetSettingsLanguage();
    if (lang === SETTINGS_LANGUAGE_ENGLISH) return raw;

    // Phase 1: Look up from external locale maps (ql_settings_loc/*.js).
    var key = GetSettingsLanguageKey();
    var maps = (typeof window !== "undefined" && window.SETTINGS_LOCALE_TEXT) ? window.SETTINGS_LOCALE_TEXT : {};
    var map = maps[key] || null;
    if (map && map.hasOwnProperty(raw)) {
        var translated = map[raw];
        // Latin-script languages need diacritic normalization for comparison matching.
        if (key === "fr" || key === "it" || key === "tr" || key === "pt" || key === "pt-br" || key === "es") {
            return NormalizeLatinSettingsText(translated);
        }
        return translated;
    }
    return raw;
}

function SetLocalizedConfigFeedbackMessage(text, tone, durationMs) {
    SetConfigFeedbackMessage(_Localize(text, true), tone, durationMs);
}

const MINESWEEPER_ROWS = 9;
const MINESWEEPER_COLS = 9;
const MINESWEEPER_MINES = 10;
const MINESWEEPER_DEFAULT_DIFFICULTY = "EASY";
const MINESWEEPER_BOARD_WIDTH = 620;
const MINESWEEPER_BOARD_HEIGHT = 500;
const MINESWEEPER_DIFFICULTIES = [
    { id: "EASY", label: "Easy", rows: 9, cols: 9, mines: 10 },
    { id: "MEDIUM", label: "Medium", rows: 10, cols: 10, mines: 18 },
    { id: "HARD", label: "Hard", rows: 10, cols: 12, mines: 28 }
];
const FLAPPY_BIRD_IMAGE_SRC = "s2r://panorama/images/qollock/vampirebat_sm_psd_png.vtex";
const AIM_TRAINER_DURATION_SEC = 45;
const TRAIN_TRACKING_DURATION_SEC = 45;
const WHACK_A_REM_DURATION_SEC = 45;
const WHACK_A_REM_MAX_TARGETS = 3;
const WHACK_A_REM_DEFAULT_DIFFICULTY = "MEDIUM";
const WHACK_A_REM_DIFFICULTIES = [
    { id: "EASY", label: "Easy", maxConcurrent: 1, lifeStartSec: 1.05, lifeEndSec: 0.58, spawnDelaySec: 0.22 },
    { id: "MEDIUM", label: "Medium", maxConcurrent: 2, lifeStartSec: 1.18, lifeEndSec: 0.68, spawnDelaySec: 0.19 },
    { id: "HARD", label: "Hard", maxConcurrent: 3, lifeStartSec: 1.08, lifeEndSec: 0.56, spawnDelaySec: 0.16 }
];
const ON_DEATH_GAMES_POLL_SECONDS = 0.25;
const ON_DEATH_GAMES_TRIGGER_COOLDOWN_MS = 1500;
const ON_DEATH_ARCADE_GAME_KEYS = [
    "ON_DEATH_GAME_MINESWEEPER",
    "ON_DEATH_GAME_BLACKJACK",
    "ON_DEATH_GAME_FLAPPY_BAT",
    "ON_DEATH_GAME_GRAVES_TRAINER",
    "ON_DEATH_GAME_ZERGGY_MANIA",
    "ON_DEATH_GAME_WHACK_A_REM"
];
const ARCADE_DEFAULT_DIFFICULTY_OPTIONS = [
    { label: "Easy", id: "EASY" },
    { label: "Medium", id: "MEDIUM" },
    { label: "Hard", id: "HARD" }
];

function IsArcadeGameAudioEnabled() {
    return Number(MOD_CONFIG.ENABLE_GAME_AUDIO) === 1;
}

function PlayArcadeGameSoundEffect(eventName) {
    var resolved = String(eventName || "");
    if (!resolved) return;
    if (!IsArcadeGameAudioEnabled()) return;
    try { $.DispatchEvent("PlaySoundEffect", resolved); } catch(e0) { _WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
}

function ResolveArcadeDefaultDifficultyId() {
    var raw = MOD_CONFIG ? MOD_CONFIG.GAME_DEFAULT_DIFFICULTY : 1;
    var asNumber = Math.round(Number(raw));
    if (isFinite(asNumber)) {
        if (asNumber <= 0) return "EASY";
        if (asNumber >= 2) return "HARD";
        return "MEDIUM";
    }
    var asString = String(raw || "").toUpperCase();
    if (asString === "EASY" || asString === "HARD" || asString === "MEDIUM") return asString;
    return "MEDIUM";
}

const HERO_HINT_PUBLISH_INTERVAL_SEC = 1.0;
const FLAPPY_BAT_FLAP_SOUND_EVENT = "QOL.FlappyBat.Flap";
const FLAPPY_BAT_FAIL_SOUND_EVENTS = [
    "QOL.FlappyBat.Fail1",
    "QOL.FlappyBat.Fail2",
    "QOL.FlappyBat.Fail3",
    "QOL.FlappyBat.Fail4"
];
const BLACKJACK_ACTION_SOUND_EVENTS = [
    "QOL.Blackjack.Action1",
    "QOL.Blackjack.Action2",
    "QOL.Blackjack.Action3",
    "QOL.Blackjack.Action4"
];
const BLACKJACK_WIN_SOUND_EVENT = "QOL.Blackjack.Win";
const BLACKJACK_LOSE_SOUND_EVENT = "QOL.Blackjack.Lose";
const AIM_TRAINER_DEFAULT_DIFFICULTY = "MEDIUM";
const AIM_TRAINER_HIT_SOUND_EVENT = "QOL.GravesTrainer.Hit";
const AIM_TRAINER_DIFFICULTIES = [
    { id: "EASY", label: "Easy", durationSec: 45, targetStartSize: 84, targetEndSize: 52, targetLifeStartSec: 1.25, targetLifeEndSec: 0.82 },
    { id: "MEDIUM", label: "Medium", durationSec: 45, targetStartSize: 74, targetEndSize: 40, targetLifeStartSec: 1.05, targetLifeEndSec: 0.52 },
    { id: "HARD", label: "Hard", durationSec: 45, targetStartSize: 64, targetEndSize: 30, targetLifeStartSec: 0.90, targetLifeEndSec: 0.38 }
];
const AIM_TRAINER_TARGET_IMAGE_PATHS = [
    "s2r://panorama/images/qollock/digger_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/astro_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/viscous_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/archer_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/bull_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/tengu_sm_psd_png.vtex"
];
const WHACK_A_REM_TARGET_IMAGE_SRC = "s2r://panorama/images/qollock/familiar_sm_psd_png.vtex";
const WHACK_A_REM_HIT_FLASH_SEC = 0.075;
const WHACK_A_REM_HIT_SOUND_EVENTS = [
    "QOL.WhackRem.Hit1",
    "QOL.WhackRem.Hit2",
    "QOL.WhackRem.Hit3",
    "QOL.WhackRem.Hit4",
    "QOL.WhackRem.Hit5",
    "QOL.WhackRem.Hit6",
    "QOL.WhackRem.Hit7",
    "QOL.WhackRem.Hit8",
    "QOL.WhackRem.Hit9"
];
const WHACK_A_REM_MISS_SOUND_EVENTS = [
    "QOL.WhackRem.Miss1",
    "QOL.WhackRem.Miss2",
    "QOL.WhackRem.Miss3"
];
const TRAIN_TRACKING_TARGET_IMAGE_SRC = "s2r://panorama/images/qollock/vampirebat_sm_psd_png.vtex";
const MINESWEEPER_MINE_IMAGE_SRC = "s2r://panorama/images/qollock/bebop_sm_psd_png.vtex";
const MINESWEEPER_EXPLODE_SOUND_EVENT = "QOL.BebopSweeper.Explode";
const MINESWEEPER_WIN_SOUND_EVENT = "QOL.BebopSweeper.Win";
const MINESWEEPER_STATUS_DEFAULT_TEXT = "Find all safe tiles. Right-click to flag.";
const BILLIARDS_TABLE_WIDTH = 640;
const BILLIARDS_TABLE_HEIGHT = 380;
const BILLIARDS_BALL_RADIUS = 11;
const BILLIARDS_POCKET_RADIUS = 22;
const BILLIARDS_FRICTION = 0.972;
const BILLIARDS_BOUNCE = 0.92;
const BILLIARDS_MIN_SPEED = 0.08;
const TRAIN_TRACKING_DEFAULT_DIFFICULTY = "MEDIUM";
const TRAIN_TRACKING_DIFFICULTIES = [
    { id: "EASY", label: "Easy", targetSize: 98, baseSpeed: 5.8, maxSpeed: 9.8, speedGainPerScore: 0.16, sampleIntervalSec: 0.12, jitterTickReset: 15 },
    { id: "MEDIUM", label: "Medium", targetSize: 84, baseSpeed: 7.4, maxSpeed: 12.2, speedGainPerScore: 0.22, sampleIntervalSec: 0.10, jitterTickReset: 13 },
    { id: "HARD", label: "Hard", targetSize: 66, baseSpeed: 10.2, maxSpeed: 16.5, speedGainPerScore: 0.34, sampleIntervalSec: 0.07, jitterTickReset: 10 }
];
const TRAIN_TRACKING_HIT_FLASH_SEC = 0.075;
const TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC = 0.32;
const TRAIN_TRACKING_HIT_SOUND_MIN_INTERVAL_SEC = 0.72;
const TRAIN_TRACKING_HIT_SOUND_EVENTS = [
    "QOL.ZerggyMania.Hit1",
    "QOL.ZerggyMania.Hit2",
    "QOL.ZerggyMania.Hit3",
    "QOL.ZerggyMania.Hit4",
    "QOL.ZerggyMania.Hit5"
];

function PickRandomIndexNoImmediateRepeat(options, stableKey) {
    if (!Array.isArray(options) || options.length <= 0) return -1;
    var len = options.length;
    if (len === 1) return 0;
    var key = String(stableKey || "");
    var last = (key && gArcadeSoundLastIndexByKey.hasOwnProperty(key))
        ? Number(gArcadeSoundLastIndexByKey[key])
        : -1;
    if (!isFinite(last) || last < 0 || last >= len) last = -1;

    var idx = Math.floor(Math.random() * len);
    if (!isFinite(idx) || idx < 0 || idx >= len) idx = 0;
    if (idx === last) {
        idx = (idx + 1 + Math.floor(Math.random() * (len - 1))) % len;
    }
    if (key) gArcadeSoundLastIndexByKey[key] = idx;
    return idx;
}

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

function GetMinesweeperDifficultyById(id) {
    for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
        if (MINESWEEPER_DIFFICULTIES[i].id === id) return MINESWEEPER_DIFFICULTIES[i];
    }
    return MINESWEEPER_DIFFICULTIES[0];
}

function GetAimTrainerDifficultyById(id) {
    for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
        if (AIM_TRAINER_DIFFICULTIES[i].id === id) return AIM_TRAINER_DIFFICULTIES[i];
    }
    return AIM_TRAINER_DIFFICULTIES[0];
}

function GetTrainTrackingDifficultyById(id) {
    for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
        if (TRAIN_TRACKING_DIFFICULTIES[i].id === id) return TRAIN_TRACKING_DIFFICULTIES[i];
    }
    return TRAIN_TRACKING_DIFFICULTIES[0];
}

function GetRandomAimTrainerTargetImagePath(previousPath) {
    if (!AIM_TRAINER_TARGET_IMAGE_PATHS || AIM_TRAINER_TARGET_IMAGE_PATHS.length <= 0) return "";
    if (AIM_TRAINER_TARGET_IMAGE_PATHS.length === 1) return AIM_TRAINER_TARGET_IMAGE_PATHS[0];
    var idx = Math.floor(Math.random() * AIM_TRAINER_TARGET_IMAGE_PATHS.length);
    var nextPath = AIM_TRAINER_TARGET_IMAGE_PATHS[idx];
    if (previousPath && nextPath === previousPath) {
        idx = (idx + 1) % AIM_TRAINER_TARGET_IMAGE_PATHS.length;
        nextPath = AIM_TRAINER_TARGET_IMAGE_PATHS[idx];
    }
    return nextPath;
}

function ApplyAimTrainerTargetImage(state) {
    if (!state || !state.targetImage || !state.targetImage.IsValid || !state.targetImage.IsValid()) return;
    var nextPath = GetRandomAimTrainerTargetImagePath(state.targetImagePath || "");
    if (!nextPath) return;
    state.targetImagePath = nextPath;
    try {
        state.targetImage.SetImage(nextPath);
    } catch (eSetImage) {
        try { state.targetImage.SetAttributeString("src", nextPath); } catch(eAttr) { _WarnLog("settings", "op failed: " + (eAttr && eAttr.message ? eAttr.message : String(eAttr || ""))); }
    }
}

function SetPanelNonInteractive(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    panel.hittest = false;
    panel.hittestchildren = false;
}

// Phase C.3: Fixed fallback — was always setting "1.00" regardless of opacityValue.
var SetPanelOpacitySafe = (Utils && Utils.SetPanelOpacitySafe) ? Utils.SetPanelOpacitySafe : function(panel, opacityValue, fallbackValue) { if (panel && panel.style) { try { var v = Number(opacityValue); if (!isFinite(v)) v = Number(fallbackValue); if (!isFinite(v)) v = 1.0; panel.style.opacity = v.toFixed(2); } catch(e) { _WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); } } };

function GetPanelRectRelativeToContext(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return null;
    var context = $.GetContextPanel();
    var root = _FindRoot();
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

function SetPreviewPanelPosition(panel, x, y) {
    if (!panel || !panel.style) return;
    var px = Math.round(Number(x) || 0);
    var py = Math.round(Number(y) || 0);
    panel.style.marginLeft = String(px) + "px";
    panel.style.marginTop = String(py) + "px";
}

function GetMinimapPreviewAnchorParent() {
    var contextRoot = $.GetContextPanel();
    return contextRoot || null;
}

function GetMinimapPreviewRightInsetPx() {
    var contextRoot = $.GetContextPanel();
    var searchRoot = _FindRoot() || contextRoot;
    if (!contextRoot || !searchRoot || !searchRoot.FindChildTraverse) return 0;

    var minimapPersp = searchRoot.FindChildTraverse("minimap_persp");
    if (!minimapPersp || !minimapPersp.GetParent) return 0;
    var minimapParent = minimapPersp.GetParent();
    if (!minimapParent) return 0;

    var insetByOffset = Number(minimapParent.actualxoffset);
    if (isFinite(insetByOffset) && insetByOffset > 0) {
        return Math.round(insetByOffset);
    }

    var rootWidth = Number(contextRoot.actuallayoutwidth);
    var parentWidth = Number(minimapParent.actuallayoutwidth);
    if (!isFinite(rootWidth) || !isFinite(parentWidth) || rootWidth <= parentWidth || parentWidth <= 0) {
        return 0;
    }
    return Math.round((rootWidth - parentWidth) * 0.5);
}

function EnsureMinimapSizePreviewPanel() {
    if (gMinimapSizePreviewPanel && gMinimapSizePreviewPanel.IsValid && gMinimapSizePreviewPanel.IsValid()) {
        var anchorParent = GetMinimapPreviewAnchorParent();
        if (anchorParent && gMinimapSizePreviewPanel.GetParent && gMinimapSizePreviewPanel.GetParent() !== anchorParent) {
            gMinimapSizePreviewPanel.SetParent(anchorParent);
        }
        SetPanelNonInteractive(gMinimapSizePreviewPanel);
        SetPanelNonInteractive(gMinimapSizePreviewCircle);
        SetPanelNonInteractive(gMinimapSizePreviewLabel);
        return gMinimapSizePreviewPanel;
    }
    var parent = GetMinimapPreviewAnchorParent();
    if (!parent) return null;

    var panel = parent.FindChildTraverse("MinimapSizePreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", parent, "MinimapSizePreview");
    }
    if (!panel) return null;

    var circle = panel.FindChildTraverse("MinimapSizePreviewCircle");
    if (!circle) {
        circle = $.CreatePanel("Panel", panel, "MinimapSizePreviewCircle");
    }
    var label = panel.FindChildTraverse("MinimapSizePreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "MinimapSizePreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(circle);
    SetPanelNonInteractive(label);

    gMinimapSizePreviewPanel = panel;
    gMinimapSizePreviewCircle = circle;
    gMinimapSizePreviewLabel = label;
    return panel;
}

function EnsureZoomMinimapPreviewPanel() {
    if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gZoomMinimapPreviewPanel);
        SetPanelNonInteractive(gZoomMinimapPreviewCircle);
        SetPanelNonInteractive(gZoomMinimapPreviewLabel);
        return gZoomMinimapPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ZoomMinimapPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ZoomMinimapPreview");
    }
    if (!panel) return null;

    var circle = panel.FindChildTraverse("ZoomMinimapPreviewCircle");
    if (!circle) {
        circle = $.CreatePanel("Panel", panel, "ZoomMinimapPreviewCircle");
    }
    var label = panel.FindChildTraverse("ZoomMinimapPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "ZoomMinimapPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(circle);
    SetPanelNonInteractive(label);

    gZoomMinimapPreviewPanel = panel;
    gZoomMinimapPreviewCircle = circle;
    gZoomMinimapPreviewLabel = label;
    return panel;
}

function EnsureZipBoostPreviewPanel() {
    if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gZipBoostPreviewPanel);
        SetPanelNonInteractive(gZipBoostPreviewBox);
        SetPanelNonInteractive(gZipBoostPreviewLabel);
        return gZipBoostPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ZipBoostPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ZipBoostPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("ZipBoostPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "ZipBoostPreviewBox");
    }
    var label = panel.FindChildTraverse("ZipBoostPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "ZipBoostPreviewLabel");
        label.text = _Localize("ZIP BOOST", true);
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gZipBoostPreviewPanel = panel;
    gZipBoostPreviewBox = box;
    gZipBoostPreviewLabel = label;
    return panel;
}

// Build one preview row that is a structural clone of an in-game crosshair-overlay row, using the
// overlay's own classes (styled via the ql_feat_crosshair_stats import in ql_settings.css) so it
// matches pixel-for-pixel: a dark pill with a colored left accent, a property icon, and a value.
function CreateCrosshairStatsPreviewStatRow(box, idSuffix, iconClass, valueText, isDebuff) {
    var row = box.FindChildTraverse("CrosshairStatsPreviewRow_" + idSuffix);
    if (!row) {
        row = $.CreatePanel("Panel", box, "CrosshairStatsPreviewRow_" + idSuffix);
        row.AddClass("QOLCrosshairStatRow");
        row.AddClass(isDebuff ? "isDebuff" : "isBuff");
        var icon = $.CreatePanel("Panel", row, "CrosshairStatsPreviewIcon_" + idSuffix);
        icon.AddClass("QOLCrosshairStatIcon");
        icon.AddClass("statIcon");
        icon.AddClass("PropertiesIcon");
        icon.AddClass(iconClass);
        var value = $.CreatePanel("Label", row, "CrosshairStatsPreviewValue_" + idSuffix);
        value.AddClass("QOLCrosshairStatValue");
        value.text = valueText;
    }
    SetPanelNonInteractive(row);
    return row;
}

function EnsureCrosshairStatsPreviewPanel() {
    if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gCrosshairStatsPreviewPanel);
        SetPanelNonInteractive(gCrosshairStatsPreviewBox);
        SetPanelNonInteractive(gCrosshairStatsPreviewLabel);
        return gCrosshairStatsPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("CrosshairStatsPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "CrosshairStatsPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("CrosshairStatsPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "CrosshairStatsPreviewBox");
    }
    var label = panel.FindChildTraverse("CrosshairStatsPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "CrosshairStatsPreviewLabel");
        label.text = _Localize("ACTIVE STATS", true);
    }
    // Real copy of the in-game overlay rows (ql_feat_crosshairstats.js builds the same structure):
    //   .QOLCrosshairStatRow[.isDebuff|.isBuff] > .QOLCrosshairStatIcon.statIcon.PropertiesIcon.<Stat> + .QOLCrosshairStatValue
    CreateCrosshairStatsPreviewStatRow(box, "fireRate",     "FireRate",     "−15%", true);
    CreateCrosshairStatsPreviewStatRow(box, "moveSpeed",    "MoveSpeed",    "−1.8 m/s", true);
    CreateCrosshairStatsPreviewStatRow(box, "bulletResist", "ResistBullet", "+20%", false);
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gCrosshairStatsPreviewPanel = panel;
    gCrosshairStatsPreviewBox = box;
    gCrosshairStatsPreviewLabel = label;
    return panel;
}

function EnsureUnsecuredSoulsPreviewPanel() {
    if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnsecuredSoulsPreviewPanel);
        SetPanelNonInteractive(gUnsecuredSoulsPreviewLabel);
        return gUnsecuredSoulsPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnsecuredSoulsPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "UnsecuredSoulsPreview");
    }
    if (!panel) return null;

    var label = panel.FindChildTraverse("UnsecuredSoulsPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "UnsecuredSoulsPreviewLabel");
        label.text = "23s";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(label);

    gUnsecuredSoulsPreviewPanel = panel;
    gUnsecuredSoulsPreviewLabel = label;
    return panel;
}

function EnsureCompassPreviewPanel() {
    if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gCompassPreviewPanel);
        SetPanelNonInteractive(gCompassPreviewBox);
        SetPanelNonInteractive(gCompassPreviewLabel);
        return gCompassPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("CompassPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "CompassPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("CompassPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "CompassPreviewBox");
    }

    var label = panel.FindChildTraverse("CompassPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "CompassPreviewLabel");
    }

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gCompassPreviewPanel = panel;
    gCompassPreviewBox = box;
    gCompassPreviewLabel = label;
    return panel;
}

// Speed preview — an independent panel (sibling of the compass preview),
// mirroring the in-game QOLSpeedRoot which is its own root panel under the
// gameplay HUD, NOT a child of the compass. Keeping the two previews separate
// is what makes the speed offset behave consistently with the compass offset.
function EnsureSpeedPreviewPanel() {
    if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gSpeedPreviewPanel);
        SetPanelNonInteractive(gSpeedPreviewLabel);
        return gSpeedPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("SpeedPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "SpeedPreview");
    }
    if (!panel) return null;

    var label = panel.FindChildTraverse("SpeedPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "SpeedPreviewLabel");
    }

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(label);

    gSpeedPreviewPanel = panel;
    gSpeedPreviewLabel = label;
    return panel;
}

function EnsureKeyboardOverlayPreviewPanel() {
    if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gKeyboardOverlayPreviewPanel);
        SetPanelNonInteractive(gKeyboardOverlayPreviewBox);
        SetPanelNonInteractive(gKeyboardOverlayPreviewLabel);
        return gKeyboardOverlayPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("KeyboardOverlayPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "KeyboardOverlayPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("KeyboardOverlayPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "KeyboardOverlayPreviewBox");
    }

    var sample = panel.FindChildTraverse("KeyboardOverlayPreviewSample");
    if (!sample) {
        sample = $.CreatePanel("Panel", box, "KeyboardOverlayPreviewSample");
        sample.AddClass("KeyboardOverlayPreviewRow");

        var k1 = $.CreatePanel("Panel", sample, "");
        k1.AddClass("KeyboardOverlayPreviewKey");
        k1.AddClass("Wide");

        var k2 = $.CreatePanel("Panel", sample, "");
        k2.AddClass("KeyboardOverlayPreviewKey");

        var k3 = $.CreatePanel("Panel", sample, "");
        k3.AddClass("KeyboardOverlayPreviewKey");

        var k4 = $.CreatePanel("Panel", sample, "");
        k4.AddClass("KeyboardOverlayPreviewKey");
        k4.AddClass("Wide");

        var k5 = $.CreatePanel("Panel", sample, "");
        k5.AddClass("KeyboardOverlayPreviewKey");
        k5.AddClass("Spacer");
    }

    var label = panel.FindChildTraverse("KeyboardOverlayPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "KeyboardOverlayPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(sample);
    SetPanelNonInteractive(label);

    gKeyboardOverlayPreviewPanel = panel;
    gKeyboardOverlayPreviewBox = box;
    gKeyboardOverlayPreviewLabel = label;
    return panel;
}

function EnsureItemCooldownPreviewPanel() {
    if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gItemCooldownPreviewPanel);
        SetPanelNonInteractive(gItemCooldownPreviewRow);
        SetPanelNonInteractive(gItemCooldownPreviewIcon);
        SetPanelNonInteractive(gItemCooldownPreviewLabel);
        return gItemCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ItemCooldownPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ItemCooldownPreview");
    }
    if (!panel) return null;

    var row = panel.FindChildTraverse("ItemCooldownPreviewRow");
    if (!row) {
        row = $.CreatePanel("Panel", panel, "ItemCooldownPreviewRow");
    }

    var icon = panel.FindChildTraverse("ItemCooldownPreviewIcon");
    if (!icon) {
        icon = $.CreatePanel("Panel", row, "ItemCooldownPreviewIcon");
    }

    var modContainer = panel.FindChildTraverse("ItemCooldownPreviewModContainer");
    if (!modContainer) {
        modContainer = $.CreatePanel("Panel", icon, "ItemCooldownPreviewModContainer");
    }

    var bg = panel.FindChildTraverse("ItemCooldownPreviewBg");
    if (!bg) {
        bg = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewBg");
    }

    var image = panel.FindChildTraverse("ItemCooldownPreviewImage");
    if (!image) {
        image = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewImage");
    }

    var mask = panel.FindChildTraverse("ItemCooldownPreviewMask");
    if (!mask) {
        mask = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewMask");
    }

    var label = panel.FindChildTraverse("ItemCooldownPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", icon, "ItemCooldownPreviewLabel");
        label.text = "7";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(row);
    SetPanelNonInteractive(icon);
    SetPanelNonInteractive(modContainer);
    SetPanelNonInteractive(bg);
    SetPanelNonInteractive(image);
    SetPanelNonInteractive(mask);
    SetPanelNonInteractive(label);

    gItemCooldownPreviewPanel = panel;
    gItemCooldownPreviewRow = row;
    gItemCooldownPreviewIcon = icon;
    gItemCooldownPreviewLabel = label;
    return panel;
}

function EnsureAmmoPreviewPanel() {
    if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gAmmoPreviewPanel);
        SetPanelNonInteractive(gAmmoPreviewCurrentLabel);
        SetPanelNonInteractive(gAmmoPreviewTotalLabel);
        return gAmmoPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("AmmoPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "AmmoPreview");
    if (!panel) return null;

    var currentLabel = panel.FindChildTraverse("AmmoPreviewCurrent");
    if (!currentLabel) currentLabel = $.CreatePanel("Label", panel, "AmmoPreviewCurrent");
    var totalLabel = panel.FindChildTraverse("AmmoPreviewTotal");
    if (!totalLabel) totalLabel = $.CreatePanel("Label", panel, "AmmoPreviewTotal");

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(currentLabel);
    SetPanelNonInteractive(totalLabel);

    gAmmoPreviewPanel = panel;
    gAmmoPreviewCurrentLabel = currentLabel;
    gAmmoPreviewTotalLabel = totalLabel;
    return panel;
}

function EnsureReloadCooldownPreviewPanel() {
    if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gReloadCooldownPreviewPanel);
        SetPanelNonInteractive(gReloadCooldownPreviewRing);
        SetPanelNonInteractive(gReloadCooldownPreviewLabel);
        return gReloadCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ReloadCooldownPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "ReloadCooldownPreview");
    if (!panel) return null;

    var ring = panel.FindChildTraverse("ReloadCooldownPreviewRing");
    if (!ring) ring = $.CreatePanel("Panel", panel, "ReloadCooldownPreviewRing");
    var label = panel.FindChildTraverse("ReloadCooldownPreviewLabel");
    if (!label) label = $.CreatePanel("Label", ring, "ReloadCooldownPreviewLabel");
    if (label && !label.text) label.text = "1.3";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(ring);
    SetPanelNonInteractive(label);

    gReloadCooldownPreviewPanel = panel;
    gReloadCooldownPreviewRing = ring;
    gReloadCooldownPreviewLabel = label;
    return panel;
}

function EnsureUnitTargetPreviewPanel() {
    if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnitTargetPreviewPanel);
        SetPanelNonInteractive(gUnitTargetPreviewImage);
        SetPanelNonInteractive(gUnitTargetPreviewBinding);
        return gUnitTargetPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnitTargetPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UnitTargetPreview");
    if (!panel) return null;

    var image = panel.FindChildTraverse("UnitTargetPreviewImage");
    if (!image) image = $.CreatePanel("Panel", panel, "UnitTargetPreviewImage");
    var binding = panel.FindChildTraverse("UnitTargetPreviewBinding");
    if (!binding) binding = $.CreatePanel("Label", panel, "UnitTargetPreviewBinding");
    if (binding) binding.text = "Q";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(image);
    SetPanelNonInteractive(binding);

    gUnitTargetPreviewPanel = panel;
    gUnitTargetPreviewImage = image;
    gUnitTargetPreviewBinding = binding;
    return panel;
}

function EnsureDamageReportPreviewPanel() {
    if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gDamageReportPreviewPanel);
        SetPanelNonInteractive(gDamageReportPreviewBox);
        SetPanelNonInteractive(gDamageReportPreviewLabel);
        return gDamageReportPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("DamageReportPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "DamageReportPreview");
    if (!panel) return null;

    var box = panel.FindChildTraverse("DamageReportPreviewBox");
    if (!box) box = $.CreatePanel("Panel", panel, "DamageReportPreviewBox");
    var label = panel.FindChildTraverse("DamageReportPreviewLabel");
    if (!label) label = $.CreatePanel("Label", box, "DamageReportPreviewLabel");
    if (label && !label.text) label.text = "DAMAGE REPORT";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gDamageReportPreviewPanel = panel;
    gDamageReportPreviewBox = box;
    gDamageReportPreviewLabel = label;
    return panel;
}

function EnsureShopPreviewPanel() {
    if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gShopPreviewPanel);
        SetPanelNonInteractive(gShopPreviewBox);
        SetPanelNonInteractive(gShopPreviewLabel);
        return gShopPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ShopPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "ShopPreview");
    if (!panel) return null;

    var box = panel.FindChildTraverse("ShopPreviewBox");
    if (!box) box = $.CreatePanel("Panel", panel, "ShopPreviewBox");
    var label = panel.FindChildTraverse("ShopPreviewLabel");
    if (!label) label = $.CreatePanel("Label", box, "ShopPreviewLabel");
    if (label && !label.text) label.text = "SHOP";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gShopPreviewPanel = panel;
    gShopPreviewBox = box;
    gShopPreviewLabel = label;
    return panel;
}

function EnsureUnsecuredPlusPreviewPanel() {
    if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnsecuredPlusPreviewPanel);
        SetPanelNonInteractive(gUnsecuredPlusPreviewIcon);
        SetPanelNonInteractive(gUnsecuredPlusPreviewText);
        SetPanelNonInteractive(gUnsecuredPlusPreviewValue);
        return gUnsecuredPlusPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnsecuredPlusPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UnsecuredPlusPreview");
    if (!panel) return null;

    var icon = panel.FindChildTraverse("UnsecuredPlusPreviewIcon");
    if (!icon) icon = $.CreatePanel("Panel", panel, "UnsecuredPlusPreviewIcon");
    var text = panel.FindChildTraverse("UnsecuredPlusPreviewText");
    if (!text) text = $.CreatePanel("Label", panel, "UnsecuredPlusPreviewText");
    var value = panel.FindChildTraverse("UnsecuredPlusPreviewValue");
    if (!value) value = $.CreatePanel("Label", panel, "UnsecuredPlusPreviewValue");
    if (text && !text.text) text.text = "UNSECURED";
    if (value && !value.text) value.text = "538";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(icon);
    SetPanelNonInteractive(text);
    SetPanelNonInteractive(value);

    gUnsecuredPlusPreviewPanel = panel;
    gUnsecuredPlusPreviewIcon = icon;
    gUnsecuredPlusPreviewText = text;
    gUnsecuredPlusPreviewValue = value;
    return panel;
}

function GetMinimapPreviewDiameter(sizePx) {
    return Math.round(Math.max(50, Math.min(1200, Number(sizePx) || 0)));
}

function IsMinimapPreviewConfig(configId) {
    return configId === "MINIMAP_SMALL_SIZE" ||
        configId === "MINIMAP_X_OFFSET" ||
        configId === "MINIMAP_Y_OFFSET" ||
        configId === "MINIMAP_BASE_OPACITY" ||
        configId === "MINIMAL_MINIMAP_OPACITY";
}

function IsZoomMinimapPreviewConfig(configId) {
    return configId === "MINIMAP_LARGE_SIZE" ||
        configId === "ZOOM_X_OFFSET" ||
        configId === "ZOOM_Y_OFFSET" ||
        configId === "MINIMAP_LARGE_SIZE_ALT" ||
        configId === "ZOOM_X_OFFSET_ALT" ||
        configId === "ZOOM_Y_OFFSET_ALT" ||
        configId === "MINIMAP_LARGE_SIZE_TAB" ||
        configId === "ZOOM_X_OFFSET_TAB" ||
        configId === "ZOOM_Y_OFFSET_TAB" ||
        configId === "ALT_ZOOM_OPACITY" ||
        configId === "TAB_ZOOM_OPACITY";
}

function GetZoomPreviewModeForConfigId(configId) {
    if (configId === "TAB_ZOOM_OPACITY" ||
        configId === "MINIMAP_LARGE_SIZE_TAB" ||
        configId === "ZOOM_X_OFFSET_TAB" ||
        configId === "ZOOM_Y_OFFSET_TAB") {
        return "TAB";
    }
    return "ALT";
}

function GetZoomConfigKeysForMode(mode) {
    if (mode === "TAB") {
        return {
            size: "MINIMAP_LARGE_SIZE_TAB",
            x: "ZOOM_X_OFFSET_TAB",
            y: "ZOOM_Y_OFFSET_TAB",
            opacity: "TAB_ZOOM_OPACITY"
        };
    }
    return {
        size: "MINIMAP_LARGE_SIZE_ALT",
        x: "ZOOM_X_OFFSET_ALT",
        y: "ZOOM_Y_OFFSET_ALT",
        opacity: "ALT_ZOOM_OPACITY"
    };
}


function ResolveCustomAnnouncerMetaField(source, keyList) {
    if (!source || !keyList || !keyList.length) return "";
    for (var i = 0; i < keyList.length; i++) {
        var key = String(keyList[i] || "");
        if (!key) continue;
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        var value = String(source[key] == null ? "" : source[key]).trim();
        if (value.length > 0) return value;
    }
    return "";
}

function ResolveCustomAnnouncerSlotScriptMetadata(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var source = null;
    var globalKey = "QOL_CUSTOM_ANNOUNCER_SLOT" + String(safeIndex) + "_META";
    var registryKey = String(safeIndex);

    try {
        if (typeof globalThis === "object" && globalThis) {
            var registry = globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS;
            if (registry && typeof registry === "object") {
                if (Object.prototype.hasOwnProperty.call(registry, registryKey)) {
                    source = registry[registryKey];
                } else if (Object.prototype.hasOwnProperty.call(registry, safeIndex)) {
                    source = registry[safeIndex];
                }
            }
            if (!source) {
                source = globalThis[globalKey];
            }
        }
    } catch (e0) {
        source = null;
    }

    return {
        name: ResolveCustomAnnouncerMetaField(source, ["name", "Name", "NAME"]),
        author: ResolveCustomAnnouncerMetaField(source, ["author", "Author", "AUTHOR"]),
        voiceActor: ResolveCustomAnnouncerMetaField(source, ["voiceActor", "voice_actor", "VoiceActor", "Voice_Actor", "voice actor", "Voice Actor", "VOICE_ACTOR"])
    };
}

function ResolveCustomAnnouncerSlotLabel(slotIndex, fallbackLabel) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var scriptMeta = ResolveCustomAnnouncerSlotScriptMetadata(safeIndex);
    if (scriptMeta && scriptMeta.name) return scriptMeta.name;
    return String(fallbackLabel || ("Custom Slot " + String(safeIndex)));
}

function ResolveCustomAnnouncerSlotMetadata(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var scriptMeta = ResolveCustomAnnouncerSlotScriptMetadata(safeIndex);
    return {
        name: String(scriptMeta && scriptMeta.name ? scriptMeta.name : ""),
        author: String(scriptMeta && scriptMeta.author ? scriptMeta.author : ""),
        voiceActor: String(scriptMeta && scriptMeta.voiceActor ? scriptMeta.voiceActor : "")
    };
}

function GetCustomAnnouncerSlotIndexFromVoiceType(rawVoiceType) {
    var voiceType = NormalizeVoiceTypeValue(rawVoiceType);
    if (voiceType === 0) return 1;
    if (voiceType === 5) return 2;
    if (voiceType === 6) return 3;
    if (voiceType === 7) return 4;
    if (voiceType === 8) return 5;
    return 0;
}

function GetCustomAnnouncerSlotIndexFromOptionValue(optionValue) {
    var asInt = Math.round(Number(optionValue));
    if (!isFinite(asInt)) return 0;
    if (asInt === 0) return 1;
    if (asInt === 5) return 2;
    if (asInt === 6) return 3;
    if (asInt === 7) return 4;
    if (asInt === 8) return 5;
    return 0;
}

function BuildCustomAnnouncerSlotMetadataTooltipText(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var slotMeta = ResolveCustomAnnouncerSlotMetadata(safeIndex);
    var authorText = String(slotMeta && slotMeta.author ? slotMeta.author : "").trim();
    var voiceActorText = String(slotMeta && slotMeta.voiceActor ? slotMeta.voiceActor : "").trim();
    var lines = [];
    if (authorText.length > 0) lines.push("Author: " + authorText);
    if (voiceActorText.length > 0) lines.push("Voice Actor: " + voiceActorText);
    return lines.join("\n");
}

function BuildCustomAnnouncerSlotMetadataHoverInfo(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var slotMeta = ResolveCustomAnnouncerSlotMetadata(safeIndex);
    var authorText = String(slotMeta && slotMeta.author ? slotMeta.author : "").trim();
    var voiceActorText = String(slotMeta && slotMeta.voiceActor ? slotMeta.voiceActor : "").trim();
    return {
        author: authorText,
        voiceActor: voiceActorText
    };
}

function BuildCustomAnnouncerVoiceDescription(baseDescription, rawVoiceType) {
    var base = String(baseDescription || "");
    var slotIndex = GetCustomAnnouncerSlotIndexFromVoiceType(rawVoiceType);
    if (slotIndex <= 0) return base;

    var lines = [];
    if (base) lines.push(base);
    var slotMetaText = BuildCustomAnnouncerSlotMetadataTooltipText(slotIndex);
    if (slotMetaText) lines.push(slotMetaText);
    return lines.join("\n");
}

function BuildVoiceDropdownOptions() {
    return [
        { label: "Beep", value: 4 },
        { label: ResolveCustomAnnouncerSlotLabel(1, "Custom Slot 1"), value: 0 },
        { label: ResolveCustomAnnouncerSlotLabel(2, "Custom Slot 2"), value: 5 },
        { label: ResolveCustomAnnouncerSlotLabel(3, "Custom Slot 3"), value: 6 },
        { label: ResolveCustomAnnouncerSlotLabel(4, "Custom Slot 4"), value: 7 },
        { label: ResolveCustomAnnouncerSlotLabel(5, "Custom Slot 5"), value: 8 }
    ];
}


function IsZipBoostPreviewConfig(configId) {
    return configId === "ZIP_BOOST_X_OFFSET" ||
        configId === "ZIP_BOOST_Y_OFFSET" ||
        configId === "ZIP_BOOST_SCALE";
}

function IsCrosshairStatsPreviewConfig(configId) {
    return configId === "ENABLE_CROSSHAIR_STATS" ||
        configId === "CROSSHAIR_STATS_X_OFFSET" ||
        configId === "CROSSHAIR_STATS_Y_OFFSET" ||
        configId === "CROSSHAIR_STATS_SCALE" ||
        configId === "CROSSHAIR_STATS_OPACITY";
}

function IsUnsecuredSoulsPreviewConfig(configId) {
    return configId === "ENABLE_UNSECURED_SOUL_TIMER" ||
        configId === "UNSECURED_SOUL_TIMER_X_OFFSET" ||
        configId === "UNSECURED_SOUL_TIMER_Y_OFFSET" ||
        configId === "UNSECURED_SOUL_TIMER_SCALE";
}

function IsCompassPreviewConfig(configId) {
    return configId === "COMPASS_SCALE" ||
        configId === "COMPASS_X_OFFSET" ||
        configId === "COMPASS_Y_OFFSET" ||
        configId === "COMPASS_STRETCH_X" ||
        configId === "COMPASS_STRETCH_Y";
}

function IsSpeedPreviewConfig(configId) {
    return configId === "COMPASS_SPEED_X_OFFSET" ||
        configId === "COMPASS_SPEED_Y_OFFSET";
}

function IsKeyboardOverlayPreviewConfig(configId) {
    return configId === "KEYBOARD_OVERLAY_SCALE" ||
        configId === "KEYBOARD_OVERLAY_X_OFFSET" ||
        configId === "KEYBOARD_OVERLAY_Y_OFFSET";
}

function IsItemCooldownPreviewConfig(configId) {
    return configId === "PASSIVE_COOLDOWN_SIZE" ||
        configId === "PASSIVE_COOLDOWN_X" ||
        configId === "PASSIVE_COOLDOWN_Y" ||
        configId === "PASSIVE_COOLDOWN_OPACITY";
}

function IsAdvancedItemCooldownModeEnabled() {
    return Number(MOD_CONFIG.ENABLE_OLD_ITEM_COOLDOWNS) !== 1;
}

const ENABLE_AMMO_PREVIEW = false;
function IsAmmoPreviewConfig(configId) {
    if (!ENABLE_AMMO_PREVIEW) return false;
    return configId === "AMMO_CURRENT_SCALE" ||
        configId === "AMMO_TOTAL_SCALE" ||
        configId === "AMMO_PANEL_X_OFFSET" ||
        configId === "AMMO_PANEL_Y_OFFSET";
}

function IsReloadCooldownPreviewConfig(configId) {
    return configId === "RELOAD_COOLDOWN_SIZE" ||
        configId === "RELOAD_COOLDOWN_OPACITY" ||
        configId === "RELOAD_COOLDOWN_X_OFFSET" ||
        configId === "RELOAD_COOLDOWN_Y_OFFSET";
}

function IsUnitTargetPreviewConfig(configId) {
    return configId === "UNIT_TARGET_SIZE" ||
        configId === "UNIT_TARGET_OPACITY" ||
        configId === "UNIT_TARGET_HINT_SIZE" ||
        configId === "ENABLE_RED_DIAMOND" ||
        configId === "ENABLE_IMPROVED_HINT";
}

function IsDamageReportPreviewConfig(configId) {
    return configId === "DAMAGE_REPORT_X_OFFSET" ||
        configId === "DAMAGE_REPORT_Y_OFFSET" ||
        configId === "DISABLE_DAMAGE_REPORT";
}

function IsShopPreviewConfig(configId) {
    return configId === "SHOP_OFFSET_X" ||
        configId === "SHOP_OFFSET_Y" ||
        configId === "SHOP_OPACITY" ||
        configId === "SHOP_SCALE";
}

function IsUnsecuredPlusPreviewConfig(configId) {
    return configId === "UNSECURED_SOULS_HUD_SCALE" ||
        configId === "UNSECURED_SOULS_HUD_X_OFFSET" ||
        configId === "UNSECURED_SOULS_HUD_Y_OFFSET" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_ICON" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_TEXT";
}

function HideMinimapSizePreview() {
    if (gMinimapSizePreviewPanel && gMinimapSizePreviewPanel.IsValid && gMinimapSizePreviewPanel.IsValid()) {
        gMinimapSizePreviewPanel.RemoveClass("Visible");
    }
    if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
        gZoomMinimapPreviewPanel.RemoveClass("Visible");
    }
    if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
        gZipBoostPreviewPanel.RemoveClass("Visible");
    }
    if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
        gCrosshairStatsPreviewPanel.RemoveClass("Visible");
    }
    if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
        gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
    }
    if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
        gCompassPreviewPanel.RemoveClass("Visible");
    }
    if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
        gSpeedPreviewPanel.RemoveClass("Visible");
    }
    if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
        gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
    }
    if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
        gItemCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
        gAmmoPreviewPanel.RemoveClass("Visible");
    }
    if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
        gReloadCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
        gUnitTargetPreviewPanel.RemoveClass("Visible");
    }
    if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
        gDamageReportPreviewPanel.RemoveClass("Visible");
    }
    if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
        gShopPreviewPanel.RemoveClass("Visible");
    }
    if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
        gUnsecuredPlusPreviewPanel.RemoveClass("Visible");
    }
}

function ScheduleHideMinimapSizePreview(delaySec) {
    gMinimapSizePreviewHideToken++;
    var token = gMinimapSizePreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gMinimapSizePreviewHideToken) return;
        HideMinimapSizePreview();
    });
}

function ScheduleHideZoomMinimapPreview(delaySec) {
    gZoomMinimapPreviewHideToken++;
    var token = gZoomMinimapPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gZoomMinimapPreviewHideToken) return;
        if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
            gZoomMinimapPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideZipBoostPreview(delaySec) {
    gZipBoostPreviewHideToken++;
    var token = gZipBoostPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gZipBoostPreviewHideToken) return;
        if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
            gZipBoostPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideCrosshairStatsPreview(delaySec) {
    gCrosshairStatsPreviewHideToken++;
    var token = gCrosshairStatsPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gCrosshairStatsPreviewHideToken) return;
        if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
            gCrosshairStatsPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnsecuredSoulsPreview(delaySec) {
    gUnsecuredSoulsPreviewHideToken++;
    var token = gUnsecuredSoulsPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnsecuredSoulsPreviewHideToken) return;
        if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
            gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideCompassPreview(delaySec) {
    gCompassPreviewHideToken++;
    var token = gCompassPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gCompassPreviewHideToken) return;
        if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
            gCompassPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideSpeedPreview(delaySec) {
    gSpeedPreviewHideToken++;
    var token = gSpeedPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gSpeedPreviewHideToken) return;
        if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
            gSpeedPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideKeyboardOverlayPreview(delaySec) {
    gKeyboardOverlayPreviewHideToken++;
    var token = gKeyboardOverlayPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gKeyboardOverlayPreviewHideToken) return;
        if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
            gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideItemCooldownPreview(delaySec) {
    gItemCooldownPreviewHideToken++;
    var token = gItemCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gItemCooldownPreviewHideToken) return;
        if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
            gItemCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ShowMinimapSizePreview(sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureMinimapSizePreviewPanel();
    if (!panel || !gMinimapSizePreviewCircle || !gMinimapSizePreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var sizeVal = Math.round(Number(sizePx) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG.MINIMAP_SMALL_SIZE) || 0);
    if (sizeVal <= 0) return;
    var xOffset = Math.round(Number(MOD_CONFIG.MINIMAP_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.MINIMAP_Y_OFFSET) || 0);
    var opacityVal = Number(MOD_CONFIG.MINIMAP_BASE_OPACITY);
    if (!isFinite(opacityVal)) opacityVal = 1.0;
    opacityVal = Math.max(0, Math.min(1, opacityVal));

    var previewDiameter = GetMinimapPreviewDiameter(sizeVal);
    gMinimapSizePreviewCircle.style.width = previewDiameter + "px";
    gMinimapSizePreviewCircle.style.height = previewDiameter + "px";
    gMinimapSizePreviewCircle.style.opacity = opacityVal.toFixed(2);
    var rightInset = GetMinimapPreviewRightInsetPx();
    panel.style.marginRight = (gMinimapPreviewBaseRight - xOffset + rightInset) + "px";
    panel.style.marginBottom = (gMinimapPreviewBaseBottom + yOffset) + "px";
    gMinimapSizePreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideMinimapSizePreview(1.2);
}

function ShowZoomMinimapPreview(mode, sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (typeof mode !== "string") {
        sizePx = mode;
        mode = gZoomPreviewMode;
    }
    mode = (mode === "TAB") ? "TAB" : "ALT";
    gZoomPreviewMode = mode;
    var keys = GetZoomConfigKeysForMode(mode);

    var panel = EnsureZoomMinimapPreviewPanel();
    if (!panel || !gZoomMinimapPreviewCircle || !gZoomMinimapPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var sizeVal = Math.round(Number(sizePx) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG[keys.size]) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG.MINIMAP_LARGE_SIZE) || 0);
    if (sizeVal <= 0) return;

    var zoomX = Math.round(Number(MOD_CONFIG[keys.x]) || 0);
    var zoomY = Math.round(Number(MOD_CONFIG[keys.y]) || 0);

    var opacityVal = Number(MOD_CONFIG[keys.opacity]);
    if (!isFinite(opacityVal)) opacityVal = 1.0;
    opacityVal = Math.max(0, Math.min(1, opacityVal));

    var previewDiameter = GetMinimapPreviewDiameter(sizeVal);
    gZoomMinimapPreviewCircle.style.width = previewDiameter + "px";
    gZoomMinimapPreviewCircle.style.height = previewDiameter + "px";
    gZoomMinimapPreviewCircle.style.opacity = opacityVal.toFixed(2);
    panel.style.marginLeft = (gZoomPreviewBaseX + zoomX) + "px";
    panel.style.marginTop = (gZoomPreviewBaseY - zoomY) + "px";
    gZoomMinimapPreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideZoomMinimapPreview(1.2);
}

function ShowZipBoostPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureZipBoostPreviewPanel();
    if (!panel || !gZipBoostPreviewBox || !gZipBoostPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var xOffset = Math.round(Number(MOD_CONFIG.ZIP_BOOST_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.ZIP_BOOST_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.ZIP_BOOST_SCALE) || 100);

    if (xOffset < -2000) xOffset = -2000;
    if (xOffset > 2000) xOffset = 2000;
    if (yOffset < 0) yOffset = 0;
    if (yOffset > 1000) yOffset = 1000;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;

    panel.style.marginLeft = (gZipBoostPreviewBaseX + xOffset) + "px";
    panel.style.marginBottom = (gZipBoostPreviewBaseY + yOffset) + "px";
    gZipBoostPreviewBox.style.preTransformScale2d = (scale / 100).toFixed(2);
    gZipBoostPreviewLabel.text = _Localize("ZIP BOOST", true) + " " + scale + "%";
    panel.AddClass("Visible");
    ScheduleHideZipBoostPreview(1.2);
}

function ShowCrosshairStatsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureCrosshairStatsPreviewPanel();
    if (!panel || !gCrosshairStatsPreviewBox || !gCrosshairStatsPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var xOffset = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_SCALE) || 100);
    var opacity = Number(MOD_CONFIG.CROSSHAIR_STATS_OPACITY);
    if (isNaN(opacity)) opacity = 1;

    if (xOffset < -500) xOffset = -500;
    if (xOffset > 500) xOffset = 500;
    if (yOffset < -500) yOffset = -500;
    if (yOffset > 500) yOffset = 500;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    panel.style.marginLeft = (gCrosshairStatsPreviewBaseX + xOffset) + "px";
    // Subtract yOffset so the preview moves the same way the runtime overlay does
    // (positive Vertical Offset = up). Keeps showcase honest to in-game behaviour.
    panel.style.marginTop = (gCrosshairStatsPreviewBaseY - yOffset) + "px";
    gCrosshairStatsPreviewBox.style.preTransformScale2d = (scale / 100).toFixed(2);
    gCrosshairStatsPreviewBox.style.opacity = opacity.toFixed(2);
    gCrosshairStatsPreviewLabel.text = _Localize("ACTIVE STATS", true);
    panel.AddClass("Visible");
    ScheduleHideCrosshairStatsPreview(1.2);
}

function ShowUnsecuredSoulsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnsecuredSoulsPreviewPanel();
    if (!panel || !gUnsecuredSoulsPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var xOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_SCALE) || 100);
    var enabled = Number(MOD_CONFIG.ENABLE_UNSECURED_SOUL_TIMER) === 1;

    if (xOffset < -1500) xOffset = -1500;
    if (xOffset > 1500) xOffset = 1500;
    if (yOffset < -100) yOffset = -100;
    if (yOffset > 1000) yOffset = 1000;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    var fontPx = Math.round(16 * (scale / 100));
    if (fontPx < 8) fontPx = 8;
    if (fontPx > 72) fontPx = 72;
    var fontSize = fontPx + "px";

    panel.style.marginLeft = (gUnsecuredSoulsPreviewBaseX + xOffset) + "px";
    panel.style.marginBottom = (gUnsecuredSoulsPreviewBaseY + yOffset) + "px";
    if (panel.style.preTransformScale2d !== "1.00") {
        panel.style.preTransformScale2d = "1.00";
    }
    if (gUnsecuredSoulsPreviewLabel.style.fontSize !== fontSize) {
        gUnsecuredSoulsPreviewLabel.style.fontSize = fontSize;
    }
    gUnsecuredSoulsPreviewLabel.text = enabled ? "23s" : "SAFE";
    panel.AddClass("Visible");
    ScheduleHideUnsecuredSoulsPreview(1.2);
}

function ShowConfigPreviewForConfigId(configId) {
    if (IsMinimapPreviewConfig(configId)) {
        ShowMinimapSizePreview(MOD_CONFIG.MINIMAP_SMALL_SIZE);
    }
    if (IsZoomMinimapPreviewConfig(configId)) {
        gZoomPreviewMode = GetZoomPreviewModeForConfigId(configId);
        ShowZoomMinimapPreview(gZoomPreviewMode);
    }
    if (IsZipBoostPreviewConfig(configId)) {
        ShowZipBoostPreview();
    }
    if (IsCrosshairStatsPreviewConfig(configId)) {
        ShowCrosshairStatsPreview();
    }
    if (IsUnsecuredSoulsPreviewConfig(configId)) {
        ShowUnsecuredSoulsPreview();
    }
    if (IsCompassPreviewConfig(configId)) {
        ShowCompassPreview();
    }
    if (IsSpeedPreviewConfig(configId)) {
        ShowSpeedPreview();
    }
    if (IsKeyboardOverlayPreviewConfig(configId)) {
        ShowKeyboardOverlayPreview();
    }
    if (IsItemCooldownPreviewConfig(configId)) {
        ShowItemCooldownPreview();
    }
    if (IsAmmoPreviewConfig(configId)) {
        ShowAmmoPreview();
    }
    if (IsReloadCooldownPreviewConfig(configId)) {
        ShowReloadCooldownPreview();
    }
    if (IsUnitTargetPreviewConfig(configId)) {
        ShowUnitTargetPreview();
    }
    if (IsDamageReportPreviewConfig(configId)) {
        ShowDamageReportPreview();
    }
    if (IsShopPreviewConfig(configId)) {
        ShowShopPreview();
    }
    if (IsUnsecuredPlusPreviewConfig(configId)) {
        ShowUnsecuredPlusPreview();
    }
}

function ShowCompassPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureCompassPreviewPanel();
    if (!panel || !gCompassPreviewBox) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var scale = Math.round(Number(MOD_CONFIG.COMPASS_SCALE) || 100);
    var stretchX = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_X) || 100);
    var stretchY = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_Y) || 100);
    var xOffset = Math.round(Number(MOD_CONFIG.COMPASS_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.COMPASS_Y_OFFSET) || 120);
    var showSpeed = (MOD_CONFIG.ENABLE_COMPASS_SPEED !== 0);

    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    if (stretchX < 50) stretchX = 50;
    if (stretchX > 200) stretchX = 200;
    if (stretchY < 50) stretchY = 50;
    if (stretchY > 200) stretchY = 200;
    if (xOffset < -2000) xOffset = -2000;
    if (xOffset > 2000) xOffset = 2000;
    if (yOffset < -1000) yOffset = -1000;
    if (yOffset > 300) yOffset = 300;

    panel.style.marginLeft = (gCompassPreviewBaseX + xOffset) + "px";
    var compassBaselineY = Number(DEFAULT_CONFIG.COMPASS_Y_OFFSET);
    if (!isFinite(compassBaselineY)) compassBaselineY = 120;
    panel.style.marginTop = String((2 * compassBaselineY) - yOffset) + "px";

    var boxWidth = Math.round(200 * (scale / 100) * (stretchX / 100));
    var boxHeight = Math.round(50 * (scale / 100) * (stretchY / 100));
    if (boxWidth < 80) boxWidth = 80;
    if (boxHeight < 20) boxHeight = 20;

    gCompassPreviewBox.style.width = boxWidth + "px";
    gCompassPreviewBox.style.height = boxHeight + "px";
    gCompassPreviewBox.style.visibility = "visible";

    if (gCompassPreviewLabel) {
        gCompassPreviewLabel.text = boxWidth + "x" + boxHeight;
    }

    // Speed gets its own preview panel (ShowSpeedPreview) so it isn't trapped in
    // the compass box — mirroring the in-game split. When the compass shares the
    // screen we show that speed preview alongside this one for reference.
    if (showSpeed) ShowSpeedPreview();

    panel.AddClass("Visible");
    ScheduleHideCompassPreview(1.2);
}

// Independent speed preview — mirrors core's UpdateCompassOverlay exactly:
// with the compass on, the speed sits in the RIGHT half of the box, a touch
// below the degree readout; alone, it's screen-centered at the compass
// baseline. Then the speed offset sliders nudge it from there.
function ShowSpeedPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureSpeedPreviewPanel();
    if (!panel || !gSpeedPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var showCompass = (MOD_CONFIG.ENABLE_COMPASS !== 0);

    // Compass geometry — unscaled box dims, matching how core anchors the speed
    // (the speed root isn't scaled, so it uses the unscaled box width/height).
    var stretchX = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_X) || 100);
    if (stretchX < 50) stretchX = 50;
    if (stretchX > 200) stretchX = 200;
    var stretchY = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_Y) || 100);
    if (stretchY < 50) stretchY = 50;
    if (stretchY > 200) stretchY = 200;
    var compassOffsetX = Math.round(Number(MOD_CONFIG.COMPASS_X_OFFSET) || 0);
    if (compassOffsetX < -2000) compassOffsetX = -2000;
    if (compassOffsetX > 2000) compassOffsetX = 2000;
    var compassOffsetY = Math.round(Number(MOD_CONFIG.COMPASS_Y_OFFSET) || 120);
    if (compassOffsetY < -1000) compassOffsetY = -1000;
    if (compassOffsetY > 300) compassOffsetY = 300;

    var compassBaselineY = Number(DEFAULT_CONFIG.COMPASS_Y_OFFSET);
    if (!isFinite(compassBaselineY)) compassBaselineY = 120;
    var appliedCompassOffsetY = (2 * compassBaselineY) - compassOffsetY;
    var boxWidth = Math.round(200 * (stretchX / 100));
    if (boxWidth < 100) boxWidth = 100;
    var boxHeight = Math.round(50 * (stretchY / 100));
    if (boxHeight < 25) boxHeight = 25;

    var speedOffsetX = Math.round(Number(MOD_CONFIG.COMPASS_SPEED_X_OFFSET) || 0);
    var speedOffsetY = Math.round(Number(MOD_CONFIG.COMPASS_SPEED_Y_OFFSET) || 0);
    if (speedOffsetX < -2000) speedOffsetX = -2000;
    if (speedOffsetX > 2000) speedOffsetX = 2000;
    if (speedOffsetY < -2000) speedOffsetY = -2000;
    if (speedOffsetY > 2000) speedOffsetY = 2000;

    // Right half / right-aligned when the compass shares the screen; full-width
    // centered when alone. Same as core's speedLabel layout.
    gSpeedPreviewLabel.style.width = showCompass ? "50%" : "100%";
    gSpeedPreviewLabel.style.textAlign = showCompass ? "right" : "center";
    gSpeedPreviewLabel.style.horizontalAlign = showCompass ? "right" : "center";

    // Root spans the box width and centers on it, so "right half" maps to the
    // box's right half — no boxWidth/2 shift. +Y moves up (marginTop = base - y).
    var rootWidth = (showCompass ? boxWidth : 200) + "px";
    var speedBaseX = showCompass ? compassOffsetX : 0;
    var speedBaseY = showCompass ? (appliedCompassOffsetY + boxHeight + 14) : compassBaselineY;

    panel.style.width = rootWidth;
    panel.style.marginLeft = Math.round(speedBaseX + speedOffsetX) + "px";
    panel.style.marginTop = Math.round(speedBaseY - speedOffsetY) + "px";
    gSpeedPreviewLabel.text = "SPD";

    panel.AddClass("Visible");
    ScheduleHideSpeedPreview(1.2);
}

function ShowKeyboardOverlayPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureKeyboardOverlayPreviewPanel();
    if (!panel || !gKeyboardOverlayPreviewBox || !gKeyboardOverlayPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var scale = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_SCALE) || 100);
    var xOffset = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_Y_OFFSET) || 0);
    var kbFullLayout = Number(MOD_CONFIG.ENABLE_FULL_KEYBOARD_LAYOUT) === 1;

    if (scale < 70) scale = 70;
    if (scale > 150) scale = 150;
    if (xOffset < -1500) xOffset = -1500;
    if (xOffset > 1500) xOffset = 1500;
    if (yOffset < -400) yOffset = -400;
    if (yOffset > 1000) yOffset = 1000;

    var kbBaseMarginLeft = kbFullLayout ? 70 : gKeyboardOverlayPreviewBaseX;
    var kbScaleFactor = scale / 100;
    var rowDefs = kbFullLayout ? [
        [40, 40, 40, 40, 40, 40, 40],
        [53, 40, 40, 40, 40],
        [60, 40, 40, 40, 40],
        [80, 40, 40, 40, 40],
        [60, 60, 133]
    ] : [
        [80, 40, 40, 40, 40],
        [80, 40, 40, 40, 40],
        [60, 192]
    ];
    var kbScaledHeight = Math.max(1, Math.round(40 * kbScaleFactor));
    var kbScaledGap = Math.max(1, Math.round(1 * kbScaleFactor));
    var kbRowCount = rowDefs.length;
    var kbScaledWidth = 0;
    for (var r = 0; r < rowDefs.length; r++) {
        var row = rowDefs[r];
        var rowWidth = 0;
        for (var k = 0; k < row.length; k++) {
            rowWidth += Math.max(1, Math.round(row[k] * kbScaleFactor)) + (kbScaledGap * 2);
        }
        if (rowWidth > kbScaledWidth) kbScaledWidth = rowWidth;
    }
    var kbTotalHeight = Math.round(kbRowCount * (kbScaledHeight + (kbScaledGap * 2)));

    panel.style.marginLeft = (kbBaseMarginLeft + xOffset) + "px";
    panel.style.marginBottom = (gKeyboardOverlayPreviewBaseY + yOffset) + "px";
    gKeyboardOverlayPreviewBox.style.preTransformScale2d = "1.00";
    gKeyboardOverlayPreviewBox.style.width = kbScaledWidth + "px";
    gKeyboardOverlayPreviewBox.style.height = kbTotalHeight + "px";
    gKeyboardOverlayPreviewLabel.text = kbScaledWidth + "x" + kbTotalHeight;
    panel.AddClass("Visible");
    ScheduleHideKeyboardOverlayPreview(1.2);
}

function ShowItemCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureItemCooldownPreviewPanel();
    if (!panel || !gItemCooldownPreviewRow || !gItemCooldownPreviewIcon) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var size = Number(MOD_CONFIG.PASSIVE_COOLDOWN_SIZE);
    if (!isFinite(size)) size = 40;
    if (size < 30) size = 30;
    if (size > 60) size = 60;

    var xOffset = Math.round(Number(MOD_CONFIG.PASSIVE_COOLDOWN_X) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.PASSIVE_COOLDOWN_Y) || 0);
    if (xOffset < -50) xOffset = -50;
    if (xOffset > 50) xOffset = 50;
    if (yOffset < -50) yOffset = -50;
    if (yOffset > 50) yOffset = 50;

    var opacity = Number(MOD_CONFIG.PASSIVE_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.5;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var scale = size / 40;
    if (!isFinite(scale) || scale <= 0) scale = 1.0;
    if (scale < 0.75) scale = 0.75;
    if (scale > 1.5) scale = 1.5;
    var previewBaseSizePx = 45;
    var previewSizePx = Math.round(previewBaseSizePx * scale);
    if (previewSizePx < 34) previewSizePx = 34;
    if (previewSizePx > 68) previewSizePx = 68;

    panel.style.marginLeft = xOffset + "%";
    panel.style.marginTop = (-yOffset) + "%";
    gItemCooldownPreviewIcon.style.width = previewSizePx + "px";
    gItemCooldownPreviewIcon.style.height = previewSizePx + "px";
    gItemCooldownPreviewRow.style.opacity = opacity.toFixed(2);
    if (gItemCooldownPreviewLabel) gItemCooldownPreviewLabel.text = "7";

    panel.AddClass("Visible");
    ScheduleHideItemCooldownPreview(1.2);
}

function ShowAmmoPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureAmmoPreviewPanel();
    if (!panel || !gAmmoPreviewCurrentLabel || !gAmmoPreviewTotalLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var currentScale = Math.round(Number(MOD_CONFIG.AMMO_CURRENT_SCALE));
    if (!isFinite(currentScale)) currentScale = 100;
    if (currentScale < 100) currentScale = 100;
    if (currentScale > 300) currentScale = 300;

    var totalScale = Math.round(Number(MOD_CONFIG.AMMO_TOTAL_SCALE));
    if (!isFinite(totalScale)) totalScale = 100;
    if (totalScale < 100) totalScale = 100;
    if (totalScale > 300) totalScale = 300;

    var xOffset = Math.round(Number(MOD_CONFIG.AMMO_PANEL_X_OFFSET));
    if (!isFinite(xOffset)) xOffset = 0;
    if (xOffset < -200) xOffset = -200;
    if (xOffset > 200) xOffset = 200;

    var yOffset = Math.round(Number(MOD_CONFIG.AMMO_PANEL_Y_OFFSET));
    if (!isFinite(yOffset)) yOffset = 0;
    if (yOffset < -200) yOffset = -200;
    if (yOffset > 200) yOffset = 200;

    var currentScaleFactor = currentScale / 100.0;
    var totalScaleFactor = totalScale / 100.0;
    var currentFontPx = Math.max(12, Math.round(16 * currentScaleFactor));
    var currentWidthPx = Math.max(24, Math.round(32 * currentScaleFactor));
    var totalFontPx = Math.max(12, Math.round(16 * totalScaleFactor));
    var totalWidthPx = Math.max(32, Math.round(50 * totalScaleFactor));
    var totalMarginLeftPx = Math.max(0, Math.round(2 * totalScaleFactor));

    var baseX = 980;
    var baseY = 820;
    var anchoredToLive = false;
    var root = _FindRoot();
    var liveAmmo = root && root.FindChildTraverse ? root.FindChildTraverse("ammo_panel") : null;
    var liveRect = GetPanelRectRelativeToContext(liveAmmo);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + xOffset);
    var targetY = anchoredToLive ? baseY : (baseY - yOffset);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gAmmoPreviewCurrentLabel.style.fontSize = String(currentFontPx) + "px";
    gAmmoPreviewCurrentLabel.style.width = String(currentWidthPx) + "px";
    gAmmoPreviewCurrentLabel.text = "62";
    gAmmoPreviewTotalLabel.style.fontSize = String(totalFontPx) + "px";
    gAmmoPreviewTotalLabel.style.width = String(totalWidthPx) + "px";
    gAmmoPreviewTotalLabel.style.marginLeft = String(totalMarginLeftPx) + "px";
    gAmmoPreviewTotalLabel.text = "/180";

    panel.AddClass("Visible");
    ScheduleHideAmmoPreview(1.2);
}

function ShowReloadCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureReloadCooldownPreviewPanel();
    if (!panel || !gReloadCooldownPreviewRing || !gReloadCooldownPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var opacity = Number(MOD_CONFIG.RELOAD_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.6;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var size = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_SIZE));
    if (!isFinite(size)) size = 28;
    if (size < 16) size = 16;
    if (size > 60) size = 60;

    var offsetX = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_X_OFFSET));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < -75) offsetX = -75;
    if (offsetX > 75) offsetX = 75;

    var offsetY = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_Y_OFFSET));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -75) offsetY = -75;
    if (offsetY > 75) offsetY = 75;

    var context = $.GetContextPanel();
    var fallbackX = 950;
    var fallbackY = 510;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.5);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.52);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = _FindRoot();
    var liveReticle = null;
    if (root && root.FindChildTraverse) {
        liveReticle = root.FindChildTraverse("reticle_status") || root.FindChildTraverse("ReticleStatus");
    }
    var liveRect = GetPanelRectRelativeToContext(liveReticle);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.5);
        baseY = liveRect.y + Math.round(liveRect.height * 0.5);
    }

    var ringSize = Math.max(36, Math.round(size * 2.2));
    SetPreviewPanelPosition(panel, baseX + offsetX - Math.round(ringSize * 0.5), baseY - offsetY - Math.round(ringSize * 0.5));
    gReloadCooldownPreviewRing.style.width = String(ringSize) + "px";
    gReloadCooldownPreviewRing.style.height = String(ringSize) + "px";
    SetPanelOpacitySafe(gReloadCooldownPreviewRing, opacity, 0.6);
    gReloadCooldownPreviewLabel.style.fontSize = String(size) + "px";
    gReloadCooldownPreviewLabel.text = "1.3";

    panel.AddClass("Visible");
    ScheduleHideReloadCooldownPreview(1.2);
}

function ShowUnitTargetPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnitTargetPreviewPanel();
    if (!panel || !gUnitTargetPreviewImage || !gUnitTargetPreviewBinding) return;
    if (!IsSettingsWindowVisible()) return;

    var size = Math.round(Number(MOD_CONFIG.UNIT_TARGET_SIZE));
    if (!isFinite(size)) size = 150;
    if (size < 50) size = 50;
    if (size > 300) size = 300;

    var opacity = Number(MOD_CONFIG.UNIT_TARGET_OPACITY);
    if (!isFinite(opacity)) opacity = 1.0;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var redDiamond = Number(MOD_CONFIG.ENABLE_RED_DIAMOND) === 1;
    var improvedHint = Number(MOD_CONFIG.ENABLE_IMPROVED_HINT) === 1;

    var previewSizePx = Math.max(28, Math.round(size * 0.56));
    var context = $.GetContextPanel();
    var fallbackX = 930;
    var fallbackY = 470;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.5);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.44);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var root = _FindRoot();
    var liveHint = null;
    if (root && root.FindChildTraverse) {
        liveHint = root.FindChildTraverse("Citadel_AbilityHudButtonHintPanel") || root.FindChildTraverse("ability_image");
    }
    var liveRect = GetPanelRectRelativeToContext(liveHint);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.5);
        baseY = liveRect.y + Math.round(liveRect.height * 0.5);
    }

    SetPreviewPanelPosition(panel, baseX - Math.round(previewSizePx * 0.5), baseY - Math.round(previewSizePx * 0.5));
    gUnitTargetPreviewImage.style.width = String(previewSizePx) + "px";
    gUnitTargetPreviewImage.style.height = String(previewSizePx) + "px";
    SetPanelOpacitySafe(gUnitTargetPreviewImage, opacity, 1.0);
    gUnitTargetPreviewImage.SetHasClass("RedDiamond", redDiamond);
    gUnitTargetPreviewImage.SetHasClass("ImprovedHint", improvedHint);
    gUnitTargetPreviewBinding.SetHasClass("ImprovedHint", improvedHint);

    panel.AddClass("Visible");
    ScheduleHideUnitTargetPreview(1.2);
}

function ShowDamageReportPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureDamageReportPreviewPanel();
    if (!panel || !gDamageReportPreviewBox || !gDamageReportPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var offsetX = Math.round(Number(MOD_CONFIG.DAMAGE_REPORT_X_OFFSET));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < 0) offsetX = 0;
    if (offsetX > 2000) offsetX = 2000;
    var offsetY = Math.round(Number(MOD_CONFIG.DAMAGE_REPORT_Y_OFFSET));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -200) offsetY = -200;
    if (offsetY > 1000) offsetY = 1000;
    var isDisabled = Number(MOD_CONFIG.DISABLE_DAMAGE_REPORT) === 1;

    var context = $.GetContextPanel();
    var fallbackX = 1120;
    var fallbackY = 390;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.58);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.36);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var root = _FindRoot();
    var livePanel = root && root.FindChildTraverse ? root.FindChildTraverse("CitadelHudDamageReport") : null;
    var liveRect = GetPanelRectRelativeToContext(livePanel);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + offsetX);
    var targetY = anchoredToLive ? baseY : (baseY - offsetY);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gDamageReportPreviewBox.SetHasClass("Disabled", isDisabled);
    gDamageReportPreviewLabel.text = isDisabled ? "HIDDEN" : "DAMAGE REPORT";
    panel.AddClass("Visible");
    ScheduleHideDamageReportPreview(1.2);
}

function ShowShopPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureShopPreviewPanel();
    if (!panel || !gShopPreviewBox || !gShopPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var offsetX = Math.round(Number(MOD_CONFIG.SHOP_OFFSET_X));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < -500) offsetX = -500;
    if (offsetX > 500) offsetX = 500;
    var offsetY = Math.round(Number(MOD_CONFIG.SHOP_OFFSET_Y));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -500) offsetY = -500;
    if (offsetY > 500) offsetY = 500;
    var opacity = Number(MOD_CONFIG.SHOP_OPACITY);
    if (!isFinite(opacity)) opacity = 1.0;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;
    var scale = Number(MOD_CONFIG.SHOP_SCALE);
    if (!isFinite(scale)) scale = 1.0;
    if (scale < 0.5) scale = 0.5;
    if (scale > 1.5) scale = 1.5;

    var context = $.GetContextPanel();
    var fallbackX = 240;
    var fallbackY = 120;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.08);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.12);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = _FindRoot();
    var heroShop = root && root.FindChildTraverse ? root.FindChildTraverse("CitadelHudHeroShop") : null;
    var mainPanel = heroShop && heroShop.FindChildTraverse ? heroShop.FindChildTraverse("MainPanel") : null;
    var liveRect = GetPanelRectRelativeToContext(mainPanel || heroShop);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = baseX + offsetX;
    var targetY = baseY - offsetY;
    SetPreviewPanelPosition(panel, targetX, targetY);
    SetPanelOpacitySafe(panel, opacity, 1.0);
    panel.style.preTransformScale2d = scale.toFixed(2) + ", " + scale.toFixed(2);
    gShopPreviewLabel.text = "SHOP";
    panel.AddClass("Visible");
    ScheduleHideShopPreview(1.2);
}

function ShowUnsecuredPlusPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnsecuredPlusPreviewPanel();
    if (!panel || !gUnsecuredPlusPreviewIcon || !gUnsecuredPlusPreviewText || !gUnsecuredPlusPreviewValue) return;
    if (!IsSettingsWindowVisible()) return;

    var scale = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_SCALE));
    if (!isFinite(scale)) scale = 100;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    var xOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_X_OFFSET));
    if (!isFinite(xOffset)) xOffset = 0;
    if (xOffset < -1000) xOffset = -1000;
    if (xOffset > 2000) xOffset = 2000;
    var yOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET));
    if (!isFinite(yOffset)) yOffset = 0;
    if (yOffset < 800) yOffset = 800;
    if (yOffset > 2000) yOffset = 2000;

    var showIcon = Number(MOD_CONFIG.ENABLE_BETTER_UNSECURED_SHOW_ICON) === 1;
    var showText = Number(MOD_CONFIG.ENABLE_BETTER_UNSECURED_SHOW_TEXT) === 1;
    var fontPx = Math.max(8, Math.min(72, Math.round(14 * (scale / 100))));

    var context = $.GetContextPanel();
    var fallbackX = 780;
    var fallbackY = 120;
    var contextW = Number(context && context.actuallayoutwidth);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.42);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = _FindRoot();
    var liveOverlay = root && root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
    var liveRect = GetPanelRectRelativeToContext(liveOverlay);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + xOffset);
    var unsecuredHudBaselineY = Number(DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET);
    if (!isFinite(unsecuredHudBaselineY)) unsecuredHudBaselineY = 0;
    var reflectedYOffset = (2 * unsecuredHudBaselineY) - yOffset;
    var targetY = anchoredToLive ? baseY : (baseY + reflectedYOffset);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gUnsecuredPlusPreviewIcon.style.visibility = showIcon ? "visible" : "collapse";
    gUnsecuredPlusPreviewText.style.visibility = showText ? "visible" : "collapse";
    gUnsecuredPlusPreviewText.style.fontSize = String(fontPx) + "px";
    gUnsecuredPlusPreviewValue.style.fontSize = String(fontPx) + "px";
    gUnsecuredPlusPreviewValue.text = "538";

    panel.AddClass("Visible");
    ScheduleHideUnsecuredPlusPreview(1.2);
}

function EncodeBase64Raw(str) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.EncodeBase64Raw === "function") {
        return QOL_CODEC.EncodeBase64Raw(str);
    }
    return "";
}

function EncodeBase64(str) {
    var raw = EncodeBase64Raw(str);
    return raw && raw.length > 0 ? raw.match(/.{1,40}/g).join(" ") : "";
}

function DecodeBase64(str) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DecodeBase64 === "function") {
        return QOL_CODEC.DecodeBase64(str);
    }
    return "";
}

// ── Compatibility aliases (commit 1.1: redirect to shared module) ──
// These allow existing code to continue working without changes.
// They will be replaced with direct QOL_COMPACT_SCHEMA_UTILS.* calls in commit 1.2.
var COMPACT_SCHEMA_REGISTRY = QOL_COMPACT_SCHEMA_REGISTRY;
var COMPACT_SCHEMA_WIRE_TO_SEMVER = QOL_COMPACT_SCHEMA_WIRE_TO_SEMVER;
var LATEST_COMPACT_SEMVER = QOL_LATEST_COMPACT_SEMVER;
function GetCompactSchema(semver)      { return QOL_COMPACT_SCHEMA_UTILS.GetSchema(semver); }
function GetCompactWireVersion(semver) { return QOL_COMPACT_SCHEMA_UTILS.GetWireVersion(semver); }
function ResolveCompactSemverFromWireVersion(wv) { return QOL_COMPACT_SCHEMA_UTILS.ResolveSemverFromWire(wv); }
function AreCompactSemversWireCompatible(a, b) { return QOL_COMPACT_SCHEMA_UTILS.AreSemversWireCompatible(a, b); }

// ── Serialization helpers (remain in ql_settings.js — export/import specific) ──

function GetStepDecimals(step) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.GetStepDecimals === "function") {
        return QOL_CODEC.GetStepDecimals(step);
    }
    var s = String(step);
    var idx = s.indexOf(".");
    return idx === -1 ? 0 : (s.length - idx - 1);
}

function ToBase64Url(binaryStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.ToBase64Url === "function") {
        return QOL_CODEC.ToBase64Url(binaryStr);
    }
    return EncodeBase64Raw(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function FromBase64Url(urlStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.FromBase64Url === "function") {
        return QOL_CODEC.FromBase64Url(urlStr);
    }
    var padded = String(urlStr || "").replace(/-/g, "+").replace(/_/g, "/");
    while (padded.length % 4 !== 0) padded += "=";
    return DecodeBase64(padded);
}

function SerializeCompactV2(config, semverOverride) {
    var semver = String(semverOverride || LATEST_COMPACT_SEMVER);
    var wireVersion = GetCompactWireVersion(semver);
    var schema = GetCompactSchema(semver);
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.SerializeCompactBinary === "function") {
        return QOL_CODEC.SerializeCompactBinary(config, schema, wireVersion, function(field, cfg) {
            var val = cfg && cfg.hasOwnProperty(field.key) ? cfg[field.key] : field.min;
            if (field.key === "ULT_COOLDOWN_X_OFFSET" || field.key === "ULT_COOLDOWN_Y_OFFSET") {
                val = 0;
            }
            if (field.key === COMPACT_DEFAULT_HERO_FIELD) {
                var configuredHero = String((cfg && cfg.DEFAULT_HERO) || "");
                var configuredHeroIndex = DEFAULT_HERO_OPTIONS.indexOf(configuredHero);
                if (configuredHeroIndex < 0) {
                    configuredHeroIndex = DEFAULT_HERO_OPTIONS.indexOf(String(DEFAULT_CONFIG.DEFAULT_HERO || ""));
                }
                if (configuredHeroIndex < 0) configuredHeroIndex = 0;
                val = configuredHeroIndex;
            }
            return val;
        });
    }
    throw new Error("Compact serializer unavailable");
}

function DeserializeCompactV2(binaryStr, expectedSemver) {
    var raw = String(binaryStr || "");
    if (raw.length < 1) throw new Error("Compact string too short");
    var wireVersion = raw.charCodeAt(0) & 255;
    var semver = "";
    if (expectedSemver) {
        var expected = String(expectedSemver);
        var expectedWireVersion = GetCompactWireVersion(expected);
        if (expectedWireVersion !== wireVersion) throw new Error("Compact schema wire version mismatch");
        semver = expected;
    } else {
        semver = ResolveCompactSemverFromWireVersion(wireVersion);
    }
    var schema = GetCompactSchema(semver);
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DeserializeCompactBinary === "function") {
        return QOL_CODEC.DeserializeCompactBinary(
            raw,
            schema,
            function(field, value, parsed) {
                if (field.key === COMPACT_DEFAULT_HERO_FIELD) {
                    var heroIndex = Math.round(value);
                    if (heroIndex < 0 || heroIndex >= DEFAULT_HERO_OPTIONS.length) heroIndex = 0;
                    var fallbackHeroId = String(DEFAULT_CONFIG.DEFAULT_HERO || "");
                    var resolvedHeroId = DEFAULT_HERO_OPTIONS[heroIndex] || fallbackHeroId || "hero_werewolf";
                    parsed.DEFAULT_HERO = resolvedHeroId;
                    return true;
                }
                return false;
            },
            function(missingField, parsed) {
                if (!missingField || !missingField.key) return;
                if (missingField.key === COMPACT_DEFAULT_HERO_FIELD) {
                    parsed.DEFAULT_HERO = String(DEFAULT_CONFIG.DEFAULT_HERO || "hero_werewolf");
                } else if (DEFAULT_CONFIG.hasOwnProperty(missingField.key)) {
                    parsed[missingField.key] = DEFAULT_CONFIG[missingField.key];
                }
            }
        );
    }
    throw new Error("Compact deserializer unavailable");
}

function ApplyParsedConfig(parsed) {
    for (var key in parsed) {
        if (MOD_CONFIG.hasOwnProperty(key)) {
            MOD_CONFIG[key] = parsed[key];
        }
    }
    MigrateSplitZoomKeys(MOD_CONFIG, parsed);
    NormalizeNeutralCampFlags(MOD_CONFIG, parsed);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, parsed);
    NormalizeAmmoScaleConfig(MOD_CONFIG, parsed);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, parsed);
    NormalizeColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeAllyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarEnemyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarAllyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeShopItemNotificationsConfig(MOD_CONFIG, parsed);
    NormalizeLanguageSchemaMigration(MOD_CONFIG, parsed, LATEST_COMPACT_SEMVER);
}

function ClampToSchemaField(value, field) {
    if (!field) return { value: value, changed: false };
    var n = Number(value);
    if (!isFinite(n)) return { value: value, changed: false };
    var clamped = Math.max(Number(field.min), Math.min(Number(field.max), n));
    var step = Number(field.step);
    if (isFinite(step) && step > 0) {
        clamped = field.min + (Math.round((clamped - field.min) / step) * step);
    }
    var decimals = GetStepDecimals(field.step);
    clamped = decimals > 0 ? parseFloat(clamped.toFixed(decimals)) : Math.round(clamped);
    return { value: clamped, changed: NormalizeComparableConfigValue(clamped) !== NormalizeComparableConfigValue(value) };
}

function BuildSchemaFieldMap(version) {
    var map = {};
    var schema = [];
    var schemaSemver = String(version || LATEST_COMPACT_SEMVER);
    try { schema = GetCompactSchema(schemaSemver) || []; } catch (e0) { $.Msg("[QOLLock][WARN][schema] GetCompactSchema failed for v" + schemaSemver + ": " + (e0 && e0.message ? e0.message : String(e0 || ""))); schema = []; }
    for (var i = 0; i < schema.length; i++) {
        var field = schema[i];
        if (!field || !field.key) continue;
        map[String(field.key)] = field;
    }
    return map;
}

function ApplyParsedConfigWithDiagnostics(parsed, schemaVersion) {
    var diagnostics = {
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    if (!parsed || typeof parsed !== "object") return diagnostics;

    var preservedDragEnabled = MOD_CONFIG.DRAG_ENABLED;
    var preservedPreviewsEnabled = MOD_CONFIG.PREVIEWS_ENABLED;
    var fieldMap = BuildSchemaFieldMap(schemaVersion);
    for (var defaultKey in DEFAULT_CONFIG) {
        MOD_CONFIG[defaultKey] = DEFAULT_CONFIG[defaultKey];
    }
    for (var key in parsed) {
        if (!MOD_CONFIG.hasOwnProperty(key)) {
            diagnostics.unknownKeys++;
            continue;
        }
        var nextValue = parsed[key];
        var field = fieldMap[key] || null;
        if (field && typeof nextValue === "number") {
            var clampResult = ClampToSchemaField(nextValue, field);
            nextValue = clampResult.value;
            if (clampResult.changed) diagnostics.clampedKeys++;
        }
        MOD_CONFIG[key] = nextValue;
        diagnostics.appliedKeys++;
    }
    MigrateSplitZoomKeys(MOD_CONFIG, parsed);
    NormalizeNeutralCampFlags(MOD_CONFIG, parsed);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, parsed);
    NormalizeAmmoScaleConfig(MOD_CONFIG, parsed);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, parsed);
    NormalizeColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeAllyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarEnemyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarAllyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeShopItemNotificationsConfig(MOD_CONFIG, parsed);
    NormalizeCompassSpeedSchemaMigration(MOD_CONFIG, parsed, schemaVersion || LATEST_COMPACT_SEMVER);
    NormalizeLanguageSchemaMigration(MOD_CONFIG, parsed, schemaVersion || LATEST_COMPACT_SEMVER);
    MOD_CONFIG.DRAG_ENABLED = preservedDragEnabled;
    MOD_CONFIG.PREVIEWS_ENABLED = preservedPreviewsEnabled;
    SetRuntimePresetName("");
    return diagnostics;
}

function _FindRoot() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) {
        root = root.GetParent();
    }
    return root;
}

function ExtractHeroTokenFromText(rawText) {
    if (!rawText) return "";
    var text = String(rawText);
    var m = text.match(/\b(hero_[a-z0-9_]+)\b/i);
    return (m && m[1]) ? String(m[1]).toLowerCase() : "";
}

function ExtractLastHeroTokenFromText(rawText) {
    if (!rawText) return "";
    var text = String(rawText);
    var re = /\b(hero_[a-z0-9_]+)\b/ig;
    var match = null;
    var last = "";
    while ((match = re.exec(text)) !== null) {
        if (match[1]) last = String(match[1]).toLowerCase();
    }
    return last;
}

function PublishHeroHintFromSettings() {
    // GameInterfaceAPI confirmed absent — hero hint publishing from settings unavailable.
    // Hero detection relies on HUD-side UI panel scanning.
}

function StartHeroHintPublisher() {
    function tick() {
        // Only publish hero hints while the settings window is open.
        // No point running this poll when the player can't see the settings UI.
        if (IsSettingsWindowVisible()) {
            try { PublishHeroHintFromSettings(); } catch(e0) { _WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        $.Schedule(HERO_HINT_PUBLISH_INTERVAL_SEC, tick);
    }
    tick();
}

function IsInHideoutForBuildSave() {
    // Game.GetMapInfo confirmed absent — use panel class detection for hideout detection.
    var root = _FindRoot();
    if (root && root.BHasClass) {
        try {
            if (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout")) return true;
        } catch(e1) { _WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    }
    var hud = root && root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
    if (hud && hud.BHasClass) {
        try {
            if (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout")) return true;
        } catch(e2) { _WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
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
    var root = _FindRoot();
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

function QueueBuildSaveRequest(rawExportString) {
    var payload = rawExportString ? String(rawExportString).replace(/\s+/g, "") : "";
    if (!payload || !EXPORT_TOKEN_REGEX.test(payload)) return "";

    var token = String(Date.now ? Date.now() : (new Date()).getTime()) + "_" + String(Math.floor(Math.random() * 1000000));
    var panel = $.GetContextPanel();
    var root = _FindRoot();

    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, payload);
        panel.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, token);
        panel.SetAttributeString(BUILD_SAVE_MSG_ATTR, "queued");
        panel.SetAttributeString(BUILD_SAVE_STATE_ATTR, "pending");
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, payload);
        root.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, token);
        root.SetAttributeString(BUILD_SAVE_MSG_ATTR, "queued");
        root.SetAttributeString(BUILD_SAVE_STATE_ATTR, "pending");
    }
    return token;
}

function ReadBuildSaveStatus() {
    var panel = $.GetContextPanel();
    var root = _FindRoot();
    var fromRoot = root && root.GetAttributeString ? {
        state: root.GetAttributeString(BUILD_SAVE_STATE_ATTR, ""),
        msg: root.GetAttributeString(BUILD_SAVE_MSG_ATTR, ""),
        token: root.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "")
    } : { state: "", msg: "", token: "" };
    if (fromRoot.state || fromRoot.msg || fromRoot.token) return fromRoot;
    if (panel && panel.GetAttributeString) {
        return {
            state: panel.GetAttributeString(BUILD_SAVE_STATE_ATTR, ""),
            msg: panel.GetAttributeString(BUILD_SAVE_MSG_ATTR, ""),
            token: panel.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "")
        };
    }
    return { state: "", msg: "", token: "" };
}

function ResolveBuildSavePendingLabel(message) {
    if (message === "starting") return "START";
    if (message === "switching_to_skyrunner" || message === "switching_to_airheart") return "SKYRUNNER";
    if (message === "waiting_for_shop") return "OPEN SHOP";
    if (message === "initializing_storage_build") return "INIT BUILD";
    if (message === "opening_edit_mode") return "EDITING";
    if (message === "writing_category_name") return "WRITING";
    if (message === "saving") return "SAVING";
    if (message === "verifying") return "VERIFY";
    return "SAVING";
}

function WatchBuildSaveStatus(saveBtn, saveLbl, expectedToken, defaultLabel) {
    var startMs = Date.now ? Date.now() : (new Date()).getTime();
    var timeoutMs = 30000;
    var lastFeedbackKey = "";

    function setFeedbackForPending(msg) {
        var key = "pending:" + String(msg || "");
        if (key === lastFeedbackKey) return;
        lastFeedbackKey = key;
        var message = String(msg || "");
        if (message === "waiting_for_shop") {
            SetLocalizedConfigFeedbackMessage("Open shop to continue save.", "warning", 0);
            return;
        }
        if (message === "switching_to_skyrunner" || message === "switching_to_airheart") {
            SetLocalizedConfigFeedbackMessage("Switching to Skyrunner...", "info", 0);
            return;
        }
        if (message === "writing_category_name" || message === "saving") {
            SetLocalizedConfigFeedbackMessage("Writing settings string to build...", "info", 0);
            return;
        }
            SetLocalizedConfigFeedbackMessage("Save in progress...", "info", 0);
    }

    function restoreDefault() {
        if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
        saveBtn.RemoveClass("SuccessState");
        saveBtn.RemoveClass("FailureState");
        saveLbl.text = defaultLabel;
    }

    function tick() {
        if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var elapsedMs = nowMs - startMs;
        var status = ReadBuildSaveStatus();
        var tokenMatches = !expectedToken || !status.token || status.token === expectedToken;

        if (status.state === "pending" && tokenMatches) {
            saveBtn.RemoveClass("FailureState");
            saveBtn.AddClass("SuccessState");
            saveLbl.text = _Localize(ResolveBuildSavePendingLabel(status.msg || ""), true);
            setFeedbackForPending(status.msg || "");
            if (elapsedMs >= timeoutMs) {
                saveBtn.RemoveClass("SuccessState");
                saveBtn.AddClass("FailureState");
                saveLbl.text = _Localize("TIMEOUT", true);
        SetLocalizedConfigFeedbackMessage("Save timed out. Try again.", "error", 2600);
                $.Schedule(0.75, restoreDefault);
                return;
            }
            $.Schedule(0.15, tick);
            return;
        }

        if (status.state === "success" && tokenMatches) {
            saveBtn.RemoveClass("FailureState");
            saveBtn.AddClass("SuccessState");
            saveLbl.text = _Localize("SAVED", true);
            SetLocalizedConfigFeedbackMessage("Save completed.", "success", 2200);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (status.state === "failed" && tokenMatches) {
            saveBtn.RemoveClass("SuccessState");
            saveBtn.AddClass("FailureState");
            saveLbl.text = _Localize("FAILED", true);
            SetLocalizedConfigFeedbackMessage("Save failed.", "error", 2600);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (elapsedMs < timeoutMs) {
            $.Schedule(0.15, tick);
            return;
        }
        restoreDefault();
    }

    tick();
}

var gSaveButtonLastActionMs = 0;
var SAVE_BUTTON_DEBOUNCE_MS = 1000;

function ActivateBuildSaveFromUi(saveBtn, saveLbl, onBeforeQueue) {
    if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
    if (!saveLbl || !saveLbl.IsValid || !saveLbl.IsValid()) return;
    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
    if (gSaveButtonLastActionMs > nowMs - SAVE_BUTTON_DEBOUNCE_MS) return;
    gSaveButtonLastActionMs = nowMs;
    var cfgSave = _Localize("SAVE", true);
    var cfgQueued = _Localize("QUEUED", true);
    var cfgFailed = _Localize("FAILED", true);

    if (typeof onBeforeQueue === "function") {
        try { onBeforeQueue(); } catch(e0) { _WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }

    var exportRaw = GetCurrentExportSettingsString();
    var token = QueueBuildSaveRequest(exportRaw);
    if (!token || token.length === 0) {
        saveBtn.RemoveClass("SuccessState");
        saveBtn.AddClass("FailureState");
        saveLbl.text = cfgFailed;
        SetLocalizedConfigFeedbackMessage("Failed to queue save request.", "error", 2200);
        $.Schedule(0.6, function() {
            if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
            saveBtn.RemoveClass("FailureState");
            saveLbl.text = cfgSave;
        });
        return;
    }

    saveBtn.RemoveClass("FailureState");
    saveBtn.AddClass("SuccessState");
    saveLbl.text = cfgQueued;
        SetLocalizedConfigFeedbackMessage("Save queued.", "info", 0);
    WatchBuildSaveStatus(saveBtn, saveLbl, token, cfgSave);
}

var gClearButtonLastActionMs = 0;
var CLEAR_BUTTON_DEBOUNCE_MS = 1000;

function QueueBuildClearRequest() {
    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
    if (gClearButtonLastActionMs > nowMs - CLEAR_BUTTON_DEBOUNCE_MS) return "";
    gClearButtonLastActionMs = nowMs;
    var token = String(Date.now ? Date.now() : (new Date()).getTime()) + "_" + String(Math.floor(Math.random() * 1000000));
    var panel = $.GetContextPanel();
    var root = _FindRoot();

    var saveStatus = ReadBuildSaveStatus();
    if (saveStatus && saveStatus.state === "pending") return "";

    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(BUILD_CLEAR_REQUEST_ATTR, "1");
        panel.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, token);
        panel.SetAttributeString(BUILD_CLEAR_MSG_ATTR, "queued");
        panel.SetAttributeString(BUILD_CLEAR_STATE_ATTR, "pending");
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(BUILD_CLEAR_REQUEST_ATTR, "1");
        root.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, token);
        root.SetAttributeString(BUILD_CLEAR_MSG_ATTR, "queued");
        root.SetAttributeString(BUILD_CLEAR_STATE_ATTR, "pending");
    }
    return token;
}

function ReadBuildClearStatus() {
    var panel = $.GetContextPanel();
    var root = _FindRoot();
    var fromRoot = root && root.GetAttributeString ? {
        state: root.GetAttributeString(BUILD_CLEAR_STATE_ATTR, ""),
        msg: root.GetAttributeString(BUILD_CLEAR_MSG_ATTR, ""),
        token: root.GetAttributeString(BUILD_CLEAR_TOKEN_ATTR, "")
    } : { state: "", msg: "", token: "" };
    if (fromRoot.state || fromRoot.msg || fromRoot.token) return fromRoot;
    if (panel && panel.GetAttributeString) {
        return {
            state: panel.GetAttributeString(BUILD_CLEAR_STATE_ATTR, ""),
            msg: panel.GetAttributeString(BUILD_CLEAR_MSG_ATTR, ""),
            token: panel.GetAttributeString(BUILD_CLEAR_TOKEN_ATTR, "")
        };
    }
    return { state: "", msg: "", token: "" };
}

function ResolveBuildClearPendingLabel(message) {
    if (message === "starting") return "START";
    if (message === "switching_to_skyrunner" || message === "switching_to_airheart") return "SKYRUNNER";
    if (message === "confirming_skyrunner" || message === "confirming_airheart") return "SKYRUNNER";
    if (message === "await_user_open_shop") return "OPEN SHOP";
    if (message === "waiting_for_shop") return "OPEN SHOP";
    if (message === "opening_builds_list") return "BROWSE";
    if (message === "deleting_build") return "CLEARING";
    if (message === "confirming_delete") return "CONFIRM";
    if (message === "verifying_clear") return "VERIFY";
    return "CLEARING";
}

function IsBuildClearUserPromptStage(message) {
    return message === "await_user_open_shop" || message === "waiting_for_shop";
}

function WatchBuildClearStatus(clearBtn, clearLbl, expectedToken, defaultLabel) {
    var startMs = Date.now ? Date.now() : (new Date()).getTime();
    var timeoutMs = 30000;
    var forcedCloseForPrompt = false;
    var lastFeedbackKey = "";

    function setFeedbackForPending(msg, isPrompt) {
        var key = String(msg || "") + "|" + String(isPrompt ? 1 : 0);
        if (key === lastFeedbackKey) return;
        lastFeedbackKey = key;
        if (isPrompt) {
            SetLocalizedConfigFeedbackMessage("Open shop to continue clear.", "warning", 0);
            return;
        }
        if (
            msg === "switching_to_skyrunner" ||
            msg === "switching_to_airheart" ||
            msg === "confirming_skyrunner" ||
            msg === "confirming_airheart"
        ) {
            SetLocalizedConfigFeedbackMessage("Confirming Skyrunner for clear...", "info", 0);
            return;
        }
        if (msg === "deleting_build" || msg === "confirming_delete") {
            SetLocalizedConfigFeedbackMessage("Clearing builds...", "info", 0);
            return;
        }
            SetLocalizedConfigFeedbackMessage("Clear in progress...", "info", 0);
    }

    function restoreDefault() {
        if (!clearBtn || !clearBtn.IsValid || !clearBtn.IsValid()) return;
        clearBtn.RemoveClass("SuccessState");
        clearBtn.RemoveClass("FailureState");
        clearBtn.RemoveClass("UserPromptState");
        clearLbl.text = defaultLabel;
    }

    function tick() {
        if (!clearBtn || !clearBtn.IsValid || !clearBtn.IsValid()) return;
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var elapsedMs = nowMs - startMs;
        var status = ReadBuildClearStatus();
        var tokenMatches = !expectedToken || !status.token || status.token === expectedToken;

        if (status.state === "pending" && tokenMatches) {
            var pendingMsg = status.msg || "";
            var isUserPromptStage = IsBuildClearUserPromptStage(pendingMsg);
            if (isUserPromptStage) {
                clearBtn.RemoveClass("SuccessState");
                clearBtn.AddClass("FailureState");
                clearBtn.AddClass("UserPromptState");
                clearLbl.text = _Localize(ResolveBuildClearPendingLabel(pendingMsg), true);
                setFeedbackForPending(pendingMsg, true);
                if (!forcedCloseForPrompt) {
                    forcedCloseForPrompt = true;
                    $.ForceCloseModSettings();
                }
            } else {
                forcedCloseForPrompt = false;
                clearBtn.RemoveClass("UserPromptState");
                clearBtn.RemoveClass("FailureState");
                clearBtn.AddClass("SuccessState");
                clearLbl.text = _Localize(ResolveBuildClearPendingLabel(pendingMsg), true);
                setFeedbackForPending(pendingMsg, false);
            }
            if (elapsedMs >= timeoutMs) {
                clearBtn.RemoveClass("SuccessState");
                clearBtn.AddClass("FailureState");
                clearBtn.RemoveClass("UserPromptState");
                clearLbl.text = _Localize("TIMEOUT", true);
        SetLocalizedConfigFeedbackMessage("Clear timed out. Try again.", "error", 2600);
                $.Schedule(0.75, restoreDefault);
                return;
            }
            $.Schedule(0.15, tick);
            return;
        }

        if (status.state === "success" && tokenMatches) {
            clearBtn.RemoveClass("FailureState");
            clearBtn.AddClass("SuccessState");
            clearBtn.RemoveClass("UserPromptState");
            clearLbl.text = _Localize("CLEARED", true);
            SetLocalizedConfigFeedbackMessage("Clear completed.", "success", 2200);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (status.state === "failed" && tokenMatches) {
            clearBtn.RemoveClass("SuccessState");
            clearBtn.AddClass("FailureState");
            clearBtn.RemoveClass("UserPromptState");
            clearLbl.text = _Localize("FAILED", true);
            SetLocalizedConfigFeedbackMessage("Clear failed.", "error", 2600);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (elapsedMs < timeoutMs) {
            $.Schedule(0.15, tick);
            return;
        }
        restoreDefault();
    }

    tick();
}

function ReadConfigRawFromStorage() {
    var panel = $.GetContextPanel();
    var root = _FindRoot();
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
    UpdateOnDeathArcadeBridgePollerState();
}

function PersistStatlockerProfileState(rawConfig, configObj) {
    // $.persistentStorage confirmed absent — config persistence is via Skyrunner builds.
}

function GetRuntimePresetName() {
    var panel = $.GetContextPanel();
    var root = _FindRoot();
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
    var root = _FindRoot();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (e0) { hud = null; }
    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(RUNTIME_PRESET_ATTR, value);
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(RUNTIME_PRESET_ATTR, value);
    }
    if (hud && hud.SetAttributeString) {
        try { hud.SetAttributeString(RUNTIME_PRESET_ATTR, value); } catch(e1) { _WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
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
    var root = _FindRoot();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    try { if (panel && panel.SetAttributeString) panel.SetAttributeString(attrName, bridgeValue); } catch(ePanel) { _WarnLog("settings", "op failed: " + (ePanel && ePanel.message ? ePanel.message : String(ePanel || ""))); }
    try { if (root && root.SetAttributeString) root.SetAttributeString(attrName, bridgeValue); } catch(eRoot) { _WarnLog("settings", "op failed: " + (eRoot && eRoot.message ? eRoot.message : String(eRoot || ""))); }
    try { if (hud && hud.SetAttributeString) hud.SetAttributeString(attrName, bridgeValue); } catch(eHudSet) { _WarnLog("settings", "op failed: " + (eHudSet && eHudSet.message ? eHudSet.message : String(eHudSet || ""))); }
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
    var root = _FindRoot();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    NormalizeConfig(MOD_CONFIG, MOD_CONFIG);
    RefreshActivePresetConfigMarkerBeforeSave();
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
        try { hud.SetAttributeString(STORAGE_KEY, data); } catch(eHudStorage) { _WarnLog("settings", "op failed: " + (eHudStorage && eHudStorage.message ? eHudStorage.message : String(eHudStorage || ""))); }
        try { hud.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev)); } catch(eHudRev) { _WarnLog("settings", "op failed: " + (eHudRev && eHudRev.message ? eHudRev.message : String(eHudRev || ""))); }
    }
    PersistStatlockerProfileState(data, MOD_CONFIG);
    PublishPaletteColorBridges();
    UpdateOnDeathArcadeBridgePollerState();
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
    HideMinimapSizePreview();
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

function GetRowResetKeys(rowPanel) {
    if (!rowPanel || !rowPanel.GetAttributeString) return [];
    var raw = "";
    try { raw = rowPanel.GetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, ""); } catch (e0) { raw = ""; }
    if (!raw || raw.length === 0) return [];
    var parts = String(raw).split(",");
    var keys = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
        var key = String(parts[i] || "").trim();
        if (!key || seen[key]) continue;
        seen[key] = true;
        keys.push(key);
    }
    return keys;
}

function ApplyResetForConfigKeys(keys) {
    if (!Array.isArray(keys) || keys.length <= 0) return 0;
    var changed = 0;
    for (var i = 0; i < keys.length; i++) {
        var key = String(keys[i] || "");
        if (!key || !MOD_CONFIG.hasOwnProperty(key) || !DEFAULT_CONFIG.hasOwnProperty(key)) continue;
        if (NormalizeComparableConfigValue(MOD_CONFIG[key]) === NormalizeComparableConfigValue(DEFAULT_CONFIG[key])) continue;
        MOD_CONFIG[key] = DEFAULT_CONFIG[key];
        changed++;
    }
    return changed;
}

function CollectResetKeysFromPanel(panel, outKeys, seen) {
    if (!panel || !outKeys || !seen) return;

    try {
        if (panel.BHasClass && panel.BHasClass("SettingRow")) {
            var rowKeys = GetRowResetKeys(panel);
            for (var i = 0; i < rowKeys.length; i++) {
                var key = rowKeys[i];
                if (!key || seen[key]) continue;
                seen[key] = true;
                outKeys.push(key);
            }
        }
    } catch (e0) { $.Msg("[QOLLock][WARN][settings] CollectResetKeysFromPanel failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }

    var children = [];
    try { children = panel.Children ? panel.Children() : []; } catch (e1) { children = []; }
    for (var c = 0; c < children.length; c++) {
        CollectResetKeysFromPanel(children[c], outKeys, seen);
    }
}

function CollectResetKeysFromSectionTitleRow(titleRow) {
    var keys = [];
    var seen = {};
    if (!titleRow || !titleRow.GetParent) return keys;
    var parent = titleRow.GetParent();
    if (!parent || !parent.Children) return keys;

    var siblings = [];
    try { siblings = parent.Children() || []; } catch (e0) { siblings = []; }
    var startIndex = -1;
    for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] === titleRow) {
            startIndex = i;
            break;
        }
    }
    if (startIndex < 0) return keys;

    for (var s = startIndex + 1; s < siblings.length; s++) {
        var sibling = siblings[s];
        if (!sibling || !sibling.IsValid || !sibling.IsValid()) continue;
        var isBoundary = false;
        try {
            if ((sibling.BHasClass && sibling.BHasClass("SectionTitleRow")) ||
                (sibling.BHasClass && sibling.BHasClass("SectionTitle")) ||
                (sibling.BHasClass && sibling.BHasClass("RowSeparator"))) {
                isBoundary = true;
            }
        } catch(e1) { _WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        if (isBoundary) break;
        CollectResetKeysFromPanel(sibling, keys, seen);
    }
    return keys;
}

function HasAnyChangedConfigKeys(keys) {
    if (!Array.isArray(keys) || keys.length <= 0) return false;
    for (var i = 0; i < keys.length; i++) {
        if (IsConfigKeyChangedFromDefault(keys[i])) return true;
    }
    return false;
}

function CreateSectionResetButton(titleRow, resolveKeysFn, includeEnableKey, parentPanel) {
    if (!titleRow || !titleRow.IsValid || !titleRow.IsValid()) return null;
    if (typeof resolveKeysFn !== "function") return null;

    var resetParent = titleRow;
    if (parentPanel && parentPanel.IsValid && parentPanel.IsValid()) {
        resetParent = parentPanel;
    }

    var resetBtn = $.CreatePanel("Button", resetParent, "");
    resetBtn.AddClass("SectionTitleActionBtn");
    resetBtn.AddClass("SectionResetBtn");
    var resetIcon = $.CreatePanel("Image", resetBtn, "", {
        src: "s2r://panorama/images/icons/icon_refresh.vsvg",
        defaultsrc: "",
        scaling: "contain"
    });
    resetIcon.AddClass("SectionTitleActionIcon");
    resetIcon.AddClass("SettingRowResetIcon");
    resetIcon.AddClass("QOLResetIcon");
    try { resetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch(eIcon) { _WarnLog("settings", "op failed: " + (eIcon && eIcon.message ? eIcon.message : String(eIcon || ""))); }

    var buildResetKeys = function() {
        var keys = resolveKeysFn() || [];
        var seen = {};
        var merged = [];
        for (var i = 0; i < keys.length; i++) {
            var k = String(keys[i] || "");
            if (!k || seen[k]) continue;
            if (!MOD_CONFIG.hasOwnProperty(k) || !DEFAULT_CONFIG.hasOwnProperty(k)) continue;
            seen[k] = true;
            merged.push(k);
        }
        if (includeEnableKey) {
            var ek = String(includeEnableKey || "");
            if (ek && !seen[ek] && MOD_CONFIG.hasOwnProperty(ek) && DEFAULT_CONFIG.hasOwnProperty(ek)) {
                merged.push(ek);
            }
        }
        return merged;
    };

    var refreshBtnState = function() {
        if (!resetBtn || !resetBtn.IsValid || !resetBtn.IsValid()) return;
        var keys = buildResetKeys();
        var hasKeys = keys.length > 0;
        var hasChanges = hasKeys && HasAnyChangedConfigKeys(keys);
        resetBtn.SetHasClass("Hidden", !hasKeys);
        resetBtn.SetHasClass("HasChanges", hasChanges);
    };

    resetBtn.SetPanelEvent("onmouseover", function() {
        QOL.tooltip.hideTextTooltip();
        QOL.tooltip.cancelHide();
        QOL.tooltip.showRowTooltip(
            resetBtn,
            "",
            _Localize("Reset section to defaults", true),
            QOL.tooltip.TIER_NONE,
            ""
        );
    });
    resetBtn.SetPanelEvent("onmouseout", function() {
        QOL.tooltip.hideTextTooltip();
        QOL.tooltip.hideTooltipDeferred("section_reset_btn_mouseout");
    });
    resetBtn.SetPanelEvent("onactivate", function() {
        var keys = buildResetKeys();
        var changed = ApplyResetForConfigKeys(keys);
        if (changed > 0) {
            SaveAndSync();
            SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u043E \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A: " + String(changed))
                : ("Section reset (" + String(changed) + " changed)."), "success", 1800);
            RequestSettingsListSoftRefresh(0);
        } else {
            SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                ? "\u0421\u0435\u043A\u0446\u0438\u044F \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                : "Section already at defaults.", "info", 1400);
        }
    });

    refreshBtnState();
    $.Schedule(0.0, refreshBtnState);
    RegisterSettingsListRowSync(function() {
        if (!resetBtn || !resetBtn.IsValid || !resetBtn.IsValid()) return false;
        refreshBtnState();
        return true;
    });
    return resetBtn;
}

function SetConfigFeedbackMessage(message, tone, holdMs) {
    var label = gConfigFeedbackLabel;
    if (!label || !label.IsValid || !label.IsValid()) return;

    var safeMessage = String(message || "");
    label.text = safeMessage;
    label.SetHasClass("FeedbackInfo", tone === "info");
    label.SetHasClass("FeedbackSuccess", tone === "success");
    label.SetHasClass("FeedbackWarning", tone === "warning");
    label.SetHasClass("FeedbackError", tone === "error");

    var hold = Math.max(0, Math.round(Number(holdMs) || 0));
    if (hold <= 0) return;

    gConfigFeedbackClearToken++;
    var token = gConfigFeedbackClearToken;
    $.Schedule(hold / 1000.0, function() {
        if (token !== gConfigFeedbackClearToken) return;
        if (!gConfigFeedbackLabel || !gConfigFeedbackLabel.IsValid || !gConfigFeedbackLabel.IsValid()) return;
        gConfigFeedbackLabel.text = "";
        gConfigFeedbackLabel.SetHasClass("FeedbackInfo", true);
        gConfigFeedbackLabel.SetHasClass("FeedbackSuccess", false);
        gConfigFeedbackLabel.SetHasClass("FeedbackWarning", false);
        gConfigFeedbackLabel.SetHasClass("FeedbackError", false);
    });
}

function _PrepareModal() {
    try {
        ApplySettingsThemeClasses(null);
    } catch(eModalTheme) { _WarnLog("settings", "op failed: " + (eModalTheme && eModalTheme.message ? eModalTheme.message : String(eModalTheme || ""))); }
}

function CloseModal(overlay) {
    if (!overlay || !overlay.IsValid()) return;
    var overlayId = "";
    try { overlayId = String(overlay.id || ""); } catch (e0) { overlayId = ""; }
    var shouldReleaseSettingsFocus = (overlayId === "ConfigDiffPreviewModalOverlay");
    if (overlayId.indexOf("Arcade") === 0) {
        var onDeathBridgeState = GetOnDeathArcadeBridgeState();
        if (onDeathBridgeState.active) {
            gOnDeathArcadeSessionActive = false;
            gOnDeathArcadeLastRequestToken = String(onDeathBridgeState.token || gOnDeathArcadeLastRequestToken || "");
            ForceCloseEscapeMenuForOnDeathGames();
        }
    }
    overlay.RemoveClass("Show");
    if (shouldReleaseSettingsFocus) {
        try {
            var settingsWin = $.GetContextPanel ? $.GetContextPanel().FindChildTraverse("SettingsWindow") : null;
            if (settingsWin && settingsWin.IsValid && settingsWin.IsValid()) {
                settingsWin.SetFocus();
            }
        } catch(eFocusRelease) { _WarnLog("settings", "op failed: " + (eFocusRelease && eFocusRelease.message ? eFocusRelease.message : String(eFocusRelease || ""))); }
        if (overlay.IsValid()) {
            overlay.DeleteAsync(0);
        }
        return;
    }
    $.Schedule(0.25, function() {
        if (overlay.IsValid()) overlay.DeleteAsync(0);
    });
}

function CloseConfigDiffPreviewModalIfOpen() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel || !rootPanel.IsValid || !rootPanel.IsValid()) return;
    var existing = rootPanel.FindChildTraverse("ConfigDiffPreviewModalOverlay");
    if (existing && existing.IsValid && existing.IsValid()) {
        CloseModal(existing);
    }
}

function CloseSettingsSideModalsIfOpen() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel || !rootPanel.IsValid || !rootPanel.IsValid()) return;
    var overlayIds = [
        "ConfigDiffPreviewModalOverlay"
    ];
    for (var i = 0; i < overlayIds.length; i++) {
        var overlayId = overlayIds[i];
        if (!overlayId) continue;
        var existing = rootPanel.FindChildTraverse(overlayId);
        if (existing && existing.IsValid && existing.IsValid()) {
            CloseModal(existing);
        }
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
                        tabLabel.text = _Localize(displayTabName, true);
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
            try { dropdownWasOpen = dropdownWasOpen || !!menuPanel.visible; } catch(eMenuVisible) { _WarnLog("settings", "op failed: " + (eMenuVisible && eMenuVisible.message ? eMenuVisible.message : String(eMenuVisible || ""))); }
            try { dropdownWasOpen = dropdownWasOpen || (menuPanel.BHasClass && menuPanel.BHasClass("DropDownMenuVisible")); } catch(eMenuClass) { _WarnLog("settings", "op failed: " + (eMenuClass && eMenuClass.message ? eMenuClass.message : String(eMenuClass || ""))); }
        }
        try { dropdownPanel.SetHasClass("DropDownMenuVisible", false); } catch(e1) { _WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        try { dropdownPanel.RemoveClass("DropDownMenuVisible"); } catch(e2) { _WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try { dropdownPanel.visible = true; } catch(e2b) { _WarnLog("settings", "op failed: " + (e2b && e2b.message ? e2b.message : String(e2b || ""))); }
        if (!skipFocusTransfer && dropdownWasOpen) {
            try { dropdownPanel.SetFocus(); } catch(e3) { _WarnLog("settings", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
        }
        if (menuPanel && menuPanel.IsValid && menuPanel.IsValid()) {
            try { menuPanel.SetHasClass("DropDownMenuVisible", false); } catch(e5) { _WarnLog("settings", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }
            try { menuPanel.RemoveClass("DropDownMenuVisible"); } catch(e6) { _WarnLog("settings", "op failed: " + (e6 && e6.message ? e6.message : String(e6 || ""))); }
            try { menuPanel.visible = false; } catch(e7) { _WarnLog("settings", "op failed: " + (e7 && e7.message ? e7.message : String(e7 || ""))); }
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
        try { floatingMenu.SetHasClass("DropDownMenuVisible", false); } catch(e9) { _WarnLog("settings", "op failed: " + (e9 && e9.message ? e9.message : String(e9 || ""))); }
        try { floatingMenu.RemoveClass("DropDownMenuVisible"); } catch(e10) { _WarnLog("settings", "op failed: " + (e10 && e10.message ? e10.message : String(e10 || ""))); }
        try { floatingMenu.visible = false; } catch(e11) { _WarnLog("settings", "op failed: " + (e11 && e11.message ? e11.message : String(e11 || ""))); }
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

function GetCurrentExportSettingsString() {
    var compact = SerializeCompactV2(MOD_CONFIG);
    var encoded = ToBase64Url(compact);
    return EXPORT_PREFIX + encoded;
}

function RunJoyNameStorageReadProbe() {
    // GameInterfaceAPI confirmed absent — joy_name storage probe skipped.
    $.Msg("[QOLLock][JoyNameStorageReadProbe] skipped — GameInterfaceAPI absent");
}

function FormatExportSettingsDisplayString(rawExport) {
    if (!rawExport) return "";
    var normalized = String(rawExport).replace(/\s+/g, "");
    var prefixMatch = normalized.match(/^\[QOL-\d+-\d+-\d+\]:/i);
    var prefixLen = prefixMatch ? prefixMatch[0].length : 0;
    var payloadLen = normalized.length - prefixLen;
    if (payloadLen <= 24) return normalized;
    var firstPayloadLen = Math.ceil(payloadLen / 2);
    var breakIndex = prefixLen + firstPayloadLen;
    if (breakIndex <= 0 || breakIndex >= normalized.length) return normalized;
    return normalized.slice(0, breakIndex) + "\n" + normalized.slice(breakIndex);
}

function FormatImportSettingsDisplayString(rawImport) {
    if (!rawImport) return "";
    var normalized = String(rawImport).replace(/\s+/g, "");
    if (!/^\[QOL-\d+-\d+-\d+\]:/i.test(normalized)) {
        return rawImport;
    }
    return FormatExportSettingsDisplayString(normalized);
}

function TryCopyTextToClipboard(text, textEntryPanel) {
    if (!text || text.length === 0) return false;
    var copied = false;
    var attempts = [
        function() { $.DispatchEvent("CopyStringToClipboard", text, text); },
        function() {
            if (!textEntryPanel || !textEntryPanel.IsValid || !textEntryPanel.IsValid()) return;
            textEntryPanel.SetFocus();
            textEntryPanel.SelectAll();
            $.DispatchEvent("TextEntryCopyToClipboard", textEntryPanel);
        }
    ];
    for (var i = 0; i < attempts.length; i++) {
        try {
            attempts[i]();
            copied = true;
            break;
        } catch(e) { _WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
    return copied;
}

function TryPasteTextFromClipboard(textEntryPanel) {
    if (!textEntryPanel || !textEntryPanel.IsValid || !textEntryPanel.IsValid()) return false;
    textEntryPanel.SetFocus();
    if (textEntryPanel.SelectAll) {
        try { textEntryPanel.SelectAll(); } catch(e) { _WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
    var pasted = false;
    var attempts = [
        function() {
            if (textEntryPanel.Paste) {
                textEntryPanel.Paste();
                return;
            }
            throw new Error("Paste method unavailable");
        },
        function() {
            $.DispatchEvent("TextEntryInsertFromClipboard", textEntryPanel);
        }
    ];
    for (var i = 0; i < attempts.length; i++) {
        try {
            attempts[i]();
            pasted = true;
            break;
        } catch(e) { _WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
    return pasted;
}

function RenderConfigTabContent(list) {
    gCurrentSettingsSectionTitle = "";
    var cfgCopy = _Localize("COPY", true);
    var cfgCopied = _Localize("COPIED", true);
    var cfgFailed = _Localize("FAILED", true);
    var cfgClear = _Localize("CLEAR", true);
    var cfgApply = _Localize("APPLY", true);
    var cfgApplied = _Localize("APPLIED", true);
    gConfigFeedbackLabel = null;
    gConfigFeedbackClearToken++;

    // Auto-disabled feature warning banner (Phase A.1: reads QOL namespace set by ql_core.js)
    if (!gSearchCollectMode && QOL.autoDisabledFeatures && QOL.autoDisabledFeatures.length > 0) {
        try {
            var disabledFeatures = QOL.autoDisabledFeatures;
            var filtered = [];
            for (var di = 0; di < disabledFeatures.length; di++) {
                var dn = String(disabledFeatures[di]).trim();
                if (dn) filtered.push(dn);
            }
            if (filtered.length > 0) {
                var warnSection = $.CreatePanel("Panel", list, "AutoDisableWarning");
                warnSection.AddClass("ConfigFeedbackPanel");
                warnSection.AddClass("AutoDisableWarning");
                var warnTitle = $.CreatePanel("Label", warnSection, "AutoDisableWarningTitle");
                warnTitle.AddClass("ConfigFeedbackLabel");
                warnTitle.text = "Some QOLLOCK features were auto-disabled due to errors:";
                var warnList = $.CreatePanel("Label", warnSection, "AutoDisableWarningList");
                warnList.AddClass("ConfigFeedbackText");
                warnList.text = filtered.join(", ");
                var warnHint = $.CreatePanel("Label", warnSection, "AutoDisableWarningHint");
                warnHint.AddClass("ConfigFeedbackText");
                warnHint.text = "Restart your game to re-enable these features.";
            }
        } catch(eAutoDisableWarn) { _WarnLog("settings", "op failed: " + (eAutoDisableWarn && eAutoDisableWarn.message ? eAutoDisableWarn.message : String(eAutoDisableWarn || ""))); }
    }

    if (gSearchCollectMode && gSearchCollectState) {
        CreateSectionTitle(list, "General");
        CreateRow(list, "Preview", "PREVIEWS_ENABLED", "toggle", null, null, null, null, "Realtime Changes");
        CreateRow(list, "Language", "LANGUAGE", "dropdown", null, null, null, SETTINGS_LANGUAGE_OPTIONS);
        CreateRow(list, "Default Hero", "DEFAULT_HERO", "dropdown", null, null, null, DEFAULT_HERO_DROPDOWN_OPTIONS);
        CreateRow(list, "Troubleshoot", "TEST_SKYRUNNER", "actionbutton", null, null, null, [
            { label: "Swap" }
        ], "Switch to the Skyrunner storage hero. Your settings are saved in shop builds; if saving breaks, clear these builds and save again.");
        CreateRow(list, "Theme", "SETTINGS_THEME", "buttongroup", null, null, null, SETTINGS_THEME_OPTIONS);

        CreateSeparator(list);
        CreateSectionTitle(list, "Backup & Restore");
        CreateRow(list, "Export String", "SEARCH_TAB:Config", "actionbutton", null, null, null, [
            { label: "Open Settings" }
        ], "Share your settings string");
        CreateRow(list, "Import String", "SEARCH_TAB:Config", "actionbutton", null, null, null, [
            { label: "Open Settings" }
        ], "Paste and apply an exported settings string");
        return;
    }

    list.AddClass("ConfigTabSurface");

    var cardGeneral = $.CreatePanel("Panel", list, "ConfigCardGeneral");
    cardGeneral.AddClass("ConfigTabCard");
    CreateSectionTitle(cardGeneral, "General");
    CreateRow(cardGeneral, "Preview Changes", "PREVIEWS_ENABLED", "toggle", null, null, null, null, "Realtime Changes");
    CreateRow(cardGeneral, "Language", "LANGUAGE", "dropdown", null, null, null, SETTINGS_LANGUAGE_OPTIONS);
    CreateRow(cardGeneral, "Default Hero", "DEFAULT_HERO", "dropdown", null, null, null, DEFAULT_HERO_DROPDOWN_OPTIONS);
    CreateRow(cardGeneral, "Troubleshoot", "TEST_SKYRUNNER", "actionbutton", null, null, null, [
        { label: "Swap" }
    ], "Switch to the Skyrunner storage hero. Your settings are saved in shop builds; if saving breaks, clear these builds and save again.");
    CreateRow(cardGeneral, "Theme", "SETTINGS_THEME", "buttongroup", null, null, null, SETTINGS_THEME_OPTIONS);

    var dividerAfterGeneral = $.CreatePanel("Panel", list, "ConfigDividerAfterGeneral");
    dividerAfterGeneral.AddClass("ConfigTabDivider");
    dividerAfterGeneral.AddClass("RowSeparator");

    var cardExport = $.CreatePanel("Panel", list, "ConfigCardExport");
    cardExport.AddClass("ConfigTabCard");

    var exportHeader = CreateSectionTitle(cardExport, "Export Settings");
    var copyBtn = CreateSectionInlineIconButton(exportHeader, "ConfigCopyBtn", "s2r://panorama/images/icons/icon_copy.vsvg", "Copy our settings code to clipboard.");
    var exportTextEntry = $.CreatePanel("TextEntry", cardExport, "ConfigExportTextEntry");
    exportTextEntry.AddClass("ConfigTextEntry");
    exportTextEntry.multiline = true;
    exportTextEntry.maxchars = 2000;
    exportTextEntry.text = FormatExportSettingsDisplayString(GetCurrentExportSettingsString());
    exportTextEntry.SetPanelEvent("onfocus", function() {
        exportTextEntry.SelectAll();
    });

    copyBtn.SetPanelEvent("onactivate", function() {
        var exportRaw = GetCurrentExportSettingsString();
        exportTextEntry.text = FormatExportSettingsDisplayString(exportRaw);
        var copied = TryCopyTextToClipboard(exportRaw, exportTextEntry);
        if (copied) {
            copyBtn.RemoveClass("FailureState");
            copyBtn.AddClass("SuccessState");
        SetLocalizedConfigFeedbackMessage("Export string copied.", "success", 1800);
            $.Schedule(0.6, function() {
                if (!copyBtn || !copyBtn.IsValid || !copyBtn.IsValid()) return;
                copyBtn.RemoveClass("SuccessState");
            });
        } else {
            copyBtn.RemoveClass("SuccessState");
            copyBtn.AddClass("FailureState");
        SetLocalizedConfigFeedbackMessage("Clipboard copy failed.", "error", 2200);
            $.Schedule(0.5, function() {
                if (!copyBtn || !copyBtn.IsValid || !copyBtn.IsValid()) return;
                copyBtn.RemoveClass("FailureState");
            });
        }
    });

    var dividerAfterExport = $.CreatePanel("Panel", list, "ConfigDividerAfterExport");
    dividerAfterExport.AddClass("ConfigTabDivider");
    dividerAfterExport.AddClass("RowSeparator");

    var cardImport = $.CreatePanel("Panel", list, "ConfigCardImport");
    cardImport.AddClass("ConfigTabCard");

    var importHeader = CreateSectionTitle(cardImport, "Import Settings");
    var applyBtn = CreateSectionInlineIconButton(importHeader, "ConfigApplyBtn", "s2r://panorama/images/icons/icon_checkmark.vsvg", "Apply your settings code to your configuration.");

    var importTextEntry = $.CreatePanel("TextEntry", cardImport, "ConfigImportTextEntry");
    importTextEntry.AddClass("ConfigTextEntry");
    importTextEntry.multiline = true;
    importTextEntry.text = "";
    var importFormattingInProgress = false;
    importTextEntry.SetPanelEvent("ontextentrychange", function() {
        if (importFormattingInProgress) return;
        var current = importTextEntry.text || "";
        var formatted = FormatImportSettingsDisplayString(current);
        if (formatted !== current) {
            importFormattingInProgress = true;
            importTextEntry.text = formatted;
            importFormattingInProgress = false;
        }
    });

    var configFeedback = $.CreatePanel("Label", cardImport, "ConfigFeedbackLabel");
    configFeedback.AddClass("ConfigFeedbackLabel");
    gConfigFeedbackLabel = configFeedback;
    SetConfigFeedbackMessage("", "info", 0);

    applyBtn.SetPanelEvent("onactivate", function() {
        var raw = importTextEntry.text;
        if (!raw || raw.length === 0) return;
        try {
            SetLocalizedConfigFeedbackMessage("Import: parsing string...", "info", 0);
            var importResult = TryApplyImportStringWithDiagnostics(raw);
            if (!importResult || importResult.ok !== true || !importResult.parsedConfig || !importResult.candidateConfig) {
                throw new Error("Invalid import string");
            }

            var diffRows = BuildConfigDiffRows(MOD_CONFIG, importResult.candidateConfig);
            var schemaText = importResult.schemaVersion
                ? ("[QOL-" + String(importResult.schemaVersion).replace(/\./g, "-") + "]")
                : "[unknown]";
            var detailsText = IsRussianSettingsLanguage()
                ? ("\u0421\u0445\u0435\u043C\u0430 " + schemaText + " | clamp=" + String(importResult.clampedKeys) + " | unknown=" + String(importResult.unknownKeys))
                : ("Schema " + schemaText + " | clamped=" + String(importResult.clampedKeys) + " | unknown=" + String(importResult.unknownKeys));

            OpenConfigDiffPreviewModal({
                title: "Settings Changes",
                summary: "Changes: " + String(diffRows.length),
                details: detailsText,
                rows: diffRows,
                applyText: "Confirm",
                cancelText: "Cancel",
                onApply: function() {
                    try {
                        SetLocalizedConfigFeedbackMessage("Import: applying settings...", "info", 0);
                        var previousLanguage = GetSettingsLanguage();
                        var appliedDiag = ApplyParsedConfigWithDiagnostics(importResult.parsedConfig, importResult.schemaVersion || LATEST_COMPACT_SEMVER);
                        SaveAndSync();
                        var didRefreshLanguageUi = RefreshSettingsLanguageUiAfterConfigChange(previousLanguage);
                        SetLocalizedConfigFeedbackMessage("Import: refreshing UI...", "info", 0);
                        if (importHeader && importHeader.IsValid && importHeader.IsValid()) {
                            importHeader.text = _Localize("Import Settings", true);
                        }
                        applyBtn.RemoveClass("FailureState");
                        applyBtn.AddClass("SuccessState");
                        var diagText = IsRussianSettingsLanguage()
                            ? ("\u0418\u043C\u043F\u043E\u0440\u0442 " + schemaText + " \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D. clamp=" + String(appliedDiag.clampedKeys) + " unknown=" + String(appliedDiag.unknownKeys))
                            : ("Import " + schemaText + " applied. clamped=" + String(appliedDiag.clampedKeys) + " unknown=" + String(appliedDiag.unknownKeys));
                        var diagTone = (appliedDiag.unknownKeys > 0 || appliedDiag.clampedKeys > 0) ? "warning" : "success";
                        SetConfigFeedbackMessage(diagText, diagTone, 3000);
                        if (!didRefreshLanguageUi) {
                            RequestSettingsListRefresh(0.02, true);
                        }
                        $.Schedule(0.6, function() {
                            if (!applyBtn || !applyBtn.IsValid || !applyBtn.IsValid()) return;
                            applyBtn.RemoveClass("SuccessState");
                        });
                        return true;
                    } catch (applyErr) {
                        applyBtn.RemoveClass("SuccessState");
                        applyBtn.AddClass("FailureState");
            SetLocalizedConfigFeedbackMessage("Import failed.", "error", 2600);
                        $.Schedule(0.35, function() {
                            if (applyBtn && applyBtn.IsValid && applyBtn.IsValid()) {
                                applyBtn.RemoveClass("FailureState");
                            }
                        });
                        return false;
                    }
                }
            });
        } catch (e) {
            if (importHeader) {
                importHeader.text = _Localize("ERROR: Invalid String", true);
                importHeader.style.color = "#ff4d4d";
            }
            applyBtn.RemoveClass("SuccessState");
            applyBtn.AddClass("FailureState");
            SetLocalizedConfigFeedbackMessage("Invalid import string.", "error", 2600);
            $.Schedule(0.35, function() {
                if (applyBtn && applyBtn.IsValid && applyBtn.IsValid()) {
                    applyBtn.RemoveClass("FailureState");
                }
            });
        }
    });
}

function CloneConfigSnapshot(source) {
    var out = {};
    var src = source && typeof source === "object" ? source : MOD_CONFIG;
    for (var key in src) {
        if (!src.hasOwnProperty(key)) continue;
        out[key] = src[key];
    }
    return out;
}

function PreserveUiOnlySettings(targetConfig) {
    if (!targetConfig || typeof targetConfig !== "object") return targetConfig;
    if (MOD_CONFIG.hasOwnProperty("DRAG_ENABLED")) {
        targetConfig.DRAG_ENABLED = MOD_CONFIG.DRAG_ENABLED;
    }
    if (MOD_CONFIG.hasOwnProperty("PREVIEWS_ENABLED")) {
        targetConfig.PREVIEWS_ENABLED = MOD_CONFIG.PREVIEWS_ENABLED;
    }
    return targetConfig;
}

function BuildCandidateConfigFromParsed(parsed, schemaVersion, baseConfig) {
    var diagnostics = {
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    var candidateConfig = CloneConfigSnapshot(baseConfig || MOD_CONFIG);
    if (!parsed || typeof parsed !== "object") {
        return { candidateConfig: candidateConfig, diagnostics: diagnostics };
    }

    var fieldMap = BuildSchemaFieldMap(schemaVersion);
    for (var key in parsed) {
        if (!candidateConfig.hasOwnProperty(key)) {
            diagnostics.unknownKeys++;
            continue;
        }
        var nextValue = parsed[key];
        var field = fieldMap[key] || null;
        if (field && typeof nextValue === "number") {
            var clampResult = ClampToSchemaField(nextValue, field);
            nextValue = clampResult.value;
            if (clampResult.changed) diagnostics.clampedKeys++;
        }
        candidateConfig[key] = nextValue;
        diagnostics.appliedKeys++;
    }

    MigrateSplitZoomKeys(candidateConfig, parsed);
    NormalizeNeutralCampFlags(candidateConfig, parsed);
    NormalizeItemCooldownModeConfig(candidateConfig, parsed);
    NormalizeAmmoScaleConfig(candidateConfig, parsed);
    NormalizeVoiceTypeConfig(candidateConfig);
    NormalizeHealthbarTypeConfig(candidateConfig, parsed);
    NormalizeColorWarningConfig(candidateConfig, parsed);
    NormalizeEnemyColorWarningConfig(candidateConfig, parsed);
    NormalizeAllyColorWarningConfig(candidateConfig, parsed);
    NormalizeTopbarEnemyHpWarningConfig(candidateConfig, parsed);
    NormalizeTopbarAllyHpWarningConfig(candidateConfig, parsed);
    NormalizeShopItemNotificationsConfig(candidateConfig, parsed);
    NormalizeCompassSpeedSchemaMigration(candidateConfig, parsed, schemaVersion || LATEST_COMPACT_SEMVER);
    NormalizeLanguageSchemaMigration(candidateConfig, parsed, schemaVersion || LATEST_COMPACT_SEMVER);

    return { candidateConfig: candidateConfig, diagnostics: diagnostics };
}

function FormatConfigKeyForDiff(key) {
    var raw = String(key || "");
    if (!raw) return "";
    var tokens = raw.split("_");
    for (var i = 0; i < tokens.length; i++) {
        var token = String(tokens[i] || "").toLowerCase();
        if (!token) continue;
        if (token === "fps") {
            tokens[i] = "FPS";
            continue;
        }
        tokens[i] = token.charAt(0).toUpperCase() + token.slice(1);
    }
    return tokens.join(" ");
}

function GetConfigDiffLabelMap() {
    var cacheKey = BuildSearchSectionIndexCacheKey();
    if (gConfigDiffLabelMap && gConfigDiffLabelCacheKey === cacheKey) {
        return gConfigDiffLabelMap;
    }

    var map = {};
    var index = GetCachedSearchSectionIndex();
    for (var t = 0; t < index.length; t++) {
        var tabEntry = index[t];
        if (!tabEntry || !Array.isArray(tabEntry.sections)) continue;
        for (var s = 0; s < tabEntry.sections.length; s++) {
            var section = tabEntry.sections[s];
            if (!section || !Array.isArray(section.rows)) continue;
            for (var r = 0; r < section.rows.length; r++) {
                var row = section.rows[r];
                if (!row) continue;
                var rowLabel = String(row.label || "");
                var rowConfigId = String(row.configId || "");
                var rowCategory = String(section.title || tabEntry.tab || "");
                var rowType = String(row.type || "");
                var rowInvert = false;
                if (Array.isArray(row.options)) {
                    for (var ri = 0; ri < row.options.length; ri++) {
                        var ropt = row.options[ri];
                        if (ropt && ropt.invert === true) {
                            rowInvert = true;
                            break;
                        }
                    }
                }
                if (rowConfigId && !map.hasOwnProperty(rowConfigId) && rowConfigId.indexOf("SEARCH_") !== 0) {
                    map[rowConfigId] = {
                        label: rowLabel,
                        category: rowCategory,
                        type: rowType,
                        invert: rowInvert
                    };
                }
                if (Array.isArray(row.options)) {
                    for (var oi = 0; oi < row.options.length; oi++) {
                        var opt = row.options[oi];
                        if (!opt || !opt.key) continue;
                        var optKey = String(opt.key);
                        var optLabel = String(opt.label || rowLabel || "");
                        if (optKey && optLabel && !map.hasOwnProperty(optKey)) {
                            map[optKey] = {
                                label: optLabel,
                                category: rowCategory,
                                type: "multitoggle_option",
                                invert: !!(opt && opt.invert === true)
                            };
                        }
                    }
                }
            }
        }
    }

    gConfigDiffLabelMap = map;
    gConfigDiffLabelCacheKey = cacheKey;
    return map;
}

function GetConfigDisplayLabelForDiff(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return "";
    var map = GetConfigDiffLabelMap();
    if (map && map.hasOwnProperty(normalizedKey)) {
        var entry = map[normalizedKey];
        if (entry && typeof entry === "object" && entry.label) {
            return String(entry.label || "");
        }
        return String(entry || "");
    }
    return FormatConfigKeyForDiff(normalizedKey);
}

function GetConfigDiffMetaForKey(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return null;
    var map = GetConfigDiffLabelMap();
    if (!map || !map.hasOwnProperty(normalizedKey)) return null;
    var entry = map[normalizedKey];
    return (entry && typeof entry === "object") ? entry : null;
}

function GetConfigCategoryForDiff(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return "";
    var map = GetConfigDiffLabelMap();
    if (map && map.hasOwnProperty(normalizedKey)) {
        var entry = map[normalizedKey];
        if (entry && typeof entry === "object" && entry.category) {
            return String(entry.category || "");
        }
    }
    return "";
}

function FormatConfigValueForDiff(value, key) {
    var configKey = String(key || "");
    var meta = GetConfigDiffMetaForKey(configKey);
    var isBinaryNumber = (typeof value === "number" && (value === 0 || value === 1));
    var isBinaryBool = (typeof value === "boolean");
    var isBinary = isBinaryNumber || isBinaryBool;
    var isEnableStyle = /(ENABLE|ENABLED|DISABLE|DISABLED|SHOW|HIDE|VISIBLE|TOGGLE|ACTIVE|ON_OFF|ONOFF)/i.test(configKey);
    var isFilterStyle = /(^ITEM_FILTER_|_FILTER_)/.test(configKey);
    var isToggleType = !!(meta && (meta.type === "toggle" || meta.type === "multitoggle_option"));
    if (isBinary && (isEnableStyle || isFilterStyle || isToggleType)) {
        var onState = isBinaryBool ? (value === true) : (Number(value) === 1);
        if (meta && meta.invert === true) onState = !onState;
        return onState ? "On" : "Off";
    }
    if (value === undefined) return "(unset)";
    if (value === null) return "(null)";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
        if (Math.abs(value - Math.round(value)) <= 0.0001) {
            return String(Math.round(value));
        }
        var fixed = String(value.toFixed(3));
        fixed = fixed.replace(/\.?0+$/, "");
        return fixed;
    }
    if (typeof value === "string") {
        return value;
    }
    return String(value);
}

function BuildConfigDiffRows(currentConfig, nextConfig) {
    var rows = [];
    if (!currentConfig || !nextConfig) return rows;

    var seen = {};
    var pushRowIfChanged = function(key) {
        var normalizedKey = String(key || "");
        if (!normalizedKey || seen[normalizedKey]) return;
        seen[normalizedKey] = true;

        var hasCurrent = currentConfig.hasOwnProperty(normalizedKey);
        var hasNext = nextConfig.hasOwnProperty(normalizedKey);
        if (!hasCurrent && !hasNext) return;

        var beforeValue = hasCurrent ? currentConfig[normalizedKey] : undefined;
        var afterValue = hasNext ? nextConfig[normalizedKey] : undefined;
        if (NormalizeComparableConfigValue(beforeValue) === NormalizeComparableConfigValue(afterValue)) return;

        rows.push({
            key: normalizedKey,
            keyLabel: GetConfigDisplayLabelForDiff(normalizedKey),
            categoryLabel: GetConfigCategoryForDiff(normalizedKey),
            beforeValue: beforeValue,
            afterValue: afterValue,
            beforeText: FormatConfigValueForDiff(beforeValue, normalizedKey),
            afterText: FormatConfigValueForDiff(afterValue, normalizedKey)
        });
    };

    for (var key in DEFAULT_CONFIG) {
        pushRowIfChanged(key);
    }
    for (var nextKey in nextConfig) {
        pushRowIfChanged(nextKey);
    }
    return rows;
}

function BuildPresetCandidateConfigByName(presetName) {
    presetName = NormalizeBreadPresetName(presetName);
    var presetData = presetName === "Default" ? DEFAULT_CONFIG : PRESETS[presetName];
    if (!presetData) return null;

    var candidate = {};
    for (var key in DEFAULT_CONFIG) {
        candidate[key] = DEFAULT_CONFIG[key];
    }
    for (var presetKey in presetData) {
        candidate[presetKey] = presetData[presetKey];
    }

    NormalizeNeutralCampFlags(candidate, presetData);
    NormalizeItemCooldownModeConfig(candidate, presetData);
    NormalizeAmmoScaleConfig(candidate, presetData);
    NormalizeVoiceTypeConfig(candidate);
    NormalizeHealthbarTypeConfig(candidate, presetData);
    NormalizeColorWarningConfig(candidate, presetData);
    NormalizeEnemyColorWarningConfig(candidate, presetData);
    NormalizeAllyColorWarningConfig(candidate, presetData);
    NormalizeTopbarEnemyHpWarningConfig(candidate, presetData);
    NormalizeTopbarAllyHpWarningConfig(candidate, presetData);
    NormalizeShopItemNotificationsConfig(candidate, presetData);

    PreserveUiOnlySettings(candidate);

    for (var modKey in MOD_CONFIG) {
        if (candidate.hasOwnProperty(modKey)) continue;
        candidate[modKey] = MOD_CONFIG[modKey];
    }

    return candidate;
}

function OpenConfigDiffPreviewModal(options) {
    var opts = options || {};
    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var isRu = IsRussianSettingsLanguage();
    var title = String(opts.title || "Settings Changes");
    var summary = String(opts.summary || ("Changes: " + String(rows.length)));
    var details = String(opts.details || "");
    var applyText = String(opts.applyText || "Confirm");
    var cancelText = String(opts.cancelText || "Cancel");

    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;
    _PrepareModal();
    var existing = rootPanel.FindChildTraverse("ConfigDiffPreviewModalOverlay");
    if (existing) existing.DeleteAsync(0);

    var overlay = $.CreatePanel("Panel", rootPanel, "ConfigDiffPreviewModalOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) {
            overlay.AddClass("Show");
            if (modalContainer && modalContainer.IsValid && modalContainer.IsValid()) {
                modalContainer.SetFocus();
            }
        }
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ConfigDiffModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.AddClass("MetroModalContainer");
    modalContainer.AddClass("ConfigDiffModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});
    modalContainer.SetPanelEvent("oncancel", function() { $.ForceCloseModSettings(); });
    overlay.SetPanelEvent("oncancel", function() { $.ForceCloseModSettings(); });

    var titleRow = $.CreatePanel("Panel", modalContainer, "");
    titleRow.AddClass("ConfigDiffTitleRow");

    var header = $.CreatePanel("Label", titleRow, "");
    header.AddClass("ModalTitle");
    header.AddClass("ConfigDiffTitle");
    header.text = title;

    var titleSpacer = $.CreatePanel("Panel", titleRow, "");
    titleSpacer.AddClass("ConfigDiffTitleSpacer");

    var closeBtn = $.CreatePanel("Button", titleRow, "ConfigDiffCloseBtn");
    closeBtn.AddClass("QOLUnifiedModalClose");
    closeBtn.AddClass("ConfigDiffCloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    if (details && details.length > 0) {
        var detailsLabel = $.CreatePanel("Label", modalContainer, "");
        detailsLabel.AddClass("ModalInstructions");
        detailsLabel.AddClass("ConfigDiffDetails");
        detailsLabel.text = details;
    }

    var list = $.CreatePanel("Panel", modalContainer, "ConfigDiffList");
    list.AddClass("ConfigDiffList");
    var diffGridRows = Math.max(1, Math.ceil(rows.length / 2));
    var diffRowHeightPx = 35;
    var diffListPaddingPx = 8;
    var diffListMinHeightPx = 120;
    var diffListMaxHeightPx = 620;
    var computedListHeightPx = Math.max(
        diffListMinHeightPx,
        Math.min(diffListMaxHeightPx, diffGridRows * diffRowHeightPx + diffListPaddingPx)
    );
    list.style.height = String(computedListHeightPx) + "px";
    list.style.maxHeight = String(computedListHeightPx) + "px";
    if (rows.length <= 0) {
        var empty = $.CreatePanel("Label", list, "");
        empty.AddClass("ConfigDiffEmpty");
            empty.text = _Localize("No setting changes detected.", true);
    } else {
        var createDiffCell = function(parentPanel, rowData, rowIndex) {
            var cellPanel = $.CreatePanel("Panel", parentPanel, "");
            cellPanel.AddClass("ConfigDiffCell");
            cellPanel.AddClass((rowIndex % 2) === 0 ? "Even" : "Odd");

            var lineRow = $.CreatePanel("Panel", cellPanel, "");
            lineRow.AddClass("ConfigDiffCellLine");

            var titleLabel = $.CreatePanel("Label", lineRow, "");
            titleLabel.AddClass("ConfigDiffCellTitle");
            var categoryText = String(rowData.categoryLabel || "");
            var settingText = String(rowData.keyLabel || rowData.key || "");
            titleLabel.text = categoryText ? (categoryText + ": " + settingText) : settingText;

            var valueWrap = $.CreatePanel("Panel", lineRow, "");
            valueWrap.AddClass("ConfigDiffValueWrap");

            var beforeLabel = $.CreatePanel("Label", valueWrap, "");
            beforeLabel.AddClass("ConfigDiffCellBefore");
            beforeLabel.text = rowData.beforeText || "";

            var arrow = $.CreatePanel("Label", valueWrap, "");
            arrow.AddClass("ConfigDiffCellArrow");
            arrow.text = "\u2192";

            var afterLabel = $.CreatePanel("Label", valueWrap, "");
            afterLabel.AddClass("ConfigDiffCellAfter");
            afterLabel.text = rowData.afterText || "";
        };

        for (var i = 0; i < rows.length; i += 2) {
            var gridRow = $.CreatePanel("Panel", list, "");
            gridRow.AddClass("ConfigDiffGridRow");

            createDiffCell(gridRow, rows[i], i);
            if (i + 1 < rows.length) {
                createDiffCell(gridRow, rows[i + 1], i + 1);
            } else {
                var fillerA = $.CreatePanel("Panel", gridRow, "");
                fillerA.AddClass("ConfigDiffCellFiller");
            }
        }
    }

    var btnRow = $.CreatePanel("Panel", modalContainer, "ConfigDiffModalBtnRow");
    btnRow.AddClass("ModalBtnRow");
    btnRow.AddClass("ConfigDiffModalBtnRow");

    var summaryLabel = $.CreatePanel("Label", btnRow, "");
    summaryLabel.AddClass("ConfigDiffSummaryFooter");
    summaryLabel.text = summary;

    var btnSpacer = $.CreatePanel("Panel", btnRow, "");
    btnSpacer.AddClass("ConfigDiffBtnSpacer");

    var cancelBtn = $.CreatePanel("Button", btnRow, "");
    cancelBtn.AddClass("QOLUnifiedModalSecondary");
    cancelBtn.AddClass("ModalBtnClose");
    cancelBtn.AddClass("ConfigDiffCancelBtn");
    var cancelLbl = $.CreatePanel("Label", cancelBtn, "");
    cancelLbl.text = cancelText;
    cancelBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    var applyBtn = $.CreatePanel("Button", btnRow, "");
    applyBtn.AddClass("QOLUnifiedModalPrimary");
    applyBtn.AddClass("ModalBtnApply");
    applyBtn.AddClass("ConfigDiffApplyBtn");
    var applyLbl = $.CreatePanel("Label", applyBtn, "");
    applyLbl.text = applyText;
    applyBtn.SetPanelEvent("onactivate", function() {
        var shouldClose = true;
        if (typeof opts.onApply === "function") {
            try {
                shouldClose = opts.onApply() !== false;
            } catch (eApply) {
                shouldClose = false;
            }
        }
        if (shouldClose) {
            CloseModal(overlay);
        }
    });
}

function TryApplyImportStringWithDiagnostics(raw) {
    var result = {
        ok: false,
        source: "compact",
        schemaVersion: "",
        parsedConfig: null,
        candidateConfig: null,
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    if (!raw) return result;
    var trimmed = raw.trim();
    if (trimmed.length === 0) return result;

    var normalized = String(trimmed).replace(/\s+/g, "");
    var tokenMatch = normalized.match(EXPORT_TOKEN_REGEX);
    if (!tokenMatch) return result;

    var schemaSemver = String(tokenMatch[1] || "").replace(/-/g, ".");
    if (!schemaSemver || !COMPACT_SCHEMA_REGISTRY.hasOwnProperty(schemaSemver)) return result;
    var compactCandidate = String(tokenMatch[2] || "");
    if (!compactCandidate) return result;

    try {
        var compactBinary = FromBase64Url(compactCandidate);
        result.parsedConfig = DeserializeCompactV2(compactBinary, schemaSemver);
        result.schemaVersion = schemaSemver;
    } catch (compactErr) {
        return result;
    }

    var preview = BuildCandidateConfigFromParsed(result.parsedConfig, result.schemaVersion || LATEST_COMPACT_SEMVER, DEFAULT_CONFIG);
    PreserveUiOnlySettings(preview.candidateConfig);
    result.candidateConfig = preview.candidateConfig;
    result.appliedKeys = preview.diagnostics.appliedKeys;
    result.unknownKeys = preview.diagnostics.unknownKeys;
    result.clampedKeys = preview.diagnostics.clampedKeys;
    result.ok = true;
    return result;
}

function TryApplyImportStringToConfig(raw) {
    var result = TryApplyImportStringWithDiagnostics(raw);
    if (!result || result.ok !== true || !result.parsedConfig) return false;
    ApplyParsedConfigWithDiagnostics(result.parsedConfig, result.schemaVersion || LATEST_COMPACT_SEMVER);
    return true;
}

function StopMinesweeperLoop() {
    gMinesweeperTimerToken++;
}

function UpdateMinesweeperHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.mineLabel && state.mineLabel.IsValid && state.mineLabel.IsValid()) {
        state.mineLabel.text = _Localize("Mines:", true) + " " + state.mineCount;
    }
    if (state.flagLabel && state.flagLabel.IsValid && state.flagLabel.IsValid()) {
        state.flagLabel.text = _Localize("Flags:", true) + " " + state.flagsUsed;
    }
    if (state.timeLabel && state.timeLabel.IsValid && state.timeLabel.IsValid()) {
        state.timeLabel.text = _Localize("Time:", true) + " " + state.elapsedSeconds + "s";
    }
}

function UpdateMinesweeperStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? _Localize(text, true) : _Localize(MINESWEEPER_STATUS_DEFAULT_TEXT, true);
        state.statusLabel.style.visibility = "visible";
    }
}

function ApplyMinesweeperDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetMinesweeperDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.rows = cfg.rows;
    state.cols = cfg.cols;
    state.mineCount = cfg.mines;
    state.safeCells = (cfg.rows * cfg.cols) - cfg.mines;

    if (state.difficultyButtons) {
        for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
            var key = MINESWEEPER_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetMinesweeperGame(state);
    }
}

function ForEachMinesweeperNeighbor(state, row, col, fn) {
    for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = row + dr;
            var nc = col + dc;
            if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
            fn(nr, nc);
        }
    }
}

function UpdateMinesweeperCellVisual(cell) {
    if (!cell || !cell.panel || !cell.label || !cell.panel.IsValid || !cell.panel.IsValid()) return;
    var panel = cell.panel;
    var label = cell.label;
    panel.SetHasClass("Revealed", cell.revealed === true);
    panel.SetHasClass("Flagged", cell.flagged === true && cell.revealed !== true);
    panel.SetHasClass("Mine", cell.revealed === true && cell.isMine === true);
    panel.SetHasClass("MineExploded", cell.exploded === true);

    if (cell.revealed) {
        if (cell.isMine) {
            label.text = "";
        } else if (cell.adjacent > 0) {
            label.text = String(cell.adjacent);
        } else {
            label.text = "";
        }
    } else if (cell.flagged) {
        label.text = "F";
    } else {
        label.text = "";
    }
}

function CreateMinesweeperCells(state) {
    state.cells = [];
    for (var r = 0; r < state.rows; r++) {
        var rowCells = [];
        for (var c = 0; c < state.cols; c++) {
            rowCells.push({
                row: r,
                col: c,
                isMine: false,
                adjacent: 0,
                revealed: false,
                flagged: false,
                exploded: false,
                panel: null,
                label: null
            });
        }
        state.cells.push(rowCells);
    }

    var minesPlaced = 0;
    while (minesPlaced < state.mineCount) {
        var index = Math.floor(Math.random() * state.rows * state.cols);
        var mineRow = Math.floor(index / state.cols);
        var mineCol = index % state.cols;
        var target = state.cells[mineRow][mineCol];
        if (target.isMine) continue;
        target.isMine = true;
        minesPlaced++;
    }

    RecomputeMinesweeperAdjacents(state);
}

function RecomputeMinesweeperAdjacents(state) {
    if (!state || !Array.isArray(state.cells)) return;
    for (var rr = 0; rr < state.rows; rr++) {
        for (var cc = 0; cc < state.cols; cc++) {
            var cell = state.cells[rr][cc];
            if (cell.isMine) {
                cell.adjacent = -1;
                continue;
            }
            var nearby = 0;
            ForEachMinesweeperNeighbor(state, rr, cc, function(nr, nc) {
                if (state.cells[nr][nc].isMine) nearby++;
            });
            cell.adjacent = nearby;
        }
    }
}

function EnsureMinesweeperFirstRevealSafe(state, row, col) {
    if (!state || state.firstRevealDone) return;
    state.firstRevealDone = true;
    var current = state.cells[row] && state.cells[row][col] ? state.cells[row][col] : null;
    if (!current || !current.isMine) return;

    var candidates = [];
    for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
            if (r === row && c === col) continue;
            var candidate = state.cells[r][c];
            if (!candidate || candidate.isMine) continue;
            candidates.push(candidate);
        }
    }
    if (candidates.length <= 0) return;

    var pickIndex = Math.floor(Math.random() * candidates.length);
    if (!isFinite(pickIndex) || pickIndex < 0) pickIndex = 0;
    if (pickIndex >= candidates.length) pickIndex = candidates.length - 1;
    var destination = candidates[pickIndex];
    if (!destination) return;

    current.isMine = false;
    destination.isMine = true;
    RecomputeMinesweeperAdjacents(state);
}

function RenderMinesweeperBoard(state) {
    if (!state || !state.boardPanel || !state.boardPanel.IsValid || !state.boardPanel.IsValid()) return;
    state.boardPanel.RemoveAndDeleteChildren();
    for (var r = 0; r < state.rows; r++) {
        var rowPanel = $.CreatePanel("Panel", state.boardPanel, "ArcadeMinesweeperRow_" + r);
        rowPanel.AddClass("ArcadeMinesweeperRow");
        for (var c = 0; c < state.cols; c++) {
            (function(rowIndex, colIndex) {
                var cell = state.cells[rowIndex][colIndex];
                var cellBtn = $.CreatePanel("Button", rowPanel, "ArcadeMinesweeperCell_" + rowIndex + "_" + colIndex);
                cellBtn.AddClass("ArcadeMinesweeperCell");
                var cellLbl = $.CreatePanel("Label", cellBtn, "");
                cellLbl.AddClass("ArcadeMinesweeperCellLabel");
                cell.panel = cellBtn;
                cell.label = cellLbl;
                UpdateMinesweeperCellVisual(cell);

                cellBtn.SetPanelEvent("onactivate", function() {
                    HandleMinesweeperCellActivate(state, rowIndex, colIndex);
                });
                cellBtn.SetPanelEvent("oncontextmenu", function() {
                    ToggleMinesweeperFlag(state, rowIndex, colIndex);
                    return true;
                });
            })(r, c);
        }
    }
}

function ApplyMinesweeperBoardSizing(state) {
    if (!state || !state.boardPanel || !state.boardPanel.IsValid || !state.boardPanel.IsValid()) return false;
    if (!Array.isArray(state.cells) || state.cells.length <= 0) return false;

    var boardWidth = MINESWEEPER_BOARD_WIDTH;
    var boardHeight = MINESWEEPER_BOARD_HEIGHT;

    var rows = Math.max(1, Math.floor(Number(state.rows)));
    var cols = Math.max(1, Math.floor(Number(state.cols)));
    var usableWidth = Math.max(60, boardWidth - 24);
    var usableHeight = Math.max(60, boardHeight - 24);
    var gutterPerCell = 2;
    var perCellWidth = (usableWidth - (cols * gutterPerCell)) / cols;
    var perCellHeight = (usableHeight - (rows * gutterPerCell)) / rows;
    var cellSize = Math.floor(Math.min(perCellWidth, perCellHeight));
    if (!isFinite(cellSize)) return false;
    if (cellSize < 18) cellSize = 18;
    if (cellSize > 58) cellSize = 58;

    var fontSize = Math.floor(cellSize * 0.44);
    if (fontSize < 12) fontSize = 12;
    if (fontSize > 26) fontSize = 26;
    var bgSize = Math.floor(cellSize * 0.74);
    if (bgSize < 14) bgSize = 14;
    if (bgSize > 44) bgSize = 44;

    for (var r = 0; r < rows; r++) {
        var rowCells = state.cells[r];
        if (!Array.isArray(rowCells)) continue;
        for (var c = 0; c < cols; c++) {
            var cell = rowCells[c];
            if (!cell || !cell.panel || !cell.label) continue;
            if (!cell.panel.IsValid || !cell.panel.IsValid()) continue;
            if (!cell.label.IsValid || !cell.label.IsValid()) continue;
            cell.panel.style.width = cellSize + "px";
            cell.panel.style.height = cellSize + "px";
            cell.panel.style.marginTop = "1px";
            cell.panel.style.marginRight = "1px";
            cell.panel.style.marginBottom = "1px";
            cell.panel.style.marginLeft = "1px";
            cell.label.style.fontSize = fontSize + "px";
            cell.label.style.backgroundSize = bgSize + "px " + bgSize + "px";
        }
    }

    return true;
}

function ScheduleMinesweeperBoardSizing(state, attempts) {
    if (!state || !state.active) return;
    var tries = Math.max(1, Math.floor(Number(attempts) || 1));
    $.Schedule(0.01, function() {
        if (!state || !state.active) return;
        var ready = false;
        try { ready = ApplyMinesweeperBoardSizing(state); } catch (eMsSize) { ready = false; }
        if (!ready && tries > 1) {
            ScheduleMinesweeperBoardSizing(state, tries - 1);
        }
    });
}

function ScheduleHideAmmoPreview(delaySec) {
    gAmmoPreviewHideToken++;
    var token = gAmmoPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gAmmoPreviewHideToken) return;
        if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
            gAmmoPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideReloadCooldownPreview(delaySec) {
    gReloadCooldownPreviewHideToken++;
    var token = gReloadCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gReloadCooldownPreviewHideToken) return;
        if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
            gReloadCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnitTargetPreview(delaySec) {
    gUnitTargetPreviewHideToken++;
    var token = gUnitTargetPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnitTargetPreviewHideToken) return;
        if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
            gUnitTargetPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideDamageReportPreview(delaySec) {
    gDamageReportPreviewHideToken++;
    var token = gDamageReportPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gDamageReportPreviewHideToken) return;
        if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
            gDamageReportPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideShopPreview(delaySec) {
    gShopPreviewHideToken++;
    var token = gShopPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gShopPreviewHideToken) return;
        if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
            gShopPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnsecuredPlusPreview(delaySec) {
    gUnsecuredPlusPreviewHideToken++;
    var token = gUnsecuredPlusPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnsecuredPlusPreviewHideToken) return;
        if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
            gUnsecuredPlusPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ToggleMinesweeperFlag(state, row, col) {
    if (!state || state.gameOver || !state.active) return;
    var cell = state.cells[row][col];
    if (!cell || cell.revealed) return;
    cell.flagged = !cell.flagged;
    state.flagsUsed += cell.flagged ? 1 : -1;
    if (state.flagsUsed < 0) state.flagsUsed = 0;
    UpdateMinesweeperCellVisual(cell);
    UpdateMinesweeperHud(state);
}

function RevealMinesweeperRegion(state, startRow, startCol) {
    var stack = [{ r: startRow, c: startCol }];
    while (stack.length > 0) {
        var node = stack.pop();
        var cell = state.cells[node.r][node.c];
        if (!cell || cell.revealed || cell.flagged) continue;
        if (cell.isMine) continue;
        cell.revealed = true;
        state.revealedSafeCount++;
        UpdateMinesweeperCellVisual(cell);

        if (cell.adjacent === 0) {
            ForEachMinesweeperNeighbor(state, node.r, node.c, function(nr, nc) {
                var nextCell = state.cells[nr][nc];
                if (!nextCell || nextCell.revealed || nextCell.flagged || nextCell.isMine) return;
                stack.push({ r: nr, c: nc });
            });
        }
    }
}

function RevealAllMines(state) {
    for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
            var cell = state.cells[r][c];
            if (cell.isMine) {
                cell.revealed = true;
                UpdateMinesweeperCellVisual(cell);
            }
        }
    }
}

function PlayMinesweeperExplodeSound() {
    var eventName = String(MINESWEEPER_EXPLODE_SOUND_EVENT || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayMinesweeperWinSound() {
    var eventName = String(MINESWEEPER_WIN_SOUND_EVENT || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function HandleMinesweeperCellActivate(state, row, col) {
    if (!state || state.gameOver || !state.active) return;
    var cell = state.cells[row][col];
    if (!cell || cell.revealed || cell.flagged) return;
    EnsureMinesweeperFirstRevealSafe(state, row, col);

    if (cell.isMine) {
        cell.exploded = true;
        cell.revealed = true;
        UpdateMinesweeperCellVisual(cell);
        PlayMinesweeperExplodeSound();
        RevealAllMines(state);
        state.gameOver = true;
        StopMinesweeperLoop();
        UpdateMinesweeperStatus(state, "Boom. Press New Game.");
        return;
    }

    RevealMinesweeperRegion(state, row, col);
    if (state.revealedSafeCount >= state.safeCells) {
        state.gameOver = true;
        StopMinesweeperLoop();
        PlayMinesweeperWinSound();
        UpdateMinesweeperStatus(state, _Localize("Cleared in", true) + " " + state.elapsedSeconds + _Localize("s.", true));
        return;
    }

    UpdateMinesweeperHud(state);
}

function StartMinesweeperTimer(state) {
    if (!state || !state.active) return;
    gMinesweeperTimerToken++;
    var token = gMinesweeperTimerToken;

    function Tick() {
        if (!state || !state.active || state.gameOver) return;
        if (token !== gMinesweeperTimerToken) return;
        state.elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.startTime) / 1000));
        UpdateMinesweeperHud(state);
        $.Schedule(0.25, Tick);
    }

    Tick();
}

function ResetMinesweeperGame(state) {
    if (!state || !state.active) return;
    state.gameOver = false;
    state.firstRevealDone = false;
    state.flagsUsed = 0;
    state.revealedSafeCount = 0;
    state.elapsedSeconds = 0;
    state.startTime = Date.now();
    CreateMinesweeperCells(state);
    RenderMinesweeperBoard(state);
    ScheduleMinesweeperBoardSizing(state, 10);
    UpdateMinesweeperHud(state);
    UpdateMinesweeperStatus(state, "");
    StartMinesweeperTimer(state);
}

function CloseMinesweeperModal(overlay) {
    StopMinesweeperLoop();
    if (gMinesweeperState) {
        gMinesweeperState.active = false;
        gMinesweeperState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseMinesweeperModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeMinesweeperOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseMinesweeperModal(overlay);
    } else {
        StopMinesweeperLoop();
    }
}

function OpenMinesweeperModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    _PrepareModal();
    CloseMinesweeperModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeMinesweeperOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseMinesweeperModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeMinesweeperModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseMinesweeperModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeMinesweeperTitle");
    header.text = _Localize("Bebop Sweeper", true);

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperActionRow");
    actionRow.AddClass("ArcadeMinesweeperActionRow");

    var newGameBtn = $.CreatePanel("Button", actionRow, "ArcadeMinesweeperNewGameBtn");
    newGameBtn.AddClass("ArcadeMinesweeperActionBtn");
    newGameBtn.AddClass("ArcadeMinesweeperControlBtn");
    var newGameLbl = $.CreatePanel("Label", newGameBtn, "");
    newGameLbl.text = _Localize("New Game", true);

    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeMinesweeperDifficultyGroup");
    difficultyGroup.AddClass("ArcadeMinesweeperDifficultyGroup");
    var difficultyButtons = {};
    for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeMinesweeperDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeMinesweeperDifficultyBtn");
            diffBtn.AddClass("ArcadeMinesweeperControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyMinesweeperDifficulty(state, cfg.id, true);
            });
        })(MINESWEEPER_DIFFICULTIES[i]);
    }

    var statusLabel = $.CreatePanel("Label", modalContainer, "ArcadeMinesweeperStatusLabel");
    statusLabel.AddClass("ArcadeMinesweeperStatusLabel");
    statusLabel.style.visibility = "collapse";

    var board = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperBoard");
    board.AddClass("ArcadeMinesweeperBoard");

    var footerRow = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperFooterRow");
    footerRow.AddClass("ArcadeMinesweeperFooterRow");

    var mineLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperMineLabel");
    mineLabel.AddClass("ArcadeMinesweeperStat");

    var flagLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperFlagLabel");
    flagLabel.AddClass("ArcadeMinesweeperStat");

    var timeLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperTimeLabel");
    timeLabel.AddClass("ArcadeMinesweeperStat");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        firstRevealDone: false,
        rows: MINESWEEPER_ROWS,
        cols: MINESWEEPER_COLS,
        mineCount: MINESWEEPER_MINES,
        safeCells: (MINESWEEPER_ROWS * MINESWEEPER_COLS) - MINESWEEPER_MINES,
        revealedSafeCount: 0,
        flagsUsed: 0,
        elapsedSeconds: 0,
        startTime: Date.now(),
        difficultyId: MINESWEEPER_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        mineImageSrc: MINESWEEPER_MINE_IMAGE_SRC,
        mineLabel: mineLabel,
        flagLabel: flagLabel,
        timeLabel: timeLabel,
        statusLabel: statusLabel,
        boardPanel: board,
        cells: []
    };

    gMinesweeperState = state;

    newGameBtn.SetPanelEvent("onactivate", function() {
        if (!state.active) return;
        ResetMinesweeperGame(state);
    });

    ApplyMinesweeperDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopFlappyLoop() {
    gFlappyLoopToken++;
}

function UpdateFlappyStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? _Localize(text, true) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateFlappyHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.scoreLabel && state.scoreLabel.IsValid && state.scoreLabel.IsValid()) {
        state.scoreLabel.text = _Localize("Score:", true) + " " + state.score;
    }
    if (state.bestLabel && state.bestLabel.IsValid && state.bestLabel.IsValid()) {
        state.bestLabel.text = _Localize("Best:", true) + " " + state.bestScore;
    }
}

function RefreshFlappyBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function PlayFlappyFailSound() {
    var options = FLAPPY_BAT_FAIL_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "flappy_bat_fail");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function SpawnFlappyPipe(state) {
    if (!state || !state.active || !state.pipesLayer || !state.pipesLayer.IsValid || !state.pipesLayer.IsValid()) return;

    var gapHalf = Math.floor(state.gapSize / 2);
    var minCenter = gapHalf + 24;
    var maxCenter = state.gameHeight - gapHalf - 24;
    var gapCenter = Math.floor(minCenter + (Math.random() * Math.max(1, (maxCenter - minCenter))));

    var pipePanel = $.CreatePanel("Panel", state.pipesLayer, "ArcadeFlappyPipe_" + state.pipeSerial);
    pipePanel.AddClass("ArcadeFlappyPipe");
    var topPipe = $.CreatePanel("Panel", pipePanel, "");
    topPipe.AddClass("ArcadeFlappyPipePart");
    topPipe.AddClass("Top");
    var bottomPipe = $.CreatePanel("Panel", pipePanel, "");
    bottomPipe.AddClass("ArcadeFlappyPipePart");
    bottomPipe.AddClass("Bottom");

    state.pipes.push({
        x: state.gameWidth + 18,
        gapCenter: gapCenter,
        passed: false,
        panel: pipePanel,
        top: topPipe,
        bottom: bottomPipe
    });
    state.pipeSerial++;
}

function RenderFlappy(state) {
    if (!state || !state.isValid || !state.isValid()) return;

    var birdRadius = Math.floor(state.birdSize / 2);
    state.birdPanel.style.x = Math.floor(state.birdX - birdRadius) + "px";
    state.birdPanel.style.y = Math.floor(state.birdY - birdRadius) + "px";
    var angle = Math.max(-25, Math.min(70, Math.floor(state.birdVel * 5)));
    // Panorama-safe runtime rotation (avoid string transform writes in hot loops).
    state.birdPanel.style.preTransformRotate2d = angle + "deg";

    for (var i = 0; i < state.pipes.length; i++) {
        var pipe = state.pipes[i];
        if (!pipe || !pipe.panel || !pipe.panel.IsValid || !pipe.panel.IsValid()) continue;
        var gapTop = Math.floor(pipe.gapCenter - (state.gapSize / 2));
        var gapBottom = Math.floor(pipe.gapCenter + (state.gapSize / 2));
        pipe.panel.style.x = Math.floor(pipe.x) + "px";
        pipe.panel.style.y = "0px";
        pipe.panel.style.width = state.pipeWidth + "px";
        pipe.panel.style.height = state.gameHeight + "px";

        pipe.top.style.y = "0px";
        pipe.top.style.height = Math.max(0, gapTop) + "px";
        pipe.top.style.width = state.pipeWidth + "px";

        pipe.bottom.style.y = gapBottom + "px";
        pipe.bottom.style.height = Math.max(0, (state.gameHeight - gapBottom)) + "px";
        pipe.bottom.style.width = state.pipeWidth + "px";
    }
}

function EndFlappyGame(state, text) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    if (state.score > state.bestScore) state.bestScore = state.score;
    PlayFlappyFailSound();
    UpdateFlappyHud(state);
    UpdateFlappyStatus(state, text || "Crashed. Click playfield to restart.");
    StopFlappyLoop();
}

function Flap(state) {
    if (!state || !state.active || state.gameOver) return;
    state.birdVel = state.flapImpulse;
    PlayArcadeGameSoundEffect(FLAPPY_BAT_FLAP_SOUND_EVENT);
}

function StepFlappy(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gFlappyLoopToken) return;
    if (state.gameOver) return;
    RefreshFlappyBounds(state);

    state.birdVel += state.gravity;
    state.birdY += state.birdVel;

    var birdRadius = Math.floor(state.birdSize / 2);
    if (state.birdY - birdRadius < 0) {
        state.birdY = birdRadius;
        state.birdVel = 0;
    }
    if (state.birdY + birdRadius >= state.gameHeight) {
        state.birdY = state.gameHeight - birdRadius;
        RenderFlappy(state);
        EndFlappyGame(state, "Crashed. Click playfield to restart.");
        return;
    }

    state.spawnTimer--;
    if (state.spawnTimer <= 0) {
        SpawnFlappyPipe(state);
        state.spawnTimer = state.pipeSpawnTicks;
    }

    var birdLeft = state.birdX - birdRadius;
    var birdRight = state.birdX + birdRadius;
    var birdTop = state.birdY - birdRadius;
    var birdBottom = state.birdY + birdRadius;

    for (var i = state.pipes.length - 1; i >= 0; i--) {
        var pipe = state.pipes[i];
        pipe.x -= state.pipeSpeed;

        var gapTop = pipe.gapCenter - (state.gapSize / 2);
        var gapBottom = pipe.gapCenter + (state.gapSize / 2);

        if (!pipe.passed && (pipe.x + state.pipeWidth) < state.birdX) {
            pipe.passed = true;
            state.score++;
            UpdateFlappyHud(state);
        }

        if (birdRight > pipe.x && birdLeft < (pipe.x + state.pipeWidth)) {
            if (birdTop < gapTop || birdBottom > gapBottom) {
                RenderFlappy(state);
                EndFlappyGame(state, "Crashed. Click playfield to restart.");
                return;
            }
        }

        if ((pipe.x + state.pipeWidth) < -10) {
            if (pipe.panel && pipe.panel.IsValid && pipe.panel.IsValid()) {
                pipe.panel.DeleteAsync(0);
            }
            state.pipes.splice(i, 1);
        }
    }

    RenderFlappy(state);
    $.Schedule(0.033, function() {
        StepFlappy(state, token);
    });
}

function ResetFlappyGame(state) {
    if (!state || !state.active) return;
    RefreshFlappyBounds(state);

    state.gameOver = false;
    state.score = 0;
    state.spawnTimer = 42;
    state.birdY = Math.floor(state.gameHeight * 0.5);
    state.birdVel = 0;

    for (var i = 0; i < state.pipes.length; i++) {
        if (state.pipes[i] && state.pipes[i].panel && state.pipes[i].panel.IsValid && state.pipes[i].panel.IsValid()) {
            state.pipes[i].panel.DeleteAsync(0);
        }
    }
    state.pipes = [];

    UpdateFlappyHud(state);
    UpdateFlappyStatus(state, "");
    RenderFlappy(state);

    StopFlappyLoop();
    var token = gFlappyLoopToken;
    StepFlappy(state, token);
}

function CloseFlappyModal(overlay) {
    StopFlappyLoop();
    if (gFlappyState) {
        gFlappyState.active = false;
        gFlappyState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseFlappyModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeFlappyOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseFlappyModal(overlay);
    } else {
        StopFlappyLoop();
    }
}

function OpenFlappyModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    _PrepareModal();
    CloseFlappyModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeFlappyOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseFlappyModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeFlappyModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseFlappyModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeFlappyTitle");
    header.text = _Localize("Flappy Bat", true);

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeFlappyHudRow");
    hudRow.AddClass("ArcadeFlappyHudRow");
    var scoreLabel = $.CreatePanel("Label", hudRow, "ArcadeFlappyScore");
    scoreLabel.AddClass("ArcadeFlappyStat");
    var bestLabel = $.CreatePanel("Label", hudRow, "ArcadeFlappyBest");
    bestLabel.AddClass("ArcadeFlappyStat");

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeFlappyGameArea");
    gameArea.AddClass("ArcadeFlappyGameArea");

    var pipesLayer = $.CreatePanel("Panel", gameArea, "ArcadeFlappyPipeLayer");
    pipesLayer.AddClass("ArcadeFlappyPipeLayer");

    var birdPanel = $.CreatePanel("Image", gameArea, "ArcadeFlappyBird", {
        src: FLAPPY_BIRD_IMAGE_SRC,
        defaultsrc: "",
        scaling: "contain"
    });
    birdPanel.AddClass("ArcadeFlappyBird");
    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeFlappyStatusLabel");
    statusLabel.AddClass("ArcadeFlappyStatusLabel");
    statusLabel.style.visibility = "collapse";

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        score: 0,
        bestScore: 0,
        gameWidth: 640,
        gameHeight: 500,
        birdX: 110,
        birdY: 250,
        birdVel: 0,
        birdSize: 44,
        gravity: 0.44,
        flapImpulse: -6.7,
        pipeWidth: 64,
        pipeSpeed: 2.5,
        gapSize: 114,
        pipeSpawnTicks: 72,
        spawnTimer: 42,
        pipeSerial: 0,
        pipes: [],
        scoreLabel: scoreLabel,
        bestLabel: bestLabel,
        statusLabel: statusLabel,
        pipesLayer: pipesLayer,
        birdPanel: birdPanel
    };
    gFlappyState = state;

    gameArea.SetPanelEvent("onactivate", function() {
        if (!state.active) return;
        if (state.gameOver) {
            ResetFlappyGame(state);
            return;
        }
        Flap(state);
    });
    ResetFlappyGame(state);
}

function StopAimTrainerLoop() {
    gAimTrainerLoopToken++;
}

function UpdateAimTrainerStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? _Localize(text, true) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateAimTrainerHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        var timeLeft = Math.max(0, durationSec - state.elapsedSec);
        state.timerLabel.text = _Localize("Time:", true) + " " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = _Localize("Hits:", true) + " " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = _Localize("Misses:", true) + " " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = _Localize("Accuracy:", true) + " " + accuracy + "%";
    }
}

function ApplyAimTrainerDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetAimTrainerDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.durationSec = cfg.durationSec;
    state.targetStartSize = cfg.targetStartSize;
    state.targetEndSize = cfg.targetEndSize;
    state.targetLifeStartSec = cfg.targetLifeStartSec;
    state.targetLifeEndSec = cfg.targetLifeEndSec;

    if (state.difficultyButtons) {
        for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
            var key = AIM_TRAINER_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetAimTrainer(state);
    } else {
        UpdateAimTrainerHud(state);
    }
}

function SpawnAimTrainerTarget(state) {
    if (!state || !state.active) return;
    RefreshAimTrainerBounds(state);
    ApplyAimTrainerTargetImage(state);
    var nowSec = Date.now() / 1000.0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    var speedScale = Math.min(1, state.elapsedSec / durationSec);
    state.targetLifeSec = Math.max(0.20, state.targetLifeStartSec + ((state.targetLifeEndSec - state.targetLifeStartSec) * speedScale));
    state.targetSpawnSec = nowSec;
    state.targetVisible = true;

    var size = state.targetStartSize;
    var maxX = Math.max(0, state.gameWidth - size);
    var statusInset = Math.max(0, Number(state.statusInset || 0));
    var maxY = Math.max(0, (state.gameHeight - statusInset) - size);
    state.targetBaseX = Math.floor(Math.random() * (maxX + 1));
    state.targetBaseY = Math.floor(Math.random() * (maxY + 1));
}

function RenderAimTrainerTarget(state, nowSec) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    if (!state.targetVisible) {
        state.targetBtn.style.visibility = "collapse";
        return;
    }

    var elapsed = Math.max(0, nowSec - state.targetSpawnSec);
    var t = Math.min(1, elapsed / state.targetLifeSec);
    var size = state.targetStartSize + ((state.targetEndSize - state.targetStartSize) * t);
    var sizePx = Math.max(18, Math.floor(size));
    var centerX = state.targetBaseX + (state.targetStartSize * 0.5);
    var centerY = state.targetBaseY + (state.targetStartSize * 0.5);
    var x = Math.floor(centerX - (sizePx * 0.5));
    var y = Math.floor(centerY - (sizePx * 0.5));

    state.targetBtn.style.visibility = "visible";
    state.targetBtn.style.width = sizePx + "px";
    state.targetBtn.style.height = sizePx + "px";
    state.targetBtn.style.x = x + "px";
    state.targetBtn.style.y = y + "px";

    if (elapsed >= state.targetLifeSec) {
        state.misses++;
        UpdateAimTrainerHud(state);
        QueueAimTrainerNextSpawn(state);
    }
}

function QueueAimTrainerNextSpawn(state) {
    if (!state) return;
    state.targetVisible = false;
    state.pendingSpawn = true;
    if (state.targetBtn && state.targetBtn.IsValid && state.targetBtn.IsValid()) {
        state.targetBtn.style.visibility = "collapse";
    }
}

function PlayAimTrainerHitSound() {
    PlayArcadeGameSoundEffect(AIM_TRAINER_HIT_SOUND_EVENT);
}

function EndAimTrainer(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    state.pendingSpawn = false;
    state.targetVisible = false;
    RenderAimTrainerTarget(state, Date.now() / 1000.0);
    UpdateAimTrainerHud(state);
    UpdateAimTrainerStatus(state, "Run complete. Press New Run.");
    StopAimTrainerLoop();
}

function HandleAimTrainerHit(state) {
    if (!state || !state.active || state.gameOver || !state.targetVisible) return;
    state.hits++;
    PlayAimTrainerHitSound();
    UpdateAimTrainerHud(state);
    QueueAimTrainerNextSpawn(state);
}

function StepAimTrainer(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gAimTrainerLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);

    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndAimTrainer(state);
        return;
    }

    if (state.pendingSpawn === true) {
        state.pendingSpawn = false;
        SpawnAimTrainerTarget(state);
    } else if (!state.targetVisible) {
        SpawnAimTrainerTarget(state);
    }
    RenderAimTrainerTarget(state, nowSec);
    UpdateAimTrainerHud(state);

    $.Schedule(0.033, function() {
        StepAimTrainer(state, token);
    });
}

function ResetAimTrainer(state) {
    if (!state || !state.active) return;
    RefreshAimTrainerBounds(state);
    state.gameOver = false;
    state.hits = 0;
    state.misses = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.targetVisible = false;
    state.pendingSpawn = true;
    UpdateAimTrainerStatus(state, "");
    UpdateAimTrainerHud(state);
    if (state.targetBtn && state.targetBtn.IsValid && state.targetBtn.IsValid()) {
        state.targetBtn.style.visibility = "collapse";
    }

    StopAimTrainerLoop();
    var token = gAimTrainerLoopToken;
    StepAimTrainer(state, token);
}

function RefreshAimTrainerBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function CloseAimTrainerModal(overlay) {
    StopAimTrainerLoop();
    if (gAimTrainerState) {
        gAimTrainerState.active = false;
        gAimTrainerState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseAimTrainerModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeAimTrainerOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseAimTrainerModal(overlay);
    } else {
        StopAimTrainerLoop();
    }
}

function OpenAimTrainerModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    _PrepareModal();
    CloseAimTrainerModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeAimTrainerOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseAimTrainerModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeAimTrainerModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseAimTrainerModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeAimTrainerTitle");
    header.text = _Localize("Graves Trainer", true);

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerActionRow");
    actionRow.AddClass("ArcadeAimTrainerActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeAimTrainerNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeAimTrainerControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = _Localize("New Run", true);

    var difficultyButtons = {};
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeAimTrainerDifficultyGroup");
    difficultyGroup.AddClass("ArcadeAimTrainerDifficultyGroup");
    for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeAimTrainerDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeAimTrainerDifficultyBtn");
            diffBtn.AddClass("ArcadeAimTrainerControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyAimTrainerDifficulty(state, cfg.id, true);
            });
        })(AIM_TRAINER_DIFFICULTIES[i]);
    }

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerArea");
    gameArea.AddClass("ArcadeAimTrainerArea");

    var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeAimTrainerTarget");
    targetBtn.AddClass("ArcadeAimTrainerTarget");
    var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeAimTrainerTargetImage");
    targetImage.AddClass("ArcadeAimTrainerTargetImage");
    try { targetImage.SetImage(AIM_TRAINER_TARGET_IMAGE_PATHS[0]); } catch(eInitImage) { _WarnLog("settings", "op failed: " + (eInitImage && eInitImage.message ? eInitImage.message : String(eInitImage || ""))); }

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeAimTrainerStatusLabel");
    statusLabel.AddClass("ArcadeAimTrainerStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerHudRow");
    hudRow.AddClass("ArcadeAimTrainerHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeAimTimer");
    timerLabel.AddClass("ArcadeAimTrainerStat");
    timerLabel.AddClass("ArcadeAimTrainerStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeAimHits");
    hitLabel.AddClass("ArcadeAimTrainerStat");
    hitLabel.AddClass("ArcadeAimTrainerStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeAimMisses");
    missLabel.AddClass("ArcadeAimTrainerStat");
    missLabel.AddClass("ArcadeAimTrainerStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeAimAcc");
    accLabel.AddClass("ArcadeAimTrainerStat");
    accLabel.AddClass("ArcadeAimTrainerStatAccuracy");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        gameWidth: 640,
        gameHeight: 430,
        statusInset: 40,
        hits: 0,
        misses: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        difficultyId: AIM_TRAINER_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        durationSec: AIM_TRAINER_DURATION_SEC,
        targetVisible: false,
        pendingSpawn: false,
        targetSpawnSec: 0,
        targetLifeSec: 1.0,
        targetLifeStartSec: 1.05,
        targetLifeEndSec: 0.52,
        targetBaseX: 0,
        targetBaseY: 0,
        targetStartSize: 74,
        targetEndSize: 40,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        statusLabel: statusLabel,
        targetBtn: targetBtn,
        gameArea: gameArea,
        targetImage: targetImage,
        targetImagePath: AIM_TRAINER_TARGET_IMAGE_PATHS[0]
    };
    gAimTrainerState = state;

    targetBtn.SetPanelEvent("onactivate", function() {
        HandleAimTrainerHit(state);
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetAimTrainer(state);
    });

    ApplyAimTrainerDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopTrainTrackingLoop() {
    gTrainTrackingLoopToken++;
}

function UpdateTrainTrackingStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? _Localize(text, true) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateTrainTrackingHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : TRAIN_TRACKING_DURATION_SEC;
    var timeLeft = Math.max(0, durationSec - state.elapsedSec);
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        state.timerLabel.text = _Localize("Time:", true) + " " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = _Localize("Hits:", true) + " " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = _Localize("Misses:", true) + " " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = _Localize("Accuracy:", true) + " " + accuracy + "%";
    }
    if (state.streakLabel && state.streakLabel.IsValid && state.streakLabel.IsValid()) {
        state.streakLabel.text = _Localize("Streak:", true) + " " + state.streak;
    }
}

function ApplyTrainTrackingDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetTrainTrackingDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.durationSec = TRAIN_TRACKING_DURATION_SEC;
    state.baseSpeed = cfg.baseSpeed;
    state.maxSpeed = cfg.maxSpeed;
    state.speedGainPerScore = cfg.speedGainPerScore;
    state.sampleIntervalSec = cfg.sampleIntervalSec;
    state.jitterTickReset = cfg.jitterTickReset;
    state.targetWidth = cfg.targetSize;
    state.targetHeight = cfg.targetSize;

    if (state.difficultyButtons) {
        for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
            var key = TRAIN_TRACKING_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetTrainTracking(state);
    } else {
        UpdateTrainTrackingHud(state);
    }
}

function GetTrainTrackingSpeed(state) {
    return Math.sqrt((state.velX * state.velX) + (state.velY * state.velY));
}

function SetTrainTrackingSpeed(state, speed) {
    var mag = GetTrainTrackingSpeed(state);
    if (mag < 0.001) {
        state.velX = speed;
        state.velY = 0;
        return;
    }
    var ratio = speed / mag;
    state.velX *= ratio;
    state.velY *= ratio;
}

function RefreshTrainTrackingBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function RenderTrainTrackingTarget(state) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    state.targetBtn.style.width = Math.round(state.targetWidth) + "px";
    state.targetBtn.style.height = Math.round(state.targetHeight) + "px";
    state.targetBtn.style.x = Math.floor(state.targetX) + "px";
    state.targetBtn.style.y = Math.floor(state.targetY) + "px";
}

function ClearTrainTrackingFlash(state) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    state.targetBtn.RemoveClass("HitFlashSuccess");
    state.targetBtn.RemoveClass("HitFlashFail");
}

function SetTrainTrackingFlash(state, flashClass) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    ClearTrainTrackingFlash(state);
    if (flashClass) state.targetBtn.AddClass(flashClass);
}

function PlayTrainTrackingHitSound() {
    var options = TRAIN_TRACKING_HIT_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "train_tracking_hit");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function EndTrainTracking(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    state.hoveringTarget = false;
    ClearTrainTrackingFlash(state);
    UpdateTrainTrackingHud(state);
    UpdateTrainTrackingStatus(state, "Run complete. Press New Run.");
    StopTrainTrackingLoop();
}

function StepTrainTracking(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gTrainTrackingLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : TRAIN_TRACKING_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndTrainTracking(state);
        return;
    }

    RefreshTrainTrackingBounds(state);

    state.targetX += state.velX;
    state.targetY += state.velY;

    var maxX = state.gameWidth - state.targetWidth;
    var maxY = state.gameHeight - state.targetHeight;
    if (state.targetX <= 0) {
        state.targetX = 0;
        state.velX = Math.abs(state.velX);
    } else if (state.targetX >= maxX) {
        state.targetX = maxX;
        state.velX = -Math.abs(state.velX);
    }
    if (state.targetY <= 0) {
        state.targetY = 0;
        state.velY = Math.abs(state.velY);
    } else if (state.targetY >= maxY) {
        state.targetY = maxY;
        state.velY = -Math.abs(state.velY);
    }

    state.jitterTick--;
    if (state.jitterTick <= 0) {
        state.jitterTick = state.jitterTickReset;
        state.velY += ((Math.random() * 2) - 1) * 0.65;
        if (Math.abs(state.velY) < 0.35) state.velY = state.velY < 0 ? -0.35 : 0.35;
        SetTrainTrackingSpeed(state, Math.min(state.maxSpeed, Math.max(state.baseSpeed, GetTrainTrackingSpeed(state))));
    }

    if (nowSec >= state.nextScoreSampleSec) {
        var nextFlashAllowedSec = Number(state.nextFlashAllowedSec || 0);
        var nextHitSoundAllowedSec = Number(state.nextHitSoundAllowedSec || 0);
        var canPlayFlash = !(isFinite(nextFlashAllowedSec) && nowSec < nextFlashAllowedSec);
        var canPlayHitSound = !(isFinite(nextHitSoundAllowedSec) && nowSec < nextHitSoundAllowedSec);
        if (state.hoveringTarget) {
            state.hits++;
            state.streak++;
            if (state.streak > state.bestStreak) state.bestStreak = state.streak;
            SetTrainTrackingSpeed(state, Math.min(state.maxSpeed, GetTrainTrackingSpeed(state) + state.speedGainPerScore));
            if (canPlayHitSound) {
                PlayTrainTrackingHitSound();
                state.nextHitSoundAllowedSec = nowSec + TRAIN_TRACKING_HIT_SOUND_MIN_INTERVAL_SEC;
            }
            if (canPlayFlash) {
                state.nextFlashAllowedSec = nowSec + TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC;
                var hitFlashToken = Number(state.flashToken || 0) + 1;
                state.flashToken = hitFlashToken;
                SetTrainTrackingFlash(state, "HitFlashSuccess");
                $.Schedule(TRAIN_TRACKING_HIT_FLASH_SEC, function() {
                    if (!state || !state.active) return;
                    if (Number(state.flashToken || 0) !== hitFlashToken) return;
                    ClearTrainTrackingFlash(state);
                });
            }
        } else {
            state.misses++;
            state.streak = 0;
            if (canPlayFlash) {
                state.nextFlashAllowedSec = nowSec + TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC;
                var missFlashToken = Number(state.flashToken || 0) + 1;
                state.flashToken = missFlashToken;
                SetTrainTrackingFlash(state, "HitFlashFail");
                $.Schedule(TRAIN_TRACKING_HIT_FLASH_SEC, function() {
                    if (!state || !state.active) return;
                    if (Number(state.flashToken || 0) !== missFlashToken) return;
                    ClearTrainTrackingFlash(state);
                });
            }
        }
        state.nextScoreSampleSec = nowSec + state.sampleIntervalSec;
        UpdateTrainTrackingHud(state);
    }

    RenderTrainTrackingTarget(state);
    UpdateTrainTrackingHud(state);

    $.Schedule(0.033, function() {
        StepTrainTracking(state, token);
    });
}

function ResetTrainTracking(state) {
    if (!state || !state.active) return;
    RefreshTrainTrackingBounds(state);
    state.gameOver = false;
    state.flashToken = Number(state.flashToken || 0) + 1;
    state.hits = 0;
    state.misses = 0;
    state.streak = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.nextFlashAllowedSec = state.startSec;
    state.nextHitSoundAllowedSec = state.startSec;
    state.hoveringTarget = false;

    state.targetX = Math.floor((state.gameWidth - state.targetWidth) * 0.5);
    state.targetY = Math.floor((state.gameHeight - state.targetHeight) * 0.5);
    state.velX = state.baseSpeed;
    state.velY = state.baseSpeed * 0.34;
    state.jitterTick = state.jitterTickReset;
    state.nextScoreSampleSec = state.startSec + state.sampleIntervalSec;

    ClearTrainTrackingFlash(state);
    UpdateTrainTrackingStatus(state, "");
    UpdateTrainTrackingHud(state);
    RenderTrainTrackingTarget(state);

    StopTrainTrackingLoop();
    var token = gTrainTrackingLoopToken;
    StepTrainTracking(state, token);
}

function CloseTrainTrackingModal(overlay) {
    StopTrainTrackingLoop();
    if (gTrainTrackingState) {
        gTrainTrackingState.active = false;
        gTrainTrackingState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseTrainTrackingModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeTrainTrackingOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseTrainTrackingModal(overlay);
    } else {
        StopTrainTrackingLoop();
    }
}

function OpenTrainTrackingModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    _PrepareModal();
    CloseTrainTrackingModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeTrainTrackingOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseTrainTrackingModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeTrainTrackingModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseTrainTrackingModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeTrainTrackingTitle");
    header.text = _Localize("Zerggy Mania", true);

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingActionRow");
    actionRow.AddClass("ArcadeTrainTrackingActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeTrainTrackingNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeTrainTrackingControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = _Localize("New Run", true);

    var difficultyButtons = {};
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeTrainTrackingDifficultyGroup");
    difficultyGroup.AddClass("ArcadeTrainTrackingDifficultyGroup");
    for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeTrainTrackingDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeTrainTrackingDifficultyBtn");
            diffBtn.AddClass("ArcadeTrainTrackingControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyTrainTrackingDifficulty(state, cfg.id, true);
            });
        })(TRAIN_TRACKING_DIFFICULTIES[i]);
    }

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingArea");
    gameArea.AddClass("ArcadeTrainTrackingArea");

    var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeTrainTrackingTarget");
    targetBtn.AddClass("ArcadeTrainTrackingTarget");
    var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeTrainTrackingTargetImage");
    targetImage.AddClass("ArcadeTrainTrackingTargetImage");
    try { targetImage.SetImage(TRAIN_TRACKING_TARGET_IMAGE_SRC); } catch(eTrainImg) { _WarnLog("settings", "op failed: " + (eTrainImg && eTrainImg.message ? eTrainImg.message : String(eTrainImg || ""))); }

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeTrainTrackingStatusLabel");
    statusLabel.AddClass("ArcadeTrainTrackingStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingHudRow");
    hudRow.AddClass("ArcadeTrainTrackingHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingTime");
    timerLabel.AddClass("ArcadeTrainTrackingStat");
    timerLabel.AddClass("ArcadeTrainTrackingStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingHits");
    hitLabel.AddClass("ArcadeTrainTrackingStat");
    hitLabel.AddClass("ArcadeTrainTrackingStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingMisses");
    missLabel.AddClass("ArcadeTrainTrackingStat");
    missLabel.AddClass("ArcadeTrainTrackingStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingAcc");
    accLabel.AddClass("ArcadeTrainTrackingStat");
    accLabel.AddClass("ArcadeTrainTrackingStatAccuracy");
    var streakLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingStreak");
    streakLabel.AddClass("ArcadeTrainTrackingStat");
    streakLabel.AddClass("ArcadeTrainTrackingStatStreak");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        gameWidth: 640,
        gameHeight: 430,
        difficultyId: TRAIN_TRACKING_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        durationSec: TRAIN_TRACKING_DURATION_SEC,
        targetWidth: 84,
        targetHeight: 84,
        targetX: 0,
        targetY: 0,
        velX: 7.4,
        velY: 2.4,
        baseSpeed: 7.4,
        maxSpeed: 13.6,
        speedGainPerScore: 0.22,
        sampleIntervalSec: 0.10,
        nextScoreSampleSec: 0,
        hoveringTarget: false,
        flashToken: 0,
        nextFlashAllowedSec: 0,
        nextHitSoundAllowedSec: 0,
        jitterTickReset: 13,
        jitterTick: 13,
        hits: 0,
        misses: 0,
        streak: 0,
        bestStreak: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        streakLabel: streakLabel,
        statusLabel: statusLabel,
        targetBtn: targetBtn,
        targetImage: targetImage,
        gameArea: gameArea
    };
    gTrainTrackingState = state;

    targetBtn.SetPanelEvent("onmouseover", function() {
        state.hoveringTarget = true;
    });
    targetBtn.SetPanelEvent("onmouseout", function() {
        state.hoveringTarget = false;
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetTrainTracking(state);
    });

    ApplyTrainTrackingDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopWhackRemLoop() {
    gWhackRemLoopToken++;
}

function GetWhackRemDifficultyById(difficultyId) {
    var wanted = String(difficultyId || "");
    for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
        var cfg = WHACK_A_REM_DIFFICULTIES[i];
        if (cfg.id === wanted) return cfg;
    }
    return WHACK_A_REM_DIFFICULTIES[0];
}

function ApplyWhackRemDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetWhackRemDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.maxConcurrent = cfg.maxConcurrent;
    state.lifeStartSec = cfg.lifeStartSec;
    state.lifeEndSec = cfg.lifeEndSec;
    state.spawnDelaySec = cfg.spawnDelaySec;

    if (state.difficultyButtons) {
        for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
            var key = WHACK_A_REM_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetWhackRem(state);
    } else {
        UpdateWhackRemHud(state);
    }
}

function UpdateWhackRemStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && String(text).length > 0);
        state.statusLabel.text = hasText ? _Localize(String(text), true) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateWhackRemHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        var timeLeft = Math.max(0, durationSec - state.elapsedSec);
        state.timerLabel.text = _Localize("Time:", true) + " " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = _Localize("Hits:", true) + " " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = _Localize("Misses:", true) + " " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = _Localize("Accuracy:", true) + " " + accuracy + "%";
    }
    if (state.streakLabel && state.streakLabel.IsValid && state.streakLabel.IsValid()) {
        state.streakLabel.text = _Localize("Streak:", true) + " " + state.streak;
    }
}

function GetWhackRemVisibleCount(state) {
    if (!state || !Array.isArray(state.slots)) return 0;
    var count = 0;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot) continue;
        if (slot.visible || slot.flashActive) count++;
    }
    return count;
}

function BuildWhackRemUsedHoleMap(state) {
    var used = {};
    if (!state || !Array.isArray(state.slots)) return used;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot) continue;
        if (!(slot.visible || slot.flashActive)) continue;
        var hi = Number(slot.holeIndex);
        if (isFinite(hi) && hi >= 0) used[hi] = true;
    }
    return used;
}

function GetWhackRemSlot(state, slotIndex) {
    if (!state || !Array.isArray(state.slots)) return null;
    var idx = Number(slotIndex);
    if (!isFinite(idx)) return null;
    idx = Math.floor(idx);
    if (idx < 0 || idx >= state.slots.length) return null;
    return state.slots[idx] || null;
}

function RefreshWhackRemBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    var nextWidth = 680;
    var nextHeight = 500;
    state.gameWidth = nextWidth;
    state.gameHeight = nextHeight;

    var cols = 3;
    var rows = 3;
    var padX = Math.floor(nextWidth * 0.13);
    var padY = Math.floor(nextHeight * 0.15);
    var spanX = Math.max(1, nextWidth - (padX * 2));
    var spanY = Math.max(1, nextHeight - (padY * 2));
    var holeSize = Math.max(68, Math.min(128, Math.floor(Math.min(spanX / cols, spanY / rows) * 0.65)));

    state.holes = [];
    var idx = 0;
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var centerX = Math.floor(padX + ((c + 0.5) * (spanX / cols)));
            var centerY = Math.floor(padY + ((r + 0.5) * (spanY / rows)));
            var x = centerX - Math.floor(holeSize * 0.5);
            var y = centerY - Math.floor(holeSize * 0.5);
            state.holes.push({
                x: x,
                y: y,
                size: holeSize
            });
            var holePanel = state.holePanels && state.holePanels[idx];
            if (holePanel && holePanel.IsValid && holePanel.IsValid()) {
                holePanel.style.x = x + "px";
                holePanel.style.y = y + "px";
                holePanel.style.width = holeSize + "px";
                holePanel.style.height = holeSize + "px";
            }
            idx++;
        }
    }
}

function SetWhackRemTargetVisible(state, slotIndex, visible) {
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    if (!visible || slot.holeIndex < 0 || !state.holes || slot.holeIndex >= state.holes.length) {
        slot.btn.style.visibility = "collapse";
        return;
    }
    var hole = state.holes[slot.holeIndex];
    slot.btn.style.x = hole.x + "px";
    slot.btn.style.y = hole.y + "px";
    slot.btn.style.width = hole.size + "px";
    slot.btn.style.height = hole.size + "px";
    slot.btn.style.visibility = "visible";
}

function ClearWhackRemSlotFlash(slot) {
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    slot.btn.RemoveClass("HitFlashSuccess");
    slot.btn.RemoveClass("HitFlashFail");
}

function SetWhackRemSlotFlash(slot, flashClass) {
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    ClearWhackRemSlotFlash(slot);
    if (flashClass) slot.btn.AddClass(flashClass);
}

function SpawnWhackRemTarget(state, slotIndex, nowSec) {
    if (!state || !state.active || state.gameOver) return false;
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!slot || slot.flashActive) return false;
    RefreshWhackRemBounds(state);
    if (!state.holes || state.holes.length <= 0) return false;
    var used = BuildWhackRemUsedHoleMap(state);
    var candidates = [];
    for (var iHole = 0; iHole < state.holes.length; iHole++) {
        if (!used[iHole]) candidates.push(iHole);
    }
    if (candidates.length <= 0) return false;
    var idx = candidates[Math.floor(Math.random() * candidates.length)];
    if (!isFinite(idx)) idx = candidates[0];

    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    var speedScale = Math.min(1, Math.max(0, state.elapsedSec / durationSec));
    var lifeStart = Number(state.lifeStartSec);
    var lifeEnd = Number(state.lifeEndSec);
    if (!isFinite(lifeStart)) lifeStart = 0.95;
    if (!isFinite(lifeEnd)) lifeEnd = 0.45;

    slot.holeIndex = idx;
    slot.visible = true;
    slot.flashActive = false;
    slot.expireSec = nowSec + Math.max(0.22, (lifeStart + ((lifeEnd - lifeStart) * speedScale)));
    slot.flashToken = Number(slot.flashToken || 0) + 1;
    ClearWhackRemSlotFlash(slot);
    SetWhackRemTargetVisible(state, slotIndex, true);
    return true;
}

function PlayWhackRemHitSound() {
    var options = WHACK_A_REM_HIT_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "whack_rem_hit");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayWhackRemMissSound() {
    var options = WHACK_A_REM_MISS_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "whack_rem_miss");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function GetWhackRemMissCandidateSlotIndex(state) {
    if (!state || !Array.isArray(state.slots)) return -1;
    var bestIdx = -1;
    var bestExpire = Number.POSITIVE_INFINITY;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot || !slot.visible) continue;
        var exp = Number(slot.expireSec);
        if (!isFinite(exp)) exp = Number.POSITIVE_INFINITY;
        if (exp < bestExpire) {
            bestExpire = exp;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function HandleWhackRemHit(state, slotIndex) {
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!state || !state.active || state.gameOver || !slot || !slot.visible) return;
    state.hits++;
    state.streak++;
    var nowMs = Date.now();
    state.lastHitMs = nowMs;
    PlayWhackRemHitSound();
    var flashToken = Number(slot.flashToken || 0) + 1;
    slot.flashToken = flashToken;
    slot.visible = false;
    slot.flashActive = true;
    SetWhackRemSlotFlash(slot, "HitFlashSuccess");
    slot.nextSpawnSec = (nowMs / 1000.0) + Math.max(0.08, Number(state.spawnDelaySec || 0.12));
    UpdateWhackRemHud(state);
    $.Schedule(WHACK_A_REM_HIT_FLASH_SEC, function() {
        if (!state || !state.active || state.gameOver) return;
        var slotAfter = GetWhackRemSlot(state, slotIndex);
        if (!slotAfter) return;
        if (Number(slotAfter.flashToken || 0) !== flashToken) return;
        slotAfter.flashActive = false;
        ClearWhackRemSlotFlash(slotAfter);
        SetWhackRemTargetVisible(state, slotIndex, false);
    });
}

function HandleWhackRemMiss(state, slotIndex) {
    if (!state || !state.active || state.gameOver) return;
    var resolvedSlotIndex = Number(slotIndex);
    if (!isFinite(resolvedSlotIndex) || resolvedSlotIndex < 0) {
        resolvedSlotIndex = GetWhackRemMissCandidateSlotIndex(state);
    }
    var slot = GetWhackRemSlot(state, resolvedSlotIndex);
    if (!slot || !slot.visible) return;
    state.misses++;
    state.streak = 0;
    PlayWhackRemMissSound();
    var nowMs = Date.now();
    var flashToken = Number(slot.flashToken || 0) + 1;
    slot.flashToken = flashToken;
    slot.visible = false;
    slot.flashActive = true;
    SetWhackRemSlotFlash(slot, "HitFlashFail");
    slot.nextSpawnSec = (nowMs / 1000.0) + Math.max(0.20, Number(state.spawnDelaySec || 0.12) + 0.05);
    UpdateWhackRemHud(state);
    $.Schedule(WHACK_A_REM_HIT_FLASH_SEC, function() {
        if (!state || !state.active || state.gameOver) return;
        var slotAfter = GetWhackRemSlot(state, resolvedSlotIndex);
        if (!slotAfter) return;
        if (Number(slotAfter.flashToken || 0) !== flashToken) return;
        slotAfter.flashActive = false;
        ClearWhackRemSlotFlash(slotAfter);
        SetWhackRemTargetVisible(state, resolvedSlotIndex, false);
    });
}

function EndWhackRem(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot) continue;
            slot.visible = false;
            slot.flashActive = false;
            slot.flashToken = Number(slot.flashToken || 0) + 1;
            ClearWhackRemSlotFlash(slot);
            SetWhackRemTargetVisible(state, i, false);
        }
    }
    UpdateWhackRemHud(state);
    UpdateWhackRemStatus(state, "Run complete. Press New Run.");
    StopWhackRemLoop();
}

function StepWhackRem(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gWhackRemLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndWhackRem(state);
        return;
    }

    RefreshWhackRemBounds(state);
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot || !slot.visible) continue;
            if (nowSec >= Number(slot.expireSec || 0)) {
                HandleWhackRemMiss(state, i);
            }
        }
    }
    var maxConcurrent = Number(state.maxConcurrent);
    if (!isFinite(maxConcurrent) || maxConcurrent < 1) maxConcurrent = 1;
    if (maxConcurrent > WHACK_A_REM_MAX_TARGETS) maxConcurrent = WHACK_A_REM_MAX_TARGETS;
    if (Array.isArray(state.slots)) {
        var visibleCount = GetWhackRemVisibleCount(state);
        for (var iSpawn = 0; iSpawn < state.slots.length && visibleCount < maxConcurrent; iSpawn++) {
            var spawnSlot = state.slots[iSpawn];
            if (!spawnSlot || spawnSlot.visible || spawnSlot.flashActive) continue;
            if (nowSec < Number(spawnSlot.nextSpawnSec || 0)) continue;
            if (SpawnWhackRemTarget(state, iSpawn, nowSec)) {
                visibleCount++;
            }
        }
    }
    UpdateWhackRemHud(state);

    $.Schedule(0.033, function() {
        StepWhackRem(state, token);
    });
}

function ResetWhackRem(state) {
    if (!state || !state.active) return;
    RefreshWhackRemBounds(state);
    state.gameOver = false;
    state.hits = 0;
    state.misses = 0;
    state.streak = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.lastHitMs = 0;
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot) continue;
            slot.visible = false;
            slot.flashActive = false;
            slot.holeIndex = -1;
            slot.expireSec = 0;
            slot.flashToken = Number(slot.flashToken || 0) + 1;
            slot.nextSpawnSec = state.startSec + 0.30 + (i * 0.05);
            ClearWhackRemSlotFlash(slot);
            SetWhackRemTargetVisible(state, i, false);
        }
    }
    UpdateWhackRemStatus(state, "");
    UpdateWhackRemHud(state);

    StopWhackRemLoop();
    var token = gWhackRemLoopToken;
    StepWhackRem(state, token);
}

function CloseWhackRemModal(overlay) {
    StopWhackRemLoop();
    if (gWhackRemState) {
        gWhackRemState.active = false;
        gWhackRemState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseWhackRemModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeWhackRemOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseWhackRemModal(overlay);
    } else {
        StopWhackRemLoop();
    }
}

function OpenWhackRemModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    _PrepareModal();
    CloseWhackRemModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeWhackRemOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseWhackRemModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeWhackRemModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseWhackRemModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeWhackRemTitle");
    header.text = _Localize("Whack a Rem", true);

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemActionRow");
    actionRow.AddClass("ArcadeWhackRemActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeWhackRemNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeWhackRemControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = _Localize("New Run", true);
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeWhackRemDifficultyGroup");
    difficultyGroup.AddClass("ArcadeAimTrainerDifficultyGroup");
    var difficultyButtons = {};
    (function() {
        for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
            (function(cfg) {
                var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeWhackRemDifficulty_" + cfg.id);
                diffBtn.AddClass("ArcadeMinesweeperActionBtn");
                diffBtn.AddClass("ArcadeAimTrainerDifficultyBtn");
                diffBtn.AddClass("ArcadeWhackRemControlBtn");
                var diffLbl = $.CreatePanel("Label", diffBtn, "");
                diffLbl.text = cfg.label;
                difficultyButtons[cfg.id] = diffBtn;
                diffBtn.SetPanelEvent("onactivate", function() {
                    ApplyWhackRemDifficulty(state, cfg.id, true);
                });
            })(WHACK_A_REM_DIFFICULTIES[i]);
        }
    })();

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemArea");
    gameArea.AddClass("ArcadeWhackRemArea");

    var holeLayer = $.CreatePanel("Panel", gameArea, "ArcadeWhackRemHoleLayer");
    holeLayer.AddClass("ArcadeWhackRemHoleLayer");
    var holePanels = [];
    for (var hi = 0; hi < 9; hi++) {
        var hole = $.CreatePanel("Panel", holeLayer, "ArcadeWhackRemHole_" + String(hi));
        hole.AddClass("ArcadeWhackRemHole");
        holePanels.push(hole);
    }

    var targetButtons = [];
    var targetImages = [];
    for (var t = 0; t < WHACK_A_REM_MAX_TARGETS; t++) {
        var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeWhackRemTarget_" + String(t));
        targetBtn.AddClass("ArcadeWhackRemTarget");
        var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeWhackRemTargetImage_" + String(t));
        targetImage.AddClass("ArcadeWhackRemTargetImage");
        try { targetImage.SetImage(WHACK_A_REM_TARGET_IMAGE_SRC); } catch(eRemImg) { _WarnLog("settings", "op failed: " + (eRemImg && eRemImg.message ? eRemImg.message : String(eRemImg || ""))); }
        targetButtons.push(targetBtn);
        targetImages.push(targetImage);
    }

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeWhackRemStatusLabel");
    statusLabel.AddClass("ArcadeWhackRemStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemHudRow");
    hudRow.AddClass("ArcadeWhackRemHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemTime");
    timerLabel.AddClass("ArcadeWhackRemStat");
    timerLabel.AddClass("ArcadeWhackRemStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemHits");
    hitLabel.AddClass("ArcadeWhackRemStat");
    hitLabel.AddClass("ArcadeWhackRemStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemMisses");
    missLabel.AddClass("ArcadeWhackRemStat");
    missLabel.AddClass("ArcadeWhackRemStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemAccuracy");
    accLabel.AddClass("ArcadeWhackRemStat");
    accLabel.AddClass("ArcadeWhackRemStatAccuracy");
    var streakLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemStreak");
    streakLabel.AddClass("ArcadeWhackRemStat");
    streakLabel.AddClass("ArcadeWhackRemStatStreak");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        durationSec: WHACK_A_REM_DURATION_SEC,
        gameWidth: 640,
        gameHeight: 430,
        holes: [],
        holePanels: holePanels,
        hits: 0,
        misses: 0,
        streak: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        difficultyId: WHACK_A_REM_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        maxConcurrent: 2,
        lifeStartSec: 0.98,
        lifeEndSec: 0.50,
        spawnDelaySec: 0.17,
        lastHitMs: 0,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        streakLabel: streakLabel,
        statusLabel: statusLabel,
        slots: [],
        gameArea: gameArea
    };
    for (var si = 0; si < WHACK_A_REM_MAX_TARGETS; si++) {
        state.slots.push({
            btn: targetButtons[si],
            image: targetImages[si],
            visible: false,
            flashActive: false,
            holeIndex: -1,
            expireSec: 0,
            nextSpawnSec: 0,
            flashToken: 0
        });
    }
    gWhackRemState = state;

    for (var siEvent = 0; siEvent < WHACK_A_REM_MAX_TARGETS; siEvent++) {
        (function(slotIdx) {
            var slotBtn = targetButtons[slotIdx];
            if (!slotBtn || !slotBtn.SetPanelEvent) return;
            slotBtn.SetPanelEvent("onactivate", function() {
                HandleWhackRemHit(state, slotIdx);
            });
        })(siEvent);
    }
    gameArea.SetPanelEvent("onactivate", function() {
        if (!state.active || state.gameOver || GetWhackRemVisibleCount(state) <= 0) return;
        var nowMs = Date.now();
        if ((nowMs - state.lastHitMs) < 80) return;
        HandleWhackRemMiss(state, -1);
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetWhackRem(state);
    });

    ApplyWhackRemDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

const BLACKJACK_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const BLACKJACK_SUITS = ["S", "H", "D", "C"];

function CreateBlackjackDeck() {
    var deck = [];
    for (var s = 0; s < BLACKJACK_SUITS.length; s++) {
        for (var r = 0; r < BLACKJACK_RANKS.length; r++) {
            deck.push({
                rank: BLACKJACK_RANKS[r],
                suit: BLACKJACK_SUITS[s]
            });
        }
    }
    for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = deck[i];
        deck[i] = deck[j];
        deck[j] = temp;
    }
    return deck;
}

function GetBlackjackCardValue(card) {
    if (!card || !card.rank) return 0;
    var rank = String(card.rank);
    if (rank === "A") return 11;
    if (rank === "K" || rank === "Q" || rank === "J") return 10;
    var n = Number(rank);
    return isFinite(n) ? n : 0;
}

function GetBlackjackHandTotal(hand) {
    var cards = Array.isArray(hand) ? hand : [];
    var total = 0;
    var acesAsEleven = 0;
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        total += GetBlackjackCardValue(card);
        if (card && card.rank === "A") {
            acesAsEleven++;
        }
    }
    while (total > 21 && acesAsEleven > 0) {
        total -= 10;
        acesAsEleven--;
    }
    return {
        total: total,
        soft: acesAsEleven > 0
    };
}

function DrawBlackjackCard(state) {
    if (!state) return null;
    if (!Array.isArray(state.deck) || state.deck.length <= 0) {
        state.deck = CreateBlackjackDeck();
    }
    if (state.deck.length <= 0) return null;
    return state.deck.pop();
}

function FormatBlackjackCard(card) {
    if (!card || !card.rank || !card.suit) return "??";
    return String(card.rank) + String(card.suit);
}

function GetBlackjackSuitGlyph(suit) {
    var key = String(suit || "");
    if (key === "H") return "?";
    if (key === "D") return "?";
    if (key === "C") return "?";
    if (key === "S") return "?";
    return "?";
}

function ClearPanelChildren(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    if (typeof panel.RemoveAndDeleteChildren === "function") {
        panel.RemoveAndDeleteChildren();
        return;
    }
    var count = (panel.GetChildCount && isFinite(Number(panel.GetChildCount()))) ? Number(panel.GetChildCount()) : 0;
    for (var i = count - 1; i >= 0; i--) {
        var child = panel.GetChild ? panel.GetChild(i) : null;
        if (!child) continue;
        child.DeleteAsync(0);
    }
}

function CreateBlackjackCardPanel(parent, card, isHidden) {
    if (!parent || !parent.IsValid || !parent.IsValid()) return;
    var cardPanel = $.CreatePanel("Panel", parent, "");
    cardPanel.AddClass("ArcadeBlackjackCard");

    if (isHidden === true) {
        cardPanel.AddClass("Hidden");
        var hiddenText = $.CreatePanel("Label", cardPanel, "");
        hiddenText.AddClass("ArcadeBlackjackCardBack");
        hiddenText.text = "?";
        return;
    }

    var rank = (card && card.rank) ? String(card.rank) : "?";
    var suit = (card && card.suit) ? String(card.suit) : "?";
    var suitGlyph = GetBlackjackSuitGlyph(suit);

    if (suit === "H") cardPanel.AddClass("SuitHeart");
    else if (suit === "D") cardPanel.AddClass("SuitDiamond");
    else if (suit === "C") cardPanel.AddClass("SuitClub");
    else cardPanel.AddClass("SuitSpade");

    var topLeft = $.CreatePanel("Label", cardPanel, "");
    topLeft.AddClass("ArcadeBlackjackCardCorner");
    topLeft.AddClass("TopLeft");
    topLeft.text = suitGlyph;

    var center = $.CreatePanel("Label", cardPanel, "");
    center.AddClass("ArcadeBlackjackCardCenter");
    center.text = rank;

    var bottomRight = $.CreatePanel("Label", cardPanel, "");
    bottomRight.AddClass("ArcadeBlackjackCardCorner");
    bottomRight.AddClass("BottomRight");
    bottomRight.text = suitGlyph;
}

function RenderBlackjackCardsToContainer(container, hand, hideSecondCard) {
    if (!container || !container.IsValid || !container.IsValid()) return;
    ClearPanelChildren(container);
    var cards = Array.isArray(hand) ? hand : [];
    if (cards.length <= 0) {
        var emptyLabel = $.CreatePanel("Label", container, "");
        emptyLabel.AddClass("ArcadeBlackjackCardsEmpty");
        emptyLabel.text = "--";
        return;
    }
    for (var i = 0; i < cards.length; i++) {
        var hidden = (hideSecondCard === true && i === 1);
        CreateBlackjackCardPanel(container, cards[i], hidden);
    }
}

function UpdateBlackjackHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var handOver = (state.handOver === true);
    var playerTotalInfo = GetBlackjackHandTotal(state.playerHand);
    var dealerTotalInfo = GetBlackjackHandTotal(state.dealerHand);
    var dealerShowing = (Array.isArray(state.dealerHand) && state.dealerHand.length > 0)
        ? GetBlackjackCardValue(state.dealerHand[0])
        : 0;

    if (state.playerCardsContainer && state.playerCardsContainer.IsValid && state.playerCardsContainer.IsValid()) {
        RenderBlackjackCardsToContainer(state.playerCardsContainer, state.playerHand, false);
    }
    if (state.playerTotalLabel && state.playerTotalLabel.IsValid && state.playerTotalLabel.IsValid()) {
        state.playerTotalLabel.text = _Localize("Total:", true) + " " + String(playerTotalInfo.total);
    }
    if (state.dealerCardsContainer && state.dealerCardsContainer.IsValid && state.dealerCardsContainer.IsValid()) {
        RenderBlackjackCardsToContainer(state.dealerCardsContainer, state.dealerHand, !handOver);
    }
    if (state.dealerTotalLabel && state.dealerTotalLabel.IsValid && state.dealerTotalLabel.IsValid()) {
        state.dealerTotalLabel.text = handOver
            ? (_Localize("Total:", true) + " " + String(dealerTotalInfo.total))
            : (_Localize("Showing:", true) + " " + String(dealerShowing));
    }
    if (state.deckLabel && state.deckLabel.IsValid && state.deckLabel.IsValid()) {
        var remain = Array.isArray(state.deck) ? state.deck.length : 0;
        state.deckLabel.text = _Localize("Deck:", true) + " " + String(remain);
    }
    if (state.resultLabel && state.resultLabel.IsValid && state.resultLabel.IsValid()) {
        var msg = String(state.resultText || "");
        var tone = String(state.resultTone || "");
        state.resultLabel.SetHasClass("ResultWin", tone === "win");
        state.resultLabel.SetHasClass("ResultLoss", tone === "loss");
        state.resultLabel.SetHasClass("ResultPush", tone === "push");
        if (msg.length > 0) {
            state.resultLabel.text = _Localize(msg, true);
            state.resultLabel.style.visibility = "visible";
        } else {
            state.resultLabel.text = "";
            state.resultLabel.style.visibility = "collapse";
        }
    }
    if (state.playerRow && state.playerRow.IsValid && state.playerRow.IsValid()) {
        state.playerRow.SetHasClass("ResultWin", handOver && state.resultTone === "win");
        state.playerRow.SetHasClass("ResultLoss", handOver && state.resultTone === "loss");
    }
    if (state.dealerRow && state.dealerRow.IsValid && state.dealerRow.IsValid()) {
        state.dealerRow.SetHasClass("ResultWin", handOver && state.resultTone === "loss");
        state.dealerRow.SetHasClass("ResultLoss", handOver && state.resultTone === "win");
    }
    var canPlay = !handOver;
    if (state.hitBtn && state.hitBtn.IsValid && state.hitBtn.IsValid()) {
        state.hitBtn.SetHasClass("Disabled", !canPlay);
    }
    if (state.standBtn && state.standBtn.IsValid && state.standBtn.IsValid()) {
        state.standBtn.SetHasClass("Disabled", !canPlay);
    }
}

function IsBlackjackStateActive(state) {
    return !!(state && state.active === true && state.isValid && state.isValid());
}

function PlayBlackjackActionSound() {
    var options = BLACKJACK_ACTION_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "blackjack_action");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayBlackjackResultSound(tone) {
    var eventName = "";
    if (tone === "win") eventName = BLACKJACK_WIN_SOUND_EVENT;
    else if (tone === "loss") eventName = BLACKJACK_LOSE_SOUND_EVENT;
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function SetBlackjackResult(state, message, tone) {
    if (!state) return;
    state.resultText = String(message || "");
    state.resultTone = String(tone || "");
    UpdateBlackjackHud(state);
    PlayBlackjackResultSound(state.resultTone);
}

function ResolveBlackjackOutcome(state) {
    if (!state) return;
    var player = GetBlackjackHandTotal(state.playerHand).total;
    var dealer = GetBlackjackHandTotal(state.dealerHand).total;
    state.handOver = true;
    if (player > 21) {
        SetBlackjackResult(state, "Bust - Dealer wins.", "loss");
    } else if (dealer > 21) {
        SetBlackjackResult(state, "Dealer busts - You win.", "win");
    } else if (player > dealer) {
        SetBlackjackResult(state, "You win.", "win");
    } else if (player < dealer) {
        SetBlackjackResult(state, "Dealer wins.", "loss");
    } else {
        SetBlackjackResult(state, "Push.", "push");
    }
}

function BeginBlackjackHand(state) {
    if (!IsBlackjackStateActive(state)) return;
    state.deck = CreateBlackjackDeck();
    state.playerHand = [];
    state.dealerHand = [];
    state.handOver = false;
    state.resultText = "";
    state.resultTone = "";

    state.playerHand.push(DrawBlackjackCard(state));
    state.dealerHand.push(DrawBlackjackCard(state));
    state.playerHand.push(DrawBlackjackCard(state));
    state.dealerHand.push(DrawBlackjackCard(state));

    var playerTotal = GetBlackjackHandTotal(state.playerHand).total;
    var dealerTotal = GetBlackjackHandTotal(state.dealerHand).total;
    if (playerTotal === 21 || dealerTotal === 21) {
        state.handOver = true;
        if (playerTotal === 21 && dealerTotal === 21) SetBlackjackResult(state, "Push - Both have blackjack.", "push");
        else if (playerTotal === 21) SetBlackjackResult(state, "Blackjack - You win.", "win");
        else SetBlackjackResult(state, "Dealer blackjack.", "loss");
    } else {
        UpdateBlackjackHud(state);
    }
}

function HitBlackjack(state) {
    if (!IsBlackjackStateActive(state) || state.handOver) return;
    state.playerHand.push(DrawBlackjackCard(state));
    var playerTotal = GetBlackjackHandTotal(state.playerHand).total;
    if (playerTotal > 21) {
        state.handOver = true;
        SetBlackjackResult(state, "Bust - Dealer wins.", "loss");
        return;
    }
    PlayBlackjackActionSound();
    UpdateBlackjackHud(state);
}

function StandBlackjack(state) {
    if (!IsBlackjackStateActive(state) || state.handOver) return;
    while (GetBlackjackHandTotal(state.dealerHand).total < 17) {
        state.dealerHand.push(DrawBlackjackCard(state));
    }
    ResolveBlackjackOutcome(state);
    if (state.resultTone !== "win" && state.resultTone !== "loss") {
        PlayBlackjackActionSound();
    }
}

function CloseBlackjackModal(overlay) {
    if (gBlackjackState) {
        gBlackjackState.active = false;
        gBlackjackState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseBlackjackModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeBlackjackOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseBlackjackModal(overlay);
    } else if (gBlackjackState) {
        gBlackjackState.active = false;
        gBlackjackState = null;
    }
}

function OpenBlackjackModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    _PrepareModal();
    CloseBlackjackModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeBlackjackOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    // Do not close on generic overlay activate; button/input clicks can bubble and
    // race panel deletion against in-flight blackjack handlers.
    overlay.SetPanelEvent("onactivate", function() {});
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeBlackjackModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseBlackjackModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeBlackjackTitle");
    header.text = _Localize("Wraithjack", true);

    var heroIcon = $.CreatePanel("Image", modalContainer, "ArcadeBlackjackHeroIcon");
    heroIcon.AddClass("ArcadeBlackjackHeroIcon");
    heroIcon.SetImage("file://{images}/qollock/wraith_sm_psd_png.vtex");

    var area = $.CreatePanel("Panel", modalContainer, "ArcadeBlackjackArea");
    area.AddClass("ArcadeBlackjackArea");
    var content = $.CreatePanel("Panel", area, "ArcadeBlackjackContent");
    content.AddClass("ArcadeBlackjackContent");

    var dealerRow = $.CreatePanel("Panel", content, "ArcadeBlackjackDealerRow");
    dealerRow.AddClass("ArcadeBlackjackHandRow");
    var dealerTitle = $.CreatePanel("Label", dealerRow, "");
    dealerTitle.AddClass("ArcadeBlackjackHandTitle");
    dealerTitle.text = _Localize("Dealer", true);
    var dealerCards = $.CreatePanel("Panel", dealerRow, "ArcadeBlackjackDealerCards");
    dealerCards.AddClass("ArcadeBlackjackHandCards");
    var dealerTotal = $.CreatePanel("Label", dealerRow, "ArcadeBlackjackDealerTotal");
    dealerTotal.AddClass("ArcadeBlackjackHandTotal");
    dealerTotal.text = _Localize("Total:", true) + " --";

    var playerRow = $.CreatePanel("Panel", content, "ArcadeBlackjackPlayerRow");
    playerRow.AddClass("ArcadeBlackjackHandRow");
    var playerTitle = $.CreatePanel("Label", playerRow, "");
    playerTitle.AddClass("ArcadeBlackjackHandTitle");
    playerTitle.text = _Localize("Player", true);
    var playerCards = $.CreatePanel("Panel", playerRow, "ArcadeBlackjackPlayerCards");
    playerCards.AddClass("ArcadeBlackjackHandCards");
    var playerTotal = $.CreatePanel("Label", playerRow, "ArcadeBlackjackPlayerTotal");
    playerTotal.AddClass("ArcadeBlackjackHandTotal");
    playerTotal.text = _Localize("Total:", true) + " --";

    var actionRow = $.CreatePanel("Panel", content, "ArcadeBlackjackActionRow");
    actionRow.AddClass("ArcadeBlackjackActionRow");

    var hitBtn = $.CreatePanel("Button", actionRow, "ArcadeBlackjackHitBtn");
    hitBtn.AddClass("ArcadeMinesweeperActionBtn");
    hitBtn.AddClass("ArcadeBlackjackControlBtn");
    var hitLbl = $.CreatePanel("Label", hitBtn, "");
    hitLbl.text = _Localize("Hit", true);

    var standBtn = $.CreatePanel("Button", actionRow, "ArcadeBlackjackStandBtn");
    standBtn.AddClass("ArcadeMinesweeperActionBtn");
    standBtn.AddClass("ArcadeBlackjackControlBtn");
    var standLbl = $.CreatePanel("Label", standBtn, "");
    standLbl.text = _Localize("Stand", true);

    var actionRowSecondary = $.CreatePanel("Panel", content, "ArcadeBlackjackActionRowSecondary");
    actionRowSecondary.AddClass("ArcadeBlackjackActionRow");
    actionRowSecondary.AddClass("ArcadeBlackjackActionRowSecondary");

    var newHandBtn = $.CreatePanel("Button", actionRowSecondary, "ArcadeBlackjackNewHandBtn");
    newHandBtn.AddClass("ArcadeMinesweeperActionBtn");
    newHandBtn.AddClass("ArcadeBlackjackControlBtn");
    newHandBtn.AddClass("ArcadeBlackjackNewHandBtn");
    var newHandLbl = $.CreatePanel("Label", newHandBtn, "");
    newHandLbl.text = _Localize("New Hand", true);

    var statusLabel = $.CreatePanel("Label", modalContainer, "ArcadeBlackjackStatusLabel");
    statusLabel.AddClass("ArcadeBlackjackStatusLabel");
    statusLabel.style.visibility = "collapse";

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        deck: [],
        playerHand: [],
        dealerHand: [],
        handOver: false,
        resultText: "",
        hitBtn: hitBtn,
        standBtn: standBtn,
        dealerRow: dealerRow,
        dealerCardsContainer: dealerCards,
        dealerTotalLabel: dealerTotal,
        playerRow: playerRow,
        playerCardsContainer: playerCards,
        playerTotalLabel: playerTotal,
        resultLabel: statusLabel
    };
    gBlackjackState = state;

    newHandBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        BeginBlackjackHand(state);
    });
    hitBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        HitBlackjack(state);
    });
    standBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        StandBlackjack(state);
    });

    BeginBlackjackHand(state);
}

function IsAnyArcadeModalOpen() {
    var root = $.GetContextPanel();
    if (!root) return false;
    return !!(
        root.FindChildTraverse("ArcadeMinesweeperOverlay") ||
        root.FindChildTraverse("ArcadeFlappyOverlay") ||
        root.FindChildTraverse("ArcadeAimTrainerOverlay") ||
        root.FindChildTraverse("ArcadeTrainTrackingOverlay") ||
        root.FindChildTraverse("ArcadeWhackRemOverlay") ||
        root.FindChildTraverse("ArcadeBlackjackOverlay")
    );
}

function CloseAllArcadeModalsIfOpen() {
    CloseMinesweeperModalIfOpen();
    CloseFlappyModalIfOpen();
    CloseAimTrainerModalIfOpen();
    CloseTrainTrackingModalIfOpen();
    CloseWhackRemModalIfOpen();
    CloseBlackjackModalIfOpen();
}

function OpenRandomArcadeModal() {
    if (IsAnyArcadeModalOpen()) return;
    var choice = Math.floor(Math.random() * 6);
    if (choice === 0) OpenMinesweeperModal();
    else if (choice === 1) OpenFlappyModal();
    else if (choice === 2) OpenAimTrainerModal();
    else if (choice === 3) OpenTrainTrackingModal();
    else if (choice === 4) OpenWhackRemModal();
    else OpenBlackjackModal();
}

function BuildEnabledOnDeathArcadePool() {
    var pool = [];
    if (Number(MOD_CONFIG.ON_DEATH_GAME_MINESWEEPER) === 1) pool.push(OpenMinesweeperModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_BLACKJACK) === 1) pool.push(OpenBlackjackModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_FLAPPY_BAT) === 1) pool.push(OpenFlappyModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_GRAVES_TRAINER) === 1) pool.push(OpenAimTrainerModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_ZERGGY_MANIA) === 1) pool.push(OpenTrainTrackingModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_WHACK_A_REM) === 1) pool.push(OpenWhackRemModal);
    return pool;
}

function HasAnyOnDeathArcadeGameEnabled() {
    for (var i = 0; i < ON_DEATH_ARCADE_GAME_KEYS.length; i++) {
        var key = ON_DEATH_ARCADE_GAME_KEYS[i];
        if (Number(MOD_CONFIG[key]) === 1) return true;
    }
    return false;
}

function BuildOnDeathEscapeMenuTargets() {
    var targets = [];
    function pushUnique(panel) {
        if (!panel || !panel.IsValid || !panel.IsValid()) return;
        for (var i = 0; i < targets.length; i++) {
            if (targets[i] === panel) return;
        }
        targets.push(panel);
    }

    var cursor = $.GetContextPanel ? $.GetContextPanel() : null;
    var depth = 0;
    while (cursor && depth < 20) {
        pushUnique(cursor);
        cursor = cursor.GetParent ? cursor.GetParent() : null;
        depth++;
    }

    var root = _FindRoot();
    pushUnique(root);

    var escapeMenu = null;
    if (root && root.FindChildTraverse) {
        try { escapeMenu = root.FindChildTraverse("EscapeMenu"); } catch (e0) { escapeMenu = null; }
        pushUnique(escapeMenu);
        if (escapeMenu && escapeMenu.GetParent) pushUnique(escapeMenu.GetParent());
        var hudPanel = null;
        try { hudPanel = root.FindChildTraverse("Hud"); } catch (e1) { hudPanel = null; }
        pushUnique(hudPanel);
    }

    return targets;
}

function ForceCloseEscapeMenuForOnDeathGames() {
    var targets = BuildOnDeathEscapeMenuTargets();
    for (var i = 0; i < targets.length; i++) {
        var panel = targets[i];
        if (!panel || !panel.IsValid || !panel.IsValid() || !panel.RemoveClass) continue;
        try { panel.RemoveClass("ShowEscapeMenu"); } catch(e0) { _WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }
}

function OpenOnDeathArcadeGameById(gameId) {
    var normalized = String(gameId || "").toLowerCase();
    if (normalized === "minesweeper") {
        OpenMinesweeperModal();
        return true;
    }
    if (normalized === "blackjack") {
        OpenBlackjackModal();
        return true;
    }
    if (normalized === "flappy_bat") {
        OpenFlappyModal();
        return true;
    }
    if (normalized === "graves_trainer") {
        OpenAimTrainerModal();
        return true;
    }
    if (normalized === "zerggy_mania") {
        OpenTrainTrackingModal();
        return true;
    }
    if (normalized === "whack_a_rem") {
        OpenWhackRemModal();
        return true;
    }
    return false;
}

function GetOnDeathArcadeBridgeState() {
    var root = _FindRoot();
    var out = {
        root: root || null,
        active: false,
        gameId: "",
        token: ""
    };
    if (!root || !root.GetAttributeString) return out;
    try { out.active = (String(root.GetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, "") || "") === "1"); } catch (e0) { out.active = false; }
    try { out.gameId = String(root.GetAttributeString(ON_DEATH_ARCADE_REQUEST_ATTR, "") || ""); } catch (e1) { out.gameId = ""; }
    try { out.token = String(root.GetAttributeString(ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR, "") || ""); } catch (e2) { out.token = ""; }
    return out;
}

function IsOnDeathArcadeConfigEnabledForSettings() {
    if (Number(MOD_CONFIG && MOD_CONFIG.ENABLE_ON_DEATH_GAMES) !== 1) return false;
    for (var i = 0; i < ON_DEATH_ARCADE_GAME_KEYS.length; i++) {
        if (Number(MOD_CONFIG[ON_DEATH_ARCADE_GAME_KEYS[i]]) === 1) return true;
    }
    return false;
}

function ShouldRunOnDeathArcadeBridgePoller() {
    return IsOnDeathArcadeConfigEnabledForSettings() || gOnDeathArcadeSessionActive;
}

function StopOnDeathArcadeBridgePoller() {
    gOnDeathArcadeBridgePollToken++;
    gOnDeathArcadeBridgePollRunning = false;
}

function StartOnDeathArcadeBridgePoller() {
    if (!ShouldRunOnDeathArcadeBridgePoller()) {
        gOnDeathArcadeBridgePollRunning = false;
        return;
    }
    gOnDeathArcadeBridgePollToken++;
    gOnDeathArcadeBridgePollRunning = true;
    var token = gOnDeathArcadeBridgePollToken;

    function tick() {
        if (token !== gOnDeathArcadeBridgePollToken) return;
        if (!ShouldRunOnDeathArcadeBridgePoller()) {
            gOnDeathArcadeBridgePollRunning = false;
            return;
        }

        var featureEnabled = IsOnDeathArcadeConfigEnabledForSettings();
        var bridge = GetOnDeathArcadeBridgeState();
        if (!bridge.active) {
            if (gOnDeathArcadeSessionActive) {
                gOnDeathArcadeSessionActive = false;
                CloseAllArcadeModalsIfOpen();
                ForceCloseEscapeMenuForOnDeathGames();
            }
        } else if (featureEnabled && bridge.token && bridge.token !== gOnDeathArcadeLastRequestToken) {
            gOnDeathArcadeLastRequestToken = bridge.token;
            gOnDeathArcadeSessionActive = true;
            if (!IsAnyArcadeModalOpen()) {
                OpenOnDeathArcadeGameById(bridge.gameId);
            }
        }

        if (!ShouldRunOnDeathArcadeBridgePoller()) {
            gOnDeathArcadeBridgePollRunning = false;
            return;
        }
        $.Schedule(ON_DEATH_GAMES_POLL_SECONDS, tick);
    }

    $.Schedule(ON_DEATH_GAMES_POLL_SECONDS, tick);
}

function EnsureOnDeathArcadeBridgePoller() {
    if (gOnDeathArcadeBridgePollRunning) return;
    StartOnDeathArcadeBridgePoller();
}

function UpdateOnDeathArcadeBridgePollerState() {
    if (ShouldRunOnDeathArcadeBridgePoller()) {
        EnsureOnDeathArcadeBridgePoller();
    } else if (gOnDeathArcadeBridgePollRunning) {
        StopOnDeathArcadeBridgePoller();
    }
}

})();
