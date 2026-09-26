"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../scripts/simulator/index.js");

test("scheduler lets features clean up when the HUD enters Hideout", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const g = hud.sandbox.global;
    const cursor = g.QOL.core.FeatureRegistry.getManifest("ql_mouse_cursor").create({});
    g.GameUI.GetCursorPosition = () => ({ x: 200, y: 300 });
    hud.root.AddClass("gShopOpen");
    cursor.onEnable();
    hud.clock.advance(100);
    assert.equal(hud.root.BHasClass("qol_custom_cursor_replace_active"), true);

    hud.root.AddClass("InHideout");
    g.QOL.core.EventBus.emit("engine:game_state_changed");
    hud.clock.advance(2000);
    assert.equal(hud.root.BHasClass("qol_custom_cursor_replace_active"), false,
        "Hideout must restore the native cursor instead of leaving cursor:none active");
    assert.equal(hud.root.FindChildTraverse("QOLGameplayMouseCursor").BHasClass("qol-hidden"), true);

    hud.root.RemoveClass("InHideout");
    hud.clock.advance(100);
    assert.equal(hud.root.BHasClass("qol_custom_cursor_replace_active"), true);
    cursor.onDisable();
});

test("scheduler stops callbacks when their owning panel is destroyed", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const scheduler = hud.sandbox.global.QOL.core.Scheduler;
    let calls = 0;
    scheduler.createPollLoop(() => { calls++; }, 0.2, "destroyed_owner");
    hud.clock.advance(100);
    assert.equal(calls, 1);
    hud.root.DeleteAsync(0);
    hud.clock.advance(0);
    hud.clock.advance(1000);
    assert.equal(calls, 1, "No callback may access a destroyed owner");
});
