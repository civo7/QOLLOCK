// tests/perf_guards.test.js
// =============================================================================
// Regression tests for per-frame cost guards.
// =============================================================================
// These lock in fixes whose whole value is "this expensive thing stopped
// happening every tick". A normal behavioral test cannot see them: the output is
// identical either way, only the amount of work differs. So each test asserts
// against the operation counters the profiler installs
// (scripts/simulator/perf/instrument.js).
//
// Written as ceilings rather than exact counts. An exact count would fail on any
// unrelated change to the HUD tree fixture and get deleted in irritation; a
// generous ceiling still fails loudly if a fix is reverted, because the
// regressions these guard against are order-of-magnitude, not marginal.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { createProfiledHud } = require("../scripts/simulator/perf/profile.js");

/** One profiled run, reused across tests — booting the mod is the slow part. */
let CACHED = null;
function profile() {
    if (CACHED) return CACHED;
    const h = createProfiledHud({ players: 12, warmupMs: 8000 });
    const snap = h.measure(10000);
    CACHED = { h, snap, seconds: snap.seconds };
    return CACHED;
}

function row(snap, label) {
    return snap.rows.find((r) => r.label === label) || null;
}

/** Per-second rate of a counter for one attribution label. */
function ratePerSec(snap, label, key) {
    const r = row(snap, label);
    if (!r) return 0;
    return r[key] / snap.seconds;
}

test("the harness actually exercised the mod", () => {
    const { h, snap } = profile();
    assert.ok(h.meta.wrappedFeatures > 10,
        `expected the feature registry to be populated, wrapped ${h.meta.wrappedFeatures}\n${h.diagnose()}`);
    assert.ok(h.meta.configApplied, `config was not applied — features would all be gated off\n${h.diagnose()}`);
    assert.ok(h.tree.panels > 2000,
        `HUD tree is too small to be representative: ${h.tree.panels} panels\n${h.diagnose()}`);
    assert.ok(snap.total.traverseNodes > 0, "no tree traversals recorded — instrumentation is not attached");
});

test("no scheduled callback throws during a steady-state run", () => {
    const { h } = profile();
    // A feature that throws every tick is both a bug and a silent perf cost: the
    // mod's error boundary catches it, so nothing surfaces in game, but the work
    // leading up to the throw is repeated forever and the stack string is
    // allocated each time. ql_feat_betterunsecuredhud.js read an undeclared
    // UNSECURED_SOULS_HUD_SEARCH_MS on exactly that path.
    const messages = h.sandbox.messages.filter((m) =>
        /ReferenceError|is not defined|is not a function/.test(m));
    assert.deepStrictEqual(messages.slice(0, 5), [],
        `mod logged reference/type errors:\n${messages.slice(0, 10).join("\n")}`);
    assert.strictEqual(h.clock.errors.length, 0,
        `scheduled callbacks threw:\n${h.clock.errors.slice(0, 5).map((e) => `@${e.at}ms ${e.error.message}`).join("\n")}`);
});

test("no feature was auto-disabled by repeated errors", () => {
    const { h } = profile();
    // FEATURE_ERROR_STREAK_MAX is 10, so a feature throwing every tick disables
    // itself within ~2s and re-arms on a cooldown — a thrash loop that reads as
    // "the feature randomly stops working".
    const disabled = h.sandbox.evalJson(
        `(function(){ try { return Object.keys(QOL.state.featureAutoDisabled || {}); } catch(e) { return []; } })()`
    );
    assert.deepStrictEqual(disabled, [], `features auto-disabled: ${JSON.stringify(disabled)}\n${h.diagnose()}`);
});

test("statBonuses does not re-walk the tree for absent stat panels every tick", () => {
    const { snap } = profile();
    // Its candidate ids live in the hero-stats panels, which only exist while the
    // shop is open. A flat 500ms retry meant ~28 whole-HUD walks per sweep, ~56
    // walks/sec, all match. The backoff caps that. Ceiling is deliberately loose:
    // the point is that it is not tens of thousands of nodes per second.
    const nodes = ratePerSec(snap, "feat:statBonuses", "traverseNodes");
    assert.ok(nodes < 60000,
        `statBonuses walked ${Math.round(nodes)} tree nodes/sec — the search backoff has regressed`);
});

test("the core loop does not re-read the whole config every tick", () => {
    const { snap } = profile();
    // The stored config is ~9.2 KB and GetAttributeString marshals a fresh string
    // each call, so reading it from root and Hud every tick was ~92 KB/s of
    // garbage. The revision gate reduces that to two small reads plus a 2s
    // backstop re-read.
    const bytesPerSec = snap.total.attrReadBytes / snap.seconds;
    assert.ok(bytesPerSec < 40000,
        `attribute reads total ${Math.round(bytesPerSec)} bytes/sec — the config revision gate has regressed`);
});

test("no feature creates or destroys panels in steady state", () => {
    const { snap } = profile();
    // Panel construction is the most expensive single operation in Panorama.
    // Every overlay in the mod is meant to be created once and cached; churn here
    // means a capacity guard is comparing for equality where it should compare
    // for sufficiency (as the Minecraft barrier hearts did).
    const creates = snap.total.panelCreates / snap.seconds;
    const deletes = snap.total.panelDeletes / snap.seconds;
    assert.ok(creates < 2, `${creates.toFixed(1)} panels created/sec in steady state`);
    assert.ok(deletes < 2, `${deletes.toFixed(1)} panels destroyed/sec in steady state`);
});

test("total requested engine work stays within budget", () => {
    const { snap, h } = profile();
    // A single number to catch a regression anywhere. Measured 436k units/sec
    // before this round of fixes and ~305k after; the ceiling sits above the
    // starting point so it only trips on a genuine new regression, not on noise.
    // If you are raising this, say why in the commit.
    const cost = snap.total.costPerSec;
    assert.ok(cost < 450000,
        `composite cost is ${Math.round(cost)} units/sec, over the 450k ceiling.\n` +
        `Top contributors:\n` +
        snap.rows.slice(0, 6).map((r) => `  ${r.label}: ${Math.round(r.costPerSec)}`).join("\n") +
        `\n${h.diagnose()}`);
});

test("REGRESSION: a missing gold container does not throw every tick", () => {
    // ql_feat_betterunsecuredhud read an undeclared UNSECURED_SOULS_HUD_SEARCH_MS
    // on the container-not-found path. The throw happened BEFORE the search backoff
    // was recorded, so the three full-tree searches above it re-ran every tick and
    // the error streak auto-disabled the feature after ~2s — then re-armed it 30s
    // later, forever.
    //
    // A fresh HUD is used rather than the shared one: this test mutates the tree.
    const h = createProfiledHud({ players: 12, warmupMs: 2000 });
    const containers = h.doc.root.FindChildrenWithClassTraverse("hudDeathGoldContainer");
    assert.ok(containers.length > 0, "fixture problem: no hudDeathGoldContainer to remove");
    for (const p of containers) p._destroy();

    // Drop the cached container and clear the backoff so the search path runs now.
    h.sandbox.eval(
        `(function(){ QOL.state.cachedPanels["unsecuredSoulsHudContainer"] = null;` +
        ` QOL.state.unsecuredSouls.hudNextSearchMs = 0; })()`
    );

    const before = h.sandbox.messages.length;
    h.clock.advance(3000);
    const errors = h.sandbox.messages.slice(before)
        .filter((m) => /ReferenceError|is not defined/.test(m));

    assert.deepStrictEqual(errors.slice(0, 3), [],
        `feature threw with the gold container absent:\n${errors.slice(0, 3).join("\n")}`);
});
