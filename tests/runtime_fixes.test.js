// tests/runtime_fixes.test.js
// =============================================================================
// Verifies runtime fixes:
// 1. MINIMAP_FLIP and non-standard toggle keys coercion and storage in ConfigStore.
// 2. Minimap timers anchor resolution (ensureMinimapOverlayAnchor).
// 3. Urn Tracker overlay creation, state calculation, and root classes.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

test("ConfigStore and ConfigAdapter coerce MINIMAP_FLIP and non-prefixed toggles", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const ConfigStore = Q.core.ConfigStore;
    const ConfigAdapter = Q.core.ConfigAdapter;

    assert.ok(ConfigStore, "ConfigStore must be defined");
    assert.ok(ConfigAdapter, "ConfigAdapter must be defined");

    // Load a flat config containing numeric 1 for MINIMAP_FLIP and other non-prefixed toggles
    ConfigAdapter.loadFromFlat({
        MINIMAP_FLIP: 1,
        MINIMAP_ROTATE_WITH_PLAYER: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_URN_DIFF: 1
    });

    // Verify MINIMAP_FLIP is stored as boolean true
    const compassFlip = ConfigStore.get("ql_compass", "MINIMAP_FLIP");
    assert.strictEqual(compassFlip, true, "MINIMAP_FLIP must be stored as boolean true");

    const compassRotate = ConfigStore.get("ql_compass", "MINIMAP_ROTATE_WITH_PLAYER");
    assert.strictEqual(compassRotate, true, "MINIMAP_ROTATE_WITH_PLAYER must be stored as boolean true");

    // Direct ConfigStore.set with numeric 1 should also coerce to boolean
    const setRes = ConfigStore.set("ql_compass", "MINIMAP_FLIP", 1);
    assert.strictEqual(setRes, true, "ConfigStore.set with 1 must succeed");
    assert.strictEqual(ConfigStore.get("ql_compass", "MINIMAP_FLIP"), true, "ConfigStore must store true");

    const setResZero = ConfigStore.set("ql_compass", "MINIMAP_FLIP", 0);
    assert.strictEqual(setResZero, true, "ConfigStore.set with 0 must succeed");
    assert.strictEqual(ConfigStore.get("ql_compass", "MINIMAP_FLIP"), false, "ConfigStore must store false");
});

test("QOL.ensureMinimapOverlayAnchor resolves minimap container or persp", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    assert.strictEqual(typeof Q.ensureMinimapOverlayAnchor, "function", "QOL.ensureMinimapOverlayAnchor must be a function");

    // Without minimap container, returns null
    const root = hud.root;
    assert.strictEqual(Q.ensureMinimapOverlayAnchor(root), null);

    // Create minimap_container in HUD tree
    const container = $.CreatePanel("Panel", root, "minimap_container");
    const anchor = Q.ensureMinimapOverlayAnchor(root);
    assert.strictEqual(anchor, container, "Anchor must resolve to minimap_container");
});

test("Urn Tracker overlay creation, state calculation, and root classes", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    const hudModule = Q.core.hud;

    assert.strictEqual(typeof hudModule.ensureUrnTrackerOverlay, "function", "ensureUrnTrackerOverlay must exist");
    assert.strictEqual(typeof hudModule.updateUrnTrackerOverlay, "function", "updateUrnTrackerOverlay must exist");
    assert.strictEqual(typeof hudModule.needsUrnTrackerRuntimeWork, "function", "needsUrnTrackerRuntimeWork must exist");
    assert.strictEqual(typeof hudModule.computeUrnTrackerState, "function", "computeUrnTrackerState must exist");

    // Create TopBar panel in tree
    const root = hud.root;
    const topBar = $.CreatePanel("Panel", root, "TopBar");
    const networth = $.CreatePanel("Panel", topBar, "TeamNetworth");
    networth.AddClass("TeamNetworth");

    // Test overlay creation
    const panel = hudModule.ensureUrnTrackerOverlay(root);
    assert.ok(panel, "UrnTracker overlay panel must be created");
    assert.strictEqual(panel.id, "UrnTracker", "Panel id must be UrnTracker");

    const label = panel.FindChildTraverse("UrnTrackerLabel");
    assert.ok(label, "UrnTrackerLabel must exist inside UrnTracker");

    const icon = panel.FindChildTraverse("UrnTrackerSoulIcon");
    assert.ok(icon, "UrnTrackerSoulIcon must exist inside UrnTracker");

    // Test root class urn_diff_disabled
    hudModule.applyRootClasses(root, { ENABLE_URN_DIFF: 0 }, Date.now(), false);
    assert.strictEqual(root.BHasClass("urn_diff_disabled"), true, "urn_diff_disabled must be active when ENABLE_URN_DIFF is 0");

    hudModule.applyRootClasses(root, { ENABLE_URN_DIFF: 1 }, Date.now(), false);
    assert.strictEqual(root.BHasClass("urn_diff_disabled"), false, "urn_diff_disabled must NOT be active when ENABLE_URN_DIFF is 1");
});
