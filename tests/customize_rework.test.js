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

test("magnets use canvas units at different UI densities and match viewport/neighbor edges and centers", () => {
    const env = setup();
    const geometry = env.global.QOL.ui.customizeGeometry;
    const host = rect(env.doc.create("Panel"), 3840, 2160);
    host.actualuiscale_x = 2; host.actualuiscale_y = 2;
    const view = geometry.viewport(host);
    assert.equal(view.width, 1920); assert.equal(view.height, 1080);
    const bounds = { x: 800, y: 300, width: 200, height: 100 };
    let result = geometry.snap(bounds, { x: 57, y: 186 }, view, []);
    assert.equal(result.delta.x, 60); assert.equal(result.delta.y, 190);
    assert.equal(result.guides.x.value, 960); assert.equal(result.guides.y.value, 540);
    result = geometry.snap(bounds, { x: -797, y: -296 }, view, []);
    assert.equal(result.delta.x, -800); assert.equal(result.delta.y, -300);
    const neighbor = { x: 1120, y: 630, width: 200, height: 100 };
    result = geometry.snap(bounds, { x: 116, y: 229 }, view, [neighbor]);
    assert.equal(result.delta.x, 120, "moving right edge meets neighboring left edge");
    assert.equal(result.delta.y, 230, "moving bottom edge meets neighboring top edge");
    result = geometry.snap(bounds, { x: 320, y: 326 }, null, [neighbor]);
    assert.equal(result.guides.x.index, 0, "deterministic edge tie");
    assert.equal(result.delta.y, 330);
    const restricted = geometry.snap(bounds, { x: 57, y: 186 }, view, [], ["x"]);
    assert.equal(restricted.delta.y, 186); assert.equal(restricted.guides.y, undefined);
});

test("percentage offsets use measured physical dimensions without applying UI density twice", () => {
    const env = setup();
    const G = env.global.QOL.ui.customizeGeometry;
    const element = env.global.QOL.presentation.elements.find(item => item.id === "cooldowns");
    const parent = rect(env.doc.create("Panel"), 3840, 2160);
    parent.actualuiscale_x = 2; parent.actualuiscale_y = 2;
    const target = parent.addChild(env.doc.create("Panel"));
    const values = { PASSIVE_COOLDOWN_X: 0, PASSIVE_COOLDOWN_Y: 0 };
    const patch = G.dragValues(element, target, values, { x: 384, y: -216 });
    assert.equal(patch.PASSIVE_COOLDOWN_X, 10); assert.equal(patch.PASSIVE_COOLDOWN_Y, 10);
    const host = rect(env.doc.create("Panel"), 1920, 1080);
    const anchor = G.anchorValues(element, target, { x: 100, y: 100, width: 100, height: 100 },
        { x: 484, y: -116, width: 100, height: 100 }, patch, host, { x: 1, y: 1 });
    assert.equal(anchor.PASSIVE_COOLDOWN_X, 0); assert.equal(anchor.PASSIVE_COOLDOWN_Y, 0);
    rect(parent, 0, 0);
    assert.equal(Object.keys(G.dragValues(element, target, values, { x: 384, y: -216 })).length, 0);
});

test("guides require acknowledged native alignment, magnets toggle changes movement, and Undo records one gesture", () => {
    const env = setup();
    const { global: g, panel, clock } = env;
    g.QOL.ui.customize.start(null, { elementId: "souls" });
    rect(env.find("QOLCustomizeEditor"), 1920, 1080);
    const frame = env.find("QOLCustomizeFrame_souls");
    const proxy = startDrag(env, frame);
    proxy.actualxoffset += 677; // Measured center 280 approaches screen center 960.
    clock.advance(350);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 680);
    assert.equal(env.find("QOLCustomizeGuideX").visible, false, "no guide over stale, unaligned native geometry");
    panel.actualxoffset = 880; clock.advance(50);
    assert.equal(env.find("QOLCustomizeGuideX").visible, true);
    assert.equal(env.find("QOLCustomizeGuideX").style.x, "960px");
    click(env, "QOLCustomizeToggleSnap"); clock.advance(350);
    assert.equal(env.find("QOLCustomizeGuideX").visible, false);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 677);
    g.$.DispatchEvent("DragEnd", frame, proxy); clock.advance(300);
    click(env, "QOLCustomizeUndo"); clock.advance(350);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
    assert.equal(env.find("QOLCustomizeUndo").enabled, false);
    clean(env);
});

test("six alignment actions edit real offsets and preserve the other axis", () => {
    for (const [action, axis, expected] of [["left", "X", -200], ["center", "X", 680], ["right", "X", 1560],
        ["top", "Y", 100], ["middle", "Y", -410], ["bottom", "Y", -920]]) {
        const env = setup();
        env.global.QOL.ui.customize.start(null, { elementId: "souls" });
        rect(env.find("QOLCustomizeEditor"), 1920, 1080);
        click(env, "QOLCustomizeAlign_" + action); env.clock.advance(700);
        const store = env.hud.sandbox.global.QOL.core.ConfigStore;
        assert.equal(store.get("ql_souls", "SOULS_" + axis + "_OFFSET"), expected, action);
        assert.equal(store.get("ql_souls", "SOULS_" + (axis === "X" ? "Y" : "X") + "_OFFSET"), 0);
        click(env, "QOLCustomizeUndo"); env.clock.advance(700);
        assert.equal(store.get("ql_souls", "SOULS_" + axis + "_OFFSET"), 0);
        clean(env);
    }
});

test("alignment waits for prior typed layout rather than adding a stale delta", () => {
    const env = setup();
    env.global.QOL.ui.customize.start(null, { elementId: "souls" });
    rect(env.find("QOLCustomizeEditor"), 1920, 1080);
    const input = env.find("QOLCustomize_SOULS_X_OFFSET");
    input.text = "300"; // Commit through the alignment action itself.
    click(env, "QOLCustomizeAlign_center");
    env.clock.advance(600);
    assert.equal(env.hud.sandbox.global.QOL.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 300, "ACK must not align from the old native position");
    env.panel.actualxoffset = 500; env.clock.advance(400);
    assert.equal(env.hud.sandbox.global.QOL.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 680);
    clean(env);
});

test("small AP exposes a padded move target, separate measured outline and four usable corners", () => {
    const env = setup("abilityPoints", 20, 14, 1900, 1066);
    env.global.QOL.ui.customize.start(null, { elementId: "abilityPoints" });
    rect(env.find("QOLCustomizeEditor"), 1920, 1080); env.clock.advance(300);
    const frame = env.find("QOLCustomizeFrame_abilityPoints");
    assert.equal(frame.style.width, "64px"); assert.equal(frame.style.height, "56px");
    assert.equal(frame.style.x, "1856px"); assert.equal(frame.style.y, "1024px");
    const outline = frame.Children().find(child => child.BHasClass("QOLCustomizeOutline"));
    assert.equal(outline.style.width, "20px"); assert.equal(outline.style.height, "14px");
    for (const name of ["", "TopLeft", "TopRight", "BottomLeft"]) assert.equal(env.find("QOLCustomizeResize_abilityPoints" + name).visible, true);
    const proxy = startDrag(env, frame); proxy.actualxoffset -= 100;
    env.global.$.DispatchEvent("DragEnd", frame, proxy); env.clock.advance(350);
    assert.equal(env.panel.style.x, "-100px");
    clean(env);
});

test("Hide panels changes the actual editor windows; Show frames changes outlines immediately", () => {
    const env = setup();
    env.global.QOL.ui.customize.start();
    const frame = env.find("QOLCustomizeFrame_souls");
    const outline = frame.Children().find(child => child.BHasClass("QOLCustomizeOutline"));
    click(env, "QOLCustomizeSelect_stamina");
    assert.equal(outline.style.border, "1px solid transparent");
    click(env, "QOLCustomizeToggleFrames"); assert.match(outline.style.border, /0\.35/);
    click(env, "QOLCustomizeToggleFrames"); assert.equal(outline.style.border, "1px solid transparent");
    click(env, "QOLCustomizeTogglePanels");
    assert.equal(env.find("QOLCustomizeTools").visible, false);
    assert.equal(env.find("QOLCustomizeCatalog").visible, false);
    assert.equal(env.find("QOLCustomizeView").visible, true);
    click(env, "QOLCustomizeTogglePanels");
    assert.equal(env.find("QOLCustomizeTools").visible, true);
    assert.equal(env.find("QOLCustomizeCatalog").visible, true);
    clean(env);
});

for (const [id, handle] of [["QOLCustomizeCatalog", "QOLCustomizeDragCatalog"], ["QOLCustomizeTools", "QOLCustomizeDragTools"],
    ["QOLCustomizeView", "QOLCustomizeDragView"]]) {
    test(`${id}: draggable header keeps controls and native windows in place, clamps to viewport and cleans its proxy`, () => {
        const env = setup();
        const baseline = JSON.stringify(env.global.MOD_CONFIG);
        env.global.QOL.ui.customize.start();
        const overlay = rect(env.find("QOLCustomizeEditor"), 1920, 1080);
        overlay.actualuiscale_x = 2; overlay.actualuiscale_y = 2;
        const panel = rect(env.find(id), 500, 400, 100, 60);
        const proxy = startDrag(env, env.find(handle));
        proxy.actualxoffset += 200; proxy.actualyoffset += 100;
        env.clock.advance(50);
        assert.equal(panel.style.x, "150px"); assert.equal(panel.style.y, "80px");
        proxy.actualxoffset += 10000; proxy.actualyoffset += 10000;
        env.global.$.DispatchEvent("DragEnd", env.find(handle), proxy); env.clock.advance(1);
        assert.equal(panel.style.x, "710px"); assert.equal(panel.style.y, "340px");
        assert.equal(panel.GetParent(), overlay);
        assert.equal(proxy.IsValid(), false);
        assert.equal(JSON.stringify(env.global.MOD_CONFIG), baseline);
        const second = startDrag(env, env.find(handle));
        clean(env);
        assert.equal(second.IsValid(), false);
        assert.equal(JSON.stringify(env.global.MOD_CONFIG), baseline);
    });
}

test("late native resize layout stays in the gesture and pins the opposite corner exactly", () => {
    const env = setup("souls");
    const { global: g, clock, panel } = env;
    g.QOL.ui.customize.start(null, { elementId: "souls" });
    const handle = env.find("QOLCustomizeResize_soulsTopLeft");
    const proxy = startDrag(env, handle); proxy.actualxoffset -= 32; proxy.actualyoffset -= 12;
    g.$.DispatchEvent("DragEnd", handle, proxy);
    clock.advance(600);
    assert.equal(env.find("QOLCustomizeUndo").enabled, false, "ACK alone is not scaled layout");
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    const layout = () => {
        const ratio = store.get("ql_presentation_scale", "SOULS_SCALE") / 100;
        panel.actuallayoutwidth = 160 * ratio; panel.actuallayoutheight = 60 * ratio;
        panel.actualxoffset = 200 + store.get("ql_souls", "SOULS_X_OFFSET");
        panel.actualyoffset = 100 - store.get("ql_souls", "SOULS_Y_OFFSET");
    };
    for (let i = 0; i < 25; i++) { layout(); clock.advance(50); }
    assert.equal(panel.actualxoffset + panel.actuallayoutwidth, 360);
    assert.equal(panel.actualyoffset + panel.actuallayoutheight, 160);
    assert.equal(env.find("QOLCustomizeUndo").enabled, true);
    assert.equal(proxy.IsValid(), false);
    click(env, "QOLCustomizeUndo"); clock.advance(500);
    assert.equal(store.get("ql_presentation_scale", "SOULS_SCALE"), 100);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
    assert.equal(store.get("ql_souls", "SOULS_Y_OFFSET"), 0);
    assert.equal(env.find("QOLCustomizeUndo").enabled, false);
    clean(env);
});

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
