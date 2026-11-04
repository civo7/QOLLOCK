"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const { analyzeCapture, formatReport } = require("../scripts/analyze_game_frames");
const { digest } = require("../scripts/analyze_minimap_frames");

function capture(noise = 0, drift = false, keyboard = false, selected = "group-029") {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    if (keyboard) {
        const core = hud.root.addChild(hud.doc.create("Panel", { classes: ["HudCore"] }));
        core.addChild(hud.doc.create("Panel", { id: "gameplay_hud" }));
        if (selected === "keyboard" || selected.startsWith("keyboard-")) {
            const $ = hud.sandbox.global.$, create = $.CreatePanel;
            $.CreatePanel = (type, parent, id, properties) => {
                const panel = create(type, parent, id, properties);
                if (type === "CitadelBinding") create("Label", panel, "KeyboardLetter");
                return panel;
            };
        }
    }
    hud.root.SetAttributeString("QOL_DiagRequest", "fps_config_103_" + (keyboard ? selected : "key-enable-compass"));
    const combined = selected.includes("revert-minimap-keyboard") && selected.includes("revert-other-settings");
    Q.core.App.syncDiagnosticState(hud.root, hud.clock.now()); hud.clock.advanceBy(selected === "keyboard" ? 210000 : combined ? 170000 : 100000, 1000);
    const markers = hud.sandbox.messages.filter(line => line.startsWith("[QOLLOCK:NativeFPS] ")).map(line => JSON.parse(line.slice(20)));
    const windows = markers.filter(row => row.type === "window");
    assert.equal(windows.length, selected === "keyboard" || combined ? 48 : 24);
    const first = windows[0].startAt - 1000, last = windows.at(-1).endAt + 1000;
    const meta = { kind: markers[0].kind, session: markers[0].session, reason: markers.at(-1).reason, processId: 100, completed: true,
        windows, packets: markers.filter(row => row.type === "packet"),
        anchors: [{ qpc: 0, utcMs: first, frequency: 1000000, uncertaintyMs: 1 },
            { qpc: (last - first) * 1000, utcMs: last, frequency: 1000000, uncertaintyMs: 1 }],
        focus: Array.from({ length: Math.ceil((last - first) / 250) + 1 }, (_, i) => ({ qpc: i * 250000, pid: 100 })) };
    const lines = ["Application,ProcessID,SwapChainAddress,TimeInQPC,MsBetweenPresents"];
    for (const window of windows) {
        const interval = (window.side === "B" ? 8 - (window.conditionId === "sham" ? noise : 2) : 8) +
            (drift && window.conditionId !== "sham" && window.side === "A" && window.phase === 3 ? 1 : 0);
        for (let at = window.startAt + interval; at <= window.endAt; at += interval) lines.push(["deadlock.exe", 100, "0x1", Math.round((at - first) * 1000), interval].join(","));
    }
    return { csv: lines.join("\n"), meta };
}

function rewriteProofs(meta, ids, mutate) {
    const { packets } = require("../scripts/analyze_minimap_frames").decodePackets(meta.packets, meta.session);
    meta.packets = meta.packets.filter(packet => !ids.has(packet.packet));
    for (const id of ids) {
        const proof = packets.get(id); mutate(proof);
        const raw = JSON.stringify(proof), chars = Array.from(raw), total = Math.ceil(chars.length / 350);
        for (let index = 0; index < total; index++) meta.packets.push({ session: meta.session, packet: id,
            index, total, hash: digest(raw), data: chars.slice(index * 350, (index + 1) * 350).join("") });
    }
}

test("native config analysis attributes repeated effects to exact settings and includes canonical/source/restoration context", () => {
    const { csv, meta } = capture();
    meta.sourceIdentity = require("../scripts/native_capture_identity").collectSourceIdentity();
    const result = analyzeCapture(csv, meta);
    assert.equal(result.kind, "config-suite");
    const row = result.rows.find(item => item.id === "key-enable-compass");
    assert.equal(row.status, "effect_detected");
    assert.ok(Math.abs(row.effectMs - 2) < 0.001);
    assert.equal(row.validBlocks, 3);
    assert.equal(result.restoration.configRestored, true);
    assert.ok(Object.values(result.sourceMatches).every(value => value === true));
    const report = formatReport(result);
    for (const text of ["ENABLE_COMPASS", "ql_compass/manifest.js", "canonical", "not vanilla", "inactive", "not be summed"]) assert.ok(report.includes(text), text);
});

test("combined native analysis reports the actual complementary consumer groups and four conditional states", () => {
    const selected = "whole-config,revert-minimap-keyboard,revert-other-settings";
    const { csv, meta } = capture(0, false, true, selected);
    const result = analyzeCapture(csv, meta);
    assert.deepEqual(result.context.selectedIds, selected.split(","));
    assert.deepEqual(result.rows.map(row => row.id), ["sham", "whole-config", "revert-minimap-keyboard", "revert-other-settings"]);
    assert.equal(result.coverage.validBlocks, 12);
    assert.equal(result.coverage.invalidBlocks, 0);
    const s = result.rows.find(row => row.id === "revert-minimap-keyboard");
    const t = result.rows.find(row => row.id === "revert-other-settings");
    assert.deepEqual([...s.keys, ...t.keys].sort(), result.context.plan.changedKeys);
    assert.equal(s.keys.some(key => t.keys.includes(key)), false);
    for (const row of [s, t]) {
        assert.equal(row.status, "effect_detected");
        assert.ok(row.consumerGroups.length > 0);
        assert.deepEqual(row.consumerGroups.flatMap(group => group.keys).sort(), row.keys);
    }
    const report = formatReport(result);
    assert.match(report, /Consumer groups=.*group-\d+/);
    assert.match(report, /Mean Present interval: Expanded=.*B=/);
    for (const group of [...s.consumerGroups, ...t.consumerGroups]) {
        assert.ok(report.includes(JSON.stringify(group)), group.id);
    }
    assert.match(report, /must not be summed/);

    const incomplete = JSON.parse(JSON.stringify(meta));
    const first = incomplete.windows.findIndex(window => window.conditionId === s.id);
    incomplete.windows.splice(first, 1);
    const rejected = analyzeCapture(csv, incomplete).rows.find(row => row.id === s.id);
    assert.equal(rejected.validBlocks, 2);
    assert.notEqual(rejected.status, "effect_detected");
});

test("combined captures reject forged partition metadata and partial selection preserves its exact ledger", () => {
    const { csv, meta } = capture(0, false, true, "revert-minimap-keyboard");
    const result = analyzeCapture(csv, meta);
    assert.deepEqual(result.rows.map(row => row.id), ["sham", "revert-minimap-keyboard"]);
    assert.ok(result.context.plan.available.some(row => row.id === "revert-other-settings"));
    for (const corrupt of [
        context => { context.plan.conditions[1].consumerGroups[0].keys.push("FORGED_KEY"); },
        context => { context.selectedIds = ["revert-other-settings"]; }
    ]) {
        const broken = JSON.parse(JSON.stringify(meta));
        rewriteProofs(broken, new Set(["context"]), corrupt);
        assert.throws(() => analyzeCapture(csv, broken), /ledger|contract/i);
    }
    const legacy = capture();
    const historical = analyzeCapture(legacy.csv, legacy.meta);
    assert.equal(historical.context.plan.available.some(row => row.id.startsWith("revert-")), false);
    assert.equal(historical.rows.some(row => Object.hasOwn(row, "consumerGroups")), false);
    assert.equal(historical.rows.find(row => row.id === "key-enable-compass").status, "effect_detected");
});

test("config source evidence follows extracted keyboard diagnostics and retains older capture contexts", () => {
    const { csv, meta } = capture();
    meta.sourceIdentity = require("../scripts/native_capture_identity").collectSourceIdentity();
    const { hudLoadGraph, loadedFunctionFingerprints } = meta.sourceIdentity;
    const diagnosticIndex = hudLoadGraph.indexOf("panorama/scripts/manifests/ql_keyboard/diagnostics.js");
    const manifestIndex = hudLoadGraph.indexOf("panorama/scripts/manifests/ql_keyboard/manifest.js");
    assert.ok(diagnosticIndex >= 0 && diagnosticIndex < manifestIndex);
    assert.equal(typeof loadedFunctionFingerprints.keyboardDiagnostics, "string");
    assert.equal(analyzeCapture(csv, meta).sourceMatches.keyboardDiagnostics, true);
    loadedFunctionFingerprints.keyboardDiagnostics = "different-loaded-factory";
    assert.equal(analyzeCapture(csv, meta).sourceMatches.keyboardDiagnostics, false);

    rewriteProofs(meta, new Set(["context"]), context => { delete context.loadedFunctionFingerprints.keyboardDiagnostics; });
    delete loadedFunctionFingerprints.keyboardDiagnostics;
    const legacy = analyzeCapture(csv, meta);
    assert.equal(Object.hasOwn(legacy.sourceMatches, "keyboardDiagnostics"), false);
    assert.ok(Object.values(legacy.sourceMatches).every(value => value === true));
    assert.equal(legacy.rows.find(row => row.id === "key-enable-compass").status, "effect_detected");
});

test("missing configuration context refuses legacy analysis and missing proofs cannot be counted as three confirmed repeats", () => {
    const { csv, meta } = capture();
    const target = meta.windows.find(row => row.conditionId !== "sham");
    meta.packets = meta.packets.filter(row => row.packet !== target.beforeProof);
    const row = analyzeCapture(csv, meta).rows.find(item => item.id === "key-enable-compass");
    assert.equal(row.validBlocks, 2);
    assert.notEqual(row.status, "effect_detected");
    meta.packets = meta.packets.filter(row => row.packet !== "context");
    assert.throws(() => analyzeCapture(csv, meta), /context|ledger/i);
});

test("sham noise and entirely missing conditions remain explicit rather than producing a clean bill of health", () => {
    const { csv, meta } = capture(3);
    assert.equal(analyzeCapture(csv, meta).rows.find(row => row.id === "key-enable-compass").status, "inconclusive");
    meta.windows = meta.windows.filter(row => row.conditionId === "sham");
    const result = analyzeCapture(csv, meta);
    assert.equal(result.rows.find(row => row.id === "key-enable-compass").status, "not_run");
    assert.match(formatReport(result), /key-enable-compass/);
});

test("a failed Expanded setup produces an immediate diagnostic report without fabricated trial coverage", () => {
    const { csv, meta } = capture();
    const data = JSON.stringify({ kind: "config-suite", reason: "setup-error", error: "Expanded baseline failed: ql_compass",
        expectedConfig: { ENABLE_COMPASS: 0 }, actualConfig: { ENABLE_COMPASS: 0 } });
    meta.reason = "setup-error"; meta.windows = [];
    meta.packets = [{ session: meta.session, packet: "setup-failure", index: 0, total: 1, hash: digest(data), data }];
    const result = analyzeCapture(csv, meta);
    assert.equal(result.reason, "setup-error"); assert.equal(result.rows.length, 0);
    assert.equal(result.restoration.configRestored, true);
    assert.match(formatReport(result), /ql_compass/);
});

test("rejected drift retains the actual paired means and percentage without weakening the rejection", () => {
    const { csv, meta } = capture(0, true), result = analyzeCapture(csv, meta);
    const row = result.rows.find(item => item.id === "key-enable-compass");
    assert.equal(row.validBlocks, 1);
    assert.equal(row.status, "inconclusive");
    const rejected = row.blocks.find(block => block.status === "invalid");
    assert.ok(rejected.withinBlockDrift?.A.percent > 11 && rejected.withinBlockDrift.A.percent < 12);
    assert.match(formatReport(result), /A drift=11\.765%/);
});

test("native keyboard findings require actual before/after presence and retirement evidence", () => {
    const { csv, meta } = capture(0, false, true), result = analyzeCapture(csv, meta);
    assert.equal(result.rows.find(row => row.id === "group-029").status, "effect_detected");
    assert.match(formatReport(result), /keyboard=.*"rootPresent":false/);
    assert.match(formatReport(result), /A n=.*keyboard=\{"before":.*"after":/);
    const window = meta.windows.find(window => window.conditionId === "group-029" && window.side === "B");
    rewriteProofs(meta, new Set([window.beforeProof]), proof => { proof.keyboard.observed.rootPresent = true; });
    const broken = analyzeCapture(csv, meta).rows.find(row => row.id === "group-029");
    assert.equal(broken.validBlocks, 2);
    assert.equal(broken.status, "inconclusive");
    assert.ok(broken.blocks.some(block => block.errors.some(error => /keyboard native/.test(error))));
});

for (const generation of [undefined, null, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", "changed"]) {
    test(`native keyboard evidence rejects missing, invalid or replaced generations: ${generation}`, () => {
        const { csv, meta } = capture(0, false, true);
        const ids = new Set(meta.windows.filter(window => window.conditionId === "group-029" && window.side === "A")
            .flatMap(window => generation === "changed" ? [window.afterProof] : [window.beforeProof, window.afterProof]));
        rewriteProofs(meta, ids, proof => {
            proof.keyboard.observed.generation = generation === "changed" ? proof.keyboard.observed.generation + 1 : generation;
        });
        const row = analyzeCapture(csv, meta).rows.find(row => row.id === "group-029");
        assert.equal(row.validBlocks, 0);
        assert.equal(row.status, "invalid");
        assert.ok(row.blocks.every(block => block.errors.some(error => /keyboard/.test(error))));
    });
}

for (const [side, field, value] of [["B", "rootPresent", undefined], ["A", "active", "false"]]) {
    test(`required keyboard evidence is explicitly boolean: ${side}.${field}`, () => {
        const { csv, meta } = capture(0, false, true);
        const ids = new Set(meta.windows.filter(window => window.conditionId === "group-029" && window.side === side)
            .flatMap(window => [window.beforeProof, window.afterProof]));
        rewriteProofs(meta, ids, proof => { proof.keyboard.observed[field] = value; });
        const row = analyzeCapture(csv, meta).rows.find(row => row.id === "group-029");
        assert.equal(row.validBlocks, 0);
        assert.equal(row.status, "invalid");
    });
}

test("keyboard native mechanisms retain distinct declared interventions and both boundary receipts", () => {
    const { csv, meta } = capture(0, false, true, "keyboard");
    const result = analyzeCapture(csv, meta);
    assert.equal(result.coverage.validBlocks, 12);
    assert.equal(result.coverage.invalidBlocks, 0);
    for (const id of ["keyboard-visibility", "keyboard-composition", "keyboard-hidden-bindings"]) {
        assert.equal(result.rows.find(row => row.id === id).status, "effect_detected");
    }
    const report = formatReport(result);
    assert.match(report, /Keyboard intervention=.*pausePolling/);
    assert.match(report, /visible-dependent native work/);
    assert.match(report, /creation request.*hardware cache/i);
});

for (const corruption of ["unpaused", "updates", "composition", "hidden", "generation", "glyph-epoch", "glyph-workload", "glyph-ready", "census"]) {
    test(`keyboard native mechanism rejects a forged verified receipt: ${corruption}`, () => {
        const id = corruption === "hidden" ? "keyboard-visibility" : "keyboard-composition";
        const { csv, meta } = capture(0, false, true, id);
        const ids = new Set(meta.windows.filter(window => window.conditionId === id && window.side === "B").map(window => window.afterProof));
        rewriteProofs(meta, ids, proof => {
            if (corruption === "unpaused") proof.keyboard.pollingPaused = false;
            if (corruption === "updates") proof.keyboard.observed.updates++;
            if (corruption === "composition") proof.keyboard.observed.composition = "none";
            if (corruption === "hidden") proof.keyboard.observed.rootVisible = true;
            if (corruption === "generation") proof.keyboard.observed.generation++;
            if (corruption === "glyph-epoch") proof.keyboard.observed.glyphEpoch = "replaced";
            if (corruption === "glyph-workload") proof.keyboard.observed.glyphWorkload = "partial";
            if (corruption === "glyph-ready") proof.keyboard.observed.glyphsReady = false;
            if (corruption === "census") proof.keyboard.observed.census.complete = false;
        });
        const row = analyzeCapture(csv, meta).rows.find(row => row.id === id);
        assert.equal(row.validBlocks, 0);
        assert.equal(row.status, "invalid");
        assert.ok(row.blocks.every(block => block.errors.some(error => /keyboard/.test(error))));
    });
}

test("keyboard mechanism cannot replace both missing workload references with undefined equality", () => {
    const { csv, meta } = capture(0, false, true, "keyboard-composition");
    const ids = new Set(meta.windows.filter(window => window.conditionId === "keyboard-composition")
        .flatMap(window => [window.beforeProof, window.afterProof]));
    rewriteProofs(meta, ids, proof => { delete proof.keyboard.glyphReference; delete proof.keyboard.observed.glyphWorkload; });
    const row = analyzeCapture(csv, meta).rows.find(row => row.id === "keyboard-composition");
    assert.equal(row.validBlocks, 0);
    assert.equal(row.status, "invalid");
});

test("keyboard mechanism rejects malformed baseline composition metadata", () => {
    const { csv, meta } = capture(0, false, true, "keyboard-composition");
    rewriteProofs(meta, new Set(["context"]), context => { context.keyboardComposition = "broken"; });
    assert.throws(() => analyzeCapture(csv, meta), /composition/i);
});
