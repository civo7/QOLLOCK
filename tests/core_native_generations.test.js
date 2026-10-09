"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
function setup(patch = {}) {
    const env = createHud({ inHideout: false }); env.assertLoaded(); const { $, QOL: Q } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ...patch });
    const add = (parent, id, type = "Panel", className = "") => {
        const panel = $.CreatePanel(type, parent, id); if (className) panel.AddClass(className); return panel;
    };
    function tree(root = env.doc.root) {
        const core = add(root, "", "Panel", "HudCore"), gameplay = add(core, "gameplay_hud");
        const health = add(gameplay, "health_and_abilities_container"), content = add(health, "HealthBarContent");
        const total = add(content, "HealthRegenAndTotal"), bars = add(content, "hud_health_bars");
        const shop = add(core, "CitadelHudHeroShop"), alert = add(add(add(shop, "Shop"), "NavPanel"), "InCombatAlert");
        return { core, gameplay, health, content, total, bars, shop, alert };
    }
    return { ...env, $, Q, add, tree, refresh: () => Q.core.hud.refreshRootClasses(env.doc.root) };
}

test("combat evidence prefers the current living native shop and retries a late verified alert", () => {
    const env = setup(), native = env.tree(); native.alert.AddClass("Visible");
    assert.equal(env.Q.core.hud.isCombatSignalActive(env.root), true);
    native.shop.SetParent(env.add(null, "RetiredShop"));
    const shop = env.add(native.core, "CitadelHudHeroShop"), nav = env.add(env.add(shop, "Shop"), "NavPanel");
    assert.equal(env.Q.core.hud.isCombatSignalActive(env.root), false);
    const alert = env.add(nav, "InCombatAlert"); alert.AddClass("Visible");
    assert.equal(env.Q.core.hud.isCombatSignalActive(env.root), true); assert.equal(native.alert.IsValid(), true);
    assert.equal(env.Q.getCachedPanel("combatStatusAlertPanel"), null); assert.deepEqual(env.clock.errors, []);
});

test("combat indicator owns independent recovery and releases living old healthbar targets", () => {
    const env = setup({ ENABLE_COMBAT_INDICATOR: 1 }), first = env.tree();
    first.alert.AddClass("Visible"); env.Q.core.FeatureRegistry.enable("ql_combat_indicator");
    for (const panel of [env.root, first.gameplay, first.health, first.content, first.total, first.bars]) assert.equal(panel.BHasClass("combat_indicator_active"), true);
    first.core.SetParent(env.add(null, "RetiredHudCore")); const next = env.tree();
    env.clock.advance(300); assert.equal(next.health.BHasClass("combat_indicator_active"), true, "same-HUD recovery remains active");
    for (const panel of [first.gameplay, first.health, first.content, first.total, first.bars]) {
        assert.equal(panel.IsValid(), true); assert.equal(panel.BHasClass("combat_indicator_enabled"), false); assert.equal(panel.BHasClass("combat_indicator_active"), false);
    }
    env.Q.core.FeatureRegistry.disable("ql_combat_indicator");
    for (const panel of [env.root, next.gameplay, next.health, next.content, next.total, next.bars]) assert.equal(panel.BHasClass("combat_indicator_enabled"), false);
    env.clock.advance(300); assert.equal(next.health.BHasClass("combat_indicator_active"), false);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_combat_indicator"), false); assert.deepEqual(env.clock.errors, []);
});

test("combat indicator retries partial native class writes and resets recovery for a new live Hud", () => {
    const env = setup({ ENABLE_COMBAT_INDICATOR: 1 }), first = env.tree(); first.alert.AddClass("Visible");
    const set = first.health.SetHasClass.bind(first.health); let reject = true;
    first.health.SetHasClass = (name, value) => { if (name === "combat_indicator_active" && reject) throw Error("modeled class rejection"); set(name, value); };
    env.Q.core.FeatureRegistry.enable("ql_combat_indicator"); assert.equal(first.health.BHasClass("combat_indicator_active"), false);
    reject = false; env.clock.advance(300); assert.equal(first.health.BHasClass("combat_indicator_active"), true);
    env.doc.root = env.add(null, "Hud", "CitadelHud"); const next = env.tree(); env.clock.advance(300);
    assert.equal(next.health.BHasClass("combat_indicator_enabled"), true); assert.equal(next.health.BHasClass("combat_indicator_active"), false);
    assert.equal(first.health.BHasClass("combat_indicator_enabled"), false);
    env.Q.core.FeatureRegistry.disable("ql_combat_indicator"); assert.deepEqual(env.clock.errors, []);
});

test("core CSS projection retires old living root classes and reapplies unchanged config", () => {
    const env = setup({ ENABLE_CENTER_ESC: 1 }); env.Q.core.FeatureRegistry.enable("ql_ui_controls"); env.refresh();
    assert.equal(env.root.BHasClass("center_esc_active"), true); env.root.AddClass("NativeUnrelated");
    env.doc.root = env.add(null, "Hud", "CitadelHud"); env.refresh();
    assert.equal(env.doc.root.BHasClass("center_esc_active"), true); assert.equal(env.root.BHasClass("center_esc_active"), false);
    assert.equal(env.root.BHasClass("NativeUnrelated"), true);
    for (const key of ["rootClassCache", "abilitiesClassCache", "coreRootStaticSig", "combatStatus", "legacyCooldownsUiFlagValue"]) assert.equal(Object.hasOwn(env.Q.state, key), false);
    assert.deepEqual(env.clock.errors, []);
});

test("core retries ability classes after a partial write at an unchanged root signature", () => {
    const env = setup({ ENABLE_CLEAN_STACKS: 1 }); env.Q.core.FeatureRegistry.enable("ql_ability_icons");
    const native = env.tree(), abilities = env.add(native.core, "AbilitiesContainer");
    const set = abilities.SetHasClass.bind(abilities); let reject = true;
    abilities.SetHasClass = (name, value) => { if (name === "clean_stacks_active" && reject) throw Error("modeled class rejection"); set(name, value); };
    assert.throws(env.refresh, /modeled class rejection/); reject = false; env.refresh(); assert.equal(abilities.BHasClass("clean_stacks_active"), true);
    abilities.SetParent(env.add(null, "RetiredAbilities")); const next = env.add(native.core, "AbilitiesContainer"); env.refresh();
    assert.equal(abilities.BHasClass("clean_stacks_active"), false); assert.equal(next.BHasClass("clean_stacks_active"), true); assert.deepEqual(env.clock.errors, []);
});

test("reload exception and HUD mode observations reject a retired living source", () => {
    const env = setup({ ENABLE_HIDE_RELOAD_CIRCLE: 1 });
    env.root.AddClass("attack_delayed"); env.root.AddClass("reloading");
    const progress = env.add(env.root, "active_reload_progress_bar"); progress.AddClass("has_active_reload"); env.refresh();
    assert.equal(env.root.BHasClass("hide_reload_circle_exception_active"), true);
    progress.SetParent(env.add(null, "RetiredProgress")); env.add(env.root, "active_reload_progress_bar"); env.refresh();
    assert.equal(env.root.BHasClass("hide_reload_circle_exception_active"), false); assert.equal(progress.BHasClass("has_active_reload"), true);
    env.root.AddClass("InHideout"); env.root.AddClass("gamemode_streetbrawl");
    assert.equal(env.Q.core.hud.isInHideout(env.root), true); assert.equal(env.Q.core.hud.isStreetBrawl(), true);
    env.doc.root = env.add(null, "Hud", "CitadelHud");
    assert.equal(env.Q.core.hud.isInHideout(env.doc.root), false); assert.equal(env.Q.core.hud.isStreetBrawl(), false); assert.deepEqual(env.clock.errors, []);
});
