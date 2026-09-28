"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../scripts/simulator");

// Exercise real config mapping and the actual manifest. Only the native game
// clock/sound boundary and scheduler delivery are controlled by this fixture.
function createAudioRuntime(config) {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const global = hud.sandbox.global;
    const Q = global.QOL;
    Q.core.FeatureRegistry.shutdown();
    Q.core.ConfigAdapter.loadFromFlat(config);
    const gameClock = global.$.CreatePanel("Label", hud.root, "HudGameTime");
    const sounds = [];
    global.$.DispatchEvent = (name, sound) => {
        if (name === "PlaySoundEffect") sounds.push({ time: gameClock.text, sound });
    };
    let tick;
    Q.core.Scheduler.createPollLoop = callback => {
        tick = callback;
        return { stop() {}, reschedule() {} };
    };
    const manifest = Q.core.FeatureRegistry.getManifest("ql_legacy_audio_passive");
    const context = Q.core.FeatureRegistry.createContext(manifest.id);
    const instance = manifest.create(context);
    instance.onEnable();
    return {
        Q, context, sounds, root: hud.root, gameClock, instance,
        sample(seconds) {
            gameClock.text = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
            tick();
        }
    };
}

for (const hideoutClass of ["connectedToHideout", "InHideout"]) {
    test(`DL4D cleans a visible caption once and never reads a retained clock in ${hideoutClass}`, () => {
        const runtime = createAudioRuntime({ ENABLE_DL4D_REMINDERS: 1, ENABLE_DL4D_CAPTIONS: 1,
            ENABLE_PASSIVE_COOLDOWN: 0, ENABLE_MINIMAP_REMINDER: 1 });
        runtime.sample(105);
        const caption = runtime.root.FindChildTraverse("QOLDL4DCaption");
        assert.ok(caption && runtime.Q.state.dl4dCaptionVisible);
        const soundCount = runtime.sounds.length;
        let text = runtime.gameClock.text;
        let reads = 0;
        let writes = 0;
        Object.defineProperty(runtime.gameClock, "text", {
            get() { reads++; return text; }, set(value) { text = value; }
        });
        caption.style = new Proxy(caption.style, { set(target, key, value) {
            writes++; target[key] = value; return true;
        } });
        runtime.root.AddClass(hideoutClass);
        runtime.sample(285);
        assert.equal(runtime.Q.state.dl4dCaptionVisible, false);
        assert.equal(caption.text, "");
        assert.equal(runtime.sounds.length, soundCount, "cleanup cannot fall through to another reminder");
        const cleanupWrites = writes;
        assert.ok(cleanupWrites > 0);
        for (let i = 0; i < 10; i++) runtime.sample(285);
        assert.equal(reads, 0, "hideout must not consult even a still-valid match clock");
        assert.equal(writes, cleanupWrites, "cached hidden caption is not pending cleanup");
        runtime.root.RemoveClass(hideoutClass);
        runtime.sample(285);
        assert.equal(runtime.Q.state.dl4dCaptionVisible, true);
        assert.equal(runtime.root.FindChildTraverse("QOLDL4DCaption"), caption);
        assert.ok(runtime.sounds.length > soundCount, "normal reminders resume");
    });
}

test("disabling DL4D cleans once then returns to idle despite a cached caption", () => {
    const runtime = createAudioRuntime({ ENABLE_DL4D_REMINDERS: 1, ENABLE_DL4D_CAPTIONS: 1,
        ENABLE_PASSIVE_COOLDOWN: 0 });
    runtime.sample(105);
    runtime.context.config.set("ENABLE_DL4D_REMINDERS", false);
    runtime.sample(200);
    assert.equal(runtime.Q.state.dl4dCaptionVisible, false);
    let reads = 0;
    Object.defineProperty(runtime.gameClock, "text", { get() { reads++; return "03:20"; }, set() {} });
    for (let i = 0; i < 10; i++) runtime.sample(200);
    assert.equal(reads, 0);
    runtime.context.config.set("ENABLE_DL4D_REMINDERS", true);
    runtime.instance.onDisable();
});

test("minimap reminder preserves configured interval through feature mapping and reload", () => {
    const runtime = createAudioRuntime({ ENABLE_MINIMAP_REMINDER: 1, MINIMAP_REMINDER_INTERVAL: 60 });
    assert.equal(runtime.context.config.get("MINIMAP_REMINDER_INTERVAL"), 60);
    for (const seconds of [15, 30, 45, 59, 60, 60, 61, 75, 120]) runtime.sample(seconds);
    assert.deepEqual(runtime.sounds.map(event => event.time), ["01:00", "02:00"]);
    const saved = runtime.Q.core.ConfigAdapter.exportToFlat();
    assert.equal(saved.MINIMAP_REMINDER_INTERVAL, 60);
    const reloaded = createAudioRuntime(saved);
    assert.equal(reloaded.context.config.get("MINIMAP_REMINDER_INTERVAL"), 60);
    reloaded.sample(15);
    reloaded.sample(60);
    assert.deepEqual(reloaded.sounds.map(event => event.time), ["01:00"]);
});

test("minimap reminder keeps the existing 15-second default", () => {
    const runtime = createAudioRuntime({ ENABLE_MINIMAP_REMINDER: 1 });
    assert.equal(runtime.context.config.get("MINIMAP_REMINDER_INTERVAL"), 15);
    runtime.sample(14);
    runtime.sample(15);
    runtime.sample(30);
    assert.deepEqual(runtime.sounds.map(event => event.time), ["00:15", "00:30"]);
});

for (const lead of [0, 15, 30, 60]) {
    test(`buff reminder respects ${lead}-second lead time through config export/reload`, () => {
        const runtime = createAudioRuntime({ ENABLE_INTERVAL: 1, BRIDGE_BUFF_START: lead });
        const saved = runtime.Q.core.ConfigAdapter.exportToFlat();
        assert.equal(saved.BRIDGE_BUFF_START, lead);
        const reloaded = createAudioRuntime(saved);
        assert.equal(reloaded.context.config.get("BRIDGE_BUFF_START"), lead);
        for (let seconds = 239; seconds <= 601; seconds++) reloaded.sample(seconds);
        const expected = [300 - lead, 600 - lead].map(seconds =>
            `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`);
        assert.deepEqual(reloaded.sounds.map(event => event.time), expected);
    });
}
