// tests/diagnostic_bridge.test.js
// =============================================================================
// Verifies the cross-isolate diagnostic and manifest test bridge:
// QOL_DiagRequest attribute on Hud panel -> ql_app poll -> QOL_Diag attribute.
// Covers Manifest Tests (mt_), Feature Tests (fit_), Tree Dump (dt_), and Presets.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

test("boot writes initial diagnostic snapshot to QOL_Diag", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const rawDiag = hud.root.GetAttributeString("QOL_Diag", "");
    assert.ok(rawDiag, "QOL_Diag attribute must be populated on boot");

    const diag = JSON.parse(rawDiag);
    assert.ok(Array.isArray(diag.features), "diag.features must be an array");
    assert.ok(diag.features.length >= 40, `Expected >= 40 features, got ${diag.features.length}`);
    assert.ok(Array.isArray(diag.newFeatures), "diag.newFeatures must be an array");
    assert.ok(Array.isArray(diag.newEnabled), "diag.newEnabled must be an array");
    assert.ok(Array.isArray(diag.disabled), "diag.disabled must be an array");
    assert.strictEqual(typeof diag.errors, "object", "diag.errors must be an object");
});

test("QOL_DiagRequest with force token updates QOL_Diag with matching diagToken", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const app = hud.sandbox.global.QOL.core.app;

    const forceToken = "fit_token_12345";
    hud.root.SetAttributeString("QOL_DiagRequest", forceToken);

    // Trigger one cycle of syncDiagnosticState
    const now = Date.now();
    app.syncDiagnosticState(hud.root, now);

    const rawDiag = hud.root.GetAttributeString("QOL_Diag", "");
    const diag = JSON.parse(rawDiag);
    assert.strictEqual(diag.diagToken, forceToken, "diagToken must echo the requested force token");
});

test("QOL_DiagRequest with mt_ token triggers ManifestTests and writes testResults", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const app = hud.sandbox.global.QOL.core.app;
    const manifestTests = hud.sandbox.global.QOL.core.ManifestTests;
    assert.ok(manifestTests, "QOL.core.ManifestTests must be available");

    const mtToken = "mt_run_" + Date.now();
    hud.root.SetAttributeString("QOL_DiagRequest", mtToken);

    // Advance clock to trigger poll and execute test runner frames
    hud.clock.advance(1000);

    const rawDiag = hud.root.GetAttributeString("QOL_Diag", "");
    assert.ok(rawDiag, "QOL_Diag must exist after running manifest tests");

    const diag = JSON.parse(rawDiag);
    assert.ok(diag.testResults, "testResults must be attached in QOL_Diag");
    assert.strictEqual(diag.testResults.token, mtToken, "testResults.token must match mtToken");
    assert.ok(diag.testResults.summary.total > 0, "Manifest tests must have executed test assertions");
});

test("QOL_DiagRequest with bm_ token triggers benchmark and writes benchmark report", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const Scheduler = hud.sandbox.global.QOL.core.Scheduler;
    assert.ok(Scheduler && typeof Scheduler.startBenchmark === "function", "Scheduler.startBenchmark must be available");
    const nativeLookup = hud.root.FindChildTraverse;

    const bmToken = "bm_2_normal_" + Date.now();
    hud.root.SetAttributeString("QOL_DiagRequest", bmToken);

    hud.clock.advance(300);
    assert.notStrictEqual(hud.root.FindChildTraverse, nativeLookup, "Diagnostic lookup hook should be active during the sample");

    // Advance beyond the 2s benchmark and verify that the native method is restored.
    hud.clock.advance(2700);
    assert.strictEqual(hud.root.FindChildTraverse, nativeLookup, "Diagnostic lookup hook must be removed after the sample");

    const rawDiag = hud.root.GetAttributeString("QOL_Diag", "");
    assert.ok(rawDiag, "QOL_Diag must exist after benchmark");

    const diag = JSON.parse(rawDiag);
    assert.ok(diag.benchmark, "benchmark must be attached in QOL_Diag");
    assert.strictEqual(diag.benchmark.token, bmToken, "benchmark.token must match bmToken");
    assert.ok(diag.benchmark.report.includes("QOLLOCK IN-GAME BENCHMARK REPORT"), "Report must include benchmark header");
    assert.strictEqual(typeof diag.benchmark.stats.totalJsMs, "number", "stats.totalJsMs must be a number");
    const lookups = diag.benchmark.stats.lookupStats;
    assert.strictEqual(lookups.status, "active");
    assert.ok(lookups.panelsScanned > 0);
    assert.strictEqual(lookups.panelsCovered, lookups.panelsScanned);
    assert.ok(lookups.totalCalls >= lookups.pollCalls);
    assert.ok(lookups.pollCalls > 0);
    assert.ok(Object.keys(lookups.byFeature).length > 0);
    assert.match(diag.benchmark.report, /not engine-internal panel visits/);
});

test("QOL_DiagRequest with bm_ stress token enables all features and restores config", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const FR = hud.sandbox.global.QOL.core.FeatureRegistry;
    const initialEnabledCount = FR.getEnabledIds().length;

    assert.strictEqual(hud.root.BHasClass("center_esc_active"), false, "center_esc_active must be false initially");

    const bmToken = "bm_2_stress_" + Date.now();
    hud.root.SetAttributeString("QOL_DiagRequest", bmToken);

    // Advance clock past initial poll (300ms)
    hud.clock.advance(300);

    assert.strictEqual(hud.root.BHasClass("center_esc_active"), true, "center_esc_active must be active at 300ms");
    assert.strictEqual(hud.root.BHasClass("compass_active"), true, "compass_active must be active at 300ms");
    assert.ok(FR.getEnabledIds().length >= 40, "At least 40 manifests must be active during stress benchmark");

    // Advance past 1000ms root class sync (1500ms) — verify features do not prematurely deactivate
    hud.clock.advance(1200);

    assert.strictEqual(hud.root.BHasClass("center_esc_active"), true, "center_esc_active must remain active past 1.0s sync");
    assert.strictEqual(hud.root.BHasClass("compass_active"), true, "compass_active must remain active past 1.0s sync");
    assert.ok(FR.getEnabledIds().length >= 40, "Manifests must remain active past 1.0s sync");

    // Advance past 2s benchmark finish and restore (3000ms total)
    hud.clock.advance(1500);

    assert.strictEqual(hud.root.BHasClass("center_esc_active"), false, "center_esc_active must be restored to false");
    assert.strictEqual(FR.getEnabledIds().length, initialEnabledCount, "Enabled manifests count must restore to baseline");

    const rawDiag = hud.root.GetAttributeString("QOL_Diag", "");
    assert.ok(rawDiag, "QOL_Diag must exist after benchmark");

    const diag = JSON.parse(rawDiag);
    assert.ok(diag.benchmark, "benchmark must be attached in QOL_Diag");
    assert.strictEqual(diag.benchmark.token, bmToken, "benchmark.token must match bmToken");
    assert.ok(diag.benchmark.report.includes("QOLLOCK IN-GAME BENCHMARK REPORT"), "Report must include benchmark header");
});

test("panel lookup benchmark restores its hook on early stop and reports unsupported roots", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const scheduler = hud.sandbox.global.QOL.core.Scheduler;
    const nativeLookup = hud.root.FindChildTraverse;
    const stopped = scheduler.startBenchmark(10, null, { capturePanelLookups: true, panelRoot: hud.root });
    assert.notStrictEqual(hud.root.FindChildTraverse, nativeLookup);
    stopped.stop();
    assert.strictEqual(hud.root.FindChildTraverse, nativeLookup);

    let completed = null;
    scheduler.startBenchmark(1, (report, stats) => { completed = { report, stats }; },
        { capturePanelLookups: true, panelRoot: {} });
    hud.clock.advance(1500);
    assert.ok(completed);
    assert.strictEqual(completed.stats.lookupStats.status, "unavailable");
    assert.match(completed.report, /Panel lookup hook: unavailable/);
    assert.strictEqual(hud.root.FindChildTraverse, nativeLookup);
});
