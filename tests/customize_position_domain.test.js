"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const click = (env, id) => { const panel = env.em.FindChildTraverse(id); assert.ok(panel, id); panel._fire("onactivate"); };

test("all position settings preserve distant coordinates through JSON, import and current metadata", () => {
    const { global: g } = load(); const cfg = { ...g.MOD_CONFIG };
    const positions = g.QOL.settingsFields.filter(field => field.role === "position");
    for (const field of positions) {
        const origin = field.displayTransform === "nativeOriginUp" ? g.QOL_DEFAULT_CONFIG[field.key] : 0;
        assert.equal(field.min, origin - g.QOL.settingLimits.coordinate, field.key);
        assert.equal(field.max, origin + g.QOL.settingLimits.coordinate, field.key);
        cfg[field.key] = origin + 12345;
    }
    const code = g.QOL.ui.configTab.getCurrentExportSettingsString(cfg);
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
    assert.equal(imported.ok, true);
    for (const field of positions) assert.equal(imported.candidateConfig[field.key], cfg[field.key], field.key);
    const hp = g.QOL.presentation.elements.find(e => e.id === "healthbar");
    assert.ok(hp.fields.some(f => f.axis === "x"));
});

test("position slider intervals use actual viewport and parent units for pixels and percentages", () => {
    const env = load(); const Q = env.global.QOL, G = Q.ui.customizeGeometry;
    const host = env.doc.create("Panel", { id: "MeasuredCanvas" });
    Object.assign(host, { actuallayoutwidth: 3840, actuallayoutheight: 2160, actualuiscale_x: 2, actualuiscale_y: 2 });
    const parent = env.doc.create("Panel", { id: "MeasuredOwnerParent" });
    Object.assign(parent, { actuallayoutwidth: 4000, actuallayoutheight: 1000, actualuiscale_x: 4, actualuiscale_y: 4 });
    const target = parent.addChild(env.doc.create("Panel", { id: "MeasuredOwner" }));
    const values = { SOULS_X_OFFSET: 0, SOULS_Y_OFFSET: 0, PASSIVE_COOLDOWN_X: 0, PASSIVE_COOLDOWN_Y: 0 };
    const observation = { host, target, values, bounds: { x: 100, y: 50, width: 200, height: 100 }, view: G.viewport(host) };
    const bounds = field => JSON.parse(JSON.stringify(G.positionSliderBounds(field, observation)));
    assert.deepEqual(bounds({ key: "SOULS_X_OFFSET", axis: "x" }), { min: -100, max: 860 });
    assert.deepEqual(bounds({ key: "SOULS_Y_OFFSET", axis: "y", direction: -1 }), { min: -490, max: 50 });
    assert.deepEqual(bounds({ key: "PASSIVE_COOLDOWN_X", axis: "x", unit: "%" }), { min: -10, max: 86 });
    assert.deepEqual(bounds({ key: "PASSIVE_COOLDOWN_Y", axis: "y", unit: "%", direction: -1 }), { min: -196, max: 20 });
    host.actuallayoutwidth = 7680; observation.view = G.viewport(host);
    assert.deepEqual(bounds({ key: "SOULS_X_OFFSET", axis: "x" }), { min: -100, max: 1820 });
    parent.actuallayoutwidth = 0;
    assert.equal(G.positionSliderBounds({ key: "PASSIVE_COOLDOWN_X", axis: "x", unit: "%" }, observation), null);
});

test("every Customize position slider keeps full-screen center travel for screen-sized content", () => {
    const env = load(), Q = env.global.QOL, G = Q.ui.customizeGeometry;
    const host = env.doc.create("Panel", { id: "Canvas" });
    const parent = env.doc.create("Panel", { id: "OwnerParent" });
    for (const panel of [host, parent]) Object.assign(panel, {
        actuallayoutwidth: 1920, actuallayoutheight: 1080, actualuiscale_x: 1, actualuiscale_y: 1
    });
    const target = parent.addChild(env.doc.create("Panel", { id: "Owner" }));
    const observation = { host, target, values: { ...env.global.QOL_DEFAULT_CONFIG }, view: G.viewport(host),
        bounds: { x: 3, y: 3, width: 1914, height: 1074 } };
    const fields = Q.presentation.elements.flatMap(element => element.fields.filter(field => field.axis));
    assert.ok(fields.length > 0);
    for (const field of fields) {
        const origin = observation.values[field.key];
        const halfTravel = field.unit === "%" ? 50 : field.axis === "x" ? 960 : 540;
        const ratio = field.movementRatio ?? 1;
        const actual = G.positionSliderBounds(field, observation);
        assert.equal(actual.min, origin - halfTravel / ratio, field.key + " minimum");
        assert.equal(actual.max, origin + halfTravel / ratio, field.key + " maximum");
    }
});

test("oversized content can align either edge without collapsing slider travel", () => {
    const env = load(), G = env.global.QOL.ui.customizeGeometry;
    const host = env.doc.create("Panel", { id: "Canvas" });
    const parent = env.doc.create("Panel", { id: "OwnerParent" });
    Object.assign(parent, { actualuiscale_x: 1, actualuiscale_y: 1 });
    const target = parent.addChild(env.doc.create("Panel", { id: "Owner" }));
    const observation = { host, target, values: { SOULS_X_OFFSET: 0 },
        view: { x: 0, y: 0, width: 1920, height: 1080 }, bounds: { x: -2040, y: 0, width: 6000, height: 100 } };
    const range = G.positionSliderBounds({ key: "SOULS_X_OFFSET", axis: "x" }, observation);
    assert.equal(range.min, -2040);
    assert.equal(range.max, 2040);
});

test("Tab minimap slider retains screen-wide travel and accepted off-screen positions", () => {
    const env = load(), Q = env.global.QOL;
    Q.ui.window.setOpen(true); env.clock.advance(500);
    const element = Q.presentation.elements.find(item => item.id === "minimapTab");
    const session = Q.ui.customizeSession.create(env.doc.root, env.hud.root, env.em.FindChildTraverse("SettingsWindow"), element);
    const host = env.em.addChild(env.doc.create("Panel", { id: "TabInspector" }));
    const parent = env.doc.create("Panel", { id: "MapParent" });
    Object.assign(parent, { actualuiscale_x: 1, actualuiscale_y: 1 });
    const target = parent.addChild(env.doc.create("Panel", { id: "minimap_persp" }));
    const key = "ZOOM_Y_OFFSET_TAB";
    const geometry = { host, target, values: { [key]: 0, ZOOM_X_OFFSET_TAB: 0 },
        view: { x: 0, y: 0, width: 1920, height: 1080 }, bounds: { x: 423, y: 3, width: 1074, height: 1074 } };
    const inspector = Q.ui.customizeInspector.build(host, element, session, options => inspector.sync(options), host, () => geometry);
    const slider = host.FindChildTraverse("QOLCustomizeSlider_" + key);
    assert.equal(slider.min, -1080); assert.equal(slider.max, 1080);
    slider.value = 600; slider._fire("onvaluechanged");
    assert.equal(session.value(key), 600);
    assert.equal(host.FindChildTraverse("QOLCustomize_" + key).text, "600");
    geometry.values[key] = 600; geometry.bounds.y = -297;
    const before = JSON.stringify(session.snapshot());
    inspector.refreshRanges();
    assert.equal(slider.min, -1080); assert.equal(slider.max, 1080); assert.equal(slider.value, 600);
    assert.equal(JSON.stringify(session.snapshot()), before);
    const input = host.FindChildTraverse("QOLCustomize_" + key);
    input.text = "1554"; input._fire("oninputsubmit");
    geometry.values[key] = 1554; geometry.bounds.y = -774;
    inspector.refreshRanges();
    assert.equal(slider.min, -1080); assert.equal(slider.max, 1554); assert.equal(slider.value, 1554);
    slider.value = 1400; slider._fire("onvaluechanged");
    assert.equal(session.value(key), 1400, "moving the slider back from a distant drag position must not jump to the viewport edge");
    assert.equal(session.undo(), true); assert.equal(session.value(key), 1554);
    assert.equal(session.undo(), true); assert.equal(session.value(key), 600);
    assert.equal(session.undo(), true); assert.equal(session.value(key), 0);
    inspector.dispose(); session.close();
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("range refresh preserves exact input and usable slider travel after measurements disappear", () => {
    const env = load(), g = env.global, Q = g.QOL;
    Q.ui.window.setOpen(true); env.clock.advance(500);
    const element = Q.presentation.elements.find(e => e.id === "souls");
    const session = Q.ui.customizeSession.create(env.doc.root, env.hud.root, env.em.FindChildTraverse("SettingsWindow"), element);
    const host = env.doc.create("Panel", { id: "RangeInspector" }); env.em.addChild(host);
    const parent = env.doc.create("Panel", { id: "RangeParent" });
    Object.assign(parent, { actuallayoutwidth: 1920, actuallayoutheight: 1080, actualuiscale_x: 1, actualuiscale_y: 1 });
    const target = parent.addChild(env.doc.create("Panel", { id: "RangeTarget" }));
    let geometry = { target, host, bounds: { x: 100, y: 50, width: 200, height: 100 },
        values: { SOULS_X_OFFSET: 0, SOULS_Y_OFFSET: 0 }, view: { x: 0, y: 0, width: 1920, height: 1080 } };
    const inspector = Q.ui.customizeInspector.build(host, element, session, options => inspector.sync(options), host, () => geometry);
    const input = host.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET");
    const slider = host.FindChildTraverse("QOLCustomizeSlider_SOULS_X_OFFSET");
    assert.equal(slider.min, -200); assert.equal(slider.max, 1720);
    input.text = "9000"; input._fire("oninputsubmit");
    assert.equal(session.value("SOULS_X_OFFSET"), 9000); assert.equal(input.text, "9000");
    assert.equal(slider.value, 1720);
    const before = JSON.stringify(session.snapshot());
    geometry.view.width = 3840; inspector.refreshRanges();
    assert.equal(slider.max, 3640); assert.equal(input.text, "9000");
    assert.equal(JSON.stringify(session.snapshot()), before);
    geometry = null; inspector.refreshRanges();
    assert.equal(slider.enabled, true, "losing native layout must not disable a capturing slider");
    assert.equal(slider.min, -200); assert.equal(slider.max, 3640);
    slider.value = 100; slider._fire("onvaluechanged");
    assert.equal(session.value("SOULS_X_OFFSET"), 100, "the retained numeric range still permits recovery");
    input.text = "12000"; input._fire("oninputsubmit");
    assert.equal(session.value("SOULS_X_OFFSET"), 12000);
    assert.equal(session.undo(), true); assert.equal(session.value("SOULS_X_OFFSET"), 100);
    assert.equal(session.undo(), true); assert.equal(session.value("SOULS_X_OFFSET"), 9000);
    assert.equal(session.undo(), true); assert.equal(session.value("SOULS_X_OFFSET"), 0);
    assert.equal(session.canUndo(), false);
    inspector.dispose(); session.close();
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("position sliders do not rewrite native range or enabled state during unchanged refreshes", () => {
    const env = load(), Q = env.global.QOL;
    Q.ui.window.setOpen(true); env.clock.advance(500);
    const element = Q.presentation.elements.find(item => item.id === "souls");
    const session = Q.ui.customizeSession.create(env.doc.root, env.hud.root, env.em.FindChildTraverse("SettingsWindow"), element);
    const host = env.em.addChild(env.doc.create("Panel", { id: "StableRangeInspector" }));
    const parent = env.doc.create("Panel", { id: "StableRangeParent" });
    const target = parent.addChild(env.doc.create("Panel", { id: "StableRangeTarget" }));
    const geometry = { host, target, values: { SOULS_X_OFFSET: 0, SOULS_Y_OFFSET: 0 },
        bounds: { x: 200, y: 100, width: 100, height: 60 }, view: { x: 0, y: 0, width: 1920, height: 1080 } };
    const inspector = Q.ui.customizeInspector.build(host, element, session, options => inspector.sync(options), host, () => geometry);
    const slider = host.FindChildTraverse("QOLCustomizeSlider_SOULS_X_OFFSET");
    const writes = [];
    for (const key of ["min", "max", "enabled"]) {
        let value = slider[key];
        Object.defineProperty(slider, key, { configurable: true, get: () => value, set(next) { writes.push([key, next]); value = next; } });
    }
    slider.value = -150; slider._fire("onvaluechanged");
    for (let index = 0; index < 5; index++) inspector.refreshRanges();
    assert.deepEqual(writes, [], "native input state must not be reconfigured by its own preview refresh");
    assert.equal(session.value("SOULS_X_OFFSET"), -150);
    inspector.dispose(); session.close();
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("Reset restores offscreen coordinates to defaults and Cancel restores the saved position", () => {
    const env = load(), g = env.global, Q = g.QOL;
    Q.ui.window.setOpen(true); env.clock.advance(500);
    const element = Q.presentation.elements.find(e => e.id === "souls");
    let panel = env.hud.root;
    for (const segment of element.path) {
        let child = typeof segment === "string" ? panel.FindChild(segment) : panel.Children().find(p => p.BHasClass(segment.className));
        if (!child) child = panel.addChild(env.doc.create("Panel", { id: typeof segment === "string" ? segment : "", classes: typeof segment === "string" ? [] : [segment.className] }));
        panel = child;
    }
    Object.assign(panel, { actuallayoutwidth: 100, actuallayoutheight: 60, actualxoffset: 5000, actualyoffset: 80 });
    const leaf = panel.FindChild("CurrentGoldAmount");
    if (leaf) Object.assign(leaf, { actuallayoutwidth: 100, actuallayoutheight: 60, actualxoffset: 0, actualyoffset: 0 });
    g.MOD_CONFIG.SOULS_X_OFFSET = 5000; g.SaveAndSync(); env.clock.advance(700);
    Q.ui.customize.start(null, { elementId: "souls" });
    const overlay = env.em.FindChildTraverse("QOLCustomizeEditor");
    Object.assign(overlay, { actuallayoutwidth: 1920, actuallayoutheight: 1080, actualuiscale_x: 1, actualuiscale_y: 1 });
    env.clock.advance(300);
    assert.equal(!!env.em.FindChildTraverse("QOLCustomizeRecover"), false);
    const reset = env.em.FindChildTraverse("QOLCustomizeReset");
    assert.equal(reset.GetParent().id, "QOLCustomizeResetRow");
    click(env, "QOLCustomizeReset"); env.clock.advance(700);
    assert.equal(env.hud.sandbox.global.QOL.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 0);
    assert.equal(panel.style.x, undefined);
    assert.equal(env.hud.sandbox.global.State.lastConfig.SOULS_X_OFFSET, 5000, "preview leaves canonical snapshot unchanged");
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 5000);
    click(env, "QOLCustomizeCancel"); env.clock.advance(700);
    assert.equal(env.hud.sandbox.global.State.lastConfig.SOULS_X_OFFSET, 5000);
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});
