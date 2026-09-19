// tests/ui_presets.test.js
// =============================================================================
// Unit tests for Presets subsystem (panorama/scripts/ui/presets.js)
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
        Localize: (s) => s,
    };

    const defaultConfig = {
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_COLOR_WARNINGS: 1,
        MINIMAP_SCALE: 1.0,
        DRAG_ENABLED: 0,
        PREVIEWS_ENABLED: 1,
        ACTIVE_PRESET_NAME: "",
    };

    const presets = {
        Clean: {
            ENABLE_UNSPENT_SOULS: 0,
            ENABLE_COLOR_WARNINGS: 0,
            MINIMAP_SCALE: 0.9,
        },
        Bread: {
            ENABLE_UNSPENT_SOULS: 1,
            ENABLE_COLOR_WARNINGS: 1,
            MINIMAP_SCALE: 1.1,
        },
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "4.0.0",
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id) => mockDollar.CreatePanel(type, parent, id),
                    findRoot: () => rootPanel,
                },
            },
            ui: {
                window: {
                    isOpen: () => settingsWin.BHasClass("Visible"),
                    registerTabRenderer: () => {},
                },
            },
        },
        globalThis: {
            DEFAULT_CONFIG: Object.assign({}, defaultConfig),
            QOL_DEFAULT_CONFIG: Object.assign({}, defaultConfig),
            PRESETS: presets,
            MOD_CONFIG: Object.assign({}, defaultConfig),
            currentTab: "Presets",
            currentSearchQuery: "",
            SaveAndSync: () => {},
            GetSettingsLanguage: () => "english",
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const presetsCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/presets.js"),
        "utf8"
    );
    require("./load_ui_helpers")(sandbox);
    vm.runInNewContext(presetsCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        settingsWin,
    };
}

test("presets: exports all required functions on Q.ui.presets", () => {
    const env = createTestEnvironment();
    const p = env.sandbox.QOL.ui.presets;

    assert.ok(p, "Q.ui.presets should be defined");
    assert.strictEqual(typeof p.applyPresetConfig, "function");
    assert.strictEqual(typeof p.applyPresetByName, "function");
    assert.strictEqual(typeof p.buildCommunityPresetEntries, "function");
    assert.strictEqual(typeof p.resolvePresetConfigByName, "function");
    assert.strictEqual(typeof p.buildPresetCandidateConfigByName, "function");
    assert.strictEqual(typeof p.doesCurrentConfigMatchPreset, "function");
    assert.strictEqual(typeof p.refreshActivePresetConfigMarkerBeforeSave, "function");
    assert.strictEqual(typeof p.refreshActivePresetHighlight, "function");
    assert.strictEqual(typeof p.queueActivePresetHighlightRefresh, "function");
    assert.strictEqual(typeof p.startPresetHighlightPolling, "function");
    assert.strictEqual(typeof p.stopPresetHighlightPolling, "function");
    assert.strictEqual(typeof p.updatePresetHighlightPollingState, "function");
    assert.strictEqual(typeof p.shouldRunPresetHighlightPolling, "function");
    assert.strictEqual(typeof p.resetPresetButtonRegistry, "function");
    assert.strictEqual(typeof p.registerPresetButton, "function");
    assert.strictEqual(typeof p.showPresetApplySuccess, "function");
    assert.strictEqual(typeof p.createPresetGrid, "function");
    assert.strictEqual(typeof p.renderPresetsTab, "function");
});

test("presets: backward compatibility globals are registered", () => {
    const env = createTestEnvironment();
    const gt = env.sandbox.globalThis;

    assert.strictEqual(typeof gt.ApplyPresetConfig, "function");
    assert.strictEqual(typeof gt.ApplyPresetByName, "function");
    assert.strictEqual(typeof gt.BuildCommunityPresetEntries, "function");
    assert.strictEqual(typeof gt.ResolvePresetConfigByName, "function");
    assert.strictEqual(typeof gt.BuildPresetCandidateConfigByName, "function");
    assert.strictEqual(typeof gt.DoesCurrentConfigMatchPreset, "function");
    assert.strictEqual(typeof gt.RefreshActivePresetConfigMarkerBeforeSave, "function");
    assert.strictEqual(typeof gt.RefreshActivePresetHighlight, "function");
    assert.strictEqual(typeof gt.QueueActivePresetHighlightRefresh, "function");
    assert.strictEqual(typeof gt.StartPresetHighlightPolling, "function");
    assert.strictEqual(typeof gt.StopPresetHighlightPolling, "function");
    assert.strictEqual(typeof gt.UpdatePresetHighlightPollingState, "function");
    assert.strictEqual(typeof gt.ResetPresetButtonRegistry, "function");
    assert.strictEqual(typeof gt.RegisterPresetButton, "function");
    assert.strictEqual(typeof gt.SetExplicitActivePresetButton, "function");
    assert.strictEqual(typeof gt.ShowPresetApplySuccess, "function");
    assert.strictEqual(typeof gt.CreatePresetGrid, "function");
});

test("presets: buildCommunityPresetEntries returns 90 entries", () => {
    const env = createTestEnvironment();
    const entries = env.sandbox.QOL.ui.presets.buildCommunityPresetEntries();

    assert.ok(Array.isArray(entries), "Entries should be an array");
    assert.strictEqual(entries.length, 90, "Should contain exactly 90 entries");
    assert.ok(entries.some(e => e.preset === "Bread"), "Should contain Bread preset");
    assert.ok(entries.some(e => e.label === "Available" && e.available === false), "Should contain Available placeholders");
});

test("presets: resolvePresetConfigByName merges default with preset", () => {
    const env = createTestEnvironment();
    const p = env.sandbox.QOL.ui.presets;

    const defaultResolved = p.resolvePresetConfigByName("Default");
    assert.strictEqual(defaultResolved.ENABLE_UNSPENT_SOULS, 1);
    assert.strictEqual(defaultResolved.MINIMAP_SCALE, 1.0);

    const cleanResolved = p.resolvePresetConfigByName("Clean");
    assert.strictEqual(cleanResolved.ENABLE_UNSPENT_SOULS, 0);
    assert.strictEqual(cleanResolved.ENABLE_COLOR_WARNINGS, 0);
    assert.strictEqual(cleanResolved.MINIMAP_SCALE, 0.9);

    const unknownResolved = p.resolvePresetConfigByName("NonExistent");
    assert.strictEqual(unknownResolved, null);
});

test("presets: applyPresetByName applies preset and preserves UI settings", () => {
    const env = createTestEnvironment();
    const p = env.sandbox.QOL.ui.presets;
    const modConfig = env.sandbox.globalThis.MOD_CONFIG;

    modConfig.DRAG_ENABLED = 1;
    modConfig.PREVIEWS_ENABLED = 0;
    modConfig.ENABLE_UPDATE_CHECKER = 0;

    const ok = p.applyPresetByName("Clean");
    assert.strictEqual(ok, true);
    assert.strictEqual(modConfig.ENABLE_UNSPENT_SOULS, 0);
    assert.strictEqual(modConfig.MINIMAP_SCALE, 0.9);
    // UI layout preferences preserved
    assert.strictEqual(modConfig.DRAG_ENABLED, 1);
    assert.strictEqual(modConfig.PREVIEWS_ENABLED, 0);
    assert.strictEqual(modConfig.ENABLE_UPDATE_CHECKER, 0);
});

test("presets: doesCurrentConfigMatchPreset accurately matches config", () => {
    const env = createTestEnvironment();
    const p = env.sandbox.QOL.ui.presets;
    const modConfig = env.sandbox.globalThis.MOD_CONFIG;

    p.applyPresetByName("Clean");
    assert.strictEqual(p.doesCurrentConfigMatchPreset("Clean"), true);
    assert.strictEqual(p.doesCurrentConfigMatchPreset("Bread"), false);

    // Changing one functional key breaks match
    modConfig.ENABLE_UNSPENT_SOULS = 1;
    assert.strictEqual(p.doesCurrentConfigMatchPreset("Clean"), false);

    // Changing UI layout settings does NOT break match
    modConfig.ENABLE_UNSPENT_SOULS = 0;
    modConfig.DRAG_ENABLED = 1;
    modConfig.PREVIEWS_ENABLED = 0;
    assert.strictEqual(p.doesCurrentConfigMatchPreset("Clean"), true);
});

test("presets: renderPresetsTab builds preset grid and controls", () => {
    const env = createTestEnvironment();
    const p = env.sandbox.QOL.ui.presets;
    const container = env.doc.create("Panel", { id: "ContentList" });

    p.renderPresetsTab(container);

    const titles = container.FindChildrenWithClassTraverse("SectionTitle");
    const grids = container.FindChildrenWithClassTraverse("PresetCategoryGrid");
    const hintRow = container.FindChildTraverse("CommunityPresetHintRow");

    assert.ok(titles.length > 0, "Section title should be rendered");
    assert.ok(grids.length > 0, "Preset grid should be rendered");
    assert.ok(hintRow, "Community hint row should be rendered");
});
