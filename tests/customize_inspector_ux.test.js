"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

function setup(id = "souls", language = 0) {
    const env = load();
    const g = env.global;
    g.MOD_CONFIG.LANGUAGE = language;
    g.QOL.ui.window.setOpen(true); env.clock.advance(500);
    const element = g.QOL.presentation.elements.find(item => item.id === id);
    const window = env.em.FindChildTraverse("SettingsWindow");
    const session = g.QOL.ui.customizeSession.create(env.doc.root, env.hud.root, window, element);
    const host = g.QOL.core.panel.create("Panel", env.em, "InspectorUXFixture");
    let inspector;
    inspector = g.QOL.ui.customizeInspector.build(host, element, session, options => inspector.sync(options));
    const find = id => host.FindChildTraverse(id);
    const type = (key, text) => {
        const input = find("QOLCustomize_" + key);
        input.text = text; input._fire("ontextentrychange");
        return input;
    };
    return { ...env, session, inspector, find, type, host };
}
function clean(env) {
    env.inspector.dispose(); env.session.close();
    assert.deepEqual(env.doc.eventErrors, []);
    assert.deepEqual(env.clock.errors, []);
}

test("typing previews one burst without Enter; Undo restores the entire burst", () => {
    const env = setup();
    const input = env.type("SOULS_X_OFFSET", "1"); env.clock.advance(100);
    env.type("SOULS_X_OFFSET", "12"); env.clock.advance(100);
    env.type("SOULS_X_OFFSET", "125"); env.clock.advance(299);
    assert.equal(env.session.value("SOULS_X_OFFSET"), 0);
    env.clock.advance(2);
    assert.equal(env.session.value("SOULS_X_OFFSET"), 125);
    assert.equal(env.global.MOD_CONFIG.SOULS_X_OFFSET, 0, "preview remains a transaction");
    assert.equal(input.text, "125");
    assert.equal(env.inspector.hasPending(), false);
    assert.equal(env.session.undo(), true);
    assert.equal(env.session.value("SOULS_X_OFFSET"), 0);
    assert.equal(env.session.canUndo(), false, "no edit per character");
    clean(env);
});

test("incomplete and out-of-range text preserves the accepted preview", () => {
    const env = setup();
    env.type("SOULS_SCALE", "125"); env.clock.advance(301);
    for (const text of ["-", ".", "1.", "abc", "1", "1000"]) {
        const input = env.type("SOULS_SCALE", text); env.clock.advance(301);
        assert.equal(env.session.value("SOULS_SCALE"), 125, text);
        assert.equal(input.text, text);
        assert.equal(input.BHasClass("Invalid"), true);
    }
    assert.equal(env.inspector.commit(), true, "explicit submission retains established clamping");
    assert.equal(env.session.value("SOULS_SCALE"), 200);
    clean(env);
});

test("opacity and ratio scales display percentages while retaining source units", () => {
    const env = setup("topBar");
    assert.equal(env.find("QOLCustomize_TOP_BAR_SCALE").text, "100");
    assert.equal(env.find("QOLCustomize_TOP_BAR_OPACITY").text, "100");
    env.type("TOP_BAR_SCALE", "125");
    env.type("TOP_BAR_OPACITY", "55"); env.clock.advance(301);
    assert.equal(env.session.value("TOP_BAR_SCALE"), 1.25);
    assert.equal(env.session.value("TOP_BAR_OPACITY"), 0.55);
    assert.equal(env.session.undo(), true);
    assert.equal(env.session.value("TOP_BAR_SCALE"), 1);
    assert.equal(env.session.value("TOP_BAR_OPACITY"), 1);
    clean(env);
});

test("live rounding preserves editing text until blur formats the accepted wire value", () => {
    const env = setup();
    const input = env.type("SOULS_X_OFFSET", "123"); env.clock.advance(301);
    assert.equal(env.session.value("SOULS_X_OFFSET"), 125);
    assert.equal(input.text, "123", "preview does not replace the active text or caret");
    input._fire("onblur");
    assert.equal(input.text, "125");
    assert.equal(env.session.undo(), true);
    assert.equal(env.session.canUndo(), false, "formatting creates no duplicate history entry");
    clean(env);
});

test("Reset sync and disposed inspectors cannot reapply a queued value", () => {
    const env = setup();
    const element = env.global.QOL.presentation.elements.find(item => item.id === "souls");
    env.type("SOULS_X_OFFSET", "300");
    env.session.reset(element); env.inspector.sync(); env.clock.advance(400);
    assert.equal(env.session.value("SOULS_X_OFFSET"), 0);
    assert.equal(env.find("QOLCustomize_SOULS_X_OFFSET").text, "0");
    const input = env.type("SOULS_X_OFFSET", "500");
    env.inspector.dispose(); env.clock.advance(400);
    input._fire("onblur");
    assert.equal(env.session.value("SOULS_X_OFFSET"), 0);
    clean(env);
});

test("exact position and presets disclose on demand; numeric steppers honor wire precision", () => {
    const env = setup("items");
    const position = env.find("QOLCustomizePositionBody");
    assert.equal(position.visible, false);
    env.find("QOLCustomizePositionToggle")._fire("onactivate");
    assert.equal(position.visible, true);
    env.find("QOLCustomizeIncrease_ITEMS_X_OFFSET")._fire("onactivate");
    assert.equal(env.session.value("ITEMS_X_OFFSET"), 5);
    env.find("QOLCustomizeDecrease_ITEMS_SCALE")._fire("onactivate");
    assert.equal(env.session.value("ITEMS_SCALE"), 99);
    const palette = env.find("QOLCustomizePalette_ITEMS_WASH_COLOR");
    assert.equal(palette.visible, false);
    env.find("QOLCustomizePaletteToggle_ITEMS_WASH_COLOR")._fire("onactivate");
    assert.equal(palette.visible, true);
    const toggle = env.find("QOLCustomize_HUD_ITEMS_ENABLED");
    assert.equal(toggle.GetParent().id, "QOLCustomizeSelectionHeader");
    assert.equal(toggle.GetChild(0).text, "Visible");
    toggle._fire("onactivate");
    assert.equal(toggle.GetChild(0).text, "Hidden");
    clean(env);
});

test("HEX previews when complete and retains the last color while partially typed", () => {
    const env = setup("items");
    env.type("ITEMS_WASH_COLOR", "#123456"); env.clock.advance(301);
    assert.equal(env.session.value("ITEMS_WASH_COLOR"), 0x1123456);
    const input = env.type("ITEMS_WASH_COLOR", "#123"); env.clock.advance(301);
    assert.equal(env.session.value("ITEMS_WASH_COLOR"), 0x1123456);
    assert.equal(input.text, "#123");
    assert.equal(env.inspector.commit(), false, "Apply must reject incomplete colors");
    env.type("ITEMS_WASH_COLOR", "#123456");
    assert.equal(input.BHasClass("Invalid"), false, "restoring accepted text clears obsolete validation immediately");
    clean(env);
});

test("inverted visibility controls describe the shown result instead of the storage bit", () => {
    const env = setup("damageReport");
    const visibility = env.find("QOLCustomize_DISABLE_DAMAGE_REPORT");
    assert.equal(visibility.GetParent().id, "QOLCustomizeSelectionHeader");
    assert.equal(visibility.GetChild(0).text, "Visible");
    visibility._fire("onactivate");
    assert.equal(env.session.value("DISABLE_DAMAGE_REPORT"), 1);
    assert.equal(visibility.GetChild(0).text, "Hidden");
    clean(env);
});

test("ammo subcomponent toggles cannot claim whole-panel visibility", () => {
    const env = setup("ammo");
    for (const key of ["ENABLE_HIDE_AMMO_ALL", "ENABLE_HIDE_MAGAZINE", "ENABLE_AMMO_STATUS"])
        assert.notEqual(env.find("QOLCustomize_" + key).GetParent().id, "QOLCustomizeSelectionHeader");
    clean(env);
});

test("inspector renders new copy in Russian and incomplete-language fallback", () => {
    for (const [language, visibility, position, palette] of [[1, "Виден", "Точное положение", "Палитра цветов"],
        [13, "Visible", "Exact position", "Color presets"]]) {
        const env = setup("items", language);
        assert.equal(env.find("QOLCustomize_HUD_ITEMS_ENABLED").GetChild(0).text, visibility);
        assert.equal(env.find("QOLCustomizePositionToggle").GetChild(0).text, position);
        assert.equal(env.find("QOLCustomizePaletteToggle_ITEMS_WASH_COLOR").GetChild(0).text, palette);
        clean(env);
    }
});
