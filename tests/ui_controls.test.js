// tests/ui_controls.test.js
// =============================================================================
// Unit tests for Controls & Row Builder subsystem (panorama/scripts/ui/controls.js)
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
    const list = doc.create("Panel", { id: "SettingsList" });
    settingsWin.addChild(list);
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
        QOL: {
            tooltip: {
                getSettingDescriptionOverride: (_c, _l, d) => d,
                getCurrentCategoryKey: () => "",
                buildPerfImpactLine: () => ({ tier: "none", line: "" }),
                getSettingCreatedBy: () => "TestAuthor",
                hasMeaningfulContent: () => true,
                maxPerfTier: (a) => a,
                buildPerfLineForTier: () => "",
                hideTextTooltip: () => {},
                cancelHide: () => {},
                showRowTooltip: () => {},
                hideTooltipDeferred: () => {},
                bindSectionPerfTooltip: () => {}
            },
            preview: {
                showForConfigId: () => {},
                hideAll: () => {}
            },
            arcade: {
                openMinesweeper: () => {},
                openFlappy: () => {},
                openAimTrainer: () => {},
                openTrainTracking: () => {},
                openWhackRem: () => {},
                openBlackjack: () => {}
            }
        },
        globalThis: null,
        window: {},
        MOD_CONFIG: Object.assign({
            TEST_TOGGLE: 0,
            TEST_SLIDER: 50,
            TEST_FLOAT_SLIDER: 0.5,
            TEST_SECONDARY: 0,
            TEST_ENUM: 1,
            HEALTHBAR_TYPE: 0,
            DEFAULT_HERO: "hero_inferno",
            LANGUAGE: 0,
            SETTINGS_THEME: 0
        }, initialConfig),
        DEFAULT_CONFIG: {
            TEST_TOGGLE: 0,
            TEST_SLIDER: 50,
            TEST_FLOAT_SLIDER: 0.5,
            TEST_SECONDARY: 0,
            TEST_ENUM: 1,
            HEALTHBAR_TYPE: 0,
            DEFAULT_HERO: "hero_inferno",
            LANGUAGE: 0,
            SETTINGS_THEME: 0
        },
        PRESETS: {},
        currentTab: "Healthbar",
        gCurrentSettingsSectionTitle: "",
        FindRootPanel: () => rootPanel,
        SaveAndSync: () => {},
        MarkConfigDirty: () => {},
        LocalizeSettingsText: (s) => String(s || ""),
        SetConfigFeedbackMessage: () => {},
        RequestSettingsListRefresh: () => {},
        RequestSettingsListSoftRefresh: () => {},
        RegisterSettingsListRowSync: () => {},
        RunConsoleCommandBestEffort: () => true,
        ResolveAnnouncerEventForVolume: (e) => e,
        PlayAnnouncerPreviewSound: () => {},
        PlayAnnouncerBridgeVariantPreviewSound: () => {},
        PublishPaletteColorBridge: () => {},
        IsRussianSettingsLanguage: () => false,
        WarnLog: () => {}
    };

    ctx.globalThis = ctx;
    vm.createContext(ctx);

    const controlsScriptPath = path.resolve(__dirname, "../panorama/scripts/ui/controls.js");
    const code = fs.readFileSync(controlsScriptPath, "utf8");
    vm.runInContext(code, ctx, { filename: "controls.js" });

    return { ctx, doc, rootPanel, list };
}

test("ui/controls: exports public API on QOL.ui.controls and globalThis", () => {
    const { ctx } = createTestEnvironment();
    assert.ok(ctx.QOL.ui.controls);
    const api = ctx.QOL.ui.controls;

    assert.strictEqual(typeof api.createSliderRow, "function");
    assert.strictEqual(typeof api.createSeparator, "function");
    assert.strictEqual(typeof api.createSectionTitle, "function");
    assert.strictEqual(typeof api.createAnimatedInlineToggleSection, "function");
    assert.strictEqual(typeof api.createCollapsibleSubSection, "function");
    assert.strictEqual(typeof api.createAnimatedInlineEnumSection, "function");
    assert.strictEqual(typeof api.refreshEnumSections, "function");
    assert.strictEqual(typeof api.createRow, "function");
    assert.strictEqual(typeof api.createInlineSecondaryCheckboxToggleRow, "function");
    assert.strictEqual(typeof api.createSectionResetButton, "function");
    assert.strictEqual(typeof api.isConfigKeyChangedFromDefault, "function");
    assert.strictEqual(typeof api.normalizeComparableConfigValue, "function");
    assert.ok(api.SLIDER_SHAPES && typeof api.SLIDER_SHAPES === "object");

    // Check globals
    assert.strictEqual(ctx.CreateRow, api.createRow);
    assert.strictEqual(ctx.CreateSliderRow, api.createSliderRow);
    assert.strictEqual(ctx.CreateSectionTitle, api.createSectionTitle);
    assert.strictEqual(ctx.CreateSeparator, api.createSeparator);
    assert.strictEqual(ctx.CreateAnimatedInlineToggleSection, api.createAnimatedInlineToggleSection);
    assert.strictEqual(ctx.CreateCollapsibleSubSection, api.createCollapsibleSubSection);
    assert.strictEqual(ctx.CreateAnimatedInlineEnumSection, api.createAnimatedInlineEnumSection);
    assert.strictEqual(ctx.RefreshEnumSections, api.refreshEnumSections);
    assert.strictEqual(ctx.CreateInlineSecondaryCheckboxToggleRow, api.createInlineSecondaryCheckboxToggleRow);
});

test("ui/controls: SLIDER_SHAPES has valid min/max/step definitions", () => {
    const { ctx } = createTestEnvironment();
    const shapes = ctx.QOL.ui.controls.SLIDER_SHAPES;
    assert.ok(shapes.opacity);
    assert.strictEqual(shapes.opacity.min, 0);
    assert.strictEqual(shapes.opacity.max, 1);
    assert.strictEqual(shapes.opacity.step, 0.05);

    assert.ok(shapes.scale_0_5_1_5);
    assert.strictEqual(shapes.scale_0_5_1_5.min, 0.5);
    assert.strictEqual(shapes.scale_0_5_1_5.max, 1.5);
    assert.strictEqual(shapes.scale_0_5_1_5.step, 0.05);

    assert.ok(shapes.size_50_200);
    assert.strictEqual(shapes.size_50_200.min, 50);
    assert.strictEqual(shapes.size_50_200.max, 200);
    assert.strictEqual(shapes.size_50_200.step, 1);
});

test("ui/controls: createSeparator constructs RowSeparator panel", () => {
    const { ctx, list } = createTestEnvironment();
    const sep = ctx.CreateSeparator(list);
    assert.ok(sep);
    assert.ok(sep.BHasClass("RowSeparator"));
});

test("ui/controls: createSectionTitle constructs SectionTitleRow and resets", () => {
    const { ctx, list } = createTestEnvironment();
    const titleLabel = ctx.CreateSectionTitle(list, "General Settings");
    assert.ok(titleLabel);
    assert.strictEqual(titleLabel.text, "General Settings");
    assert.ok(titleLabel.BHasClass("SectionTitle"));
    assert.strictEqual(ctx.gCurrentSettingsSectionTitle, "General Settings");
});

test("ui/controls: createAnimatedInlineToggleSection toggles body and classes", () => {
    const { ctx, list } = createTestEnvironment({ TEST_TOGGLE: 1 });
    let builtRows = false;
    const body = ctx.CreateAnimatedInlineToggleSection(list, "Advanced Features", "TEST_TOGGLE", "Enable advanced mode", (bodyPanel) => {
        builtRows = true;
        assert.ok(bodyPanel);
    });
    assert.ok(body);
    assert.ok(builtRows);
    assert.ok(!body.BHasClass("Collapsed"));
});

test("ui/controls: createCollapsibleSubSection creates expandable subsection", () => {
    const { ctx, list } = createTestEnvironment();
    let builtChild = false;
    const body = ctx.CreateCollapsibleSubSection(list, "Extra Options", (bodyPanel) => {
        builtChild = true;
    });
    assert.ok(body);
    assert.ok(builtChild);
    assert.ok(body.BHasClass("Collapsed"));
});

test("ui/controls: createAnimatedInlineEnumSection responds to enum refresh", () => {
    const { ctx, list } = createTestEnvironment({ TEST_ENUM: 2 });
    let built = false;
    const body = ctx.CreateAnimatedInlineEnumSection(list, "Enum Section", "TEST_ENUM", 2, () => {
        built = true;
    });
    assert.ok(body);
    assert.ok(built);
    assert.ok(!body.BHasClass("Collapsed"));

    // Change enum value and refresh
    ctx.MOD_CONFIG.TEST_ENUM = 1;
    ctx.RefreshEnumSections();
    assert.ok(body.BHasClass("Hiding") || body.BHasClass("Collapsed"));
});

test("ui/controls: isConfigKeyChangedFromDefault and applyResetForConfigKeys handle values", () => {
    const { ctx } = createTestEnvironment({ TEST_SLIDER: 80 });
    assert.strictEqual(ctx.QOL.ui.controls.isConfigKeyChangedFromDefault("TEST_SLIDER"), true);
    assert.strictEqual(ctx.QOL.ui.controls.isConfigKeyChangedFromDefault("TEST_TOGGLE"), false);

    const changedCount = ctx.QOL.ui.controls.applyResetForConfigKeys(["TEST_SLIDER"]);
    assert.strictEqual(changedCount, 1);
    assert.strictEqual(ctx.MOD_CONFIG.TEST_SLIDER, 50);
    assert.strictEqual(ctx.QOL.ui.controls.isConfigKeyChangedFromDefault("TEST_SLIDER"), false);
});

test("ui/controls: createRow builds toggle row with change badge and reset button", () => {
    const { ctx, list } = createTestEnvironment({ TEST_TOGGLE: 1 });
    const row = ctx.CreateRow(list, "Enable Feature", "TEST_TOGGLE", "toggle", null, null, null, null, "Tooltip description");
    assert.ok(row);
    assert.ok(row.BHasClass("SettingRow"));
    assert.ok(row.BHasClass("RowTypeToggle"));
    assert.ok(row.BHasClass("HasChanged"));
});

test("ui/controls: createSliderRow constructs slider with shape min/max", () => {
    const { ctx, list } = createTestEnvironment({ TEST_SLIDER: 50 });
    const row = ctx.CreateSliderRow(list, "Custom Size", "TEST_SLIDER", "size_50_200", "Size description");
    assert.ok(row);
    assert.ok(row.BHasClass("SettingRow"));
    assert.ok(row.BHasClass("RowTypeSlider"));
});

test("ui/controls: createInlineSecondaryCheckboxToggleRow constructs main toggle and secondary checkbox", () => {
    const { ctx, list } = createTestEnvironment({ TEST_TOGGLE: 1, TEST_SECONDARY: 1 });
    const row = ctx.CreateInlineSecondaryCheckboxToggleRow(
        list,
        "Master Toggle",
        "TEST_TOGGLE",
        "Sub Checkbox",
        "TEST_SECONDARY",
        "Master description",
        "Sub description"
    );
    assert.ok(row);
    assert.ok(row.BHasClass("SettingRow"));
    assert.ok(row.BHasClass("InlineSecondaryCheckboxRow"));
});
