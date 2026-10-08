"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function fixture(patch = {}) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const Q = env.sandbox.global.QOL, registry = Q.core.FeatureRegistry;
    Q.core.App.shutdown();
    env.sandbox.eval("Math.random = () => 0;");
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"),
        HEALTHBAR_TYPE: 5, SUPPORT_4_3: 1, ENABLE_PASSIVE_COOLDOWN: 1, ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_SHOP_RECENT_PURCHASES: 1, ENABLE_SHOP_ITEM_NOTIFICATIONS: 1, ...patch });
    const add = (parent, id, classes = [], type = "Panel") => {
        const panel = env.sandbox.global.$.CreatePanel(type, parent, id);
        for (const cls of classes) panel.AddClass(cls);
        return panel;
    };
    const core = add(env.root, "", ["HudCore"]), gameplay = add(core, "gameplay_hud");
    const health = add(gameplay, "health_and_abilities_container"), canvas = add(health, "QOLHealthbarGeometry");
    const content = add(canvas, "HealthBarContent"); add(content, "hud_health_bars");
    const numbers = add(canvas, "HealthRegenAndTotal"), group = add(numbers, "", ["healthContainer"]);
    const current = add(group, "", ["currentHealthLabel"], "Label"); current.text = "500";
    const maximum = add(group, "", ["totalHealthLabel"], "Label"); maximum.text = "/ 1000";
    const heartsRoot = add(canvas, "MinecraftHeartsRoot"), box = add(heartsRoot, "MinecraftHeartsContainer");
    const hearts = add(box, "MinecraftHearts");
    const refresh = () => Q.core.hud.refreshRootClasses(env.root);
    return { ...env, Q, registry, add, core, health, hearts, refresh };
}

test("explicit healthbar disable releases custom-only CSS and content without changing the config", () => {
    const e = fixture(); e.registry.boot(); e.clock.advance(200);
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), true);
    assert.ok(e.hearts.GetChildCount() > 0);
    const stored = e.Q.core.ConfigAdapter.exportToFlat();
    e.registry.disable("ql_healthbar"); e.clock.advance(1);
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), false);
    assert.equal(e.hearts.GetChildCount(), 0);
    assert.equal(e.root.BHasClass("support_4_3_active"), true);
    assert.deepEqual(e.Q.core.ConfigAdapter.exportToFlat(), stored);
    e.refresh(); e.clock.advance(600);
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), false, "complete-config refresh cannot revive retired presentation");
    e.registry.enable("ql_healthbar"); e.clock.advance(200);
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), true);
    assert.ok(e.hearts.GetChildCount() > 0);
    assert.deepEqual(e.Q.core.ConfigAdapter.exportToFlat(), stored);
    assert.deepEqual(e.clock.errors, []);
});

test("synthetic recent-purchase disable immediately releases both central CSS surfaces", () => {
    const e = fixture(); e.registry.boot();
    assert.equal(e.root.BHasClass("shop_recent_purchases_active"), true);
    assert.equal(e.root.BHasClass("shop_item_notifications_active"), true);
    e.registry.disable("ql_recent_purchases"); e.refresh();
    assert.equal(e.root.BHasClass("shop_recent_purchases_active"), false);
    assert.equal(e.root.BHasClass("shop_item_notifications_active"), false);
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), true);
    assert.equal(e.Q.core.ConfigAdapter.exportToFlat().ENABLE_SHOP_ITEM_NOTIFICATIONS, 1);
    e.registry.enable("ql_recent_purchases");
    assert.equal(e.root.BHasClass("shop_recent_purchases_active"), true);
    assert.equal(e.root.BHasClass("shop_item_notifications_active"), true);
});

test("Advanced mode responds to retired mirror presentation without affecting Basic mode", () => {
    const e = fixture(); e.registry.boot();
    assert.equal(e.root.BHasClass("passive_cooldown_advanced_active"), true);
    e.registry.disable("ql_item_mirror");
    assert.equal(e.root.BHasClass("passive_cooldown_advanced_active"), false);
    e.refresh(); e.clock.advance(600);
    assert.equal(e.root.BHasClass("passive_cooldown_advanced_active"), false);
    e.registry.enable("ql_item_mirror");
    assert.equal(e.root.BHasClass("passive_cooldown_advanced_active"), true);
    e.Q.core.ConfigAdapter.loadFromFlat({ ENABLE_OLD_ITEM_COOLDOWNS: 1 });
    assert.equal(e.root.BHasClass("passive_cooldown_basic_active"), true);
    e.registry.disable("ql_item_mirror"); e.clock.advance(600);
    assert.equal(e.root.BHasClass("passive_cooldown_basic_active"), true);
    assert.equal(e.root.BHasClass("passive_cooldown_advanced_active"), false);
});

test("failed re-enable suppresses CSS before partial cleanup and a successful retry restores it", () => {
    const e = fixture(); e.registry.boot(); e.registry.disable("ql_healthbar");
    const manifest = e.registry.getManifest("ql_healthbar"), create = manifest.create;
    let presentedDuringEnable = false, suppressedDuringCleanup = false;
    manifest.create = ctx => ({
        onEnable() {
            e.refresh(); presentedDuringEnable = e.root.BHasClass("minecraft_healthbar_active");
            e.Q.core.Scheduler.createPollLoop(() => {}, 0.1, ctx.id);
            throw Error("modeled failed native setup");
        },
        onDisable() { e.refresh(); suppressedDuringCleanup = !e.root.BHasClass("minecraft_healthbar_active"); }
    });
    e.registry.enable("ql_healthbar");
    assert.equal(presentedDuringEnable, true);
    assert.equal(suppressedDuringCleanup, true);
    assert.equal(e.registry.isEnabled("ql_healthbar"), false);
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), false);
    assert.equal(e.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_healthbar"), false);
    manifest.create = create; e.registry.enable("ql_healthbar");
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), true);
    assert.equal(e.Q.core.ConfigAdapter.exportToFlat().HEALTHBAR_TYPE, 5);
});

test("Scheduler auto-disable retires CSS until the owner is explicitly enabled again", () => {
    const e = fixture(); e.registry.boot();
    for (let i = 0; i < 10; i++) e.Q.core.EventBus.emit("scheduler:error", { featureId: "ql_healthbar", message: "modeled consecutive poll failure" });
    assert.equal(e.registry.isEnabled("ql_healthbar"), false);
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), false);
    e.refresh(); assert.equal(e.root.BHasClass("minecraft_healthbar_active"), false);
    e.registry.enable("ql_healthbar"); assert.equal(e.root.BHasClass("minecraft_healthbar_active"), true);
});

test("registry shutdown releases session CSS and reboot restores the same stored modes", () => {
    const e = fixture(); e.registry.boot();
    const stored = e.Q.core.ConfigAdapter.exportToFlat();
    e.registry.shutdown();
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), false);
    assert.equal(e.root.BHasClass("shop_item_notifications_active"), false);
    assert.equal(e.root.BHasClass("passive_cooldown_advanced_active"), false);
    assert.deepEqual(e.Q.core.ConfigAdapter.exportToFlat(), stored);
    assert.equal(e.registry.isPresentationAvailable("ql_healthbar"), true, "retired sessions do not leak policy into standalone consumers");
    e.registry.boot();
    assert.equal(e.root.BHasClass("minecraft_healthbar_active"), true);
    assert.equal(e.root.BHasClass("passive_cooldown_advanced_active"), true);
    assert.deepEqual(e.Q.core.ConfigAdapter.exportToFlat(), stored);
    assert.deepEqual(e.clock.errors, []);
});

for (const scenario of [
    { id: "ql_compass", config: { ENABLE_COMPASS: 1 }, className: "compass_active" },
    { id: "ql_rejuv_hud", config: { ENABLE_REJUV_HUD: 1 }, className: "rejuv_hud_disabled", active: false },
    { id: "ql_minimap_timers", config: { ENABLE_MINIMAP_BUFF_TIMER: 1 }, className: "minimap_buff_timer_disabled", active: false },
    { id: "ql_zipboost", config: { ENABLE_ZIP_BOOST: 1 }, className: "zip_boost_overlay_active" },
    { id: "ql_stat_bonuses", config: { ENABLE_STAT_BONUSES: 1 }, className: "stat_bonuses_overlay_active" },
    { id: "ql_ult_cooldowns", config: { ENABLE_ULT_COOLDOWNS: 1 }, className: "ult_cooldowns_active" },
    { id: "ql_keyboard", config: { ENABLE_KEYBOARD_OVERLAY: 1 }, className: "keyboard_overlay_active" },
    { id: "ql_better_unsecured_hud", config: { ENABLE_BETTER_UNSECURED: 1 }, className: "better_unsecured_active" },
    { id: "ql_heroshop", config: { ENABLE_ENHANCED_QUICKBUY: 1, DISABLE_QUICK_BUY: 0 }, className: "enhanced_quickbuy_active" }
]) {
    test(`${scenario.id} releases its central CSS and leaves its accepted settings intact`, () => {
        const e = fixture(scenario.config); e.registry.boot(); e.refresh();
        const active = scenario.active ?? true;
        assert.equal(e.root.BHasClass(scenario.className), active);
        const config = e.Q.core.ConfigAdapter.exportToFlat();
        e.registry.disable(scenario.id); e.refresh();
        assert.equal(e.root.BHasClass(scenario.className), !active);
        assert.deepEqual(e.Q.core.ConfigAdapter.exportToFlat(), config);
        assert.equal(e.root.BHasClass("minecraft_healthbar_active"), true);
        e.registry.enable(scenario.id);
        assert.equal(e.root.BHasClass(scenario.className), active);
        assert.deepEqual(e.clock.errors, []);
    });
}
