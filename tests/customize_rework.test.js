"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const startDrag = require("./customize_drag_fixture");
const click = (env, id) => { const panel = env.em.FindChildTraverse(id); assert.ok(panel, id); panel._fire("onactivate"); };
const rect = (panel, width, height, x = 0, y = 0) => Object.assign(panel, {
    actuallayoutwidth: width, actuallayoutheight: height, actualxoffset: x, actualyoffset: y
});
function setup(id = "souls", width = 160, height = 60, x = 200, y = 100) {
    const env = load();
    env.global.QOL.ui.window.setOpen(true); env.clock.advance(500);
    const element = env.global.QOL.presentation.elements.find(item => item.id === id);
    let panel = env.hud.root;
    for (const segment of element.path) {
        let child = typeof segment === "string" ? panel.FindChild(segment) : panel.Children().find(item => item.BHasClass(segment.className));
        if (!child) child = panel.addChild(env.doc.create("Panel", {
            id: typeof segment === "string" ? segment : "", classes: typeof segment === "string" ? [] : [segment.className]
        }));
        panel = child;
    }
    rect(panel, width, height, x, y);
    return { ...env, element, panel, find: name => env.em.FindChildTraverse(name) };
}
function clean(env) {
    click(env, "QOLCustomizeCancel"); env.clock.advance(1200);
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
}

for (const [id, prefix] of [["abilityPoints", "AP_"], ["stamina", "STAMINA_"]]) {
    test(`${id}: independent placement previews, restores and survives envelope export without a version bump`, () => {
        const env = setup(id);
        const { global: g, clock, panel } = env;
        const parent = panel.GetParent();
        const versions = [g.QOL_SCHEMA_SEMVER, g.QOL_SCHEMA_WIRE_VERSION];
        assert.equal(g.QOL.ui.customize.start(null, { elementId: id }), true);
        const proxy = startDrag(env, env.find("QOLCustomizeFrame_" + id));
        proxy.actualxoffset += 123; proxy.actualyoffset += 321;
        g.$.DispatchEvent("DragEnd", env.find("QOLCustomizeFrame_" + id), proxy); clock.advance(700);
        assert.equal(panel.style.x, "123px"); assert.equal(panel.style.y, "321px");
        assert.equal(panel.GetParent(), parent);
        assert.equal(g.MOD_CONFIG[prefix + "X_OFFSET"], 0);
        click(env, "QOLCustomizeUndo"); clock.advance(700);
        assert.equal(panel.style.x, undefined); assert.equal(panel.style.y, undefined);
        click(env, "QOLCustomizeRedo"); clock.advance(700);
        g.QOL.core.storageBridge.saveSettings = (_cfg, callback) => callback(null);
        click(env, "QOLCustomizeApply"); clock.advance(700);
        const parsed = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
        assert.equal(parsed.ok, true); assert.equal(parsed.candidateConfig[prefix + "X_OFFSET"], 123);
        assert.equal(parsed.candidateConfig[prefix + "Y_OFFSET"], -321);
        assert.deepEqual([g.QOL_SCHEMA_SEMVER, g.QOL_SCHEMA_WIRE_VERSION], versions);
        g.QOL.ui.customize.start(null, { elementId: id });
        click(env, "QOLCustomizeReset"); clock.advance(700);
        assert.equal(panel.style.x, undefined); assert.equal(panel.style.y, undefined);
        clean(env);
        assert.equal(panel.style.x, "123px");
    });
}
