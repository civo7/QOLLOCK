// =============================================================================
// QOLLOCK — ui/theme.js
// =============================================================================
// OWNS:        Settings theme management and localization helpers:
//              - Language constants, option arrays, language detection
//              - Theme constants, theme classes, theme header logos
//              - Localization text translation and Latin text normalization
// DOES NOT OWN: Raw dictionary contents (ql_settings_loc/*.js),
//               Config persistence (core/ql_config_store.js, ql_bridge.js).
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js
// USED BY:     hud_escape_menu.xml, ui/window.js, ql_settings.js, ui/config_tab.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    const getConfig = () => (typeof globalThis.MOD_CONFIG !== "undefined" ? globalThis.MOD_CONFIG : {});
    const getRoot = () => (typeof globalThis.FindRootPanel === "function" ? globalThis.FindRootPanel() : null);

    // =========================================================================
    // Language Constants & Options
    // =========================================================================

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

    // =========================================================================
    // Theme Constants & Options
    // =========================================================================

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

    // =========================================================================
    // Language Accessors
    // =========================================================================

    function GetSettingsLanguage() {
        const cfg = getConfig();
        const raw = Math.round(Number(cfg && cfg.LANGUAGE));
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

    const IsRussianSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_RUSSIAN;
    const IsUkrainianSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_UKRAINIAN;
    const IsPolishSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_POLISH;
    const IsBulgarianSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_BULGARIAN;
    const IsBelarusianSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_BELARUSIAN;
    const IsJapaneseSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_JAPANESE;
    const IsChineseSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_CHINESE;
    const IsFrenchSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_FRENCH;
    const IsPortugueseSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_PORTUGUESE;
    const IsBrazilianPortugueseSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE;
    const IsSpanishSettingsLanguage = () => GetSettingsLanguage() === SETTINGS_LANGUAGE_SPANISH;

    function GetSettingsLanguageKey() {
        const lang = GetSettingsLanguage();
        switch (lang) {
            case SETTINGS_LANGUAGE_RUSSIAN: return "ru";
            case SETTINGS_LANGUAGE_UKRAINIAN: return "uk";
            case SETTINGS_LANGUAGE_POLISH: return "pl";
            case SETTINGS_LANGUAGE_BULGARIAN: return "bg";
            case SETTINGS_LANGUAGE_BELARUSIAN: return "by";
            case SETTINGS_LANGUAGE_JAPANESE: return "ja";
            case SETTINGS_LANGUAGE_CHINESE: return "zh";
            case SETTINGS_LANGUAGE_FRENCH: return "fr";
            case SETTINGS_LANGUAGE_PORTUGUESE: return "pt";
            case SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE: return "pt-br";
            case SETTINGS_LANGUAGE_SPANISH: return "es";
            case SETTINGS_LANGUAGE_KOREAN: return "ko";
            case SETTINGS_LANGUAGE_ITALIAN: return "it";
            case SETTINGS_LANGUAGE_TURKISH: return "tr";
            default: return "en";
        }
    }

    // =========================================================================
    // Theme Accessors & DOM Helpers
    // =========================================================================

    function GetSettingsTheme() {
        const cfg = getConfig();
        const raw = Math.round(Number(cfg && cfg.SETTINGS_THEME));
        if (raw === SETTINGS_THEME_CREAM) return SETTINGS_THEME_CREAM;
        if (raw === SETTINGS_THEME_KITTEN) return SETTINGS_THEME_KITTEN;
        if (raw === SETTINGS_THEME_EMO) return SETTINGS_THEME_EMO;
        if (raw === SETTINGS_THEME_OCEAN) return SETTINGS_THEME_OCEAN;
        if (raw === SETTINGS_THEME_PSYCHO) return SETTINGS_THEME_PSYCHO;
        if (raw === SETTINGS_THEME_MUNFINS) return SETTINGS_THEME_MUNFINS;
        return SETTINGS_THEME_DEFAULT;
    }

    function GetSettingsThemeKey() {
        const theme = GetSettingsTheme();
        switch (theme) {
            case SETTINGS_THEME_CREAM: return "cream";
            case SETTINGS_THEME_KITTEN: return "kitten";
            case SETTINGS_THEME_EMO: return "emo";
            case SETTINGS_THEME_OCEAN: return "ocean";
            case SETTINGS_THEME_PSYCHO: return "psycho";
            case SETTINGS_THEME_MUNFINS: return "munfins";
            default: return "default";
        }
    }

    function ApplySettingsHeaderLogoTheme(theme) {
        const root = getRoot();
        const context = (typeof $ !== "undefined" && $.GetContextPanel) ? $.GetContextPanel() : null;
        let logo = null;
        if (context && context.FindChildTraverse) logo = context.FindChildTraverse("SettingsHeaderMogLogo");
        if (!logo && root && root.FindChildTraverse) logo = root.FindChildTraverse("SettingsHeaderMogLogo");

        const src = theme === SETTINGS_THEME_MUNFINS
            ? SETTINGS_HEADER_MUNFINS_LOGO_SRC
            : (theme === SETTINGS_THEME_DEFAULT ? SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC : SETTINGS_HEADER_MOG_LOGO_THEME_SRC);

        if (logo && logo.SetImage) {
            try { logo.SetImage(src); } catch (e) { /* ignore */ }
        }

        let header = null;
        if (context && context.FindChildTraverse) header = context.FindChildTraverse("SettingsHeader");
        if (!header && root && root.FindChildTraverse) header = root.FindChildTraverse("SettingsHeader");
        if (!header || !header.FindChildTraverse) return;

        const title = header.FindChildTraverse("SettingsTitle");
        const titleAccent = header.FindChildTraverse("SettingsTitleAccent");
        const moglockLink = header.FindChildTraverse("ModVersionLabelTop");
        if (title) title.text = LocalizeSettingsText("LOCK", true);
        if (titleAccent) titleAccent.text = theme === SETTINGS_THEME_MUNFINS ? "Munfins" : LocalizeSettingsText("QOL", true);
        if (moglockLink) {
            moglockLink.visible = theme !== SETTINGS_THEME_MUNFINS;
            moglockLink.style.visibility = theme === SETTINGS_THEME_MUNFINS ? "collapse" : "visible";
        }
    }

    function ApplySettingsThemeClasses(settingsWindow) {
        const root = getRoot();
        const context = (typeof $ !== "undefined" && $.GetContextPanel) ? $.GetContextPanel() : null;
        const theme = GetSettingsTheme();
        const panels = [];
        if (!settingsWindow && context && context.FindChildTraverse) {
            settingsWindow = context.FindChildTraverse("SettingsWindow");
        }
        if (settingsWindow) panels.push(settingsWindow);
        if (context && context !== settingsWindow) panels.push(context);
        if (root && root !== settingsWindow) panels.push(root);

        for (const panel of panels) {
            if (!panel || !panel.SetHasClass) continue;
            for (let i = 0; i < SETTINGS_THEME_CLASS_NAMES.length; i++) {
                panel.SetHasClass(SETTINGS_THEME_CLASS_NAMES[i], i === theme);
                panel.SetHasClass(SETTINGS_THEME_ROOT_CLASS_NAMES[i], i === theme);
            }
        }
        ApplySettingsHeaderLogoTheme(theme);
    }

    // =========================================================================
    // Localization Translation & Normalization
    // =========================================================================

    function NormalizeLatinSettingsText(text) {
        const raw = String(text || "");
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
        const cur = typeof globalThis.currentTab !== "undefined" ? globalThis.currentTab : "";
        return cur !== "Presets";
    }

    function LocalizeSettingsText(text, force) {
        if (text === undefined || text === null) return "";
        const raw = String(text);
        if (!force && !ShouldLocalizeTabContent()) return raw;

        const lang = GetSettingsLanguage();
        if (lang === SETTINGS_LANGUAGE_ENGLISH) return raw;

        const key = GetSettingsLanguageKey();
        const maps = (typeof globalThis !== "undefined" && globalThis.SETTINGS_LOCALE_TEXT)
            ? globalThis.SETTINGS_LOCALE_TEXT
            : ((typeof window !== "undefined" && window.SETTINGS_LOCALE_TEXT) ? window.SETTINGS_LOCALE_TEXT : {});
        const map = maps[key] || null;
        if (map && Object.prototype.hasOwnProperty.call(map, raw)) {
            const translated = map[raw];
            if (key === "fr" || key === "it" || key === "tr" || key === "pt" || key === "pt-br" || key === "es") {
                return NormalizeLatinSettingsText(translated);
            }
            return translated;
        }
        return raw;
    }

    function SetLocalizedConfigFeedbackMessage(text, tone, durationMs) {
        const localized = LocalizeSettingsText(text, true);
        if (typeof globalThis.SetConfigFeedbackMessage === "function") {
            globalThis.SetConfigFeedbackMessage(localized, tone, durationMs);
        } else if (Q.ui && Q.ui.configTab && typeof Q.ui.configTab.setConfigFeedbackMessage === "function") {
            Q.ui.configTab.setConfigFeedbackMessage(localized, tone, durationMs);
        }
    }

    // =========================================================================
    // Public API & Backward Compatibility
    // =========================================================================

    const ThemeApi = {
        SETTINGS_LANGUAGE_ENGLISH,
        SETTINGS_LANGUAGE_RUSSIAN,
        SETTINGS_LANGUAGE_UKRAINIAN,
        SETTINGS_LANGUAGE_POLISH,
        SETTINGS_LANGUAGE_BULGARIAN,
        SETTINGS_LANGUAGE_JAPANESE,
        SETTINGS_LANGUAGE_CHINESE,
        SETTINGS_LANGUAGE_FRENCH,
        SETTINGS_LANGUAGE_PORTUGUESE,
        SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE,
        SETTINGS_LANGUAGE_SPANISH,
        SETTINGS_LANGUAGE_BELARUSIAN,
        SETTINGS_LANGUAGE_KOREAN,
        SETTINGS_LANGUAGE_ITALIAN,
        SETTINGS_LANGUAGE_TURKISH,
        SETTINGS_LANGUAGE_OPTIONS,

        SETTINGS_THEME_DEFAULT,
        SETTINGS_THEME_CREAM,
        SETTINGS_THEME_KITTEN,
        SETTINGS_THEME_EMO,
        SETTINGS_THEME_OCEAN,
        SETTINGS_THEME_PSYCHO,
        SETTINGS_THEME_MUNFINS,
        SETTINGS_THEME_CLASS_NAMES,
        SETTINGS_THEME_ROOT_CLASS_NAMES,
        SETTINGS_THEME_OPTIONS,

        SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC,
        SETTINGS_HEADER_MOG_LOGO_THEME_SRC,
        SETTINGS_HEADER_MUNFINS_LOGO_SRC,

        GetSettingsLanguage,
        IsRussianSettingsLanguage,
        IsUkrainianSettingsLanguage,
        IsPolishSettingsLanguage,
        IsBulgarianSettingsLanguage,
        IsBelarusianSettingsLanguage,
        IsJapaneseSettingsLanguage,
        IsChineseSettingsLanguage,
        IsFrenchSettingsLanguage,
        IsPortugueseSettingsLanguage,
        IsBrazilianPortugueseSettingsLanguage,
        IsSpanishSettingsLanguage,
        GetSettingsLanguageKey,

        GetSettingsTheme,
        GetSettingsThemeKey,
        ApplySettingsHeaderLogoTheme,
        ApplySettingsThemeClasses,

        NormalizeLatinSettingsText,
        ShouldLocalizeTabContent,
        LocalizeSettingsText,
        SetLocalizedConfigFeedbackMessage
    };

    Q.ui.theme = ThemeApi;

    if (typeof globalThis !== "undefined") {
        Object.assign(globalThis, ThemeApi);
    }
})();
