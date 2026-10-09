"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

test("buff, minimap and Rift countdowns update on the same observed game second", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    const top = $.CreatePanel("Panel", hud.root, "TopBar");
    const clockLabel = $.CreatePanel("Label", top, "GameTime");
    clockLabel.text = "12:00";
    const buffLabel = $.CreatePanel("Label", top, "BuffTime");
    const persp = $.CreatePanel("Panel", hud.root, "minimap_persp");
    const container = $.CreatePanel("Panel", persp, "minimap_container");
    $.CreatePanel("Panel", container, "hud_minimap");

    const registry = Q.core.FeatureRegistry;
    const rejuv = registry.getManifest("ql_rejuv_hud").create({ config: { view: () => ({ ENABLE_BUFF_HUD: 1 }) } });
    const minimap = registry.getManifest("ql_minimap_timers").create({ config: { view: () => ({ ENABLE_MINIMAP_BUFF_TIMER: 1 }) } });
    const rift = registry.getManifest("ql_urn_timer").create({ config: { view: () => ({ ENABLE_URN_TIMER: 1 }) } });
    rejuv.onEnable();
    minimap.onEnable();
    rift.onEnable();
    hud.clock.advance(500);
    const minimapLabel = hud.root.FindChildTraverse("QOLMinimapBuffTime");
    const riftLabel = hud.root.FindChildTraverse("RiftTimerLabel");
    assert.ok(minimapLabel);
    assert.ok(riftLabel);

    const changes = [];
    for (const [name, panel] of [["buff", buffLabel], ["minimap", minimapLabel], ["rift", riftLabel]]) {
        let value = panel.text;
        Object.defineProperty(panel, "text", {
            configurable: true,
            get: () => value,
            set: next => {
                if (next !== value) changes.push({ name, at: hud.clock.now(), text: next });
                value = next;
            }
        });
    }

    clockLabel.text = "12:01";
    hud.clock.advance(200);
    const tick = changes.filter(change => change.text === "2:59" || change.text === "0:00 - 1:19");
    assert.deepEqual(tick.map(change => change.name).sort(), ["buff", "minimap", "rift"]);
    assert.equal(new Set(tick.map(change => change.at)).size, 1);
    assert.deepEqual(hud.clock.errors, []);
    rejuv.onDisable();
    minimap.onDisable();
    rift.onDisable();
});

test("game clock cache avoids repeated full-HUD TopBar searches and follows replacement", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    const first = $.CreatePanel("Panel", hud.root, "TopBar");
    $.CreatePanel("Label", first, "GameTime").text = "7:42";
    const find = hud.root.FindChildTraverse.bind(hud.root);
    let searches = 0;
    hud.root.FindChildTraverse = id => {
        if (id === "TopBar") searches++;
        return find(id);
    };
    for (let i = 0; i < 20; i++) {
        assert.equal(Q.core.time.readGameTime(hud.root), 462);
        assert.equal(Q.core.time.readGameTime(), 462);
    }
    assert.ok(searches <= 2, `repeated clock reads searched the HUD ${searches} times`);

    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", hud.root, "TopBar");
    $.CreatePanel("Label", replacement, "GameTime").text = "7:43";
    assert.equal(Q.core.time.readGameTime(), 463);
    assert.deepEqual(hud.clock.errors, []);
});

test("missing game clock backs off full-HUD searches and recovers when the label appears", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    const top = $.CreatePanel("Panel", hud.root, "TopBar");
    const find = hud.root.FindChildTraverse.bind(hud.root);
    let misses = 0;
    hud.root.FindChildTraverse = id => {
        if (id === "GameTime") misses++;
        return find(id);
    };
    for (let i = 0; i < 20; i++) assert.equal(Q.core.time.readGameTime(), 0);
    assert.equal(misses, 1, "missing label should not trigger a full-HUD walk on every sample");
    hud.clock.advance(1100);
    $.CreatePanel("Label", top, "GameTime").text = "1:02";
    assert.equal(Q.core.time.readGameTime(), 62);
    assert.deepEqual(hud.clock.errors, []);
});

function nativeClock(env, root, text) {
    const $ = env.sandbox.global.$;
    const core = $.CreatePanel("Panel", root, ""); core.AddClass("HudCore");
    const bar = $.CreatePanel("Panel", core, "TopBar");
    const container = $.CreatePanel("Panel", bar, ""); container.AddClass("GameClock");
    const label = $.CreatePanel("Label", container, "GameTime"); label.text = text;
    return { core, bar, container, label };
}

test("native clock follows verified living owner and label replacements without a stale fallback", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded(); const Q = env.sandbox.global.QOL, $ = env.sandbox.global.$;
    Q.core.App.shutdown(); const first = nativeClock(env, env.root, "7:42");
    assert.equal(Q.core.time.readGameTime(), 462);
    first.label.SetParent($.CreatePanel("Panel", null, "RetiredClock"));
    const replacement = $.CreatePanel("Label", first.container, "GameTime"); replacement.text = "7:43";
    assert.equal(Q.core.time.readGameTime(), 463); assert.equal(first.label.IsValid(), true);
    first.core.SetParent($.CreatePanel("Panel", null, "RetiredHudCore")); nativeClock(env, env.root, "7:44");
    assert.equal(Q.core.time.readGameTime(), 464); assert.equal(first.bar.IsValid(), true);
    assert.deepEqual(env.clock.errors, []);
});

test("native clock upgrades a construction fallback when the preferred clock arrives", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded(); const Q = env.sandbox.global.QOL, $ = env.sandbox.global.$;
    Q.core.App.shutdown(); const fallback = $.CreatePanel("Label", env.root, "GameTime"); fallback.text = "1:00";
    assert.equal(Q.core.time.readGameTime(), 60); nativeClock(env, env.root, "2:00");
    assert.equal(Q.core.time.readGameTime(), 120); assert.equal(fallback.text, "1:00"); assert.deepEqual(env.clock.errors, []);
});

test("shared second observation rebinds living generations at equal times and keeps listener order", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded(); const Q = env.sandbox.global.QOL, $ = env.sandbox.global.$;
    Q.core.App.shutdown(); nativeClock(env, env.root, "2:00");
    const seen = [], first = Q.core.time.subscribeGameSecond(seconds => seen.push(["model", seconds]), 0);
    const second = Q.core.time.subscribeGameSecond(seconds => seen.push(["view", seconds]), 1);
    env.clock.advance(200); assert.deepEqual(seen, [["model", 120], ["view", 120]]); seen.length = 0;
    const nextRoot = $.CreatePanel("CitadelHud", null, "Hud"); nativeClock(env, nextRoot, "2:00"); env.doc.root = nextRoot;
    env.clock.advance(200); assert.deepEqual(seen, [["model", 120], ["view", 120]]);
    const requested = $.CreatePanel("CitadelHud", null, "Hud"); nativeClock(env, requested, "3:00");
    assert.equal(Q.core.time.readObservedGameTime(requested), 180);
    seen.length = 0; first(); second(); env.clock.advance(400); assert.deepEqual(seen, []);
    assert.equal(Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_game_time"), false); assert.deepEqual(env.clock.errors, []);
});

test("second observer tolerates self-unsubscription and waits to dispatch newly added listeners", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded(); const Q = env.sandbox.global.QOL;
    Q.core.App.shutdown(); const source = nativeClock(env, env.root, "1:00"), seen = [];
    let late = null, first = null;
    first = Q.core.time.subscribeGameSecond(() => { seen.push("first"); first(); late = Q.core.time.subscribeGameSecond(() => seen.push("late")); });
    const second = Q.core.time.subscribeGameSecond(() => seen.push("second")); env.clock.advance(200);
    assert.deepEqual(seen, ["first", "second"]);
    source.label.text = "1:01"; env.clock.advance(200); assert.deepEqual(seen, ["first", "second", "second", "late"]);
    second(); late(); env.clock.advance(200); assert.deepEqual(env.clock.errors, []);
});
