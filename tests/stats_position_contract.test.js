"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { QOL: Q, $ } = hud.sandbox.global;
    Q.core.App.shutdown();
    const core = $.CreatePanel("Panel", hud.root, ""); core.AddClass("HudCore");
    const left = $.CreatePanel("Panel", $.CreatePanel("Panel", core, "StatsAndModsContainer"), "LowerLeft");
    const legacy = $.CreatePanel("Panel", left, "hudPlayerStats");
    const active = $.CreatePanel("Panel", core, "hudActivePlayerStats");
    const block = $.CreatePanel("Panel", active, "HudStatBlock");
    Object.assign(block, { actuallayoutwidth: 180, actuallayoutheight: 60 });
    const registry = Q.core.FeatureRegistry;
    return { ...hud, Q, $, core, legacy, active, block, registry };
}

test("obsolete Side round-trips while native stats docking and child layout remain untouched", () => {
    const env = setup();
    const panel = env.active;
    Object.assign(panel.style, { horizontalAlign: "left", marginLeft: "11px", opacity: "0.8" });
    env.block.style.transform = "rotateZ(12deg)";
    env.Q.core.ConfigAdapter.loadFromFlat({ ENABLE_STATS_POSITION: 1, STATS_POSITION_SIDE: 1 });
    env.registry.enable("ql_stats_position");
    assert.equal(panel.BHasClass("QolStatsRight"), false);
    assert.equal(panel.style.x, undefined); assert.equal(panel.style.y, undefined);
    assert.equal(panel.style.horizontalAlign, "left"); assert.equal(panel.style.marginLeft, "11px");
    assert.equal(panel.style.opacity, "0.8"); assert.equal(env.block.style.transform, "rotateZ(12deg)");
    assert.equal(env.Q.core.ConfigAdapter.exportToFlat().STATS_POSITION_SIDE, 1);
    env.registry.disable("ql_stats_position");
    assert.equal(panel.style.opacity, "0.8", "unowned native code properties survive disable");
    assert.deepEqual(env.clock.errors, []);
});

test("stats source replacement releases a still-live owner and reapplies offsets immediately", () => {
    const env = setup();
    env.Q.core.ConfigAdapter.loadFromFlat({ ENABLE_STATS_POSITION: 1, STATS_POSITION_X_OFFSET: 123, STATS_POSITION_Y_OFFSET: 45 });
    env.registry.enable("ql_stats_position");
    assert.equal(env.active.style.x, "123px"); assert.equal(env.active.style.y, "-45px");
    env.active.SetParent(env.$.CreatePanel("Panel", env.root, "DetachedStats"));
    const current = env.$.CreatePanel("Panel", env.core, "hudActivePlayerStats");
    const block = env.$.CreatePanel("Panel", current, "HudStatBlock");
    Object.assign(block, { actuallayoutwidth: 180, actuallayoutheight: 60 });
    env.clock.advance(1100);
    assert.equal(env.active.IsValid(), true);
    assert.equal(env.active.style.x, undefined); assert.equal(env.active.style.y, undefined);
    assert.equal(current.style.x, "123px"); assert.equal(current.style.y, "-45px");
    env.registry.disable("ql_stats_position");
    assert.equal(current.style.x, undefined); assert.equal(current.style.y, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("stats hiding reads actual scoreboard state and keeps placement independent", () => {
    const env = setup();
    env.Q.core.ConfigAdapter.loadFromFlat({ ENABLE_STATS_POSITION: 1, STATS_POSITION_X_OFFSET: 40, STATS_POSITION_HIDE_SCOREBOARD: 1 });
    env.registry.enable("ql_stats_position");
    assert.equal(env.active.style.opacity, undefined);
    env.root.AddClass("gScoreboardOpen"); env.Q.core.EventBus.emit("engine:scoreboard_toggle");
    assert.equal(env.active.style.opacity, "0"); assert.equal(env.active.style.x, "40px");
    env.root.RemoveClass("gScoreboardOpen"); env.Q.core.EventBus.emit("engine:scoreboard_toggle");
    assert.equal(env.active.style.opacity, undefined); assert.equal(env.active.style.x, "40px");
    env.registry.disable("ql_stats_position");
    env.root.AddClass("gScoreboardOpen"); env.Q.core.EventBus.emit("engine:scoreboard_toggle");
    assert.equal(env.active.style.opacity, undefined, "retired events cannot hide native stats after disable");
    assert.deepEqual(env.clock.errors, []);
});
