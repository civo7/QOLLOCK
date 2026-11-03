"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function fixture(id) {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { QOL: Q, $ } = hud.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat(Q.buildDefaultConfig());
    const cfg = Q.core.ConfigStore.view(id);
    const feature = Q.core.FeatureRegistry.getManifest(id).create({ id,
        config: { view: () => cfg }, events: Q.core.EventBus });
    const add = (parent, panelId, classes = []) => {
        const panel = $.CreatePanel("Panel", parent, panelId);
        for (const name of classes) panel.AddClass(name);
        return panel;
    };
    const hasPoll = () => Q.core.Scheduler.getWorkSnapshot().some(row => row.id === id && row.polls > 0);
    return { hud, Q, cfg, feature, add, hasPoll };
}

for (const [id, setting, customized, neutral, property, expected] of [
    ["ql_damage_numbers", "HUD_INDICATOR_SIZE", 31, 18, "fontSize", "31px"],
    ["ql_target_shapes", "UNIT_TARGET_SIZE", 201, 150, "uiScale", "201%"]
]) test(id + " suspends neutral presentation work and resumes discovery on a settings change", () => {
    const env = fixture(id);
    let scope = env.hud.root;
    if (id === "ql_target_shapes") {
        scope = env.add(scope, "", ["HudCore"]);
        for (const name of ["gameplay_hud", "gameplay_hud_alive", "crosshair", "unit_target_container"]) scope = env.add(scope, name);
    } else scope = env.add(env.add(scope, "", ["HudCore"]), "HudEventIndicatorsPanel");
    const classes = id === "ql_target_shapes" ? ["target_shape"] : ["HudIndicatorText"];
    const first = env.add(scope, "Value", classes);
    first.style.opacity = "0.73";
    env.feature.onEnable();
    assert.equal(env.hasPoll(), false, "native source changes cannot make neutral settings produce output");
    env.hud.clock.advance(5000);
    assert.equal(first.style[property], undefined);
    assert.equal(first.style.opacity, "0.73", "unowned native presentation stays intact");

    env.cfg[setting] = customized;
    env.feature.onSettingsChanged();
    assert.equal(first.style[property], expected, "settings apply before the next scheduled tick");
    assert.equal(env.hasPoll(), true);
    const late = env.add(scope, "Late", classes);
    env.hud.clock.advance(3000);
    assert.equal(late.style[property], expected, "active discovery still follows late children");

    env.cfg[setting] = neutral;
    env.feature.onSettingsChanged();
    assert.equal(first.style[property], undefined);
    assert.equal(late.style[property], undefined);
    assert.equal(env.hasPoll(), false, "returning to native presentation retires the recurring callback");

    env.cfg[setting] = customized;
    env.feature.onSettingsChanged();
    assert.equal(env.hasPoll(), true);
    env.feature.onDisable();
    assert.equal(env.hasPoll(), false);
    assert.equal(late.style[property], undefined);
    env.feature.onSettingsChanged();
    assert.equal(env.hasPoll(), false, "a stopped hook cannot revive presentation");
    env.feature.onEnable();
    assert.equal(first.style[property], expected);
    assert.equal(env.hasPoll(), true);
    env.feature.onDisable();
    assert.deepEqual(env.hud.clock.errors, []);
});

test("inventory stops neutral discovery and resumes opacity ownership for late native icons", () => {
    const env = fixture("ql_items");
    let scope = env.add(env.hud.root, "", ["HudCore"]);
    for (const id of ["StatsAndModsContainer", "LowerLeft", "ModsContainer"]) scope = env.add(scope, id);
    env.feature.onEnable();
    assert.equal(env.hasPoll(), false);
    env.cfg.ITEMS_OPACITY = 0.45;
    env.feature.onSettingsChanged();
    assert.equal(env.hasPoll(), true);
    const icon = env.add(scope, "LateIcon", ["mod_icon_single_container"]);
    env.hud.clock.advance(1500);
    assert.equal(icon.style.opacity, "0.45");
    env.cfg.ITEMS_OPACITY = 1;
    env.feature.onSettingsChanged();
    assert.equal(icon.style.opacity, undefined);
    assert.equal(env.hasPoll(), false);
    env.cfg.HUD_ITEMS_ENABLED = 0;
    env.feature.onSettingsChanged();
    assert.equal(env.hasPoll(), true, "conditional visibility still owns late native hosts");
    env.feature.onDisable();
    assert.equal(env.hasPoll(), false);
    assert.deepEqual(env.hud.clock.errors, []);
});
