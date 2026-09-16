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

test("Combat signal, passive cooldown mode, and account lookup functions exported and functioning", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    const root = hud.root;

    // 1. isCombatSignalActive
    assert.strictEqual(typeof Q.isCombatSignalActive, "function");
    assert.strictEqual(typeof Q.core.hud.isCombatSignalActive, "function");
    assert.strictEqual(Q.isCombatSignalActive(root, Date.now()), false);

    root.AddClass("InCombat");
    assert.strictEqual(Q.isCombatSignalActive(root, Date.now()), true);
    root.RemoveClass("InCombat");

    // 2. resolvePassiveCooldownMode and isPassiveCooldownBasicMode
    assert.strictEqual(typeof Q.resolvePassiveCooldownMode, "function");
    assert.strictEqual(typeof Q.isPassiveCooldownBasicMode, "function");
    assert.strictEqual(Q.resolvePassiveCooldownMode({ ENABLE_PASSIVE_COOLDOWN: 0 }), "default");
    assert.strictEqual(Q.resolvePassiveCooldownMode({ ENABLE_PASSIVE_COOLDOWN: 1, ENABLE_OLD_ITEM_COOLDOWNS: 0 }), "advanced");
    assert.strictEqual(Q.resolvePassiveCooldownMode({ ENABLE_PASSIVE_COOLDOWN: 1, ENABLE_OLD_ITEM_COOLDOWNS: 1 }), "basic");
    assert.strictEqual(Q.isPassiveCooldownBasicMode("basic"), true);
    assert.strictEqual(Q.isPassiveCooldownBasicMode("advanced"), false);
    assert.strictEqual(Q.isPassiveCooldownBasicMode("default"), false);

    // 3. hasClassInHierarchy and findAncestorWithClass
    assert.strictEqual(typeof Q.hasClassInHierarchy, "function");
    assert.strictEqual(typeof Q.findAncestorWithClass, "function");
    const parentP = $.CreatePanel("Panel", root, "ParentPanel");
    parentP.AddClass("test_ancestor_class");
    const childP = $.CreatePanel("Panel", parentP, "ChildPanel");
    assert.strictEqual(Q.hasClassInHierarchy(childP, "test_ancestor_class"), true);
    assert.strictEqual(Q.findAncestorWithClass(childP, "test_ancestor_class"), parentP);
    assert.strictEqual(Q.hasClassInHierarchy(childP, "non_existent"), false);
    assert.strictEqual(Q.findAncestorWithClass(childP, "non_existent"), null);

    // 4. tryReadAccountIdFromKnownPartyPath and getAccountIdForBuildCategoryPayload
    assert.strictEqual(typeof Q.tryReadAccountIdFromKnownPartyPath, "function");
    assert.strictEqual(typeof Q.getAccountIdForBuildCategoryPayload, "function");
    assert.strictEqual(Q.tryReadAccountIdFromKnownPartyPath(null), "");

    const partyContainer = $.CreatePanel("Panel", root, "CitadelPartyContainer");
    const party = $.CreatePanel("Panel", partyContainer, "CitadelParty");
    const localPlayer = $.CreatePanel("Panel", party, "LocalPlayer");
    const avatar = $.CreatePanel("Panel", localPlayer, "AvatarImage");
    avatar.text = "12345678";
    assert.strictEqual(Q.tryReadAccountIdFromKnownPartyPath(root), "12345678");
    assert.strictEqual(Q.getAccountIdForBuildCategoryPayload(root), "12345678");

    // 5. ConfigStore has ql_legacy_audio_passive schema for item filters
    const ConfigStore = Q.core.ConfigStore;
    assert.ok(ConfigStore.hasSchema("ql_legacy_audio_passive"));
    assert.strictEqual(ConfigStore.get("ql_legacy_audio_passive", "ENABLE_PASSIVE_COOLDOWN"), true);
    assert.strictEqual(ConfigStore.get("ql_legacy_audio_passive", "ITEM_FILTER_DEF_PASSIVE"), true);
});

test("ql_ui_controls manifest and multitoggle settings are properly registered and coerced", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const FR = Q.core.FeatureRegistry;
    const ConfigStore = Q.core.ConfigStore;
    const ConfigAdapter = Q.core.ConfigAdapter;

    // 1. ql_ui_controls is registered and has schema
    assert.ok(FR.isRegistered("ql_ui_controls"), "ql_ui_controls must be registered in FeatureRegistry");
    assert.ok(ConfigStore.hasSchema("ql_ui_controls"), "ql_ui_controls must have schema in ConfigStore");

    // 2. Loading UI controls settings into ConfigStore
    ConfigAdapter.loadFromFlat({
        SUPPORT_16_10: 1,
        ENABLE_CENTER_ESC: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1
    });

    assert.strictEqual(ConfigStore.get("ql_ui_controls", "SUPPORT_16_10"), true);
    assert.strictEqual(ConfigStore.get("ql_ui_controls", "ENABLE_CENTER_ESC"), true);

    // 3. Top bar multitoggle options coerced in ConfigStore
    assert.strictEqual(ConfigStore.get("ql_topbar", "ENABLE_TOPBAR_ENEMY_HP_WARNING_25"), true);
    assert.strictEqual(ConfigStore.get("ql_topbar", "ENABLE_TOPBAR_ENEMY_HP_WARNING_65"), true);
    assert.strictEqual(ConfigStore.get("ql_topbar", "ENABLE_TOPBAR_ENEMY_HP_WARNING_75"), false);
});


