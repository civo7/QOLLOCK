"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

function setup() {
    const env = load();
    const Q = env.hud.sandbox.global.QOL;
    const root = Q.core.hud.findHud();
    // HUD XML places TopBar and gameplay_hud beside each other under HudCore.
    const core = env.doc.create("Panel", { id: "TopbarTestCore", classes: ["HudCore"] });
    root.addChild(core);
    const gameplay = env.doc.create("Panel", { id: "gameplay_hud" });
    core.addChild(gameplay);
    const top = env.doc.create("CitadelHudTopBar", { id: "TopBar" });
    core.addChild(top);
    Q.setCachedPanel?.("gameplayHud", gameplay);
    env.global.QOL.ui.window.setOpen(true);
    env.clock.advance(600);
    return { ...env, Q, root, core, gameplay, top };
}

function publish(env, values) {
    Object.assign(env.global.MOD_CONFIG, { HUD_TOP_BAR_ENABLED: 1 }, values);
    const p = env.global.QOL.core.persistence;
    p.markConfigEdited(p.getUIRoot());
    p.writeStorageConfigRawToUi(p.getUIRoot(), env.global.WrapConfigForStorage(env.global.MOD_CONFIG));
    env.clock.advance(1500);
}

const changed = { TOP_BAR_X_OFFSET: 100, TOP_BAR_Y_OFFSET: -80, TOP_BAR_SCALE: 0.8, TOP_BAR_OPACITY: 0.5 };
function expectChanged(top) {
    assert.equal(top.style.x, "100px");
    assert.equal(top.style.y, "80px");
    assert.equal(top.style.uiScale, "80%");
    assert.equal(top.style.opacity, "0.50");
}

test("topbar: walkthrough applies geometry through the actual config bridge while Escape is open", () => {
    const env = setup();
    env.root.AddClass("ShowEscapeMenu");
    assert.equal(env.global.QOL.ui.visualCheck.start(), true);
    env.global.QOL.ui.visualCheck.next();
    env.clock.advance(1500);
    expectChanged(env.top);
    env.global.QOL.ui.visualCheck.stop();
    env.clock.advance(1500);
    for (const key of ["x", "y", "uiScale", "opacity"]) assert.equal(env.top.style[key], undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("topbar: an unset opacity is not zero and a hidden gameplay sibling is not a hidden topbar", () => {
    const env = setup();
    env.core.style.opacity = "";
    env.gameplay.style.opacity = "0";
    publish(env, changed);
    expectChanged(env.top);
    env.core.style.opacity = "0";
    env.clock.advance(1000);
    assert.equal(env.top.style.x, undefined, "an actually suppressed ancestor retains its native presentation");
    env.core.style.opacity = "";
    env.clock.advance(1000);
    expectChanged(env.top);
    assert.deepEqual(env.clock.errors, []);
});

test("topbar: replacement panel receives unchanged settings and defaults release overrides", () => {
    const env = setup();
    publish(env, changed);
    expectChanged(env.top);
    env.top.DeleteAsync(0);
    env.clock.advance(1);
    const replacement = env.doc.create("CitadelHudTopBar", { id: "TopBar" });
    env.core.addChild(replacement);
    env.clock.advance(1000);
    expectChanged(replacement);
    publish(env, { TOP_BAR_X_OFFSET: 0, TOP_BAR_Y_OFFSET: 0, TOP_BAR_SCALE: 1, TOP_BAR_OPACITY: 1 });
    for (const key of ["x", "y", "uiScale", "preTransformScale2d", "opacity"]) assert.equal(replacement.style[key], undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("topbar: hideout settings and Default preset update the live bar", () => {
    const env = setup();
    env.root.AddClass("InHideout");
    env.root.AddClass("ShowEscapeMenu");
    publish(env, changed);
    expectChanged(env.top);
    assert.equal(env.global.QOL.ui.presets.applyPresetByName("Default"), true);
    env.clock.advance(1500);
    for (const key of ["x", "y", "uiScale", "opacity"]) assert.equal(env.top.style[key], undefined);
    env.root.RemoveClass("InHideout");
    env.root.RemoveClass("ShowEscapeMenu");
    env.clock.advance(1000);
    for (const key of ["x", "y", "uiScale", "opacity"]) assert.equal(env.top.style[key], undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("topbar: takeover still releases styles and restores them when visible", () => {
    const env = setup();
    publish(env, changed);
    expectChanged(env.top);
    env.root.AddClass("HudTakeoverEnabled");
    env.clock.advance(1000);
    assert.equal(env.top.style.uiScale, undefined);
    env.root.RemoveClass("HudTakeoverEnabled");
    env.clock.advance(1000);
    expectChanged(env.top);
});
