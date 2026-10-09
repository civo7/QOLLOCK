"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseLayoutScriptSource } = require("../scripts/simulator/layout");
const { Sandbox } = require("../scripts/simulator/sandbox");
const { createProfiledHud } = require("../scripts/simulator/perf/profile");
const { assess } = require("../scripts/compare_hud_refs");

test("historical layout selects its own ordered includes and reports missing sources", () => {
    const xml = '<root>\n<styles><include src="s2r://panorama/scripts/style.vjs_c"/></styles>\n<scripts>\n<!-- <include src="s2r://panorama/scripts/retired.vjs_c"/> -->\n<include src="s2r://panorama/scripts/old.vjs_c"/>\n<include src="s2r://panorama/scripts/new.vjs_c"/>\n</scripts></root>';
    const result = parseLayoutScriptSource(xml, "historical.xml", file => path.basename(file) === "old.js");
    assert.deepEqual(result.scripts.map(s => [path.basename(s.absPath), s.line]), [["old.js", 5], ["new.js", 6]]);
    assert.equal(result.missing[0].absPath, result.scripts[1].absPath);
});

test("historical source executes in the sandbox without reading a checkout file", () => {
    const sandbox = new Sandbox();
    assert.equal(sandbox.loadSource("globalThis.historical = 7", "missing/historical.js"), true);
    assert.equal(sandbox.eval("historical"), 7);
    assert.equal(sandbox.loadSource("throw Error('historical failure')", "old.js"), false);
    assert.equal(sandbox.loadErrors[0].phase, "run");
    assert.equal(sandbox.loadErrors[0].file, "old.js");
});

test("both runtime sources receive the same complete config on a fixed captured tree", () => {
    const capturedTree = { domTree: { id: "CitadelHudRoot", children: [{ id: "Hud", type: "CitadelHud" }] } };
    const runtimeSources = { missing: [], scripts: [{ absPath: "fixture.js", source: "globalThis.QOL={buildDefaultConfig:()=>({HEALTHBAR_TYPE:2,BASE:1})};" }] };
    const first = createProfiledHud({ capturedTree, runtimeSources, warmupMs: 0, enableAll: false, configOverrides: { BASE: 8 } });
    const otherSources = { missing: [], scripts: [{ absPath: "fixture.js", source: "globalThis.QOL={buildDefaultConfig:()=>({HEALTHBAR_TYPE:5,BASE:99})};" }] };
    const second = createProfiledHud({ capturedTree, runtimeSources: otherSources, warmupMs: 0, enableAll: false, configInput: first.inputConfig });
    assert.equal(second.meta.configApplied, true);
    assert.equal(second.meta.healthbarType, 2);
    assert.equal(first.meta.configFingerprint, second.meta.configFingerprint);
    assert.equal(first.meta.treeFingerprint, second.meta.treeFingerprint);
    assert.equal(first.doc.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), second.doc.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""));
});

function run() {
    return {
        meta: { treeSource: "captured", treeFingerprint: "tree", configMode: "defaults", configFingerprint: "cfg", warmupMs: 8000, wrappedScheduler: true, captureFidelity: { fingerprint: "capture" } },
        enabledEnd: ["oldOwner"], callbackErrors: [], registryErrorsStart: {}, registryErrorsEnd: {},
        snapshot: { seconds: 20, total: { costUnits: 20, traverseNodes: 100, classTraverseNodes: 20, traverseCalls: 5, classTraverseCalls: 1, styleWritesChanged: 2, styleWritesRedundant: 3, attrReadBytes: 80 } }
    };
}
test("ref comparisons expose owner coverage changes and reject unequal inputs or hidden failures", () => {
    const before = run(), after = run();
    after.enabledEnd = ["newOwner"];
    const result = assess(before, after);
    assert.equal(result.validInputs, true);
    assert.deepEqual(result.coverage, { removed: ["oldOwner"], added: ["newOwner"] });
    assert.equal(result.rates.nodes.after, 6);
    after.meta.treeFingerprint = "other";
    after.meta.configFingerprint = "other";
    after.snapshot.seconds = 10;
    after.registryErrorsStart = { newOwner: 1 };
    after.callbackErrors = [{ message: "failure" }];
    const broken = assess(before, after);
    assert.equal(broken.validInputs, false);
    for (const fragment of ["treeFingerprint", "configFingerprint", "sample", "warm-up", "callback"]) assert.ok(broken.issues.some(s => s.includes(fragment)), fragment);
});
