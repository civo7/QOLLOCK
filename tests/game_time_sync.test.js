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
