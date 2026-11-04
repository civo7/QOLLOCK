"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseStyle } = require("../scripts/trace_style_sources");
const load = require("./load_settings_environment");

function setup(id, language = 0) {
    const env = load(), g = env.global;
    g.MOD_CONFIG.LANGUAGE = language;
    g.QOL.ui.window.setOpen(true); env.clock.advance(500);
    assert.equal(g.QOL.ui.customize.start(null, { elementId: id }), true);
    return { ...env, find: id => env.em.FindChildTraverse(id) };
}
function choose(env, key, value) {
    const control = env.find("QOLCustomize_" + key);
    assert.ok(control, key);
    assert.equal(control.paneltype, "DropDown", key);
    control.SetSelected("QOLCustomize_" + key + "_" + value);
    control._fire("oninputsubmit");
    return control;
}
function finish(env) {
    env.find("QOLCustomizeCancel")._fire("onactivate"); env.clock.advance(1200);
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
}

test("healthbar mode and dependent numbers preview, undo and cancel through the scoped editor", () => {
    const env = setup("healthbar"), g = env.global;
    const baseline = g.MOD_CONFIG.HEALTHBAR_TYPE;
    const numbers = env.find("QOLCustomize_ENABLE_MINECRAFT_HEALTH_NUMBERS");
    assert.ok(numbers);
    assert.equal(numbers.GetParent().visible, false);
    const control = choose(env, "HEALTHBAR_TYPE", 5);
    assert.equal(numbers.GetParent().visible, true);
    assert.equal(control.GetSelected().text, "Minecraft");
    assert.equal(g.MOD_CONFIG.HEALTHBAR_TYPE, baseline, "mode remains a draft");
    numbers._fire("onactivate");
    env.find("QOLCustomizeUndo")._fire("onactivate");
    env.find("QOLCustomizeUndo")._fire("onactivate");
    assert.equal(numbers.GetParent().visible, false);
    assert.equal(control.GetSelected().id, "QOLCustomize_HEALTHBAR_TYPE_" + baseline);
    env.find("QOLCustomizeRedo")._fire("onactivate");
    assert.equal(numbers.GetParent().visible, true);
    finish(env);
    assert.equal(g.MOD_CONFIG.HEALTHBAR_TYPE, baseline);
});

test("dropdown accepts pending exact values and rejects malformed peers without losing selection", () => {
    const env = setup("healthbar");
    const scale = env.find("QOLCustomize_PLAYER_HEALTHBAR_SCALE");
    scale.text = "125";
    choose(env, "HEALTHBAR_TYPE", 5);
    assert.equal(scale.text, "125");
    env.find("QOLCustomizeUndo")._fire("onactivate");
    assert.equal(scale.text, "100", "one undo restores the mode and pending peer together");
    scale.text = "-";
    const control = choose(env, "HEALTHBAR_TYPE", 5);
    assert.equal(control.GetSelected().id, "QOLCustomize_HEALTHBAR_TYPE_0");
    assert.equal(scale.BHasClass("Invalid"), true);
    finish(env);
});

test("each feature exposes its ordinary mode and content controls inside its own scope", () => {
    const required = {
        healthbar: ["HEALTHBAR_TYPE", "ENABLE_MINECRAFT_HEALTH_NUMBERS", "ENABLE_COMBAT_INDICATOR", "ENABLE_COLOR_WARNING_25"],
        topBar: ["ENABLE_OBJ_MAP", "ENABLE_NICKNAMES", "SHOW_RANK", "SHOW_RANK_TOPBAR", "ENABLE_TOPBAR_ENEMY_HP_WARNING_25", "ENABLE_URN_TIMER"],
        bottomBar: ["ENABLE_SIMPLIFY_ABILITY_ICONS", "ENABLE_BETTER_DISABLED_ABILITIES", "ENABLE_HIDE_FAILED_HINT"],
        items: ["ENABLE_SIMPLIFY_ITEMS"], chat: ["ENABLE_IMAGES_IN_CHAT"],
        activeStats: ["CROSSHAIR_STATS_SHOW_FIRERATE", "CROSSHAIR_STATS_SHOW_DEBUFFS"],
        compass: ["ENABLE_SIMPLIFY_COMPASS"], keyboard: ["KEYBOARD_OVERLAY_THEME", "KEYBOARD_OVERLAY_LAYOUT", "ENABLE_FULL_KEYBOARD_LAYOUT"],
        cooldowns: ["ENABLE_OLD_ITEM_COOLDOWNS", "ITEM_FILTER_DEF_PASSIVE"],
        reload: ["ENABLE_HIDE_RELOAD_ICON", "ENABLE_HIDE_RELOAD_CIRCLE"],
        unsecuredSouls: ["ENABLE_BETTER_UNSECURED_SHOW_ICON", "ENABLE_BETTER_UNSECURED_SHOW_TEXT"],
        shop: ["ENABLE_HERO_SCENE_PANEL", "ENABLE_SIMPLIFY_SHOP", "ENABLE_SHOP_STATS", "ENABLE_SIMPLIFY_SHOP_STATS"],
        quickbuy: ["DISABLE_QUICK_BUY", "ENABLE_ENHANCED_QUICKBUY", "ENHANCED_QUICKBUY_COUNT", "ENABLE_QUICKBUY_CLICK_TO_NOTIFY"],
        purchaseNotifications: ["ENABLE_HERO_PURCHASE_POPUPS", "RECENT_PURCHASES_QUICK_MAX", "RECENT_PURCHASES_QUICK_DISPLAY_SEC", "RECENT_PURCHASES_QUICK_REJUV"],
        minimap: ["MINIMAP_FLIP", "MINIMAP_ROTATE_WITH_PLAYER", "ENABLE_MINIMAP_ELEVATION_MARKERS", "ENABLE_MINIMAP_BUFF_TIMER", "ENABLE_MINIMAP_REJUV_TIMER"],
        mapLoot: ["ENABLE_MINIMAP_CRATE_OVERLAY", "ENABLE_MINIMAP_TOUGH_CRATES", "ENABLE_MINIMAP_REM_TUNNELS"],
        minimapAlt: ["ENABLE_ALT_ZOOM_REM_TUNNELS"], minimapTab: ["ENABLE_TAB_ZOOM_REM_TUNNELS"]
    };
    const env = load(), g = env.global;
    g.QOL.ui.window.setOpen(true); env.clock.advance(500);
    for (const [id, keys] of Object.entries(required)) {
        assert.equal(g.QOL.ui.customize.start(null, { elementId: id }), true, id);
        for (const key of keys) assert.ok(env.em.FindChildTraverse("QOLCustomize_" + key), id + "/" + key);
        env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate"); env.clock.advance(50);
    }
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("all inspectors group geometry, appearance and visibility consistently without empty groups", () => {
    const env = setup("items");
    for (const [key, group] of [["ITEMS_SCALE", "Position"], ["ITEMS_X_OFFSET", "Position"],
        ["ITEMS_WASH_COLOR", "Appearance"], ["ITEMS_OPACITY", "Appearance"], ["ITEMS_HIDE_NORMAL", "Visibility"]]) {
        const control = env.find("QOLCustomize_" + key);
        assert.ok(control, key);
        let ancestor = control.GetParent();
        while (ancestor && ancestor.id !== "QOLCustomize" + group + "Body") ancestor = ancestor.GetParent();
        assert.ok(ancestor, key + " belongs to " + group);
    }
    assert.equal(env.find("QOLCustomizeContentSection").visible, true);
    finish(env);
});

test("scoped mode changes save through the existing config path while Reset preserves content choices", () => {
    const env = setup("healthbar"), g = env.global;
    choose(env, "HEALTHBAR_TYPE", 5);
    env.find("QOLCustomize_ENABLE_MINECRAFT_HEALTH_NUMBERS")._fire("onactivate");
    const scale = env.find("QOLCustomize_PLAYER_HEALTHBAR_SCALE");
    scale.text = "150"; scale._fire("oninputsubmit");
    env.find("QOLCustomizeReset")._fire("onactivate");
    assert.equal(scale.text, "100");
    assert.equal(env.find("QOLCustomize_HEALTHBAR_TYPE").GetSelected().text, "Minecraft");
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    env.find("QOLCustomizeApply")._fire("onactivate"); env.clock.advance(1200);
    assert.equal(g.MOD_CONFIG.HEALTHBAR_TYPE, 5);
    assert.equal(g.MOD_CONFIG.PLAYER_HEALTHBAR_SCALE, 100);
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("Customize launcher pairs shortcuts in catalog order and keeps odd groups half-width", () => {
    const env = load(), g = env.global;
    g.QOL.ui.window.setOpen(true); env.clock.advance(500);
    g.QOL.ui.window.setActiveTabAndRefresh("Customize"); env.clock.advance(300);
    const host = env.em.FindChildTraverse("QOLCustomizeLaunch");
    const expected = new Map();
    for (const element of g.QOL.presentation.elements) {
        if (element.inspectorOwner || element.parentId || !element.fields.some(field => !field.hidden)) continue;
        const group = element.group || "HUD";
        if (!expected.has(group)) expected.set(group, []);
        expected.get(group).push("QOLCustomizeLaunch_" + element.id);
    }
    const sections = host.Children().filter(panel => panel.BHasClass("QOLCustomizeSection"));
    assert.equal(sections.length, expected.size);
    let index = 0;
    for (const ids of expected.values()) {
        const rows = sections[index++].Children().find(panel => panel.BHasClass("QOLCustomizeLaunchGrid")).Children();
        assert.equal(rows.length, Math.ceil(ids.length / 2));
        const buttons = rows.flatMap(row => {
            assert.equal(row.GetChildCount(), 2, "each row reserves two equal columns");
            return row.Children().filter(panel => panel.paneltype === "Button");
        });
        assert.deepEqual(buttons.map(panel => panel.id), ids, "visual and focus order follow the catalog");
        if (ids.length % 2) {
            const spacer = rows.at(-1).GetChild(1);
            assert.equal(spacer.paneltype, "Panel");
            assert.equal(spacer.hittest, false);
        }
    }
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("Customize tab shortcuts open feature scopes, including Quick Buy", () => {
    const env = load(), g = env.global;
    g.QOL.ui.window.setOpen(true); env.clock.advance(500);
    for (const id of ["healthbar", "topBar", "quickbuy", "keyboard", "testingTools"]) {
        g.QOL.ui.window.setActiveTabAndRefresh("Customize"); env.clock.advance(300);
        const shortcut = env.em.FindChildTraverse("QOLCustomizeLaunch_" + id);
        assert.ok(shortcut, id);
        shortcut._fire("onactivate");
        assert.equal(g.QOL.ui.customize.isRunning(), true, id);
        assert.ok(env.em.FindChildTraverse("QOLCustomizeSelectionHeader"));
        assert.equal(env.em.FindChildTraverse("QOLCustomize_ITEMS_X_OFFSET"), null, "shortcut retains its own scope");
        env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate"); env.clock.advance(50);
    }
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("dropdown selection lists match ordinary settings in both languages", () => {
    for (const language of [0, 1]) {
        const env = load(), g = env.global;
        g.MOD_CONFIG.LANGUAGE = language;
        g.QOL.ui.window.setOpen(true); env.clock.advance(500);
        for (const [tab, element, key] of [["Healthbar", "healthbar", "HEALTHBAR_TYPE"],
            ["Overlay", "keyboard", "KEYBOARD_OVERLAY_THEME"], ["Overlay", "keyboard", "KEYBOARD_OVERLAY_LAYOUT"],
            ["Crosshair", "ammoCurrent", "AMMO_CURRENT_FONT_STYLE"], ["Crosshair", "ammoMax", "AMMO_TOTAL_FONT_STYLE"]]) {
            g.QOL.ui.window.setActiveTabAndRefresh(tab); env.clock.advance(300);
            const ordinary = env.list.FindChildTraverse(key + "_dropdown");
            assert.ok(ordinary, key);
            const options = ordinary.Children().map(option => option.text);
            g.QOL.ui.customize.start(null, { elementId: element });
            const control = env.em.FindChildTraverse("QOLCustomize_" + key);
            assert.equal(control.paneltype, "DropDown");
            assert.deepEqual(control.Children().map(option => option.text), options, key);
            env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate"); env.clock.advance(50);
        }
        assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
    }
});

test("native dropdown synchronization and disposed callbacks cannot create draft edits", () => {
    const env = load(), g = env.global, Q = g.QOL;
    Q.ui.window.setOpen(true); env.clock.advance(500);
    const element = Q.presentation.elements.find(item => item.id === "healthbar");
    const session = Q.ui.customizeSession.create(env.doc.root, env.hud.root, env.em.FindChildTraverse("SettingsWindow"), element);
    const host = Q.core.panel.create("Panel", env.em, "DropdownLifetimeFixture");
    const inspector = Q.ui.customizeInspector.build(host, element, session, () => inspector.sync());
    const control = host.FindChildTraverse("QOLCustomize_HEALTHBAR_TYPE");
    const select = control.SetSelected.bind(control);
    control.SetSelected = id => { select(id); control._fire("oninputsubmit"); };
    session.edit({ HEALTHBAR_TYPE: 5 }); inspector.sync();
    assert.equal(session.undo(), true);
    inspector.sync();
    assert.equal(session.canUndo(), false, "native synchronization does not create history");
    inspector.dispose();
    control.SetSelected("QOLCustomize_HEALTHBAR_TYPE_5");
    assert.equal(session.value("HEALTHBAR_TYPE"), 0, "living retired control cannot change the draft");
    session.close();
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("keyboard Reset preserves functional layout through Save while resetting its appearance", () => {
    const env = setup("keyboard"), g = env.global;
    choose(env, "KEYBOARD_OVERLAY_LAYOUT", 2);
    choose(env, "KEYBOARD_OVERLAY_THEME", 5);
    const scale = env.find("QOLCustomize_KEYBOARD_OVERLAY_SCALE");
    scale.text = "125"; scale._fire("oninputsubmit");
    env.find("QOLCustomizeReset")._fire("onactivate");
    assert.equal(env.find("QOLCustomize_KEYBOARD_OVERLAY_LAYOUT").GetSelected().id, "QOLCustomize_KEYBOARD_OVERLAY_LAYOUT_2");
    assert.equal(env.find("QOLCustomize_KEYBOARD_OVERLAY_THEME").GetSelected().id, "QOLCustomize_KEYBOARD_OVERLAY_THEME_0");
    assert.equal(scale.text, "100");
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    env.find("QOLCustomizeApply")._fire("onactivate"); env.clock.advance(1200);
    assert.equal(g.MOD_CONFIG.KEYBOARD_OVERLAY_LAYOUT, 2);
    assert.equal(g.MOD_CONFIG.KEYBOARD_OVERLAY_THEME, 0);
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("native Customize popup IDs and options have QOL styles outside overlay ancestry", () => {
    const file = path.resolve(__dirname, "../panorama/styles/ql_settings.css");
    const rules = parseStyle(fs.readFileSync(file, "utf8"), file).rules;
    const declarations = selector => rules.filter(rule => rule.selector.split(",").some(item => item.trim() === selector))
        .flatMap(rule => rule.declarations);
    for (const key of ["HEALTHBAR_TYPE", "KEYBOARD_OVERLAY_THEME", "KEYBOARD_OVERLAY_LAYOUT", "AMMO_CURRENT_FONT_STYLE", "AMMO_TOTAL_FONT_STYLE"]) {
        const selector = "#QOLCustomize_" + key + "DropDownMenu";
        assert.ok(declarations(selector).some(item => item.property === "background-image" && item.value === "none"), key);
        assert.ok(declarations(selector).some(item => item.property === "background-color"), key);
        assert.ok(declarations(selector + ".DropDownMenuVisible").some(item => item.property === "opacity" && Number(item.value) === 1), key);
    }
    for (const state of ["", ":hover", ":active"]) {
        assert.ok(declarations("DropDownMenu .QOLCustomizeDropDownItem" + state).some(item => item.property === "background-color"), state);
    }
});
