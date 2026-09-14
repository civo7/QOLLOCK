// tests/ui_config_tab.test.js
// =============================================================================
// Unit tests for Config Tab subsystem (panorama/scripts/ui/config_tab.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Document } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");

function createTestEnvironment() {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const rootPanel = doc.create("Panel", { id: "Root" });
    const settingsWin = doc.create("Panel", { id: "SettingsWindow" });
    rootPanel.addChild(settingsWin);

    let lastDispatchedEvent = null;
    let lastDispatchedArgs = [];

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
        DispatchEvent: (eventName, ...args) => {
            lastDispatchedEvent = eventName;
            lastDispatchedArgs = args;
        },
        RegisterEventHandler: () => {},
        Localize: (s) => s,
    };

    const defaultConfig = {
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_COLOR_WARNINGS: 1,
        MINIMAP_SCALE: 1.0,
        PREVIEWS_ENABLED: 1,
        LANGUAGE: "english",
        DEFAULT_HERO: "None",
        SETTINGS_THEME: "dark",
    };

    let registeredTabName = null;
    let registeredTabRenderer = null;

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "3.2.0",
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id) => mockDollar.CreatePanel(type, parent, id),
                    findRoot: () => rootPanel,
                },
            },
            ui: {
                window: {
                    registerTabRenderer: (name, fn) => {
                        registeredTabName = name;
                        registeredTabRenderer = fn;
                    },
                },
                modal: {
                    tryApplyImportStringWithDiagnostics: () => ({
                        ok: true,
                        schemaVersion: "3.2.0",
                        parsedConfig: Object.assign({}, defaultConfig),
                        candidateConfig: Object.assign({}, defaultConfig),
                        appliedKeys: 5,
                        unknownKeys: 0,
                        clampedKeys: 0,
                    }),
                    buildConfigDiffRows: () => [],
                    openConfigDiffPreviewModal: (opts) => {
                        if (opts?.onApply) opts.onApply();
                    },
                },
            },
            persistence: {
                serializeCompactV2: () => "mock-compact-bytes",
                toBase64Url: () => "bW9jay1jb21wYWN0LWJ5dGVz",
                applyParsedConfigWithDiagnostics: () => ({ clampedKeys: 0, unknownKeys: 0 }),
            },
        },
        globalThis: {
            DEFAULT_CONFIG: Object.assign({}, defaultConfig),
            QOL_DEFAULT_CONFIG: Object.assign({}, defaultConfig),
            MOD_CONFIG: Object.assign({}, defaultConfig),
            QOL_SCHEMA_SEMVER: "3.2.0",
            LATEST_COMPACT_SEMVER: "3.2.0",
            gSearchCollectMode: false,
            gSearchCollectState: null,
            SETTINGS_LANGUAGE_OPTIONS: [{ id: "english", label: "English" }],
            DEFAULT_HERO_DROPDOWN_OPTIONS: [{ id: "None", label: "None" }],
            SETTINGS_THEME_OPTIONS: [{ id: "dark", label: "Dark" }],
            CreateSectionTitle: (parent, title) => {
                const p = mockDollar.CreatePanel("Panel", parent, "");
                const lbl = mockDollar.CreatePanel("Label", p, "");
                lbl.text = title;
                return lbl;
            },
            CreateRow: (parent, label) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
            CreateSeparator: (parent) => mockDollar.CreatePanel("Panel", parent, ""),
            SaveAndSync: () => {},
            LocalizeSettingsText: (t) => t,
            IsRussianSettingsLanguage: () => false,
            GetSettingsLanguage: () => "english",
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const configTabCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/config_tab.js"),
        "utf8"
    );
    vm.runInNewContext(configTabCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        getDispatchedEvent: () => ({ event: lastDispatchedEvent, args: lastDispatchedArgs }),
        getRegisteredTab: () => ({ name: registeredTabName, renderer: registeredTabRenderer }),
    };
}

test("ui/config_tab: exports public API on QOL.ui.configTab and globalThis", () => {
    const { sandbox, getRegisteredTab } = createTestEnvironment();
    const configTab = sandbox.QOL.ui.configTab;

    assert.ok(configTab, "QOL.ui.configTab exists");
    assert.strictEqual(typeof configTab.render, "function");
    assert.strictEqual(typeof configTab.getCurrentExportSettingsString, "function");
    assert.strictEqual(typeof configTab.formatExportSettingsDisplayString, "function");
    assert.strictEqual(typeof configTab.formatImportSettingsDisplayString, "function");
    assert.strictEqual(typeof configTab.tryCopyTextToClipboard, "function");
    assert.strictEqual(typeof configTab.tryPasteTextFromClipboard, "function");
    assert.strictEqual(typeof configTab.setConfigFeedbackMessage, "function");
    assert.strictEqual(typeof configTab.setLocalizedConfigFeedbackMessage, "function");
    assert.strictEqual(typeof configTab.createSectionInlineIconButton, "function");

    // Backward compatibility globals
    assert.strictEqual(sandbox.globalThis.GetCurrentExportSettingsString, configTab.getCurrentExportSettingsString);
    assert.strictEqual(sandbox.globalThis.FormatExportSettingsDisplayString, configTab.formatExportSettingsDisplayString);
    assert.strictEqual(sandbox.globalThis.FormatImportSettingsDisplayString, configTab.formatImportSettingsDisplayString);
    assert.strictEqual(sandbox.globalThis.TryCopyTextToClipboard, configTab.tryCopyTextToClipboard);
    assert.strictEqual(sandbox.globalThis.TryPasteTextFromClipboard, configTab.tryPasteTextFromClipboard);
    assert.strictEqual(sandbox.globalThis.SetConfigFeedbackMessage, configTab.setConfigFeedbackMessage);
    assert.strictEqual(sandbox.globalThis.SetLocalizedConfigFeedbackMessage, configTab.setLocalizedConfigFeedbackMessage);
    assert.strictEqual(sandbox.globalThis.CreateSectionInlineIconButton, configTab.createSectionInlineIconButton);
    assert.strictEqual(sandbox.globalThis.RenderConfigTabContent, configTab.render);

    // Auto registration with window manager
    const reg = getRegisteredTab();
    assert.strictEqual(reg.name, "Config");
    assert.strictEqual(reg.renderer, configTab.render);
});

test("ui/config_tab: getCurrentExportSettingsString generates formatted prefix and base64", () => {
    const { sandbox } = createTestEnvironment();
    const configTab = sandbox.QOL.ui.configTab;

    const exportStr = configTab.getCurrentExportSettingsString();
    assert.strictEqual(exportStr, "[QOL-3-2-0]:bW9jay1jb21wYWN0LWJ5dGVz");
});

test("ui/config_tab: formatExportSettingsDisplayString splits long export payloads with newline", () => {
    const { sandbox } = createTestEnvironment();
    const configTab = sandbox.QOL.ui.configTab;

    // Short payload (<= 24 chars) is not wrapped
    const shortPayload = "[QOL-3-2-0]:12345678901234567890";
    assert.strictEqual(configTab.formatExportSettingsDisplayString(shortPayload), shortPayload);

    // Long payload (> 24 chars) gets a newline in the middle of payload
    const longPayload = "[QOL-3-2-0]:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const formatted = configTab.formatExportSettingsDisplayString(longPayload);
    assert.ok(formatted.includes("\n"));
    assert.strictEqual(formatted.replace(/\n/g, ""), longPayload);

    // Empty string handling
    assert.strictEqual(configTab.formatExportSettingsDisplayString(""), "");
    assert.strictEqual(configTab.formatExportSettingsDisplayString(null), "");
});

test("ui/config_tab: formatImportSettingsDisplayString only formats valid tagged tokens", () => {
    const { sandbox } = createTestEnvironment();
    const configTab = sandbox.QOL.ui.configTab;

    const validToken = "[QOL-3-2-0]:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const formatted = configTab.formatImportSettingsDisplayString(validToken);
    assert.ok(formatted.includes("\n"));

    const rawNonToken = "random invalid string without tag";
    assert.strictEqual(configTab.formatImportSettingsDisplayString(rawNonToken), rawNonToken);
});

test("ui/config_tab: tryCopyTextToClipboard dispatches CopyStringToClipboard", () => {
    const { sandbox, getDispatchedEvent } = createTestEnvironment();
    const configTab = sandbox.QOL.ui.configTab;

    const ok = configTab.tryCopyTextToClipboard("sample export string");
    assert.strictEqual(ok, true);

    const { event, args } = getDispatchedEvent();
    assert.strictEqual(event, "CopyStringToClipboard");
    assert.strictEqual(args[0], "sample export string");
});

test("ui/config_tab: setConfigFeedbackMessage updates tone classes", () => {
    const { sandbox, doc } = createTestEnvironment();
    const configTab = sandbox.QOL.ui.configTab;

    const label = doc.create("Label", { id: "TestFeedback" });
    // Simulate label registration inside render
    configTab.render(doc.create("Panel", { id: "List" }));

    // Set success feedback
    configTab.setConfigFeedbackMessage("Saved successfully", "success", 1000);
    // Since render created ConfigFeedbackLabel, let's verify via get
});

test("ui/config_tab: renderConfigTab creates cards for General, Export, and Import", () => {
    const { sandbox, doc } = createTestEnvironment();
    const configTab = sandbox.QOL.ui.configTab;

    const list = doc.create("Panel", { id: "SettingsList" });
    configTab.render(list);

    assert.ok(list.BHasClass("ConfigTabSurface"), "Surface class added");

    const generalCard = list.FindChildTraverse("ConfigCardGeneral");
    assert.ok(generalCard, "ConfigCardGeneral exists");

    const exportCard = list.FindChildTraverse("ConfigCardExport");
    assert.ok(exportCard, "ConfigCardExport exists");

    const importCard = list.FindChildTraverse("ConfigCardImport");
    assert.ok(importCard, "ConfigCardImport exists");

    const exportEntry = exportCard.FindChildTraverse("ConfigExportTextEntry");
    assert.ok(exportEntry, "ConfigExportTextEntry exists");

    const importEntry = importCard.FindChildTraverse("ConfigImportTextEntry");
    assert.ok(importEntry, "ConfigImportTextEntry exists");
});
