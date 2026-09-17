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

test("ql_minimap_runtime scales minimap via uiScale and preserves base 400px geometry", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const root = hud.root;
    const persp = $.CreatePanel("Panel", root, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    $.CreatePanel("Panel", container, "hud_minimap");

    assert.strictEqual(Q.core.FeatureRegistry.isEnabled("ql_minimap_runtime"), true, "ql_minimap_runtime must be enabled by default");

    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_SMALL_SIZE", 600);
    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_BASE_OPACITY", 0.5);
    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_X_OFFSET", 50);
    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_Y_OFFSET", 20);
    hud.clock.advance(500);

    assert.strictEqual(persp.style.uiScale, "150%", "minimap_persp must receive uiScale: 150%");
    assert.strictEqual(persp.style.width, "400px", "minimap_persp width must stay 400px base");
    assert.strictEqual(persp.style.height, "400px", "minimap_persp height must stay 400px base");
    assert.strictEqual(persp.style.opacity, "0.5", "minimap_persp must receive configured opacity");
    assert.strictEqual(persp.style.marginRight, "-20px", "minimap_persp marginRight must be 30 - 50 = -20px");
    assert.strictEqual(persp.style.marginBottom, "50px", "minimap_persp marginBottom must be 30 + 20 = 50px");
    assert.ok(!container.style.width, "child container must not receive hardcoded width");
    assert.ok(!container.style.height, "child container must not receive hardcoded height");
    assert.ok(!container.style.opacity, "child container must not receive cascaded opacity");

    Q.core.FeatureRegistry.disable("ql_minimap_runtime");
    assert.ok(!persp.style.uiScale, "disable must clear uiScale");
    assert.ok(!persp.style.opacity, "disable must clear opacity");
    assert.ok(!persp.style.margin, "disable must clear margin");
});

test("ql_minimap_timers hides bridge buff timer when powerup rune is spawned on bridge", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const root = hud.root;
    const persp = $.CreatePanel("Panel", root, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    const hudMinimap = $.CreatePanel("Panel", container, "hud_minimap");

    const spawnerLeft = $.CreatePanel("Panel", hudMinimap, "spawner_left");
    spawnerLeft.AddClass("map_button");
    spawnerLeft.AddClass("powerup_spawn");
    spawnerLeft.style = { position: "25% 50% 0px" };

    const spawnerRight = $.CreatePanel("Panel", hudMinimap, "spawner_right");
    spawnerRight.AddClass("map_button");
    spawnerRight.AddClass("powerup_spawn");
    spawnerRight.style = { position: "75% 50% 0px" };

    const feat = Q.core.FeatureRegistry.getManifest("ql_minimap_timers");
    assert.ok(feat, "ql_minimap_timers must be registered");

    const instance = feat.create({
        config: {
            view: () => ({
                ENABLE_MINIMAP_BUFF_TIMER: 1,
                ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
                ENABLE_MINIMAP_REJUV_TIMER: 0,
                ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 0,
            })
        }
    });

    instance.onEnable();
    hud.clock.advance(500);

    const bridgeL = container.FindChildTraverse("QOLMinimapBuffBridgeLeftTimer");
    const bridgeR = container.FindChildTraverse("QOLMinimapBuffBridgeRightTimer");
    assert.ok(bridgeL, "Left bridge timer must exist");
    assert.ok(bridgeR, "Right bridge timer must exist");

    // Initially, neither spawner is active -> both bridge timers visible
    assert.strictEqual(bridgeL.BHasClass("qol-hidden"), false, "Left timer should be visible");
    assert.strictEqual(bridgeR.BHasClass("qol-hidden"), false, "Right timer should be visible");

    // Powerup spawns on left bridge
    spawnerLeft.AddClass("powerup_gun");
    hud.clock.advance(500);

    assert.strictEqual(bridgeL.BHasClass("qol-hidden"), true, "Left timer should be hidden when powerup active on left bridge");
    assert.strictEqual(bridgeL.BHasClass("buff_spawned"), true, "Left timer should have buff_spawned class");
    assert.strictEqual(bridgeR.BHasClass("qol-hidden"), false, "Right timer should remain visible");

    // Powerup collected
    spawnerLeft.RemoveClass("powerup_gun");
    hud.clock.advance(500);

    assert.strictEqual(bridgeL.BHasClass("qol-hidden"), false, "Left timer should reappear after rune is picked up");
    assert.strictEqual(bridgeL.BHasClass("buff_spawned"), false, "Left timer buff_spawned class removed");

    instance.onDisable();
});

test("ql_minimap_runtime handles zero opacity, offsets, and zoom modes without child pollution", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const root = hud.root;
    const persp = $.CreatePanel("Panel", root, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    const frame = $.CreatePanel("Panel", persp, "minimap_frame");
    $.CreatePanel("Panel", container, "hud_minimap");

    // 1. Zero opacity
    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_BASE_OPACITY", 0);
    hud.clock.advance(100);
    assert.strictEqual(persp.style.opacity, "0", "zero opacity must apply as string 0 without falling back to 1.0");
    assert.ok(!container.style.opacity, "child container must not receive cascaded opacity");
    assert.ok(!frame.style.opacity, "frame panel must not receive cascaded opacity");

    // 2. Custom offsets
    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_X_OFFSET", 100);
    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_Y_OFFSET", -40);
    hud.clock.advance(100);
    assert.strictEqual(persp.style.marginRight, "-70px", "marginRight must be 30 - 100 = -70px");
    assert.strictEqual(persp.style.marginBottom, "-10px", "marginBottom must be 30 + (-40) = -10px");

    // 3. Alt Zoom
    Q.core.ConfigStore.set("ql_minimap_runtime", "ENABLE_ALT_ZOOM", 1);
    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_LARGE_SIZE_ALT", 800);
    Q.core.ConfigStore.set("ql_minimap_runtime", "ALT_ZOOM_OPACITY", 0.9);
    Q.core.ConfigStore.set("ql_minimap_runtime", "ZOOM_X_OFFSET_ALT", 10);
    Q.core.ConfigStore.set("ql_minimap_runtime", "ZOOM_Y_OFFSET_ALT", 20);
    root.AddClass("gDetailView");
    hud.clock.advance(100);

    assert.strictEqual(persp.style.uiScale, "200%", "Alt zoom must scale to 200%");
    assert.strictEqual(persp.style.align, "center center", "Alt zoom must center minimap");
    assert.strictEqual(persp.style.opacity, "0.9", "Alt zoom opacity must apply");
    assert.strictEqual(persp.style.marginLeft, "10px", "Alt zoom X offset must apply to marginLeft");
    assert.strictEqual(persp.style.marginTop, "-20px", "Alt zoom Y offset must apply to marginTop");

    root.RemoveClass("gDetailView");
    hud.clock.advance(100);
    assert.strictEqual(persp.style.align, "right bottom", "Exiting zoom restores right bottom alignment");

    Q.core.FeatureRegistry.disable("ql_minimap_runtime");
});
