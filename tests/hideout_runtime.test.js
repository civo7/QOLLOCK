"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const Q = env.sandbox.global.QOL;
    Q.core.App.shutdown();
    return { ...env, Q, $: env.sandbox.global.$ };
}

// The fixture exercises lifetime logic, not native layout/composition.
function healthTree(env, healing) {
    const { $, root } = env;
    const health = $.CreatePanel("Panel", root, "HealthContainerRoot");
    const heartsRoot = $.CreatePanel("Panel", health, "MinecraftHeartsRoot");
    const hearts = $.CreatePanel("Panel", heartsRoot, "MinecraftHearts");
    $.CreatePanel("Label", health, "currentHealthOverHearts").text = healing ? "500" : "100";
    $.CreatePanel("Label", health, "totalHealthOverHearts").text = "1000";
    $.CreatePanel("Panel", health, "HudShieldsContainer");
    $.CreatePanel("Panel", health, "MinecraftTotemContainer");
    $.CreatePanel("Panel", health, "hud_health_bars");
    const heal = healing ? $.CreatePanel("Panel", health, "pending_incoming_heal_Middle") : null;
    if (heal) heal.style.height = "0px";
    return { health, hearts, heal };
}

for (const hideoutClass of ["InHideout", "connectedToHideout"]) {
    for (const healing of [false, true]) {
        test(`healthbar stops ${healing ? "healing" : "low-health"} animation on ${hideoutClass} and recovers`, () => {
            const env = setup();
            const { Q, root, clock } = env;
            const initial = healthTree(env, healing);
            const cfg = { HEALTHBAR_TYPE: 5 };
            const feature = Q.core.FeatureRegistry.getManifest("ql_healthbar").create({ config: { all: () => cfg } });
            feature.onEnable();
            clock.advance(150);
            if (initial.heal) {
                initial.heal.style.height = "40px";
                clock.advance(150);
            }
            const activeKey = healing ? "mcHealingWaveActive" : "mcLowHealthJiggleActive";
            const timerKey = healing ? "mcHealingWaveTimer" : "mcLowHealthJiggleTimer";
            assert.equal(Q.state[activeKey], true, "actual variant must start an animation");
            assert.notEqual(Q.state[timerKey], null, "animation must have a pending native callback");
            assert.ok(initial.hearts.GetChildCount() > 0);

            root.AddClass(hideoutClass);
            clock.advance(100);
            assert.equal(Q.state[activeKey], false, "hideout must stop raw animation schedules");
            assert.equal(Q.state.mcHeartsBlinkTimer, null);
            assert.equal(Q.state.mcLowHealthJiggleTimer, null);
            assert.equal(Q.state.mcHealingWaveTimer, null);

            initial.health.DeleteAsync(0);
            clock.advance(2000);
            const replacement = healthTree(env, healing);
            root.RemoveClass(hideoutClass);
            clock.advance(1000);
            if (replacement.heal) {
                replacement.heal.style.height = "40px";
                clock.advance(150);
            }
            assert.ok(replacement.hearts.GetChildCount() > 0, "same-size replacement must rebuild heart panels");
            assert.equal(Q.state[activeKey], true, "next match must restart animation");
            assert.ok(Q.state.mcHeartSlots.every(panel => panel.IsValid()));
            feature.onDisable();
            assert.equal(Q.state[activeKey], false);
            assert.deepEqual(clock.errors, []);
            assert.equal(env.sandbox.messages.filter(line => /Error in|\[ERROR\]/.test(line)).length, 0);
        });
    }
}

test("Minecraft raw animation stops when its source disappears before the next HUD poll", () => {
    const env = setup();
    const { health } = healthTree(env, false);
    env.Q.healthbar.mc.update(env.root, { HEALTHBAR_TYPE: 5 }, env.clock.now(), true);
    assert.equal(env.Q.state.mcLowHealthJiggleActive, true);
    health.DeleteAsync(0);
    env.clock.advance(1000);
    assert.equal(env.Q.state.mcLowHealthJiggleActive, false);
    assert.equal(env.Q.state.mcLowHealthJiggleTimer, null);
    assert.equal(env.sandbox.messages.filter(line => /Error in|\[ERROR\]/.test(line)).length, 0);
    assert.deepEqual(env.clock.errors, []);
});

function minimapTree(env) {
    const container = env.$.CreatePanel("Panel", env.root, "minimap_container");
    const map = env.$.CreatePanel("Panel", container, "hud_minimap");
    const player = env.$.CreatePanel("Panel", map, "");
    player.AddClass("localplayer");
    player.AddClass("player");
    const image = env.$.CreatePanel("Image", player, "MainImage");
    image.style.preTransformRotate2d = "120deg";
    return { container, map };
}

for (const hideoutClass of ["InHideout", "connectedToHideout"]) {
    for (const mode of ["rotation", "flip", "overlay"]) {
        test(`compass ${mode} stops missing-map searches and repeated hide writes in ${hideoutClass}`, () => {
            const env = setup();
            const { Q, root, clock } = env;
            const initial = minimapTree(env);
            const cfg = {
                ENABLE_COMPASS: true, ENABLE_COMPASS_SPEED: true,
                MINIMAP_ROTATE_WITH_PLAYER: mode === "rotation", MINIMAP_FLIP: mode === "flip"
            };
            const feature = Q.core.FeatureRegistry.getManifest("ql_compass").create({ config: { view: () => cfg } });
            feature.onEnable();
            clock.advance(200);
            const overlay = root.FindChildTraverse("QOLCompassRoot");
            assert.equal(overlay.style.visibility, "visible");
            if (mode === "rotation") assert.ok(initial.map.style.preTransformRotate2d);
            assert.equal(initial.map.BHasClass("qol_minimap_flip_active"), mode === "flip");

            root.AddClass(hideoutClass);
            clock.advance(100);
            assert.equal(overlay.style.visibility, "collapse");
            assert.ok(!initial.map.style.preTransformRotate2d, "hideout releases owned rotation");
            assert.equal(initial.map.BHasClass("qol_minimap_flip_active"), false);
            assert.equal(initial.container.BHasClass("qol_minimap_flip_active"), false);
            initial.container.DeleteAsync(0);
            clock.advance(100);

            let traversals = 0;
            let writes = 0;
            const find = root.FindChildTraverse;
            root.FindChildTraverse = function(id) { traversals++; return find.call(this, id); };
            const style = overlay.style;
            overlay.style = new Proxy(style, { set(target, key, value) { writes++; target[key] = value; return true; } });
            clock.advance(2000);
            assert.equal(traversals, 0, "idle hideout must not search an absent minimap");
            assert.equal(writes, 0, "already-hidden overlay must not receive repeated style writes");
            root.FindChildTraverse = find;
            overlay.style = style;

            const replacement = minimapTree(env);
            root.RemoveClass(hideoutClass);
            clock.advance(1000);
            assert.equal(overlay.style.visibility, "visible");
            if (mode === "rotation") assert.ok(replacement.map.style.preTransformRotate2d);
            assert.equal(replacement.map.BHasClass("qol_minimap_flip_active"), mode === "flip");
            assert.equal(root.FindChildTraverse("QOLCompassDegree").text, "120°");
            feature.onDisable();
            assert.ok(!replacement.map.style.preTransformRotate2d);
            assert.equal(replacement.map.BHasClass("qol_minimap_flip_active"), false);
            assert.deepEqual(clock.errors, []);
            assert.equal(env.sandbox.messages.filter(line => /\[ERROR\]/.test(line)).length, 0);
        });
    }
}

test("compass starting in hideout does no discovery and wakes up for a match", () => {
    const env = setup();
    env.root.AddClass("connectedToHideout");
    let traversals = 0;
    const find = env.root.FindChildTraverse;
    env.root.FindChildTraverse = function(id) { traversals++; return find.call(this, id); };
    const feature = env.Q.core.FeatureRegistry.getManifest("ql_compass").create({
        config: { view: () => ({ ENABLE_COMPASS: true }) }
    });
    feature.onEnable();
    env.clock.advance(2000);
    assert.equal(traversals, 0);
    env.root.FindChildTraverse = find;
    minimapTree(env);
    env.root.RemoveClass("connectedToHideout");
    env.clock.advance(1000);
    assert.equal(env.root.FindChildTraverse("QOLCompassRoot").style.visibility, "visible");
    feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});
