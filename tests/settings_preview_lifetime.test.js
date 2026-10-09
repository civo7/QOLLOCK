"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

function fixture() {
    const env = load(), g = env.global, api = g.$;
    env.hud.sandbox.global.QOL.core.App.shutdown();
    g.IsSettingsWindowVisible = () => true;
    Object.assign(g.MOD_CONFIG, { PREVIEWS_ENABLED: 1, ENABLE_ZIP_BOOST: 1, ENABLE_CROSSHAIR_STATS: 1, ENABLE_KEYBOARD_OVERLAY: 1 });
    let serial = 0;
    const tasks = new Map(), canceled = [];
    api.Schedule = (delay, callback) => { const id = serial++; tasks.set(id, callback); return id; };
    api.CancelScheduled = id => { canceled.push(id); };
    const show = key => g.QOL.preview.showForConfigId(key);
    return { ...env, g, api, tasks, canceled, show };
}

test("preview deadlines cancel handle zero, bound repeated requests, and reject callbacks after failed cancellation", () => {
    const e = fixture();
    e.api.CancelScheduled = id => { e.canceled.push(id); throw Error("modeled native cancellation failure"); };
    e.show("ENABLE_ZIP_BOOST");
    const panel = e.em.FindChild("ZipBoostPreview"), old = e.tasks.get(0);
    for (let i = 0; i < 50; i++) e.show("ZIP_BOOST_SCALE");
    assert.ok(e.canceled.includes(0));
    assert.equal(e.canceled.length, 50);
    old(); assert.equal(panel.BHasClass("Visible"), true, "stale timer cannot hide a later preview");
    e.g.QOL.preview.hideAll();
    assert.equal(e.canceled.length, 51);
    assert.equal(panel.BHasClass("Visible"), false);
    e.tasks.get(50)(); e.clock.advance(20);
    assert.equal(panel.IsValid(), false);
});

test("complete preview ownership repairs moved and partially created descendants and retires them on close", () => {
    const e = fixture(), create = e.api.CreatePanel;
    let reject = true;
    e.api.CreatePanel = (...args) => {
        if (reject && args[2] === "KeyboardOverlayPreviewKey3") throw Error("modeled partial construction");
        return create(...args);
    };
    e.show("ENABLE_KEYBOARD_OVERLAY");
    const root = e.em.FindChild("KeyboardOverlayPreview");
    assert.equal(root.BHasClass("Visible"), false);
    assert.equal(e.tasks.size, 0, "incomplete preview does not paint or allocate a deadline");
    reject = false; e.show("KEYBOARD_OVERLAY_SCALE");
    assert.equal(root.BHasClass("Visible"), true);
    const sample = root.FindChildTraverse("KeyboardOverlayPreviewSample");
    assert.equal(sample.GetChildCount(), 5);
    const moved = sample.FindChild("KeyboardOverlayPreviewKey2"), orphan = create("Panel", null, "MovedPreviewChildren");
    moved.SetParent(orphan);
    e.show("KEYBOARD_OVERLAY_SCALE");
    assert.equal(moved.visible, false);
    assert.notEqual(sample.FindChild("KeyboardOverlayPreviewKey2"), moved);
    const other = sample.FindChild("KeyboardOverlayPreviewKey1"); other.SetParent(orphan);
    e.g.QOL.preview.hideAll(); e.clock.advance(20);
    for (const panel of [root, sample, moved, other]) assert.equal(panel.IsValid(), false);
    assert.equal(orphan.IsValid(), true);
});

test("preview context replacement retires the living old tree without transferring its hide deadline", () => {
    const e = fixture(); e.show("ENABLE_ZIP_BOOST");
    const old = e.em.FindChild("ZipBoostPreview"), callback = e.tasks.get(0);
    const next = e.api.CreatePanel("Panel", null, "NextSettingsContext");
    e.api.GetContextPanel = () => next;
    e.show("ENABLE_ZIP_BOOST");
    const current = next.FindChild("ZipBoostPreview");
    assert.equal(old.visible, false); assert.equal(current.BHasClass("Visible"), true);
    callback(); assert.equal(current.BHasClass("Visible"), true);
    e.clock.advance(20); assert.equal(old.IsValid(), false);
    e.tasks.get(1)(); assert.equal(current.BHasClass("Visible"), false);
    e.clock.advance(20); assert.equal(current.IsValid(), false);
});

test("preview expiry cleans moved children and a replaced live host while hidden settings allocate nothing", () => {
    const e = fixture(); e.show("ENABLE_CROSSHAIR_STATS");
    const panel = e.em.FindChild("CrosshairStatsPreview"), value = panel.FindChildTraverse("CrosshairStatsPreviewValue_fireRate");
    assert.equal(value.text, "−15%");
    const orphan = e.api.CreatePanel("Panel", null, "OrphanPreview"); value.SetParent(orphan);
    e.tasks.get(0)(); e.clock.advance(20);
    assert.equal(value.IsValid(), false); assert.equal(panel.IsValid(), false);
    e.show("ENABLE_ZIP_BOOST"); const next = e.em.FindChild("ZipBoostPreview");
    e.api.GetContextPanel = () => orphan;
    e.tasks.get(1)(); e.clock.advance(20); assert.equal(next.IsValid(), false);
    e.g.IsSettingsWindowVisible = () => false;
    const created = orphan.GetChildCount(); e.show("UNIT_TARGET_SIZE");
    assert.equal(orphan.GetChildCount(), created);
    assert.deepEqual(e.clock.errors, []);
});
