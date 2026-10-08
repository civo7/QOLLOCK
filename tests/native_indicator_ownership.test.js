"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup(id, overrides = {}) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ...overrides });
    const cfg = Q.core.ConfigStore.view(id);
    let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest(id).create({
        id, config: { view() { reads++; return cfg; } }
    });
    const add = (parent, id, classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id);
        for (const name of classes) panel.AddClass(name);
        return panel;
    };
    return { ...env, Q, $, cfg, feature, add, reads: () => reads };
}

test("default target and damage controllers preserve native code styles they never owned", () => {
    for (const [id, classes] of [["ql_target_shapes", ["target_shape", "qol_hint_target"]], ["ql_damage_numbers", ["HudIndicatorText"]]]) {
        const env = setup(id);
        const panel = env.add(env.root, "DefaultFixture", classes);
        const native = { uiScale: "78%", preTransformScale2d: "0.6, 0.6", opacity: "0.35", fontSize: "41px" };
        Object.assign(panel.style, native);
        env.feature.onEnable(); env.clock.advance(3000); env.feature.onDisable();
        for (const [property, value] of Object.entries(native)) assert.equal(panel.style[property], value, id + "." + property);
        assert.deepEqual(env.clock.errors, []);
    }
});

test("target settings apply immediately, release removed living owners and restore defaults without overriding native children", () => {
    const env = setup("ql_target_shapes", { UNIT_TARGET_SIZE: 200, UNIT_TARGET_OPACITY: 0.4, UNIT_TARGET_HINT_SIZE: 125 });
    const shape = env.add(env.root, "TargetFixture", ["target_shape"]);
    const hint = env.add(env.root, "HintFixture", ["qol_hint_target"]);
    const child = env.add(shape, "DiamondFixture"); child.style.transform = "rotateZ(45deg)";
    shape.style.x = "13px";
    env.feature.onEnable();
    assert.equal(shape.style.uiScale, "200%"); assert.equal(shape.style.opacity, "0.40"); assert.equal(hint.style.uiScale, "125%");
    shape.RemoveClass("target_shape"); env.clock.advance(1200);
    for (const property of ["uiScale", "preTransformScale2d", "opacity"]) assert.equal(shape.style[property], undefined);
    assert.equal(shape.style.x, "13px"); assert.equal(child.style.transform, "rotateZ(45deg)");
    const replacement = env.add(env.root, "NewTargetFixture", ["target_shape"]);
    env.clock.advance(1200); assert.equal(replacement.style.uiScale, "200%");
    Object.assign(env.cfg, { UNIT_TARGET_SIZE: 150, UNIT_TARGET_OPACITY: 1, UNIT_TARGET_HINT_SIZE: 100 });
    env.feature.onSettingsChanged();
    for (const panel of [replacement, hint]) for (const property of ["uiScale", "preTransformScale2d", "opacity"]) assert.equal(panel.style[property], undefined);
    env.clock.advance(3000); assert.equal(env.reads(), 2, "idle settings are derived only in hooks");
    env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});

test("target retries rejected writes, releases the old live HUD and cleans up disable without callbacks reviving it", () => {
    const env = setup("ql_target_shapes", { UNIT_TARGET_SIZE: 225, UNIT_TARGET_OPACITY: 0.3 });
    const old = env.add(env.root, "TargetFixture", ["target_shape"]);
    let reject = true;
    old.style = new Proxy({}, { set(target, key, value) { if (key === "opacity" && reject) throw Error("temporary native failure"); target[key] = value; return true; } });
    env.feature.onEnable(); assert.equal(old.style.opacity, undefined);
    reject = false; env.clock.advance(300); assert.equal(old.style.opacity, "0.30");
    const nextRoot = env.add(env.doc.absRoot, "ReplacementHud");
    const replacement = env.add(nextRoot, "TargetFixture", ["target_shape"]);
    env.doc.root = nextRoot; env.clock.advance(300);
    assert.equal(old.style.uiScale, undefined); assert.equal(old.style.opacity, undefined);
    assert.equal(replacement.style.uiScale, "225%");
    env.feature.onDisable(); env.clock.advance(3000);
    for (const property of ["uiScale", "preTransformScale2d", "opacity"]) assert.equal(replacement.style[property], undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("damage styling preserves cumulative typography and native fades while cleaning every owned property on disable", () => {
    const env = setup("ql_damage_numbers", { HUD_INDICATOR_SIZE: 45, DAMAGE_NUMBER_OPACITY: 0.4, ENABLE_HIDE_SMALL_NUMBERS: 1 });
    const source = env.add(env.root, "HudEventIndicatorsPanel");
    const smallParent = env.add(source, "SmallFixture", ["bullet_damage_new", "HudIndicatorContainer"]);
    smallParent.style.opacity = "0";
    const small = env.add(smallParent, "Amount", ["HudIndicatorText"], "Label");
    const description = env.add(source, "Desc", ["HudIndicatorText"], "Label");
    const cumulativeParent = env.add(source, "CumulativeFixture", ["cumulative"]);
    const cumulative = env.add(cumulativeParent, "TotalFixture", ["HudIndicatorText"], "Label"); cumulative.style.fontSize = "38px";
    description.style.color = "#ABCDEF";
    env.feature.onEnable();
    assert.equal(small.style.fontSize, "45px"); assert.equal(small.style.opacity, "0.00");
    assert.equal(description.style.fontSize, "28px"); assert.equal(description.style.opacity, "0.40");
    assert.equal(cumulative.style.fontSize, "38px", "cumulative font stays native");
    assert.equal(smallParent.style.opacity, "0", "controller must not revive an unowned native container fade");
    env.feature.onDisable(); env.clock.advance(3000);
    for (const panel of [small, description, cumulative]) assert.equal(panel.style.opacity, undefined);
    assert.equal(small.style.fontSize, undefined); assert.equal(description.style.fontSize, undefined);
    assert.equal(cumulative.style.fontSize, "38px"); assert.equal(description.style.color, "#ABCDEF");
    assert.deepEqual(env.clock.errors, []);
});

test("damage live class reuse changes hide/font roles and returns to native defaults immediately", () => {
    const env = setup("ql_damage_numbers", { HUD_INDICATOR_SIZE: 32, ENABLE_HIDE_SMALL_NUMBERS: 1 });
    const source = env.add(env.root, "HudEventIndicatorsPanel");
    const panel = env.add(source, "PooledIndicatorFixture", ["HudIndicatorText", "bullet_damage_new"], "Label");
    env.feature.onEnable(); assert.equal(panel.style.opacity, "0.00"); assert.equal(panel.style.fontSize, "32px");
    panel.RemoveClass("bullet_damage_new"); panel.AddClass("cumulative");
    env.clock.advance(600); assert.equal(panel.style.opacity, "1.00"); assert.equal(panel.style.fontSize, undefined);
    panel.RemoveClass("cumulative"); env.clock.advance(600); assert.equal(panel.style.fontSize, "32px");
    Object.assign(env.cfg, { HUD_INDICATOR_SIZE: 18, ENABLE_HIDE_SMALL_NUMBERS: false });
    env.feature.onSettingsChanged();
    assert.equal(panel.style.fontSize, undefined); assert.equal(panel.style.opacity, undefined);
    env.clock.advance(4000); assert.equal(env.reads(), 2);
    env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});

test("damage observes a replaced living source and releases labels that leave its source", () => {
    const env = setup("ql_damage_numbers", { HUD_INDICATOR_SIZE: 30, DAMAGE_NUMBER_OPACITY: 0.5 });
    const source = env.add(env.root, "HudEventIndicatorsPanel");
    const old = env.add(source, "AmountFixture", ["HudIndicatorText"], "Label");
    env.feature.onEnable(); assert.equal(old.style.fontSize, "30px");
    const detached = env.add(env.root, "DetachedSourceFixture"); source.SetParent(detached);
    const replacement = env.add(env.root, "HudEventIndicatorsPanel");
    const current = env.add(replacement, "AmountFixture", ["HudIndicatorText"], "Label");
    env.clock.advance(600);
    assert.equal(old.style.fontSize, undefined); assert.equal(old.style.opacity, undefined);
    assert.equal(current.style.fontSize, "30px");
    current.RemoveClass("HudIndicatorText"); env.clock.advance(3000);
    assert.equal(current.style.fontSize, undefined); assert.equal(current.style.opacity, undefined);
    env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});
