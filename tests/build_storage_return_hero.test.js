// tests/build_storage_return_hero.test.js
// =============================================================================
// A storage round trip must put the player back on the hero they were playing.
// =============================================================================
// ql_build_storage borrows the player's character: it switches them to Skyrunner
// (the hero that owns the QOLLOCK-Settings build), reads or writes the config
// carried in that build's description, and switches them back.
//
// "Back" used to mean the DEFAULT_HERO setting. That setting answers a different
// question — which hero the storage build belongs to — and nothing keeps it in
// sync with whoever the player actually picked. On 2026-09-05 the two diverged in
// a user report: the save's confirm stage read Billy's ENTANGLING BOLA off the
// ability HUD for its whole 4s timeout while the restore queued hero_punkgoat, so
// the player was dragged onto a character they had never selected and sat through
// its load staring at an empty model. Changing the dropdown was enough to
// teleport you on your next save.
//
// The fix reads the live ability HUD instead, and these cases pin it. Both assert
// on the simulator's OWN hero flag and its OWN shop flag — nothing here guesses
// at panels the real client may or may not create.
//
// NOT covered here, and deliberately: the "#HeroBuildList belongs to the wrong
// hero" gate. It keys on ResolveBuildSaveStorageHeroSignal, which reads hero
// tokens out of the shop and build panels, and the simulator's build rows carry
// no such token — so the gate is inert in the model and a green test would mean
// nothing. It needs in-game evidence.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");

const sim = require("../scripts/simulator/index.js");

const STORAGE_HERO = "hero_skyrunner";
// Neither the manifest's FALLBACK_HERO nor QOL_DEFAULT_CONFIG.DEFAULT_HERO, both
// of which are hero_werewolf. That is the whole point: if the restore consults
// either of them instead of the live HUD, the assertion below fails.
const PLAYING = "hero_lash";

/** Run the startup read to completion and hand back the harness. */
function runStartupRead(opts) {
    const h = sim.createHud(Object.assign({ inHideout: true }, opts));
    h.assertLoaded();
    // Long enough for switch -> confirm -> shop -> browser -> list -> sweep ->
    // restore, plus the 0.3s the restore is queued with, on default latencies.
    h.clock.advanceBy(45000, 200);
    return h;
}

function terminalReadLine(h) {
    return h.sandbox.messages.filter((m) => m.indexOf("] read: ") !== -1).pop() || "";
}

test("the restore targets the hero the player was on, not DEFAULT_HERO", () => {
    const h = runStartupRead({ hero: PLAYING });

    assert.notStrictEqual(h.game.hero, STORAGE_HERO,
        "left the player on the storage hero\n" + h.diagnose());
    assert.strictEqual(h.game.hero, PLAYING,
        `restored to ${h.game.hero} instead of ${PLAYING} — the run consulted a ` +
        `config value rather than the live ability HUD\n` + h.diagnose());
});

test("the return hero is logged with the source that produced it", () => {
    const h = runStartupRead({ hero: PLAYING });

    const line = h.sandbox.messages.filter((m) => m.indexOf("returnHero=") !== -1).pop() || "";
    assert.ok(line, "no returnHero line at all\n" + h.diagnose());
    assert.match(line, new RegExp("returnHero=" + PLAYING + " via live"),
        `returnHero line does not name the live HUD: ${line}\n` + h.diagnose());
});

test("a shop that was already open is closed once so it rebinds to the storage hero", () => {
    // The client binds #HeroBuildList to whichever hero the shop panel was built
    // with, and switching hero underneath an open shop does not rebuild it. A run
    // that skips the reopen enumerates the PREVIOUS hero's builds and believes
    // them — which is how the 2026-09-05 read concluded the account had no
    // settings build while eleven Billy builds sat on screen.
    const h = sim.createHud({ hero: PLAYING, inHideout: true, boot: false });
    h.game.openShop();
    h.clock.advanceBy(2000, 100);
    assert.ok(h.game.shopOpen, "simulator did not open the shop\n" + h.diagnose());

    for (const s of h.scripts.scripts) h.sandbox.load(s.absPath);
    h.assertLoaded();
    h.clock.advanceBy(45000, 200);

    const rebind = h.sandbox.messages.filter((m) => m.indexOf("so it rebinds to") !== -1);
    assert.strictEqual(rebind.length, 1,
        `expected exactly one rebind close, got ${rebind.length}\n` + h.diagnose());
    // The close must not cost the run its read: a rebind that ends in "failed"
    // has traded one wrong answer for no answer.
    assert.match(terminalReadLine(h), /read: (default|success)/,
        "the rebind broke the read\n" + h.diagnose());
});

test("the read still reaches a conclusion on a shop it opened itself", () => {
    // Control for the case above: with the shop shut at boot there is nothing to
    // rebind, and the run must not pay for the guard.
    const h = runStartupRead({ hero: PLAYING });

    assert.strictEqual(
        h.sandbox.messages.filter((m) => m.indexOf("so it rebinds to") !== -1).length, 0,
        "rebound a shop that was never open\n" + h.diagnose());
    assert.match(terminalReadLine(h), /read: (default|success)/,
        "no terminal read line\n" + h.diagnose());
});

// ── RC6: the Favorites (builds) tab ──────────────────────────────────────────
// BrowseBuildsButton only works under the shop's Favorites tab
// (citadel_hud_hero_shop.css:1002 reveals #ShopModsSelectedBuild there and holds
// it at opacity 0 everywhere else). A shop that reopens on a remembered
// Weapon/Armor/Tech tab therefore has a Browse button that is present but inert,
// and the loader hangs at "Opening the build browser" — the 2026-09-06 report,
// where the player's shop was on the Vitality/Armor tab and the star was never
// selected. The fix selects the tab before pressing Browse.

test("the run selects the Favorites tab when the shop opens on another one", () => {
    const h = sim.createHud({ hero: PLAYING, inHideout: true, shopOpensTab: "armor", boot: false });
    // Prove the pre-condition the fix has to overcome: on the armor tab the shop
    // does not reveal the build UI.
    h.game.openShop();
    h.clock.advanceBy(2000, 100);
    assert.ok(h.game.shopOpen, "simulator did not open the shop\n" + h.diagnose());
    assert.ok(!h.game.shopPanel.BHasClass("showingFavorites"),
        "armor tab should not carry showingFavorites\n" + h.diagnose());
    h.game.closeShop();
    h.clock.advanceBy(500, 50);

    for (const s of h.scripts.scripts) h.sandbox.load(s.absPath);
    h.assertLoaded();
    h.clock.advanceBy(45000, 200);

    // The tab was selected...
    assert.strictEqual(h.game.shopTab, "favorites",
        `shop never left the '${h.game.shopTab}' tab — Browse was unreachable\n` + h.diagnose());
    // ...the list was actually reached (this line is only logged past await_list)...
    assert.ok(h.sandbox.messages.some((m) => m.indexOf("] list: ") !== -1),
        "the build list was never enumerated\n" + h.diagnose());
    // ...and the run did NOT fail at the browser. Without the fix it would.
    assert.match(terminalReadLine(h), /read: (default|success)/,
        "the read failed instead of reaching the list\n" + h.diagnose());
});

test("wait_hero: waits for delayed hero spawn and reads successfully", () => {
    // Simulate delayed hero spawn: hero starts empty, then spawns after 800ms
    const h = sim.createHud({ hero: "", inHideout: true, boot: false });
    for (const s of h.scripts.scripts) h.sandbox.load(s.absPath);
    h.assertLoaded();

    // Advance 600ms while hero has not spawned yet
    h.clock.advanceBy(600, 100);
    assert.strictEqual(h.game.hero, "");

    // Hero spawns
    h.game.hero = PLAYING;
    h.game._renderAll();

    // Complete the run
    h.clock.advanceBy(45000, 200);

    assert.strictEqual(h.game.hero, PLAYING,
        `restored to ${h.game.hero} instead of ${PLAYING}\n` + h.diagnose());
    assert.match(terminalReadLine(h), /read: (default|success)/,
        "the read failed instead of completing after delayed hero spawn\n" + h.diagnose());
});


