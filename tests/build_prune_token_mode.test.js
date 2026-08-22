// tests/build_prune_token_mode.test.js
// =============================================================================
// Post-save prune, run under TOKEN title mode.
// =============================================================================
// tests/build_prune.test.js covers the same pipeline but inherits the
// simulator's RESOLVED default, where a dialog-variable-backed Label reports its
// value through `.text`. Whether the engine really does that is UNVERIFIED, and
// scripts/simulator/game/builds.js:41 states the rule for this repo — "WHEN
// GUESSING, GUESS AGAINST OURSELVES ... Unverified reads default to TOKEN" —
// naming the incident where a save-verify regression shipped green at 14/14
// because the model resolved text the engine does not.
//
// Prune deletes user data and its ONLY safety check is "does this build hold a
// payload", answered by reading exactly those labels. So it has to be exercised
// in the pessimistic mode too: under TOKEN, `.text` holds
// "#Citadel_HeroBuilds_CategoryName" and the value lives in the attribute store.
// A text-first reader sees the template, finds no token, and concludes the build
// is junk — which is how the payload build got deleted.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");
const { TITLE_MODE } = require("../scripts/simulator/game/builds.js");

const CLEAR_REQUEST_ATTR = "QOL_BUILD_CLEAR_REQUEST";
const CLEAR_STATE_ATTR = "QOL_BUILD_CLEAR_STATE";
const CLEAR_MSG_ATTR = "QOL_BUILD_CLEAR_MSG";

function bootHud() {
    const h = sim.createHud({ inHideout: true, titleMode: TITLE_MODE.TOKEN });
    h.assertLoaded();
    return h;
}

function makeToken(h) {
    return h.sandbox.eval("QOL.buildDefaultPayloadToken({})");
}

function requestPrune(h) {
    for (const panel of [h.doc.root, h.doc.absRoot]) {
        panel.SetAttributeString(CLEAR_REQUEST_ATTR, "prune");
        panel.SetAttributeString(CLEAR_STATE_ATTR, "pending");
        panel.SetAttributeString(CLEAR_MSG_ATTR, "queued");
    }
}

function payloadBuildCount(h, token) {
    return h.game.builds.filter((b) => b.categories.some((c) => c.name.includes(token))).length;
}

function readAttr(h, attr) {
    return h.doc.absRoot.GetAttributeString(attr, "") || h.doc.root.GetAttributeString(attr, "");
}

test("the fixture really is in the pessimistic mode", () => {
    // Without this, a regression in _applyCategoryText would silently turn every
    // test below back into a RESOLVED-mode run that proves nothing.
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "QOLLOCK-Settings", categories: [token] }]);
    h.game.openShop();
    h.clock.advance(3000);

    const labelText = h.sandbox.eval(`(function(){
        var p = __probeRoot.FindChildTraverse("BuildCategoryName");
        return p ? String(p.text || "") : "";
    })()`.replace("__probeRoot", "$.GetContextPanel()"));
    assert.match(labelText, /^#Citadel_HeroBuilds_CategoryName$/,
        `category label should report the template under TOKEN mode, got ${JSON.stringify(labelText)}`);
});

test("REGRESSION: the payload build survives a prune under TOKEN mode", () => {
    // The data-loss case. The prune's guard reads the category labels; if it reads
    // only `.text` it sees the template, finds no token, and deletes the build
    // holding the user's entire config.
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "QOLLOCK-Settings", categories: [token] },
        { title: "New Skyrunner Build", categories: ["Core Items"] },
    ]);
    h.game.openShop();
    h.clock.advance(3000);

    requestPrune(h);
    h.clock.advance(45000);

    assert.strictEqual(payloadBuildCount(h, token), 1,
        `the payload build was deleted — the settings are gone\n${h.diagnose()}`);
});

test("REGRESSION: a single-build account does not lose that build", () => {
    // CollectStorageBuildEntryPanels also matches FavoriteBuildEntryContainer, a
    // header strip that exists regardless of build count, so the entry count is
    // builds+1 and the "stop before the last one" guard did not trip at one build.
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "QOLLOCK-Settings", categories: [token] }]);
    h.game.openShop();
    h.clock.advance(3000);

    requestPrune(h);
    h.clock.advance(45000);

    assert.strictEqual(h.game.builds.length, 1,
        `prune deleted the only build\n${h.diagnose()}`);
    assert.strictEqual(payloadBuildCount(h, token), 1, `payload lost\n${h.diagnose()}`);
});

test("REGRESSION: builds that are not ours are not deleted wholesale", () => {
    // No payload anywhere: either the save landed somewhere this pass cannot see,
    // or these are the user's own hero builds. Neither is licence to empty the list.
    const h = bootHud();
    h.game.seedBuilds([
        { title: "My Lash Build", categories: ["Core Items"] },
        { title: "Lane Lash", categories: ["Core Items"] },
        { title: "Jungle Lash", categories: ["Core Items"] },
        { title: "Fun Lash", categories: ["Core Items"] },
        { title: "Try-hard Lash", categories: ["Core Items"] },
    ]);
    h.game.openShop();
    h.clock.advance(3000);

    const before = h.game.builds.length;
    requestPrune(h);
    h.clock.advance(45000);

    assert.ok(h.game.builds.length >= 1,
        `prune emptied the build list entirely\n${h.diagnose()}`);
    assert.ok(h.game.builds.length === before,
        `prune deleted ${before - h.game.builds.length} of ${before} builds it had no payload evidence about\n${h.diagnose()}`);
});

test("prune still terminates and clears its request", () => {
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "QOLLOCK-Settings", categories: [token] },
    ]);
    h.game.openShop();
    h.clock.advance(3000);

    requestPrune(h);
    h.clock.advance(45000);

    assert.notStrictEqual(readAttr(h, CLEAR_STATE_ATTR), "pending",
        `prune never terminated\n${h.diagnose()}`);
    assert.strictEqual(h.clock.errors.length, 0, `pipeline threw\n${h.diagnose()}`);
});
