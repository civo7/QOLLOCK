// tests/ui_dev_tab.test.js
// =============================================================================
// Unit tests for Dev & Diagnostics subsystem (panorama/scripts/ui/dev_tab.js)
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
    const hudPanel = doc.create("Panel", { id: "Hud" });
    rootPanel.addChild(hudPanel);

    const registeredTabs = new Map();
    const dispatchedEvents = [];
    let clipboardText = null;

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
        DispatchEvent: (eventName, arg) => {
            dispatchedEvents.push({ eventName, arg });
        },
        Localize: (s) => s,
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "3.2.0",
            dumpDiagnostics: () => "=== QOLLOCK Diagnostics Dump ===\nAll systems nominal.\n",
            ui: {
                window: {
                    registerTabRenderer: (name, fn) => {
                        registeredTabs.set(name, fn);
                    },
                },
                configTab: {
                    createSectionInlineIconButton: (titleLabel, buttonId, iconSrc, tooltipText) => {
                        const btn = mockDollar.CreatePanel("Button", titleLabel, buttonId);
                        btn.tooltip = tooltipText;
                        btn.iconSrc = iconSrc;
                        return btn;
                    },
                    tryCopyTextToClipboard: (text) => {
                        clipboardText = text;
                        return true;
                    },
                    setLocalizedConfigFeedbackMessage: () => {},
                },
                presets: {
                    applyPresetByName: () => true,
                },
            },
        },
        globalThis: {
            DEFAULT_CONFIG: {
                ENABLE_PERF_DEBUG: 0,
                ENABLE_PERF_DEBUG_DETAIL: 0,
                ENABLE_PERF_OVERLAY: 0,
                ENABLE_CROSSHAIR: 1,
            },
            PRESETS: {
                Default: { ENABLE_CROSSHAIR: 1 },
                Pro: { ENABLE_CROSSHAIR: 1 },
            },
            MOD_CONFIG: {
                ENABLE_PERF_DEBUG: 0,
                ENABLE_PERF_DEBUG_DETAIL: 0,
                ENABLE_PERF_OVERLAY: 0,
                ENABLE_CROSSHAIR: 1,
                PERF_ALERT_THRESHOLD_MS: 16,
                PERF_OVERLAY_OPACITY: 80,
            },
            SaveAndSync: () => {},
            LocalizeSettingsText: (t) => t,
            CreateSectionTitle: (parent, title) => {
                const p = mockDollar.CreatePanel("Panel", parent, "");
                const lbl = mockDollar.CreatePanel("Label", p, "");
                lbl.text = title;
                return p;
            },
            CreateRow: (parent, label) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                r.AddClass("SettingRow");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
            CreateSliderRow: (parent, label) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                r.AddClass("SettingSliderRow");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
            CreateSeparator: (parent) => {
                return mockDollar.CreatePanel("Panel", parent, "");
            },
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const devTabCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/dev_tab.js"),
        "utf8"
    );
    require("./load_ui_helpers")(sandbox);
    vm.runInNewContext(devTabCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        hudPanel,
        dispatchedEvents,
        registeredTabs,
        getClipboardText: () => clipboardText,
    };
}

test("ui/dev_tab: exports public API on QOL.ui.devTab and globalThis", () => {
    const env = createTestEnvironment();
    const devApi = env.sandbox.QOL.ui.devTab;

    assert.ok(devApi, "QOL.ui.devTab should be defined");
    assert.strictEqual(typeof devApi.render, "function");
    assert.strictEqual(typeof devApi.findHudPanel, "function");
    assert.strictEqual(typeof devApi.formatTestSuiteReport, "function");
    assert.strictEqual(typeof devApi.runFeatureIsolationTest, "function");
    assert.strictEqual(typeof devApi.runManifestTests, "function");
    assert.strictEqual(typeof devApi.requestPanelTreeDump, "function");
    assert.strictEqual(typeof devApi.requestBuildStorageDryRun, "function");
    assert.strictEqual(typeof devApi.runFullTestSuite, "function");
    assert.strictEqual(typeof devApi.runPresetCycle, "function");
    assert.strictEqual(typeof devApi.copyDiagnosticsToClipboard, "function");

    assert.strictEqual(typeof env.sandbox.globalThis.RenderDevTabContent, "function");
    assert.strictEqual(typeof env.sandbox.globalThis.FormatTestSuiteReport, "function");
    assert.ok(env.registeredTabs.has("Dev"), "Dev tab should be registered with window manager");
});

test("ui/dev_tab: formatTestSuiteReport formats clean diagnostic reports", () => {
    const env = createTestEnvironment();
    const { formatTestSuiteReport } = env.sandbox.QOL.ui.devTab;

    const sampleDiag = {
        testResults: {
            token: "mt_123",
            timestamp: 1700000000000,
            summary: {
                total: 10,
                passed: 9,
                failed: 1,
                errors: 0,
                skipped: 0,
                timeMs: 42,
            },
            results: [
                { id: "test_crosshair", name: "Crosshair Test", passed: false, message: "Mismatch" },
            ],
        },
        features: ["crosshair", "healthbar", "minimap"],
        disabled: ["minimap"],
        newFeatures: ["crosshair", "healthbar"],
        newEnabled: ["crosshair"],
        newErrors: {
            healthbar: 2,
        },
        logs: [
            "[QOLLock] Feature minimap auto-disabled",
            "[QOLLock] Feature minimap auto-disabled",
            "[QOLLock][INFO] Loading done",
            "[GameEngine] Random log",
        ],
    };

    const report = formatTestSuiteReport(sampleDiag);
    assert.ok(report.includes("=== QOLLOCK Test Report ==="));
    assert.ok(report.includes("Total: 10 | Passed: 9 | Failed: 1"));
    assert.ok(report.includes("FAIL: test_crosshair [Crosshair Test]: Mismatch"));
    assert.ok(report.includes("Auto-disabled: 1"));
    assert.ok(report.includes("OFF: minimap"));
    assert.ok(report.includes("Manifests with errors: 1"));
    assert.ok(report.includes("healthbar: 2 errors"));
    assert.ok(report.includes("Feature minimap auto-disabled (x2)"));
    assert.ok(!report.includes("[GameEngine]"), "Should filter out non-QOLLock logs");
    assert.ok(!report.includes("[QOLLock][INFO]"), "Should filter out INFO logs");
});

test("ui/dev_tab: requestPanelTreeDump writes force-sync token to HUD bridge", () => {
    const env = createTestEnvironment();
    const { requestPanelTreeDump } = env.sandbox.QOL.ui.devTab;

    const statusLabel = env.sandbox.$.CreatePanel("Label", env.rootPanel, "TestStatus");
    const ok = requestPanelTreeDump(statusLabel);

    assert.strictEqual(ok, true);
    const attr = env.hudPanel.GetAttributeString("QOL_DiagRequest", "");
    assert.ok(attr.startsWith("dt_"), "QOL_DiagRequest should start with dt_");
    assert.strictEqual(statusLabel.text, "Dumped to console log");
});

test("ui/dev_tab: requestBuildStorageDryRun writes QOL_BUILD_DUMP_TREE attribute", () => {
    const env = createTestEnvironment();
    const { requestBuildStorageDryRun } = env.sandbox.QOL.ui.devTab;

    const statusLabel = env.sandbox.$.CreatePanel("Label", env.rootPanel, "TestStatus");
    const ok = requestBuildStorageDryRun(statusLabel);

    assert.strictEqual(ok, true);
    const attr = env.hudPanel.GetAttributeString("QOL_BUILD_DUMP_TREE", "");
    assert.strictEqual(attr, "1");
    assert.strictEqual(statusLabel.text, "Dry run started");
});

test("ui/dev_tab: copyDiagnosticsToClipboard calls dumpDiagnostics and copies to clipboard", () => {
    const env = createTestEnvironment();
    const { copyDiagnosticsToClipboard } = env.sandbox.QOL.ui.devTab;

    const btn = env.sandbox.$.CreatePanel("Button", env.rootPanel, "CopyBtn");
    copyDiagnosticsToClipboard(env.rootPanel, btn);

    const text = env.getClipboardText();
    assert.ok(text.includes("=== QOLLOCK Diagnostics Dump ==="));
    assert.ok(text.includes("All systems nominal."));
    assert.ok(btn.BHasClass("SuccessState"));
});

test("ui/dev_tab: render builds all dev sections and action buttons", () => {
    const env = createTestEnvironment();
    const { render } = env.sandbox.QOL.ui.devTab;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "SettingsList");
    render(list);

    // Verify sections and action buttons
    assert.ok(list.FindChildTraverse("FeatureTestBtn"), "Should render FeatureTestBtn");
    assert.ok(list.FindChildTraverse("ManifestTestBtn"), "Should render ManifestTestBtn");
    assert.ok(list.FindChildTraverse("TreeDumpBtn"), "Should render TreeDumpBtn");
    assert.ok(list.FindChildTraverse("BsDumpBtn"), "Should render BsDumpBtn");
    assert.ok(list.FindChildTraverse("FullSuiteBtn"), "Should render FullSuiteBtn");
    assert.ok(list.FindChildTraverse("PresetCycleBtn"), "Should render PresetCycleBtn");
    assert.ok(list.FindChildTraverse("DiagCopyLogsBtn"), "Should render DiagCopyLogsBtn");
    assert.ok(list.FindChildTraverse("BenchmarkRunBtn"), "Should render BenchmarkRunBtn");
    assert.ok(list.FindChildTraverse("BenchmarkStressBtn"), "Should render BenchmarkStressBtn");
});

test("ui/dev_tab: runInGameBenchmark initiates benchmark request and copies report", () => {
    const env = createTestEnvironment();
    const { runInGameBenchmark } = env.sandbox.QOL.ui.devTab;

    const statusLabel = env.sandbox.$.CreatePanel("Label", env.rootPanel, "BmStatus");
    const actionBtn = env.sandbox.$.CreatePanel("Button", env.rootPanel, "BmBtn");

    runInGameBenchmark(env.rootPanel, statusLabel, actionBtn, false);

    const reqToken = env.hudPanel.GetAttributeString("QOL_DiagRequest", "");
    assert.ok(reqToken.startsWith("bm_10_normal_"), "Must request 10s normal benchmark");
    assert.ok(actionBtn.BHasClass("CycleActive"), "Action button must be active");
    assert.ok(statusLabel.text.includes("10s left"), "Status should indicate 10s remaining");
});
