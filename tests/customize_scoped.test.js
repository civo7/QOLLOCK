"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const startDrag = require("./customize_drag_fixture");
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
    return panel;
};
const clean = env => {
    assert.deepEqual(env.doc.eventErrors, []);
    assert.deepEqual(env.clock.errors, []);
};

test("Souls row launches one editable surface; Apply preserves other panels and Cancel restores placement", () => {
    const env = setup();
    const { global: g, hud, clock } = env;
    const add = (parent, id, classes = []) => parent.addChild(env.doc.create("Panel", { id, classes }));
    const core = add(hud.root, "", ["HudCore"]);
    const left = add(add(core, "StatsAndModsContainer"), "LowerLeft");
    const souls = add(left, "gold_and_ap_container");
    const items = add(left, "ModsContainer", ["ModsContainer"]);
    for (const panel of [souls, items]) Object.assign(panel, { actuallayoutwidth: 160, actuallayoutheight: 60 });
    g.MOD_CONFIG.ITEMS_X_OFFSET = 250;
    g.SaveAndSync(); clock.advance(1200);
    g.QOL.ui.window.setActiveTabAndRefresh("HUD"); clock.advance(300);
    const original = JSON.stringify(g.MOD_CONFIG);
    const entry = env.em.FindChildTraverse("QOLCustomizeEntry_souls");
    assert.ok(entry.GetParent().BHasClass("SectionTitleRow"), "entry remains beside the section toggle");
    activate(env, "QOLCustomizeEntry_souls");
    assert.equal(g.QOL.ui.customize.isRunning(), true);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeCatalog").visible, false);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeFrame_items"), null);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeSelect_items"), null);
    assert.equal(env.em.FindChildTraverse("QOLCustomize_ITEMS_X_OFFSET"), null);
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_souls");
    const proxy = startDrag(env, frame);
    proxy.actualxoffset += 175;
    g.$.DispatchEvent("DragEnd", frame, proxy); clock.advance(1200);
    assert.equal(souls.style.x, "175px");
    assert.equal(items.style.x, "250px");
    assert.equal(JSON.stringify(g.MOD_CONFIG), original, "preview does not replace the canonical config");
    activate(env, "QOLCustomizeCancel"); clock.advance(1200);
    assert.equal(souls.style.x, undefined);
    assert.equal(JSON.stringify(g.MOD_CONFIG), original);
    activate(env, "QOLCustomizeEntry_souls");
    const pending = env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET");
    pending.text = "350";
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    activate(env, "QOLCustomizeApply"); clock.advance(1200);
    const expected = JSON.parse(original); expected.SOULS_X_OFFSET = 350;
    assert.deepEqual(JSON.parse(JSON.stringify(g.MOD_CONFIG)), expected);
    assert.equal(g.QOL.ui.customize.isRunning(), false);
    assert.equal(items.style.x, "250px");
    clean(env);
});

test("scoped session rejects other fields atomically and cannot unlock or reset other elements", () => {
    const env = setup();
    const Q = env.global.QOL;
    const souls = Q.presentation.elements.find(element => element.id === "souls");
    const items = Q.presentation.elements.find(element => element.id === "items");
    const session = Q.ui.customizeSession.create(Q.core.persistence.getUIRoot(), env.hud.root,
        env.em.FindChildTraverse("SettingsWindow"), souls);
    assert.equal(session.canEditElement("souls"), true);
    assert.equal(session.canEditElement("items"), false);
    assert.equal(session.isLocked("items"), true);
    session.setLocked("items", false);
    assert.equal(session.isLocked("items"), true);
    assert.equal(session.edit({ SOULS_X_OFFSET: 125, ITEMS_X_OFFSET: 500 }), false);
    assert.deepEqual(Object.keys(session.snapshot()), []);
    assert.equal(session.reset(items), false);
    assert.equal(session.edit({ SOULS_X_OFFSET: 125 }), true);
    assert.equal(session.undo(), true);
    assert.deepEqual(Object.keys(session.snapshot()), []);
    assert.equal(session.redo(), true);
    assert.equal(session.snapshot().SOULS_X_OFFSET, 125);
    session.close();
    clean(env);
});

test("editing Top Bar never transiently resets unrelated HUD classes", () => {
    const env = setup();
    const { global: g, clock, hud } = env;
    g.MOD_CONFIG.ENABLE_HIDE_MAGAZINE = 1;
    g.SaveAndSync(); clock.advance(1200);
    assert.equal(hud.root.BHasClass("hide_magazine_active"), true);
    let resets = 0;
    const setClass = hud.root.SetHasClass;
    hud.root.SetHasClass = function(name, active) {
        if (name === "hide_magazine_active" && !active) resets++;
        return setClass.call(this, name, active);
    };
    assert.equal(g.QOL.ui.customize.start(null, { elementId: "topBar" }), true);
    const input = env.em.FindChildTraverse("QOLCustomize_TOP_BAR_X_OFFSET");
    input.text = "175"; input._fire("oninputsubmit"); clock.advance(1200);
    activate(env, "QOLCustomizeCancel"); clock.advance(1200);
    assert.equal(resets, 0, "whole-HUD classes belong to the app's complete configuration");
    assert.equal(hud.root.BHasClass("hide_magazine_active"), true);
    clean(env);
});

test("all gameplay entry buttons open their declared element and full Customize still permits all elements", () => {
    const env = setup();
    const Q = env.global.QOL;
    const tabs = {
        HUD: ["topBar", "bottomBar", "activeItems", "items", "souls", "unsecuredTimer", "unsecuredSouls", "chat", "damageReport", "playerStats"],
        Shop: ["recentPurchases", "purchaseNotifications", "shop"],
        Crosshair: ["cooldowns", "activeStats", "damageImpact", "stamina", "damageNumbers", "ammo", "reload", "targetShapes"],
        Healthbar: ["healthbar"], Minimap: ["minimap", "minimapAlt", "minimapTab"],
        Overlay: ["keyboard", "zipBoost", "speed", "compass"], UI: ["chat", "damageReport", "playerStats"]
    };
    for (const [tab, ids] of Object.entries(tabs)) {
        Q.ui.window.setActiveTabAndRefresh(tab); env.clock.advance(300);
        for (const id of ids) {
            activate(env, "QOLCustomizeEntry_" + id);
            assert.equal(Q.ui.customize.isRunning(), true, id);
            const frames = env.em.FindChildrenWithClassTraverse("QOLCustomizeFrame");
            assert.equal(frames.length, 1, id);
            assert.equal(frames[0].id, "QOLCustomizeFrame_" + id);
            assert.equal(env.em.FindChildTraverse("QOLCustomizeCatalog").visible, false);
            activate(env, "QOLCustomizeCancel"); env.clock.advance(300);
        }
    }
    Q.ui.window.setActiveTabAndRefresh("Customize"); env.clock.advance(300);
    activate(env, "QOLCustomizeOpen");
    assert.equal(env.em.FindChildTraverse("QOLCustomizeCatalog").visible, true);
    activate(env, "QOLCustomizeSelect_items");
    assert.ok(env.em.FindChildTraverse("QOLCustomize_ITEMS_X_OFFSET"));
    activate(env, "QOLCustomizeCancel");
    clean(env);
});

test("unknown scope leaves settings visible and never starts an unrestricted editor", () => {
    const env = setup();
    const Q = env.global.QOL;
    assert.equal(Q.ui.customize.start(null, { elementId: "missing" }), false);
    assert.equal(Q.ui.customize.isRunning(), false);
    assert.equal(env.em.FindChildTraverse("SettingsWindow").BHasClass("Visible"), true);
    assert.equal(env.em.BHasClass("QOLCustomizeActive"), false);
    assert.equal(Q.ui.customize.createEntryAction(env.list, "missing"), null);
    clean(env);
});

test("scoped entry and instructions use English, Russian and incomplete-locale fallback", () => {
    for (const [language, caption, instructions] of [
        [0, "Customize", "Only this element can be edited. Other HUD elements stay locked."],
        [1, "Настроить HUD", "Можно изменить только этот элемент. Остальные элементы HUD заблокированы."],
        [13, "Customize", "Only this element can be edited. Other HUD elements stay locked."]
    ]) {
        const env = setup();
        env.global.MOD_CONFIG.LANGUAGE = language;
        env.global.QOL.ui.window.setActiveTabAndRefresh("HUD"); env.clock.advance(300);
        const entry = env.em.FindChildTraverse("QOLCustomizeEntry_souls");
        assert.equal(entry.GetChild(0).text, caption);
        activate(env, "QOLCustomizeEntry_souls");
        const labels = env.em.FindChildTraverse("QOLCustomizeTools").FindChildrenWithClassTraverse("ModalInstructions");
        assert.ok(labels.some(label => label.text === instructions));
        activate(env, "QOLCustomizeCancel");
        clean(env);
    }
});

test("ordinary tabs replace geometry sliders with scoped actions and keep functional controls", () => {
    const env = setup();
    const migrated = new Set(env.global.QOL.presentation.elements.flatMap(element => element.fields
        .filter(field => field.axis || field.resize || ["Scale", "Size", "Opacity", "Current Ammo", "Total Ammo", "Hint Size", "Width", "Height", "Tunnel Opacity", "Minimalist Opacity"].includes(field.label))
        .map(field => field.key)));
    for (const tab of ["Crosshair", "HUD", "Healthbar", "Overlay", "Minimap", "Shop", "UI"]) {
        env.global.QOL.ui.window.setActiveTabAndRefresh(tab); env.clock.advance(300);
        for (const key of migrated) assert.equal(env.list.FindChildrenWithClassTraverse("SettingRow_" + key).length, 0, tab + ": " + key);
        assert.ok(env.list.FindChildrenWithClassTraverse("QOLCustomizeEntry").length, tab);
    }
    env.global.QOL.ui.window.setActiveTabAndRefresh("Minimap"); env.clock.advance(300);
    assert.ok(env.list.FindChildrenWithClassTraverse("SettingRow_MINIMAP_FIXED_ICON_SIZE")[0]);
    clean(env);
});

test("search for a moved field launches only its element without restoring old sliders", () => {
    const env = setup();
    const Q = env.global.QOL;
    for (const [query, id, key] of [["PLAYER_HEALTHBAR_X_OFFSET", "healthbar", "PLAYER_HEALTHBAR_X_OFFSET"],
        ["SOULS_SCALE", "souls", "SOULS_SCALE"], ["PASSIVE_COOLDOWN_SIZE", "cooldowns", "PASSIVE_COOLDOWN_SIZE"]]) {
        assert.equal(Q.ui.search.renderSearchResults(env.list, query), true);
        env.clock.advance(300);
        assert.equal(env.list.FindChildrenWithClassTraverse("SettingRow_" + key).length, 0);
        activate(env, "QOLCustomizeEntry_" + id);
        assert.ok(env.em.FindChildTraverse("QOLCustomize_" + key));
        assert.equal(env.em.FindChildrenWithClassTraverse("QOLCustomizeFrame").length, 1);
        activate(env, "QOLCustomizeCancel"); env.clock.advance(300);
    }
    clean(env);
});

test("section resets include moved values, nested active items and newly added scales", () => {
    const env = setup();
    const g = env.global;
    Object.assign(g.MOD_CONFIG, { BOTTOM_BAR_SCALE: 1.3, ACTIVE_ITEMS_SCALE: 150, SOULS_SCALE: 151, SOULS_X_OFFSET: 125, PLAYER_HEALTHBAR_SCALE: 180 });
    for (const [tab, id, keys] of [["HUD", "bottomBar", ["BOTTOM_BAR_SCALE", "ACTIVE_ITEMS_SCALE"]],
        ["HUD", "souls", ["SOULS_SCALE", "SOULS_X_OFFSET"]], ["Healthbar", "healthbar", ["PLAYER_HEALTHBAR_SCALE"]]]) {
        g.QOL.ui.window.setActiveTabAndRefresh(tab); env.clock.advance(300);
        const entry = env.em.FindChildTraverse("QOLCustomizeEntry_" + id);
        const reset = entry.GetParent().FindChildrenWithClassTraverse("SectionResetBtn")[0];
        assert.ok(reset); assert.equal(reset.enabled, true);
        reset._fire("onactivate"); env.clock.advance(500);
        for (const key of keys) assert.equal(g.MOD_CONFIG[key], g.QOL_DEFAULT_CONFIG[key], key);
        if (id === "bottomBar") assert.equal(g.MOD_CONFIG.SOULS_SCALE, 151, "unrelated section is preserved");
    }
    clean(env);
});
