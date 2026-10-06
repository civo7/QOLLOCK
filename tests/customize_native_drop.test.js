"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const startDrag = require("./customize_drag_fixture");
const makeOwner = (env, element) => {
    let panel = env.hud.root;
    for (const segment of element.path) {
        let child = typeof segment === "string" ? panel.FindChild(segment) : panel.Children().find(item => item.BHasClass(segment.className));
        if (!child) child = panel.addChild(env.doc.create("Panel", { id: typeof segment === "string" ? segment : "", classes: typeof segment === "string" ? [] : [segment.className] }));
        panel = child;
    }
    if (element.id === "items") panel.AddClass("ModsContainer");
    Object.assign(panel, { actuallayoutwidth: 160, actuallayoutheight: 60 });
    return panel;
};

for (const resize of [false, true]) {
    test(`a released drag visual cannot erase the ${resize ? "resize" : "move"} or its history`, () => {
        const env = load();
        const { global: g, clock, doc, hud } = env;
        const element = g.QOL.presentation.elements.find(item => item.id === "souls");
        let panel = hud.root;
        for (const segment of element.path) {
            panel = panel.addChild(doc.create("Panel", { id: typeof segment === "string" ? segment : "", classes: typeof segment === "string" ? [] : [segment.className] }));
        }
        Object.assign(panel, { actuallayoutwidth: 160, actuallayoutheight: 60 });
        g.QOL.ui.window.setOpen(true); clock.advance(500);
        g.QOL.ui.customize.start(null, { elementId: "souls" });
        const source = env.em.FindChildTraverse("QOLCustomize" + (resize ? "Resize" : "Frame") + "_souls");
        const proxy = startDrag(env, source);
        proxy.actualxoffset += 40; proxy.actualyoffset += 15;
        clock.advance(40); // Sample the final compositor position.
        // Ordering fault: native teardown need not keep the displayPanel alive
        // until the source's DragEnd callback. No rendering is modeled here.
        proxy.DeleteAsync(0); clock.advance(1);
        g.$.DispatchEvent("DragEnd", source, proxy); clock.advance(3000);
        const key = resize ? "SOULS_SCALE" : "SOULS_X_OFFSET";
        const store = hud.sandbox.global.QOL.core.ConfigStore;
        const feature = resize ? "ql_presentation_scale" : "ql_souls";
        const expected = resize ? 125 : 40;
        assert.equal(store.get(feature, key), expected);
        assert.equal(env.em.FindChildTraverse("QOLCustomizeUndo").enabled, true);
        env.em.FindChildTraverse("QOLCustomizeUndo")._fire("onactivate"); clock.advance(600);
        assert.equal(store.get(feature, key), g.QOL_DEFAULT_CONFIG[key]);
        assert.equal(env.em.FindChildTraverse("QOLCustomizeRedo").enabled, true);
        env.em.FindChildTraverse("QOLCustomizeRedo")._fire("onactivate"); clock.advance(600);
        assert.equal(store.get(feature, key), expected);
        env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate"); clock.advance(1200);
        assert.equal(store.get(feature, key), g.QOL_DEFAULT_CONFIG[key]);
        assert.equal(g.MOD_CONFIG[key], g.QOL_DEFAULT_CONFIG[key]);
        assert.equal(panel.style.x, undefined);
        assert.equal(panel.style.uiScale, undefined);
        assert.deepEqual(doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("preview withdrawal fills canonical defaults instead of retaining draft bucket keys", () => {
    const env = load();
    const q = env.hud.sandbox.global.QOL;
    const root = env.hud.root;
    root.AddClass("QOLCustomizeActive");
    const stamp = q.core.persistence.getConfigChangeStamp(q.getUIRoot());
    q.presentation.preview.write(root, { SOULS_X_OFFSET: 125, HUD_SOULS_ENABLED: 0 }, "test", stamp);
    const layer = q.presentation.preview.consume(root, { SOULS_Y_OFFSET: 20 });
    q.core.ConfigAdapter.loadFromFlat(layer.config);
    assert.equal(q.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 125);
    q.presentation.preview.clear(root, "test");
    q.core.ConfigAdapter.loadFromFlat(q.presentation.preview.consume(root, { SOULS_Y_OFFSET: 20 }).config);
    assert.equal(q.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 0);
    assert.equal(q.core.ConfigStore.get("ql_souls", "HUD_SOULS_ENABLED"), true);
    assert.equal(q.core.ConfigStore.get("ql_souls", "SOULS_Y_OFFSET"), 20);
});

for (const [id, key, feature] of [["souls", "HUD_SOULS_ENABLED", "ql_souls"], ["items", "HUD_ITEMS_ENABLED", "ql_items"],
    ["topBar", "HUD_TOP_BAR_ENABLED", "ql_topbar"], ["bottomBar", "HUD_BOTTOM_BAR_ENABLED", "ql_bottom_bar"]]) {
    test(`${id}: Enable controls native visibility, history and reset; Cancel preserves saved placement`, () => {
        const env = load();
        const { global: g, clock, hud } = env;
        const element = g.QOL.presentation.elements.find(item => item.id === id);
        const panel = makeOwner(env, element);
        const offset = element.fields.find(field => field.axis === "x").key;
        g.MOD_CONFIG[offset] = 125; g.SaveAndSync(); clock.advance(1200);
        g.QOL.ui.window.setOpen(true); clock.advance(500);
        const before = JSON.stringify(g.MOD_CONFIG);
        const raw = hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", "");
        g.QOL.ui.customize.start(null, { elementId: id });
        const click = name => { env.em.FindChildTraverse(name)._fire("onactivate"); clock.advance(700); };
        click("QOLCustomize_" + key);
        assert.equal(panel.style.visibility, "collapse", "a native ID visibility rule cannot outbid the owned override");
        click("QOLCustomizeUndo"); assert.equal(panel.style.visibility, undefined);
        click("QOLCustomizeRedo"); assert.equal(panel.style.visibility, "collapse");
        click("QOLCustomizeReset");
        assert.equal(panel.style.visibility, undefined);
        assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get(feature, offset), 0);
        assert.equal(env.em.FindChildTraverse("QOLCustomizeReset").GetParent(), env.em.FindChildTraverse("QOLCustomizeUndo").GetParent(), "reset stays outside the scrolling inspector");
        const pending = env.em.FindChildTraverse("QOLCustomize_" + offset);
        pending.text = "500";
        click("QOLCustomizeCancel");
        pending._fire("onblur"); clock.advance(700); // A late native focus event cannot save a discarded value.
        assert.equal(panel.style.visibility, undefined);
        assert.equal(panel.style.x, "125px");
        assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get(feature, key), true);
        assert.equal(JSON.stringify(g.MOD_CONFIG), before);
        assert.equal(hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), raw);
        assert.deepEqual(env.doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("a toggle preserves other pending input; Undo and Redo operate on one accepted edit", () => {
    const env = load();
    const { global: g, clock } = env;
    makeOwner(env, g.QOL.presentation.elements.find(item => item.id === "souls"));
    g.QOL.ui.window.setOpen(true); clock.advance(500);
    g.QOL.ui.customize.start(null, { elementId: "souls" });
    const input = env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET");
    input.text = "150";
    env.em.FindChildTraverse("QOLCustomize_HUD_SOULS_ENABLED")._fire("onactivate"); clock.advance(600);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 150);
    assert.equal(store.get("ql_souls", "HUD_SOULS_ENABLED"), false);
    env.em.FindChildTraverse("QOLCustomizeUndo")._fire("onactivate"); clock.advance(600);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
    assert.equal(store.get("ql_souls", "HUD_SOULS_ENABLED"), true);
    env.em.FindChildTraverse("QOLCustomizeRedo")._fire("onactivate"); clock.advance(600);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 150);
    input.text = "200"; clock.advance(200);
    env.em.FindChildTraverse("QOLCustomizeUndo")._fire("onactivate"); clock.advance(600);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 150, "Undo accepts the pending entry before undoing it");
    assert.equal(input.text, "150");
    input._fire("onblur"); clock.advance(600);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 150);
    env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate"); clock.advance(700);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
});
