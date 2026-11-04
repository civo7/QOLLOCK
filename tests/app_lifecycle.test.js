"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function publish(env, panel, patch, revision) {
    const Q = env.sandbox.global.QOL;
    const config = { ...Q.core.ConfigAdapter.exportToFlat(), ...patch };
    const raw = env.sandbox.global.WrapConfigForStorage(config);
    panel.SetAttributeString("Deadlock_Mod_Settings_v1", raw);
    panel.SetAttributeString("QOL_USER_EDIT_REV", String(revision));
    return raw;
}

test("App follows new configuration ancestors of a still-live HUD", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    env.clock.advance(300);
    const outer = $.CreatePanel("Panel", null, "NewWindowRoot");
    env.root.SetParent(outer);
    publish(env, outer, { HEALTHBAR_TYPE: 5 }, 99);
    env.clock.advance(300);
    assert.equal(Q.core.ConfigAdapter.exportToFlat().HEALTHBAR_TYPE, 5);
    assert.deepEqual(env.clock.errors, []);
});

test("App publishes requested diagnostics without serializing periodic idle snapshots", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const set = env.root.SetAttributeString.bind(env.root);
    let snapshots = 0;
    env.root.SetAttributeString = (key, value) => {
        if (key === "QOL_Diag") snapshots++;
        return set(key, value);
    };
    env.clock.advance(11000);
    assert.equal(snapshots, 0);
    env.root.SetAttributeString("QOL_DiagRequest", "review_snapshot");
    env.clock.advance(300);
    assert.equal(snapshots, 1);
    env.clock.advance(6000);
    assert.equal(snapshots, 1);
    assert.deepEqual(env.clock.errors, []);
});

test("App teardown cannot overwrite the replacement HUD's newer configuration", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    const next = env.doc.create("CitadelHud", { id: "Hud" });
    const freshType = Q.core.ConfigAdapter.exportToFlat().HEALTHBAR_TYPE === 5 ? 1 : 5;
    const fresh = publish(env, next, { HEALTHBAR_TYPE: freshType }, 99);
    $.GetContextPanel = () => next;
    env.root.DeleteAsync(0); env.clock.advance(0);
    Q.core.App.boot();
    assert.equal(next.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
    assert.equal(next.GetAttributeString("QOL_USER_EDIT_REV", ""), "99");
    assert.equal(Q.core.ConfigAdapter.exportToFlat().HEALTHBAR_TYPE, freshType);
    assert.equal(Q.core.App.getHud(), next);
    assert.deepEqual(env.clock.errors, []);
});

test("App shutdown preserves an unconsumed settings publication on the current HUD", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const Q = env.sandbox.global.QOL;
    const fresh = publish(env, env.root, { HEALTHBAR_TYPE: 5 }, 99);
    Q.core.App.shutdown();
    assert.equal(env.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
    Q.core.App.boot();
    assert.equal(Q.core.ConfigAdapter.exportToFlat().HEALTHBAR_TYPE, 5);
    assert.deepEqual(env.clock.errors, []);
});

for (const reason of ["errors", "explicit", "failed-enable"]) {
    test(`App config reconciliation preserves runtime retirement after ${reason}`, () => {
        const env = createHud({ inHideout: false }); env.assertLoaded();
        const Q = env.sandbox.global.QOL, registry = Q.core.FeatureRegistry;
        if (reason === "errors") {
            for (let i = 0; i < 10; i++) Q.core.EventBus.emit("scheduler:error", { featureId: "ql_healthbar", message: "modeled error" });
        } else {
            registry.disable("ql_healthbar");
            if (reason === "failed-enable") {
                const manifest = registry.getManifest("ql_healthbar"), create = manifest.create;
                manifest.create = () => ({ onEnable() { throw Error("modeled setup failure"); }, onDisable() {} });
                registry.enable("ql_healthbar"); manifest.create = create;
            }
        }
        assert.equal(registry.isEnabled("ql_healthbar"), false);
        const stored = Q.core.ConfigAdapter.exportToFlat();
        const accent = (stored.PLAYER_HEALTHBAR_ACCENT_COLOR + 1) % 30;
        publish(env, env.root, { ENABLE_COMPASS: stored.ENABLE_COMPASS ? 0 : 1, PLAYER_HEALTHBAR_ACCENT_COLOR: accent }, 99);
        env.clock.advance(300);
        assert.equal(registry.isEnabled("ql_healthbar"), false, "unrelated and same-owner appearance edits cannot restart a retired feature");
        assert.equal(Q.core.ConfigAdapter.exportToFlat().PLAYER_HEALTHBAR_ACCENT_COLOR, accent);
        registry.enable("ql_healthbar");
        assert.equal(registry.isEnabled("ql_healthbar"), true, "explicit retry restores the owner");
        assert.deepEqual(env.clock.errors, []);
    });
}

test("a deliberate off/on setting transition and a new App session can retry an auto-disabled owner", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const Q = env.sandbox.global.QOL, registry = Q.core.FeatureRegistry;
    publish(env, env.root, { ENABLE_COMPASS: 1 }, 98); env.clock.advance(300);
    for (let i = 0; i < 10; i++) Q.core.EventBus.emit("scheduler:error", { featureId: "ql_compass", message: "modeled error" });
    assert.equal(registry.isEnabled("ql_compass"), false);
    publish(env, env.root, { ENABLE_COMPASS: 0 }, 99); env.clock.advance(300);
    publish(env, env.root, { ENABLE_COMPASS: 1 }, 100); env.clock.advance(300);
    assert.equal(registry.isEnabled("ql_compass"), true);
    registry.disable("ql_compass"); Q.core.App.shutdown(); Q.core.App.boot();
    assert.equal(registry.isEnabled("ql_compass"), true, "runtime retirement ends with its session");
    assert.deepEqual(env.clock.errors, []);
});

for (const rejectCancellation of [false, true]) {
    test(`App reboot owns one config poll with a zero native handle and cancellation rejected=${rejectCancellation}`, () => {
        const env = createHud({ inHideout: false, boot: false }), g = env.sandbox.global;
        const appScript = env.scripts.scripts.find(script => script.absPath.endsWith("ql_app.js"));
        for (const script of env.scripts.scripts) if (script !== appScript) env.sandbox.load(script.absPath);
        const schedule = g.$.Schedule, cancel = g.$.CancelScheduled;
        let zeroHandle, pollCalls = 0, zeroCancels = 0;
        g.$.Schedule = (delay, callback) => {
            const isAppPoll = callback.name === "poll";
            const handle = schedule(delay, () => { if (isAppPoll) pollCalls++; callback(); });
            if (isAppPoll && zeroHandle === undefined) { zeroHandle = handle; return 0; }
            return handle;
        };
        g.$.CancelScheduled = handle => {
            if (handle === 0) {
                zeroCancels++;
                if (rejectCancellation) throw Error("modeled cancellation failure");
                return cancel(zeroHandle);
            }
            return cancel(handle);
        };
        env.sandbox.load(appScript.absPath); env.assertLoaded();
        g.QOL.core.App.shutdown(); g.QOL.core.App.boot();
        env.clock.advance(1000);
        assert.equal(pollCalls, rejectCancellation ? 5 : 4, "a retired callback may be delivered once but cannot reschedule itself");
        const before = pollCalls;
        env.clock.advance(1000);
        assert.equal(pollCalls - before, 4, "only one ongoing App poll remains");
        assert.ok(zeroCancels > 0);
        assert.deepEqual(env.clock.errors, []);
    });
}
