"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Clock } = require("../scripts/simulator/clock");
const { Document } = require("../scripts/simulator/panel");
const { install, counters, silently } = require("../scripts/simulator/perf/instrument");
const { buildCapturedHud, buildMatchHud } = require("../scripts/simulator/perf/hud_tree");
const { createProfiledHud, makeMaximalConfig } = require("../scripts/simulator/perf/profile");
const { parseArgs, matchesLabel, collectTrace } = require("../scripts/trace_feature_hud");

install();
const fixture = () => ({ domTree: { id: "CitadelHudRoot", children: [
    { id: "Hud", classes: ["connectedToGame", "joined_team"], children: [
        { id: "gameplay_hud", children: [] },
        { id: "hudActivePlayerStats", children: [] },
    ] },
] } });

test("lookup observers obey the measurement gate and direct searches stop on first hit", () => {
    const doc = new Document(new Clock());
    const first = doc.root.addChild(doc.create("Panel", { id: "first", classes: ["target"] }));
    doc.root.addChild(doc.create("Panel", { id: "second" }));
    const events = [];
    const hooks = ["onTraverse", "onClassTraverse", "onFindChild"];
    const previous = hooks.map(key => counters[key]);
    try {
        hooks.forEach(key => { counters[key] = e => events.push(e); });
        counters.reset();
        counters.enabled = false;
        doc.root.FindChild("first");
        doc.root.FindChildTraverse("first");
        doc.root.FindChildrenWithClassTraverse("target");
        assert.equal(events.length, 0, "warm-up must not emit measured events");
        counters.enabled = true;
        assert.equal(doc.root.FindChild("first"), first);
        doc.root.FindChild("absent");
        doc.root.FindChildTraverse("first");
        doc.root.FindChildrenWithClassTraverse("target");
        silently(() => doc.root.FindChildTraverse("absent"));
        assert.deepEqual(events.map(e => e.visited), [1, 2, 1, 2]);
        const total = counters.snapshot(1).total;
        assert.equal(total.traverseNodes + total.classTraverseNodes, 6);
        assert.equal(total.traverseMisses, 1, "direct misses must also be recorded");
    } finally {
        counters.enabled = false;
        hooks.forEach((key, i) => { counters[key] = previous[i]; });
    }
});

test("captured window counts both roots and preserves sibling order, duplicate IDs and supplied state", () => {
    const doc = new Document(new Clock());
    const capture = { summary: { totalPanels: 5 }, domTree: { id: "CitadelHudRoot", children: [
        { id: "duplicate", type: "Label", text: "before", visible: false, enabled: false },
        { id: "Hud", type: "CitadelHud", classes: ["connectedToHeroTesting"], children: [
            { id: "duplicate", type: "Label", text: "inside", attributes: { value: "42" } },
        ] },
        { id: "after", type: "Label" },
    ] } };
    const tree = buildCapturedHud(doc, capture);
    assert.equal(tree.panels, 5);
    assert.deepEqual(doc.absRoot.Children().map(p => p.id), ["duplicate", "Hud", "after"]);
    assert.equal(doc.absRoot.FindChildTraverse("duplicate").text, "before");
    assert.equal(doc.absRoot.Children()[0].visible, false);
    assert.equal(doc.absRoot.Children()[0].enabled, false);
    assert.equal(doc.root.type, "CitadelHud");
    assert.equal(doc.root.FindChild("duplicate").GetAttributeString("value"), "42");
    assert.ok(tree.notes.some(n => n.includes("1 captured Labels/TextEntries lack text")));
});

test("aggregate and window captures without a Hud context cannot silently become a HUD", () => {
    const doc = new Document(new Clock());
    assert.throws(() => buildCapturedHud(doc, { kind: "summary", panels: 10000 }), /full per-panel/);
    assert.throws(() => buildCapturedHud(doc, { domTree: { id: "CitadelHudRoot", children: [] } }), /no direct Hud/);
});

test("XML composition keeps retired native layouts and prefers current overrides without a second mod-source list", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-native-layouts-"));
    const files = ["hud.xml", "hud_health.xml", "ability_hud_element_unit_target.xml"];
    t.after(() => { for (const file of files) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); });
    fs.writeFileSync(path.join(dir, "hud.xml"), '<root><Panel id="VanillaHudMustNotReplaceOverride" /></root>');
    fs.writeFileSync(path.join(dir, "hud_health.xml"), '<root><Panel class="bars_container"><ProgressBarWithMiddle id="health_bar" /></Panel></root>');
    fs.writeFileSync(path.join(dir, "ability_hud_element_unit_target.xml"), '<root><Panel class="unit_target_instance"><Panel id="unscaled_panel"><Panel id="hint_container" /><Panel id="scaled_panel"><Panel id="hint_container" /></Panel></Panel></Panel></root>');
    const doc = new Document(new Clock()), tree = buildMatchHud(doc, { players: 1, damageNumbers: 0, dataFeed: 0, chatLines: 0, vanillaLayout: dir });
    assert.equal(doc.root.FindChildTraverse("VanillaHudMustNotReplaceOverride"), null);
    assert.ok(doc.root.FindChildTraverse("gameplay_hud")); assert.ok(doc.root.FindChildTraverse("QOLHealthbarGeometry"));
    assert.equal(tree.byLayout["hud_health.xml"].perInstance, 2);
    assert.equal(tree.byLayout["ability_hud_element_unit_target.xml"].perInstance, 5);
    assert.ok(doc.root.FindChildTraverse("health_bar"));
    assert.equal(doc.root.FindChildrenWithClassTraverse("unit_target_instance").length, 1);
    assert.equal(doc.root.FindChildTraverse("cd_icons"), null);
    assert.ok(tree.notes.includes("layout not found: vanilla/hud_minimap.xml"), "genuinely missing native sources remain reported");
    for (const file of files) assert.equal(tree.notes.some(note => note.startsWith("layout not found:") && note.endsWith("/" + file)), false);
});

test("defaults plus overrides do not silently expand unrelated feature toggles", () => {
    const sandbox = { evalJson: () => ({ ENABLE_A: 0, ENABLE_B: 0, DISABLE_C: 1, MODE: 2 }) };
    assert.deepEqual(makeMaximalConfig(sandbox, { MODE: 3 }, false),
        { ENABLE_A: 0, ENABLE_B: 0, DISABLE_C: 1, MODE: 3 });
    assert.equal(makeMaximalConfig(sandbox).ENABLE_A, 1);
    assert.equal(makeMaximalConfig(sandbox).DISABLE_C, 1);
});

test("production crosshair trace excludes warm-up and agrees with independent operation counters", () => {
    const hud = createProfiledHud({ capturedTree: fixture(), warmupMs: 8000 });
    const short = collectTrace(hud, { seconds: 0.2, feature: "ql_crosshair_stats" });
    const long = collectTrace(hud, { seconds: 2, feature: "ql_crosshair_stats" });
    for (const result of [short, long]) {
        assert.deepEqual(result.callbackErrors, []);
        assert.equal(result.features.length, 1);
        for (const target of ["damageAmpContainer", "bulletEvasionContainer"]) {
            const searches = result.events.filter(e => e.target === target);
            if (result.seconds >= 0.8) assert.ok(searches.length > 0);
            assert.ok(searches.filter(e => e.type === "FindChild").length <= Math.ceil(result.seconds / 0.8),
                "missing rows must only be rediscovered at the requested cadence");
            assert.ok(searches.filter(e => e.type === "FindChildTraverse").length <= Math.ceil(result.seconds / 0.8),
                "compatibility searches share the discovery cadence");
        }
        assert.ok(result.events.every(e => e.t >= 0 && e.t <= result.seconds));
        const row = result.snapshot.rows.find(r => r.label === "mf:ql_crosshair_stats");
        assert.equal(result.features[0].calls, row.traverseCalls + row.classTraverseCalls);
        assert.equal(result.features[0].visits, row.traverseNodes + row.classTraverseNodes);
    }
    const all = collectTrace(hud, { seconds: 0.123 });
    assert.ok(Math.abs(all.seconds - 0.123) < 1e-9, "sample must not round up to a 50ms boundary");
    assert.equal(all.events.reduce((n, e) => n + e.visited, 0),
        all.snapshot.total.traverseNodes + all.snapshot.total.classTraverseNodes);
    assert.equal(all.events.length, all.snapshot.total.traverseCalls + all.snapshot.total.classTraverseCalls);
    assert.equal(counters.onTraverse, undefined, "observer hooks must be restored");
});

test("trace reports callback failures and timestamps at callback execution", () => {
    const hud = createProfiledHud({ capturedTree: fixture(), warmupMs: 8000 });
    hud.clock.schedule(0.037, () => {
        counters.around("probe", () => hud.doc.root.FindChild("absent"));
        throw new Error("injected failure");
    });
    const result = collectTrace(hud, { seconds: 0.08, feature: "probe" });
    assert.equal(result.events.length, 1);
    assert.ok(Math.abs(result.events[0].t - 0.037) < 1e-9);
    assert.equal(result.callbackErrors[0].message, "injected failure");
});

test("CLI emits parseable JSON even with a feature and verbose, without a local capture dependency", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-trace-"));
    t.after(() => {
        fs.unlinkSync(path.join(dir, "tree.json"));
        fs.rmdirSync(dir);
    });
    const capturePath = path.join(dir, "tree.json");
    fs.writeFileSync(capturePath, JSON.stringify(fixture()));
    const cli = spawnSync(process.execPath, ["scripts/trace_feature_hud.js", "ql_crosshair_stats",
        "--capture", capturePath, "--seconds", "2", "--json", "--verbose", "--events"],
    // Opt-in event traces repeat full native breadcrumbs; scoped resolvers add
    // direct-child events alongside whole-tree searches. Preserve all events.
    { cwd: path.resolve(__dirname, ".."), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    assert.equal(cli.error, undefined, cli.error && cli.error.message);
    assert.equal(cli.status, 0, cli.stderr);
    const result = JSON.parse(cli.stdout);
    assert.ok(result.features[0].missedTargets.damageAmpContainer >= 1);
    assert.ok(result.events.length > 0);
    assert.match(result.scope, /no native timings or FPS/);
});

test("label selection is exact and invalid sampling arguments fail explicitly", () => {
    assert.equal(matchesLabel("mf:ql_items", "ql_items"), true);
    assert.equal(matchesLabel("mf:ql_items_extra", "ql_items"), false);
    for (const args of [["--seconds", "0"], ["--seconds", "Infinity"], ["--seconds"],
        ["--capture"], ["--warmup", "-1"], ["--unknown"]]) {
        assert.throws(() => parseArgs(args));
    }
    assert.equal(parseArgs(["--defaults", "--enable", "HEALTHBAR_TYPE=5"]).enableAll, false);
});
