"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const startDrag = require("./customize_drag_fixture");

function fixture(id) {
    const env = load(), g = env.global, Q = g.QOL;
    Q.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    Q.ui.window.setOpen(true); env.clock.advance(500);
    const add = (parent, name, classes = []) => parent.addChild(env.doc.create("Panel", { id: name, classes }));
    const element = Q.presentation.elements.find(item => item.id === id);
    let parent = env.hud.root;
    for (const segment of element.path.slice(0, -1)) {
        let child = typeof segment === "string" ? parent.FindChild(segment) : parent.Children().find(panel => panel.BHasClass(segment.className));
        if (!child) child = add(parent, typeof segment === "string" ? segment : "", typeof segment === "string" ? [] : [segment.className]);
        parent = child;
    }
    const make = () => {
        const owner = add(parent, element.path.at(-1));
        Object.assign(owner, { actuallayoutwidth: 1920, actuallayoutheight: 1080 });
        let targets = [owner], shop = null;
        if (id === "quickbuy") {
            targets = [add(owner, "", ["HudQuickbuyElement", "EmptyContents"]), add(owner, "HudMini", ["HudQuickbuyElement"]),
                ...["QuickbuyNextSoulsNeeded", "QuickbuyUpcomingPreviewContainer", "KeyboardHints"].map(name => add(owner, name))];
            shop = add(owner, "QuickBuyQueueContainer");
            add(owner, "ShopSummary", ["QuickbuyShopSummaryContainer"]);
            targets.forEach((panel, index) => Object.assign(panel, {
                actuallayoutwidth: 70, actuallayoutheight: 100, actualxoffset: 400 + 80 * index, actualyoffset: 900
            }));
            targets[0].style.visibility = "collapse";
        } else {
            Object.assign(owner, { actuallayoutwidth: 180, actuallayoutheight: 24, actualxoffset: 1500, actualyoffset: 950 });
            owner.style.transform = "rotateZ(-30deg)";
        }
        return { owner, targets, shop };
    };
    const find = name => env.em.FindChildTraverse(name);
    const activate = name => { const panel = find(name); assert.ok(panel, name); panel._fire("onactivate"); };
    const edit = (key, value) => { const panel = find("QOLCustomize_" + key); assert.ok(panel, key); panel.text = String(value); panel._fire("oninputsubmit"); };
    return { ...env, g, Q, add, parent, element, make, find, activate, edit };
}

for (const [id, prefix, feature] of [["minimapLocation", "MINIMAP_LOCATION_", "ql_minimap_location"], ["quickbuy", "QUICKBUY_", "ql_presentation_scale"]]) {
    test(`${id}: native drag, reset/history, cancel, save and settings exchange use production paths`, () => {
        const e = fixture(id), { Q, g, clock } = e;
        const { owner, targets, shop } = e.make();
        assert.equal(Q.presentation.canDrag(e.element), true);
        assert.equal(Q.ui.customize.start(null, { elementId: id }), true);
        const frame = e.find("QOLCustomizeFrame_" + id);
        assert.ok(frame);
        if (id === "quickbuy") {
            const bounds = Q.ui.customizeGeometry.frameBox(e.element, owner, owner);
            assert.ok(bounds.width < 1000 && bounds.height < 200, "frame measures compact content rather than full-screen root");
        }
        const proxy = startDrag(e, frame);
        assert.ok(proxy);
        proxy.actualxoffset += 40; proxy.actualyoffset += 15;
        clock.advance(40); startDrag.end(e, frame, proxy); clock.advance(1200);
        const store = e.hud.sandbox.global.QOL.core.ConfigStore;
        assert.equal(store.get(feature, prefix + "X_OFFSET"), 40);
        assert.equal(store.get(feature, prefix + "Y_OFFSET"), -15);
        for (const target of targets) {
            assert.equal(target.style.x, "40px"); assert.equal(target.style.y, "15px");
        }
        if (shop) { assert.equal(shop.style.x, undefined); assert.equal(owner.style.x, undefined); }
        e.edit(prefix + "SCALE", 135); clock.advance(1200);
        for (const target of targets) assert.equal(target.style.uiScale, "135%");
        if (shop) { assert.equal(shop.style.uiScale, undefined); assert.equal(owner.style.uiScale, undefined); }
        e.activate("QOLCustomizeReset"); clock.advance(1200);
        for (const target of targets) { assert.equal(target.style.x, undefined); assert.equal(target.style.uiScale, undefined); }
        e.activate("QOLCustomizeUndo"); clock.advance(1200);
        assert.equal(targets.at(-1).style.x, "40px");
        e.activate("QOLCustomizeCancel"); clock.advance(1200);
        for (const target of targets) assert.equal(target.style.x, undefined);
        if (id === "minimapLocation") assert.equal(owner.style.transform, "rotateZ(-30deg)");
        assert.equal(g.MOD_CONFIG[prefix + "X_OFFSET"], 0);
        Q.ui.customize.start(null, { elementId: id });
        e.edit(prefix + "X_OFFSET", 83); e.edit(prefix + "Y_OFFSET", -42); e.edit(prefix + "SCALE", 125);
        e.activate("QOLCustomizeApply"); clock.advance(1200);
        const result = Q.ui.modal.tryApplyImportStringWithDiagnostics(Q.ui.configTab.getCurrentExportSettingsString());
        assert.equal(result.ok, true);
        assert.equal(result.candidateConfig[prefix + "X_OFFSET"], 83);
        assert.equal(result.candidateConfig[prefix + "Y_OFFSET"], -42);
        assert.equal(result.candidateConfig[prefix + "SCALE"], 125);
        assert.deepEqual(clock.errors, []); assert.deepEqual(e.doc.eventErrors, []);
    });

    test(`${id}: saved offsets reach late and living replaced owners and retire on disable`, () => {
        const e = fixture(id), { g, clock } = e;
        const decoy = e.add(e.hud.root, e.element.path.at(-1));
        g.MOD_CONFIG[prefix + "X_OFFSET"] = 76;
        g.MOD_CONFIG[prefix + "Y_OFFSET"] = 28;
        g.MOD_CONFIG[prefix + "SCALE"] = 125;
        g.SaveAndSync(); clock.advance(1500);
        assert.equal(decoy.style.x, undefined, "missing native owner cannot adopt a same-ID panel elsewhere in the HUD");
        const old = e.make(); clock.advance(2500);
        for (const target of old.targets) { assert.equal(target.style.x, "76px"); assert.equal(target.style.y, "-28px"); }
        old.owner.SetParent(e.add(e.hud.root, "RetiredOwner"));
        const next = e.make(); clock.advance(3000);
        for (const target of old.targets) {
            assert.equal(target.style.x, undefined, "living retired content releases code position"); assert.equal(target.style.uiScale, undefined);
        }
        for (const target of next.targets) { assert.equal(target.style.x, "76px"); assert.equal(target.style.uiScale, "125%"); }
        assert.equal(old.owner.IsValid(), true);
        if (id === "quickbuy") {
            const previous = next.targets[3];
            previous.SetParent(e.add(e.hud.root, "RetiredPreview"));
            const replacement = e.add(next.owner, "QuickbuyUpcomingPreviewContainer"); clock.advance(1200);
            assert.equal(previous.style.x, undefined); assert.equal(replacement.style.x, "76px");
            next.targets.push(replacement);
        }
        const registry = e.hud.sandbox.global.QOL.core.FeatureRegistry;
        registry.disable(feature);
        for (const target of next.targets) { assert.equal(target.style.x, undefined); assert.equal(target.style.uiScale, undefined); }
        registry.enable(feature); clock.advance(1200);
        assert.equal(next.targets.at(-1).style.x, "76px");
        assert.equal(next.targets.at(-1).style.uiScale, "125%");
        assert.deepEqual(clock.errors, []); assert.deepEqual(e.doc.eventErrors, []);
    });
}

test("minimap location visibility is reactive, reachable in Minimap, localized, and preserved by reset", () => {
    const e = fixture("minimapLocation"), { Q, g, clock } = e;
    const { owner } = e.make();
    Q.ui.window.setActiveTabAndRefresh("Minimap"); clock.advance(300);
    assert.ok(e.find("QOLCustomizeEntry_minimapLocation"));
    assert.ok(e.list.FindChildrenWithClassTraverse("SettingRow_ENABLE_MINIMAP_LOCATION").length);
    assert.equal(owner.style.visibility, undefined, "defaults leave native district visibility untouched");
    assert.equal(Q.ui.customize.start(null, { elementId: "minimapLocation" }), true);
    e.activate("QOLCustomize_ENABLE_MINIMAP_LOCATION"); clock.advance(1200);
    assert.equal(owner.style.visibility, "collapse");
    e.edit("MINIMAP_LOCATION_X_OFFSET", 50);
    e.activate("QOLCustomizeReset"); clock.advance(1200);
    assert.equal(owner.style.visibility, "collapse", "reset preserves visibility choice");
    e.activate("QOLCustomizeApply"); clock.advance(1200);
    const result = Q.ui.modal.tryApplyImportStringWithDiagnostics(Q.ui.configTab.getCurrentExportSettingsString());
    assert.equal(result.ok, true); assert.equal(result.candidateConfig.ENABLE_MINIMAP_LOCATION, 0);
    assert.equal(Q.ui.customize.start(null, { elementId: "minimapLocation" }), true);
    e.activate("QOLCustomize_ENABLE_MINIMAP_LOCATION"); clock.advance(1200);
    assert.equal(e.hud.sandbox.global.QOL.core.ConfigStore.get("ql_minimap_location", "ENABLE_MINIMAP_LOCATION"), true);
    assert.equal(owner.style.visibility, undefined, "re-enable releases the override to native CSS");
    e.activate("QOLCustomizeCancel"); clock.advance(1200);
    assert.equal(owner.style.visibility, "collapse");
    g.MOD_CONFIG.LANGUAGE = 1;
    assert.equal(Q.ui.theme.LocalizeSettingsText("Minimap Location Text", true), "Название локации на миникарте");
    g.MOD_CONFIG.LANGUAGE = 0;
    assert.equal(Q.ui.theme.LocalizeSettingsText("Minimap Location Text", true), "Minimap Location Text");
    assert.deepEqual(clock.errors, []); assert.deepEqual(e.doc.eventErrors, []);
});
