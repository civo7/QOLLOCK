"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const drag = require("./customize_drag_fixture");

test("Minimap addons retain ordinary toggles and expose independent timer inspectors", () => {
    const e = load(), Q = e.global.QOL;
    Q.ui.window.setOpen(true); e.clock.advance(500);
    Q.ui.window.setActiveTabAndRefresh("Minimap"); e.clock.advance(300);
    for (const id of ["midBossTimer", "buffTimer"]) {
        assert.ok(e.em.FindChildTraverse("QOLCustomizeEntry_" + id), id);
        assert.ok(Q.presentation.elements.some(element => element.id === id), id);
    }
    for (const id of ["bridgeBuffLeft", "bridgeBuffRight"]) {
        assert.equal(e.em.FindChildTraverse("QOLCustomizeEntry_" + id), null, "On Bridge has no standalone section in ordinary Minimap settings");
        assert.ok(Q.presentation.elements.some(element => element.id === id), id);
    }
    for (const key of ["ENABLE_MINIMAP_BUFF_TIMER", "ENABLE_MINIMAP_REJUV_TIMER", "ENABLE_MINIMAP_ELEVATION_MARKERS"])
        assert.ok(e.list.FindChildrenWithClassTraverse("SettingRow").some(row => row.GetAttributeString("QOL_ROW_RESET_KEYS", "").split(",").includes(key)), key);
    for (const key of ["MINIMAP_CAMP_NAMES", "MINIMAP_ROUTE_FROM_MINUTE", "MINIMAP_ROUTE_UNTIL_MINUTE", "MINIMAP_CRATE_FROM_MINUTE", "MINIMAP_CRATE_UNTIL_MINUTE"])
        assert.equal(e.list.FindChildrenWithClassTraverse("SettingRow_" + key).length, 0, key);
    assert.ok(e.em.FindChildTraverse("QOLCustomizeEntry_minimap"));
    assert.deepEqual(e.doc.eventErrors, []); assert.deepEqual(e.clock.errors, []);
});

function timerFixture() {
    const e = load(), g = e.global;
    g.QOL.ui.window.setOpen(true); e.clock.advance(500);
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    const add = (parent, id, classes = []) => parent.addChild(e.doc.create("Panel", { id, classes }));
    const core = add(e.hud.root, "", ["HudCore"]);
    const gameplay = add(core, "gameplay_hud");
    const host = add(add(gameplay, "", ["clamp_width"]), "minimap_persp");
    const viewport = add(host, "minimap_container");
    add(add(viewport, "HudMinimapContainer"), "hud_minimap");
    Object.assign(g.MOD_CONFIG, { ENABLE_MINIMAP_REJUV_TIMER: 1, ENABLE_MINIMAP_BUFF_TIMER: 1 });
    g.SaveAndSync(); e.clock.advance(1200);
    const find = id => e.em.FindChildTraverse(id) || e.hud.root.FindChildTraverse(id);
    const click = id => { assert.ok(find(id), id); find(id)._fire("onactivate"); };
    const edit = (key, value) => { const input = find("QOLCustomize_" + key); assert.ok(input, key);
        input.text = String(value); input._fire("oninputsubmit"); e.clock.advance(800); };
    return { ...e, g, viewport, find, click, edit };
}

test("timer placement keeps fixed insets and uses independent offsets in every mode", () => {
    const e = timerFixture();
    const rejuv = e.find("QOLMinimapRejuvTimer");
    assert.equal(rejuv.style.horizontalAlign, "right");
    assert.equal(rejuv.style.marginRight, "103px");
    assert.equal(rejuv.style.marginBottom, "58px");
    assert.equal(rejuv.style.width, "100px");
    const buff = e.find("QOLMinimapBuffTimer");
    assert.equal(buff.style.horizontalAlign, "left");
    assert.equal(buff.style.marginLeft, "60px");
    assert.equal(buff.style.marginBottom, "58px");
    assert.equal(buff.style.width, "100px");
    const update = patch => { Object.assign(e.g.MOD_CONFIG, patch); e.g.SaveAndSync(); e.clock.advance(800); };
    update({ ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1 });
    assert.equal(rejuv.style.horizontalAlign, "center");
    assert.equal(rejuv.style.marginRight, "0px");
    assert.equal(rejuv.style.marginBottom, "0px");
    for (const [id, x] of [["Left", "-144px"], ["Right", "144px"]]) {
        const panel = e.find("QOLMinimapBuffBridge" + id + "Timer");
        assert.equal(panel.style.marginLeft, x);
        assert.equal(panel.style.marginTop, "0px");
    }
    update({ MINIMAP_FIXED_ICON_SIZE: 1, MINIMAP_SMALL_SIZE: 800 });
    assert.equal(e.find("QOLMinimapBuffBridgeLeftTimer").style.marginLeft, "-288px");
    assert.equal(e.find("QOLMinimapBuffBridgeLeftTimer").style.marginTop, "0px");
    update({ ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 0, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 0 });
    assert.equal(rejuv.style.horizontalAlign, "right");
    assert.equal(rejuv.style.marginRight, "103px");
    assert.equal(rejuv.style.marginBottom, "58px");
    update({ MINIMAP_MID_BOSS_X_OFFSET: -2000, MINIMAP_MID_BOSS_Y_OFFSET: 1500,
        MINIMAP_BUFF_X_OFFSET: 2000, MINIMAP_BUFF_Y_OFFSET: -1500 });
    assert.equal(rejuv.style.marginRight, "103px", "offsets cannot consume the plate's layout width");
    assert.equal(rejuv.style.marginBottom, "58px", "offsets cannot consume the plate's layout height");
    assert.equal(rejuv.style.x, "-2000px"); assert.equal(rejuv.style.y, "-1500px");
    assert.equal(buff.style.marginLeft, "60px"); assert.equal(buff.style.marginBottom, "58px");
    assert.equal(buff.style.x, "2000px"); assert.equal(buff.style.y, "1500px");
    update({ ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        MINIMAP_BRIDGE_LEFT_X_OFFSET: -2000, MINIMAP_BRIDGE_LEFT_Y_OFFSET: 1500,
        MINIMAP_BRIDGE_RIGHT_X_OFFSET: 2000, MINIMAP_BRIDGE_RIGHT_Y_OFFSET: -1500 });
    assert.equal(rejuv.style.marginRight, "0px"); assert.equal(rejuv.style.marginLeft, "0px");
    assert.equal(rejuv.style.x, "-2000px"); assert.equal(rejuv.style.y, "-1500px");
    for (const [side, x, y, inset] of [["Left", "-2000px", "-1500px", "-288px"], ["Right", "2000px", "1500px", "288px"]]) {
        const panel = e.find("QOLMinimapBuffBridge" + side + "Timer");
        assert.equal(panel.style.x, x); assert.equal(panel.style.y, y);
        assert.equal(panel.style.marginLeft, inset); assert.equal(panel.style.marginTop, "0px");
    }
    assert.deepEqual(e.doc.eventErrors, []); assert.deepEqual(e.clock.errors, []);
});

test("free timer placement releases native clipping classes on reset, disable and viewport replacement", () => {
    const e = timerFixture(), registry = e.hud.sandbox.global.QOL.core.FeatureRegistry;
    const host = e.viewport.GetParent();
    const free = "QOLFreeMinimapTimers";
    const update = patch => { Object.assign(e.g.MOD_CONFIG, patch); e.g.SaveAndSync(); e.clock.advance(800); };
    assert.equal(e.viewport.BHasClass(free), false);
    update({ MINIMAP_MID_BOSS_X_OFFSET: -2000 });
    assert.equal(e.viewport.BHasClass(free), true); assert.equal(host.BHasClass(free), true);
    registry.disable("ql_minimap_timers");
    assert.equal(e.viewport.BHasClass(free), false); assert.equal(host.BHasClass(free), false);
    registry.enable("ql_minimap_timers"); e.clock.advance(800);
    assert.equal(e.viewport.BHasClass(free), true);
    e.viewport.SetParent(e.hud.doc.absRoot);
    const replacement = host.addChild(e.doc.create("Panel", { id: "minimap_container" }));
    e.clock.advance(1500);
    assert.equal(e.viewport.BHasClass(free), false, "a detached but living viewport must release the class");
    assert.equal(replacement.BHasClass(free), true);
    update({ MINIMAP_MID_BOSS_X_OFFSET: 0 });
    assert.equal(replacement.BHasClass(free), false); assert.equal(host.BHasClass(free), false);
    assert.deepEqual(e.doc.eventErrors, []); assert.deepEqual(e.clock.errors, []);
});

test("timer sliders, Reset and history survive lost layout and allow a new drag after recovery", () => {
    for (const [id, prefix, panelId] of [
        ["midBossTimer", "MINIMAP_MID_BOSS_", "QOLMinimapRejuvTimer"],
        ["buffTimer", "MINIMAP_BUFF_", "QOLMinimapBuffTimer"],
        ["bridgeBuffLeft", "MINIMAP_BRIDGE_LEFT_", "QOLMinimapBuffBridgeLeftTimer"],
        ["bridgeBuffRight", "MINIMAP_BRIDGE_RIGHT_", "QOLMinimapBuffBridgeRightTimer"]
    ]) {
        const e = timerFixture(), Q = e.g.QOL;
        if (id.startsWith("bridge")) {
            e.g.MOD_CONFIG.ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE = 1; e.g.SaveAndSync(); e.clock.advance(800);
        }
        const target = e.find(panelId), key = prefix + "X_OFFSET";
        Object.assign(target, { actuallayoutwidth: 100, actuallayoutheight: 35, actualxoffset: 1600, actualyoffset: 800 });
        assert.equal(Q.ui.customize.start(null, { elementId: id }), true);
        Object.assign(e.find("QOLCustomizeEditor"), { actuallayoutwidth: 1920, actuallayoutheight: 1080 });
        e.clock.advance(500);
        const slider = e.find("QOLCustomizeSlider_" + key);
        assert.equal(slider.enabled, true, id);
        slider.value = -500; slider._fire("onvaluechanged"); e.clock.advance(500);
        assert.equal(target.style.x, "-500px");
        // Inject native layout loss; the simulator does not implement clipping
        // or native mouse capture. Input must remain usable independently.
        target.actuallayoutwidth = 0; e.clock.advance(500);
        assert.equal(e.find("QOLCustomizeFrame_" + id).visible, false);
        assert.equal(slider.enabled, true, id + " must retain slider input after layout loss");
        slider.value = -100; slider._fire("onvaluechanged"); e.clock.advance(500);
        assert.equal(target.style.x, "-100px");
        assert.equal(e.find("QOLCustomizeReset").enabled, true);
        e.click("QOLCustomizeReset"); e.clock.advance(500);
        assert.equal(target.style.x, "0px"); assert.equal(slider.value, 0);
        e.click("QOLCustomizeUndo"); e.clock.advance(500);
        assert.equal(target.style.x, "-100px");
        e.click("QOLCustomizeRedo"); e.clock.advance(500);
        assert.equal(target.style.x, "0px");
        target.actuallayoutwidth = 100; e.clock.advance(500);
        const frame = e.find("QOLCustomizeFrame_" + id);
        assert.equal(frame.visible, true);
        e.g.GameUI.GetCursorPosition = () => [1650, 817];
        const proxy = drag.begin(e, frame);
        assert.ok(proxy, id + " permits a fresh drag after Reset");
        e.g.GameUI.GetCursorPosition = () => [1625, 807]; e.clock.advance(50);
        drag.end(e, frame, proxy); e.clock.advance(500);
        assert.equal(target.style.x, "-25px"); assert.equal(target.style.y, "-10px");
        assert.equal(e.find("QOLCustomizeReset").enabled, true);
        e.click("QOLCustomizeCancel"); e.clock.advance(800);
        assert.equal(target.style.x, "0px"); assert.equal(target.style.y, "0px");
        assert.equal(e.g.MOD_CONFIG[key], 0, "recovery and Cancel preserve canonical settings");
        assert.deepEqual(e.doc.eventErrors, []); assert.deepEqual(e.clock.errors, []);
    }
});

test("each timer inspector previews, resets, cancels and saves its own geometry through the codec", () => {
    const e = timerFixture();
    Object.assign(e.g.MOD_CONFIG, { ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1 }); e.g.SaveAndSync(); e.clock.advance(800);
    for (const [id, prefix, panelId] of [
        ["midBossTimer", "MINIMAP_MID_BOSS_", "QOLMinimapRejuvTimer"],
        ["buffTimer", "MINIMAP_BUFF_", "QOLMinimapBuffTimer"],
        ["bridgeBuffLeft", "MINIMAP_BRIDGE_LEFT_", "QOLMinimapBuffBridgeLeftTimer"],
        ["bridgeBuffRight", "MINIMAP_BRIDGE_RIGHT_", "QOLMinimapBuffBridgeRightTimer"]
    ]) {
        assert.equal(e.g.QOL.ui.customize.start(null, { elementId: id }), true, id);
        for (const [suffix, value] of [["X_OFFSET", 20], ["Y_OFFSET", 30], ["SCALE", 150], ["OPACITY", 60]]) e.edit(prefix + suffix, value);
        const panel = e.find(panelId);
        assert.equal(panel.style.uiScale, "150%");
        assert.equal(panel.style.opacity, "0.6");
        assert.equal(panel.style.x, "20px"); assert.equal(panel.style.y, "-30px");
        if (id === "midBossTimer") { assert.equal(panel.style.marginRight, "103px"); assert.equal(panel.style.marginBottom, "58px"); }
        if (id === "buffTimer") { assert.equal(panel.style.marginLeft, "60px"); assert.equal(panel.style.marginBottom, "58px"); }
        if (id === "bridgeBuffLeft") { assert.equal(panel.style.marginLeft, "-144px"); assert.equal(panel.style.marginTop, "0px"); }
        if (id === "bridgeBuffRight") { assert.equal(panel.style.marginLeft, "144px"); assert.equal(panel.style.marginTop, "0px"); }
        assert.equal(e.g.MOD_CONFIG[prefix + "SCALE"], 100, "preview stays transient");
        e.click("QOLCustomizeReset"); e.clock.advance(800);
        assert.equal(panel.style.opacity, "1"); assert.equal(panel.style.uiScale, "100%");
        e.click("QOLCustomizeUndo"); e.clock.advance(800);
        assert.equal(panel.style.opacity, "0.6");
        e.click("QOLCustomizeCancel"); e.clock.advance(800);
        assert.equal(panel.style.opacity, "1");
        e.g.QOL.ui.customize.start(null, { elementId: id });
        e.edit(prefix + "X_OFFSET", -123); e.edit(prefix + "SCALE", 175);
        e.click("QOLCustomizeApply"); e.clock.advance(800);
        const imported = e.g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(e.g.QOL.ui.configTab.getCurrentExportSettingsString());
        assert.equal(imported.ok, true);
        assert.equal(imported.candidateConfig[prefix + "X_OFFSET"], -123);
        assert.equal(imported.candidateConfig[prefix + "SCALE"], 175);
    }
    const registry = e.hud.sandbox.global.QOL.core.FeatureRegistry;
    registry.disable("ql_minimap_timers"); e.clock.advance(20);
    assert.equal(e.find("QOLMinimapTimersRoot"), null);
    registry.enable("ql_minimap_timers"); e.clock.advance(800);
    assert.equal(e.find("QOLMinimapRejuvTimer").style.uiScale, "175%");
    const old = e.find("QOLMinimapTimersRoot"); old.SetParent(e.hud.doc.absRoot); e.clock.advance(800);
    assert.notEqual(e.find("QOLMinimapTimersRoot"), old);
    assert.equal(e.find("QOLMinimapRejuvTimer").style.uiScale, "175%");
    assert.deepEqual(e.doc.eventErrors, []); assert.deepEqual(e.clock.errors, []);
});
