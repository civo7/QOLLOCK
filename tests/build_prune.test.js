// tests/build_prune.test.js
// =============================================================================
// Post-save cleanup of junk storage builds.
// =============================================================================
// After a verified save, the mod asks the clear pipeline to delete the junk
// builds around the one it just wrote, in "prune" mode — so the accumulation
// existing players cleared by hand goes away on its own.
//
// This deletes user-visible data through a path that cannot report failure
// (TryDismissBuildDeletePopup is a stub; FindBuildDeleteConfirmButton matches
// English button text), so every test here is about it failing CLOSED: never
// touching the payload build, and giving up rather than pushing on.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

const CLEAR_REQUEST_ATTR = "QOL_BUILD_CLEAR_REQUEST";
const CLEAR_STATE_ATTR = "QOL_BUILD_CLEAR_STATE";
const CLEAR_MSG_ATTR = "QOL_BUILD_CLEAR_MSG";

function bootHud(opts = {}) {
    const h = sim.createHud({ inHideout: true, ...opts });
    h.assertLoaded();
    return h;
}

function makeToken(h) {
    return h.sandbox.eval("QOL.buildDefaultPayloadToken({})");
}

function readAttr(h, attr) {
    return h.doc.absRoot.GetAttributeString(attr, "") || h.doc.root.GetAttributeString(attr, "");
}

/** Enqueue a prune directly, the way FinishBuildSaveRequest does on success. */
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

test("prune keeps the payload build and removes junk around it", () => {
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

    assert.strictEqual(
        payloadBuildCount(h, token),
        1,
        `the payload build must survive\n${h.diagnose()}`
    );
    assert.ok(
        h.game.builds.length < 4,
        `expected some junk to be removed, still ${h.game.builds.length}\n${h.diagnose()}`
    );
});

test("REGRESSION: prune never deletes the last remaining payload build", () => {
    // The catastrophic case. If prune ever wipes this, the config is gone.
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "QOLLOCK-Settings", categories: [token] }]);
    h.game.openShop();
    h.clock.advance(3000);

    requestPrune(h);
    h.clock.advance(45000);

    assert.strictEqual(
        h.game.builds.length,
        1,
        `prune deleted the only build\n${h.diagnose()}`
    );
    assert.strictEqual(payloadBuildCount(h, token), 1, `payload lost\n${h.diagnose()}`);
});

test("prune does nothing when every build holds a payload", () => {
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([
        { title: "QOLLOCK-Settings", categories: [token] },
        { title: "QOLLOCK-Settings", categories: [token] },
    ]);
    h.game.openShop();
    h.clock.advance(3000);

    const before = h.game.builds.length;
    requestPrune(h);
    h.clock.advance(45000);

    assert.strictEqual(
        h.game.builds.length,
        before,
        `nothing was safe to delete, so nothing should have been\n${h.diagnose()}`
    );
});

test("prune terminates and clears the request the loop reads", () => {
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

    const state = readAttr(h, CLEAR_STATE_ATTR);
    assert.notStrictEqual(state, "pending", `prune never finished\n${h.diagnose()}`);

    // Assert on the absolute root specifically: buildRequestLoop resolves its
    // root via GetUIRoot(), which walks to the topmost panel. That copy is what
    // IsBuildRequestQueueActive() reads, so leaving it set pins the loop at its
    // 50ms active interval for the rest of the session. The settings context also
    // writes a copy to its own panel, which the HUD never consults.
    assert.strictEqual(
        h.doc.absRoot.GetAttributeString(CLEAR_REQUEST_ATTR, ""),
        "",
        `request attribute must be cleared on the root the loop polls\n${h.diagnose()}`
    );
});

test("prune gives up when deletes do not land", () => {
    // Simulates the known-shaky delete path: the confirmation is never dismissed
    // so nothing is actually removed. Prune must abort, not hammer it.
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "QOLLOCK-Settings", categories: [token] },
    ]);
    h.game.openShop();
    h.clock.advance(3000);

    let attempts = 0;
    h.game.deleteSelectedBuild = function () {
        attempts++;
        this.counters.deleteBuild++;
        this._trace("deleteSelectedBuild IGNORED (simulated stuck confirmation)");
        return false;
    };

    requestPrune(h);
    h.clock.advance(60000);

    assert.strictEqual(h.game.builds.length, 3, "fixture: nothing should have been deleted");
    assert.notStrictEqual(
        readAttr(h, CLEAR_STATE_ATTR),
        "pending",
        `prune should have terminated\n${h.diagnose()}`
    );
    assert.ok(
        attempts < 100,
        `prune retried ${attempts} times — the no-progress guard is not working`
    );
});

test("prune is skipped when the shop is closed", () => {
    // Delete controls only exist with the shop open, and repointing the user's
    // shop to delete things unprompted is not acceptable.
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "QOLLOCK-Settings", categories: [token] },
    ]);
    h.clock.advance(3000);
    assert.strictEqual(h.game.shopOpen, false, "fixture: shop must be closed");

    const queued = h.sandbox.eval(
        'QOL.queueStorageBuildPrune ? QOL.queueStorageBuildPrune($.GetContextPanel()) : "missing"'
    );
    assert.strictEqual(queued, false, `prune should refuse with the shop closed (got ${queued})`);
});

test("REGRESSION: a completed clear releases the request so the loop can idle", () => {
    // The clear pipeline used to leave its request attribute set after finishing,
    // unlike the save pipeline which resets its own. IsBuildRequestQueueActive()
    // therefore stayed true forever: buildRequestLoop never dropped back to its
    // deep-idle interval and polled at 50ms for the rest of the session, and no
    // second clear or prune could be enqueued because the queue never looked free.
    const h = bootHud();
    h.game.seedBuilds([{ title: "New Skyrunner Build", categories: ["Core Items"] }]);
    h.game.openShop();
    h.clock.advance(3000);

    for (const panel of [h.doc.root, h.doc.absRoot]) {
        panel.SetAttributeString(CLEAR_REQUEST_ATTR, "1");
        panel.SetAttributeString(CLEAR_STATE_ATTR, "pending");
    }
    h.clock.advance(45000);

    assert.strictEqual(h.game.builds.length, 0, `clear should have emptied the list\n${h.diagnose()}`);
    assert.strictEqual(
        h.doc.absRoot.GetAttributeString(CLEAR_REQUEST_ATTR, ""),
        "",
        `completed clear left its request set — the loop cannot idle\n${h.diagnose()}`
    );
});

test("a plain clear request still wipes everything", () => {
    // Prune mode is opt-in via the attribute value; the explicit user-triggered
    // "clear all" must keep its original behaviour.
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "QOLLOCK-Settings", categories: [token] },
    ]);
    h.game.openShop();
    h.clock.advance(3000);

    for (const panel of [h.doc.root, h.doc.absRoot]) {
        panel.SetAttributeString(CLEAR_REQUEST_ATTR, "1");
        panel.SetAttributeString(CLEAR_STATE_ATTR, "pending");
        panel.SetAttributeString(CLEAR_MSG_ATTR, "queued");
    }
    h.clock.advance(45000);

    assert.strictEqual(
        h.game.builds.length,
        0,
        `explicit clear should remove every build\n${h.diagnose()}`
    );
});
