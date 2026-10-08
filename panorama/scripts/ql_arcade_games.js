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
    
const ON_DEATH_ARCADE_REQUEST_ATTR = QOL.bridge.channels.onDeathArcadeRequest.attr;
const ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR = QOL.bridge.channels.onDeathArcadeToken.attr;
const ON_DEATH_ARCADE_ACTIVE_ATTR = QOL.bridge.channels.onDeathArcadeActive.attr;
const ON_DEATH_ARCADE_ESCAPE_OWNED_ATTR = QOL.bridge.channels.onDeathArcadeEscapeOwned.attr;

var currentTab = "Support";

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
    return QOL.ui?.theme?.LocalizeSettingsText
        ? QOL.ui.theme.LocalizeSettingsText(text, force)
        : String(text === undefined || text === null ? "" : text);
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

const ON_DEATH_ARCADE_GAME_KEYS = [
    "ON_DEATH_GAME_MINESWEEPER",
    "ON_DEATH_GAME_BLACKJACK",
    "ON_DEATH_GAME_FLAPPY_BAT",
    "ON_DEATH_GAME_GRAVES_TRAINER",
    "ON_DEATH_GAME_ZERGGY_MANIA",
    "ON_DEATH_GAME_WHACK_A_REM"
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

function _FindRoot() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) {
        root = root.GetParent();
    }
    return root;
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
        UpdateMinesweeperStatus(state, QOL.ui.theme.FormatSettingsText("Cleared in {seconds}s.", { seconds: state.elapsedSeconds }));
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

function GetBlackjackSuitGlyph(suit) {
    var key = String(suit || "");
    if (key === "H") return "\u2665";
    if (key === "D") return "\u2666";
    if (key === "C") return "\u2663";
    if (key === "S") return "\u2660";
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
    for (const panel of BuildOnDeathEscapeMenuTargets()) {
        if (!QOL.core.panel.isAlive(panel) || QOL.bridge.readAttr(panel, ON_DEATH_ARCADE_ESCAPE_OWNED_ATTR, "") !== "1") continue;
        QOL.core.panel.setClass(panel, "ShowEscapeMenu", false);
        if (!panel.BHasClass("ShowEscapeMenu")) QOL.bridge.writeAttr(panel, ON_DEATH_ARCADE_ESCAPE_OWNED_ATTR, "");
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
    out.active = QOL.bridge.readAttr(root, ON_DEATH_ARCADE_ACTIVE_ATTR, "") === "1";
    out.gameId = QOL.bridge.readAttr(root, ON_DEATH_ARCADE_REQUEST_ATTR, "");
    out.token = QOL.bridge.readAttr(root, ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR, "");
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
