"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

const setup = () => {
    const env = load();
    env.global.QOL.ui.window.setOpen(true);
    env.clock.advance(500);
    return env;
};
const activate = (env, id) => {
    const panel = env.em.FindChildTraverse(id);
    assert.ok(panel, id);
    panel._fire("onactivate");
};
const add = (env, parent, id, classes = []) => parent.addChild(env.doc.create("Panel", { id, classes }));
const rect = (panel, width, height, x = 0, y = 0) => Object.assign(panel, {
    actuallayoutwidth: width, actuallayoutheight: height, actualxoffset: x, actualyoffset: y
});
const createSoulsOwner = env => {
    const core = add(env, env.hud.root, "", ["HudCore"]);
    return rect(add(env, add(env, core, "StatsAndModsContainer"), "QOLBetterUnsecuredOverlay"), 180, 40, 20, 100);
};
const apply = env => {
    env.global.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    activate(env, "QOLCustomizeApply");
    env.clock.advance(1200);
};

test("Better Unsecured Souls uses up-positive display coordinates and sorted slider bounds", () => {
    const env = setup();
    const { QOL, QOL_DEFAULT_CONFIG: defaults } = env.global;
    const p = QOL.presentation;
    const key = "UNSECURED_SOULS_HUD_Y_OFFSET";
    const baseline = defaults[key];
    assert.equal(p.toDisplayValue(key, baseline), 0);
    assert.equal(p.toDisplayValue(key, baseline - 25), 25);
    assert.equal(p.toDisplayValue(key, baseline + 25), -25);
    assert.equal(p.fromDisplayValue(key, 25), baseline - 25);
    assert.equal(p.fromDisplayValue(key, -25), baseline + 25);
    const bounds = p.displayBounds(key, 800, 2000);
    assert.equal(bounds.min, baseline - 2000); assert.equal(bounds.max, baseline - 800);
    const angleBounds = p.displayBounds("STAMINA_CHARGE_ANGLE", 0, 360);
    assert.equal(angleBounds.min, 0); assert.equal(angleBounds.max, 360);
});

test("Customize typed values, slider, stepper, Undo, Reset, and Cancel preserve legacy raw Y", () => {
    const key = "UNSECURED_SOULS_HUD_Y_OFFSET";
    for (const [displayValue, rawDelta] of [[25, -25], [-25, 25]]) {
        const env = setup();
        const { global: g } = env;
        const baseline = g.QOL_DEFAULT_CONFIG[key];
        createSoulsOwner(env);
        g.QOL.ui.customize.start(); activate(env, "QOLCustomizeSelect_unsecuredSouls");
        const input = env.em.FindChildTraverse("QOLCustomize_" + key);
        const slider = env.em.FindChildTraverse("QOLCustomizeSlider_" + key);
        assert.ok(input); assert.ok(slider);
        assert.equal(slider.min, -2000); assert.equal(slider.max, 2000);
        input.text = String(displayValue); input._fire("oninputsubmit");
        apply(env);
        assert.equal(g.MOD_CONFIG[key], baseline + rawDelta);
        assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
    }

    const env = setup();
    const { global: g } = env;
    const baseline = g.QOL_DEFAULT_CONFIG[key];
    createSoulsOwner(env);
    g.QOL.ui.customize.start(); activate(env, "QOLCustomizeSelect_unsecuredSouls");
    const input = env.em.FindChildTraverse("QOLCustomize_" + key);
    input.text = "-25"; input._fire("oninputsubmit");
    input.text = "0";
    activate(env, "QOLCustomizeIncrease_" + key);
    assert.equal(input.text, "1", "stepper increments in up-positive display space on the current one-pixel grid");
    activate(env, "QOLCustomizeUndo");
    assert.equal(input.text, "-25");
    activate(env, "QOLCustomizeReset");
    assert.equal(input.text, "0");
    input.text = "20"; input._fire("oninputsubmit");
    activate(env, "QOLCustomizeCancel"); env.clock.advance(1200);
    assert.equal(g.MOD_CONFIG[key], baseline, "Cancel discards converted draft values");
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("downward drag adds to legacy raw Y and displays the equivalent negative up-positive value", () => {
    const env = setup();
    const { global: g } = env;
    const key = "UNSECURED_SOULS_HUD_Y_OFFSET";
    const baseline = g.QOL_DEFAULT_CONFIG[key];
    const element = g.QOL.presentation.elements.find(item => item.id === "unsecuredSouls");
    const parent = env.doc.create("Panel", { id: "SoulsParent" });
    const target = env.doc.create("Panel", { id: "SoulsTarget" });
    parent.addChild(target);
    const dragged = g.QOL.ui.customizeGeometry.dragValues(element, target, { [key]: baseline }, { x: 0, y: 40 });
    assert.equal(g.QOL.presentation.fieldMap.get(key).direction, 1);
    assert.equal(dragged[key], baseline + 40, "positive pointer Y remains positive raw Y");
    assert.equal(g.QOL.presentation.toDisplayValue(key, dragged[key]), -40);
    assert.equal(130 - (dragged[key] - baseline), 90, "the existing runtime formula keeps the same downward displacement");
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("legacy raw default and preset offsets round-trip without coordinate migration", () => {
    const { global: g } = setup();
    const key = "UNSECURED_SOULS_HUD_Y_OFFSET";
    for (const rawY of [g.QOL_DEFAULT_CONFIG[key], 920, 1095]) {
        const config = Object.assign({}, g.QOL_DEFAULT_CONFIG, { [key]: rawY });
        const token = g.QOL.persistence.serializeCompactV2(config);
        const decoded = g.QOL.persistence.deserializeCompactV2(token);
        assert.equal(decoded[key], rawY);
    }
});

test("ordinary settings slider displays converted bounds and commits snapped raw coordinates", () => {
    const env = setup();
    const { global: g } = env;
    const key = "UNSECURED_SOULS_HUD_Y_OFFSET";
    const baseline = g.QOL_DEFAULT_CONFIG[key];
    const row = g.QOL.ui.controls.createSliderRow(env.em, "Unsecured Y", key, "offset_800_2000", "");
    const slider = row.FindChildrenWithClassTraverse("HorizontalSlider")[0];
    const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
    assert.ok(slider); assert.ok(input);
    assert.equal(slider.min, baseline - 2000); assert.equal(slider.max, baseline - 800);
    input.text = "25"; input._fire("oninputsubmit");
    assert.equal(g.MOD_CONFIG[key], baseline - 25);
    slider.value = -25; slider._fire("onvaluechanged");
    assert.equal(g.MOD_CONFIG[key], baseline + 25);
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});
