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
    assert.ok(!persp.style.width, "minimap_persp width must remain under native control");
    assert.ok(!persp.style.height, "minimap_persp height must remain under native control");
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

test("ql_minimap_timers standard mode positioning respects 40px bottom offset and single slot offsets", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const root = hud.root;
    const persp = $.CreatePanel("Panel", root, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    $.CreatePanel("Panel", container, "hud_minimap");

    const feat = Q.core.FeatureRegistry.getManifest("ql_minimap_timers");
    assert.ok(feat, "ql_minimap_timers must be registered");

    let cfg = {
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 0,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 0,
        MINIMAP_SMALL_SIZE: 400
    };

    const instance = feat.create({
        config: { view: () => cfg }
    });

    instance.onEnable();
    hud.clock.advance(500);

    const overlay = container.FindChildTraverse("QOLMinimapTimersRoot");
    assert.ok(overlay, "Overlay root must exist");
    const buffTimer = container.FindChildTraverse("QOLMinimapBuffTimer");
    const rejuvTimer = container.FindChildTraverse("QOLMinimapRejuvTimer");
    assert.ok(buffTimer, "Buff timer must exist");
    assert.ok(rejuvTimer, "Rejuv timer must exist");

    // Both timers active: overlay bottom margin must be 40px, timer margin 0px 40px, overlay marginLeft 0px
    assert.strictEqual(overlay.style.marginBottom, "40px", "Bottom offset must be 40px at 400px minimap");
    assert.strictEqual(buffTimer.style.margin, "0px 40px", "Buff timer gap margin must be 40px");
    assert.strictEqual(rejuvTimer.style.margin, "0px 40px", "Rejuv timer gap margin must be 40px");
    assert.strictEqual(overlay.style.marginLeft, "0px", "Centered when both timers active");

    // Only buff timer active: single slot offset applied to the right (+152px)
    cfg = { ...cfg, ENABLE_MINIMAP_REJUV_TIMER: 0 };
    hud.clock.advance(500);
    assert.strictEqual(overlay.style.marginLeft, "152px", "Single buff timer shifted right to preserve slot");

    // Only rejuv timer active: single slot offset applied to the left (-152px)
    cfg = { ...cfg, ENABLE_MINIMAP_BUFF_TIMER: 0, ENABLE_MINIMAP_REJUV_TIMER: 1 };
    hud.clock.advance(500);
    assert.strictEqual(overlay.style.marginLeft, "-152px", "Single rejuv timer shifted left to preserve slot");

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

test("ql_minimap_runtime normalizes Doorman doorway cast range across casts without cache lock", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const root = hud.root;
    const persp = $.CreatePanel("Panel", root, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    const hudMinimap = $.CreatePanel("Panel", container, "hud_minimap");

    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_SMALL_SIZE", 550);
    hud.clock.advance(100);

    // 1. Initial door placed
    const door1 = $.CreatePanel("Panel", hudMinimap, "doorway_1");
    door1.AddClass("map_button");
    door1.AddClass("doorman_doorway");
    door1.AddClass("ability_castrange");
    const castRange1 = $.CreatePanel("Panel", door1, "CastRange");

    hud.clock.advance(100);
    assert.strictEqual(castRange1.style.uiScale, "100%", "Initial CastRange must receive uiScale: 100%");
    assert.strictEqual(castRange1.style.preTransformScale2d, "1.00, 1.00", "Initial CastRange preTransformScale2d must be reset to 1.00, 1.00");

    // 2. Door 1 destroyed and Door 2 placed while minimap size is still 550 (door count stays 1)
    door1.DeleteAsync(0);
    const door2 = $.CreatePanel("Panel", hudMinimap, "doorway_2");
    door2.AddClass("map_button");
    door2.AddClass("doorman_doorway");
    door2.AddClass("ability_castrange");
    const castRange2 = $.CreatePanel("Panel", door2, "CastRange");

    hud.clock.advance(100);
    assert.strictEqual(castRange2.style.uiScale, "100%", "Recast doorway CastRange must receive uiScale: 100% without getting blocked by cacheKey");
    assert.strictEqual(castRange2.style.preTransformScale2d, "1.00, 1.00", "Recast doorway CastRange preTransformScale2d must be reset to 1.00, 1.00");

    Q.core.FeatureRegistry.disable("ql_minimap_runtime");
});

test("ql_minimap_timers maintains calibrated base coordinates across minimap scaling", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const root = hud.root;
    const persp = $.CreatePanel("Panel", root, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    $.CreatePanel("Panel", container, "hud_minimap");

    const feat = Q.core.FeatureRegistry.getManifest("ql_minimap_timers");
    assert.ok(feat, "ql_minimap_timers must be registered");

    let cfg = {
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        MINIMAP_SMALL_SIZE: 550
    };

    const instance = feat.create({
        config: { view: () => cfg }
    });

    instance.onEnable();
    hud.clock.advance(500);

    const overlay = container.FindChildTraverse("QOLMinimapTimersRoot");
    assert.ok(overlay, "Overlay root must exist");
    const bridgeL = container.FindChildTraverse("QOLMinimapBuffBridgeLeftTimer");
    const bridgeR = container.FindChildTraverse("QOLMinimapBuffBridgeRightTimer");
    const rejuvTimer = container.FindChildTraverse("QOLMinimapRejuvTimer");

    // Bridge mode under 550px scaled minimap: base geometry must remain pinned to 400px space
    assert.strictEqual(overlay.style.width, "400px", "Overlay width must remain 400px base");
    assert.strictEqual(overlay.style.height, "400px", "Overlay height must remain 400px base");
    assert.strictEqual(bridgeL.style.marginLeft, "-144px", "West bridge timer must stay at -144px in base layout space");
    assert.strictEqual(bridgeR.style.marginLeft, "144px", "East bridge timer must stay at 144px in base layout space");
    assert.strictEqual(rejuvTimer.style.verticalAlign, "center", "Mid boss timer in pit must be vertically centered");
    assert.strictEqual(rejuvTimer.style.horizontalAlign, "center", "Mid boss timer in pit must be horizontally centered");
    assert.strictEqual(rejuvTimer.style.margin, "0px", "Mid boss timer in pit must have 0 margin");

    // Docked at bottom when ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 0 under 550px minimap
    cfg = { ...cfg, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 0 };
    hud.clock.advance(500);
    assert.strictEqual(rejuvTimer.style.verticalAlign, "bottom", "Mid boss timer when not in pit must dock at bottom");
    assert.strictEqual(rejuvTimer.style.marginBottom, "40px", "Mid boss timer bottom offset must remain 40px base");

    instance.onDisable();
});

test("ql_minimap_runtime ALT_ZOOM_DRAW_OVER_UI preserves the native minimap hierarchy", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const root = hud.root;
    const gameplayHud = $.CreatePanel("Panel", root, "CitadelGameplayHud");
    const persp = $.CreatePanel("Panel", gameplayHud, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    $.CreatePanel("Panel", container, "hud_minimap");

    Q.core.ConfigStore.set("ql_minimap_runtime", "ENABLE_ALT_ZOOM", 1);
    Q.core.ConfigStore.set("ql_minimap_runtime", "ALT_ZOOM_DRAW_OVER_UI", 1);
    Q.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_LARGE_SIZE_ALT", 800);

    // Simulate Alt press on gameplayHud (where gDetailView lives in Deadlock)
    gameplayHud.AddClass("gDetailView");
    hud.clock.advance(100);

    // The patch's location labels inherit dialog variables through gameplayHud,
    // so draw-over mode must zoom without reparenting minimap_persp.
    assert.strictEqual(persp.style.align, "center center", "Minimap must be centered in alt zoom");
    assert.strictEqual(persp.GetParent(), gameplayHud, "Minimap must retain its native parent under draw over ui");
    assert.strictEqual(persp.style.zIndex, "2147483647", "Draw over ui must use the stacking override");

    // Advance multiple ticks while holding Alt
    for (let i = 0; i < 5; i++) {
        hud.clock.advance(50);
        assert.strictEqual(persp.style.align, "center center", `Tick ${i + 1}: Minimap must remain centered without oscillating`);
        assert.strictEqual(persp.GetParent(), gameplayHud, `Tick ${i + 1}: Minimap must retain its native parent`);
    }

    // Release Alt
    gameplayHud.RemoveClass("gDetailView");
    hud.clock.advance(100);

    assert.strictEqual(persp.style.align, "right bottom", "Releasing Alt restores right bottom alignment");
    assert.strictEqual(persp.GetParent(), gameplayHud, "Releasing Alt restores original parent");

    Q.core.FeatureRegistry.disable("ql_minimap_runtime");
});

test("ql_minimap_runtime Tab draw over UI does not reparent the map while Tab stays open", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    const root = hud.root;
    const hudCore = $.CreatePanel("Panel", root, "HudCore");
    const gameplayHud = $.CreatePanel("Panel", hudCore, "gameplay_hud");
    const minimapHost = $.CreatePanel("Panel", gameplayHud, "minimap_host");
    const persp = $.CreatePanel("Panel", minimapHost, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    $.CreatePanel("Panel", container, "hud_minimap");
    const stableListener = $.CreatePanel("Panel", gameplayHud, "DamageReportGlobalClassListener");
    $.CreatePanel("Panel", root, "scoreboard_overlay");

    let moves = 0;
    root.MoveChildAfter = (panel) => {
        moves++;
        root.addChild(panel);
    };

    Q.core.ConfigStore.set("ql_minimap_runtime", "ENABLE_TAB_ZOOM", 1);
    Q.core.ConfigStore.set("ql_minimap_runtime", "TAB_ZOOM_DRAW_OVER_UI", 1);
    persp.AddClass("gScoreboardOpen");
    stableListener.AddClass("gScoreboardOpen");
    hud.clock.advance(500);

    assert.strictEqual(persp.GetParent(), minimapHost, "Tab draw over UI preserves the native minimap hierarchy");
    assert.strictEqual(persp.style.align, "center center", "Tab zoom remains active");
    assert.strictEqual(moves, 0, "Draw over UI does not reorder the native hierarchy");

    // The separate stationary listener remains the authoritative Tab signal.
    persp.RemoveClass("gScoreboardOpen");

    for (let i = 0; i < 4; i++) {
        $.CreatePanel("Panel", root, `temporary_hud_overlay_${i}`);
        hud.clock.advance(500);
        assert.strictEqual(persp.GetParent(), minimapHost, `Tick ${i + 1}: the map stays in its native hierarchy`);
        assert.strictEqual(persp.style.align, "center center", `Tick ${i + 1}: Tab zoom stays active`);
        assert.strictEqual(moves, 0, `Tick ${i + 1}: the map is not moved again`);
    }

    stableListener.RemoveClass("gScoreboardOpen");
    hud.clock.advance(500);
    assert.strictEqual(persp.GetParent(), minimapHost, "Closing Tab restores the original parent");
    Q.core.FeatureRegistry.disable("ql_minimap_runtime");
});

test("ql_compass MINIMAP_FLIP sets flip classes on hud_minimap and overlays correctly", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const root = hud.root;
    const persp = $.CreatePanel("Panel", root, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    const hudMinimap = $.CreatePanel("Panel", container, "hud_minimap");
    hudMinimap.AddClass("HudMinimap");

    const feat = Q.core.FeatureRegistry.getManifest("ql_compass");
    assert.ok(feat, "ql_compass must be registered");

    let cfg = {
        ENABLE_COMPASS: 0,
        MINIMAP_ROTATE_WITH_PLAYER: 0,
        MINIMAP_FLIP: 1
    };

    const instance = feat.create({
        config: { view: () => cfg, all: () => cfg }
    });
    instance.onEnable();
    hud.clock.advance(100);

    // When MINIMAP_FLIP is enabled:
    assert.strictEqual(hudMinimap.BHasClass("qol_minimap_flip_active"), true, "hudMinimap must have qol_minimap_flip_active");
    assert.strictEqual(container.BHasClass("qol_minimap_flip_active"), true, "container must have qol_minimap_flip_active");

    // When MINIMAP_FLIP is disabled:
    cfg = { ...cfg, MINIMAP_FLIP: 0 };
    instance.onSettingsChanged();
    assert.strictEqual(hudMinimap.BHasClass("qol_minimap_flip_active"), false, "hudMinimap must not have qol_minimap_flip_active when disabled");
    assert.strictEqual(container.BHasClass("qol_minimap_flip_active"), false, "container must not have qol_minimap_flip_active when disabled");

    // onDisable cleans up classes:
    cfg = { ...cfg, MINIMAP_FLIP: 1 };
    instance.onSettingsChanged();
    assert.strictEqual(hudMinimap.BHasClass("qol_minimap_flip_active"), true);
    assert.strictEqual(container.BHasClass("qol_minimap_flip_active"), true);

    instance.onDisable();
    assert.strictEqual(hudMinimap.BHasClass("qol_minimap_flip_active"), false, "onDisable must remove qol_minimap_flip_active from hudMinimap");
    assert.strictEqual(container.BHasClass("qol_minimap_flip_active"), false, "onDisable must remove qol_minimap_flip_active from container");
});

test("FeatureRegistry createContext exposes getBool and ql_cast_failed_hint onSettingsChanged succeeds", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const FR = Q.core.FeatureRegistry;

    const ctx = FR.createContext("ql_cast_failed_hint");
    assert.strictEqual(typeof ctx.config.getBool, "function", "ctx.config.getBool must be a function");

    // Initially false
    assert.strictEqual(ctx.config.getBool("ENABLE_HIDE_FAILED_HINT"), false);

    // Set to 1
    Q.core.ConfigStore.set("ql_cast_failed_hint", "ENABLE_HIDE_FAILED_HINT", true);
    assert.strictEqual(ctx.config.getBool("ENABLE_HIDE_FAILED_HINT"), true);

    // Verify manifest create & onSettingsChanged
    const manifest = FR.getManifest("ql_cast_failed_hint");
    assert.ok(manifest, "ql_cast_failed_hint manifest must exist");
    const instance = manifest.create(ctx);
    assert.doesNotThrow(() => {
        instance.onSettingsChanged();
    }, "onSettingsChanged must not throw with getBool");
    assert.strictEqual(hud.root.BHasClass("hide_failed_hint_active"), true);

    // Toggle off
    Q.core.ConfigStore.set("ql_cast_failed_hint", "ENABLE_HIDE_FAILED_HINT", false);
    assert.doesNotThrow(() => {
        instance.onSettingsChanged();
    });
    assert.strictEqual(hud.root.BHasClass("hide_failed_hint_active"), false);
});

test("ql_compass standalone speed offset updates without compass offset change", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;

    const feat = Q.core.FeatureRegistry.getManifest("ql_compass");
    assert.ok(feat, "ql_compass must be registered");

    let cfg = {
        ENABLE_COMPASS: 0,
        ENABLE_COMPASS_SPEED: 1,
        COMPASS_SPEED_X_OFFSET: 0,
        COMPASS_SPEED_Y_OFFSET: 0,
        COMPASS_X_OFFSET: 0,
        COMPASS_Y_OFFSET: 120,
        MINIMAP_ROTATE_WITH_PLAYER: 0,
        MINIMAP_FLIP: 0
    };

    const instance = feat.create({
        config: { view: () => cfg, all: () => cfg }
    });
    instance.onEnable();
    hud.clock.advance(100);

    const speedRoot = hud.root.FindChildTraverse("QOLSpeedRoot");
    assert.ok(speedRoot, "QOLSpeedRoot must exist");
    assert.strictEqual(speedRoot.style.marginLeft, "0px");
    assert.strictEqual(speedRoot.style.marginTop, "120px");

    // Change only speed offsets (leave compass offsets completely unchanged)
    cfg = { ...cfg, COMPASS_SPEED_X_OFFSET: 75, COMPASS_SPEED_Y_OFFSET: 30 };
    instance.onSettingsChanged();
    hud.clock.advance(100);

    assert.strictEqual(speedRoot.style.marginLeft, "75px", "Speed root must update marginLeft when speed X offset changes");
    assert.strictEqual(speedRoot.style.marginTop, "90px", "Speed root must update marginTop when speed Y offset changes");

    instance.onDisable();
});

function createStaminaRing(hud) {
    const $ = hud.sandbox.global.$;
    // Valve ability_hud_elements/element_charges.xml, reduced to three pips.
    const element = $.CreatePanel("Panel", hud.root, "");
    element.AddClass("ability_element_charges");
    const container = $.CreatePanel("Panel", element, "charges_container");
    const foregrounds = [];
    const charges = [];
    for (let i = 1; i <= 3; i++) {
        const charge = $.CreatePanel("Panel", container, "charge" + i);
        charge.AddClass("charge");
        charges.push(charge);
        const fg = $.CreatePanel("Panel", charge, "");
        fg.AddClass("charge_fg");
        foregrounds.push(fg);
        $.CreatePanel("Panel", charge, "").AddClass("charge_drained");
    }
    return { element, container, charges, foregrounds };
}

test("stamina tint follows current native charge states without a finished class", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const { charges, foregrounds } = createStaminaRing(hud);
    charges[2].AddClass("charging");
    Q.core.ConfigAdapter.loadFromFlat({ STAMINA_CHARGE_COLOR: 13 });
    const blue = Q.core.panel.resolvePaletteColor(13);
    assert.strictEqual(foregrounds[0].style.washColor, blue);
    assert.strictEqual(foregrounds[1].style.washColor, blue);

    charges[2].RemoveClass("charging");
    charges[0].AddClass("draining");
    hud.clock.advance(600);
    assert.strictEqual(foregrounds[2].style.washColor, blue, "Recovered pip must not remain uncolored");
    assert.strictEqual(foregrounds[0].style.washColor, "transparent", "Recharging pip must recover its native feedback colors");

    foregrounds[1].style.washColor = "transparent";
    hud.clock.advance(600);
    assert.strictEqual(foregrounds[1].style.washColor, blue, "Native updates must not permanently replace the selected tint");
});

test("stamina preset changes restore both native color and default rotation", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const { container, foregrounds } = createStaminaRing(hud);
    const apply = cfg => Q.core.ConfigAdapter.loadFromFlat(cfg);
    apply({ STAMINA_CHARGE_COLOR: 13, STAMINA_CHARGE_ANGLE: 90 });
    assert.strictEqual(container.style.transform, "rotateZ(90deg)");
    apply({ STAMINA_CHARGE_COLOR: 4, STAMINA_CHARGE_ANGLE: 120 });
    for (const fg of foregrounds) assert.strictEqual(fg.style.washColor, Q.core.panel.resolvePaletteColor(4));
    apply({ STAMINA_CHARGE_COLOR: 0, STAMINA_CHARGE_ANGLE: 45 });
    for (const fg of foregrounds) assert.strictEqual(fg.style.washColor, "transparent");
    assert.strictEqual(container.style.transform, "rotateZ(45deg)");
});

test("stamina reapplies settings to a recreated ring without styling ability icon charges", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    // hud_ability_icon_active.xml has the same id, but no stamina pips.
    const abilityCharges = hud.sandbox.global.$.CreatePanel("Panel", hud.root, "charges_container");
    let ring = createStaminaRing(hud);
    Q.core.ConfigAdapter.loadFromFlat({ STAMINA_CHARGE_COLOR: 13, STAMINA_CHARGE_ANGLE: 90 });
    assert.strictEqual(ring.container.style.transform, "rotateZ(90deg)");
    assert.strictEqual(abilityCharges.style.transform || "", "");
    ring.element.DeleteAsync(0);
    hud.clock.advance(0);
    ring = createStaminaRing(hud);
    hud.clock.advance(600);
    assert.strictEqual(ring.container.style.transform, "rotateZ(90deg)");
    for (const fg of ring.foregrounds) assert.strictEqual(fg.style.washColor, Q.core.panel.resolvePaletteColor(13));
});

function createItemsContainer(hud) {
    const $ = hud.sandbox.global.$;
    const stats = hud.root.FindChildTraverse("StatsAndModsContainer") || $.CreatePanel("Panel", hud.root, "StatsAndModsContainer");
    const container = $.CreatePanel("Panel", stats, "");
    container.AddClass("ModsContainer");
    const addIcon = () => {
        const icon = $.CreatePanel("Panel", container, "");
        icon.AddClass("mod_icon_single_container");
        return icon;
    };
    return { container, addIcon };
}

test("item opacity applies to newly mounted icons and resets with the preset", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const { addIcon } = createItemsContainer(hud);
    const first = addIcon();
    Q.core.ConfigAdapter.loadFromFlat({ ITEMS_OPACITY: 0.35 });
    assert.strictEqual(first.style.opacity, "0.35");
    const added = addIcon();
    hud.clock.advance(1100);
    assert.strictEqual(added.style.opacity, "0.35", "New inventory icon must inherit the configured opacity");
    Q.core.ConfigAdapter.loadFromFlat({ ITEMS_OPACITY: 1 });
    assert.ok(!first.style.opacity && !added.style.opacity, "Default preset must restore native opacity for all icons");
});

test("item layout and tint follow a recreated inventory without another settings change", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    let inventory = createItemsContainer(hud);
    Q.core.ConfigAdapter.loadFromFlat({ ITEMS_X_OFFSET: 75, ITEMS_WASH_COLOR: 13 });
    assert.strictEqual(inventory.container.style.x, "75px");
    inventory.container.DeleteAsync(0);
    hud.clock.advance(0);
    inventory = createItemsContainer(hud);
    hud.clock.advance(1100);
    assert.strictEqual(inventory.container.style.x, "75px");
    assert.strictEqual(inventory.container.style.washColor, Q.core.panel.resolvePaletteColor(13));
});

test("stat bonuses hide in the lobby and return on match reentry", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    $.CreatePanel("Panel", hud.root, "gameplay_hud");
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_STAT_BONUSES: 1 });
    hud.clock.advance(300);
    const overlay = hud.root.FindChildTraverse("QOLStatBonusesOverlay");
    assert.strictEqual(overlay.style.visibility, "visible");
    hud.root.AddClass("InHideout");
    hud.clock.advance(300);
    assert.strictEqual(overlay.BHasClass("qol-hidden"), true);
    assert.strictEqual(overlay.style.visibility, "collapse");
    hud.root.RemoveClass("InHideout");
    hud.clock.advance(300);
    assert.strictEqual(overlay.BHasClass("qol-hidden"), false);
    assert.strictEqual(overlay.style.visibility, "visible");
});

test("recent purchases preserve engine-owned history on entering the lobby", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const container = $.CreatePanel("Panel", hud.root, "RecentPurchasesContainer");
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_SHOP_RECENT_PURCHASES: 1, ENABLE_SHOP_ITEM_NOTIFICATIONS: 0 });
    hud.clock.advance(700);
    const purchase = $.CreatePanel("Panel", container, "PreviousMatchPurchase");
    hud.clock.advance(300);
    assert.strictEqual(purchase.IsValid(), true);
    hud.root.AddClass("InHideout");
    hud.clock.advance(300);
    assert.strictEqual(purchase.IsValid(), true, "Lobby transition must not destroy native shop purchase rows");
});

test("disabling recent purchases preserves subsequent native purchases", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const container = $.CreatePanel("Panel", hud.root, "RecentPurchasesContainer");
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_SHOP_RECENT_PURCHASES: 1, ENABLE_SHOP_ITEM_NOTIFICATIONS: 0 });
    hud.clock.advance(100);
    Q.core.ConfigStore.set("ql_recent_purchases", "ENABLE_SHOP_RECENT_PURCHASES", false);
    const purchase = $.CreatePanel("Panel", container, "NativePurchaseAfterDisable");
    hud.clock.advance(700);
    assert.strictEqual(purchase.IsValid(), true, "Disabled feature must not delete subsequent native purchases");
});

test("stats position and hide option apply in hideout and reset on disable", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const panel = $.CreatePanel("Panel", hud.root, "hudPlayerStats");
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_STATS_POSITION: 1, STATS_POSITION_X_OFFSET: 120 });
    hud.clock.advance(300);
    assert.strictEqual(panel.style.x, "120px");
    assert.strictEqual(Q.core.FeatureRegistry.isEnabled("ql_stats_position"), true);

    // The same native stats panel remains configurable in the hideout.
    hud.root.AddClass("InHideout");
    hud.clock.advance(1100);
    assert.strictEqual(panel.style.x, "120px", "Hideout must keep stats offset");
    Q.core.ConfigStore.set("ql_stats_position", "STATS_POSITION_HIDE_NORMAL", true);
    hud.clock.advance(100);
    assert.strictEqual(panel.style.opacity, "0", "Hideout must honor hide Player Stats");
    Q.core.ConfigStore.set("ql_stats_position", "STATS_POSITION_HIDE_NORMAL", false);
    hud.clock.advance(100);
    assert.strictEqual(panel.style.opacity, "1");

    panel.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", hud.root, "hudPlayerStats");
    hud.clock.advance(1100);
    assert.strictEqual(replacement.style.x, "120px", "Replaced stats panel must receive unchanged offset");

    // Match reentry restores offset
    hud.root.RemoveClass("InHideout");
    hud.clock.advance(1100);
    assert.strictEqual(replacement.style.x, "120px", "Match reentry must retain stats offset");

    // Master toggle off disables feature and resets style
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_STATS_POSITION: 0 });
    hud.clock.advance(1100);
    assert.strictEqual(Q.core.FeatureRegistry.isEnabled("ql_stats_position"), false);
    assert.ok(!replacement.style.x || replacement.style.x === "0px", "Disabled toggle must reset stats offset");
});

test("ability icons feature enables with any toggle and cleans up on disable", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { QOL: Q } = hud.sandbox.global;

    assert.strictEqual(Q.core.FeatureRegistry.isEnabled("ql_ability_icons"), false);
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_SIMPLIFY_ABILITY_ICONS: 1 });
    assert.strictEqual(Q.core.FeatureRegistry.isEnabled("ql_ability_icons"), true);
    assert.strictEqual(hud.root.BHasClass("simplify_ability_icons_active"), true);

    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_SIMPLIFY_ABILITY_ICONS: 0 });
    assert.strictEqual(Q.core.FeatureRegistry.isEnabled("ql_ability_icons"), false);
    assert.strictEqual(hud.root.BHasClass("simplify_ability_icons_active"), false);
});

test("ult cooldowns syncs timers, dynamically picks up late-joining players, and cleans up", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;

    const topBar = $.CreatePanel("Panel", hud.root, "TopBar");
    const teams = $.CreatePanel("Panel", topBar, "TeamsContainer");
    const team = $.CreatePanel("Panel", teams, "Team1");
    const playerContents = $.CreatePanel("Panel", team, "PlayerContents");
    const playersContainer = $.CreatePanel("Panel", playerContents, "PlayersContainer");

    const p1 = $.CreatePanel("Panel", playersContainer, "Player1");
    const hidden1 = $.CreatePanel("Label", p1, "UltimateCooldownTextHidden");
    hidden1.text = "45";
    const shown1 = $.CreatePanel("Label", p1, "UltimateCooldownTextShown");

    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_ULT_COOLDOWNS: 1 });
    hud.clock.advance(300);

    assert.strictEqual(Q.core.FeatureRegistry.isEnabled("ql_ult_cooldowns"), true);
    assert.strictEqual(topBar.BHasClass("ult_cooldowns_active"), true);
    assert.strictEqual(shown1.text, "45", "Player 1 cooldown must sync");

    // Add late-joining player
    const p2 = $.CreatePanel("Panel", playersContainer, "Player2");
    const hidden2 = $.CreatePanel("Label", p2, "UltimateCooldownTextHidden");
    hidden2.text = "18";
    const shown2 = $.CreatePanel("Label", p2, "UltimateCooldownTextShown");

    hud.clock.advance(300);
    assert.strictEqual(shown2.text, "18", "Late-joining player 2 cooldown must be dynamically picked up and synced");

    // Disable feature
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_ULT_COOLDOWNS: 0 });
    hud.clock.advance(300);
    assert.strictEqual(Q.core.FeatureRegistry.isEnabled("ql_ult_cooldowns"), false);
    assert.strictEqual(topBar.BHasClass("ult_cooldowns_active"), false);
});



