"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup(overrides = {}) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_PERF_OVERLAY: 1, ...overrides });
    const cfg = Q.core.ConfigStore.view("ql_perf"); let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest("ql_perf").create({ id: "ql_perf", config: { view() { reads++; return cfg; } } });
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    return { ...env, Q, $, cfg, feature, add, reads: () => reads,
        overlay: () => env.doc.root.FindChild("QOL_PerfOverlay"),
        body: () => env.doc.root.FindChildTraverse("QOL_PerfBody") };
}

test("performance owner reacts immediately, preserves Scheduler samples and derives settings only in hooks", () => {
    const env = setup({ PERF_OVERLAY_OPACITY: 0.85, ENABLE_PERF_DEBUG_DETAIL: 1 });
    const stats = env.Q.state.perfStats = { "mf.sample": { count: 2, total: 8, max: 6, slow: 1 } };
    env.feature.onEnable();
    assert.equal(env.Q.state.perfEnabled, true); assert.equal(env.Q.state.perfDetailed, true);
    assert.equal(env.overlay().style.opacity, "0.85"); assert.match(env.body().text, /mf.sample: 8.0ms  avg 4.0ms  max 6.0ms  n=2/);
    assert.match(env.body().text, /--- Manifests ---\nsample: 8.0ms/);
    env.cfg.PERF_OVERLAY_OPACITY = 0.3; env.feature.onSettingsChanged(); assert.equal(env.overlay().style.opacity, "0.30");
    env.clock.advance(2000); assert.equal(env.reads(), 2); assert.equal(env.Q.state.perfStats, stats);
    env.feature.onDisable(); env.clock.advance(20);
    assert.equal(env.overlay(), null); assert.equal(env.Q.state.perfEnabled, false); assert.equal(env.Q.state.perfDetailed, false);
    assert.equal(env.Q.state.perfStats, stats); assert.deepEqual(env.clock.errors, []);
});

test("performance renderer follows a new living HUD and replaces reparented owned labels", () => {
    const env = setup(); env.feature.onEnable(); const old = env.overlay(), oldBody = env.body();
    const nextHud = env.add(null, "Hud", "CitadelHud"); env.doc.root = nextHud; env.clock.advance(250);
    assert.equal(old.IsValid(), false); assert.equal(oldBody.IsValid(), false); assert.ok(env.overlay());
    const moved = env.body(); moved.SetParent(env.add(null, "RetiredLabels")); env.clock.advance(250);
    assert.equal(moved.IsValid(), false); assert.notEqual(env.body(), moved); assert.match(env.body().text, /ql_perf/);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("performance renderer retires every moved child and waits for the previous instance's queued deletion", () => {
    const env = setup(); env.Q.state.perfStats = { "mf.sample": { count: 2, total: 8, max: 6 } }; env.feature.onEnable();
    const retired = env.add(null, "RetiredOwnedLabels"), children = env.overlay().Children();
    for (const panel of children) panel.SetParent(retired);
    env.clock.advance(250);
    for (const panel of children) assert.equal(panel.IsValid(), false, panel.id);
    assert.match(env.body().text, /mf.sample: 8.0ms/);
    const previous = env.overlay(), moved = env.body(); moved.SetParent(retired); env.feature.onDisable();
    let writes = 0;
    previous.style = new Proxy(previous.style, { set(target, key, value) { writes++; target[key] = value; return true; } });
    const next = env.Q.core.FeatureRegistry.getManifest("ql_perf").create({ id: "ql_perf", config: { view: () => env.cfg } });
    next.onEnable(); next.onSettingsChanged(); assert.equal(writes, 0); assert.equal(previous.visible, false);
    env.clock.advance(250); assert.equal(previous.IsValid(), false); assert.equal(moved.IsValid(), false);
    assert.notEqual(env.overlay(), previous); assert.match(env.body().text, /mf.sample: 8.0ms/);
    next.onDisable(); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("performance renderer waits for a real HUD while configured console collection stays enabled", () => {
    const env = setup({ ENABLE_PERF_DEBUG: 1 }); env.feature.onEnable();
    const previous = env.overlay(), stats = env.Q.state.perfStats;
    env.doc.root = env.add(null, "LoadingRoot"); env.clock.advance(250);
    assert.equal(previous.IsValid(), false); assert.equal(env.overlay(), null);
    assert.equal(env.Q.state.perfEnabled, true); assert.equal(env.Q.state.perfStats, stats);
    env.doc.root = env.add(null, "Hud", "CitadelHud"); env.clock.advance(250); assert.ok(env.overlay());
    env.feature.onDisable(); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("performance renderer retries partial construction/style failures and avoids repeated stable writes", () => {
    const env = setup(); const create = env.$.CreatePanel; let reject = true, writes = 0;
    env.$.CreatePanel = (type, parent, id, props) => {
        if (id === "QOL_PerfBody" && reject) throw Error("body pending");
        const panel = create(type, parent, id, props);
        if (id === "QOL_PerfOverlay") panel.style = new Proxy({}, { set(target, key, value) {
            writes++; if (key === "opacity" && reject) throw Error("opacity pending"); target[key] = value; return true;
        } });
        return panel;
    };
    env.feature.onEnable(); assert.equal(env.body(), null); assert.ok(env.overlay()); assert.equal(env.overlay().visible, false);
    reject = false; env.clock.advance(250); assert.ok(env.body()); assert.equal(env.overlay().style.opacity, "0.75");
    const stable = writes; env.clock.advance(2000); assert.equal(writes, stable);
    reject = true; env.cfg.PERF_OVERLAY_OPACITY = 0.85; env.feature.onSettingsChanged(); assert.equal(env.overlay().style.opacity, "0.75");
    reject = false; env.clock.advance(250); assert.equal(env.overlay().style.opacity, "0.85");
    env.feature.onDisable(); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("performance overlay-only disable removes owned UI while detailed console collection remains alive", () => {
    const env = setup({ ENABLE_PERF_DEBUG_DETAIL: 1 }); env.feature.onEnable(); const old = env.overlay();
    env.cfg.ENABLE_PERF_OVERLAY = false; env.feature.onSettingsChanged(); env.clock.advance(20);
    assert.equal(old.IsValid(), false); assert.equal(env.overlay(), null); assert.equal(env.Q.state.perfEnabled, true);
    env.cfg.ENABLE_PERF_OVERLAY = true; env.feature.onSettingsChanged(); assert.ok(env.overlay()); assert.notEqual(env.overlay(), old);
    env.feature.onDisable(); env.clock.advance(20); env.feature.onSettingsChanged(); env.clock.advance(5000);
    assert.equal(env.overlay(), null); assert.equal(env.Q.state.perfEnabled, false); assert.deepEqual(env.clock.errors, []);
});

test("performance partial enable cleanup and registry reboot retire all panels and loops", () => {
    const env = setup(); const factory = env.Q.features.performanceOverlay.create;
    env.Q.features.performanceOverlay.create = () => {
        const renderer = factory();
        return { clear: renderer.clear, dispose: renderer.dispose, render(...args) { renderer.render(...args); throw Error("modeled enable failure"); } };
    };
    const registry = env.Q.core.FeatureRegistry;
    registry.enable("ql_perf"); env.clock.advance(20);
    assert.equal(registry.isEnabled("ql_perf"), false); assert.equal(env.overlay(), null); assert.equal(env.Q.state.perfEnabled, false);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_perf"), false);
    env.Q.features.performanceOverlay.create = factory;
    registry.enable("ql_perf"); assert.ok(env.overlay()); registry.shutdown(); env.clock.advance(20); assert.equal(env.overlay(), null);
    registry.enable("ql_perf"); assert.ok(env.overlay()); registry.disable("ql_perf"); env.clock.advance(20); assert.equal(env.overlay(), null);
    assert.equal(Object.hasOwn(env.sandbox.global, "QOL_PERF_OVERLAY"), false); assert.deepEqual(env.clock.errors, []);
});

test("performance rolling model retains copied completed samples, expires old windows and preserves total-ranked output", () => {
    const env = setup(), model = env.Q.features.performanceModel.create();
    const first = { lowAverage: { count: 10, total: 100, max: 15 }, highAverage: { count: 1, total: 25, max: 25 } };
    const report = model.build(first, 10000); assert.match(report.title, /^Perf  \(100.0ms total\)$/);
    assert.equal(report.body.split("\n")[0], "lowAverage: 100.0ms  avg 10.0ms  max 15.0ms  n=10");
    first.lowAverage.total = 9999;
    const next = model.build({ lowAverage: { count: 1, total: 5, max: 5 } }, 15000);
    assert.match(next.body, /lowAverage: 105.0ms  avg 9.5ms  max 15.0ms  n=11/);
    assert.match(next.body, /highAverage: 25.0ms/);
    model.build({}, 16000);
    const expired = model.build({}, 76001); assert.equal(expired.body, "(no perf data)");
    model.reset(); assert.equal(model.build({}, 76000).title, "Perf");
    const independent = env.Q.features.performanceModel.create(); assert.equal(independent.build({}, 15000).body, "(no perf data)");
    env.Q.core.App.shutdown();
});

test("performance model keeps top-eight alerts throttled and independent of a newly enabled generation", () => {
    const env = setup(), model = env.Q.features.performanceModel.create();
    const stats = { "mf.sample": { count: 1, total: 20, max: 20 } };
    assert.equal(model.build(stats, 10000).alerts.length, 1);
    assert.equal(model.build(stats, 12000).alerts.length, 0);
    assert.equal(model.build(stats, 15000).alerts.length, 1);
    model.reset(); assert.equal(model.build(stats, 15100).alerts.length, 1);
    assert.equal(stats["mf.sample"].count, 1); assert.equal(stats["mf.sample"].total, 20);
});
