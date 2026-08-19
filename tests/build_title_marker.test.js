// tests/build_title_marker.test.js
// =============================================================================
// The marker title is a fast path, never a dependency.
// =============================================================================
// Save stamps BuildNameTextEntry with "QOLLOCK-Settings" so the loader can jump
// straight to the payload build instead of visiting every build in turn.
//
// This CANNOT be verified in-game from JS: vanilla renders build titles from a
// dialog variable ({s:selected_hero_build_name}, citadel_main_english.txt:2247),
// and nothing hands a title back to us. So every test here runs the same
// scenario in both fidelity modes, and the loader must succeed in both.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");
const { TITLE_MODE } = require("../scripts/simulator/game/builds.js");

const MARKER = "QOLLOCK-Settings";
// citadel_hud_hero_builds.xml:25
const BUILD_NAME_MAXCHARS = 50;

function bootHud(opts = {}) {
    const h = sim.createHud({ inHideout: true, ...opts });
    h.assertLoaded();
    return h;
}

function makeToken(h) {
    return h.sandbox.eval("QOL.buildDefaultPayloadToken({})");
}

function requestSave(h, token) {
    for (const panel of [h.doc.root, h.doc.absRoot]) {
        panel.SetAttributeString("QOL_BUILD_SAVE_REQUEST", token);
        panel.SetAttributeString("QOL_BUILD_SAVE_TOKEN", `${h.clock.now()}_t`);
        panel.SetAttributeString("QOL_BUILD_SAVE_MSG", "queued");
        panel.SetAttributeString("QOL_BUILD_SAVE_STATE", "pending");
    }
}

function saveState(h) {
    return h.doc.absRoot.GetAttributeString("QOL_BUILD_SAVE_STATE", "") ||
           h.doc.root.GetAttributeString("QOL_BUILD_SAVE_STATE", "");
}

test("the marker fits the build-name field's maxchars", () => {
    // If it ever exceeds 50 the client truncates and the fast path silently
    // stops matching, with no error anywhere.
    assert.ok(
        MARKER.length <= BUILD_NAME_MAXCHARS,
        `marker is ${MARKER.length} chars, field caps at ${BUILD_NAME_MAXCHARS}`
    );
});

test("save stamps the marker title onto the storage build", () => {
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "New Skyrunner Build", categories: ["Core Items"] }]);
    h.game.openShop();
    h.clock.advance(2000);
    requestSave(h, token);
    h.clock.advance(30000);

    assert.strictEqual(saveState(h), "success", `\n${h.diagnose()}`);
    assert.strictEqual(
        h.game.builds[0].title,
        MARKER,
        `build title was not stamped\n${h.diagnose()}`
    );
});

test("the marker is not truncated when committed", () => {
    const h = bootHud();
    const token = makeToken(h);
    h.game.seedBuilds([{ title: "New Skyrunner Build", categories: ["Core Items"] }]);
    h.game.openShop();
    h.clock.advance(2000);
    requestSave(h, token);
    h.clock.advance(30000);

    assert.strictEqual(
        h.game.buildNameEntry.text,
        MARKER,
        `field clamped the marker — it exceeds maxchars\n${h.diagnose()}`
    );
});

test("the payload still goes in the category name, not the title", () => {
    // The title field caps at 50 chars; a real payload is ~214. Putting it there
    // would silently truncate and corrupt the config.
    const h = bootHud();
    const token = makeToken(h);
    assert.ok(token.length > BUILD_NAME_MAXCHARS, `token unexpectedly short: ${token.length}`);

    h.game.seedBuilds([{ title: "New Skyrunner Build", categories: ["Core Items"] }]);
    h.game.openShop();
    h.clock.advance(2000);
    requestSave(h, token);
    h.clock.advance(30000);

    assert.ok(
        h.game.builds[0].categories.some((c) => c.name === token),
        `payload must be stored intact in a category\n${h.diagnose()}`
    );
    assert.notStrictEqual(h.game.builds[0].title, token, "payload must not be written to the title");
});

for (const mode of [TITLE_MODE.RESOLVED, TITLE_MODE.TOKEN]) {
    test(`loader finds a marked build among 8 (titles ${mode})`, () => {
        const h = bootHud({ titleMode: mode });
        const token = makeToken(h);
        const specs = [];
        for (let i = 0; i < 8; i++) {
            specs.push(
                i === 5
                    ? { title: MARKER, categories: [token] }
                    : { title: "New Skyrunner Build", categories: ["Core Items"] }
            );
        }
        h.game.seedBuilds(specs);
        h.clock.advance(45000);

        const finalize = h.sandbox.grepMessages("load:FinalizeSession").pop() || "";
        assert.match(
            finalize,
            /Payload applied/,
            `loader failed with titles in ${mode} mode\n${h.diagnose()}`
        );
    });
}

test("the marker fast path avoids sweeping every build", () => {
    // The point of the marker: when titles ARE readable, reaching the payload
    // should cost far fewer selections than walking the whole list.
    const token = (() => {
        const probe = bootHud();
        return makeToken(probe);
    })();

    function selectionsToFind(useMarker) {
        const h = bootHud({ titleMode: TITLE_MODE.RESOLVED });
        const specs = [];
        for (let i = 0; i < 8; i++) {
            specs.push(
                i === 7
                    ? { title: useMarker ? MARKER : "New Skyrunner Build", categories: [token] }
                    : { title: "New Skyrunner Build", categories: ["Core Items"] }
            );
        }
        h.game.seedBuilds(specs);
        h.clock.advance(45000);
        const finalize = h.sandbox.grepMessages("load:FinalizeSession").pop() || "";
        assert.match(finalize, /Payload applied/, `did not find payload (marker=${useMarker})\n${h.diagnose()}`);
        return h.game.counters.selectBuild;
    }

    const withMarker = selectionsToFind(true);
    const withoutMarker = selectionsToFind(false);
    assert.ok(
        withMarker < withoutMarker,
        `marker did not shorten the search: ${withMarker} vs ${withoutMarker} selections`
    );
});

test("an unreadable marker degrades to the sweep, it does not break the load", () => {
    // The honest worst case: titles come back as raw tokens, so the fast path
    // never matches and the sweep must carry the load on its own.
    const h = bootHud({ titleMode: TITLE_MODE.TOKEN });
    const token = makeToken(h);
    const specs = [];
    for (let i = 0; i < 8; i++) {
        specs.push(
            i === 7
                ? { title: MARKER, categories: [token] }
                : { title: "New Skyrunner Build", categories: ["Core Items"] }
        );
    }
    h.game.seedBuilds(specs);
    h.clock.advance(60000);

    const finalize = h.sandbox.grepMessages("load:FinalizeSession").pop() || "";
    assert.match(finalize, /Payload applied/, `\n${h.diagnose()}`);
    assert.ok(
        h.game.counters.selectBuild > 1,
        "expected the sweep to do the work when the marker is unreadable"
    );
});
