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

for (const entry of ["section", "shortcut", "catalog"]) test(`Shop ${entry} opens and retires its native command exactly once`, () => {
    const env = setup(), Q = env.global.QOL, commands = [];
    const dispatch = env.global.$.DispatchEvent;
    // Native command execution is modeled; real ESC/shop coexistence needs a client check.
    env.global.$.DispatchEvent = (name, ...args) => {
        if (name === "CitadelConCommand") {
            commands.push(args[0]);
            env.hud.root.SetHasClass("gShopOpen", !env.hud.root.BHasClass("gShopOpen"));
        }
        return dispatch(name, ...args);
    };
    if (entry === "section") {
        Q.ui.window.setActiveTabAndRefresh("Shop"); env.clock.advance(300);
        activate(env, "QOLCustomizeEntry_shop");
    } else {
        Q.ui.window.setActiveTabAndRefresh("Customize"); env.clock.advance(300);
        activate(env, entry === "shortcut" ? "QOLCustomizeLaunch_shop" : "QOLCustomizeOpen");
        if (entry === "catalog") activate(env, "QOLCustomizeSelect_shop");
    }
    assert.deepEqual(commands, ["citadel_open_hero_sheet"]);
    if (entry === "catalog") {
        activate(env, "QOLCustomizeSelect_shop"); env.clock.advance(600);
        assert.equal(commands.length, 1, "reselection and polls cannot toggle the shop shut");
        activate(env, "QOLCustomizeSelect_souls");
        assert.deepEqual(commands, ["citadel_open_hero_sheet", "citadel_open_hero_sheet"]);
    }
    activate(env, "QOLCustomizeCancel"); env.clock.advance(300);
    assert.deepEqual(commands, ["citadel_open_hero_sheet", "citadel_open_hero_sheet"]);
    assert.equal(env.hud.root.BHasClass("gShopOpen"), false);
    clean(env);
});

test("Shop selection preserves an already-open native shop", () => {
    const env = setup(), Q = env.global.QOL, commands = [];
    env.hud.root.AddClass("gShopOpen");
    const dispatch = env.global.$.DispatchEvent;
    env.global.$.DispatchEvent = (name, ...args) => {
        if (name === "CitadelConCommand") commands.push(args[0]);
        return dispatch(name, ...args);
    };
    Q.ui.customize.start(null, { elementId: "shop" });
    activate(env, "QOLCustomizeCancel");
    assert.deepEqual(commands, []);
    assert.equal(env.hud.root.BHasClass("gShopOpen"), true);
    clean(env);
});

for (const exit of ["queued", "nativeClose", "save", "menuClose", "windowClose", "hudReplacement"])
test(`Shop command ownership survives ${exit}`, () => {
    const env = setup(), Q = env.global.QOL, commands = [];
    const dispatch = env.global.$.DispatchEvent;
    env.global.$.DispatchEvent = (name, ...args) => {
        if (name === "CitadelConCommand") {
            commands.push(args[0]);
            if (exit !== "queued") env.hud.root.SetHasClass("gShopOpen", !env.hud.root.BHasClass("gShopOpen"));
        }
        return dispatch(name, ...args);
    };
    Q.ui.customize.start(null, { elementId: "shop" });
    assert.deepEqual(commands, ["citadel_open_hero_sheet"]);
    if (exit === "nativeClose") env.hud.root.RemoveClass("gShopOpen");
    if (exit === "save") {
        Q.core.storageBridge.saveSettings = (_config, callback) => callback(null);
        activate(env, "QOLCustomizeApply");
    } else if (exit === "menuClose") Q.ui.customize.onMenuClosed();
    else if (exit === "windowClose") {
        env.em.FindChildTraverse("SettingsWindow").RemoveClass("Visible"); env.clock.advance(300);
    } else if (exit === "hudReplacement") {
        env.hud.root.id = "RetiredHud";
        env.doc.root.addChild(env.doc.create("CitadelHud", { id: "Hud" }));
        env.clock.advance(300);
    } else activate(env, "QOLCustomizeCancel");
    assert.equal(Q.ui.customize.isRunning(), false);
    assert.deepEqual(commands, exit === "nativeClose" || exit === "hudReplacement"
        ? ["citadel_open_hero_sheet"] : ["citadel_open_hero_sheet", "citadel_open_hero_sheet"]);
    clean(env);
});

test("Properties expose content controls while independent digit geometry stays in its own selection", () => {
    const env = setup(), Q = env.global.QOL;
    for (const [id, present] of [
        ["shop", ["ENABLE_SIMPLIFY_SHOP", "ENABLE_SIMPLIFY_ITEMS", "ENABLE_HERO_SCENE_PANEL", "ENABLE_SHOP_STATS"]],
        ["purchaseNotifications", ["ENABLE_HERO_PURCHASE_POPUPS", "RECENT_PURCHASES_QUICK_MAX", "RECENT_PURCHASES_QUICK_DISPLAY_SEC"]],
        ["chat", ["ENABLE_IMAGES_IN_CHAT"]]
    ]) {
        assert.equal(Q.ui.customize.start(null, { elementId: id }), true);
        for (const key of present) assert.ok(env.em.FindChildTraverse("QOLCustomize_" + key), key);
        activate(env, "QOLCustomizeCancel"); env.clock.advance(100);
    }
    assert.equal(Q.ui.customize.start(null, { elementId: "ammo" }), true);
    for (const key of ["AMMO_CURRENT_SCALE", "AMMO_TOTAL_SCALE", "AMMO_CURRENT_X_OFFSET", "AMMO_MAX_X_OFFSET"])
        assert.equal(env.em.FindChildTraverse("QOLCustomize_" + key), null, key);
    activate(env, "QOLCustomizeCancel"); env.clock.advance(100);
    Q.ui.window.setActiveTabAndRefresh("Shop"); env.clock.advance(300);
    assert.ok(env.list.FindChildrenWithClassTraverse("SettingRow_ENHANCED_QUICKBUY_COUNT")[0]);
    clean(env);
});

for (const minimal of [0, 1]) test(`base minimap omits inactive background opacity (minimal mode ${minimal})`, () => {
    const env = setup(), Q = env.global.QOL;
    const add = (parent, id, classes = []) => parent.addChild(env.doc.create("Panel", { id, classes }));
    const core = add(env.hud.root, "", ["HudCore"]);
    const gameplay = add(core, "gameplay_hud"), clamp = add(gameplay, "", ["clamp_width"]);
    const host = add(clamp, "minimap_persp"), viewport = add(host, "minimap_container");
    const renderer = add(add(viewport, "HudMinimapContainer"), "hud_minimap", ["dl_midtown"]);
    const background = add(renderer, "MinimapBackgroundTest");
    const image = add(background, "", ["backgroundImage1"]), canvas = add(background, "canvas");
    env.global.MOD_CONFIG.MINIMAL_MINIMAP = minimal; env.global.SaveAndSync(); env.clock.advance(600);
    Q.ui.customize.start(null, { elementId: "minimap" });
    assert.ok(env.em.FindChildTraverse("QOLCustomize_MINIMAP_BASE_OPACITY"));
    const opacity = env.em.FindChildTraverse("QOLCustomize_MINIMAL_MINIMAP_OPACITY");
    const row = opacity.GetParent().GetParent();
    assert.equal(row.visible, !!minimal);
    activate(env, "QOLCustomize_MINIMAL_MINIMAP");
    assert.equal(row.visible, !minimal, "mode and dependent opacity react in the same inspector");
    activate(env, "QOLCustomizeUndo");
    assert.equal(row.visible, !!minimal);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeAlign_top"), null);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeAlign_bottom"), null);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeAlign_middle"), null);
    if (!minimal) activate(env, "QOLCustomize_MINIMAL_MINIMAP");
    opacity.text = "35"; opacity._fire("oninputsubmit"); env.clock.advance(700);
    assert.equal(image.style.opacity, "0.35", "the draft crosses settings/HUD contexts to the actual background owner");
    assert.equal(canvas.style.opacity, undefined);
    assert.equal(env.global.MOD_CONFIG.MINIMAL_MINIMAP, minimal, "preview preserves canonical settings");
    activate(env, "QOLCustomizeCancel"); env.clock.advance(700);
    assert.equal(image.style.opacity, minimal ? String(env.global.MOD_CONFIG.MINIMAL_MINIMAP_OPACITY) : undefined);
    clean(env);
});

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
    startDrag.end(env, frame, proxy); clock.advance(1200);
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

test("Player Stats stays editable through Customize without duplicate ordinary controls or legacy Side", () => {
    const env = setup();
    const { global: g, clock } = env;
    g.MOD_CONFIG.STATS_POSITION_SIDE = 1;
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    for (const tab of ["HUD", "UI"]) {
        g.QOL.ui.window.setActiveTabAndRefresh(tab); clock.advance(300);
        assert.equal(env.list.FindChildrenWithClassTraverse("SettingRow_STATS_POSITION_SIDE").length, 0, tab);
        for (const key of ["STATS_POSITION_HIDE_NORMAL", "STATS_POSITION_HIDE_SCOREBOARD"])
            assert.equal(env.list.FindChildrenWithClassTraverse("SettingRow_" + key).length, 0, key);
        assert.equal(env.em.FindChildTraverse("QOLCustomizeEntry_playerStats"), null);
        assert.equal(g.QOL.ui.customize.start(null, { elementId: "playerStats" }), true);
        assert.equal(env.em.FindChildTraverse("QOLCustomize_STATS_POSITION_SIDE"), null);
        assert.equal(env.em.FindChildTraverse("QOLCustomize_ENABLE_STATS_POSITION"), null);
        assert.equal(env.em.FindChildTraverse("QOLCustomizePositionBody").visible, true);
        const input = env.em.FindChildTraverse("QOLCustomize_STATS_POSITION_X_OFFSET");
        input.text = "125"; input._fire("oninputsubmit");
        activate(env, "QOLCustomizeReset");
        activate(env, "QOLCustomizeApply"); clock.advance(700);
        assert.equal(g.MOD_CONFIG.STATS_POSITION_SIDE, 1, "obsolete persisted field remains untouched");
        assert.equal(g.MOD_CONFIG.STATS_POSITION_X_OFFSET, 0);
    }
    const parsed = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.candidateConfig.STATS_POSITION_SIDE, 1, "legacy field still round-trips");
    clean(env);
});

test("Player Stats placement activates a dormant legacy config only on explicit position edits", () => {
    const env = setup(), { global: g, clock } = env;
    const core = env.hud.root.addChild(env.doc.create("Panel", { classes: ["HudCore"] }));
    const owner = core.addChild(env.doc.create("Panel", { id: "hudActivePlayerStats" }));
    const block = owner.addChild(env.doc.create("Panel", { id: "HudStatBlock" }));
    Object.assign(owner, { actuallayoutwidth: 180, actuallayoutheight: 60 });
    Object.assign(block, { actuallayoutwidth: 180, actuallayoutheight: 60 });
    Object.assign(g.MOD_CONFIG, { ENABLE_STATS_POSITION: 0, STATS_POSITION_X_OFFSET: 90, STATS_POSITION_Y_OFFSET: 25 });
    g.SaveAndSync(); clock.advance(1200);
    assert.equal(owner.style.x, undefined, "old disabled coordinates remain dormant after publication");
    g.QOL.ui.customize.start(null, { elementId: "playerStats" }); clock.advance(600);
    assert.equal(owner.style.x, undefined, "selection metadata does not activate dormant configuration");
    const size = env.em.FindChildTraverse("QOLCustomize_STATS_POSITION_SCALE");
    size.text = "150"; size._fire("oninputsubmit"); clock.advance(600);
    assert.equal(block.style.uiScale, "150%");
    assert.equal(owner.style.x, undefined, "size is independent and cannot revive old dormant coordinates");
    activate(env, "QOLCustomizeUndo"); clock.advance(600);
    const x = env.em.FindChildTraverse("QOLCustomize_STATS_POSITION_X_OFFSET");
    x.text = "125"; x._fire("oninputsubmit"); clock.advance(600);
    assert.equal(owner.style.x, "125px", "position edit applies without a manual mode switch");
    assert.equal(g.MOD_CONFIG.ENABLE_STATS_POSITION, 0, "activation remains in the draft until Save");
    activate(env, "QOLCustomizeUndo"); clock.advance(600);
    assert.equal(owner.style.x, undefined, "Undo restores the dormant compatibility gate with coordinates");
    activate(env, "QOLCustomizeRedo"); clock.advance(600);
    assert.equal(owner.style.x, "125px");
    activate(env, "QOLCustomizeReset"); clock.advance(700);
    assert.equal(owner.style.x, undefined, "default coordinates release native position while the derived gate stays enabled");
    assert.equal(owner.style.y, undefined);
    assert.equal(owner.style.position, undefined);
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    activate(env, "QOLCustomizeApply"); clock.advance(700);
    assert.equal(g.MOD_CONFIG.ENABLE_STATS_POSITION, 1);
    assert.equal(g.MOD_CONFIG.STATS_POSITION_X_OFFSET, 0);
    assert.equal(g.MOD_CONFIG.STATS_POSITION_Y_OFFSET, 0);
    clean(env);
});

test("Player Stats Reset with untouched default coordinates preserves a disabled legacy gate", () => {
    const env = setup(), g = env.global;
    g.MOD_CONFIG.ENABLE_STATS_POSITION = 0; g.SaveAndSync(); env.clock.advance(600);
    const element = g.QOL.presentation.elements.find(item => item.id === "playerStats");
    const session = g.QOL.ui.customizeSession.create(env.doc.root, env.hud.root, env.em.FindChildTraverse("SettingsWindow"), element);
    assert.equal(session.reset(element), true);
    assert.equal(session.value("ENABLE_STATS_POSITION"), 0);
    assert.equal(session.canUndo(), false);
    session.close(); clean(env);
});

for (const tab of ["HUD", "UI"]) test(`Player Stats Customize hide controls preserve dormant legacy placement (from ${tab})`, () => {
    const env = setup(), g = env.global;
    g.MOD_CONFIG.ENABLE_STATS_POSITION = 0; g.SaveAndSync(); env.clock.advance(600);
    g.QOL.ui.window.setActiveTabAndRefresh(tab); env.clock.advance(300);
    assert.equal(env.list.FindChildrenWithClassTraverse("SettingRow_ENABLE_STATS_POSITION").length, 0);
    assert.equal(g.QOL.ui.customize.start(null, { elementId: "playerStats" }), true);
    activate(env, "QOLCustomize_STATS_POSITION_HIDE_NORMAL");
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    activate(env, "QOLCustomizeApply"); env.clock.advance(1000);
    assert.equal(g.MOD_CONFIG.STATS_POSITION_HIDE_NORMAL, 1);
    assert.equal(g.MOD_CONFIG.ENABLE_STATS_POSITION, 0);
    clean(env);
});

test("session selection publishes only scoped sample metadata without edit history or config changes", () => {
    const env = setup(), Q = env.global.QOL;
    const element = Q.presentation.elements.find(item => item.id === "souls");
    const writes = [], original = Q.presentation.preview.write;
    Q.presentation.preview.write = (...args) => { writes.push(args); return true; };
    const session = Q.ui.customizeSession.create(env.doc.root, env.hud.root, env.em.FindChildTraverse("SettingsWindow"), element);
    assert.equal(session.publish(), true); assert.equal(writes.at(-1)[4], "");
    assert.equal(session.selection("items"), false);
    assert.equal(session.selection("unknown"), false);
    assert.equal(session.selection("souls"), true); assert.equal(writes.at(-1)[4], "souls");
    assert.deepEqual(Object.keys(session.snapshot()), []);
    assert.equal(session.canUndo(), false); assert.equal(session.canRedo(), false);
    session.edit({ SOULS_X_OFFSET: 50 }); session.undo();
    assert.equal(writes.at(-1)[4], "souls", "history does not undo the selected sample");
    session.close(); Q.presentation.preview.write = original; clean(env);
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
        HUD: ["topBar", "bottomBar", "items", "souls", "unsecuredTimer", "unsecuredSouls", "chat", "damageReport"],
        Shop: ["recentPurchases", "purchaseNotifications", "shop"],
        Crosshair: ["cooldowns", "activeStats", "damageImpact", "stamina", "ammo", "hitMarker", "reload", "targetShapes"],
        Healthbar: ["healthbar"], Minimap: ["minimap", "minimapAlt", "minimapTab"],
        Overlay: ["keyboard", "zipBoost", "speed", "compass"], UI: ["chat", "damageReport"]
    };
    for (const [tab, ids] of Object.entries(tabs)) {
        Q.ui.window.setActiveTabAndRefresh(tab); env.clock.advance(300);
        for (const id of ids) {
            activate(env, "QOLCustomizeEntry_" + id);
            assert.equal(Q.ui.customize.isRunning(), true, id);
            const frames = env.em.FindChildrenWithClassTraverse("QOLCustomizeFrame");
            const scopedWithCatalog = id === "ammo" || id === "shop";
            assert.equal(frames.length, id === "shop" ? 4 : id === "ammo" ? 3 : 1, id);
            assert.ok(frames.some(frame => frame.id === "QOLCustomizeFrame_" + id));
            assert.equal(env.em.FindChildTraverse("QOLCustomizeCatalog").visible, scopedWithCatalog, id);
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

test("scoped entry localizes and opens directly to the position controls", () => {
    for (const [language, caption] of [
        [0, "Customize"],
        [1, "Настроить HUD"],
        [13, "Customize"]
    ]) {
        const env = setup();
        env.global.MOD_CONFIG.LANGUAGE = language;
        env.global.QOL.ui.window.setActiveTabAndRefresh("HUD"); env.clock.advance(300);
        const entry = env.em.FindChildTraverse("QOLCustomizeEntry_souls");
        assert.equal(entry.GetChild(0).text, caption);
        activate(env, "QOLCustomizeEntry_souls");
        const tools = env.em.FindChildTraverse("QOLCustomizeTools");
        assert.ok(tools.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET"));
        assert.equal(tools.FindChildTraverse("QOLCustomizePositionTitle"), null);
        const labels = tools.FindChildrenWithClassTraverse("ModalInstructions");
        assert.equal(labels.some(label => /Drag to move|Drag any corner to resize/.test(label.text)), false);
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
    Object.assign(g.MOD_CONFIG, { BOTTOM_BAR_SCALE: 1.3, ACTIVE_ITEMS_SCALE: 150, AP_SCALE: 175, AP_X_OFFSET: 125, SOULS_SCALE: 151, SOULS_X_OFFSET: 125, PLAYER_HEALTHBAR_SCALE: 180 });
    for (const [tab, id, keys] of [["HUD", "bottomBar", ["BOTTOM_BAR_SCALE", "ACTIVE_ITEMS_SCALE", "AP_SCALE", "AP_X_OFFSET"]],
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

test("Ammo scope permits both digit owners and rejects unrelated settings atomically", () => {
    const env = setup(), Q = env.global.QOL;
    const ammo = Q.presentation.elements.find(element => element.id === "ammo");
    const items = Q.presentation.elements.find(element => element.id === "items");
    const session = Q.ui.customizeSession.create(env.doc.root, env.hud.root, env.em.FindChildTraverse("SettingsWindow"), ammo);
    assert.equal(session.selection("ammoCurrent"), true);
    assert.equal(session.selection("ammoMax"), true);
    assert.equal(session.edit({ AMMO_CURRENT_X_OFFSET: 70, ITEMS_X_OFFSET: 90 }), false);
    assert.deepEqual(Object.keys(session.snapshot()), []);
    assert.equal(session.reset(items), false);
    assert.equal(session.edit({ AMMO_CURRENT_X_OFFSET: 70, AMMO_MAX_Y_OFFSET: -25, AMMO_TOTAL_SCALE: 150 }), true);
    assert.equal(session.reset(ammo), true);
    assert.equal(session.value("AMMO_CURRENT_X_OFFSET"), 0);
    assert.equal(session.value("AMMO_MAX_Y_OFFSET"), 0);
    assert.equal(session.value("AMMO_TOTAL_SCALE"), 100);
    session.close(); clean(env);
});
