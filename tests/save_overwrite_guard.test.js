// tests/save_overwrite_guard.test.js
// =============================================================================
// The save pipeline must refuse to overwrite a config it never managed to read.
// =============================================================================
// There is one copy of the user's settings and it lives inside a hero build. If
// the loader could not read it, the running config is defaults — so saving
// writes defaults over real settings and they are unrecoverable. This is the
// only irreversible failure in the pipeline.
//
// State.configLoadState (ql_state.js) records how conclusive the load was:
//   pending | loaded | failed
// and features/ql_feat_buildsave.js gates on it.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

const REQUEST_ATTR = "QOL_BUILD_SAVE_REQUEST";
const TOKEN_ATTR = "QOL_BUILD_SAVE_TOKEN";
const STATE_ATTR = "QOL_BUILD_SAVE_STATE";
const MSG_ATTR = "QOL_BUILD_SAVE_MSG";
const FORCE_ATTR = "QOL_BUILD_SAVE_FORCE";

function bootHud(opts = {}) {
    const h = sim.createHud({ inHideout: true, ...opts });
    h.assertLoaded();
    return h;
}

function makeToken(h) {
    const token = h.sandbox.eval("QOL.buildDefaultPayloadToken({})");
    assert.ok(typeof token === "string" && token.startsWith("[QOL-"), `bad token: ${token}`);
    return token;
}

function requestSave(h, token, { force = false } = {}) {
    for (const panel of [h.doc.root, h.doc.absRoot]) {
        panel.SetAttributeString(REQUEST_ATTR, token);
        panel.SetAttributeString(TOKEN_ATTR, `${h.clock.now()}_test`);
        panel.SetAttributeString(MSG_ATTR, "queued");
        panel.SetAttributeString(STATE_ATTR, "pending");
        if (force) panel.SetAttributeString(FORCE_ATTR, "1");
    }
}

function readAttr(h, attr) {
    return h.doc.absRoot.GetAttributeString(attr, "") || h.doc.root.GetAttributeString(attr, "");
}

function loadState(h) {
    return h.sandbox.eval("QOL.state.configLoadState");
}

/** Categories across all builds, so we can prove nothing was overwritten. */
function snapshotCategories(h) {
    return h.game.builds.map((b) => b.categories.map((c) => c.name).join("|"));
}

test("a readable config records loaded and permits saving", () => {
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "New Skyrunner Build", categories: [token] }]);
    h.clock.advance(45000);

    assert.strictEqual(loadState(h), "loaded", `\n${h.diagnose()}`);

    h.game.openShop();
    h.clock.advance(2000);
    requestSave(h, token);
    h.clock.advance(30000);
    assert.strictEqual(readAttr(h, STATE_ATTR), "success", `\n${h.diagnose()}`);
});

test("genuinely empty storage records loaded, so a first save still works", () => {
    // Nothing to lose when there is no build at all — a new user must be able
    // to save. This is the case the guard must NOT block.
    const h = bootHud();
    h.game.seedBuilds([]);
    h.clock.advance(45000);

    assert.strictEqual(
        loadState(h),
        "loaded",
        `empty storage must not be treated as an unread config\n${h.diagnose()}`
    );

    const token = makeToken(h);
    h.game.openShop();
    h.clock.advance(2000);
    requestSave(h, token);
    h.clock.advance(30000);
    assert.strictEqual(
        readAttr(h, STATE_ATTR),
        "success",
        `first-time save must not be blocked\n${h.diagnose()}`
    );
});

test("REGRESSION: an unreadable-but-present config blocks the save", () => {
    // A build exists but carries no payload we can decode. Real settings may be
    // sitting in it, so a save must not proceed.
    const h = bootHud();
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["[QOL-9-9-9]:corruptgarbage"] },
    ]);
    h.clock.advance(45000);

    assert.strictEqual(
        loadState(h),
        "failed",
        `a present-but-unreadable config must record failed\n${h.diagnose()}`
    );

    const before = snapshotCategories(h);
    const token = makeToken(h);
    h.game.openShop();
    h.clock.advance(2000);
    requestSave(h, token);
    h.clock.advance(30000);

    assert.strictEqual(
        readAttr(h, STATE_ATTR),
        "failed",
        `save should have been refused\n${h.diagnose()}`
    );
    assert.strictEqual(
        readAttr(h, MSG_ATTR),
        "blocked_unread_config",
        `expected the blocked reason, got "${readAttr(h, MSG_ATTR)}"\n${h.diagnose()}`
    );
    assert.deepStrictEqual(
        snapshotCategories(h),
        before,
        `stored config was modified despite the guard\n${h.diagnose()}`
    );
});

test("the block is reported with an actionable message", () => {
    const h = bootHud();
    const detail = h.sandbox.eval(
        'QOL.getSaveSettingsLoaderDetailForMessage("blocked_unread_config")'
    );
    assert.match(detail, /could not be read/i, `unhelpful message: ${detail}`);
    assert.match(detail, /overwrite/i, `message should name the risk: ${detail}`);
    assert.match(detail, /again/i, `message should offer a way through: ${detail}`);
});

test("pressing Save a second time overrides the block", () => {
    // Blocking outright turned a load failure into "you cannot save at all", with
    // no escape from the UI — worse than the risk, since the config is already
    // unreadable. First press explains and arms; second press goes through.
    const h = bootHud();
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["[QOL-9-9-9]:corruptgarbage"] },
    ]);
    h.clock.advance(45000);
    assert.strictEqual(loadState(h), "failed");

    const token = makeToken(h);
    h.game.openShop();
    h.clock.advance(2000);

    requestSave(h, token);
    h.clock.advance(30000);
    assert.strictEqual(
        readAttr(h, MSG_ATTR),
        "blocked_unread_config",
        `first press should be refused\n${h.diagnose()}`
    );

    requestSave(h, token);
    h.clock.advance(30000);
    assert.strictEqual(
        readAttr(h, STATE_ATTR),
        "success",
        `second press should be accepted as confirmation\n${h.diagnose()}`
    );
});

test("an explicit force flag overrides the guard and is consumed", () => {
    const h = bootHud();
    h.game.seedBuilds([
        { title: "New Skyrunner Build", categories: ["[QOL-9-9-9]:corruptgarbage"] },
    ]);
    h.clock.advance(45000);
    assert.strictEqual(loadState(h), "failed");

    const token = makeToken(h);
    h.game.openShop();
    h.clock.advance(2000);
    requestSave(h, token, { force: true });
    h.clock.advance(30000);

    assert.strictEqual(
        readAttr(h, STATE_ATTR),
        "success",
        `force flag should permit the overwrite\n${h.diagnose()}`
    );
    assert.strictEqual(
        readAttr(h, FORCE_ATTR),
        "",
        "force flag must be consumed so it cannot silently persist"
    );
});

test("configLoadState starts as pending before any load runs", () => {
    // "pending" must not be treated as a failure, or the very first save of a
    // session would be blocked before the loader has had a chance to finish.
    const h = bootHud();
    assert.strictEqual(loadState(h), "pending", `\n${h.diagnose()}`);
});
