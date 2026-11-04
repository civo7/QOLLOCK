"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHud } = require("../scripts/simulator");
const { inspect } = require("../scripts/trace_style_sources");
const gunData = require("./helpers/native_gun");

const scenarios = [
    { id: "ql_healthbar", key: "HEALTHBAR_TYPE", value: 5, ownClass: "minecraft_healthbar_active" },
    { id: "ql_compass", key: "ENABLE_COMPASS", value: true, ownClass: "compass_active" },
    { id: "ql_reload_cooldown", key: "ENABLE_RELOAD_COOLDOWN", value: true },
    { id: "ql_heroshop", key: "ENABLE_SIMPLIFY_SHOP", value: true, ownClass: "simplify_shop_active" },
    { id: "ql_target_shapes", key: "ENABLE_RED_DIAMOND", value: true, ownClass: "red_diamond_active" },
    { id: "ql_ui_controls", key: "ENABLE_CENTER_ESC", value: true, ownClass: "center_esc_active" }
];

test("reticle overflow projection combines owners and releases unavailable presentation", () => {
    const env = setup();
    const registry = env.Q.core.FeatureRegistry;
    const refresh = () => env.Q.core.hud.refreshRootClasses(env.root);
    const unclipped = () => env.root.BHasClass("qol_free_reticle_placement");
    refresh(); assert.equal(unclipped(), false);
    env.Q.core.ConfigStore.set("ql_ammo", "AMMO_MAX_X_OFFSET", 1000);
    registry.enable("ql_ammo"); refresh(); assert.equal(unclipped(), true);
    env.Q.core.ConfigStore.set("ql_reload_cooldown", "ENABLE_RELOAD_COOLDOWN", true);
    env.Q.core.ConfigStore.set("ql_reload_cooldown", "RELOAD_COOLDOWN_Y_OFFSET", -1500);
    registry.enable("ql_reload_cooldown");
    registry.disable("ql_ammo"); refresh();
    assert.equal(unclipped(), true, "reload retains its overflow when ammo stops");
    registry.disable("ql_reload_cooldown"); refresh(); assert.equal(unclipped(), false);
    registry.enable("ql_ammo"); refresh(); assert.equal(unclipped(), true);
    env.Q.core.ConfigStore.set("ql_ammo", "AMMO_MAX_X_OFFSET", 0);
    refresh(); assert.equal(unclipped(), false, "native overflow returns without a forced inline style");
    registry.disable("ql_ammo");
    assert.deepEqual(env.clock.errors, []);
});

test("Quick Buy overflow follows customized geometry and its presentation owner", () => {
    const env = setup(), registry = env.Q.core.FeatureRegistry;
    const refresh = () => env.Q.core.hud.refreshRootClasses(env.root);
    const unclipped = () => env.root.BHasClass("qol_free_quickbuy_placement");
    registry.enable("ql_presentation_scale"); refresh(); assert.equal(unclipped(), false);
    env.Q.core.ConfigStore.set("ql_presentation_scale", "QUICKBUY_X_OFFSET", 1500);
    refresh(); assert.equal(unclipped(), true, "right-side placement escapes narrow native owners");
    env.Q.core.ConfigStore.set("ql_presentation_scale", "QUICKBUY_X_OFFSET", 0);
    env.Q.core.ConfigStore.set("ql_presentation_scale", "QUICKBUY_Y_OFFSET", -900);
    refresh(); assert.equal(unclipped(), true, "vertical placement also releases clipping");
    env.Q.core.ConfigStore.set("ql_presentation_scale", "QUICKBUY_Y_OFFSET", 0);
    env.Q.core.ConfigStore.set("ql_presentation_scale", "QUICKBUY_SCALE", 150);
    refresh(); assert.equal(unclipped(), true, "scale-only customization can leave the original bounds");
    registry.disable("ql_presentation_scale"); refresh(); assert.equal(unclipped(), false);
    registry.enable("ql_presentation_scale"); refresh(); assert.equal(unclipped(), true);
    env.Q.core.ConfigStore.set("ql_presentation_scale", "QUICKBUY_SCALE", 100);
    refresh(); assert.equal(unclipped(), false, "default geometry restores native overflow");
    assert.deepEqual(env.clock.errors, []);
});

test("Quick Buy overflow opens verified layout owners through their own native stylesheet chains", () => {
    // Source routing and selector scope only; the simulator does not rasterize
    // Panorama overflow. The maintainer must verify clipping after repacking.
    for (const [layout, file, selectors] of [
        ["hud", "ql_feat_native_hud", [".qol_free_quickbuy_placement #StatsAndModsContainer", ".qol_free_quickbuy_placement #StatsAndModsContainer #LowerLeft"]],
        ["hud_quickbuy", "ql_feat_native_hud_quickbuy", [".qol_free_quickbuy_placement #CitadelHudQuickbuy"]]
    ]) {
        const report = inspect({ root: path.resolve(__dirname, ".."), token: ".qol_free_quickbuy_placement", property: "overflow",
            layout: "panorama/layout/" + layout + ".xml" });
        const matches = report.matches.filter(match => match.file === "panorama/styles/features/" + file + ".css");
        assert.equal(matches.length, 1);
        assert.equal(matches[0].selectedLayoutRoute, true, "native component imports the rule through its owning stylesheet");
        assert.deepEqual(matches[0].selector.split(",").map(selector => selector.trim()), selectors);
        assert.deepEqual(matches[0].declarations.map(item => [item.property, item.value]), [["overflow", "noclip"]]);
    }
});

test("shop overflow projection leaves native scrolling alone and combines geometry owners", () => {
    const env = setup(), registry = env.Q.core.FeatureRegistry;
    const refresh = () => env.Q.core.hud.refreshRootClasses(env.root);
    const unclipped = () => env.root.BHasClass("qol_free_shop_placement");
    env.Q.core.ConfigStore.set("ql_heroshop", "SHOP_OFFSET_X", 1000);
    registry.enable("ql_heroshop"); refresh(); assert.equal(unclipped(), true);
    env.Q.core.ConfigStore.set("ql_recent_purchases", "ENABLE_SHOP_RECENT_PURCHASES", true);
    env.Q.core.ConfigStore.set("ql_recent_purchases", "RECENT_PURCHASES_PANEL_Y_OFFSET", -1500);
    registry.enable("ql_recent_purchases");
    registry.disable("ql_heroshop"); refresh(); assert.equal(unclipped(), true);
    registry.disable("ql_recent_purchases"); refresh(); assert.equal(unclipped(), false);
    registry.enable("ql_heroshop"); refresh(); assert.equal(unclipped(), true);
    env.Q.core.ConfigStore.set("ql_heroshop", "SHOP_OFFSET_X", 0);
    refresh(); assert.equal(unclipped(), false);
    registry.disable("ql_heroshop");
    assert.deepEqual(env.clock.errors, []);
});

function setup() {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"),
        HEALTHBAR_TYPE: 2, SUPPORT_4_3: 1, ENABLE_HIDE_AMMO_ALL: 1,
        ENABLE_HIDE_FAILED_HINT: 1, ENABLE_ZIP_BOOST: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_COMBAT_INDICATOR: 1
    });
    return { ...env, Q, $ };
}

for (const scenario of scenarios) {
    test(`${scenario.id} settings project complete HUD config and preserve unrelated classes immediately`, () => {
        const env = setup();
        const bucket = env.Q.core.ConfigStore.view(scenario.id);
        const feature = env.Q.core.FeatureRegistry.getManifest(scenario.id).create({ events: env.Q.core.EventBus,
            id: scenario.id, config: { view: () => bucket, all: () => ({ ...bucket }) }
        });
        feature.onEnable();
        env.Q.core.hud.refreshRootClasses(env.root);
        const preserved = ["support_4_3_active", "hide_current_ammo_active", "hide_failed_hint_active"];
        if (scenario.id !== "ql_healthbar") preserved.push("fg_healthbar_active");
        for (const name of preserved) assert.equal(env.root.BHasClass(name), true, `${name} initial`);

        env.Q.core.ConfigStore.set(scenario.id, scenario.key, scenario.value);
        feature.onSettingsChanged({ key: scenario.key, value: scenario.value, changes: { [scenario.key]: scenario.value } });
        for (const name of preserved) assert.equal(env.root.BHasClass(name), true, `${name} survives the local owner hook`);
        if (scenario.ownClass) assert.equal(env.root.BHasClass(scenario.ownClass), true, "the owner's own class reacts immediately");
        if (scenario.id === "ql_reload_cooldown") {
            const reticle = env.$.CreatePanel("Panel", gunData(env.$, env.root), "reticle_status");
            const progress = env.$.CreatePanel("Panel", reticle, "attack_delayed_progress_bar");
            progress.AddClass("has_active_reload");
            progress.style.clip = "radial(50% 50%, 120deg, 0deg)";
            feature.onSettingsChanged();
            assert.ok(reticle.FindChildTraverse("QOLReloadCooldownText"), "countdown native observation still runs");
        }
        feature.onDisable();
        assert.deepEqual(env.clock.errors, []);
    });
}

test("whole-HUD refresh observes hideout gates and the live combat recovery clock", () => {
    const env = setup();
    env.root.AddClass("InCombat");
    env.Q.core.FeatureRegistry.enable("ql_combat_indicator");
    env.Q.core.hud.refreshRootClasses(env.root);
    env.root.RemoveClass("InCombat");
    env.clock.advance(100);
    env.Q.core.hud.refreshRootClasses(env.root);
    assert.equal(env.root.BHasClass("combat_indicator_active"), true, "recent combat uses a real clock in settings refresh");
    assert.equal(env.root.BHasClass("zip_boost_overlay_active"), true);
    assert.equal(env.root.BHasClass("unsecured_souls_overlay_active"), true);
    env.root.AddClass("connectedToHideout");
    env.Q.core.hud.refreshRootClasses(env.root);
    for (const name of ["zip_boost_overlay_active", "unsecured_souls_overlay_active"]) {
        assert.equal(env.root.BHasClass(name), false, `${name} is gated immediately in hideout`);
    }
    env.clock.advance(5000);
    env.Q.core.hud.refreshRootClasses(env.root);
    assert.equal(env.root.BHasClass("combat_indicator_active"), false, "expired recovery does not survive a refresh");
    assert.deepEqual(env.clock.errors, []);
});
