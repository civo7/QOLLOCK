"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Document } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");
const loadUiHelpers = require("./load_ui_helpers.js");

function createPreviewTestEnvironment(configOverrides = {}) {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const rootPanel = doc.create("Panel", { id: "Root" });
    const settingsWin = doc.create("Panel", { id: "SettingsWindow" });
    settingsWin.AddClass("Visible");
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

    let saveAndSyncCalls = 0;

    const ctx = {
        $: mockDollar,
        globalThis: null,
        window: {},
        QOL: {
            import: (names) => {
                const out = {};
                if (Array.isArray(names)) {
                    for (const name of names) {
                        if (name === "utils") out.utils = { WarnLog: () => {} };
                        if (name === "state") out.state = {};
                    }
                }
                return out;
            },
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
            arcade: {
                openMinesweeper: () => {},
                openFlappy: () => {},
                openAimTrainer: () => {},
                openTrainTracking: () => {},
                openWhackRem: () => {},
                openBlackjack: () => {}
            }
        },
        MOD_CONFIG: Object.assign({
            PREVIEWS_ENABLED: 1,
            ENABLE_ZIP_BOOST: 1,
            ZIP_BOOST_X_OFFSET: 10,
            ZIP_BOOST_Y_OFFSET: 20,
            ZIP_BOOST_SCALE: 110,
            ENABLE_COMPASS: 1,
            COMPASS_SCALE: 100,
            COMPASS_STRETCH_X: 100,
            COMPASS_STRETCH_Y: 100,
            COMPASS_X_OFFSET: 0,
            COMPASS_Y_OFFSET: 120,
            ENABLE_COMPASS_SPEED: 1,
            COMPASS_SPEED_X_OFFSET: 15,
            COMPASS_SPEED_Y_OFFSET: 25,
            ENABLE_CROSSHAIR_STATS: 1,
            CROSSHAIR_STATS_X_OFFSET: 5,
            CROSSHAIR_STATS_Y_OFFSET: 10,
            CROSSHAIR_STATS_SCALE: 100,
            ENABLE_UNSECURED_SOUL_TIMER: 1,
            UNSECURED_SOUL_TIMER_X_OFFSET: 0,
            UNSECURED_SOUL_TIMER_Y_OFFSET: 0,
            UNSECURED_SOUL_TIMER_SCALE: 100,
            ENABLE_KEYBOARD_OVERLAY: 1,
            KEYBOARD_OVERLAY_X_OFFSET: 0,
            KEYBOARD_OVERLAY_Y_OFFSET: 0,
            KEYBOARD_OVERLAY_SCALE: 100,
            PASSIVE_COOLDOWN_SIZE: 40,
            PASSIVE_COOLDOWN_X_OFFSET: 0,
            PASSIVE_COOLDOWN_Y_OFFSET: 0,
            HEALTHBAR_TYPE: 0,
            DEFAULT_HERO: "hero_inferno",
            LANGUAGE: 0,
            SETTINGS_THEME: 0
        }, configOverrides),
        DEFAULT_CONFIG: {
            PREVIEWS_ENABLED: 1,
            ENABLE_ZIP_BOOST: 1,
            ZIP_BOOST_X_OFFSET: 0,
            ZIP_BOOST_Y_OFFSET: 0,
            ZIP_BOOST_SCALE: 100,
            ENABLE_COMPASS: 1,
            COMPASS_SCALE: 100,
            COMPASS_STRETCH_X: 100,
            COMPASS_STRETCH_Y: 100,
            COMPASS_X_OFFSET: 0,
            COMPASS_Y_OFFSET: 120,
            ENABLE_COMPASS_SPEED: 1,
            COMPASS_SPEED_X_OFFSET: 0,
            COMPASS_SPEED_Y_OFFSET: 0,
            ENABLE_CROSSHAIR_STATS: 1,
            CROSSHAIR_STATS_X_OFFSET: 0,
            CROSSHAIR_STATS_Y_OFFSET: 0,
            CROSSHAIR_STATS_SCALE: 100,
            ENABLE_UNSECURED_SOUL_TIMER: 1,
            UNSECURED_SOUL_TIMER_X_OFFSET: 0,
            UNSECURED_SOUL_TIMER_Y_OFFSET: 0,
            UNSECURED_SOUL_TIMER_SCALE: 100,
            ENABLE_KEYBOARD_OVERLAY: 1,
            KEYBOARD_OVERLAY_X_OFFSET: 0,
            KEYBOARD_OVERLAY_Y_OFFSET: 0,
            KEYBOARD_OVERLAY_SCALE: 100,
            PASSIVE_COOLDOWN_SIZE: 40,
            PASSIVE_COOLDOWN_X_OFFSET: 0,
            PASSIVE_COOLDOWN_Y_OFFSET: 0,
            HEALTHBAR_TYPE: 0,
            DEFAULT_HERO: "hero_inferno",
            LANGUAGE: 0,
            SETTINGS_THEME: 0
        },
        PRESETS: {},
        currentTab: "Gameplay",
        gCurrentSettingsSectionTitle: "",
        QOL_UTILS: {
            WarnLog: () => {}
        },
        LocalizeSettingsText: (t) => t,
        SaveAndSync: () => {
            saveAndSyncCalls++;
        },
        MarkConfigDirty: () => {},
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
    loadUiHelpers(ctx);

    const previewsSrc = fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/ql_settings_previews.js"), "utf8");
    vm.runInNewContext(previewsSrc, ctx, { filename: "ql_settings_previews.js" });

    const controlsSrc = fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/ui/controls.js"), "utf8");
    vm.runInNewContext(controlsSrc, ctx, { filename: "controls.js" });

    return {
        ctx,
        rootPanel,
        settingsWin,
        list,
        doc,
        getSaveAndSyncCalls: () => saveAndSyncCalls
    };
}

test("QOL.preview subsystem exports and initializes", () => {
    const { ctx } = createPreviewTestEnvironment();
    assert.ok(ctx.QOL.preview, "QOL.preview should be defined");
    assert.strictEqual(typeof ctx.QOL.preview.showForConfigId, "function");
    assert.strictEqual(typeof ctx.QOL.preview.hideAll, "function");
    assert.strictEqual(typeof ctx.QOL.preview.wirePreviewToggleButton, "function");
    assert.strictEqual(typeof ctx.QOL.preview.isCompassPreviewConfig, "function");
    assert.strictEqual(typeof ctx.QOL.preview.isSpeedPreviewConfig, "function");
});

test("Preview detection helpers recognize toggles and sliders", () => {
    const { ctx } = createPreviewTestEnvironment();
    assert.strictEqual(ctx.QOL.preview.isCompassPreviewConfig("ENABLE_COMPASS"), true);
    assert.strictEqual(ctx.QOL.preview.isCompassPreviewConfig("COMPASS_SCALE"), true);
    assert.strictEqual(ctx.QOL.preview.isSpeedPreviewConfig("ENABLE_COMPASS_SPEED"), true);
    assert.strictEqual(ctx.QOL.preview.isSpeedPreviewConfig("COMPASS_SPEED_X_OFFSET"), true);
    assert.strictEqual(ctx.QOL.preview.isCrosshairStatsPreviewConfig("ENABLE_CROSSHAIR_STATS"), true);
    assert.strictEqual(ctx.QOL.preview.isCrosshairStatsPreviewConfig("CROSSHAIR_STATS_SCALE"), true);
    assert.strictEqual(ctx.QOL.preview.isKeyboardOverlayPreviewConfig("ENABLE_KEYBOARD_OVERLAY"), true);
});

test("ShowConfigPreviewForConfigId displays Zipline Boost preview correctly", () => {
    const { ctx, rootPanel } = createPreviewTestEnvironment();
    ctx.QOL.preview.showForConfigId("ENABLE_ZIP_BOOST");

    const previewPanel = rootPanel.FindChildTraverse("ZipBoostPreview");
    assert.ok(previewPanel, "ZipBoostPreview panel should exist");
    assert.strictEqual(previewPanel.BHasClass("Visible"), true);

    const label = rootPanel.FindChildTraverse("ZipBoostPreviewLabel");
    assert.ok(label, "ZipBoostPreviewLabel should exist");
    assert.ok(label.text.includes("ZIP BOOST"), "Label should have ZIP BOOST text");
});

test("ShowConfigPreviewForConfigId displays Speed preview correctly with formatted label", () => {
    const { ctx, rootPanel } = createPreviewTestEnvironment();
    ctx.QOL.preview.showForConfigId("ENABLE_COMPASS_SPEED");

    const speedPanel = rootPanel.FindChildTraverse("SpeedPreview");
    assert.ok(speedPanel, "SpeedPreview panel should exist");
    assert.strictEqual(speedPanel.BHasClass("Visible"), true);

    const speedLabel = rootPanel.FindChildTraverse("SpeedPreviewLabel");
    assert.ok(speedLabel, "SpeedPreviewLabel should exist");
    assert.strictEqual(speedLabel.text, "SPEED: 8.5 m/s");
});

test("ShowConfigPreviewForConfigId hides panel when feature toggle is disabled", () => {
    const { ctx, rootPanel } = createPreviewTestEnvironment();
    ctx.QOL.preview.showForConfigId("ENABLE_ZIP_BOOST");
    const previewPanel = rootPanel.FindChildTraverse("ZipBoostPreview");
    assert.strictEqual(previewPanel.BHasClass("Visible"), true);

    // Disable and trigger again
    ctx.MOD_CONFIG.ENABLE_ZIP_BOOST = 0;
    ctx.QOL.preview.showForConfigId("ENABLE_ZIP_BOOST");
    assert.strictEqual(previewPanel.BHasClass("Visible"), false);
});

test("ShowConfigPreviewForConfigId hides speed preview when ENABLE_COMPASS_SPEED is disabled", () => {
    const { ctx, rootPanel } = createPreviewTestEnvironment();
    ctx.QOL.preview.showForConfigId("ENABLE_COMPASS_SPEED");
    const speedPanel = rootPanel.FindChildTraverse("SpeedPreview");
    assert.strictEqual(speedPanel.BHasClass("Visible"), true);

    ctx.MOD_CONFIG.ENABLE_COMPASS_SPEED = 0;
    ctx.QOL.preview.showForConfigId("ENABLE_COMPASS_SPEED");
    assert.strictEqual(speedPanel.BHasClass("Visible"), false);
});

test("Previews do not show if PREVIEWS_ENABLED is 0", () => {
    const { ctx, rootPanel } = createPreviewTestEnvironment({ PREVIEWS_ENABLED: 0 });
    ctx.QOL.preview.showForConfigId("ZIP_BOOST_SCALE");
    const previewPanel = rootPanel.FindChildTraverse("ZipBoostPreview");
    assert.strictEqual(previewPanel ? previewPanel.BHasClass("Visible") : false, false);
});

test("Previews do not show if SettingsWindow is not visible", () => {
    const { ctx, rootPanel, settingsWin } = createPreviewTestEnvironment();
    settingsWin.RemoveClass("Visible");
    ctx.QOL.preview.showForConfigId("ENABLE_ZIP_BOOST");
    const previewPanel = rootPanel.FindChildTraverse("ZipBoostPreview");
    assert.strictEqual(previewPanel ? previewPanel.BHasClass("Visible") : false, false);
});

test("wirePreviewToggleButton sets up toggle button and handles activation", () => {
    const { ctx, doc, getSaveAndSyncCalls } = createPreviewTestEnvironment();
    const btn = doc.create("Button", { id: "PreviewToggleBtn" });
    ctx.QOL.preview.wirePreviewToggleButton(btn);

    assert.strictEqual(btn.BHasClass("Active"), true);

    // Click toggle button
    btn.activate();
    assert.strictEqual(ctx.MOD_CONFIG.PREVIEWS_ENABLED, 0);
    assert.strictEqual(btn.BHasClass("Active"), false);
    assert.ok(getSaveAndSyncCalls() > 0);

    // Click again
    btn.activate();
    assert.strictEqual(ctx.MOD_CONFIG.PREVIEWS_ENABLED, 1);
    assert.strictEqual(btn.BHasClass("Active"), true);
});

test("hideAll hides visible previews", () => {
    const { ctx, rootPanel } = createPreviewTestEnvironment();
    ctx.QOL.preview.showForConfigId("ENABLE_ZIP_BOOST");
    ctx.QOL.preview.showForConfigId("ENABLE_COMPASS_SPEED");

    const zipPanel = rootPanel.FindChildTraverse("ZipBoostPreview");
    const speedPanel = rootPanel.FindChildTraverse("SpeedPreview");
    assert.strictEqual(zipPanel.BHasClass("Visible"), true);
    assert.strictEqual(speedPanel.BHasClass("Visible"), true);

    ctx.QOL.preview.hideAll();
    assert.strictEqual(zipPanel.BHasClass("Visible"), false);
    assert.strictEqual(speedPanel.BHasClass("Visible"), false);
});

test("createAnimatedInlineToggleSection triggers preview on toggle click", () => {
    const { ctx, rootPanel, list } = createPreviewTestEnvironment({ ENABLE_ZIP_BOOST: 0 });
    const controls = ctx.QOL.ui.controls;

    // Create section for Zipline Boost
    controls.createAnimatedInlineToggleSection(list, "Zipline Boost", "ENABLE_ZIP_BOOST", (body) => {
        controls.createSliderRow(body, "Scale", "ZIP_BOOST_SCALE", 50, 200, 100, 5, "%");
    });

    const toggleBtn = list.FindChildTraverse("ZiplineBoostSectionToggleButton");
    assert.ok(toggleBtn, "ZiplineBoostSectionToggleButton should exist");

    // Click toggle button
    toggleBtn.activate();

    assert.strictEqual(ctx.MOD_CONFIG.ENABLE_ZIP_BOOST, 1, "Config should update to 1");

    const previewPanel = rootPanel.FindChildTraverse("ZipBoostPreview");
    assert.ok(previewPanel, "ZipBoostPreview panel should exist");
    assert.strictEqual(previewPanel.BHasClass("Visible"), true, "ZipBoostPreview should be visible after activating section");
});
