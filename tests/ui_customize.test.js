"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const startDrag = require("./customize_drag_fixture");
const { loadLocaleMaps } = require("../scripts/locales_helper");

function setup() {
    const env = load();
    env.global.QOL.ui.window.setOpen(true);
    env.clock.advance(500);
    return env;
}
function activate(env, id) {
    const panel = env.em.FindChildTraverse(id);
    assert.ok(panel, id);
    assert.equal(panel._fire("onactivate"), true, id);
}
function type(env, key, value) {
    const input = env.em.FindChildTraverse("QOLCustomize_" + key);
    assert.ok(input, key);
    input.text = String(value);
    assert.equal(input._fire("oninputsubmit"), true);
    return input;
}
function target(env, id) {
    const element = env.global.QOL.presentation.elements.find(item => item.id === id);
    let panel = env.hud.root;
    for (const segment of element.path) {
        let next = typeof segment === "string" ? panel.FindChild(segment)
            : panel.Children().find(child => child.BHasClass(segment.className));
        if (!next) {
            next = env.doc.create("Panel", { id: typeof segment === "string" ? segment : "", classes: typeof segment === "string" ? [] : [segment.className] });
            panel.addChild(next);
        }
        panel = next;
    }
    Object.assign(panel, { actualxoffset: 200, actualyoffset: 100, actuallayoutwidth: 160, actuallayoutheight: 60 });
    return panel;
}
function clean(env) {
    assert.deepEqual(env.doc.eventErrors, []);
    assert.deepEqual(env.clock.errors, []);
}
function acknowledgeSave(env) {
    // Save-state tests control completion; a separate test below exercises the
    // real CEF protocol. Neither establishes native localStorage durability.
    env.global.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null, { ok: true });
}

function cef(env) {
    const bridge = env.global.QOL.core.storageBridge;
    bridge.enableAutoload(false);
    const panel = bridge.getPanel();
    const requests = [];
    panel.SetURL = url => { if (url.includes("#")) requests.push(JSON.parse(decodeURIComponent(url.slice(url.indexOf("#") + 1)))); };
    bridge._onHtmlTitle(panel, "QOL_BRIDGE_READY:frag1");
    const respond = (request, response) => {
        const id = request.a.find(value => typeof value === "string" && /^qol_\d+_\d+$/.test(value));
        assert.ok(id);
        bridge._onHtmlTitle(panel, "QOL_RES:" + JSON.stringify({ id, ...response }));
    };
    return { requests, respond };
}

test("Apply stays open until every real CEF save chunk is acknowledged", async () => {
    const env = setup();
    const protocol = cef(env);
    env.global.QOL.ui.customize.start();
    type(env, "SOULS_X_OFFSET", 125);
    activate(env, "QOLCustomizeApply");
    assert.equal(env.global.QOL.ui.customize.isRunning(), true);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeApply").enabled, false);
    assert.equal(env.global.MOD_CONFIG.SOULS_X_OFFSET, 125);
    const chunks = [];
    let sequence = 0;
    for (let index = 0; index < protocol.requests.length; index++) {
        const request = protocol.requests[index];
        assert.equal(request.f, "saveChunk");
        chunks.push(Buffer.from(request.a[3], "base64").toString("utf8"));
        assert.equal(env.global.QOL.ui.customize.isRunning(), true, "no premature saved message");
        protocol.respond(request, { ok: true, savePartAck: request.a[1], _seq: ++sequence });
    }
    assert.ok(chunks.length > 1);
    assert.equal(JSON.parse(chunks.join("")).data.SOULS_X_OFFSET, 125);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(env.global.QOL.ui.customize.isRunning(), false);
    clean(env);
});

test("failed CEF save keeps applied settings and supports Retry save without reapplying", async () => {
    const env = setup();
    const protocol = cef(env);
    let saves = 0;
    const save = env.global.SaveAndSync;
    env.global.SaveAndSync = () => { saves++; save(); };
    env.global.QOL.ui.customize.start();
    type(env, "SOULS_X_OFFSET", 75);
    activate(env, "QOLCustomizeApply");
    protocol.respond(protocol.requests[0], { ok: false, error: "test storage unavailable" });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const apply = env.em.FindChildTraverse("QOLCustomizeApply");
    assert.equal(env.global.QOL.ui.customize.isRunning(), true);
    assert.equal(apply.enabled, true);
    assert.match(apply.GetChild(0).text, /Retry save/);
    assert.equal(env.global.MOD_CONFIG.SOULS_X_OFFSET, 75);
    activate(env, "QOLCustomizeApply");
    let sequence = 0;
    for (let index = 1; index < protocol.requests.length; index++) {
        const request = protocol.requests[index];
        protocol.respond(request, { ok: true, savePartAck: request.a[1], _seq: ++sequence });
    }
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(env.global.QOL.ui.customize.isRunning(), false);
    assert.equal(saves, 1);
    clean(env);
});

test("Customize is in the actual navigation and launches from its registered renderer", () => {
    const env = setup();
    const Q = env.global.QOL;
    assert.ok(Q.ui.layout.some(tab => tab.id === "Customize" && tab.custom));
    Q.ui.window.setActiveTabAndRefresh("Customize");
    env.clock.advance(200);
    activate(env, "QOLCustomizeOpen");
    assert.equal(Q.ui.customize.isRunning(), true);
    activate(env, "QOLCustomizeCancel");
    clean(env);
});

for (const withoutHud of [false, true]) {
    test(`the real Customize launcher works when localeCompare throws the client ICU error (${withoutHud ? "menu" : "HUD"})`, () => {
        const env = setup();
        const Q = env.global.QOL;
        if (withoutHud) {
            env.hud.root.id = "MenuRoot";
            env.hud.root.paneltype = "Panel";
        }
        // Patch only this settings isolate, preserving Node's host intrinsics.
        env.settings.eval(`
            globalThis.icuCalls = 0;
            String.prototype.localeCompare = function () {
                icuCalls++;
                throw new Error("Internal error. Icu error.");
            };
        `);
        const before = JSON.stringify(env.global.MOD_CONFIG);
        Q.ui.window.setActiveTabAndRefresh("Customize");
        env.clock.advance(200);
        activate(env, "QOLCustomizeOpen");
        assert.equal(Q.ui.customize.isRunning(), true, Q.ui.customize.failureText());
        assert.equal(env.settings.eval("icuCalls"), 0);
        const catalog = env.em.FindChildTraverse("QOLCustomizeCatalog");
        const choices = catalog.Children().find(panel => panel.BHasClass("QOLCustomizeChoices"));
        const buttons = choices.Children().filter(panel => panel.id.startsWith("QOLCustomizeSelect_"));
        assert.equal(buttons.length, Q.presentation.elements.length);
        const groups = buttons.map(panel => Q.presentation.elements.find(element => panel.id === "QOLCustomizeSelect_" + element.id).group || "HUD");
        assert.deepEqual(groups, groups.slice().sort());
        activate(env, "QOLCustomizeSelect_souls");
        type(env, "SOULS_X_OFFSET", 125);
        const search = env.em.FindChildTraverse("QOLCustomizeSearch");
        search.text = "souls";
        assert.equal(search._fire("ontextentrychange"), true);
        assert.equal(env.em.FindChildTraverse("QOLCustomizeSelect_souls").visible, true);
        assert.ok(buttons.some(panel => !panel.visible));
        activate(env, "QOLCustomizeCancel");
        assert.equal(Q.ui.customize.isRunning(), false);
        assert.equal(JSON.stringify(env.global.MOD_CONFIG), before);
        clean(env);
    });
}

test("opening does not require the optional SetDraggable method; native creation enables drag and locks still guard events", () => {
    const env = setup();
    const g = env.global;
    const native = target(env, "souls");
    const create = g.$.CreatePanel;
    const frames = [];
    g.$.CreatePanel = (typeName, parent, id, properties) => {
        const panel = create(typeName, parent, id, properties);
        if (id?.startsWith("QOLCustomizeFrame_")) {
            assert.ok(["true", "false"].includes(properties.draggable));
            panel.SetDraggable = undefined;
            frames.push(panel);
        }
        return panel;
    };
    assert.equal(g.QOL.ui.customize.start(), true);
    env.clock.advance(500);
    assert.equal(g.QOL.ui.customize.isRunning(), true);
    assert.equal(frames.length, g.QOL.presentation.elements.length);
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_souls");
    const drag = {};
    g.$.DispatchEvent("DragStart", frame, drag);
    assert.notEqual(drag.displayPanel, frame);
    assert.ok(drag.displayPanel.BHasClass("QOLCustomizeDragProxy"));
    g.$.DispatchEvent("DragEnd", frame, frame);
    activate(env, "QOLCustomizeLock");
    const locked = {};
    g.$.DispatchEvent("DragStart", frame, locked);
    assert.equal(locked.displayPanel, undefined);
    assert.ok(native.IsValid());
    activate(env, "QOLCustomizeCancel");
    clean(env);
});

test("the real Customize launcher edits and saves without a live Hud; Cancel preserves canonical settings", () => {
    const env = setup();
    const g = env.global;
    // A menu publication root is not a gameplay HUD. The earlier implementation
    // assumed a HUD context in every test; this explicitly removes that evidence.
    env.hud.root.id = "MenuRoot";
    env.hud.root.paneltype = "Panel";
    const root = g.QOL.core.persistence.getUIRoot();
    assert.equal(g.QOL.ui.customizeSession.resolveHud(root), null);
    const before = JSON.stringify(g.MOD_CONFIG);
    g.QOL.ui.window.setActiveTabAndRefresh("Customize"); env.clock.advance(200);
    activate(env, "QOLCustomizeOpen");
    assert.equal(g.QOL.ui.customize.isRunning(), true);
    type(env, "SOULS_X_OFFSET", 125);
    activate(env, "QOLCustomizeSelect_minimapAlt");
    type(env, "ZOOM_X_OFFSET_ALT", 75);
    env.clock.advance(3000);
    assert.equal(g.QOL.ui.customize.isRunning(), true, "absence is not a lease failure");
    assert.equal(env.em.FindChildTraverse("QOLCustomizeFrame_souls").visible, false);
    assert.equal(root.GetAttributeString("QOL_CUSTOMIZE_DRAFT", ""), "");
    activate(env, "QOLCustomizeCancel");
    assert.equal(JSON.stringify(g.MOD_CONFIG), before);
    env.clock.advance(200);
    activate(env, "QOLCustomizeOpen");
    type(env, "SOULS_X_OFFSET", 125);
    acknowledgeSave(env);
    activate(env, "QOLCustomizeApply");
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 125);
    assert.equal(g.QOL.ui.customize.isRunning(), false);
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
    assert.equal(imported.candidateConfig.SOULS_X_OFFSET, 125);
    clean(env);
});

test("Customize uses shared QOLLOCK modal controls and every settings theme", () => {
    const env = setup();
    const g = env.global;
    for (const option of g.QOL.ui.theme.SETTINGS_THEME_OPTIONS) {
        g.MOD_CONFIG.SETTINGS_THEME = option.value;
        assert.equal(g.QOL.ui.customize.start(), true);
        const themeClass = g.QOL.ui.theme.SETTINGS_THEME_ROOT_CLASS_NAMES[option.value];
        assert.equal(env.em.BHasClass(themeClass), true);
        for (const id of ["QOLCustomizeTools", "QOLCustomizeCatalog"]) assert.equal(env.em.FindChildTraverse(id).BHasClass("QOLUnifiedModalSurface"), true);
        assert.equal(env.em.FindChildTraverse("QOLCustomizeApply").BHasClass("QOLUnifiedModalPrimary"), true);
        assert.equal(env.em.FindChildTraverse("QOLCustomizeCancel").BHasClass("QOLUnifiedModalSecondary"), true);
        assert.equal(env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET").BHasClass("ValueInput"), true);
        activate(env, "QOLCustomizeCancel"); env.clock.advance(200);
    }
    clean(env);
});

test("preview changes the HUD isolate while canonical config, storage and export remain untouched; Cancel restores", () => {
    const env = setup();
    const { global: g, hud, clock } = env;
    const before = JSON.stringify(g.MOD_CONFIG);
    const storage = hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    const stamp = g.QOL.core.persistence.getConfigChangeStamp(g.QOL.core.persistence.getUIRoot());
    assert.equal(g.QOL.ui.customize.start(), true);
    assert.equal(g.QOL.ui.customize.start(), false);
    let saves = 0;
    g.SaveAndSync = () => { saves++; };
    type(env, "SOULS_X_OFFSET", 133);
    type(env, "SOULS_Y_OFFSET", 48);
    clock.advance(800);
    const store = hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 135);
    assert.equal(store.get("ql_souls", "SOULS_Y_OFFSET"), 50);
    assert.equal(hud.sandbox.global.State.lastConfig.SOULS_X_OFFSET, 0);
    assert.equal(JSON.stringify(g.MOD_CONFIG), before);
    assert.equal(hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), storage);
    assert.equal(g.QOL.core.persistence.getConfigChangeStamp(g.QOL.core.persistence.getUIRoot()), stamp);
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
    assert.equal(imported.candidateConfig.SOULS_X_OFFSET, 0);
    assert.match(env.em.FindChildTraverse("QOLCustomizeTools").GetChild(env.em.FindChildTraverse("QOLCustomizeTools").GetChildCount() - 1).text, /Preview active/);
    activate(env, "QOLCustomizeCancel");
    clock.advance(800);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
    assert.equal(saves, 0);
    assert.equal(JSON.stringify(g.MOD_CONFIG), before);
    if (env.em.IsValid()) assert.equal(env.em.BHasClass("QOLCustomizeActive"), false);
    assert.equal(env.em.FindChildTraverse("SettingsWindow").BHasClass("QOLCustomizeHidden"), false);
    assert.equal(hud.root.GetAttributeString("QOL_CUSTOMIZE_DRAFT", ""), "");
    clean(env);
});

test("Apply follows the normal save path exactly once and HEX survives a subsequent import", () => {
    const env = setup();
    acknowledgeSave(env);
    const { global: g, clock, hud } = env;
    assert.equal(g.QOL.ui.customize.start(), true);
    type(env, "SOULS_X_OFFSET", 125);
    activate(env, "QOLCustomizeSelect_items");
    type(env, "ITEMS_WASH_COLOR", "#ABC123");
    let saves = 0;
    const save = g.SaveAndSync;
    g.SaveAndSync = () => { saves++; save(); };
    const apply = env.em.FindChildTraverse("QOLCustomizeApply");
    assert.equal(apply._fire("onactivate"), true);
    apply._fire("onactivate"); // An old DeleteAsync handle must be inert.
    clock.advance(1200);
    assert.equal(saves, 1);
    assert.equal(g.QOL.ui.customize.isRunning(), false);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 125);
    assert.equal(g.QOL_UTILS.DecodeHexColor(g.MOD_CONFIG.ITEMS_WASH_COLOR), "#ABC123");
    assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get("ql_items", "ITEMS_WASH_COLOR"), g.MOD_CONFIG.ITEMS_WASH_COLOR);
    const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
    assert.equal(result.ok, true);
    assert.equal(result.candidateConfig.ITEMS_WASH_COLOR, g.MOD_CONFIG.ITEMS_WASH_COLOR);
    clean(env);
});

test("exact inputs reject malformed values, Default differs from black, and Reset uses existing defaults", () => {
    const env = setup();
    const g = env.global;
    g.QOL.ui.customize.start();
    const input = type(env, "SOULS_X_OFFSET", "Infinity");
    assert.equal(input.BHasClass("Invalid"), true);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 0);
    activate(env, "QOLCustomizeSelect_stamina");
    assert.ok(env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET"), "selection cannot discard malformed pending input");
    type(env, "SOULS_X_OFFSET", 0);
    activate(env, "QOLCustomizeSelect_stamina");
    type(env, "STAMINA_CHARGE_COLOR", "#000000");
    env.clock.advance(500);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(g.QOL_UTILS.DecodeHexColor(store.get("ql_stamina", "STAMINA_CHARGE_COLOR")), "#000000");
    const invalid = type(env, "STAMINA_CHARGE_COLOR", "#XYZ");
    assert.equal(invalid.BHasClass("Invalid"), true);
    env.clock.advance(500);
    assert.equal(g.QOL_UTILS.DecodeHexColor(store.get("ql_stamina", "STAMINA_CHARGE_COLOR")), "#000000");
    activate(env, "QOLCustomizeDefault_STAMINA_CHARGE_COLOR");
    type(env, "STAMINA_CHARGE_ANGLE", 80);
    activate(env, "QOLCustomizeReset");
    env.clock.advance(500);
    assert.equal(store.get("ql_stamina", "STAMINA_CHARGE_COLOR"), 0);
    assert.equal(store.get("ql_stamina", "STAMINA_CHARGE_ANGLE"), g.QOL_DEFAULT_CONFIG.STAMINA_CHARGE_ANGLE);
    activate(env, "QOLCustomizeCancel");
    clean(env);
});

test("Apply accepts a valid pending entry without Enter and keeps invalid entries open", () => {
    const env = setup();
    acknowledgeSave(env);
    env.global.QOL.ui.customize.start();
    const input = env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET");
    input.text = "not a number";
    activate(env, "QOLCustomizeApply");
    env.clock.advance(300);
    assert.equal(env.global.QOL.ui.customize.isRunning(), true);
    assert.equal(input.BHasClass("Invalid"), true);
    assert.equal(env.global.MOD_CONFIG.SOULS_X_OFFSET, 0);
    input.text = "135";
    activate(env, "QOLCustomizeApply");
    env.clock.advance(500);
    assert.equal(env.global.MOD_CONFIG.SOULS_X_OFFSET, 135);
    assert.equal(env.global.QOL.ui.customize.isRunning(), false);
    clean(env);
});

test("resetting an untouched selection does not invent an undo entry", () => {
    const env = setup();
    env.global.QOL.ui.customize.start();
    activate(env, "QOLCustomizeReset");
    assert.equal(env.em.FindChildTraverse("QOLCustomizeUndo").enabled, false);
    activate(env, "QOLCustomizeCancel");
    clean(env);
});

test("frame measurements account for a distinct menu origin and nonuniform UI scale", () => {
    const env = setup();
    const panel = target(env, "souls");
    const parent = panel.GetParent();
    parent.actualxoffset = 30;
    parent.actualyoffset = 40;
    env.em.actualxoffset = 10;
    env.em.actualyoffset = 20;
    env.global.QOL.ui.customize.start();
    const overlay = env.em.FindChildTraverse("QOLCustomizeEditor");
    overlay.actualuiscale_x = 2;
    overlay.actualuiscale_y = 1.5;
    env.clock.advance(300);
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_souls");
    assert.equal(frame.style.x, "110px");
    assert.equal(frame.style.y, "80px");
    assert.equal(frame.style.width, "80px");
    assert.equal(frame.style.height, "40px");
    activate(env, "QOLCustomizeCancel");
    clean(env);
});

test("conditional absence keeps settings available; observed replacement gets a new frame measurement", () => {
    const env = setup();
    env.global.QOL.ui.customize.start();
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_stamina");
    assert.equal(frame.visible, false);
    activate(env, "QOLCustomizeSelect_stamina");
    assert.ok(env.em.FindChildTraverse("QOLCustomize_STAMINA_CHARGE_ANGLE"));
    const panel = target(env, "stamina");
    env.clock.advance(300);
    assert.equal(frame.visible, true);
    assert.equal(frame.style.width, "160px");
    panel.DeleteAsync(0);
    env.clock.advance(300);
    assert.equal(frame.visible, false);
    const replacement = target(env, "stamina");
    replacement.actuallayoutwidth = 90;
    env.clock.advance(300);
    assert.equal(frame.style.width, "90px");
    activate(env, "QOLCustomizeCancel");
    clean(env);
});

test("top bar measures visible card content, excluding screen-height owners and backers", () => {
    const env = setup();
    const top = target(env, "topBar");
    Object.assign(top, { actuallayoutwidth: 1400, actuallayoutheight: 1080 });
    const add = (parent, id, width, height, x = 0, y = 0, classes = []) => {
        const panel = env.doc.create("Panel", { id, classes }); parent.addChild(panel);
        Object.assign(panel, { actualxoffset: x, actualyoffset: y, actuallayoutwidth: width, actuallayoutheight: height });
        return panel;
    };
    const teams = add(top, "TeamsContainer", 1400, 1080);
    const players = add(add(add(teams, "TeamFriendly", 600, 1000), "PlayerContents", 600, 1000), "PlayersContainer", 600, 1000);
    const first = add(add(players, "Player1", 88, 1000), "PlayerDetailsContainer", 88, 180);
    add(add(players, "Player2", 88, 1000, 120), "PlayerDetailsContainer", 88, 180);
    add(top, "GradientBacker", 1400, 540);
    add(top, "", 1400, 1080, 0, 0, ["ChatContainer"]);
    add(top, "", 50, 40, 250, 0, ["GameClock"]);
    add(top, "ObjectivesMap", 90, 90, 220, 45);
    env.global.QOL.ui.customize.start();
    activate(env, "QOLCustomizeSelect_topBar");
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_topBar");
    assert.equal(frame.style.width, "310px");
    assert.equal(frame.style.height, "180px");
    assert.equal(frame.style.x, "200px");
    first.visible = false;
    players.GetChild(1).visible = false;
    env.clock.advance(300);
    assert.equal(frame.style.height, "135px");
    assert.equal(frame.style.width, "90px");
    activate(env, "QOLCustomizeCancel"); clean(env);
});

for (const density of [1, 2]) test(`corner resize uses uniform scale at UI density ${density}, with one undo and guarded locks`, () => {
    const env = setup();
    const panel = target(env, "bottomBar");
    const nativeParent = panel.GetParent();
    const baseline = JSON.stringify(env.global.MOD_CONFIG);
    env.global.QOL.ui.customize.start();
    const overlay = env.em.FindChildTraverse("QOLCustomizeEditor");
    overlay.actualuiscale_x = density;
    overlay.actualuiscale_y = density * 1.5;
    activate(env, "QOLCustomizeSelect_bottomBar");
    const handle = env.em.FindChildTraverse("QOLCustomizeResize_bottomBar");
    assert.equal(handle.visible, true);
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_bottomBar");
    assert.equal(handle.GetParent(), frame, "corner belongs to the measured frame");
    const proxy = startDrag(env, handle);
    assert.equal(handle.GetParent(), frame);
    proxy.actualxoffset += 16; proxy.actualyoffset += 6;
    env.clock.advance(100);
    proxy.actualxoffset += 16; proxy.actualyoffset += 6;
    env.global.$.DispatchEvent("DragEnd", handle, handle);
    env.clock.advance(500);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_bottom_bar", "BOTTOM_BAR_SCALE"), 1.2);
    assert.equal(panel.style.uiScale, "108%");
    assert.equal(panel.GetParent(), nativeParent);
    assert.equal(JSON.stringify(env.global.MOD_CONFIG), baseline);
    activate(env, "QOLCustomizeUndo"); env.clock.advance(500);
    assert.equal(store.get("ql_bottom_bar", "BOTTOM_BAR_SCALE"), 1);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeUndo").enabled, false);
    activate(env, "QOLCustomizeRedo"); env.clock.advance(500);
    assert.equal(store.get("ql_bottom_bar", "BOTTOM_BAR_SCALE"), 1.2);
    activate(env, "QOLCustomizeLock");
    assert.equal(handle.visible, false);
    const locked = {}; env.global.$.DispatchEvent("DragStart", handle, locked);
    assert.equal(locked.displayPanel, undefined);
    activate(env, "QOLCustomizeCancel"); env.clock.advance(500);
    assert.equal(store.get("ql_bottom_bar", "BOTTOM_BAR_SCALE"), 1);
    assert.equal(JSON.stringify(env.global.MOD_CONFIG), baseline);
    clean(env);
});

test("resize clamps existing ranges, cancels on native replacement and cleans up a running gesture", () => {
    const env = setup();
    const panel = target(env, "bottomBar");
    env.global.QOL.ui.customize.start(); activate(env, "QOLCustomizeSelect_bottomBar");
    const handle = env.em.FindChildTraverse("QOLCustomizeResize_bottomBar");
    let proxy = startDrag(env, handle);
    proxy.actualxoffset += 1600; env.clock.advance(100);
    env.global.$.DispatchEvent("DragEnd", handle, handle); env.clock.advance(500);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_bottom_bar", "BOTTOM_BAR_SCALE"), 1.5);
    proxy = startDrag(env, handle);
    proxy.actualxoffset -= 40; env.clock.advance(40);
    panel.DeleteAsync(0); env.clock.advance(1);
    const replacement = target(env, "bottomBar"); env.clock.advance(500);
    assert.equal(store.get("ql_bottom_bar", "BOTTOM_BAR_SCALE"), 1.5, "replacement cancels the current gesture");
    proxy = startDrag(env, handle);
    proxy.actualyoffset -= 20;
    activate(env, "QOLCustomizeCancel"); env.clock.advance(500);
    assert.equal(store.get("ql_bottom_bar", "BOTTOM_BAR_SCALE"), 1);
    assert.equal(handle.IsValid(), false);
    assert.equal(proxy.IsValid(), false, "closing also removes a compositor-reparented proxy");
    assert.ok(replacement.IsValid()); clean(env);
});

test("editor view toggles are localized, session-only and leave scale aliases out of the ammo inspector", () => {
    const env = setup();
    env.global.MOD_CONFIG.LANGUAGE = env.global.QOL.ui.theme.SETTINGS_LANGUAGE_RUSSIAN;
    const baseline = JSON.stringify(env.global.MOD_CONFIG);
    env.global.QOL.ui.customize.start();
    const overlay = env.em.FindChildTraverse("QOLCustomizeEditor");
    assert.equal(overlay.BHasClass("ShowFrames"), false);
    activate(env, "QOLCustomizeToggleFrames");
    assert.equal(overlay.BHasClass("ShowFrames"), true);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeToggleFrames").GetChild(0).text, "Скрыть рамки");
    activate(env, "QOLCustomizeTogglePanels");
    assert.equal(overlay.BHasClass("PanelsHidden"), true);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeTogglePanels").GetChild(0).text, "Показать панели");
    activate(env, "QOLCustomizeTogglePanels");
    activate(env, "QOLCustomizeSelect_ammo");
    assert.equal(env.em.FindChildTraverse("QOLCustomize_AMMO_PANEL_SCALE"), null);
    assert.ok(env.em.FindChildTraverse("QOLCustomize_AMMO_CURRENT_SCALE"));
    assert.equal(env.em.FindChildTraverse("QOLCustomizeResize_ammo"), null);
    activate(env, "QOLCustomizeCancel"); env.clock.advance(100);
    env.global.QOL.ui.customize.start();
    assert.equal(env.em.FindChildTraverse("QOLCustomizeEditor").BHasClass("ShowFrames"), false);
    assert.equal(JSON.stringify(env.global.MOD_CONFIG), baseline);
    activate(env, "QOLCustomizeCancel"); clean(env);
});

for (const scale of [1, 2]) test(`production DragStart/DragEnd at UI scale ${scale}: signed offsets, lock and one undo per gesture`, () => {
    const env = setup();
    const panel = target(env, "souls");
    panel.GetParent().actualuiscale_x = scale;
    panel.GetParent().actualuiscale_y = scale;
    env.global.QOL.ui.customize.start();
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_souls");
    frame.actualxoffset = 200;
    frame.actualyoffset = 100;
    const proxy = startDrag(env, frame);
    assert.equal(frame.GetParent(), env.em.FindChildTraverse("QOLCustomizeEditor"));
    const parent = panel.GetParent();
    proxy.actualxoffset += 20 * scale;
    proxy.actualyoffset += 30 * scale;
    env.clock.advance(100);
    proxy.actualxoffset += 20 * scale;
    env.clock.advance(100);
    env.global.$.DispatchEvent("DragEnd", frame, frame);
    env.clock.advance(500);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 40);
    assert.equal(store.get("ql_souls", "SOULS_Y_OFFSET"), -30);
    assert.equal(panel.GetParent(), parent, "native owner was never reparented");
    assert.equal(env.global.MOD_CONFIG.SOULS_X_OFFSET, 0);
    activate(env, "QOLCustomizeUndo");
    env.clock.advance(500);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeUndo").enabled, false);
    activate(env, "QOLCustomizeRedo");
    env.clock.advance(500);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 40);
    activate(env, "QOLCustomizeLock");
    env.clock.advance(300);
    assert.equal(frame.draggable, false);
    const locked = {};
    env.global.$.DispatchEvent("DragStart", frame, locked);
    assert.equal(locked.displayPanel, undefined);
    activate(env, "QOLCustomizeCancel");
    clean(env);
});

test("external canonical edits invalidate the draft and cannot be overwritten by Apply or Cancel", () => {
    const env = setup();
    const { global: g, clock, hud } = env;
    g.QOL.ui.customize.start();
    type(env, "SOULS_X_OFFSET", 200);
    clock.advance(500);
    const apply = env.em.FindChildTraverse("QOLCustomizeApply");
    g.MOD_CONFIG = Object.assign({}, g.MOD_CONFIG, { SOULS_X_OFFSET: 75 });
    g.MarkConfigDirty();
    g.FlushPendingSave();
    apply._fire("onactivate");
    clock.advance(800);
    assert.equal(g.QOL.ui.customize.isRunning(), false);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 75);
    assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 75);
    clean(env);
});

for (const close of ["menu", "overlay", "hud"]) test(`Customize cleans up on ${close} exit; stale controls cannot publish`, () => {
    const env = setup();
    env.global.QOL.ui.customize.start();
    type(env, "SOULS_X_OFFSET", 200);
    env.clock.advance(500);
    const stale = env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET");
    if (close === "menu") env.global.QOL.ui.window.setOpen(false);
    if (close === "overlay") env.em.FindChildTraverse("QOLCustomizeEditor").DeleteAsync(0);
    if (close === "hud") env.hud.root.DeleteAsync(0);
    env.clock.advance(500);
    assert.equal(env.global.QOL.ui.customize.isRunning(), false);
    stale.text = "300";
    stale._fire("oninputsubmit");
    env.clock.advance(500);
    assert.equal(env.global.MOD_CONFIG.SOULS_X_OFFSET, 0);
    if (env.em.IsValid()) assert.equal(env.em.BHasClass("QOLCustomizeActive"), false);
    clean(env);
});

test("HUD rejects unknown keys, conflicting revisions and expired leases", () => {
    const env = setup();
    const { global: g, hud, clock } = env;
    const root = g.QOL.core.persistence.getUIRoot();
    const stamp = g.QOL.core.persistence.getConfigChangeStamp(root);
    hud.root.AddClass("QOLCustomizeActive");
    const preview = g.QOL.presentation.preview;
    const store = hud.sandbox.global.QOL.core.ConfigStore;
    preview.write(hud.root, { SOULS_X_OFFSET: 100 }, "session", stamp);
    clock.advance(500);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 100);
    assert.equal(hud.sandbox.global.State.lastConfig.SOULS_X_OFFSET, 0);
    clock.advance(2500);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
    preview.write(hud.root, { ENABLE_CHAT_IMAGES: 1, SOULS_X_OFFSET: 150 }, "wrong", stamp);
    clock.advance(500);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
    preview.write(hud.root, { SOULS_X_OFFSET: 150 }, "old", "stale stamp");
    clock.advance(500);
    assert.equal(store.get("ql_souls", "SOULS_X_OFFSET"), 0);
    clean(env);
});

test("all rendered editor text uses English/Russian catalogs and survives selection of every adapter", () => {
    const env = setup();
    const { maps } = loadLocaleMaps();
    const seen = new Set();
    env.global.QOL.ui.theme.LocalizeSettingsText = text => {
        if (text === "") return "";
        assert.ok(Object.hasOwn(maps.en, text), `English: ${text}`);
        assert.ok(Object.hasOwn(maps.ru, text), `Russian: ${text}`);
        seen.add(text);
        return "translated:" + text;
    };
    assert.equal(env.global.QOL.ui.customize.start(), true);
    for (const element of env.global.QOL.presentation.elements) activate(env, "QOLCustomizeSelect_" + element.id);
    assert.ok(seen.has("Player Stats"));
    assert.ok(seen.has("Lock dragging"));
    assert.ok(seen.has("Unavailable now"));
    activate(env, "QOLCustomizeCancel");
    clean(env);
});
