"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { Sandbox } = require("../scripts/simulator/sandbox");

function setup({ nativeRandom } = {}) {
    const sandbox = new Sandbox();
    if (nativeRandom !== undefined) {
        // Exercise the client branch while retaining the virtual Date closure.
        sandbox.eval("delete globalThis.__hostNowMs; Math.random = () => " + nativeRandom);
    }
    let now = 0;
    let nextHandle = 0;
    const pending = new Map();
    sandbox.global.QOL = { core: {} };
    sandbox.global.QOL_UTILS = {
        PerfNowMs: () => now,
        IsPanelValid: panel => panel.IsValid()
    };
    sandbox.global.$.Schedule = (delay, cb) => {
        const handle = nextHandle++;
        pending.set(handle, { at: now + delay * 1000, cb });
        return handle;
    };
    sandbox.global.$.CancelScheduled = handle => pending.delete(handle);
    sandbox.load(path.resolve(__dirname, "../panorama/scripts/core/ql_scheduler.js"));
    assert.deepEqual(sandbox.loadErrors, []);
    return {
        S: sandbox.global.QOL.core.Scheduler, pending,
        cost(ms) { now += ms; },
        fire(handle, late = 0) {
            const task = pending.get(handle);
            pending.delete(handle);
            now = task.at + late;
            task.cb();
        }
    };
}

for (const random of [0, 0.5, 0.999]) {
    test(`client poll jitter stays proportional across ticks and rescheduling, random=${random}`, () => {
        const env = setup({ nativeRandom: random });
        let calls = 0;
        const loop = env.S.createPollLoop(() => { calls++; }, 0.5, "jitter");
        env.fire(0);
        const firstDelay = env.pending.get(1).at - random * 250;
        assert.ok(Math.abs(firstDelay - 500 * (0.9 + random * 0.2)) < 0.00001);
        loop.reschedule(1);
        const secondAt = env.pending.get(1).at;
        env.fire(1);
        assert.ok(Math.abs(env.pending.get(2).at - secondAt - 1000 * (0.9 + random * 0.2)) < 0.00001);
        loop.stop();
        assert.equal(env.pending.size, 0);
        assert.equal(calls, 2);
    });
}

test("work observation separates delivery delay, callback cost, errors and outstanding tasks", () => {
    const env = setup();
    const observation = env.S.startWorkObservation();
    const poll = env.S.createPollLoop(() => env.cost(7), 0.5, "poller");
    env.S.scheduleOnce(() => { env.cost(3); throw new Error("observed"); }, 1, "deferred");
    assert.equal(env.pending.size, 2, "observer does not schedule extra work");
    env.fire(0, 120);
    env.fire(1, 40);
    const sample = observation.sample();
    assert.equal(sample.callbacks, 2);
    assert.equal(sample.callbackMs, 10);
    assert.equal(sample.maxCallbackMs, 7);
    assert.equal(sample.maxDelayMs, 120);
    assert.equal(sample.errors, 1);
    assert.equal(sample.activePolls, 1);
    assert.equal(sample.pendingOnce, 0);
    assert.equal(observation.sample().callbacks, 0, "window counters drain");
    poll.stop();
    const rows = observation.stop();
    const row = rows.find(r => r.id === "poller");
    assert.equal(row.polls, 1);
    assert.equal(row.peakPolls, 1);
    assert.equal(row.endPolls, 0);
    assert.equal(rows.find(r => r.id === "deferred").once, 1);
    assert.equal(env.pending.size, 0);
});

test("census distinguishes multiple polls from deferred work and handles cancellation of zero", () => {
    const env = setup();
    const first = env.S.createPollLoop(() => {}, 0.5, "feature");
    const observation = env.S.startWorkObservation();
    env.S.createPollLoop(() => {}, 0.5, "feature");
    env.S.scheduleOnce(() => {}, 10, "feature");
    assert.equal(observation.sample().activePolls, 2);
    first.stop();
    assert.equal(env.pending.has(0), false);
    env.S.cancelAllForFeature("feature");
    const row = observation.stop().find(r => r.id === "feature");
    assert.equal(row.startPolls, 1);
    assert.equal(row.peakPolls, 2);
    assert.equal(row.peakOnce, 1);
    assert.equal(row.endPolls, 0);
    assert.equal(row.endOnce, 0);
    assert.equal(env.pending.size, 0);
});

test("replacing/stopping observation freezes old results without stopping production work", () => {
    const env = setup();
    const first = env.S.startWorkObservation();
    const poll = env.S.createPollLoop(() => env.cost(2), 1, "feature");
    env.fire(0);
    const second = env.S.startWorkObservation();
    const frozen = JSON.stringify(first.stop());
    first.stop();
    env.fire(1);
    assert.equal(second.sample().callbacks, 1, "old stop cannot stop new observer");
    second.stop();
    env.fire(2);
    assert.equal(JSON.stringify(first.stop()), frozen);
    assert.equal(second.stop().find(r => r.id === "feature").polls, 1);
    poll.stop();
});

test("observation bounds owner cardinality and preserves overflow totals", () => {
    const env = setup();
    const observation = env.S.startWorkObservation();
    for (let i = 0; i < 200; i++) env.S.scheduleOnce(() => {}, 0, `owner_${i}`);
    assert.equal(observation.sample().pendingOnce, 200);
    for (let i = 0; i < 200; i++) env.fire(i);
    const rows = observation.stop();
    assert.equal(rows.length, 128);
    assert.equal(rows.reduce((total, row) => total + row.once, 0), 200);
});

test("observation retains the anonymous owner after reaching its row limit", () => {
    const env = setup();
    const observation = env.S.startWorkObservation();
    env.S.scheduleOnce(() => {}, 0);
    env.fire(0);
    for (let i = 0; i < 126; i++) env.S.scheduleOnce(() => {}, 0, `owner_${i}`);
    env.S.scheduleOnce(() => {}, 0);
    env.S.scheduleOnce(() => {}, 0, "");
    env.S.scheduleOnce(() => {}, 0, "overflow");
    for (let i = 1; i <= 129; i++) env.fire(i);
    const rows = observation.stop();
    assert.equal(rows.length, 128);
    assert.equal(rows.find(row => row.id === "<anonymous>").once, 3);
    assert.equal(rows.find(row => row.id === "<other>").once, 1);
    assert.equal(rows.reduce((total, row) => total + row.once, 0), 130);
});

test("diagnostic poll pause retains tasks, excludes one-shots and resumes on observation stop", () => {
    const env = setup();
    const observation = env.S.startWorkObservation();
    let selected = 0, other = 0, once = 0;
    env.S.createPollLoop(() => selected++, 0.5, "selected");
    env.S.createPollLoop(() => other++, 0.5, "other");
    env.S.scheduleOnce(() => once++, 0, "selected");
    assert.equal(typeof observation.pausePolling, "function");
    observation.pausePolling(["selected"]);
    env.fire(0); env.fire(1); env.fire(2);
    assert.equal(selected, 0);
    assert.equal(other, 1);
    assert.equal(once, 1);
    assert.equal(observation.sample().activePolls, 2, "paused polls remain registered");
    observation.pausePolling([]);
    env.fire(3);
    assert.equal(selected, 1);
    observation.pausePolling(["selected"]);
    observation.stop();
    env.fire(5);
    assert.equal(selected, 2, "stopping observation cannot strand a production loop");
    env.S.cancelAllForFeature("selected"); env.S.cancelAllForFeature("other");
    assert.equal(env.pending.size, 0);
});

test("a superseded observer cannot pause production or unpause its successor", () => {
    const env = setup();
    let calls = 0;
    env.S.createPollLoop(() => calls++, 1, "selected");
    const old = env.S.startWorkObservation();
    assert.equal(typeof old.pausePolling, "function");
    old.pausePolling(["selected"]);
    const current = env.S.startWorkObservation();
    assert.equal(old.isActive(), false);
    current.pausePolling(["selected"]);
    old.pausePolling([]); old.stop();
    env.fire(0);
    assert.equal(calls, 0);
    current.stop();
    assert.throws(() => old.pausePolling(["selected"]), /retired/);
    env.fire(1);
    assert.equal(calls, 1);
    env.S.cancelAllForFeature("selected");
});
