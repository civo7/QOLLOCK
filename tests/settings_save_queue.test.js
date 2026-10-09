"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const loadSettings = require("./load_settings_environment");

function setup() {
    const env = loadSettings(), g = env.global, writes = [];
    const save = g.SaveAndSync;
    g.SaveAndSync = () => { writes.push(g.MOD_CONFIG.SOULS_X_OFFSET); save(); };
    return { ...env, g, writes };
}

test("settings Flush retires the previous debounce before a new edit starts its own delay", () => {
    const env = setup();
    env.g.MOD_CONFIG.SOULS_X_OFFSET = 70; env.g.MarkConfigDirty(); env.clock.advance(100);
    env.g.FlushPendingSave(); assert.deepEqual(env.writes, [70]);
    env.g.MOD_CONFIG.SOULS_X_OFFSET = 95; env.g.MarkConfigDirty();
    env.clock.advance(200);
    assert.deepEqual(env.writes, [70], "the earlier edit's callback cannot flush the new edit early");
    assert.equal(JSON.parse(env.hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", "")).data.SOULS_X_OFFSET, 70);
    env.clock.advance(100); assert.deepEqual(env.writes, [70, 95]);
    assert.equal(JSON.parse(env.hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", "")).data.SOULS_X_OFFSET, 95);
    env.clock.advance(1000); assert.deepEqual(env.writes, [70, 95]);
    assert.deepEqual(env.clock.errors, []);
});

test("settings owns one pending debounce across repeated edits and direct save supersedes it", () => {
    const env = setup(), schedule = env.g.$.Schedule, cancel = env.g.$.CancelScheduled;
    const pending = new Set();
    env.g.$.Schedule = (delay, callback) => {
        if (delay !== 0.3) return schedule(delay, callback);
        const handle = schedule(delay, () => { pending.delete(handle); callback(); }); pending.add(handle); return handle;
    };
    env.g.$.CancelScheduled = handle => { pending.delete(handle); cancel(handle); };
    for (let i = 0; i < 20; i++) { env.g.MOD_CONFIG.SOULS_X_OFFSET = i; env.g.MarkConfigDirty(); }
    assert.equal(pending.size, 1, "superseded saves must not accumulate inert callbacks");
    env.g.SaveAndSync(); assert.equal(pending.size, 0);
    env.clock.advance(1000); assert.deepEqual(env.writes, [19]);
    env.g.FlushPendingSave(); assert.deepEqual(env.writes, [19]);
    assert.deepEqual(env.clock.errors, []);
});

test("settings debounce handles zero native schedule IDs and ignores callbacks whose cancellation failed", () => {
    const env = setup(), schedule = env.g.$.Schedule, cancel = env.g.$.CancelScheduled, callbacks = [];
    let zeroCancels = 0;
    env.g.$.Schedule = (delay, callback) => { if (delay === 0.3) { callbacks.push(callback); return 0; } return schedule(delay, callback); };
    env.g.$.CancelScheduled = handle => { if (handle === 0) { zeroCancels++; throw Error("native cancellation unavailable"); } cancel(handle); };
    env.g.MOD_CONFIG.SOULS_X_OFFSET = 70; env.g.MarkConfigDirty(); env.g.FlushPendingSave();
    env.g.MOD_CONFIG.SOULS_X_OFFSET = 95; env.g.MarkConfigDirty();
    callbacks[0](); assert.deepEqual(env.writes, [70]);
    callbacks[1](); assert.deepEqual(env.writes, [70, 95]);
    assert.ok(zeroCancels > 0); env.g.FlushPendingSave(); assert.deepEqual(env.writes, [70, 95]);
});

test("settings debounce cannot publish a retired context's edit onto a replacement root", () => {
    const env = setup();
    env.g.MOD_CONFIG.SOULS_X_OFFSET = 70; env.g.MarkConfigDirty();
    const replacement = env.doc.create("CitadelHudEscapeMenu", { id: "ReplacementEscapeMenu" });
    const root = env.doc.create("CitadelHud", { id: "Hud" }); root.addChild(replacement);
    env.g.$.GetContextPanel = () => replacement; env.clock.advance(400);
    assert.deepEqual(env.writes, []); assert.equal(root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), "");
    env.g.MOD_CONFIG.SOULS_X_OFFSET = 95; env.g.MarkConfigDirty(); env.clock.advance(400);
    assert.deepEqual(env.writes, [95]);
    assert.equal(JSON.parse(root.GetAttributeString("Deadlock_Mod_Settings_v1", "")).data.SOULS_X_OFFSET, 95);
    assert.deepEqual(env.clock.errors, []);
});
