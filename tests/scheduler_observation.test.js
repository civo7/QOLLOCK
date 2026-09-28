"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { Sandbox } = require("../scripts/simulator/sandbox");

function setup() {
    const sandbox = new Sandbox();
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
