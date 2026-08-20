// tests/build_payload_save.test.js
// =============================================================================
// Save pipeline: round-trip, verification honesty, and overwrite protection.
// =============================================================================
// The save request is kicked off by writing the payload token into the
// QOL_BUILD_SAVE_REQUEST attribute on the Hud root (ql_bridge.js:29); the HUD
// state machine in features/ql_feat_buildsave.js picks it up from there.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");
const { TITLE_MODE } = require("../scripts/simulator/game/builds.js");

const REQUEST_ATTR = "QOL_BUILD_SAVE_REQUEST";
const TOKEN_ATTR = "QOL_BUILD_SAVE_TOKEN";
const STATE_ATTR = "QOL_BUILD_SAVE_STATE";
const MSG_ATTR = "QOL_BUILD_SAVE_MSG";

function bootHud(opts = {}) {
    const h = sim.createHud({ inHideout: true, ...opts });
    h.assertLoaded();
    return h;
}

/** A real token from the mod's own codec, optionally with a distinguishing tweak. */
function makeToken(h, overrides) {
    const arg = JSON.stringify(overrides || {});
    const token = h.sandbox.eval(`QOL.buildDefaultPayloadToken(${arg})`);
    assert.ok(typeof token === "string" && token.startsWith("[QOL-"), `bad token: ${token}`);
    return token;
}

/**
 * Enqueue a save exactly the way the settings UI does
 * (ql_settings.js:1722-1742 QueueBuildSaveRequest): write request + token and
 * pre-set state to "pending" on BOTH the context panel and the absolute root.
 *
 * Both targets matter: the HUD loop resolves its root via GetUIRoot()
 * (ql_core.js), which walks the parent chain to the topmost panel — not the Hud
 * panel — so a request written only to #Hud is never seen and the loop stays in
 * deep idle.
 */
function requestSave(h, token) {
    const stamp = `${h.clock.now()}_test`;
    for (const panel of [h.doc.root, h.doc.absRoot]) {
        panel.SetAttributeString(REQUEST_ATTR, token);
        panel.SetAttributeString(TOKEN_ATTR, stamp);
        panel.SetAttributeString(MSG_ATTR, "queued");
        panel.SetAttributeString(STATE_ATTR, "pending");
    }
    return stamp;
}

/** Save status, read from either target (the HUD writes to the root it resolved). */
function saveState(h) {
    return (
        h.doc.absRoot.GetAttributeString(STATE_ATTR, "") ||
        h.doc.root.GetAttributeString(STATE_ATTR, "")
    );
}

function saveMsg(h) {
    return (
        h.doc.absRoot.GetAttributeString(MSG_ATTR, "") ||
        h.doc.root.GetAttributeString(MSG_ATTR, "")
    );
}

test("save writes the payload into the selected build and verifies it", () => {
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "New Skyrunner Build", categories: ["Core Items"] }]);
    h.game.openShop();
    h.clock.advance(3000);

    requestSave(h, token);
    h.clock.advance(30000);

    assert.strictEqual(saveState(h), "success", `save did not succeed: ${saveMsg(h)}\n${h.diagnose()}`);
    const stored = h.game.builds[0].categories.map((c) => c.name).join(" | ");
    assert.ok(
        stored.includes(token),
        `token was not committed to the build model.\ncategories: ${stored}\n${h.diagnose()}`
    );
});

test("REGRESSION: verify must not pass when SaveEdits does not commit", () => {
    // The client ignores SaveEdits outside edit mode. Verification used to read
    // CategoryNameTextEntry — the editor's own buffer — before the persisted
    // BuildCategoryName label, so a no-op save still looked like success and the
    // config was silently never written.
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "New Skyrunner Build", categories: ["Core Items"] }]);
    h.game.openShop();
    h.clock.advance(3000);

    // Make every commit a no-op while leaving the editor buffer writable.
    h.game.saveEdits = function () {
        this.counters.saveEdits++;
        this._trace("saveEdits STUBBED to no-op");
        return false;
    };

    requestSave(h, token);
    h.clock.advance(30000);

    const committed = h.game.builds[0].categories.map((c) => c.name).join(" | ");
    assert.ok(
        !committed.includes(token),
        "fixture is wrong: the stub should have prevented any commit"
    );
    assert.notStrictEqual(
        saveState(h),
        "success",
        `save reported success while nothing was committed — verification is reading ` +
        `the editor buffer instead of the persisted label\n${h.diagnose()}`
    );
});

test("round-trip: saved config is what the loader reads back on the next boot", () => {
    // The property that actually matters to a player.
    const writer = bootHud();
    const token = makeToken(writer);
    writer.game.seedBuilds([{ title: "New Skyrunner Build", categories: ["Core Items"] }]);
    writer.game.openShop();
    writer.clock.advance(3000);
    requestSave(writer, token);
    writer.clock.advance(30000);
    assert.strictEqual(saveState(writer), "success", `save failed: ${saveMsg(writer)}\n${writer.diagnose()}`);

    // Carry the resulting build list into a fresh boot.
    const persisted = writer.game.builds.map((b) => ({
        title: b.title,
        categories: b.categories.map((c) => c.name),
    }));

    const reader = bootHud();
    reader.game.seedBuilds(persisted);
    reader.clock.advance(45000);

    const finalize = reader.sandbox.grepMessages("load:FinalizeSession").pop() || "";
    assert.match(
        finalize,
        /Payload applied/,
        `loader could not read back what save wrote\npersisted: ${JSON.stringify(persisted)}\n${reader.diagnose()}`
    );
});

test("save survives extra junk builds in the list", () => {
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "New Skyrunner Build", categories: ["Core Items"] },
        { title: "New Skyrunner Build", categories: ["Core Items"] },
    ]);
    // Let the loader finish first. It sweeps the list, changing the selected build
    // as it goes; saving mid-sweep races it for the selection, which is not what a
    // player does — they save after boot settles.
    h.clock.advance(60000);
    h.game.openShop();
    h.clock.advance(3000);

    requestSave(h, token);
    h.clock.advance(30000);

    assert.strictEqual(saveState(h), "success", `save failed with junk present: ${saveMsg(h)}\n${h.diagnose()}`);
    const withToken = h.game.builds.filter((b) => b.categories.some((c) => c.name.includes(token)));
    assert.strictEqual(
        withToken.length,
        1,
        `expected exactly one build to carry the payload, got ${withToken.length}\n${h.diagnose()}`
    );
});

test("save works when build titles are unreadable", () => {
    const h = bootHud({ titleMode: TITLE_MODE.TOKEN });
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "New Skyrunner Build", categories: ["Core Items"] }]);
    h.game.openShop();
    h.clock.advance(3000);

    requestSave(h, token);
    h.clock.advance(30000);

    assert.strictEqual(
        saveState(h),
        "success",
        `save must not depend on readable titles: ${saveMsg(h)}\n${h.diagnose()}`
    );
});
