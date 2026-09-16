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

test("Minecraft healthbar parses health from currentHealthOverHearts and tracks stamina charges for hunger", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    assert.ok(Q.healthbar && Q.healthbar.mc, "QOL.healthbar.mc must exist");
    assert.strictEqual(typeof Q.healthbar.mc.update, "function", "QOL.healthbar.mc.update must be a function");

    const root = hud.root;

    // Build Minecraft healthbar DOM
    const healthContainerRoot = $.CreatePanel("Panel", root, "HealthContainerRoot");
    const heartsRoot = $.CreatePanel("Panel", healthContainerRoot, "MinecraftHeartsRoot");
    const heartsContainer = $.CreatePanel("Panel", heartsRoot, "MinecraftHeartsContainer");
    const numbersContainer = $.CreatePanel("Panel", heartsContainer, "MinecraftHeartsHealthNumbersContainer");
    const numbers = $.CreatePanel("Panel", numbersContainer, "MinecraftHeartsHealthNumbers");
    const currentHealthLabel = $.CreatePanel("Label", numbers, "currentHealthOverHearts");
    currentHealthLabel.text = "750";
    const totalHealthLabel = $.CreatePanel("Label", numbers, "totalHealthOverHearts");
    totalHealthLabel.text = "/ 1000";
    const percentLabel = $.CreatePanel("Label", numbers, "MinecraftHealthPercent");
    const heartsGrid = $.CreatePanel("Panel", heartsContainer, "MinecraftHearts");
    const foodContainer = $.CreatePanel("Panel", heartsContainer, "MinecraftFoodContainer");
    for (let i = 0; i < 10; i++) {
        const icon = $.CreatePanel("Image", foodContainer, "");
        icon.AddClass("FoodIcon");
    }

    // Build stamina reticle container with .ability_element_charges
    const abilityElem = $.CreatePanel("Panel", root, "");
    abilityElem.AddClass("ability_element_charges");
    const chargesContainer = $.CreatePanel("Panel", abilityElem, "charges_container");
    const charge1 = $.CreatePanel("Panel", chargesContainer, "charge1");
    charge1.AddClass("charge");
    charge1.AddClass("has_charge");
    const chargeFg1 = $.CreatePanel("Panel", charge1, "");
    chargeFg1.AddClass("charge_fg");

    const charge2 = $.CreatePanel("Panel", chargesContainer, "charge2");
    charge2.AddClass("charge");
    charge2.AddClass("has_charge");
    const chargeFg2 = $.CreatePanel("Panel", charge2, "");
    chargeFg2.AddClass("charge_fg");

    const charge3 = $.CreatePanel("Panel", chargesContainer, "charge3");
    charge3.AddClass("charge");
    charge3.AddClass("has_charge");
    const chargeFg3 = $.CreatePanel("Panel", charge3, "");
    chargeFg3.AddClass("charge_fg");

    // 1. Initial tick with full stamina (no charging)
    Q.healthbar.mc.update(root, { HEALTHBAR_TYPE: 5, ENABLE_MINECRAFT_HEALTH_NUMBERS: 1 }, 1000, true);

    assert.strictEqual(percentLabel.text.trim(), "[75%]", "Percent label should calculate 750/1000 = 75%");
    // 750 HP = 15 half segments = 8 hearts (7 full + 1 half)
    assert.ok(heartsGrid.Children().length > 0, "Hearts grid should contain heart rows");

    // 2. Dash used: charge3 is charging (recharging with 50% clip angle: 13deg out of 26deg)
    charge3.AddClass("charging");
    chargeFg3.style = { clip: "radial( 50% 50%, 0deg, 13deg )" };

    Q.healthbar.mc.update(root, { HEALTHBAR_TYPE: 5, ENABLE_MINECRAFT_HEALTH_NUMBERS: 0 }, 2000, true);

    // 2 full charges (1.0 each) + 1 charging (13/26 = 0.5) = 2.5 / 3 = 83% hunger
    const foodIcons = foodContainer.Children();
    assert.strictEqual(foodIcons.length, 10, "10 food icons must exist");
});



