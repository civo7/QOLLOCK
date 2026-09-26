"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Tests the collector's accounting, not Panorama or any feature's behavior.
function collector(manifests, errors = {}) {
    let time = 0;
    const queue = [];
    const registry = {
        getRegisteredIds: () => Object.keys(manifests),
        getEnabledIds: () => Object.keys(manifests),
        isEnabled: () => true,
        getErrorCounts: () => errors,
        getManifest: id => manifests[id],
        createContext: () => ({})
    };
    const QOL = { core: { FeatureRegistry: registry } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../panorama/scripts/core/ql_manifest_tests.js"), "utf8"), {
        QOL,
        QOL_UTILS: { PerfNowMs: () => time },
        $: { Msg() {}, Schedule: (_delay, cb) => queue.push(cb), GetContextPanel: () => null }
    });
    return {
        api: QOL.core.ManifestTests,
        step: () => queue.shift()?.(),
        drain() { while (queue.length) queue.shift()(); },
        advance: ms => { time += ms; }
    };
}

test("audit preserves failed hooks, skips and runtime errors without executing hooks twice", () => {
    let calls = 0;
    const env = collector({
        observed: { test: () => { calls++; return { passed: true, name: "source label found" }; } },
        failed: { test: () => ({ passed: false, message: "source not found / missing" }) },
        skipped: { test: () => null },
        noHook: {},
        throws: { test: () => { throw new Error("probe exception"); } }
    }, { noHook: 2 });
    const engineAudit = env.api.runEngineAudit();
    env.api.runAll({ token: "audit_example", engineAudit });
    env.drain();
    const result = env.api.getResults();
    assert.equal(calls, 1);
    assert.equal(result.summary.total, 5);
    assert.equal(result.summary.passed, 1);
    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.skipped, 2);
    assert.equal(result.summary.errors, 1);
    assert.equal(result.summary.notRun, 0);
    assert.equal(result.engineAudit.runtimeErrors, 2);
    assert.equal(result.engineAudit.hudFound, false);
    assert.match(result.report, /source not found \/ missing/);
    assert.match(result.report, /probe exception/);
    assert.match(result.report, /noHook/);
    assert.doesNotMatch(result.report, /ALL CHECKS PASSED/);
});

test("deadline retains unexecuted features in coverage totals and exported report", () => {
    const env = collector({ first: { test: () => ({ passed: true }) }, later: { test: () => ({ passed: true }) } });
    env.api.runAll({ token: "timeout" });
    env.step();
    env.advance(2001);
    env.drain();
    const result = env.api.getResults();
    assert.equal(result.aborted, true);
    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.passed, 1);
    assert.equal(result.summary.notRun, 1);
    assert.equal(result.results[1].id, "later");
    assert.equal(result.results[1].notRun, true);
    assert.match(result.report, /later/);
});

test("cancel then restart cannot let a queued old callback overwrite the new report", () => {
    const env = collector({ probe: { test: () => ({ passed: true }) } });
    env.api.runAll({ token: "cancelled" });
    env.api.cancel();
    assert.equal(env.api.getResults().aborted, true);
    assert.equal(env.api.getResults().summary.notRun, 1);
    env.api.runAll({ token: "current" });
    env.drain();
    assert.equal(env.api.getResults().token, "current");
    assert.equal(env.api.getResults().summary.passed, 1);
    assert.equal(env.api.getResults().aborted, false);
});

test("empty registry replaces a previous report rather than leaving stale coverage", () => {
    const manifests = { probe: { test: () => ({ passed: true }) } };
    const env = collector(manifests);
    env.api.runAll({ token: "old" });
    env.drain();
    delete manifests.probe;
    env.api.runAll({ token: "empty" });
    env.drain();
    assert.equal(env.api.getResults().token, "empty");
    assert.equal(env.api.getResults().summary.total, 0);
});
