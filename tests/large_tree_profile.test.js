"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createProfiledHud } = require("../scripts/simulator/perf/profile.js");

const repoRoot = path.resolve(__dirname, "..");
const summaryPath = path.join(repoRoot, "scripts/simulator/perf/runs/captured_tree.json");

function countPanels(root) {
    let count = 0;
    const stack = [root];
    while (stack.length) {
        const panel = stack.pop();
        count++;
        for (const child of panel._children) stack.push(child);
    }
    return count;
}

function sampleWindow(hud, panelCount) {
    const callbacksBefore = hud.clock.stats.fired;
    const snapshot = hud.measure(100);
    return {
        callbacks: hud.clock.stats.fired - callbacksBefore,
        visits: snapshot.total.traverseNodes + snapshot.total.classTraverseNodes,
        // Only count misses whose average traversal covered almost the whole
        // synthetic tree. An aggregate miss total can include small subtrees.
        fullTreeMisses: snapshot.misses
            .filter(miss => miss.nodes / miss.count >= panelCount * 0.9)
            .reduce((total, miss) => total + miss.count, 0),
    };
}

test("aggregate game tree summary cannot masquerade as a full profiler tree", () => {
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    assert.equal(summary.kind, "summary");
    assert.ok(summary.panels >= 10000);
    assert.equal(typeof summary.root, "string", "the capture has no ancestry");

    assert.throws(
        () => createProfiledHud({ capturedTree: summary, warmupMs: 0 }),
        /full per-panel tree is required/
    );
    const cli = spawnSync(process.execPath,
        ["scripts/profile_hud.js", "--tree", summaryPath, "--seconds", "1"],
        { cwd: repoRoot, encoding: "utf8" });
    assert.equal(cli.status, 2);
    assert.match(cli.stderr, /Aggregate panel summaries have no ancestry/);
});

test("profiler CLI accepts the manifest-only HUD and reports nonzero work", () => {
    const cli = spawnSync(process.execPath,
        ["scripts/profile_hud.js", "--seconds", "1", "--json"],
        { cwd: repoRoot, encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    const report = JSON.parse(cli.stdout);
    assert.equal(report.meta.wrappedScheduler, true);
    assert.ok(report.snapshot.total.traverseNodes > 0);
    assert.ok(report.snapshot.rows.some(row => row.label.startsWith("mf:")));
});

test("production HUD stays within a large-tree traversal and callback burst budget", () => {
    const { panels: targetPanels } = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    const hud = createProfiledHud({ warmupMs: 1000 });
    assert.equal(hud.meta.wrappedScheduler, true);
    assert.ok(hud.meta.configApplied, "the production config bridge must run");

    // The live capture gives only a panel count. Add anonymous synthetic leaves
    // to the modelled HUD to test scaling, without pretending we know ancestry.
    const initialPanels = countPanels(hud.doc.root);
    assert.ok(initialPanels < targetPanels);
    for (let i = initialPanels; i < targetPanels; i++) {
        hud.doc.root.addChild(hud.doc.create("Panel", { id: "" }));
    }
    assert.equal(countPanels(hud.doc.root), targetPanels);

    const windows = Array.from({ length: 10 }, () => sampleWindow(hud, targetPanels));
    const maxVisits = Math.max(...windows.map(window => window.visits));
    const maxCallbacks = Math.max(...windows.map(window => window.callbacks));
    const fullTreeMisses = windows.reduce((total, window) => total + window.fullTreeMisses, 0);

    // These are operation budgets for this deterministic model, not FPS or
    // milliseconds. They allow the existing three modelled full-tree misses
    // and staggered callback phases, but catch a new recurring root search or
    // a callback burst in a 100 ms window.
    assert.ok(maxVisits <= targetPanels * 10,
        `peak traversal ${maxVisits} exceeded 10 tree walks per 100 ms`);
    assert.ok(maxCallbacks <= 40,
        `peak callbacks ${maxCallbacks} exceeded 40 per 100 ms`);
    assert.ok(fullTreeMisses <= 5,
        `${fullTreeMisses} full-tree misses exceeded the 1 s budget`);
    assert.deepEqual(hud.clock.errors, [], "exceptions must not make a profile appear cheap");

    // Negative control: prove the same counters would flag a concentrated
    // callback burst and repeated full-tree misses if one were reintroduced.
    hud.clock.schedule(0, () => {
        for (let i = 0; i < 12; i++) hud.doc.root.FindChildTraverse("__QOL_PERF_MISSING__");
    });
    for (let i = 0; i < 40; i++) hud.clock.schedule(0, () => {});
    const broken = sampleWindow(hud, targetPanels);
    assert.ok(broken.visits > targetPanels * 10);
    assert.ok(broken.callbacks > 40);
    assert.ok(broken.fullTreeMisses > 5);
});
