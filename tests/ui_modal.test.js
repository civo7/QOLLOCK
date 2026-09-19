// tests/ui_modal.test.js
// =============================================================================
// Unit tests for Modal Dialogs & Config Diff subsystem (panorama/scripts/ui/modal.js)
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
            ui: {},
            persistence: {
                fromBase64Url: (str) => Buffer.from(str, "base64").toString("binary"),
                deserializeCompactV2: () => ({
                    ENABLE_UNSPENT_SOULS: 0,
                    ENABLE_COLOR_WARNINGS: 0,
                    MINIMAP_SCALE: 1.25,
                }),
            },
            compactSchemaRegistry: {
                "1.0.0": { fields: [] },
            },
        },
        globalThis: {
            DEFAULT_CONFIG: Object.assign({}, defaultConfig),
            QOL_DEFAULT_CONFIG: Object.assign({}, defaultConfig),
            MOD_CONFIG: Object.assign({}, defaultConfig),
            LATEST_COMPACT_SEMVER: "1.0.0",
            QOL_COMPACT_SCHEMA_REGISTRY: {
                "1.0.0": { fields: [] },
            },
            SaveAndSync: () => {},
            RequestSettingsUiRefresh: () => {},
            LocalizeSettingsText: (t) => t,
            ApplySettingsThemeClasses: () => {},
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const modalCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/modal.js"),
        "utf8"
    );
    require("./load_ui_helpers")(sandbox);
    vm.runInNewContext(modalCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        settingsWin,
    };
}

test("ui/modal: exports public API on QOL.ui.modal and globalThis", () => {
    const { sandbox } = createTestEnvironment();
    const modal = sandbox.QOL.ui.modal;

    assert.ok(modal, "QOL.ui.modal exists");
    assert.strictEqual(typeof modal.openConfigDiffPreviewModal, "function");
    assert.strictEqual(typeof modal.closeModal, "function");
    assert.strictEqual(typeof modal.closeConfigDiffPreviewModalIfOpen, "function");
    assert.strictEqual(typeof modal.closeSettingsSideModalsIfOpen, "function");
    assert.strictEqual(typeof modal.cloneConfigSnapshot, "function");
    assert.strictEqual(typeof modal.preserveUiOnlySettings, "function");
    assert.strictEqual(typeof modal.buildCandidateConfigFromParsed, "function");
    assert.strictEqual(typeof modal.formatConfigKeyForDiff, "function");
    assert.strictEqual(typeof modal.formatConfigValueForDiff, "function");
    assert.strictEqual(typeof modal.buildConfigDiffRows, "function");
    assert.strictEqual(typeof modal.tryApplyImportStringWithDiagnostics, "function");
    assert.strictEqual(typeof modal.openAvailableModal, "function");

    // Backward compatibility globals
    assert.strictEqual(sandbox.globalThis.OpenConfigDiffPreviewModal, modal.openConfigDiffPreviewModal);
    assert.strictEqual(sandbox.globalThis.CloseModal, modal.closeModal);
    assert.strictEqual(sandbox.globalThis.CloseConfigDiffPreviewModalIfOpen, modal.closeConfigDiffPreviewModalIfOpen);
    assert.strictEqual(sandbox.globalThis.CloseSettingsSideModalsIfOpen, modal.closeSettingsSideModalsIfOpen);
    assert.strictEqual(sandbox.globalThis.CloneConfigSnapshot, modal.cloneConfigSnapshot);
    assert.strictEqual(sandbox.globalThis.PreserveUiOnlySettings, modal.preserveUiOnlySettings);
    assert.strictEqual(sandbox.globalThis.BuildCandidateConfigFromParsed, modal.buildCandidateConfigFromParsed);
    assert.strictEqual(sandbox.globalThis.FormatConfigKeyForDiff, modal.formatConfigKeyForDiff);
    assert.strictEqual(sandbox.globalThis.FormatConfigValueForDiff, modal.formatConfigValueForDiff);
    assert.strictEqual(sandbox.globalThis.BuildConfigDiffRows, modal.buildConfigDiffRows);
    assert.strictEqual(sandbox.globalThis.TryApplyImportStringWithDiagnostics, modal.tryApplyImportStringWithDiagnostics);
    assert.strictEqual(sandbox.globalThis.OpenAvailableModal, modal.openAvailableModal);
});

test("ui/modal: cloneConfigSnapshot deep copies configuration object", () => {
    const { sandbox } = createTestEnvironment();
    const modal = sandbox.QOL.ui.modal;

    const original = {
        ENABLE_UNSPENT_SOULS: 1,
        MINIMAP_SCALE: 1.25,
    };
    const cloned = modal.cloneConfigSnapshot(original);

    assert.strictEqual(JSON.stringify(cloned), JSON.stringify(original));
    assert.notStrictEqual(cloned, original);

    // Null/undefined handling defaults to empty or MOD_CONFIG
    assert.ok(modal.cloneConfigSnapshot(null));
    assert.ok(modal.cloneConfigSnapshot(undefined));
});

test("ui/modal: preserveUiOnlySettings keeps runtime UI flags untouched", () => {
    const { sandbox } = createTestEnvironment();
    const modal = sandbox.QOL.ui.modal;

    sandbox.globalThis.MOD_CONFIG.DRAG_ENABLED = 1;
    sandbox.globalThis.MOD_CONFIG.PREVIEWS_ENABLED = 0;
    sandbox.globalThis.MOD_CONFIG.ENABLE_UPDATE_CHECKER = 0;

    const candidate = {
        ENABLE_UNSPENT_SOULS: 0,
        DRAG_ENABLED: 0,
        PREVIEWS_ENABLED: 1,
        ENABLE_UPDATE_CHECKER: 1,
    };

    modal.preserveUiOnlySettings(candidate);

    assert.strictEqual(candidate.DRAG_ENABLED, 1);
    assert.strictEqual(candidate.PREVIEWS_ENABLED, 0);
    assert.strictEqual(candidate.ENABLE_UPDATE_CHECKER, 0);
});

test("ui/modal: formatConfigKeyForDiff formats config keys into readable labels", () => {
    const { sandbox } = createTestEnvironment();
    const modal = sandbox.QOL.ui.modal;

    assert.strictEqual(modal.formatConfigKeyForDiff("ENABLE_UNSPENT_SOULS"), "Enable Unspent Souls");
    assert.strictEqual(modal.formatConfigKeyForDiff("MINIMAP_SCALE"), "Minimap Scale");
    assert.strictEqual(modal.formatConfigKeyForDiff("ql_custom_crosshair"), "Ql Custom Crosshair");
    assert.strictEqual(modal.formatConfigKeyForDiff(""), "");
});

test("ui/modal: formatConfigValueForDiff formats booleans, numbers, and objects", () => {
    const { sandbox } = createTestEnvironment();
    const modal = sandbox.QOL.ui.modal;

    // Booleans represented by 0/1 with toggle/enable style keys
    assert.strictEqual(modal.formatConfigValueForDiff(1, "ENABLE_UNSPENT_SOULS"), "On");
    assert.strictEqual(modal.formatConfigValueForDiff(0, "ENABLE_UNSPENT_SOULS"), "Off");

    // Floats & integers
    assert.strictEqual(modal.formatConfigValueForDiff(1.25, "MINIMAP_SCALE"), "1.25");
    assert.strictEqual(modal.formatConfigValueForDiff(42, "SOME_INT"), "42");

    // Null / undefined / string
    assert.strictEqual(modal.formatConfigValueForDiff(undefined, "KEY"), "(unset)");
    assert.strictEqual(modal.formatConfigValueForDiff(null, "KEY"), "(null)");
    assert.strictEqual(modal.formatConfigValueForDiff("custom_val", "KEY"), "custom_val");
});

test("ui/modal: buildConfigDiffRows accurately identifies differences", () => {
    const { sandbox } = createTestEnvironment();
    const modal = sandbox.QOL.ui.modal;

    const currentConfig = {
        ENABLE_UNSPENT_SOULS: 1,
        MINIMAP_SCALE: 1.0,
        ENABLE_COLOR_WARNINGS: 1,
    };

    const candidateConfig = {
        ENABLE_UNSPENT_SOULS: 0,
        MINIMAP_SCALE: 1.25,
        ENABLE_COLOR_WARNINGS: 1, // unchanged
    };

    const rows = modal.buildConfigDiffRows(currentConfig, candidateConfig);

    assert.strictEqual(rows.length, 2);
    const unspentRow = rows.find(r => r.key === "ENABLE_UNSPENT_SOULS");
    assert.ok(unspentRow);
    assert.strictEqual(unspentRow.beforeText, "On");
    assert.strictEqual(unspentRow.afterText, "Off");

    const minimapRow = rows.find(r => r.key === "MINIMAP_SCALE");
    assert.ok(minimapRow);
    assert.strictEqual(minimapRow.beforeText, "1");
    assert.strictEqual(minimapRow.afterText, "1.25");
});

test("ui/modal: openConfigDiffPreviewModal creates overlay with action buttons", () => {
    const { sandbox, rootPanel } = createTestEnvironment();
    const modal = sandbox.QOL.ui.modal;

    let applied = false;
    modal.openConfigDiffPreviewModal({
        title: "Test Diff",
        rows: [
            { key: "TEST_KEY", label: "Test Key", from: "Old", to: "New" }
        ],
        onApply: () => { applied = true; }
    });

    const overlay = rootPanel.FindChildTraverse("ConfigDiffPreviewModalOverlay");
    assert.ok(overlay, "Modal overlay was created");
    assert.ok(overlay.BHasClass("ModalOverlay"));

    const container = overlay.FindChildTraverse("ConfigDiffModalContainer");
    assert.ok(container, "Modal container exists");

    // Close modal test
    modal.closeConfigDiffPreviewModalIfOpen();
    assert.ok(overlay.deleted || !overlay.BHasClass("Show"), "Overlay is removed or marked for deletion");
});

test("ui/modal: tryApplyImportStringWithDiagnostics parses token and returns candidate", () => {
    const { sandbox } = createTestEnvironment();
    const modal = sandbox.QOL.ui.modal;

    // Invalid / empty
    assert.strictEqual(modal.tryApplyImportStringWithDiagnostics("").ok, false);
    assert.strictEqual(modal.tryApplyImportStringWithDiagnostics("invalid token").ok, false);

    // Valid format [QOL-1-0-0]BASE64
    const validToken = "[QOL-1-0-0]AQIDBA==";
    const result = modal.tryApplyImportStringWithDiagnostics(validToken);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.schemaVersion, "1.0.0");
    assert.ok(result.candidateConfig);
});
