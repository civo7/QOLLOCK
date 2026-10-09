"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const loadSettings = require("./load_settings_environment");

function setup() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ STAMINA_CHARGE_ANGLE: 90, STAMINA_CHARGE_COLOR: 13 });
    const cfg = Q.core.ConfigStore.view("ql_stamina");
    const feature = Q.core.FeatureRegistry.getManifest("ql_stamina").create({ id: "ql_stamina", config: { view: () => cfg } });
    const add = (parent, id = "", classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id); for (const name of classes) panel.AddClass(name); return panel;
    };
    const ring = parent => {
        const wrapper = add(parent, "", ["ability_element_charges"], "Citadel_AbilityHUDElement_Dash");
        const container = add(wrapper, "charges_container");
        const charge = add(container, "", ["charge", "has_charge"]);
        const foreground = add(charge, "progress", ["charge_fg"]), drained = add(charge, "", ["charge_drained"]);
        return { wrapper, container, charge, foreground, drained };
    };
    return { ...env, Q, $, cfg, feature, add, ring };
}

test("stamina uses native-zero presentation while the published field and imported values remain unchanged", () => {
    const env = setup(), C = env.Q.presentation;
    assert.equal(C.toDisplayValue("STAMINA_CHARGE_ANGLE", 45), 0);
    assert.equal(C.toDisplayValue("STAMINA_CHARGE_ANGLE", 90), 45);
    assert.equal(C.toDisplayValue("STAMINA_CHARGE_ANGLE", 0), 315);
    assert.equal(C.fromDisplayValue("STAMINA_CHARGE_ANGLE", 0), 45);
    assert.equal(C.fromDisplayValue("STAMINA_CHARGE_ANGLE", 360), 45);
    for (let value = 0; value < 360; value++) {
        assert.equal(C.fromDisplayValue("STAMINA_CHARGE_ANGLE", C.toDisplayValue("STAMINA_CHARGE_ANGLE", value)), value);
    }
    assert.equal(C.toDisplayValue("AMMO_CLIP_ANGLE", 45), 45, "other angle fields keep their own semantics");
    const native = env.ring(env.root);
    env.cfg.STAMINA_CHARGE_ANGLE = C.fromDisplayValue("STAMINA_CHARGE_ANGLE", 0);
    env.feature.onEnable();
    assert.equal(native.container.style.transform, undefined, "native-zero also holds with a custom color");
    env.cfg.STAMINA_CHARGE_ANGLE = C.fromDisplayValue("STAMINA_CHARGE_ANGLE", 90);
    env.feature.onSettingsChanged();
    assert.equal(native.container.style.transform, "rotateZ(90deg)");
    env.feature.onDisable();
    assert.equal(native.container.style.transform, undefined);
});

test("ordinary stamina slider shows actual degrees and writes the compatible stored value", () => {
    const env = loadSettings(), Q = env.global.QOL;
    const row = Q.ui.controls.createSliderRow(env.list, "Rotate", "STAMINA_CHARGE_ANGLE", "angle_0_360", "Rotate the stamina charge indicator.", true);
    const slider = row.FindChildrenWithClassTraverse("HorizontalSlider")[0];
    const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
    assert.equal(slider.value, 0); assert.equal(input.text, "0°");
    assert.equal(env.global.MOD_CONFIG.STAMINA_CHARGE_ANGLE, 45, "rendering does not migrate persisted data");
    input.text = "90°"; input._fire("oninputsubmit");
    assert.equal(env.global.MOD_CONFIG.STAMINA_CHARGE_ANGLE, 135);
    assert.equal(input.text, "90°"); assert.equal(slider.value, 90);
    slider.value = 0; slider._fire("onvaluechanged");
    assert.equal(env.global.MOD_CONFIG.STAMINA_CHARGE_ANGLE, 45); assert.equal(input.text, "0°");
    input.text = "360°"; input._fire("oninputsubmit");
    assert.equal(env.global.MOD_CONFIG.STAMINA_CHARGE_ANGLE, 45); assert.equal(input.text, "0°");
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("Customize stamina input, slider, stepper, undo and reset share native-zero semantics", () => {
    const env = loadSettings(), Q = env.global.QOL;
    Q.ui.window.setOpen(true); env.clock.advance(500); Q.ui.customize.start();
    const click = id => { const panel = env.em.FindChildTraverse(id); assert.ok(panel, id); panel._fire("onactivate"); };
    click("QOLCustomizeSelect_stamina");
    const input = env.em.FindChildTraverse("QOLCustomize_STAMINA_CHARGE_ANGLE");
    const slider = env.em.FindChildTraverse("QOLCustomizeSlider_STAMINA_CHARGE_ANGLE");
    assert.equal(input.text, "0"); assert.equal(slider.value, 0);
    input.text = "90"; input._fire("oninputsubmit"); env.clock.advance(500);
    assert.equal(env.hud.sandbox.global.QOL.core.ConfigStore.get("ql_stamina", "STAMINA_CHARGE_ANGLE"), 135);
    assert.equal(input.text, "90"); assert.equal(slider.value, 90);
    click("QOLCustomizeIncrease_STAMINA_CHARGE_ANGLE");
    assert.equal(input.text, "91");
    click("QOLCustomizeUndo"); assert.equal(input.text, "90");
    input.text = "400"; input._fire("oninputsubmit");
    assert.equal(input.BHasClass("Invalid"), true, "wire conversion cannot conceal an out-of-range displayed value");
    input.text = "90"; input._fire("oninputsubmit");
    slider.value = 0; slider._fire("onvaluechanged"); assert.equal(input.text, "0");
    click("QOLCustomizeReset"); assert.equal(input.text, "0");
    click("QOLCustomizeCancel");
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("stamina follows living ring/HUD generations, retries native restore and contains stopped hooks", () => {
    const env = setup(), first = env.ring(env.root);
    first.container.style.transform = "translateX(3px)";
    env.feature.onEnable();
    assert.equal(first.container.style.transform, "translateX(3px) rotateZ(45deg)");
    first.container.style.transform = "translateX(3px)"; env.clock.advance(600);
    assert.equal(first.container.style.transform, "translateX(3px) rotateZ(45deg)", "native code overwrite cannot strand the chosen rotation");
    const retired = env.add(null, "RetiredStamina"); first.wrapper.SetParent(retired);
    const second = env.ring(env.root);
    let reject = true;
    const values = { ...first.container.style };
    first.container.style = new Proxy(values, { set(target, key, value) {
        if (reject && key === "transform" && value === "translateX(3px)") throw Error("native restore unavailable");
        target[key] = value; return true;
    } });
    const clear = first.foreground.ClearPropertyFromCode.bind(first.foreground);
    first.foreground.ClearPropertyFromCode = prop => reject ? false : clear(prop);
    env.clock.advance(600);
    assert.equal(second.container.style.transform, "rotateZ(45deg)");
    assert.equal(first.foreground.style.borderColor, env.Q.core.panel.resolvePaletteColor(13));
    reject = false; env.clock.advance(600);
    assert.equal(first.container.style.transform, "translateX(3px)");
    assert.equal(first.foreground.style.borderColor, undefined);
    const currentHud = env.add(null, "Hud", [], "CitadelHud"), current = env.ring(currentHud);
    env.$.GetContextPanel = () => currentHud; env.clock.advance(600);
    assert.equal(second.container.style.transform, undefined);
    assert.equal(current.container.style.transform, "rotateZ(45deg)");
    env.feature.onDisable();
    assert.equal(current.container.style.transform, undefined);
    assert.equal(current.foreground.style.borderColor, undefined);
    env.cfg.STAMINA_CHARGE_ANGLE = 180; env.feature.onSettingsChanged(); env.clock.advance(1500);
    assert.equal(current.container.style.transform, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("stamina cannot style a loading-root lookalike and retries partially rejected rotation", () => {
    const env = setup();
    const loading = env.add(null, "LoadingRoot"), fake = env.ring(loading);
    env.$.GetContextPanel = () => loading; env.feature.onEnable();
    assert.equal(fake.container.style.transform, undefined); assert.equal(fake.foreground.style.borderColor, undefined);
    const current = env.ring(env.root); env.$.GetContextPanel = () => env.root;
    let reject = true;
    current.container.style = new Proxy({}, { set(target, key, value) {
        if (key === "transform" && reject) throw Error("native rotation rejected"); target[key] = value; return true;
    } });
    env.clock.advance(600); assert.equal(current.container.style.transform, undefined);
    reject = false; env.clock.advance(600); assert.equal(current.container.style.transform, "rotateZ(45deg)");
    env.cfg.STAMINA_CHARGE_ANGLE = 45; env.feature.onSettingsChanged();
    assert.equal(current.container.style.transform, undefined, "reset releases the actual native baseline");
    env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});
