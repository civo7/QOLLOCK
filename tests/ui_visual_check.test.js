"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const { loadLocaleMaps } = require("../scripts/locales_helper");

function setup() {
    const env = load();
    env.global.QOL.ui.window.setOpen(true);
    env.clock.advance(500);
    return env;
}

test("walkthrough localizes every caption and step through English/Russian catalogs", () => {
    const { global: g, em, clock, list } = setup();
    const { maps } = loadLocaleMaps();
    const seen = new Set();
    const localize = (text) => {
        assert.ok(Object.hasOwn(maps.en, text), `Missing English source: ${text}`);
        assert.ok(Object.hasOwn(maps.ru, text), `Missing Russian translation: ${text}`);
        seen.add(text);
        return `translated:${text}`;
    };
    // Dynamic captions use the same catalog path as the Dev launch row.
    g.QOL.ui.theme.LocalizeSettingsText = localize;
    assert.equal(g.QOL.ui.visualCheck.start(), true);
    const texts = [];
    function collect(panel) {
        if (panel.paneltype === "Label") texts.push(panel.text);
        for (const child of panel.Children()) collect(child);
    }
    for (let i = 0; i < 42; i++) {
        const text = em.FindChildTraverse("QOLVisualCheckText").text;
        assert.ok(text.includes("translated:"));
        assert.equal(/[А-Яа-яЁё]/.test(text), false, "no inline Russian bypass");
        if (i === 0) collect(em.FindChildTraverse("QOLVisualCheck"));
        g.QOL.ui.visualCheck.next();
    }
    for (const caption of texts.slice(1)) assert.ok(caption.startsWith("translated:"), caption);
    assert.ok(seen.has("Right and up, larger"));
    assert.ok(seen.has("Compare A/B"));
    clock.advance(600);
    // The real resolver follows the selected language, not a bilingual literal.
    g.MOD_CONFIG.LANGUAGE = 1;
    assert.equal(g.LocalizeSettingsText("HUD settings walkthrough", true), "Пошаговая проверка HUD");
    g.QOL.ui.devTab.render(list);
    const row = em.FindChildTraverse("DevVisualCheckRow");
    const labels = [];
    function labelsIn(panel) { if (panel.paneltype === "Label") labels.push(panel.text); for (const child of panel.Children()) labelsIn(child); }
    labelsIn(row);
    assert.ok(labels.includes("Пошаговая проверка HUD"));
    g.MOD_CONFIG.LANGUAGE = 0;
    assert.equal(g.LocalizeSettingsText("HUD settings walkthrough", true), "HUD settings walkthrough");
});

test("visual check drives HUD config, groups X/Y and restores without persistent saves", () => {
    const { global: g, hud, clock, doc, em } = setup();
    g.MOD_CONFIG.TOP_BAR_X_OFFSET = 35;
    em.style.backgroundColor = "#000c";
    g.MarkConfigDirty();
    // User's pending edit is flushed before the snapshot.
    const api = g.QOL.ui.visualCheck;
    assert.equal(api.start(), true);
    assert.equal(em.style.backgroundColor, "#000c", "native inline background stays untouched");
    assert.equal(em.BHasClass("QOLVisualCheckActive"), true);
    assert.equal(api.start(), false, "double start cannot replace original snapshot");
    let persisted = 0;
    g.SaveAndSync = () => { persisted++; };
    g.PersistStatlockerProfileState = () => { persisted++; };
    g.QOL.core.storageBridge.saveSettings = () => { persisted++; };
    api.next();
    clock.advance(1200);
    const store = hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_topbar", "TOP_BAR_X_OFFSET"), 100);
    assert.equal(store.get("ql_topbar", "TOP_BAR_Y_OFFSET"), -80);
    assert.equal(store.get("ql_topbar", "TOP_BAR_SCALE"), 0.8);
    assert.equal(em.FindChildTraverse("SettingsWindow").BHasClass("QOLVisualCheckHidden"), true);
    assert.notEqual(em.FindChildTraverse("SettingsWindow").style.visibility, "collapse");
    // No timed advance; the operator controls the pace.
    clock.advance(12000);
    assert.match(em.FindChildTraverse("QOLVisualCheckText").text, /^2\/42/);
    g.MOD_CONFIG.BRIDGE_BUFF_START = 15;
    api.next();
    clock.advance(1200);
    assert.equal(store.get("ql_topbar", "TOP_BAR_X_OFFSET"), 35, "previous group restored");
    const oldNext = em.FindChildTraverse("QOLVisualCheckNext");
    em.FindChildTraverse("QOLVisualCheckStop")._fire("onactivate");
    oldNext._fire("onactivate"); // DeleteAsync leaves a briefly live old button.
    clock.advance(1200);
    assert.equal(api.isRunning(), false);
    assert.equal(em.style.backgroundColor, "#000c");
    assert.equal(em.BHasClass("QOLVisualCheckActive"), false);
    assert.equal(em.FindChildTraverse("SettingsWindow").BHasClass("QOLVisualCheckHidden"), false);
    assert.equal(g.MOD_CONFIG.TOP_BAR_X_OFFSET, 35);
    assert.equal(g.MOD_CONFIG.BRIDGE_BUFF_START, 15, "unrelated edits are preserved");
    assert.notEqual(em.FindChildTraverse("SettingsWindow").style.visibility, "collapse");
    assert.equal(persisted, 0);
    assert.deepEqual(clock.errors, []);
    assert.deepEqual(doc.eventErrors, []);
});

test("visual check completes all steps and supports restart and settings close", () => {
    const { global: g, clock, doc } = setup();
    const original = JSON.stringify(g.MOD_CONFIG);
    const api = g.QOL.ui.visualCheck;
    assert.equal(api.start(), true);
    for (let i = 0; i < 42; i++) { clock.advance(600); api.next(); }
    clock.advance(600);
    assert.equal(api.isRunning(), false);
    assert.equal(JSON.stringify(g.MOD_CONFIG), original);
    assert.equal(api.start(), true);
    api.next();
    g.QOL.ui.window.setOpen(false);
    assert.equal(api.isRunning(), false);
    assert.equal(JSON.stringify(g.MOD_CONFIG), original);
    clock.advance(1200);
    assert.deepEqual(clock.errors, []);
    assert.deepEqual(doc.eventErrors, []);
});

test("visual check cleans up after overlay deletion and refuses a closed menu", () => {
    const { global: g, clock, em } = setup();
    const api = g.QOL.ui.visualCheck;
    const original = g.MOD_CONFIG.TOP_BAR_SCALE;
    assert.equal(api.start(), true);
    api.next();
    em.FindChildTraverse("QOLVisualCheck").DeleteAsync(0);
    clock.advance(600);
    assert.equal(api.isRunning(), false);
    assert.equal(g.MOD_CONFIG.TOP_BAR_SCALE, original);
    g.QOL.ui.window.setOpen(false);
    assert.equal(api.start(), false);
    assert.deepEqual(clock.errors, []);
});

test("walkthrough preserves escape controls and restores focus without native inline-style clearing", () => {
    const { global: g, em, hud, doc, clock } = setup();
    const back = doc.create("Button", { id: "EscapeButton" });
    const background = doc.create("Panel", { id: "EscapeBackground" });
    em.addChild(back);
    em.addChild(background);
    const window = em.FindChildTraverse("SettingsWindow");
    for (const panel of [em, window, back, background]) {
        panel.ClearPropertyFromCode = () => { throw new Error("No native clear API"); };
    }
    const visibility = window.style.visibility;
    const api = g.QOL.ui.visualCheck;
    assert.equal(api.start(), true);
    assert.equal(back.BHasClass("QOLVisualCheckHidden"), false);
    assert.equal(background.BHasClass("QOLVisualCheckHidden"), false);
    assert.equal(window.style.visibility, visibility);
    const root = g.QOL.core.persistence.resolveHudPanel(g.QOL.core.persistence.getUIRoot());
    assert.equal(root.BHasClass("QOLVisualCheckActive"), true);
    assert.equal(doc.focused, em.FindChildTraverse("QOLVisualCheck"));
    // Restoration of one damaged native panel must not strand the rest.
    const damaged = doc.create("Panel", { id: "DamagedMenuChild" });
    em.addChild(damaged);
    api.stop();
    assert.equal(doc.focused, window);
    assert.equal(api.start(), true);
    damaged.RemoveClass = () => { throw new Error("Panel was freed"); };
    api.stop();
    assert.equal(root.BHasClass("QOLVisualCheckActive"), false);
    assert.equal(em.BHasClass("QOLVisualCheckActive"), false);
    assert.equal(window.BHasClass("QOLVisualCheckHidden"), false);
    assert.equal(window.style.visibility, visibility);
    assert.equal(doc.focused, window);
    clock.advance(600);
    assert.equal(em.FindChildTraverse("QOLVisualCheck"), null);
    assert.deepEqual(clock.errors, []);
    assert.deepEqual(doc.eventErrors, []);
    assert.ok(hud);
});

test("A/B and back navigation release native style overrides repeatedly", () => {
    const { global: g, em, doc, clock } = setup();
    const panel = doc.create("Panel", { id: "gold_and_ap_container" });
    g.QOL.core.persistence.resolveHudPanel(g.QOL.core.persistence.getUIRoot()).addChild(panel);
    // Model native style storage: JS delete/null/empty do not release C++ overrides.
    const values = {};
    panel.style = new Proxy(values, {
        set(target, key, value) { if (value !== null && value !== "") target[key] = value; return true; },
        deleteProperty() { return true; }
    });
    panel.ClearPropertyFromCode = key => { delete values[key]; };
    g.MOD_CONFIG.HUD_SOULS_ENABLED = 1;
    g.MOD_CONFIG.SOULS_X_OFFSET = 0;
    g.MOD_CONFIG.SOULS_Y_OFFSET = 0;
    g.MOD_CONFIG.SOULS_OPACITY = 1;
    const api = g.QOL.ui.visualCheck;
    assert.equal(api.start(), true);
    for (let i = 0; i < 4; i++) api.next();
    clock.advance(1500);
    for (let i = 0; i < 3; i++) {
        em.FindChildTraverse("QOLVisualCheckRepeat")._fire("onactivate");
        clock.advance(1000);
        assert.equal(values.x, "100px");
        assert.equal(values.y, "-80px");
        assert.equal(values.opacity, "0.50");
        em.FindChildTraverse("QOLVisualCheckBack")._fire("onactivate");
        clock.advance(1000);
        assert.equal(values.x, undefined);
        assert.equal(values.y, undefined);
        assert.equal(values.opacity, undefined);
    }
    api.next();
    clock.advance(1000);
    api.next();
    clock.advance(1000);
    assert.equal(values.opacity, undefined, "leaving the group restores native opacity");
    api.stop();
    assert.deepEqual(clock.errors, []);
});

test("gameplay mode retains the step across resume and reopening without saving", () => {
    const { global: g, em, clock, doc } = setup();
    const original = JSON.stringify(g.MOD_CONFIG);
    const api = g.QOL.ui.visualCheck;
    assert.equal(api.start(), true);
    // Item buy notifications, changed state.
    for (let i = 0; i < 27; i++) api.next();
    const stepText = em.FindChildTraverse("QOLVisualCheckText").text;
    let saves = 0;
    g.QOL.core.storageBridge.saveSettings = () => { saves++; };
    em.FindChildTraverse("QOLVisualCheckPlay")._fire("onactivate");
    clock.advance(3000);
    assert.equal(api.isRunning(), true);
    assert.equal(em.FindChildTraverse("SettingsWindow").BHasClass("Visible"), false);
    assert.equal(em.FindChildTraverse("QOLVisualCheck").visible, false);
    assert.equal(em.FindChildTraverse("SettingsWindow").BHasClass("QOLVisualCheckHidden"), false);
    assert.equal(em.BHasClass("QOLVisualCheckActive"), false, "native menu navigation is restored during gameplay");
    assert.equal(g.MOD_CONFIG.ENABLE_SHOP_ITEM_NOTIFICATIONS, 1);
    assert.equal(g.MOD_CONFIG.RECENT_PURCHASES_QUICK_OPACITY, 0.5);
    g.QOL.ui.window.setOpen(true);
    assert.equal(em.FindChildTraverse("SettingsWindow").BHasClass("QOLVisualCheckHidden"), true, "no editable temporary settings on reopen");
    clock.advance(600);
    assert.equal(em.FindChildTraverse("QOLVisualCheck").visible, true);
    assert.equal(em.FindChildTraverse("QOLVisualCheckText").text, stepText);
    api.stop();
    clock.advance(600);
    assert.equal(JSON.stringify(g.MOD_CONFIG), original);
    assert.equal(saves, 0);
    assert.deepEqual(clock.errors, []);
    assert.deepEqual(doc.eventErrors, []);
});

test("deleting the card during gameplay still restores the original config", () => {
    const { global: g, em, clock } = setup();
    const original = JSON.stringify(g.MOD_CONFIG);
    const api = g.QOL.ui.visualCheck;
    assert.equal(api.start(), true);
    api.next();
    em.FindChildTraverse("QOLVisualCheckPlay")._fire("onactivate");
    em.FindChildTraverse("QOLVisualCheck").DeleteAsync(0);
    clock.advance(700);
    assert.equal(api.isRunning(), false);
    assert.equal(JSON.stringify(g.MOD_CONFIG), original);
    assert.equal(em.BHasClass("QOLVisualCheckActive"), false);
    assert.deepEqual(clock.errors, []);
});
