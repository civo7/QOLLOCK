"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

function setup() {
    const env = load();
    const add = (parent, id, classes = [], type = "Panel") => parent.addChild(env.doc.create(type, { id, classes }));
    const core = add(env.hud.root, "", ["HudCore"]);
    const crosshair = add(add(add(core, "gameplay_hud"), "gameplay_hud_alive"), "crosshair");
    const gun = add(add(crosshair, "gun"), "gun_data");
    const ammo = add(gun, "ammo_panel");
    const current = add(ammo, "", ["weapon_ammo"], "Label");
    const max = add(ammo, "", ["weapon_ammo_max"], "Label");
    current.text = "12"; max.text = " / 30";
    for (const panel of [ammo, current, max]) Object.assign(panel, { actuallayoutwidth: 80, actuallayoutheight: 22 });
    env.global.QOL.ui.window.setOpen(true); env.clock.advance(500);
    return { ...env, add, ammo, current, max };
}
const activate = (env, id) => { const panel = env.em.FindChildTraverse(id); assert.ok(panel, id); panel._fire("onactivate"); };
const submit = (env, key, value) => {
    const input = env.em.FindChildTraverse("QOLCustomize_" + key); assert.ok(input, key);
    input.text = String(value); input._fire("oninputsubmit"); env.clock.advance(1200);
};

test("Ammo parent moves only the group; Current and Max expose independent measured frames", () => {
    const env = setup(), p = env.global.QOL.presentation;
    const parent = p.elements.find(element => element.id === "ammo");
    const current = p.elements.find(element => element.id === "ammoCurrent");
    const max = p.elements.find(element => element.id === "ammoMax");
    assert.equal(p.resolve(current, env.hud.root), env.current);
    assert.equal(p.resolve(max, env.hud.root), env.max);
    const values = env.global.QOL.ui.customizeGeometry.dragValues(parent, env.ammo, env.global.MOD_CONFIG, { x: 25, y: 10 });
    assert.deepEqual(Object.keys(values), ["AMMO_PANEL_X_OFFSET", "AMMO_PANEL_Y_OFFSET"]);
    assert.equal(values.AMMO_PANEL_X_OFFSET, 25); assert.equal(values.AMMO_PANEL_Y_OFFSET, -10);
    const child = env.global.QOL.ui.customizeGeometry.dragValues(max, env.max, env.global.MOD_CONFIG, { x: -11, y: 19 });
    assert.equal(child.AMMO_MAX_X_OFFSET, -11); assert.equal(child.AMMO_MAX_Y_OFFSET, -19);
    env.global.QOL.ui.customize.start();
    for (const id of ["ammo", "ammoCurrent", "ammoMax"]) assert.ok(env.em.FindChildTraverse("QOLCustomizeFrame_" + id));
    activate(env, "QOLCustomizeCancel");
    env.current.DeleteAsync(0); env.max.DeleteAsync(0); env.clock.advance(1);
    assert.equal(p.resolve(current, env.hud.root), null, "ring-only/missing digits do not select the group instead");
    assert.equal(p.resolve(max, env.hud.root), null);
    assert.deepEqual(env.clock.errors, []);
});

test("scoped label preview preserves native text and shared geometry, reapplies replacements and retires offsets", () => {
    const env = setup(), g = env.global, store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(g.QOL.ui.customize.start(null, { elementId: "ammoCurrent" }), true);
    submit(env, "AMMO_CURRENT_X_OFFSET", 17); submit(env, "AMMO_CURRENT_Y_OFFSET", -13);
    assert.equal(env.current.style.x, "17px"); assert.equal(env.current.style.y, "13px");
    assert.equal(env.current.text, "12"); assert.equal(env.max.text, " / 30");
    assert.equal(env.max.style.x, undefined); assert.equal(env.ammo.style.marginLeft, undefined);
    assert.equal(store.get("ql_ammo", "AMMO_CURRENT_X_OFFSET"), 17);
    assert.equal(g.MOD_CONFIG.AMMO_CURRENT_X_OFFSET, 0);
    const old = env.current;
    old.SetParent(env.add(env.hud.root, "RetiredDigits"));
    const replacement = env.add(env.ammo, "", ["weapon_ammo"], "Label"); replacement.text = "11";
    env.clock.advance(1200);
    assert.equal(old.style.x, undefined); assert.equal(replacement.style.x, "17px");
    activate(env, "QOLCustomizeCancel"); env.clock.advance(1200);
    assert.equal(replacement.style.x, undefined); assert.equal(replacement.style.y, undefined);
    assert.equal(store.get("ql_ammo", "AMMO_CURRENT_X_OFFSET"), 0);
    assert.equal(g.QOL.ui.customize.start(null, { elementId: "ammoMax" }), true);
    submit(env, "AMMO_MAX_X_OFFSET", -21); submit(env, "AMMO_MAX_Y_OFFSET", 23);
    assert.equal(env.max.style.x, "-21px"); assert.equal(env.max.style.y, "-23px");
    assert.equal(env.max.text, " / 30", "separator remains engine-owned Max text");
    activate(env, "QOLCustomizeReset"); env.clock.advance(1200);
    assert.equal(env.max.style.x, undefined); assert.equal(env.max.style.y, undefined);
    activate(env, "QOLCustomizeCancel");
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("label offsets apply and round-trip through the current envelope without changing frozen schemas", () => {
    const env = setup(), g = env.global;
    g.QOL.ui.customize.start(null, { elementId: "ammo" });
    const values = { AMMO_CURRENT_X_OFFSET: 1999, AMMO_CURRENT_Y_OFFSET: -1999, AMMO_MAX_X_OFFSET: -2000, AMMO_MAX_Y_OFFSET: 2000 };
    for (const [key, value] of Object.entries(values)) submit(env, key, value);
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    activate(env, "QOLCustomizeApply"); env.clock.advance(1200);
    const serialized = g.QOL.ui.configTab.getCurrentExportSettingsString();
    assert.ok(g.QOL.persistence.serializeCompactV2(g.MOD_CONFIG).startsWith("{"));
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(serialized);
    assert.equal(imported.ok, true);
    for (const [key, value] of Object.entries(values)) {
        assert.equal(g.MOD_CONFIG[key], value); assert.equal(imported.candidateConfig[key], value);
        assert.equal(g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema.some(field => field.key === key), false);
    }
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("Current and Max can shrink independently and Cancel releases font overrides", () => {
    const env = setup(), g = env.global;
    assert.equal(g.QOL.ui.customize.start(null, { elementId: "ammoCurrent" }), true);
    submit(env, "AMMO_CURRENT_SCALE", 50);
    assert.equal(env.current.style.fontSize, "8px");
    assert.equal(env.max.style.fontSize, undefined);
    assert.equal(env.hud.root.BHasClass("qol_free_reticle_placement"), true);
    activate(env, "QOLCustomizeCancel"); env.clock.advance(1200);
    assert.equal(env.current.style.fontSize, undefined);
    assert.equal(env.hud.root.BHasClass("qol_free_reticle_placement"), false);
    assert.equal(g.QOL.ui.customize.start(null, { elementId: "ammoMax" }), true);
    submit(env, "AMMO_TOTAL_SCALE", 75);
    assert.equal(env.max.style.fontSize, "12px");
    assert.equal(env.current.style.fontSize, undefined);
    activate(env, "QOLCustomizeReset"); env.clock.advance(1200);
    assert.equal(env.max.style.fontSize, undefined);
    activate(env, "QOLCustomizeCancel");
    const values = { AMMO_CURRENT_SCALE: 50, AMMO_TOTAL_SCALE: 75, AMMO_PANEL_SCALE: 50 };
    Object.assign(g.MOD_CONFIG, values);
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
    assert.equal(imported.ok, true);
    for (const [key, value] of Object.entries(values)) {
        assert.equal(imported.candidateConfig[key], value);
        assert.equal(g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema.find(field => field.key === key).min, 100);
    }
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});
