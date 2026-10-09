"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const ROOT_ID = "QOLSettingsRowFloatingTooltip";

function fixture() {
    const e = load(), api = e.global.$, tooltip = e.global.QOL.tooltip;
    e.hud.sandbox.global.QOL.core.App.shutdown();
    const add = (parent, id) => api.CreatePanel("Panel", parent, id);
    const row = add(e.list, "HoverRow"); row.actuallayoutheight = 40;
    const other = add(e.list, "OtherRow"); other.actuallayoutheight = 40;
    let serial = 0;
    const tasks = new Map(), canceled = [];
    api.Schedule = (delay, cb) => { const id = serial++; tasks.set(id, { delay, cb }); return id; };
    api.CancelScheduled = id => { canceled.push(id); };
    const show = (anchor = row, options) => tooltip.showRowTooltip(anchor, "", "Tooltip body", "low", "Author", options);
    return { ...e, api, tooltip, add, row, other, tasks, canceled, show };
}

test("tooltip show deadlines cancel zero and rejected native cancellation cannot revive another row", () => {
    const e = fixture();
    e.api.CancelScheduled = id => { e.canceled.push(id); throw Error("modeled cancellation failure"); };
    e.show(); const old = e.tasks.get(0).cb;
    e.show(e.other); assert.ok(e.canceled.includes(0));
    old(); assert.equal(e.tooltip.isVisible(), false);
    e.tasks.get(1).cb(); assert.equal(e.tooltip.isVisible(), true);
    e.tooltip.hideTooltipDeferred(); const hide = [...e.tasks.values()].at(-1).cb;
    e.show(e.other, { immediate: true });
    hide(); assert.equal(e.tooltip.isVisible(), true, "old mouseout cannot hide renewed hover");
    const pending = [...e.tasks.values()]; e.tooltip.hideRowTooltip();
    for (const task of pending) task.cb();
    assert.equal(e.tooltip.isVisible(), false, "close invalidates show, hide, track and settle work");
    assert.deepEqual(e.clock.errors, []);
});

test("tooltip context or living SettingsWindow replacement prevents delayed hover transfer", () => {
    const e = fixture(); e.show(); const delayed = e.tasks.get(0).cb;
    const nextContext = e.add(null, "NextContext"), nextWin = e.add(nextContext, "SettingsWindow");
    const nextRow = e.add(nextWin, "NextRow"); nextRow.actuallayoutheight = 40;
    e.api.GetContextPanel = () => nextContext;
    delayed(); assert.equal(e.tooltip.isVisible(), false);
    e.show(nextRow, { immediate: true });
    const panel = nextContext.FindChild(ROOT_ID); assert.ok(panel); assert.equal(e.tooltip.isVisible(), true);
    const track = [...e.tasks.values()].find(task => task.delay === 0.03).cb;
    nextWin.SetParent(e.add(null, "RetiredWindow"));
    const replacement = e.add(nextContext, "SettingsWindow");
    track(); assert.equal(e.tooltip.isVisible(), false);
    e.clock.advance(20); assert.equal(panel.IsValid(), false);
    e.show(nextRow, { immediate: true });
    assert.equal(e.tooltip.isVisible(), false, "row under a retired living window cannot reopen in the new host");
    assert.equal(replacement.IsValid(), true);
});

test("tooltip repairs partial children, preserves voice styles, and cleans moved children on disposal", () => {
    const e = fixture(), create = e.api.CreatePanel;
    let reject = true;
    e.api.CreatePanel = (...args) => {
        if (reject && args[2] === ROOT_ID + "PerfValue") throw Error("modeled partial creation");
        return create(...args);
    };
    e.show(e.row, { immediate: true });
    const root = e.em.FindChild(ROOT_ID); assert.ok(root); assert.equal(e.tooltip.isVisible(), false);
    reject = false;
    const options = { immediate: true, voiceMeta: { author: "Voice author", voiceActor: "Actor" } };
    e.show(e.row, options); assert.equal(e.tooltip.isVisible(), true);
    const actor = root.FindChildTraverse(ROOT_ID + "VoiceMetaActorValue");
    assert.equal(actor.text, "Actor"); assert.equal(actor.BHasClass("QOLCustomRowTooltipVoiceMetaActorValue"), true);
    const orphan = e.add(null, "DetachedTooltipChildren"); actor.SetParent(orphan);
    e.show(e.row, options);
    const current = root.FindChildTraverse(ROOT_ID + "VoiceMetaActorValue");
    assert.notEqual(current, actor); assert.equal(current.text, "Actor");
    current.SetParent(orphan); e.tooltip.dispose(); e.clock.advance(20);
    for (const panel of [root, actor, current]) assert.equal(panel.IsValid(), false);
    assert.equal(orphan.IsValid(), true);
    assert.deepEqual(e.clock.errors, []);
});

test("tooltip tracking rejects a living moved anchor and stops work after a native paint failure", () => {
    const e = fixture(); e.show(e.row, { immediate: true });
    const track = [...e.tasks.values()].find(task => task.delay === 0.03).cb;
    e.row.SetParent(e.add(null, "PreviousRows"));
    track(); assert.equal(e.tooltip.isVisible(), false);
    e.clock.advance(20);
    const create = e.api.CreatePanel;
    e.api.CreatePanel = (...args) => {
        const panel = create(...args);
        if (args[2] === ROOT_ID + "Text") Object.defineProperty(panel, "text", { configurable: true, get: () => "", set() { throw Error("modeled paint failure"); } });
        return panel;
    };
    const scheduled = e.tasks.size;
    e.show(e.other, { immediate: true });
    assert.equal(e.tooltip.isVisible(), false);
    assert.equal(e.tasks.size, scheduled, "failed content must not allocate tracking/settle tasks");
    e.clock.advance(20); assert.equal(e.em.FindChild(ROOT_ID), null);
    assert.deepEqual(e.clock.errors, []);
});
