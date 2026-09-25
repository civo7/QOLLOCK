// tests/scheduler_lifecycle.test.js
// =============================================================================
// Tests Scheduler Hideout lifecycle gating, 1.5s idle backoff, and instant wake.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

test("scheduler: isMatchInHideout detects InHideout class and gates loops", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();

    const scheduler = hud.sandbox.global.QOL.core.Scheduler;
    assert.ok(scheduler, "Scheduler must exist");

    // Initially not in hideout
    hud.root.RemoveClass("InHideout");
    assert.strictEqual(scheduler.isMatchInHideout(), false);

    let tickCount = 0;
    const loop = scheduler.createPollLoop(() => {
        tickCount++;
    }, 0.05, "test_feature");

    // Advance clock by 100ms in match: ticks should fire normally
    hud.clock.advance(100);
    assert.ok(tickCount >= 1, `Expected ticks in match, got ${tickCount}`);

    // Now simulate entering Hideout (main menu / lobby)
    hud.root.AddClass("InHideout");
    // Force cache refresh
    hud.clock.advance(300);
    assert.strictEqual(scheduler.isMatchInHideout(), true, "Must detect InHideout");

    const ticksBeforeHideout = tickCount;
    // Advance by 100ms: loop should be backed off to 1.5s and callback skipped
    hud.clock.advance(100);
    assert.strictEqual(tickCount, ticksBeforeHideout, "Callback must NOT fire at 50ms while in Hideout");

    loop.stop();
});

test("scheduler: wakeAllLoops wakes backed off loops immediately when match starts", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();

    const scheduler = hud.sandbox.global.QOL.core.Scheduler;
    hud.root.AddClass("InHideout");

    let tickCount = 0;
    const loop = scheduler.createPollLoop(() => {
        tickCount++;
    }, 0.05, "test_wake_feature");

    // Let it tick once and enter 1.5s idle sleep
    hud.clock.advance(300);
    const countInHideout = tickCount;

    // Simulate match start: remove InHideout and trigger engine event
    hud.root.RemoveClass("InHideout");
    hud.sandbox.global.QOL.core.EventBus.emit("engine:game_state_changed");

    // Immediately after event, loop was woken and ran tick
    assert.ok(tickCount > countInHideout, "wakeAllLoops must trigger immediate tick on game state change");

    loop.stop();
});

test("scheduler: CitadelGameStateChanged clears PanelCache", () => {
    const hud = sim.createHud();
    hud.assertLoaded();

    const panelCache = hud.sandbox.global.PanelCache || hud.sandbox.global.QOL.panelCache;
    assert.ok(panelCache, "PanelCache must exist");

    panelCache.setData("test_key", "test_value");
    assert.strictEqual(panelCache.getData("test_key"), "test_value");

    // Dispatch CitadelGameStateChanged
    hud.sandbox.global.$.DispatchEvent("CitadelGameStateChanged");

    // PanelCache should be flushed
    assert.strictEqual(panelCache.getData("test_key"), undefined, "PanelCache must be cleared on game state change");
});
