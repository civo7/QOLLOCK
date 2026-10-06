"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

function fixture() {
    const env = load();
    const add = (parent, id, classes = []) => parent.addChild(env.doc.create("Panel", { id, classes }));
    const core = add(env.hud.root, "", ["HudCore"]);
    const gameplay = add(core, "gameplay_hud");
    const health = add(gameplay, "health_and_abilities_container");
    // Native capture: actual 300x456, cumulative ui-scale 1.2; logical 250x380.
    Object.assign(health, { actuallayoutwidth: 300, actuallayoutheight: 456, actualuiscale_x: 1.2, actualuiscale_y: 1.2 });
    const canvas = add(health, "QOLHealthbarGeometry");
    for (const id of ["HealthBarContent", "HealthRegenAndTotal", "MinecraftHeartsRoot"]) add(canvas, id);
    return { env, add, health, canvas, q: env.hud.sandbox.global.QOL };
}

for (const type of [0, 1, 2, 3, 4, 5]) {
    test(`healthbar ${type}: scoped scale, Reset, history and Cancel share one canvas`, () => {
        const { env, health, canvas } = fixture();
        const { global: g, clock } = env;
        g.MOD_CONFIG.HEALTHBAR_TYPE = type;
        g.QOL.ui.window.setOpen(true); clock.advance(500);
        assert.equal(g.QOL.ui.customize.start(null, { elementId: "healthbar" }), true);
        const click = id => { env.em.FindChildTraverse(id)._fire("onactivate"); clock.advance(1200); };
        const input = env.em.FindChildTraverse("QOLCustomize_PLAYER_HEALTHBAR_SCALE");
        input.text = "150"; input._fire("oninputsubmit"); clock.advance(1200);
        assert.equal(health.style.uiScale, undefined);
        assert.equal(canvas.style.uiScale, "150%");
        assert.equal(canvas.style.width, "250px");
        assert.equal(canvas.style.height, "380px");
        assert.equal(g.MOD_CONFIG.PLAYER_HEALTHBAR_SCALE, 100);
        // Model relayout values reported by native Panorama, not CSS rendering.
        Object.assign(canvas, { actuallayoutwidth: 450, actuallayoutheight: 684, actualuiscale_x: 1.8, actualuiscale_y: 1.8 });
        clock.advance(300);
        const frame = env.em.FindChildTraverse("QOLCustomizeFrame_healthbar");
        assert.equal(frame.style.width, "450px");
        assert.equal(frame.style.height, "684px");
        click("QOLCustomizeUndo"); assert.equal(canvas.style.uiScale, undefined);
        click("QOLCustomizeRedo"); assert.equal(canvas.style.uiScale, "150%");
        click("QOLCustomizeReset");
        for (const key of ["width", "height", "uiScale"]) assert.equal(canvas.style[key], undefined);
        click("QOLCustomizeUndo"); assert.equal(canvas.style.uiScale, "150%");
        click("QOLCustomizeCancel");
        for (const key of ["width", "height", "uiScale"]) assert.equal(canvas.style[key], undefined);
        assert.equal(health.style.uiScale, undefined);
        assert.equal(g.MOD_CONFIG.PLAYER_HEALTHBAR_SCALE, 100);
        assert.deepEqual(env.doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("health canvas follows native baseline and variant dimensions without replacing child animations", () => {
    const { env, health, canvas, q } = fixture();
    const numbers = canvas.FindChild("HealthRegenAndTotal");
    numbers.style.transform = "rotateZ(-10deg)";
    numbers.style.preTransformScale2d = "1.03";
    const cfg = { PLAYER_HEALTHBAR_SCALE: 151, PLAYER_HEALTHBAR_OPACITY: 0.63 };
    const update = () => q.healthbar.minimalist.update(env.hud.root, cfg, false);
    update();
    assert.equal(canvas.style.uiScale, "151%");
    assert.equal(health.style.opacity, "0.63");
    assert.equal(health.style.uiScale, undefined);
    // A different native baseline still yields the same logical canvas.
    Object.assign(health, { actuallayoutwidth: 260, actuallayoutheight: 395.2, actualuiscale_x: 1.04, actualuiscale_y: 1.04 });
    update();
    assert.equal(canvas.style.width, "250px");
    assert.equal(canvas.style.height, "380px");
    // FG uses a 400x300 logical canvas. No stale dimensions after switching.
    Object.assign(health, { actuallayoutwidth: 480, actuallayoutheight: 360, actualuiscale_x: 1.2, actualuiscale_y: 1.2 });
    update();
    assert.equal(canvas.style.width, "400px");
    assert.equal(canvas.style.height, "300px");
    let writes = 0;
    canvas.style = new Proxy(canvas.style, { set(target, key, value) { writes++; target[key] = value; return true; } });
    for (let i = 0; i < 100; i++) update();
    assert.equal(writes, 0, "unchanged geometry does not rewrite styles");
    assert.equal(numbers.style.transform, "rotateZ(-10deg)");
    assert.equal(numbers.style.preTransformScale2d, "1.03");
    q.healthbar.resetPlayerStyle(health);
    for (const key of ["width", "height", "uiScale"]) assert.equal(canvas.style[key], undefined);
    assert.equal(numbers.style.preTransformScale2d, "1.03");
});

test("replaced or not-yet-laid-out health canvas retries unchanged configuration and cleans up", () => {
    const { env, health, canvas, add, q } = fixture();
    const cfg = { PLAYER_HEALTHBAR_SCALE: 200 };
    const update = () => q.healthbar.minimalist.update(env.hud.root, cfg, false);
    update();
    canvas.SetParent(env.hud.root);
    const replacement = add(health, "QOLHealthbarGeometry");
    update();
    for (const key of ["width", "height", "uiScale"]) assert.equal(canvas.style[key], undefined);
    assert.equal(replacement.style.uiScale, "200%");
    Object.assign(health, { actuallayoutwidth: 0, actuallayoutheight: 0 }); update();
    assert.equal(replacement.style.uiScale, undefined, "wait for a complete native canvas measurement");
    Object.assign(health, { actuallayoutwidth: 300, actuallayoutheight: 456 }); update();
    assert.equal(replacement.style.uiScale, "200%");
    q.core.FeatureRegistry.disable("ql_healthbar");
    for (const key of ["width", "height", "uiScale"]) assert.equal(replacement.style[key], undefined);
    assert.deepEqual(env.clock.errors, []);
});
