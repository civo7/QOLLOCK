"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup(id, overrides) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global; Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ...overrides });
    const cfg = Q.core.ConfigStore.view(id); let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest(id).create({ id, config: { view() { reads++; return cfg; } }, events: Q.core.EventBus });
    const add = (parent, id = "", classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id); for (const name of classes) panel.AddClass(name); return panel;
    };
    const native = root => {
        const core = add(root, "", ["HudCore"]), stats = add(core, "StatsAndModsContainer"), left = add(stats, "LowerLeft");
        if (id === "ql_items") {
            const panel = add(left, "ModsContainer", ["ModsContainer"]);
            const section = add(panel, "", ["ModSection"]), icon = add(panel, "", ["mod_icon_single_container"]);
            return { core, panel, section, icon };
        }
        const panel = add(core, "hudActivePlayerStats"), block = add(panel, "HudStatBlock");
        Object.assign(block, { actuallayoutwidth: 180, actuallayoutheight: 60 });
        return { core, panel, block };
    };
    return { ...env, Q, $, cfg, feature, add, native, reads: () => reads };
}

for (const [id, config] of [
    ["ql_items", { ITEMS_X_OFFSET: 60, ITEMS_Y_OFFSET: 25, ITEMS_OPACITY: 0.4, ITEMS_WASH_COLOR: 13 }],
    ["ql_stats_position", { STATS_POSITION_X_OFFSET: 60, STATS_POSITION_Y_OFFSET: 25, STATS_POSITION_HIDE_NORMAL: 1 }]
]) {
    test(id + ": current HUD sources retry living retirement and stopped hooks cannot revive native presentation", () => {
        const env = setup(id, config), first = env.native(env.root);
        env.feature.onEnable();
        assert.equal(first.panel.style.x, "60px"); assert.equal(first.panel.style.y, "-25px");
        const clear = first.panel.ClearPropertyFromCode.bind(first.panel); let reject = true;
        first.panel.ClearPropertyFromCode = property => reject && property === "x" ? false : clear(property);
        const currentRoot = env.add(null, "Hud", [], "CitadelHud"), current = env.native(currentRoot);
        env.$.GetContextPanel = () => currentRoot; env.clock.advance(1200);
        assert.equal(first.panel.style.x, "0px", "neutral placement is written before the rejected native clear");
        assert.equal(first.panel.style.y, undefined);
        assert.equal(current.panel.style.x, "60px"); assert.equal(current.panel.style.y, "-25px");
        reject = false; env.clock.advance(1200); assert.equal(first.panel.style.x, undefined);
        assert.equal(current.panel.style.x, "60px");
        env.clock.advance(1500); assert.equal(env.reads(), 1, "idle source observation does not recompute settings");
        const clearCurrent = current.panel.ClearPropertyFromCode.bind(current.panel); let rejectCurrent = true;
        current.panel.ClearPropertyFromCode = property => rejectCurrent && property === "x" ? false : clearCurrent(property);
        env.feature.onDisable(); assert.equal(current.panel.style.x, "0px");
        rejectCurrent = false; env.clock.advance(500);
        assert.equal(current.panel.style.x, undefined, "retirement finishes even after the owner's observation loop stops");
        env.feature.onSettingsChanged(); env.Q.core.EventBus.emit("engine:scoreboard_toggle"); env.clock.advance(1500);
        assert.equal(current.panel.style.x, undefined); assert.equal(env.reads(), 1);
        assert.deepEqual(env.clock.errors, []);
    });
    test(id + ": loading roots with similar IDs are not native HUD owners", () => {
        const env = setup(id, config), loading = env.add(null, "LoadingRoot"), fake = env.native(loading);
        env.$.GetContextPanel = () => loading; env.feature.onEnable();
        assert.equal(fake.panel.style.x, undefined);
        const current = env.native(env.root); env.$.GetContextPanel = () => env.root; env.clock.advance(1200);
        assert.equal(current.panel.style.x, "60px");
        env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
    });
}

test("inventory leaf membership follows moved icons, late graph replacement and preserves native section opacity", () => {
    const env = setup("ql_items", { ITEMS_OPACITY: 0.4 }), first = env.native(env.root);
    first.section.style.opacity = "0.7"; env.feature.onEnable();
    assert.equal(first.icon.style.opacity, "0.40"); assert.equal(first.panel.style.opacity, undefined);
    assert.equal(first.section.style.opacity, "0.7");
    const retired = env.add(null, "RetiredIcon"); first.icon.SetParent(retired);
    const graph = env.add(first.panel, "BarGraphContainer"), icon = env.add(first.panel, "", ["mod_icon_single_container"]);
    env.clock.advance(1200);
    assert.equal(first.icon.style.opacity, undefined); assert.equal(graph.style.opacity, "0.40"); assert.equal(icon.style.opacity, "0.40");
    icon.style.opacity = "0.9"; env.clock.advance(1200);
    assert.equal(icon.style.opacity, "0.40", "native overwrite reasserts only the configured leaf property");
    env.cfg.ITEMS_OPACITY = 1; env.feature.onSettingsChanged();
    assert.equal(graph.style.opacity, undefined); assert.equal(icon.style.opacity, undefined);
    assert.equal(first.section.style.opacity, "0.7"); env.feature.onDisable();
});
