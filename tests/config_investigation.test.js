"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function modelKeyboardGlyphs(hud, cacheDelay = 0, releaseHiddenGlyphs = false) {
    const $ = hud.sandbox.global.$, create = $.CreatePanel, cached = new WeakSet(), bindings = [];
    $.CreatePanel = (type, parent, id, properties) => {
        const panel = create(type, parent, id, properties);
        if (id === "QOLKeyboardOverlayRoot" && releaseHiddenGlyphs) {
            let visible = panel.visible;
            Object.defineProperty(panel, "visible", { get: () => visible, set: value => {
                visible = value;
                for (const binding of bindings.filter(binding => binding.IsValid() && binding.GetParent().GetParent().GetParent().GetParent() === panel)) {
                    const glyph = binding.FindChild("KeyboardLetter");
                    if (!value) glyph?.DeleteAsync(0);
                    else if (!glyph) create("Label", binding, "KeyboardLetter");
                }
            } });
        }
        if (id === "AllBindingsBox" && properties?.["always-cache-composition-layer"] === "true") cached.add(panel);
        if (type === "CitadelBinding") {
            bindings.push(panel);
            const attach = () => { if (panel.IsValid()) create("Label", panel, "KeyboardLetter"); };
            if (cached.has(parent.GetParent().GetParent()) && cacheDelay) $.Schedule(cacheDelay, attach);
            else attach();
        }
        return panel;
    };
}

test("expanded investigation declares every changed key including shared and CSS-only settings without cadence gating", () => {
    const hud = createHud(); hud.assertLoaded();
    const tool = hud.sandbox.global.QOL.core.ConfigInvestigation;
    assert.ok(tool, "native configuration investigation must be loaded by HUD");
    const plan = tool.plan({ baseline: { A: 1, B: 1, C: 4, SAME: 0 }, canonical: { A: 0, B: 0, C: 2, SAME: 0 },
        manifests: [{ id: "ql_one", keys: ["A"] }, { id: "ql_two", keys: ["A", "B"] }] });
    assert.deepEqual(Array.from(plan.changedKeys), ["A", "B", "C"]);
    assert.ok(plan.conditions.some(row => row.keys.includes("C") && !row.owners.length), "CSS-only/unregistered settings cannot disappear");
    assert.ok(plan.conditions.some(row => row.keys.includes("A") && row.owners.join(",") === "ql_one,ql_two"));
    assert.ok(plan.conditions.some(row => row.id === "benchmark-instrumentation"));
    for (const row of plan.conditions) assert.equal(plan.blocks.filter(block => block.conditionId === row.id).length, 3);
    assert.ok(plan.available.some(row => row.id === "key-b"));
    assert.throws(() => tool.plan({ baseline: { A: 1 }, canonical: { A: 0 }, manifests: [], selectedIds: ["missing"] }), /condition/i);
});

test("combined setting contrasts partition complete current consumer groups without changing default coverage", () => {
    const hud = createHud(); hud.assertLoaded();
    const tool = hud.sandbox.global.QOL.core.ConfigInvestigation;
    const input = { baseline: { MAP: 1, SHARED_MAP: 1, KEYBOARD: 1, BRIDGE: 1, COMPASS_ONLY: 1, OTHER: 2, CSS_ONLY: 1, SAME: 0, UNKNOWN: 1 },
        canonical: { MAP: 0, SHARED_MAP: 0, KEYBOARD: 0, BRIDGE: 0, COMPASS_ONLY: 0, OTHER: 0, CSS_ONLY: 0, SAME: 0 },
        manifests: [{ id: "ql_minimap_loot", keys: ["MAP"] }, { id: "ql_minimap_runtime", keys: ["SHARED_MAP"] },
            { id: "ql_compass", keys: ["SHARED_MAP", "COMPASS_ONLY"] }, { id: "ql_keyboard", keys: ["KEYBOARD"] },
            { id: "ql_minimap_timers", keys: ["BRIDGE"] }, { id: "ql_rejuv_hud", keys: ["BRIDGE"] }, { id: "ql_other", keys: ["OTHER"] }] };
    const plain = value => JSON.parse(JSON.stringify(value));
    const ordinary = plain(tool.plan(input));
    const selectedIds = ["whole-config", "revert-minimap-keyboard", "revert-other-settings"];
    const plan = tool.plan({ ...input, selectedIds });
    assert.deepEqual(Array.from(plan.conditions, row => row.id), ["sham", ...selectedIds]);
    assert.equal(plan.blocks.length, 12);
    assert.equal(plan.estimatedMs, 149000);
    const s = plan.conditions.find(row => row.id === selectedIds[1]), t = plan.conditions.find(row => row.id === selectedIds[2]);
    assert.deepEqual(plain(s.keys), ["BRIDGE", "KEYBOARD", "MAP", "SHARED_MAP"]);
    assert.deepEqual(plain(t.keys), ["COMPASS_ONLY", "CSS_ONLY", "OTHER"]);
    assert.deepEqual([...s.keys, ...t.keys].sort(), Array.from(plan.changedKeys));
    assert.equal(s.keys.some(key => t.keys.includes(key)), false);
    for (const contrast of [s, t]) {
        assert.deepEqual(Object.keys(contrast.patch).sort(), Array.from(contrast.keys));
        for (const key of contrast.keys) assert.equal(contrast.patch[key], input.canonical[key]);
        assert.deepEqual(plain(contrast.consumerGroups), ordinary.conditions.filter(row => /^group-\d+$/.test(row.id) &&
            row.keys.some(key => contrast.keys.includes(key))).map(({ id, keys, owners }) => ({ id, keys, owners })));
    }
    assert.ok(s.owners.includes("ql_compass"));
    assert.ok(s.owners.includes("ql_rejuv_hud"));
    assert.equal(s.keys.includes("COMPASS_ONLY"), false, "unrelated groups from a shared consumer are not recursively absorbed");
    assert.deepEqual(plain(tool.plan(input)), ordinary, "opt-in cannot alter subsequent default conditions, keys or order");
    assert.equal(ordinary.available.some(row => row.id.startsWith("revert-")), false);
    for (const id of selectedIds.slice(1)) {
        const partial = tool.plan({ ...input, selectedIds: [id] });
        assert.deepEqual(Array.from(partial.conditions, row => row.id), ["sham", id]);
        assert.deepEqual(plain(partial.conditions[1]), plain(plan.conditions.find(row => row.id === id)));
    }
    assert.throws(() => tool.plan({ baseline: { OTHER: 1 }, canonical: { OTHER: 0 }, manifests: [],
        selectedIds: [selectedIds[1]] }), /partition.*both sides/i);
    assert.throws(() => tool.plan({ baseline: { MAP: 1 }, canonical: { MAP: 0 }, manifests: [{ id: "ql_minimap_loot", keys: ["MAP"] }],
        selectedIds: [selectedIds[2]] }), /partition.*both sides/i);
});

test("keyboard alias declares bounded orthogonal probes without changing ordinary or legacy plans", () => {
    const hud = createHud(); hud.assertLoaded();
    const tool = hud.sandbox.global.QOL.core.ConfigInvestigation;
    const input = { baseline: { ENABLE_KEYBOARD_OVERLAY: 1 }, canonical: { ENABLE_KEYBOARD_OVERLAY: 1 },
        manifests: [{ id: "ql_keyboard", keys: ["ENABLE_KEYBOARD_OVERLAY"] }] };
    const ordinary = tool.plan(input);
    assert.equal(ordinary.available.some(row => row.id.startsWith("keyboard-")), false);
    const plan = tool.plan({ ...input, selectedIds: ["keyboard"] });
    assert.deepEqual(Array.from(plan.conditions, row => row.id), ["sham", "keyboard-polling", "keyboard-visibility", "keyboard-composition", "keyboard-hidden-bindings"]);
    assert.equal(plan.blocks.length, 15);
    assert.equal(plan.estimatedMs, 185000);
    const retired = plan.conditions.find(row => row.id === "keyboard-hidden-bindings");
    assert.equal(retired.patch.ENABLE_KEYBOARD_OVERLAY, 0, "temporary retirement also works when canonical keyboard is enabled");
    assert.equal(plan.conditions.find(row => row.id === "keyboard-visibility").keyboard.A.pausePolling, true);
    assert.equal(plan.conditions.find(row => row.id === "keyboard-visibility").keyboard.B.hideRoot, true);
    assert.equal(plan.conditions.find(row => row.id === "keyboard-polling").keyboard.A.composition, "none", "old contexts keep their exact uncached plan");
    const cached = tool.plan({ ...input, selectedIds: ["keyboard"], keyboardComposition: "cache" });
    for (const row of cached.conditions.filter(row => row.keyboard && row.id !== "keyboard-composition")) {
        assert.equal(row.keyboard.A.composition, "cache"); assert.equal(row.keyboard.B.composition, "cache");
    }
    const comparison = cached.conditions.find(row => row.id === "keyboard-composition").keyboard;
    assert.equal(comparison.A.composition, "none"); assert.equal(comparison.B.composition, "cache");
    assert.throws(() => tool.plan({ ...input, selectedIds: ["keyboard"], keyboardComposition: "broken" }), /composition/i);
    assert.throws(() => tool.plan({ ...input, baseline: { ENABLE_KEYBOARD_OVERLAY: 0 }, selectedIds: ["keyboard"] }), /enabled keyboard/i);
    const reactive = tool.plan({ ...input, selectedIds: ["keyboard"], keyboardEventDriven: true });
    assert.deepEqual(Array.from(reactive.conditions, row => row.id),
        ["sham", "keyboard-visibility", "keyboard-composition", "keyboard-hidden-bindings"]);
    assert.equal(reactive.blocks.length, 12);
    assert.throws(() => tool.plan({ ...input, selectedIds: ["keyboard-polling"], keyboardEventDriven: true }), /condition/i,
        "current builds must not run an A/A comparison labeled as polling isolation");
});

test("keyboard mechanism probes retain live generations, verify paused updates and restore their leases", () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    modelKeyboardGlyphs(hud);
    const canonical = Q.core.ConfigAdapter.exportToFlat();
    const core = hud.root.addChild(hud.doc.create("Panel", { classes: ["HudCore"] }));
    core.addChild(hud.doc.create("Panel", { id: "gameplay_hud" }));
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_108_keyboard");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advanceBy(210000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.equal(diag.benchmark.stats.reason, "complete");
    assert.equal(diag.benchmark.stats.completedBlocks, 12);
    const markers = hud.sandbox.messages.filter(line => line.startsWith("[QOLLOCK:NativeFPS] ")).map(line => JSON.parse(line.slice(20)));
    const { packets } = require("../scripts/analyze_minimap_frames").decodePackets(markers.filter(item => item.type === "packet"), markers[0].session);
    const windows = markers.filter(item => item.type === "window");
    assert.equal(packets.get("context").keyboardComposition, "cache");
    assert.equal(packets.get("context").keyboardEventDriven, true);
    assert.equal(windows.length, 48);
    assert.equal(windows.some(window => window.conditionId === "keyboard-polling"), false);
    for (const window of windows.filter(window => window.conditionId.startsWith("keyboard-"))) {
        const condition = packets.get("context").plan.conditions.find(row => row.id === window.conditionId);
        const expected = condition.keyboard[window.side];
        const before = packets.get(window.beforeProof).keyboard, after = packets.get(window.afterProof).keyboard;
        assert.equal(before.pollingPaused, expected.pausePolling);
        if (before.expectedEnabled) {
            assert.equal(before.observed.rootVisible, !expected.hideRoot);
            assert.equal(before.observed.composition, expected.composition);
            if (expected.pausePolling) assert.equal(after.observed.updates, before.observed.updates);
        } else assert.equal(after.observed.rootPresent, false);
    }
    assert.deepEqual(Q.core.ConfigAdapter.exportToFlat(), canonical);
    assert.equal(Q.core.FeatureRegistry.getInstance("ql_keyboard"), null);
    assert.deepEqual(hud.clock.errors, []);
});

test("keyboard composition waits for delayed native glyph workload before pausing sampling", () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    modelKeyboardGlyphs(hud, 1.2);
    const core = hud.root.addChild(hud.doc.create("Panel", { classes: ["HudCore"] }));
    core.addChild(hud.doc.create("Panel", { id: "gameplay_hud" }));
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_109_keyboard-composition");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advanceBy(110000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.equal(diag.benchmark.stats.reason, "complete");
    const markers = hud.sandbox.messages.filter(line => line.startsWith("[QOLLOCK:NativeFPS] ")).map(line => JSON.parse(line.slice(20)));
    const { packets } = require("../scripts/analyze_minimap_frames").decodePackets(markers.filter(item => item.type === "packet"), markers[0].session);
    for (const window of markers.filter(row => row.type === "window" && row.conditionId === "keyboard-composition")) {
        const before = packets.get(window.beforeProof).keyboard.observed, after = packets.get(window.afterProof).keyboard.observed;
        assert.equal(before.glyphsReady, true);
        assert.equal(before.census.selected.payloads, 23);
        assert.equal(before.glyphEpoch, after.glyphEpoch);
        assert.equal(before.glyphWorkload, after.glyphWorkload);
    }
    assert.deepEqual(hud.clock.errors, []);
});

test("keyboard visibility permits native payload retirement while preserving hidden bindings", () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    modelKeyboardGlyphs(hud, 0, true);
    const core = hud.root.addChild(hud.doc.create("Panel", { classes: ["HudCore"] }));
    core.addChild(hud.doc.create("Panel", { id: "gameplay_hud" }));
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_110_keyboard-visibility");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advanceBy(110000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.equal(diag.benchmark.stats.reason, "complete");
    const markers = hud.sandbox.messages.filter(line => line.startsWith("[QOLLOCK:NativeFPS] ")).map(line => JSON.parse(line.slice(20)));
    const { packets } = require("../scripts/analyze_minimap_frames").decodePackets(markers.filter(item => item.type === "packet"), markers[0].session);
    for (const window of markers.filter(row => row.type === "window" && row.conditionId === "keyboard-visibility" && row.side === "B")) {
        const observed = packets.get(window.beforeProof).keyboard.observed;
        assert.equal(observed.rootPresent, true);
        assert.equal(observed.census.selected.bindings, 23);
        assert.equal(observed.census.selected.payloads, 0);
        assert.equal(observed.stylesReady, true);
    }
});

for (const selected of ["benchmark-instrumentation", "whole-config"]) test(`configuration investigation ${selected} uses real App leases and restores config with a frozen UI clock`, () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const { QOL: Q, $ } = hud.sandbox.global;
    const baseline = Q.core.ConfigAdapter.exportToFlat();
    $.FrameTime = () => 1;
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_100_" + selected);
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now());
    assert.equal(Q.core.ConfigInvestigation?.getStatus()?.running, true);
    hud.clock.advanceBy(100000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.equal(diag.benchmark.stats.reason, "complete");
    const messages = hud.sandbox.messages.filter(line => line.startsWith("[QOLLOCK:NativeFPS] ")).map(line => JSON.parse(line.slice(20)));
    assert.equal(messages[0].kind, "config-suite");
    assert.equal(messages.filter(item => item.type === "window").length, 24);
    assert.equal(messages.at(-1).type, "end");
    assert.ok(messages.some(item => item.packet === "app-restoration"));
    assert.deepEqual(Q.core.ConfigAdapter.exportToFlat(), baseline);
    assert.equal(Q.state.benchmarkActive, false);
    assert.deepEqual(hud.clock.errors, []);
});

test("combined contrasts apply each entire partition through App and restore the isolated baseline and canonical settings", () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    modelKeyboardGlyphs(hud);
    const core = hud.root.addChild(hud.doc.create("Panel", { classes: ["HudCore"] }));
    core.addChild(hud.doc.create("Panel", { id: "gameplay_hud" }));
    const plain = value => JSON.parse(JSON.stringify(value));
    const canonical = plain(Q.core.ConfigAdapter.exportToFlat());
    const apply = Q.core.ConfigAdapter.loadFromFlat, applied = [];
    Q.core.ConfigAdapter.loadFromFlat = (...args) => { applied.push(plain(args[0])); return apply(...args); };
    const observe = Q.core.Scheduler.startWorkObservation, pauses = [];
    Q.core.Scheduler.startWorkObservation = () => {
        const observation = observe(), pause = observation.pausePolling;
        observation.pausePolling = ids => { pauses.push(Array.from(ids)); return pause(ids); };
        return observation;
    };
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_111_whole-config,revert-minimap-keyboard,revert-other-settings");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now());
    hud.clock.advanceBy(160000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.equal(diag.benchmark.stats.reason, "complete");
    const markers = hud.sandbox.messages.filter(line => line.startsWith("[QOLLOCK:NativeFPS] ")).map(line => JSON.parse(line.slice(20)));
    const { packets } = require("../scripts/analyze_minimap_frames").decodePackets(markers.filter(item => item.type === "packet"), markers[0].session);
    const context = packets.get("context"), windows = markers.filter(item => item.type === "window");
    assert.deepEqual(context.plan.conditions.map(row => row.id), ["sham", "whole-config", "revert-minimap-keyboard", "revert-other-settings"]);
    assert.equal(windows.length, 48);
    const expectedApplications = [context.baseline];
    for (const block of context.plan.blocks) {
        const condition = context.plan.conditions.find(row => row.id === block.conditionId);
        for (const side of block.order) expectedApplications.push({ ...context.baseline, ...(side === "B" ? condition.patch : {}) });
    }
    expectedApplications.push(context.baseline, canonical);
    assert.deepEqual(applied, expectedApplications, "each window must jointly apply its complete patch, starting from F every time");
    for (const window of windows) {
        const before = packets.get(window.beforeProof), after = packets.get(window.afterProof);
        assert.equal(before.verified, true); assert.equal(after.verified, true);
        assert.equal(before.configHash, after.configHash);
    }
    assert.ok(pauses.length > 0, "the runner must use the observed Scheduler lease");
    assert.ok(pauses.every(ids => ids.length === 0), "joint settings contrasts do not pause Scheduler work");
    assert.deepEqual(plain(Q.core.ConfigAdapter.exportToFlat()), canonical);
    assert.equal(Q.state.benchmarkActive, false);
    assert.deepEqual(hud.clock.errors, []);
});

for (const selected of ["whole-config", "whole-config,revert-minimap-keyboard,revert-other-settings"]) test(`stopping ${selected} restores settings and invalidates uncancellable work`, () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const { QOL: Q, $ } = hud.sandbox.global;
    modelKeyboardGlyphs(hud);
    const core = hud.root.addChild(hud.doc.create("Panel", { classes: ["HudCore"] }));
    core.addChild(hud.doc.create("Panel", { id: "gameplay_hud" }));
    const baseline = Q.core.ConfigAdapter.exportToFlat();
    const request = token => { hud.root.SetAttributeString("QOL_DiagRequest", token); Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); };
    request("fps_config_101_" + selected); hud.clock.advance(11000);
    assert.equal(Q.core.ConfigInvestigation?.getStatus()?.running, true);
    $.CancelScheduled = () => { throw Error("cancel rejected"); };
    request("fps_stop_102"); hud.clock.advanceBy(100000, 1000);
    assert.equal(Q.core.ConfigInvestigation.getStatus().running, false);
    assert.deepEqual(Q.core.ConfigAdapter.exportToFlat(), baseline);
    assert.equal(Q.state.benchmarkActive, false);
    assert.deepEqual(hud.clock.errors, []);
});

test("Expanded setup hook failure refuses the baseline before any measured window", () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL, registry = Q.core.FeatureRegistry;
    const canonical = Q.core.ConfigAdapter.exportToFlat();
    const manifest = registry.getManifest("ql_compass"), create = manifest.create;
    manifest.create = ctx => ({ ...create(ctx), onSettingsChanged() { throw Error("injected Expanded setup failure"); } });
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_103_benchmark-instrumentation");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advanceBy(100000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.equal(diag.benchmark?.stats.reason, "setup-error");
    assert.match(diag.benchmark.report, /ql_compass/);
    assert.equal(hud.sandbox.messages.some(line => line.includes('"type":"window"')), false);
    assert.deepEqual(Q.core.ConfigAdapter.exportToFlat(), canonical);
});

for (const scene of ["scoreboard", "detail"]) test(`native ${scene} evidence stops the configuration scan`, () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_104_benchmark-instrumentation");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advance(10000);
    if (scene === "scoreboard") hud.root.addChild(hud.doc.create("Panel", { id: "DamageReportGlobalClassListener", classes: ["gScoreboardOpen"] }));
    else hud.root.AddClass("gDetailView");
    hud.clock.advanceBy(100000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.notEqual(diag.benchmark.stats.reason, "complete");
    assert.ok(diag.benchmark.stats.completedBlocks < diag.benchmark.stats.expectedBlocks);
});

test("a settings error followed by a successful hook between guards still invalidates the scan", () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_105_benchmark-instrumentation");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advance(6100);
    const owner = Q.core.FeatureRegistry.getInstance("ql_compass"), hook = owner.onSettingsChanged;
    owner.onSettingsChanged = () => { throw Error("transient settings failure"); };
    const notify = () => Q.core.EventBus.emit("config:changed", { featureId: "ql_compass", key: "ENABLE_SIMPLIFY_COMPASS", value: 1 });
    notify(); owner.onSettingsChanged = hook; notify();
    assert.equal(Q.core.FeatureRegistry.getErrorCounts().ql_compass, 0);
    hud.clock.advance(2000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.match(diag.benchmark.stats.reason, /failure/);
    assert.match(diag.benchmark.stats.reason, /ql_compass/);
    assert.equal(diag.benchmark.stats.completedBlocks, 0);
    const markers = hud.sandbox.messages.filter(line => line.startsWith("[QOLLOCK:NativeFPS] ")).map(line => JSON.parse(line.slice(20)));
    const { packets } = require("../scripts/analyze_minimap_frames").decodePackets(markers.filter(item => item.type === "packet"), markers[0].session);
    assert.deepEqual(packets.get("runner-restoration").failedOwners, ["ql_compass"]);
});

for (const rejectDeletion of [false, true]) test(`keyboard contrasts carry physical evidence, deletion rejected=${rejectDeletion}`, () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const { QOL: Q, $ } = hud.sandbox.global;
    const core = hud.root.addChild(hud.doc.create("Panel", { classes: ["HudCore"] }));
    core.addChild(hud.doc.create("Panel", { id: "gameplay_hud" }));
    if (rejectDeletion) {
        const create = $.CreatePanel;
        $.CreatePanel = (...args) => {
            const panel = create(...args);
            if (args[2] === "QOLKeyboardOverlayRoot") panel.DeleteAsync = () => {};
            return panel;
        };
    }
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_106_group-029");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advanceBy(100000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    if (rejectDeletion) {
        assert.match(diag.benchmark.stats.reason, /keyboard.*retirement/);
        assert.ok(diag.benchmark.stats.completedBlocks < 6);
    } else {
        assert.equal(diag.benchmark.stats.reason, "complete");
        const markers = hud.sandbox.messages.filter(line => line.startsWith("[QOLLOCK:NativeFPS] ")).map(line => JSON.parse(line.slice(20)));
        const { packets } = require("../scripts/analyze_minimap_frames").decodePackets(markers.filter(item => item.type === "packet"), markers[0].session);
        assert.equal(packets.get("context").keyboardEvidence, true);
        for (const window of markers.filter(item => item.type === "window" && item.conditionId === "group-029")) {
            const evidence = packets.get(window.beforeProof).keyboard;
            assert.equal(evidence.expectedEnabled, window.side === "A");
            if (window.side === "A") assert.equal(evidence.observed.ready, true);
            else { assert.equal(evidence.observed.tree, true); assert.equal(evidence.observed.rootPresent, false); }
        }
    }
    assert.deepEqual(hud.clock.errors, []);
});

test("keyboard investigation refuses a ready receipt without a generation", () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const core = hud.root.addChild(hud.doc.create("Panel", { classes: ["HudCore"] }));
    core.addChild(hud.doc.create("Panel", { id: "gameplay_hud" }));
    const manifest = Q.core.FeatureRegistry.getManifest("ql_keyboard"), create = manifest.create;
    manifest.create = ctx => {
        const owner = create(ctx), inspect = owner.diagnostics.inspect;
        owner.diagnostics.inspect = () => ({ ...inspect(), generation: undefined });
        return owner;
    };
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_107_group-029");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advanceBy(100000, 1000);
    const diag = JSON.parse(hud.root.GetAttributeString("QOL_Diag", ""));
    assert.match(diag.benchmark.stats.reason, /keyboard.*not ready/);
    assert.equal(diag.benchmark.stats.completedBlocks, 0);
});
