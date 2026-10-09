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

function nativeTarget(env, parent = env.doc.root) {
    const root = env.add(parent, "", ["ability_element_unit_target"], "Citadel_AbilityHUDElement_UnitTarget");
    const instance = env.add(root, "", ["unit_target_instance"]);
    const unscaled = env.add(instance, "unscaled_panel"), hint = env.add(unscaled, "hint_container");
    const scaled = env.add(unscaled, "scaled_panel"), scaledHint = env.add(scaled, "hint_container");
    const shape = env.add(scaled, "", ["target_shape"]);
    return { root, instance, unscaled, hint, scaled, scaledHint, shape };
}

test("default target and damage controllers preserve native code styles they never owned", () => {
    for (const [id, classes] of [["ql_target_shapes", ["target_shape"]], ["ql_damage_numbers", ["HudIndicatorText"]]]) {
        const env = setup(id);
        const panel = env.add(env.root, "DefaultFixture", classes);
        const native = { uiScale: "78%", preTransformScale2d: "0.6, 0.6", opacity: "0.35", fontSize: "41px" };
        Object.assign(panel.style, native);
        const hints = id === "ql_target_shapes" ? nativeTarget(env) : null;
        if (hints) for (const hint of [hints.hint, hints.scaledHint]) Object.assign(hint.style, native);
        env.feature.onEnable(); env.clock.advance(3000); env.feature.onDisable();
        for (const [property, value] of Object.entries(native)) assert.equal(panel.style[property], value, id + "." + property);
        if (hints) for (const hint of [hints.hint, hints.scaledHint]) for (const [property, value] of Object.entries(native)) {
            assert.equal(hint.style[property], value, id + ".hint." + property);
        }
        assert.deepEqual(env.clock.errors, []);
    }
});

test("target settings apply immediately, release removed living owners and restore defaults without overriding native children", () => {
    const env = setup("ql_target_shapes", { UNIT_TARGET_SIZE: 200, UNIT_TARGET_OPACITY: 0.4, UNIT_TARGET_HINT_SIZE: 125 });
    const shape = env.add(env.root, "TargetFixture", ["target_shape"]);
    const hint = nativeTarget(env).hint;
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
    const nextRoot = env.add(env.doc.absRoot, "Hud", [], "CitadelHud");
    const replacement = env.add(nextRoot, "TargetFixture", ["target_shape"]);
    env.doc.root = nextRoot; env.clock.advance(300);
    assert.equal(old.style.uiScale, undefined); assert.equal(old.style.opacity, undefined);
    assert.equal(replacement.style.uiScale, "225%");
    env.feature.onDisable(); env.clock.advance(3000);
    for (const property of ["uiScale", "preTransformScale2d", "opacity"]) assert.equal(replacement.style[property], undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("target geometry releases living moved shapes and recycled native hint scopes before the full discovery cadence", () => {
    const env = setup("ql_target_shapes", { UNIT_TARGET_SIZE: 225, UNIT_TARGET_HINT_SIZE: 140 });
    const shape = env.add(env.root, "TargetFixture", ["target_shape"]), source = nativeTarget(env), hint = source.hint;
    shape.style.color = "#ABCDEF"; hint.style.x = "13px";
    env.feature.onEnable(); assert.equal(shape.style.uiScale, "225%"); assert.equal(hint.style.uiScale, "140%");
    shape.SetParent(env.add(null, "RetiredTarget")); source.instance.RemoveClass("unit_target_instance"); env.clock.advance(300);
    assert.equal(shape.style.uiScale, undefined); assert.equal(hint.style.uiScale, undefined);
    assert.equal(shape.style.color, "#ABCDEF"); assert.equal(hint.style.x, "13px");
    for (const key of ["targetShapesCache", "hintContainerCache", "targetShapeStyleSig", "nextTargetShapeRefreshMs", "targetShapeHadNonDefaultRuntime"]) {
        assert.equal(Object.hasOwn(env.Q.state, key), false);
    }
    assert.equal(Object.hasOwn(env.Q, "getUnitTargetDefaultStyleTexts"), false);
    env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});

test("target hint scaling uses both native duplicate IDs and ignores unrelated hint containers without XML classes", () => {
    const env = setup("ql_target_shapes", { UNIT_TARGET_HINT_SIZE: 140 }), first = nativeTarget(env), second = nativeTarget(env);
    const unrelated = env.add(env.root, "hint_container", ["qol_hint_target"]); unrelated.style.uiScale = "73%";
    const binding = env.add(first.hint, "AbilityKeyBinding", [], "CitadelBinding"); binding.style.uiScale = "87%";
    for (const target of [first, second]) for (const hint of [target.hint, target.scaledHint]) {
        hint.style.x = "native hint placement"; assert.equal(hint.BHasClass("qol_hint_target"), false);
    }
    env.feature.onEnable();
    for (const target of [first, second]) for (const hint of [target.hint, target.scaledHint]) assert.equal(hint.style.uiScale, "140%");
    assert.equal(unrelated.style.uiScale, "73%"); assert.equal(binding.style.uiScale, "87%");
    const result = env.Q.core.FeatureRegistry.getManifest("ql_target_shapes").test(); assert.match(result.message, /4 hint panels/);
    env.feature.onDisable(); env.clock.advance(300);
    for (const target of [first, second]) for (const hint of [target.hint, target.scaledHint]) {
        assert.equal(hint.style.uiScale, undefined); assert.equal(hint.style.x, "native hint placement"); assert.equal(hint.IsValid(), true);
    }
    assert.equal(binding.style.uiScale, "87%"); assert.equal(unrelated.style.uiScale, "73%"); assert.deepEqual(env.clock.errors, []);
});

test("target hint sources follow late and living replacement inside their native unscaled/scaled branches", () => {
    const env = setup("ql_target_shapes", { UNIT_TARGET_HINT_SIZE: 135 }), source = nativeTarget(env); env.feature.onEnable();
    const orphan = env.add(null, "RetiredNativeHints"); source.hint.SetParent(orphan); source.scaled.SetParent(orphan);
    const hint = env.add(source.unscaled, "hint_container"), scaled = env.add(source.unscaled, "scaled_panel");
    env.clock.advance(800);
    assert.equal(source.hint.style.uiScale, undefined); assert.equal(source.scaledHint.style.uiScale, undefined);
    assert.equal(hint.style.uiScale, "135%"); assert.equal(source.hint.IsValid(), true);
    const late = env.add(scaled, "hint_container"); env.clock.advance(1500); assert.equal(late.style.uiScale, "135%");
    source.unscaled.SetParent(orphan); env.clock.advance(300);
    assert.equal(hint.style.uiScale, undefined); assert.equal(late.style.uiScale, undefined);
    assert.equal(env.reads(), 1); env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});

test("target styling waits for a real HUD and stopped settings hooks cannot restore native overrides", () => {
    const env = setup("ql_target_shapes", { UNIT_TARGET_HINT_SIZE: 145 }), original = nativeTarget(env); env.feature.onEnable();
    env.doc.root = env.add(null, "LoadingRoot"); const loading = nativeTarget(env); env.clock.advance(300);
    assert.equal(original.hint.style.uiScale, undefined); assert.equal(loading.hint.style.uiScale, undefined);
    env.doc.root = env.add(null, "Hud", [], "CitadelHud"); const current = nativeTarget(env); env.clock.advance(1600);
    assert.equal(current.hint.style.uiScale, "145%"); assert.equal(current.scaledHint.style.uiScale, "145%");
    env.feature.onDisable(); env.feature.onSettingsChanged(); env.clock.advance(2000);
    assert.equal(current.hint.style.uiScale, undefined); assert.equal(current.scaledHint.style.uiScale, undefined);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(record => record.id === "ql_target_shapes"), false);
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

test("damage styling immediately releases a living label moved outside the current source", () => {
    const env = setup("ql_damage_numbers", { HUD_INDICATOR_SIZE: 30, DAMAGE_NUMBER_OPACITY: 0.5 });
    const source = env.add(env.root, "HudEventIndicatorsPanel");
    const label = env.add(source, "Amount", ["HudIndicatorText"], "Label");
    env.feature.onEnable(); assert.equal(label.style.fontSize, "30px");
    const retired = env.add(null, "RetiredDamageLabels"); label.SetParent(retired); env.clock.advance(600);
    assert.equal(label.style.fontSize, undefined); assert.equal(label.style.opacity, undefined);
    assert.equal(label.IsValid(), true);
    for (const key of ["indicatorPanelsCache", "indicatorMetaCache", "lastIndicatorCount", "lastIndicatorConfigSig", "lastIndicatorHideModesSig"]) {
        assert.equal(Object.hasOwn(env.Q.state, key), false);
    }
    env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});

test("damage styling binds a new living gameplay scope when the optional event source is absent", () => {
    const env = setup("ql_damage_numbers", { HUD_INDICATOR_SIZE: 30, DAMAGE_NUMBER_OPACITY: 0.5 });
    const gameplay = env.add(env.root, "gameplay_hud"), label = env.add(gameplay, "Amount", ["HudIndicatorText"], "Label");
    env.feature.onEnable(); assert.equal(label.style.fontSize, "30px");
    gameplay.SetParent(env.add(null, "RetiredGameplay"));
    const next = env.add(env.root, "gameplay_hud"), current = env.add(next, "Amount", ["HudIndicatorText"], "Label");
    env.clock.advance(600);
    assert.equal(label.style.fontSize, undefined); assert.equal(label.style.opacity, undefined);
    assert.equal(current.style.fontSize, "30px");
    env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});
