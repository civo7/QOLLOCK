// tests/ui_theme.test.js
// =============================================================================
// Unit tests for Theme & Localization subsystem (panorama/scripts/ui/theme.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Document } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");

function createTestEnvironment(initialConfig = {}) {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const rootPanel = doc.create("Panel", { id: "Root" });
    const settingsWin = doc.create("Panel", { id: "SettingsWindow" });
    const header = doc.create("Panel", { id: "SettingsHeader" });
    const logo = doc.create("Image", { id: "SettingsHeaderMogLogo" });
    const title = doc.create("Label", { id: "SettingsTitle" });
    const accent = doc.create("Label", { id: "SettingsTitleAccent" });
    const moglockLink = doc.create("Button", { id: "ModVersionLabelTop" });

    header.addChild(logo);
    header.addChild(title);
    header.addChild(accent);
    header.addChild(moglockLink);
    settingsWin.addChild(header);
    rootPanel.addChild(settingsWin);

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => setTimeout(cb, delaySec * 1000),
        CancelScheduled: (id) => clearTimeout(id),
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            if (parent && typeof parent.addChild === "function") {
                parent.addChild(p);
            }
            return p;
        },
        GetContextPanel: () => rootPanel,
        DispatchEvent: () => {},
        RegisterEventHandler: () => {},
        Localize: (s) => s
    };

    const ctx = {
        $: mockDollar,
        QOL: {},
        globalThis: null,
        window: {},
        MOD_CONFIG: Object.assign({
            LANGUAGE: 0,
            SETTINGS_THEME: 0
        }, initialConfig),
        FindRootPanel: () => rootPanel,
        currentTab: "HUD",
        SETTINGS_LOCALE_TEXT: {
            ru: {
                "Settings": "Настройки",
                "Crosshair": "Прицел",
                "LOCK": "ЛОК",
                "QOL": "КВОЛ"
            },
            fr: {
                "Settings": "Paramètres",
                "Crosshair": "Réticule"
            }
        }
    };
    ctx.globalThis = ctx;
    ctx.window = ctx;

    const themeScript = fs.readFileSync(
        path.join(__dirname, "../panorama/scripts/ui/theme.js"),
        "utf8"
    );
    vm.runInNewContext(themeScript, ctx);

    return { ctx, doc, rootPanel, settingsWin, header, logo, title, titleAccent: accent, moglockLink };
}

test("ui/theme: exports public API on QOL.ui.theme and globalThis", () => {
    const { ctx } = createTestEnvironment();
    assert.ok(ctx.QOL.ui.theme, "QOL.ui.theme must exist");
    assert.strictEqual(typeof ctx.QOL.ui.theme.GetSettingsLanguage, "function");
    assert.strictEqual(typeof ctx.QOL.ui.theme.GetSettingsTheme, "function");
    assert.strictEqual(typeof ctx.QOL.ui.theme.LocalizeSettingsText, "function");
    assert.strictEqual(typeof ctx.QOL.ui.theme.NormalizeLatinSettingsText, "function");
    assert.strictEqual(typeof ctx.QOL.ui.theme.ApplySettingsThemeClasses, "function");

    // Global compatibility checks
    assert.strictEqual(ctx.GetSettingsLanguage, ctx.QOL.ui.theme.GetSettingsLanguage);
    assert.strictEqual(ctx.LocalizeSettingsText, ctx.QOL.ui.theme.LocalizeSettingsText);
    assert.strictEqual(ctx.SETTINGS_LANGUAGE_RUSSIAN, 1);
    assert.strictEqual(ctx.SETTINGS_THEME_MUNFINS, 6);
});

test("ui/theme: GetSettingsLanguage and GetSettingsLanguageKey resolve correctly", () => {
    const { ctx } = createTestEnvironment({ LANGUAGE: 1 }); // Russian
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsLanguage(), 1);
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsLanguageKey(), "ru");
    assert.strictEqual(ctx.QOL.ui.theme.IsRussianSettingsLanguage(), true);
    assert.strictEqual(ctx.QOL.ui.theme.IsUkrainianSettingsLanguage(), false);

    ctx.MOD_CONFIG.LANGUAGE = 2; // Ukrainian
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsLanguageKey(), "uk");
    assert.strictEqual(ctx.QOL.ui.theme.IsUkrainianSettingsLanguage(), true);

    ctx.MOD_CONFIG.LANGUAGE = 7; // French
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsLanguageKey(), "fr");
    assert.strictEqual(ctx.QOL.ui.theme.IsFrenchSettingsLanguage(), true);

    ctx.MOD_CONFIG.LANGUAGE = 999; // Fallback English
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsLanguage(), 0);
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsLanguageKey(), "en");
});

test("ui/theme: GetSettingsTheme and GetSettingsThemeKey resolve correctly", () => {
    const { ctx } = createTestEnvironment({ SETTINGS_THEME: 3 }); // Emo
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsTheme(), 3);
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsThemeKey(), "emo");

    ctx.MOD_CONFIG.SETTINGS_THEME = 6; // Munfins
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsTheme(), 6);
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsThemeKey(), "munfins");

    ctx.MOD_CONFIG.SETTINGS_THEME = 0; // Default
    assert.strictEqual(ctx.QOL.ui.theme.GetSettingsThemeKey(), "default");
});

test("ui/theme: NormalizeLatinSettingsText strips accents and converts quotes", () => {
    const { ctx } = createTestEnvironment();
    const normalize = ctx.QOL.ui.theme.NormalizeLatinSettingsText;

    assert.strictEqual(normalize("Paramètres"), "Parametres");
    assert.strictEqual(normalize("Réticule"), "Reticule");
    assert.strictEqual(normalize("Dépôt Français"), "Depot Francais");
    assert.strictEqual(normalize("‘smart’ “quotes”"), "'smart' \"quotes\"");
    assert.strictEqual(normalize("dash—test"), "dash-test");
});

test("ui/theme: LocalizeSettingsText translates text using dictionaries", () => {
    const { ctx } = createTestEnvironment({ LANGUAGE: 1 }); // Russian
    const localize = ctx.QOL.ui.theme.LocalizeSettingsText;

    assert.strictEqual(localize("Settings"), "Настройки");
    assert.strictEqual(localize("Crosshair"), "Прицел");
    assert.strictEqual(localize("NonExistentKey"), "NonExistentKey");

    // English returns raw text
    ctx.MOD_CONFIG.LANGUAGE = 0;
    assert.strictEqual(localize("Settings"), "Settings");

    // Shipped translations retain their accents and punctuation.
    ctx.MOD_CONFIG.LANGUAGE = 7;
    assert.strictEqual(localize("Settings"), "Paramètres");
});

test("ui/theme: ApplySettingsThemeClasses applies theme class and logo", () => {
    const { ctx, settingsWin, logo, titleAccent, moglockLink } = createTestEnvironment({ SETTINGS_THEME: 6 }); // Munfins
    ctx.QOL.ui.theme.ApplySettingsThemeClasses(settingsWin);

    assert.strictEqual(settingsWin.BHasClass("SettingsThemeMunfins"), true);
    assert.strictEqual(settingsWin.BHasClass("SettingsThemeDefault"), false);
    assert.strictEqual(titleAccent.text, "Munfins");
    assert.strictEqual(moglockLink.style.visibility, "collapse");

    // Switch to Cream (1)
    ctx.MOD_CONFIG.SETTINGS_THEME = 1;
    ctx.QOL.ui.theme.ApplySettingsThemeClasses(settingsWin);
    assert.strictEqual(settingsWin.BHasClass("SettingsThemeCream"), true);
    assert.strictEqual(settingsWin.BHasClass("SettingsThemeMunfins"), false);
    assert.strictEqual(moglockLink.style.visibility, "visible");
});
