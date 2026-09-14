// tests/config_preset_import.test.js
// =============================================================================
// Verifies that settings/preset imports and live config updates properly
// propagate from the storage attribute through ConfigAdapter, ConfigStore,
// and FeatureRegistry to active manifests and State.lastConfig.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

test("all registered manifests must have a registered schema in ConfigStore", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const FR = QOL.core.FeatureRegistry;
    const CS = QOL.core.ConfigStore;

    const ids = FR.getRegisteredIds();
    assert.ok(ids.length >= 40, `Expected at least 40 registered features, got ${ids.length}`);

    const missingSchemas = [];
    for (const id of ids) {
        if (!CS.hasSchema(id)) {
            missingSchemas.push(id);
        }
    }
    assert.deepStrictEqual(missingSchemas, [], `Features missing ConfigStore schema: ${missingSchemas.join(", ")}`);
});

test("applying a preset updates ConfigStore values, State.lastConfig, and fires onSettingsChanged", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const CS = QOL.core.ConfigStore;
    const defaultCfg = hud.sandbox.global.QOL_DEFAULT_CONFIG;
    assert.ok(defaultCfg, "QOL_DEFAULT_CONFIG must be present");

    // Track onSettingsChanged calls
    let soulsChangedCalled = false;
    const soulsInstance = QOL.core.FeatureRegistry.getInstance("ql_souls");
    if (soulsInstance && soulsInstance.onSettingsChanged) {
        const origOnChanged = soulsInstance.onSettingsChanged;
        soulsInstance.onSettingsChanged = function(payload) {
            soulsChangedCalled = true;
            return origOnChanged.call(this, payload);
        };
    }

    // Apply new preset config
    const newConfig = Object.assign({}, defaultCfg, {
        SOULS_X_OFFSET: 350,
        SOULS_Y_OFFSET: 120,
        ENABLE_AMMO_STATUS: 1
    });

    const raw = JSON.stringify({ schema: "3.1.9", data: newConfig });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", raw);

    // Advance clock so poll() ticks
    hud.clock.advance(1000);

    // 1. ConfigStore must hold updated values
    assert.strictEqual(CS.get("ql_souls", "SOULS_X_OFFSET"), 350, "SOULS_X_OFFSET should be 350");
    assert.strictEqual(CS.get("ql_souls", "SOULS_Y_OFFSET"), 120, "SOULS_Y_OFFSET should be 120");

    // 2. State.lastConfig must be populated and match the applied config
    const State = hud.sandbox.global.State;
    assert.ok(State && State.lastConfig, "State.lastConfig must be set after config poll");
    assert.strictEqual(State.lastConfig.SOULS_X_OFFSET, 350, "State.lastConfig.SOULS_X_OFFSET must be 350");

    // 3. onSettingsChanged must have been called
    assert.strictEqual(soulsChangedCalled, true, "ql_souls.onSettingsChanged should have fired");
});

test("applying a preset toggles feature enabled states for all manifests with enable toggles", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const FR = QOL.core.FeatureRegistry;
    const defaultCfg = hud.sandbox.global.QOL_DEFAULT_CONFIG;

    // ql_bottom_bar defaults to enabled: true
    assert.strictEqual(FR.isEnabled("ql_bottom_bar"), true, "ql_bottom_bar should initially be enabled");
    // ql_ammo defaults to enabled: false
    assert.strictEqual(FR.isEnabled("ql_ammo"), false, "ql_ammo should initially be disabled");

    // Preset: turn off bottom bar, turn on ammo
    const newConfig = Object.assign({}, defaultCfg, {
        HUD_BOTTOM_BAR_ENABLED: 0,
        ENABLE_AMMO_STATUS: 1
    });

    const raw = JSON.stringify({ schema: "3.1.9", data: newConfig });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", raw);

    // Advance clock so poll() ticks
    hud.clock.advance(1000);

    assert.strictEqual(FR.isEnabled("ql_bottom_bar"), false, "ql_bottom_bar should be disabled after preset turns it off");
    assert.strictEqual(FR.isEnabled("ql_ammo"), true, "ql_ammo should be enabled after preset turns it on");
});

test("enabling perf debug, detailed console, and overlay activates ql_perf manifest and State.perfEnabled", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const FR = QOL.core.FeatureRegistry;
    const CS = QOL.core.ConfigStore;
    const State = hud.sandbox.global.State;
    const defaultCfg = hud.sandbox.global.QOL_DEFAULT_CONFIG;

    // ql_perf should be registered
    assert.ok(FR.isRegistered("ql_perf"), "ql_perf must be registered");
    assert.strictEqual(FR.isEnabled("ql_perf"), false, "ql_perf should initially be disabled");
    assert.strictEqual(State.perfEnabled, false, "State.perfEnabled should initially be false");

    // Enable perf debug, detail, and overlay via config
    const perfConfig = Object.assign({}, defaultCfg, {
        ENABLE_PERF_DEBUG: 1,
        ENABLE_PERF_DEBUG_DETAIL: 1,
        ENABLE_PERF_OVERLAY: 1,
        PERF_OVERLAY_OPACITY: 0.85
    });

    const raw = JSON.stringify({ schema: "3.1.9", data: perfConfig });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", raw);

    // Advance clock so poll() ticks
    hud.clock.advance(1000);

    // Assert ql_perf is enabled
    assert.strictEqual(FR.isEnabled("ql_perf"), true, "ql_perf should be enabled after config activates perf");
    assert.strictEqual(CS.get("ql_perf", "ENABLE_PERF_DEBUG"), true, "CS ENABLE_PERF_DEBUG should be true");
    assert.strictEqual(CS.get("ql_perf", "ENABLE_PERF_DEBUG_DETAIL"), true, "CS ENABLE_PERF_DEBUG_DETAIL should be true");
    assert.strictEqual(CS.get("ql_perf", "ENABLE_PERF_OVERLAY"), true, "CS ENABLE_PERF_OVERLAY should be true");
    assert.strictEqual(CS.get("ql_perf", "PERF_OVERLAY_OPACITY"), 0.85, "CS PERF_OVERLAY_OPACITY should be 0.85");

    // Assert State.perfEnabled and State.perfDetailed are active
    assert.strictEqual(State.perfEnabled, true, "State.perfEnabled must be true when perf is active");
    assert.strictEqual(State.perfDetailed, true, "State.perfDetailed must be true when perf detail is active");

    // Now disable perf via config
    const disabledPerfConfig = Object.assign({}, defaultCfg, {
        ENABLE_PERF_DEBUG: 0,
        ENABLE_PERF_DEBUG_DETAIL: 0,
        ENABLE_PERF_OVERLAY: 0
    });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "3.1.9", data: disabledPerfConfig }));
    hud.clock.advance(1000);

    assert.strictEqual(FR.isEnabled("ql_perf"), false, "ql_perf should be disabled after toggles turned off");
    assert.strictEqual(State.perfEnabled, false, "State.perfEnabled must be false after disable");
});

test("enabling ENABLE_SHOW_BUILD_ID activates ql_show_build_id and updates HUD build info panel", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const FR = QOL.core.FeatureRegistry;
    const CS = QOL.core.ConfigStore;
    const defaultCfg = hud.sandbox.global.QOL_DEFAULT_CONFIG;

    assert.ok(FR.isRegistered("ql_show_build_id"), "ql_show_build_id must be registered");
    assert.strictEqual(FR.isEnabled("ql_show_build_id"), false, "ql_show_build_id should initially be disabled");

    // Setup required DOM elements
    const $ = hud.sandbox.global.$;
    const lowerLeft = $.CreatePanel("Panel", hud.root, "LowerLeft");
    const sourceTitle = $.CreatePanel("Label", hud.root, "SelectedBuildInfoTitle");
    sourceTitle.text = "98765 - Competitive Ivy - 1";

    // Enable show build id with title
    const buildConfig = Object.assign({}, defaultCfg, {
        ENABLE_SHOW_BUILD_ID: 1,
        ENABLE_SHOW_BUILD_ID_TITLE: 1
    });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "3.1.9", data: buildConfig }));
    hud.clock.advance(1500);

    // Assert feature is enabled and ConfigStore holds values
    assert.strictEqual(FR.isEnabled("ql_show_build_id"), true, "ql_show_build_id should be enabled");
    assert.strictEqual(CS.get("ql_show_build_id", "ENABLE_SHOW_BUILD_ID"), true);
    assert.strictEqual(CS.get("ql_show_build_id", "ENABLE_SHOW_BUILD_ID_TITLE"), true);

    // Verify panel and label created with formatted build text
    const container = lowerLeft.FindChildTraverse("selected_build_info");
    assert.ok(container, "selected_build_info panel should be created in LowerLeft");
    assert.strictEqual(container.style.visibility, "visible");

    const label = container.FindChildTraverse("build_info");
    assert.ok(label, "build_info label should be created");
    assert.strictEqual(label.text, "Public Build: 98765 - Competitive Ivy");

    // Disable feature
    const disabledConfig = Object.assign({}, defaultCfg, {
        ENABLE_SHOW_BUILD_ID: 0,
        ENABLE_SHOW_BUILD_ID_TITLE: 0
    });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "3.1.9", data: disabledConfig }));
    hud.clock.advance(1500);

    assert.strictEqual(FR.isEnabled("ql_show_build_id"), false, "ql_show_build_id should be disabled");
    assert.strictEqual(container.style.visibility, "collapse", "selected_build_info should be collapsed when disabled");
});

test("multi-surface config propagation: updating root panel with revision propagates to hudPanel and ConfigStore", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const CS = QOL.core.ConfigStore;
    const defaultCfg = hud.sandbox.global.QOL_DEFAULT_CONFIG;

    // Simulate settings menu / EscapeMenu writing config and revision to root panel
    const newConfig = Object.assign({}, defaultCfg, {
        SOULS_X_OFFSET: 520,
        SOULS_Y_OFFSET: 180
    });
    const raw = JSON.stringify({ schema: "3.1.9", data: newConfig });

    hud.doc.absRoot.SetAttributeString("Deadlock_Mod_Settings_v1", raw);
    hud.doc.absRoot.SetAttributeString("QOL_USER_EDIT_REV", "15");

    // Advance clock to trigger poll
    hud.clock.advance(1000);

    // 1. ConfigStore must have updated values
    assert.strictEqual(CS.get("ql_souls", "SOULS_X_OFFSET"), 520, "SOULS_X_OFFSET must be updated from root panel");
    assert.strictEqual(CS.get("ql_souls", "SOULS_Y_OFFSET"), 180, "SOULS_Y_OFFSET must be updated from root panel");

    // 2. hud.root must have received synced attributes
    assert.strictEqual(hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), raw, "hud.root must be synced with config");
    assert.strictEqual(hud.root.GetAttributeString("QOL_USER_EDIT_REV", ""), "15", "hud.root must be synced with revision");
});

test("perf timing tracking: Scheduler poll loop records timings into QOL.state.perfStats when perfEnabled", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const State = hud.sandbox.global.State;
    const Scheduler = QOL.core.Scheduler;

    // QOL.state must reference State
    assert.strictEqual(QOL.state, State, "QOL.state must reference State object");

    // Enable perf
    State.perfEnabled = true;
    if (!State.perfStats) State.perfStats = {};

    let executed = 0;
    const loop = Scheduler.createPollLoop(() => {
        executed++;
    }, 0.1, "test_perf_feature");

    // Advance virtual clock
    hud.clock.advance(500);

    assert.ok(executed > 0, "Poll loop callback must have executed");
    assert.ok(State.perfStats["mf.test_perf_feature"], "Timing must be recorded in State.perfStats");
    assert.ok(State.perfStats["mf.test_perf_feature"].count > 0, "Stats count must be > 0");

    const timings = Scheduler.getTimings("test_perf_feature");
    assert.ok(timings, "Scheduler.getTimings must return data for test_perf_feature");
    assert.strictEqual(timings.calls, executed, "timings.calls must match loop executions");

    loop.stop();
});

test("enabling ENABLE_PERF_DEBUG_DETAIL alone activates ql_perf manifest and enables perf", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const FR = QOL.core.FeatureRegistry;
    const State = hud.sandbox.global.State;
    const defaultCfg = hud.sandbox.global.QOL_DEFAULT_CONFIG;

    assert.strictEqual(FR.isEnabled("ql_perf"), false, "ql_perf should initially be disabled");

    const perfConfig = Object.assign({}, defaultCfg, {
        ENABLE_PERF_DEBUG: 0,
        ENABLE_PERF_DEBUG_DETAIL: 1
    });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "3.1.9", data: perfConfig }));
    hud.clock.advance(1000);

    assert.strictEqual(FR.isEnabled("ql_perf"), true, "ql_perf should be enabled by ENABLE_PERF_DEBUG_DETAIL alone");
    assert.strictEqual(State.perfEnabled, true, "State.perfEnabled should be true");
    assert.strictEqual(State.perfDetailed, true, "State.perfDetailed should be true");
});


