"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { inspectCapture, comparisonIssues } = require("../scripts/capture_tree");
const { auditCapture } = require("../scripts/audit_lookups_vs_capture");
const { parseTreeDump, parseTreeSummary } = require("../scripts/import_tree_dump");
const { Clock } = require("../scripts/simulator/clock");
const { Document } = require("../scripts/simulator/panel");
const { buildCapturedHud } = require("../scripts/simulator/perf/hud_tree");
const { createProfiledHud } = require("../scripts/simulator/perf/profile");
const { collectTrace } = require("../scripts/trace_feature_hud");
const { loadXmlEvidence } = require("../scripts/capture_sources");

const nativeCapture = () => ({ version: "4.0.0", format: "debugger-rows-v1", durationMs: 547968,
    meta: { treeValid: true, forestValid: true, debuggerRowsComplete: true, fullHudCapture: false, classCoverage: "Debugger-rendered" },
    summary: { totalPanels: 5 }, uniqueIds: ["WrongIndex"],
    domTree: { id: "CitadelHudRoot", classes: [], children: [
        { id: "Hud", classes: ["connectedToHeroTesting"], children: [
            { id: "same", type: "Label", classes: ["native-health"], classesStatus: "Debugger-rendered",
                text: 'literal "text" < > & &amp;', debuggerRowVisible: false,
                debuggerAttributes: { text: "description property", custom: "not a runtime attribute" } },
            { id: "same", classes: [] }, { id: "Other", classes: [] },
        ] },
    ] }, domForest: [{ id: "OtherWindow", classes: ["outside-hud"] }], debuggerRows: [{ text: "raw native row" }] });

test("native inventory is scoped to the selected HUD and retains duplicate identities without trusting stale index tables", () => {
    const inspected = inspectCapture(nativeCapture(), { requireHud: true });
    assert.equal(inspected.panels, 5);
    assert.deepEqual(inspected.ids.get("same").map(r => r.path), ["0/0/0", "0/0/1"]);
    assert.equal(inspected.ids.has("WrongIndex"), false);
    assert.equal(inspected.ids.has("OtherWindow"), false);
    assert.equal(inspected.classes.has("outside-hud"), false);
    assert.equal(inspected.fidelity.fullHudCapture, false);
    assert.ok(inspected.notes.some(n => n.includes("freshness")));
    assert.ok(inspected.notes.some(n => n.includes("547968")));
});

test("captured replay replaces preexisting modeled panels and keeps native text separate from description attributes/visibility", () => {
    const doc = new Document(new Clock());
    const oldPanel = doc.root.addChild(doc.create("Panel", { id: "OnlyInModel" }));
    const oldWindow = doc.absRoot.addChild(doc.create("Panel", { id: "OldWindow" }));
    buildCapturedHud(doc, nativeCapture());
    assert.equal(oldPanel.IsValid(), false);
    assert.equal(oldWindow.IsValid(), false);
    assert.equal(doc.absRoot.FindChildTraverse("OnlyInModel"), null);
    const label = doc.root.FindChild("same");
    assert.equal(label.text, 'literal "text" < > & &amp;');
    assert.equal(label.GetAttributeString("text", "missing"), "missing");
    assert.equal(label.GetAttributeString("custom", "missing"), "missing");
    assert.equal(label.visible, true, "debugger row visibility is not HUD visibility");
    assert.equal(label.checked, undefined, "missing checkbox state must not imply selected");
    assert.ok(label.BHasClass("native-health"));
    const hud = createProfiledHud({ capturedTree: nativeCapture(), warmupMs: 0 });
    assert.equal(hud.game, null, "native commands must not run the synthetic build model");
    assert.equal(hud.doc.root.FindChildTraverse("ShopModsSelectedBuild"), null);
    assert.deepEqual(hud.doc.root.Children().slice(0, 3).map(p => p.id), ["same", "same", "Other"]);
    assert.equal(hud.tree.panels, 5, "capture count excludes panels legitimately created by QOLLOCK after load");
});

test("invalid native trees, malformed records, mismatched counts and focused subtrees cannot masquerade as whole-HUD inputs", () => {
    const invalid = nativeCapture();
    invalid.meta.treeValid = false;
    assert.throws(() => inspectCapture(invalid), /invalid native/);
    const counts = nativeCapture();
    counts.summary.totalPanels++;
    assert.throws(() => inspectCapture(counts), /panel count/);
    const malformed = nativeCapture();
    malformed.domTree.children[0].classes = "connectedToGame";
    assert.throws(() => inspectCapture(malformed), /invalid panel/);
    const cyclic = { domTree: { id: "Hud", children: [] } };
    cyclic.domTree.children.push(cyclic.domTree);
    assert.throws(() => inspectCapture(cyclic), /cyclic/);
    assert.throws(() => inspectCapture({ domTree: { id: "Shop" } }, { requireHud: true }), /whole-HUD/);
    assert.equal(inspectCapture({ domTree: { id: "Shop" } }).panels, 1);
});

test("AST dependency comparison includes classes, aliases, multiline and direct calls but ignores comments and distinguishes dynamic arguments", () => {
    const result = auditCapture(nativeCapture(), [{ file: "fixture.js", text: `
        // root.FindChildTraverse("CommentOnly");
        const target = "same";
        root.FindChildTraverse(
            target
        );
        root.FindChild("Other");
        root.FindChildrenWithClassTraverse("native-health");
        root.BHasClass("not-captured");
        root.FindChildTraverse(dynamicId);
        root.FindChildTraverse("WrongIndex");
        $.CreatePanel("Panel", root, "OwnedPanel");
        root.FindChild("OwnedPanel");
    ` }]);
    assert.equal(result.summary.dependencies, 6);
    assert.equal(result.summary.dynamicCalls, 1);
    assert.equal(result.summary.duplicateIds, 1);
    assert.equal(result.dependencies.find(r => r.token === "same").occurrences, 2);
    assert.equal(result.dependencies.find(r => r.token === "WrongIndex").status, "NOT_OBSERVED");
    assert.equal(result.dependencies.find(r => r.token === "native-health").status, "OBSERVED");
    assert.equal(result.dependencies.some(r => r.token === "CommentOnly"), false);
    assert.equal(result.dependencies.find(r => r.token === "OwnedPanel").modCreationEvidence.length, 1);
    assert.equal(result.summary.sourceCreatedNotObserved, 1);
});

test("legacy aggregate audits retain counted duplicate IDs and advertise absent class/ancestry coverage", () => {
    const result = auditCapture({ kind: "summary", panels: 20, root: "Hud", byId: { same: 15 }, end: { idsCapped: true } },
        [{ file: "fixture.js", text: 'root.FindChild("same"); root.BHasClass("class-unknown");' }]);
    assert.equal(result.dependencies.find(r => r.token === "same").occurrences, 15);
    assert.equal(result.fidelity.classCoverage, "unavailable");
    assert.ok(result.notes.some(n => n.includes("capped")));
});

test("XML declarations preserve conditional/snippet evidence without making missing captured panels fail", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-xml-evidence-"));
    const local = path.join(dir, "panorama", "layout"), native = path.join(dir, "native", "layout");
    fs.mkdirSync(local, { recursive: true });
    fs.mkdirSync(native, { recursive: true });
    const paths = [path.join(local, "shared.xml"), path.join(native, "shared.xml"), path.join(native, "optional.xml")];
    t.after(() => {
        for (const file of paths) fs.unlinkSync(file);
        for (const folder of [local, path.dirname(local), native, path.dirname(native), dir]) fs.rmdirSync(folder);
    });
    fs.writeFileSync(paths[0], '<root><snippets><snippet name="purchase"><Panel class="recentPurchase"/></snippet></snippets></root>');
    fs.writeFileSync(paths[1], '<root><Panel id="RemovedByOverride"/></root>');
    fs.writeFileSync(paths[2], '<root><Panel id="ConditionalStat"/><GlobalClassListener classes="StateOnly"/></root>');
    const evidence = loadXmlEvidence({ repositoryRoot: dir, vanilla: path.join(dir, "native") });
    assert.equal(evidence.some(e => e.token === "RemovedByOverride"), false);
    const result = auditCapture(nativeCapture(), [{ file: "fixture.js", text: `
        root.FindChildTraverse("ConditionalStat");
        root.FindChildrenWithClassTraverse("recentPurchase");
        root.BHasClass("StateOnly");
        root.FindChild("CppUnknown");
    ` }], evidence);
    assert.equal(result.summary.xmlDeclaredNotObserved, 2);
    assert.equal(result.dependencies.find(r => r.token === "ConditionalStat").status, "NOT_OBSERVED");
    assert.equal(result.dependencies.find(r => r.token === "ConditionalStat").sourceStatus, "XML_DECLARED");
    assert.ok(result.dependencies.find(r => r.token === "recentPurchase").xmlEvidence[0].ancestry.includes("snippet"));
    assert.equal(result.dependencies.find(r => r.token === "StateOnly").sourceStatus, "XML_REFERENCED");
    assert.equal(result.dependencies.find(r => r.token === "CppUnknown").sourceStatus, "SOURCE_UNVERIFIED");
});

test("legacy import selects the last dump without carrying prior ID tables or truncation state", () => {
    const summary = parseTreeSummary('[QOLSUM:START]\troot=Hud\tpanels=1\tmaxDepth=0\tanonymous=0\n' +
        '[QOLSUM:DEPTH]\t0\t1\n[QOLSUM:ID]\tOld\t1\n[QOLSUM:END]\tpanels=1\n' +
        '[QOLSUM:START]\troot=Hud\tpanels=1\tmaxDepth=0\tanonymous=0\n[QOLSUM:DEPTH]\t0\t1\n[QOLSUM:ID]\tNew\t1\n');
    assert.deepEqual(Object.keys(summary.byId), ["New"]);
    assert.equal(summary.end, null);
    const dump = parseTreeDump('[QOLTREE:START]\troot=Old\n[QOLTREE]\t0\tOld\tPanel\t-\t0\n' +
        '[QOLTREE:END]\tpanels=1\tclipped=1\ttruncated=1\n[QOLTREE:START]\troot=Hud\n[QOLTREE]\t0\tHud\tPanel\t-\t1\n');
    assert.equal(dump.meta.truncated, false);
    assert.equal(dump.meta.clipped, false);
    assert.equal(dump.meta.reportedPanels, null);
    assert.ok(dump.warnings.some(n => n.includes("child-count mismatch")));
});

test("native JSON importer preserves descriptions and forests, accepts -o before input, and refuses overwrite", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-native-"));
    const source = path.join(dir, "input.json"), output = path.join(dir, "output.json");
    t.after(() => { for (const file of [source, output]) if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); });
    fs.writeFileSync(source, JSON.stringify(nativeCapture()));
    const run = () => spawnSync(process.execPath, ["scripts/import_tree_dump.js", "-o", output, source],
        { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
    const cli = run();
    assert.equal(cli.status, 0, cli.stderr);
    const imported = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.deepEqual(imported.domForest, nativeCapture().domForest);
    assert.deepEqual(imported.debuggerRows, nativeCapture().debuggerRows);
    assert.deepEqual(imported.domTree, nativeCapture().domTree);
    assert.equal(run().status, 2);
    assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).capturedFrom, "input.json");
});

test("class trace retains its first matching panel and separates identical IDs under different search scopes", () => {
    const hud = createProfiledHud({ capturedTree: nativeCapture(), warmupMs: 0 });
    hud.clock.schedule(0.01, () => hud.counters.around("probe", () => {
        hud.doc.root.FindChildrenWithClassTraverse("native-health");
        hud.doc.root.FindChildTraverse("same");
        hud.doc.root.Children()[1].FindChildTraverse("same");
    }));
    const trace = collectTrace(hud, { seconds: 0.02, feature: "probe", xmlEvidence: [
        { kind: "id", token: "same", evidence: "xml-declaration", file: "fixture.xml", line: 1 },
    ] });
    const classEvent = trace.events.find(e => e.type === "FindChildrenWithClassTraverse");
    assert.ok(classEvent.resultBreadcrumbs.includes("native-health"));
    assert.equal(classEvent.resultPath, "0/0/0");
    const searches = trace.searches.filter(e => e.target === "same");
    assert.equal(searches.length, 2);
    assert.notEqual(searches[0].searchRootPath, searches[1].searchRootPath);
    assert.equal(searches.reduce((n, s) => n + s.misses, 0), 1);
    assert.ok(searches.every(s => s.sourceStatus === "XML_DECLARED"));
});

test("before/after comparisons reject different captures, configuration, warmup, coverage and callback failures", () => {
    const run = { meta: { treeSource: "captured", treeFingerprint: "tree-state", configMode: "defaults", configFingerprint: "cfg", warmupMs: 8000,
        captureFidelity: { fingerprint: "tree" } }, enabledEnd: ["ql_a"], callbackErrors: [], registryErrorsEnd: {} };
    assert.deepEqual(comparisonIssues(run, run), []);
    for (const key of ["configFingerprint", "warmupMs", "treeSource", "treeFingerprint"]) {
        const other = { ...run, meta: { ...run.meta, [key]: "different" } };
        assert.ok(comparisonIssues(run, other).length);
    }
    assert.ok(comparisonIssues(run, { ...run, meta: { ...run.meta, captureFidelity: { fingerprint: "other" } } }).length);
    assert.ok(comparisonIssues(run, { ...run, callbackErrors: [{ message: "failed" }] }).length);
    assert.ok(comparisonIssues(run, { ...run, enabledEnd: [] }).length);
    assert.ok(comparisonIssues(run, { meta: { treeSource: "captured" } }).length);
});
