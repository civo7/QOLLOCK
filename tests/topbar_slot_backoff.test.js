// tests/topbar_slot_backoff.test.js
// =============================================================================
// Regression tests for the absent-slot cooldown on top bar player lookups.
// =============================================================================
// A `TopBarPlayerN` miss costs a whole-HUD traversal (31,411 panels in the
// captured tree), so a slot that cannot resolve is put on a 30s cooldown. The
// danger is the mirror image of the cost it saves: freeze a slot that holds a
// REAL player and that player's nickname, rank badge and unspent souls go blank
// for half a minute, which is far worse than the traversal.
//
// Two ways to get that wrong, both of which shipped:
//
//  1. Deciding "absent" from the cache being empty right now. Panels die on
//     every match transition, so a transient miss on a real slot got the long
//     freeze — and the early return sits above the forceRefresh checks, so
//     nothing could break it.
//  2. Deciding "absent" from this slot alone. Before the top bar inflates NO
//     slot has resolved, so the first pass froze all thirteen and every real
//     player stayed blank for 30s after the top bar appeared.
//
// The tests below drive QOL.getTopBarPlayerPanel directly with a controlled
// clock, because the distinction is entirely about WHEN a lookup is allowed to
// run again and that is invisible in the rendered output.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

const MISSING_RECHECK_MS = 30000;   // TOPBAR_PLAYER_PANEL_MISSING_RECHECK_MS
const CACHE_REFRESH_MS = 1500;      // TOPBAR_PLAYER_PANEL_CACHE_REFRESH_MS

/** A HUD with a top bar holding `count` player cards, numbered from 1. */
function bootWithTopBar(count) {
    const h = sim.createHud({ inHideout: false, boot: true });
    h.assertLoaded();
    const hud = h.doc.absRoot.FindChildTraverse("Hud") || h.doc.root;
    let topBar = hud.FindChildTraverse("TopBar");
    if (!topBar) {
        topBar = h.doc.create("Panel", { id: "TopBar", classes: [] });
        hud.addChild(topBar);
    }
    const cards = [];
    for (let i = 1; i <= count; i++) {
        const card = h.doc.create("Panel", { id: `TopBarPlayer${i}`, classes: [] });
        topBar.addChild(card);
        cards.push(card);
    }
    return { h, hud, topBar, cards };
}

/**
 * Call the real getter. `nowMs` is passed explicitly rather than left to
 * PerfNowMs so each test controls the cooldown arithmetic outright.
 */
function lookup(h, root, index, nowMs, forceRefresh) {
    return h.sandbox.eval(`(function(){
        var p = QOL.getTopBarPlayerPanel(
            __probeRoot, ${index}, ${nowMs}, ${forceRefresh ? "true" : "false"});
        return !!p;
    })()`, );
}

/** Expose a panel to the sandbox under a fixed global so eval can pass it. */
function bindRoot(h, root) {
    h.sandbox.global.__probeRoot = root;
}

test("a real slot resolves", () => {
    const { h, hud } = bootWithTopBar(12);
    bindRoot(h, hud);
    assert.ok(lookup(h, hud, 1, 1000, false), "slot 1 should resolve");
    assert.ok(lookup(h, hud, 12, 1000, false), "slot 12 should resolve — it is a real slot");
});

test("the slot the engine never creates is put on the long cooldown", () => {
    // This is the cost the cooldown exists to remove: slot 0 has no panel in any
    // observed build, and each attempt walks the whole HUD.
    const { h, hud } = bootWithTopBar(12);
    bindRoot(h, hud);
    lookup(h, hud, 1, 1000, false);            // establishes that the top bar exists
    assert.strictEqual(lookup(h, hud, 0, 1000, false), false, "slot 0 cannot resolve");

    const before = h.sandbox.eval("__probeRoot.__traverseCount || 0");
    // Well past the ordinary refresh interval, well short of the long cooldown.
    lookup(h, hud, 0, 1000 + CACHE_REFRESH_MS + 500, false);
    const after = h.sandbox.eval("__probeRoot.__traverseCount || 0");
    assert.strictEqual(after, before, "an absent slot must not be re-searched inside the cooldown");
});

test("REGRESSION: a transient miss on a real slot does not freeze it for 30s", () => {
    // Match transition: the card is destroyed, the lookup misses, and then the
    // card comes back. The slot must recover on the next ordinary refresh, not
    // half a minute later.
    //
    // The miss lookup has to fall OUTSIDE the 1500ms refresh window or the getter
    // short-circuits on `recentlyScanned` and never searches — the cache keeps the
    // dead handle, nothing is written, and the test passes without having
    // exercised the freeze at all. That is how the first draft of this test
    // silently proved nothing.
    const { h, hud, topBar, cards } = bootWithTopBar(12);
    bindRoot(h, hud);
    assert.ok(lookup(h, hud, 3, 1000, false), "precondition: slot 3 resolves");

    cards[2].DeleteAsync(0);
    h.clock.advance(1);
    const missAt = 1000 + CACHE_REFRESH_MS + 500;
    assert.strictEqual(lookup(h, hud, 3, missAt, false), false, "slot 3 is gone, so the lookup misses");
    assert.strictEqual(h.sandbox.eval("String(QOL.state.topbarPlayerPanels[3])"), "null",
        "the miss must have reached the search and nulled the cache, or nothing is being tested");

    // The HUD rebuilds the card.
    topBar.addChild(h.doc.create("Panel", { id: "TopBarPlayer3", classes: [] }));

    const retryAt = missAt + CACHE_REFRESH_MS + 100;
    assert.ok(retryAt - missAt < MISSING_RECHECK_MS,
        "sanity: the retry has to land inside the long cooldown to mean anything");
    assert.ok(lookup(h, hud, 3, retryAt, false),
        "a slot that has resolved before must recover on the ordinary refresh, " +
        "not sit frozen for the absent-slot cooldown");
});

test("REGRESSION: forceRefresh is not blocked for a slot that has resolved before", () => {
    // RefreshSpmPlayerSlotCache passes forceRefresh=true. When the freeze was
    // decided above the forceRefresh checks it was blocked too, which froze
    // State.spm.playerPanels — the first path ql_nicknames tries.
    const { h, hud, topBar, cards } = bootWithTopBar(12);
    bindRoot(h, hud);
    lookup(h, hud, 5, 1000, false);
    cards[4].DeleteAsync(0);
    h.clock.advance(1);
    const missAt = 1000 + CACHE_REFRESH_MS + 500;
    lookup(h, hud, 5, missAt, false);          // real miss: arms whatever cooldown applies
    assert.strictEqual(h.sandbox.eval("String(QOL.state.topbarPlayerPanels[5])"), "null",
        "precondition: the miss nulled the cache");
    topBar.addChild(h.doc.create("Panel", { id: "TopBarPlayer5", classes: [] }));

    assert.ok(lookup(h, hud, 5, missAt + 100, true),
        "forceRefresh must reach a real slot that just came back");
});

test("REGRESSION: a miss before the top bar exists does not freeze every slot", () => {
    // Loading screen / draft / hideout: the HUD context is up and TopBarPlayerN
    // does not exist yet. Keying the long cooldown on "this slot never resolved"
    // armed 30s on all thirteen, so the whole top bar stayed blank for half a
    // minute after it finally inflated.
    const { h, hud } = bootWithTopBar(0);
    bindRoot(h, hud);
    const topBar = h.doc.create("Panel", { id: "TopBar", classes: [] });
    hud.addChild(topBar);

    for (let i = 0; i < 13; i++) {
        assert.strictEqual(lookup(h, hud, i, 1000, false), false,
            `slot ${i} cannot resolve before the top bar inflates`);
    }

    // The top bar inflates.
    for (let i = 1; i <= 12; i++) {
        topBar.addChild(h.doc.create("Panel", { id: `TopBarPlayer${i}`, classes: [] }));
    }

    const at = 1000 + CACHE_REFRESH_MS + 100;
    for (let i = 1; i <= 12; i++) {
        assert.ok(lookup(h, hud, i, at, false),
            `slot ${i} must resolve once the top bar exists — it was never absent, only early`);
    }
    assert.ok(at - 1000 < MISSING_RECHECK_MS,
        "sanity: the assertion above has to fall inside the long cooldown to mean anything");
});
