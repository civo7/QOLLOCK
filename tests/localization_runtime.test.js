"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const { scanSettings } = require("../scripts/settings_localization_audit");
const { loadLocaleMaps } = require("../scripts/locales_helper");
const { isIntentionalName } = require("../scripts/translation_exceptions");
function labels(panel) { return [panel.paneltype === "Label" ? panel.text : "", ...panel.Children().flatMap(labels)].filter(Boolean); }

test("settings inventory covers Shop, Customize and delayed keys with English/Russian ownership", () => {
    const { seen, tabs, contexts } = scanSettings();
    const { maps } = loadLocaleMaps();
    assert.ok(tabs.includes("Shop"));
    assert.ok(tabs.includes("Customize"));
    assert.ok(tabs.includes("Dev"));
    for (const key of seen.filter(key => !isIntentionalName(key))) {
        assert.ok(Object.hasOwn(maps.en, key), key);
        assert.ok(maps.ru[key]?.trim(), key);
    }
    assert.equal(Object.keys(contexts).length, Object.keys(maps.en).length);
    assert.ok(contexts["Recent Purchases"].breadcrumb.includes("Shop"));
    assert.ok(seen.includes("Benchmarking: {seconds}s left..."));
});

test("Dev actions display real English, Russian and incomplete-language fallback including dynamic errors", () => {
    const { global: g, list, em } = load();
    g.QOL.ui.window.setOpen(true);
    for (const [language, title, button, idle] of [
        [0, "Panel Tree Dump", "Dump Tree", "Idle"],
        [1, "Снимок дерева панелей", "Снять дерево", "Ожидание"],
        [13, "Panel Tree Dump", "Dump Tree", "Idle"]
    ]) {
        g.MOD_CONFIG.LANGUAGE = language;
        g.QOL.ui.window.renderTab("Dev", list);
        const row = em.FindChildTraverse("DevTreeDumpRow");
        assert.ok(row, "real Dev panel dump row");
        const text = labels(row);
        assert.ok(text.includes(title), text.join(" | "));
        assert.ok(text.includes(button));
        assert.ok(text.includes(idle));
    }
    g.MOD_CONFIG.LANGUAGE = 1;
    // No HUD under this detached settings root, so observe a localized failure.
    const standalone = g.$.CreatePanel("Panel", null, "DetachedContext");
    const status = g.$.CreatePanel("Label", standalone, "Status");
    const original = g.$.GetContextPanel;
    g.$.GetContextPanel = () => standalone;
    g.QOL.ui.devTab.requestPanelTreeDump(status);
    assert.equal(status.text, "Панель HUD не найдена");
    g.$.GetContextPanel = original;
});

test("display preserves Unicode, blank fallback, named substitutions and literal parameter braces", () => {
    const { global: g } = load();
    const theme = g.QOL.ui.theme;
    g.MOD_CONFIG.LANGUAGE = 14;
    assert.equal(theme.LocalizeSettingsText("Active Item Horizontal Offset", true), "Aktif Eşya Yatay Kaydırma");
    g.MOD_CONFIG.LANGUAGE = 1;
    assert.equal(theme.FormatSettingsText("Changes: {count}", { count: 3 }), "Изменений: 3");
    assert.equal(theme.FormatSettingsText("Audit not started: {error}", { error: "{count}" }), "Проверка не началась: {count}");
    assert.equal(theme.FormatSettingsText("Changes: {count}", {}), "Изменений: {count}");
    const old = g.SETTINGS_LOCALE_TEXT.ru.Settings;
    g.SETTINGS_LOCALE_TEXT.ru.Settings = " ";
    assert.equal(theme.LocalizeSettingsText("Settings", true), "Settings");
    g.SETTINGS_LOCALE_TEXT.ru.Settings = old;
});
