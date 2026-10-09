"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

const scenarios = [
    { id: "ql_healthbar", key: "HEALTHBAR_TYPE", value: 5, ownClass: "minecraft_healthbar_active" },
    { id: "ql_compass", key: "ENABLE_COMPASS", value: true, ownClass: "compass_active" },
    { id: "ql_reload_cooldown", key: "ENABLE_RELOAD_COOLDOWN", value: true },
    { id: "ql_heroshop", key: "ENABLE_SIMPLIFY_SHOP", value: true, ownClass: "simplify_shop_active" },
    { id: "ql_target_shapes", key: "ENABLE_RED_DIAMOND", value: true, ownClass: "red_diamond_active" },
    { id: "ql_ui_controls", key: "ENABLE_CENTER_ESC", value: true, ownClass: "center_esc_active" }
];

function setup() {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"),
        HEALTHBAR_TYPE: 2, SUPPORT_4_3: 1, ENABLE_HIDE_AMMO_ALL: 1,
        ENABLE_HIDE_FAILED_HINT: 1, ENABLE_ZIP_BOOST: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1, ENABLE_STAT_BONUSES: 1,
        ENABLE_COMBAT_INDICATOR: 1
    });
    return { ...env, Q, $ };
}

for (const scenario of scenarios) {
    test(`${scenario.id} settings project complete HUD config and preserve unrelated classes immediately`, () => {
        const env = setup();
        const bucket = env.Q.core.ConfigStore.view(scenario.id);
        const feature = env.Q.core.FeatureRegistry.getManifest(scenario.id).create({
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
            const reticle = env.$.CreatePanel("Panel", env.root, "reticle_status");
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
    assert.equal(env.root.BHasClass("stat_bonuses_overlay_active"), true);
    env.root.AddClass("connectedToHideout");
    env.Q.core.hud.refreshRootClasses(env.root);
    for (const name of ["zip_boost_overlay_active", "unsecured_souls_overlay_active", "stat_bonuses_overlay_active"]) {
        assert.equal(env.root.BHasClass(name), false, `${name} is gated immediately in hideout`);
    }
    env.clock.advance(5000);
    env.Q.core.hud.refreshRootClasses(env.root);
    assert.equal(env.root.BHasClass("combat_indicator_active"), false, "expired recovery does not survive a refresh");
    assert.deepEqual(env.clock.errors, []);
});
