"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $, GameUI } = env.sandbox.global;
    Q.core.App.shutdown();
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    const feature = (id, cfg = {}) => Q.core.FeatureRegistry.getManifest(id).create({
        id, events: Q.core.EventBus, config: { view: () => cfg }
    });
    const health = () => {
        const core = add(env.root, ""); core.AddClass("HudCore");
        const gameplay = add(core, "gameplay_hud");
        const panel = add(gameplay, "health_and_abilities_container");
        const content = add(panel, "HealthBarContent"), bars = add(content, "hud_health_bars");
        const line = add(bars, ""); line.AddClass("health_bar_line");
        const border = add(line, ""); border.AddClass("health_bar_border");
        const numbers = add(content, "HealthRegenAndTotal");
        const group = add(numbers, ""); group.AddClass("healthContainer");
        return { core, panel, group, frame: add(border, "health_bar_frame") };
    };
    const cursor = () => { GameUI.GetCursorPosition = () => ({ x: 200, y: 300 }); env.doc.root.AddClass("gShopOpen"); };
    return { ...env, Q, add, feature, health, cursor };
}
function rejectWash(panel) {
    const clear = panel.ClearPropertyFromCode.bind(panel);
    let reject = true, calls = 0;
    panel.ClearPropertyFromCode = property => {
        if (property === "wash-color") { calls++; if (reject) return false; }
        return clear(property);
    };
    return { recover() { reject = false; }, calls: () => calls };
}
const cursorClass = "qol_custom_cursor_replace_active";
function rejectCursor(panel) {
    const set = panel.SetHasClass.bind(panel);
    let reject = true, calls = 0;
    panel.SetHasClass = (name, value) => {
        if (name === cursorClass) { calls++; if (!value && reject) return false; }
        return set(name, value);
    };
    return { recover() { reject = false; }, calls: () => calls };
}

test("accent resolves unchanged configuration once while native targets remain reactive", () => {
    const env = setup(), { panel, frame, group } = env.health();
    const accent = env.Q.healthbar.accent.create({ id: "ql_healthbar" });
    const cfg = { PLAYER_HEALTHBAR_ACCENT_COLOR: env.Q.utils.EncodeHexColor("#123ABC") };
    const resolve = env.Q.core.panel.resolvePaletteColor;
    let resolutions = 0;
    env.Q.core.panel.resolvePaletteColor = value => { resolutions++; return resolve(value); };
    accent.update(env.root, cfg, panel); env.clock.advance(20);
    accent.update(env.root, cfg, panel);
    assert.equal(resolutions, 1);
    assert.equal(frame.style.washColor, "#123ABC");
    frame.style.washColor = "native";
    accent.update(env.root, cfg, panel);
    assert.equal(frame.style.washColor, "#123ABC");
    const backer = env.add(group, "LateBacker"); backer.AddClass("healthBacker");
    accent.update(env.root, cfg, panel); env.clock.advance(20);
    assert.equal(backer.style.washColor, "#123ABC");
    assert.equal(resolutions, 1);
    cfg.PLAYER_HEALTHBAR_ACCENT_COLOR = env.Q.utils.EncodeHexColor("#000000");
    accent.update(env.root, cfg, panel); env.clock.advance(20);
    assert.equal(frame.style.washColor, "#000000");
    cfg.PLAYER_HEALTHBAR_ACCENT_COLOR = 0;
    accent.update(env.root, cfg, panel);
    assert.equal(frame.style.washColor, undefined);
    assert.equal(backer.style.washColor, undefined);
    accent.release();
    assert.deepEqual(env.clock.errors, []);
});

test("accent retries rejected native wash retirement after disable, then stops writes", () => {
    const env = setup(), { frame } = env.health();
    const feature = env.feature("ql_healthbar", { HEALTHBAR_TYPE: 0, PLAYER_HEALTHBAR_ACCENT_COLOR: 3 });
    let writes = 0;
    frame.style = new Proxy(frame.style, { set(target, key, value) {
        if (key === "washColor") writes++;
        target[key] = value; return true;
    } });
    feature.onEnable(); env.clock.advance(20); assert.ok(frame.style.washColor);
    const stableWrites = writes; env.clock.advance(1100); assert.equal(writes, stableWrites);
    const rejection = rejectWash(frame); feature.onDisable();
    assert.ok(frame.style.washColor); rejection.recover(); env.clock.advance(300);
    assert.equal(frame.style.washColor, undefined);
    const calls = rejection.calls(); env.clock.advance(2000); assert.equal(rejection.calls(), calls);
    assert.deepEqual(env.clock.errors, []);
});

test("accent releases living replacements and cannot erase rapid re-enable presentation", () => {
    const env = setup(), old = env.health(), cfg = { HEALTHBAR_TYPE: 0, PLAYER_HEALTHBAR_ACCENT_COLOR: 3 };
    const feature = env.feature("ql_healthbar", cfg); feature.onEnable(); env.clock.advance(20);
    const rejection = rejectWash(old.frame); old.core.SetParent(env.add(null, "RetiredHealth"));
    const current = env.health(); feature.onSettingsChanged(); env.clock.advance(20);
    assert.ok(current.frame.style.washColor); assert.equal(old.frame.IsValid(), true);
    rejection.recover(); env.clock.advance(300); assert.equal(old.frame.style.washColor, undefined);
    const currentRejection = rejectWash(current.frame); feature.onDisable();
    const next = env.feature("ql_healthbar", { ...cfg, PLAYER_HEALTHBAR_ACCENT_COLOR: 5 });
    next.onEnable(); env.clock.advance(20); const color = current.frame.style.washColor; assert.ok(color);
    currentRejection.recover(); env.clock.advance(700); assert.equal(current.frame.style.washColor, color);
    next.onDisable(); env.clock.advance(300); assert.equal(current.frame.style.washColor, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("cursor retries native fallback restoration after disable, then stops writes", () => {
    const env = setup(); env.cursor(); const feature = env.feature("ql_mouse_cursor");
    feature.onEnable(); env.clock.advance(100); assert.equal(env.root.BHasClass(cursorClass), true);
    const rejection = rejectCursor(env.root); feature.onDisable();
    rejection.recover(); env.clock.advance(300); assert.equal(env.root.BHasClass(cursorClass), false);
    assert.equal(env.root.FindChild("QOLGameplayMouseCursor"), null);
    const calls = rejection.calls(); env.clock.advance(2000); assert.equal(rejection.calls(), calls);
    assert.deepEqual(env.clock.errors, []);
});

test("cursor releases a living previous HUD and old cleanup preserves a rapid new owner", () => {
    const env = setup(); env.cursor(); const feature = env.feature("ql_mouse_cursor");
    feature.onEnable(); env.clock.advance(100);
    const previous = env.doc.root, oldRejection = rejectCursor(previous);
    env.doc.root = env.add(null, "Hud", "CitadelHud"); env.cursor(); env.clock.advance(100);
    assert.equal(previous.IsValid(), true); assert.equal(env.doc.root.BHasClass(cursorClass), true);
    oldRejection.recover(); env.clock.advance(300); assert.equal(previous.BHasClass(cursorClass), false);
    const rejection = rejectCursor(env.doc.root); feature.onDisable();
    const next = env.feature("ql_mouse_cursor"); next.onEnable(); env.clock.advance(100);
    rejection.recover(); env.clock.advance(500); assert.equal(env.doc.root.BHasClass(cursorClass), true);
    const calls = rejection.calls(); env.clock.advance(500); assert.equal(rejection.calls(), calls);
    next.onDisable(); env.clock.advance(300); assert.equal(env.doc.root.BHasClass(cursorClass), false);
    assert.deepEqual(env.clock.errors, []);
});

test("same controllers reclaim rejected retirement on immediate re-enable", () => {
    const env = setup(), { frame } = env.health(), cfg = { HEALTHBAR_TYPE: 0, PLAYER_HEALTHBAR_ACCENT_COLOR: 3 };
    const health = env.feature("ql_healthbar", cfg);
    env.cursor(); const cursor = env.feature("ql_mouse_cursor");
    health.onEnable(); cursor.onEnable(); env.clock.advance(100);
    const wash = rejectWash(frame), nativeCursor = rejectCursor(env.root);
    health.onDisable(); cursor.onDisable();
    cfg.PLAYER_HEALTHBAR_ACCENT_COLOR = 5;
    health.onEnable(); cursor.onEnable(); env.clock.advance(100);
    const currentColor = frame.style.washColor; assert.ok(currentColor);
    wash.recover(); nativeCursor.recover(); env.clock.advance(700);
    assert.equal(frame.style.washColor, currentColor); assert.equal(env.root.BHasClass(cursorClass), true);
    health.onDisable(); cursor.onDisable(); env.clock.advance(300);
    assert.equal(frame.style.washColor, undefined); assert.equal(env.root.BHasClass(cursorClass), false);
    assert.deepEqual(env.clock.errors, []);
});
test("keyboard component styling leaves moved native glyph overrides untouched on disable", () => {
    const env = setup(), core = env.add(env.root, ""); core.AddClass("HudCore");
    const gameplay = env.add(core, "gameplay_hud");
    const feature = env.feature("ql_keyboard", { ENABLE_KEYBOARD_OVERLAY: 1, KEYBOARD_OVERLAY_SCALE: 150 });
    feature.onEnable();
    const binding = gameplay.FindChildTraverse("AllBindingsBox").FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    const glyph = env.add(binding, "KeyboardLetter", "Label");
    glyph.style.fontWeight = "bold"; glyph.style.fontSize = "19px";
    let clears = 0;
    glyph.ClearPropertyFromCode = () => { clears++; throw Error("foreign font must not be cleared"); };
    env.clock.advance(600);
    const foreign = env.add(env.root, "ReusedNativeGlyph"); glyph.SetParent(foreign);
    feature.onDisable(); env.clock.advance(1000);
    assert.equal(clears, 0); assert.equal(glyph.style.fontSize, "19px");
    assert.equal(glyph.style.fontWeight, "bold"); assert.equal(glyph.IsValid(), true);
    assert.deepEqual(env.clock.errors, []);
});
