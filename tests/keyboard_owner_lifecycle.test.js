"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup(overrides = {}) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_KEYBOARD_OVERLAY: 1, ...overrides });
    const cfg = Q.core.ConfigStore.view("ql_keyboard");
    let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest("ql_keyboard").create({ id: "ql_keyboard", config: { view() { reads++; return cfg; } } });
    const add = (parent, id, classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id);
        for (const name of classes) panel.AddClass(name);
        return panel;
    };
    const core = add(env.root, "CoreFixture", ["HudCore"]);
    const gameplay = add(core, "gameplay_hud");
    const bindingActions = new Map(), create = $.CreatePanel;
    $.CreatePanel = (type, parent, id, props) => {
        const panel = create(type, parent, id, props);
        if (type === "CitadelBinding") bindingActions.set(panel, props.action);
        return panel;
    };
    return { ...env, Q, $, cfg, feature, add, core, gameplay, reads: () => reads,
        bindingActions,
        overlay: () => gameplay.FindChild("QOLKeyboardOverlayRoot"),
        box: () => gameplay.FindChildTraverse("AllBindingsBox") };
}

test("keyboard keeps both native binding layouts and reacts to geometry/palette/RGB settings without idle config reads", () => {
    const env = setup({ KEYBOARD_OVERLAY_SCALE: 150, KEYBOARD_OVERLAY_X_OFFSET: -1999, KEYBOARD_OVERLAY_Y_OFFSET: -1999, KEYBOARD_OVERLAY_WASH_COLOR: 4 });
    env.feature.onEnable();
    const box = env.box(), base = box.FindChildrenWithClassTraverse("KeyboardLayoutBase")[0], full = box.FindChildrenWithClassTraverse("KeyboardLayoutFull")[0];
    const actions = layout => layout.FindChildrenWithClassTraverse("Key").filter(panel => panel.paneltype === "CitadelBinding").map(panel => env.bindingActions.get(panel));
    assert.deepEqual(actions(base), ["AbilityMelee", "MoveForward", "Attack", "ADS", "Roll", "MoveLeft", "MoveBackwards", "MoveRight", "HeldItem", "Crouch", "Mantle"]);
    assert.deepEqual(actions(full), ["Ability1", "Ability2", "Ability3", "Ability4", "Attack", "ADS", "Scoreboard", "AbilityMelee", "MoveForward", "Cosmetic1", "Reload", "MoveLeft", "MoveBackwards", "MoveRight", "HeldItem", "Roll", "Item1", "Item2", "Item3", "Item4", "Crouch", "ExtraInfo", "Mantle"]);
    assert.equal(base.Children().length, 3); assert.equal(full.Children().length, 5);
    assert.equal(box.style.marginLeft, "150px"); assert.equal(box.style.x, "-1999px"); assert.equal(box.style.y, "1999px");
    assert.equal(base.FindChildrenWithClassTraverse("SpaceKey")[0].style.width, "288px");
    assert.equal(env.overlay().style.washColor, "#ff3b47");
    Object.assign(env.cfg, { ENABLE_FULL_KEYBOARD_LAYOUT: true, KEYBOARD_OVERLAY_SCALE: 70, KEYBOARD_OVERLAY_WASH_COLOR: env.Q.utils.EncodeHexColor("#010203") });
    env.feature.onSettingsChanged();
    assert.equal(box.style.marginLeft, "70px"); assert.equal(full.FindChildrenWithClassTraverse("SpaceKey")[0].style.width, "93px");
    assert.equal(env.overlay().style.washColor, "#010203");
    env.cfg.KEYBOARD_OVERLAY_WASH_COLOR = 0; env.feature.onSettingsChanged();
    assert.equal(env.overlay().style.washColor, undefined);
    env.clock.advance(2000); assert.equal(env.reads(), 3);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard discovers late and replaced native glyphs at unchanged settings and releases glyphs moved out of the overlay", () => {
    const env = setup({ KEYBOARD_OVERLAY_SCALE: 150 }); env.feature.onEnable();
    const binding = env.box().FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    const label = env.add(binding, "KeyboardLetter", [], "Label"), mouse = env.add(binding, "MouseButtonImage", ["MouseButtonGlyph"]);
    label.style.color = "#ABCDEF"; mouse.style.opacity = "0.6";
    env.clock.advance(250);
    assert.equal(label.style.fontSize, "24px"); assert.equal(label.style.lineHeight, "0px");
    assert.equal(mouse.style.width, "30px"); assert.equal(mouse.style.backgroundTextureSize, "30px 30px");
    const retired = env.add(null, "RetiredNativeGlyphs"); label.SetParent(retired); mouse.SetParent(retired);
    const next = env.add(binding, "ModifierCombinerLabel", ["ModifierCombinerLabel"], "Label"); env.clock.advance(250);
    assert.equal(label.style.fontSize, undefined); assert.equal(mouse.style.width, undefined);
    assert.equal(label.style.color, "#ABCDEF"); assert.equal(mouse.style.opacity, "0.6");
    assert.equal(label.IsValid(), true); assert.equal(mouse.IsValid(), true); assert.equal(next.style.fontSize, "24px");
    const role = env.add(binding, "ReusedMouseImage", ["MouseButtonGlyph"]); env.clock.advance(250);
    assert.equal(role.style.width, "30px"); role.RemoveClass("MouseButtonGlyph"); env.clock.advance(250); assert.equal(role.style.width, undefined);
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("keyboard retries partial glyph/wash writes and suppresses successful idle writes", () => {
    const env = setup({ KEYBOARD_OVERLAY_WASH_COLOR: 4 }); env.feature.onEnable();
    let reject = true, writes = 0;
    const overlay = env.overlay();
    overlay.style = new Proxy({}, { set(target, key, value) { writes++; if (key === "washColor" && reject) throw Error("native wash pending"); target[key] = value; return true; } });
    env.cfg.KEYBOARD_OVERLAY_WASH_COLOR = 5; env.feature.onSettingsChanged(); assert.equal(overlay.style.washColor, undefined);
    assert.equal(overlay.visible, false);
    const label = env.add(env.box(), "KeyboardLetter", [], "Label");
    label.style = new Proxy({}, { set(target, key, value) { writes++; if (key === "fontSize" && reject) throw Error("native glyph pending"); target[key] = value; return true; } });
    env.clock.advance(250); assert.equal(label.style.fontSize, undefined);
    reject = false; env.clock.advance(250); assert.equal(overlay.style.washColor, "#ff6f61"); assert.equal(label.style.fontSize, "16px");
    assert.equal(overlay.visible, true);
    const stableWrites = writes; env.clock.advance(2000); assert.equal(writes, stableWrites);
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("keyboard keeps a failed wash reset hidden until native clearing succeeds", () => {
    const env = setup({ KEYBOARD_OVERLAY_WASH_COLOR: 4 }); env.feature.onEnable();
    const overlay = env.overlay(), clear = overlay.ClearPropertyFromCode.bind(overlay); let reject = true;
    overlay.ClearPropertyFromCode = property => property === "wash-color" && reject ? false : clear(property);
    env.cfg.KEYBOARD_OVERLAY_WASH_COLOR = 0; env.feature.onSettingsChanged();
    assert.equal(overlay.style.washColor, "#ff3b47"); assert.equal(overlay.visible, false);
    reject = false; env.clock.advance(350); assert.equal(overlay.style.washColor, undefined); assert.equal(overlay.visible, true);
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("keyboard follows a still-living replacement gameplay owner and then a new HUD", () => {
    const env = setup(); env.feature.onEnable(); const old = env.overlay();
    env.gameplay.SetParent(env.add(null, "RetiredGameplay"));
    const current = env.add(env.core, "gameplay_hud"); env.clock.advance(250);
    assert.equal(old.IsValid(), false); assert.ok(current.FindChild("QOLKeyboardOverlayRoot"));
    const newHud = env.add(null, "Hud", [], "CitadelHud"), newCore = env.add(newHud, "CoreFixture", ["HudCore"]), next = env.add(newCore, "gameplay_hud");
    const previous = current.FindChild("QOLKeyboardOverlayRoot"); env.doc.root = newHud; env.clock.advance(250);
    assert.equal(previous.IsValid(), false); assert.ok(next.FindChild("QOLKeyboardOverlayRoot"));
    env.feature.onDisable(); env.clock.advance(20); assert.equal(next.FindChild("QOLKeyboardOverlayRoot"), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard repairs a missing/reparented owned layout and cleans every moved owned panel on disable", () => {
    const env = setup(); env.feature.onEnable();
    const old = env.overlay(), row = env.box().FindChildrenWithClassTraverse("KeyboardRow")[0];
    const retired = env.add(null, "RetiredOwnPanels"); row.SetParent(retired); env.clock.advance(500);
    assert.equal(old.IsValid(), false); assert.equal(row.IsValid(), false);
    const current = env.overlay(); assert.ok(current); assert.notEqual(current, old);
    const key = env.box().FindChildrenWithClassTraverse("Key")[0]; key.SetParent(retired);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(key.IsValid(), false); assert.equal(current.IsValid(), false);
    env.feature.onSettingsChanged(); env.clock.advance(2000); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard cleans partial construction before retry and failed registry enable leaves no overlay or callbacks", () => {
    const env = setup(); let reject = true; const create = env.$.CreatePanel;
    env.$.CreatePanel = (type, ...args) => { if (type === "CitadelBinding" && reject) throw Error("binding creation pending"); return create(type, ...args); };
    assert.throws(() => env.feature.onEnable(), /Keyboard overlay panel creation failed/); env.clock.advance(20); assert.equal(env.overlay(), null);
    reject = false; env.feature.onEnable(); assert.ok(env.overlay()); env.feature.onDisable(); env.clock.advance(20);
    reject = true;
    env.Q.core.FeatureRegistry.enable("ql_keyboard");
    env.clock.advance(1000); assert.equal(env.overlay(), null); assert.equal(env.Q.core.FeatureRegistry.isEnabled("ql_keyboard"), false);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_keyboard"), false);
    reject = false; env.Q.core.FeatureRegistry.enable("ql_keyboard"); assert.equal(env.Q.core.FeatureRegistry.isEnabled("ql_keyboard"), true);
    env.Q.core.FeatureRegistry.disable("ql_keyboard"); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard waits for gameplay and ignores obsolete shared caches and helper aliases", () => {
    const env = setup(); env.gameplay.SetParent(env.add(null, "RetiredGameplay"));
    const foreign = env.add(env.root, "ForeignOverlay"); foreign.style.x = "20px";
    env.Q.panelCache.setPanel("keyboardOverlayRoot", foreign); env.Q.panelCache.setPanel("keyboardOverlayBox", foreign);
    env.feature.onEnable(); assert.equal(env.root.FindChild("QOLKeyboardOverlayRoot"), null);
    env.gameplay.SetParent(env.core); env.clock.advance(600); assert.ok(env.overlay());
    for (const key of ["allBindingsBoxes", "keyboardBoxCaches", "keyboardOverlayWashSig"]) assert.equal(Object.hasOwn(env.Q.state, key), false);
    for (const key of ["buildKeyboardOverlayLayouts", "getKeyboardCachedPanels", "resetKeyboardOverlayCaches"]) assert.equal(Object.hasOwn(env.Q, key), false);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(foreign.IsValid(), true); assert.equal(foreign.style.x, "20px"); assert.deepEqual(env.clock.errors, []);
});

test("keyboard retires a foreign previous root and waits for queued deletion during immediate re-enable", () => {
    const env = setup(), old = env.add(env.gameplay, "QOLKeyboardOverlayRoot");
    const child = env.add(old, "PreviousKeyboardChild"); env.feature.onEnable();
    assert.equal(env.overlay(), old); assert.equal(old.visible, false);
    env.clock.advance(350); assert.equal(old.IsValid(), false); assert.equal(child.IsValid(), false);
    const current = env.overlay(); assert.ok(current); assert.equal(current.visible, true);
    env.feature.onDisable(); env.feature.onEnable(); assert.equal(env.overlay(), current); assert.equal(current.visible, false);
    env.clock.advance(350); assert.equal(current.IsValid(), false);
    assert.equal(env.gameplay.Children().filter(panel => panel.id === "QOLKeyboardOverlayRoot").length, 1);
    assert.equal(env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase").length, 1);
    assert.equal(env.box().FindChildrenWithClassTraverse("KeyboardLayoutFull").length, 1);
    env.feature.onDisable(); env.clock.advance(20); env.feature.onSettingsChanged(); env.clock.advance(600);
    assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard retries moved created-child deletion while preserving moved native glyph content", () => {
    const env = setup({ KEYBOARD_OVERLAY_SCALE: 150 }); env.feature.onEnable();
    const key = env.box().FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    const glyph = env.add(key, "KeyboardLetter", [], "Label"); glyph.style.color = "#ABCDEF";
    env.clock.advance(350); assert.equal(glyph.style.fontSize, "24px");
    const detached = env.add(null, "MovedKeyboardContent"); glyph.SetParent(detached); key.SetParent(detached);
    const remove = key.DeleteAsync.bind(key); let reject = true;
    key.DeleteAsync = delay => { if (reject) throw Error("modeled created-key deletion failure"); remove(delay); };
    env.clock.advance(700);
    assert.equal(key.IsValid(), true); assert.equal(key.visible, false); assert.ok(env.overlay());
    assert.equal(glyph.IsValid(), true); assert.equal(glyph.style.fontSize, undefined); assert.equal(glyph.style.color, "#ABCDEF");
    reject = false; env.clock.advance(350); assert.equal(key.IsValid(), false); assert.equal(glyph.IsValid(), true);
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("keyboard rejects a loading-root gameplay lookalike and mounts only the current real HUD", () => {
    const env = setup(); env.feature.onEnable(); const old = env.overlay();
    env.doc.root = env.add(null, "LoadingRoot");
    const loadingCore = env.add(env.doc.root, "", ["HudCore"]), loadingGameplay = env.add(loadingCore, "gameplay_hud");
    env.clock.advance(350); assert.equal(old.IsValid(), false); assert.equal(loadingGameplay.FindChild("QOLKeyboardOverlayRoot"), null);
    const root = env.add(null, "Hud", [], "CitadelHud"), core = env.add(root, "", ["HudCore"]), gameplay = env.add(core, "gameplay_hud");
    env.doc.root = root; env.clock.advance(350);
    assert.ok(gameplay.FindChild("QOLKeyboardOverlayRoot")); assert.equal(env.root.IsValid(), true); assert.equal(env.overlay(), null);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(gameplay.FindChild("QOLKeyboardOverlayRoot"), null);
    assert.deepEqual(env.clock.errors, []);
});
