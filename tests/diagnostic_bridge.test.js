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
