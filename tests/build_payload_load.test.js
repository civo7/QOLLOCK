// tests/build_payload_load.test.js
// =============================================================================
// Acceptance tests for the startup settings loader (ql_build_payload).
// =============================================================================
// Reproduces the field bug reported 2026-08-19: with several Skyrunner builds,
// the loader reports "No payload found. Kept current config." and the player's
// settings appear reset. Community workaround was to delete every Skyrunner
// build by hand before every save.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");
const { TITLE_MODE } = require("../scripts/simulator/game/builds.js");

// A REAL payload token, produced by the mod's own codec so it actually decodes.
// A hand-written fake fails at `deserialize_failed` and would make every test
// look like a scan failure when it is really a fixture problem.
let PAYLOAD = null;
function payloadToken() {
    if (PAYLOAD) return PAYLOAD;
    const probe = sim.createHud({ inHideout: true, boot: true });
    probe.assertLoaded();
    PAYLOAD = probe.sandbox.eval("QOL.buildDefaultPayloadToken({})");
    assert.ok(
        typeof PAYLOAD === "string" && PAYLOAD.startsWith("[QOL-"),
        `could not generate a payload token, got ${JSON.stringify(PAYLOAD)}`
    );
    return PAYLOAD;
}

/** Boot a HUD, seed builds, run the loader to completion. */
function runLoader({ buildCount, payloadAt, titleMode = TITLE_MODE.RESOLVED, latency = {}, ms = 45000 }) {
    const h = sim.createHud({ inHideout: true, titleMode, latency });
    h.assertLoaded();
    h.game.seedWithPayloadAt(buildCount, payloadAt, payloadToken());
    const initialCount = h.game.builds.length;
    h.clock.advance(ms);
    return { h, initialCount };
}

function finalizeLine(h) {
    const lines = h.sandbox.grepMessages("load:FinalizeSession");
    return lines.length > 0 ? lines[lines.length - 1] : "";
}

test("loader boots and reaches read_payload", () => {
    const { h } = runLoader({ buildCount: 1, payloadAt: 0 });
    const stages = h.sandbox.grepMessages("stage:").map((m) => m.split("stage:")[1].trim());
    assert.ok(stages.includes("wait_hideout"), `expected wait_hideout\n${h.diagnose()}`);
    assert.ok(stages.includes("confirm_storage"), `expected confirm_storage\n${h.diagnose()}`);
    assert.ok(stages.includes("read_payload"), `expected read_payload\n${h.diagnose()}`);
    assert.strictEqual(h.clock.errors.length, 0, `poll loop threw\n${h.diagnose()}`);
});

test("payload in the selected build is found", () => {
    // Baseline sanity: index 0 is what the shop selects by default.
    const { h } = runLoader({ buildCount: 1, payloadAt: 0 });
    assert.match(finalizeLine(h), /Payload applied/, `should have applied\n${h.diagnose()}`);
});

test("REGRESSION: payload in a non-selected build is found (8 builds, payload in #6)", () => {
    // This is the reported bug. The loader must visit other builds to find it.
    const { h } = runLoader({ buildCount: 8, payloadAt: 5 });
    assert.ok(
        h.game.counters.selectBuild > 0,
        `loader never selected any build, so it could only ever see the one the ` +
        `shop had already chosen\n${h.diagnose()}`
    );
    assert.match(
        finalizeLine(h),
        /Payload applied/,
        `payload at index 5 of 8 was not found\n${h.diagnose()}`
    );
});

test("REGRESSION: loader must not create a build when builds already exist", () => {
    // Every junk build steals the shop's selection from the payload build, so
    // this is what made the bug compound on each boot.
    const { h, initialCount } = runLoader({ buildCount: 8, payloadAt: 5 });
    assert.strictEqual(
        h.game.counters.createBuild,
        0,
        `created ${h.game.counters.createBuild} build(s) despite ${initialCount} already existing ` +
        `(now ${h.game.builds.length})\n${h.diagnose()}`
    );
    assert.strictEqual(h.game.builds.length, initialCount, "build count must not grow");
});

test("payload is found at every position in the list", () => {
    const COUNT = 8;
    for (let at = 0; at < COUNT; at++) {
        const { h } = runLoader({ buildCount: COUNT, payloadAt: at });
        assert.match(
            finalizeLine(h),
            /Payload applied/,
            `payload at index ${at}/${COUNT} not found\n${h.diagnose()}`
        );
    }
});

test("works when build titles are unreadable (dialog-variable mode)", () => {
    // Vanilla backs build-name Labels with dialog variables
    // (citadel_main_english.txt:2247), so `panel.text` may return the raw
    // token. Real behaviour is unverified, so the loader must not depend on it.
    const { h } = runLoader({ buildCount: 8, payloadAt: 5, titleMode: TITLE_MODE.TOKEN });
    assert.match(
        finalizeLine(h),
        /Payload applied/,
        `loader must not depend on readable build titles\n${h.diagnose()}`
    );
});

test("empty build list is the only case that may create a build", () => {
    const h = sim.createHud({ inHideout: true });
    h.assertLoaded();
    h.game.seedBuilds([]);
    h.clock.advance(45000);
    assert.ok(
        h.game.counters.createBuild >= 1,
        `with zero builds the loader should create the storage build\n${h.diagnose()}`
    );
});

test("tolerates slow category rendering", () => {
    // The scan must gate on settle time, not on poll count.
    const { h } = runLoader({
        buildCount: 8,
        payloadAt: 5,
        latency: { selectBuildMs: 600 },
        ms: 60000,
    });
    assert.match(
        finalizeLine(h),
        /Payload applied/,
        `slow category render broke the scan\n${h.diagnose()}`
    );
});

test("REGRESSION: the build list is collapsed and must be expanded to enumerate", () => {
    // Ground truth from real game logs (2026-08-20): #FavoriteBuildList is empty
    // in XML and the engine only fills it once the build dropdown is expanded.
    // Until then the only .FavoriteBuildEntryContainer in the tree is the selected
    // build's own header entry — so a class sweep reports ONE entry regardless of
    // how many builds exist. The logs said "1 storage entr(ies) present" with six
    // builds on the account.
    //
    // The simulator originally populated that list unconditionally, which is why
    // the suite was green while the game failed. This test pins the real shape.
    const h = sim.createHud({ inHideout: true });
    h.assertLoaded();
    h.game.seedWithPayloadAt(8, 5, payloadToken());
    h.game.openShop();
    h.clock.advance(2000);

    assert.strictEqual(
        h.game.favoritesExpanded,
        false,
        "fixture: the dropdown must start collapsed"
    );
    const collapsed = h.sandbox.evalJson(
        'QOL.collectStorageBuildEntryPanels($.GetContextPanel(), true).length'
    );
    assert.strictEqual(
        collapsed,
        1,
        `a collapsed list must expose exactly one entry, got ${collapsed}`
    );

    // Now let the loader run: it has to expand the list itself to get anywhere.
    h.clock.advance(60000);
    assert.ok(
        h.game.counters.toggleSelector > 0,
        `loader never expanded the build dropdown, so it could not enumerate\n${h.diagnose()}`
    );
    assert.match(finalizeLine(h), /Payload applied/, `\n${h.diagnose()}`);
});

test("selecting a build collapses the list, and the sweep recovers", () => {
    // Picking an entry closes the dropdown, so the sweep must re-expand between
    // every step rather than holding panel references across the collapse.
    const { h } = runLoader({ buildCount: 8, payloadAt: 7, ms: 60000 });
    assert.match(finalizeLine(h), /Payload applied/, `\n${h.diagnose()}`);
    assert.ok(
        h.game.counters.toggleSelector >= h.game.counters.selectBuild,
        `expected one re-expand per selection, got ${h.game.counters.toggleSelector} ` +
        `expands for ${h.game.counters.selectBuild} selections\n${h.diagnose()}`
    );
});

test("no duplicate ids or handler throws in the simulated tree", () => {
    const { h } = runLoader({ buildCount: 8, payloadAt: 5 });
    const problems = h.doc.assertClean();
    assert.deepStrictEqual(problems, [], `tree anomalies:\n${problems.join("\n")}`);
});
