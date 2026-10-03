// tests/crosshair_stats_runtime.test.js
// =============================================================================
// Models the build-6711 Active Player Stats layout consumed by the crosshair
// mirror. The patch reused #hudPlayerStats for an unrelated component and moved
// modifier rows to #hudActivePlayerStats.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

function addClass(panel, className) {
    if (className) panel.AddClass(className);
    return panel;
}

function addModifierCore($, row, options = {}) {
    const core = addClass($.CreatePanel("Panel", row, ""), "miniModifierCore");
    const valueParent = options.nestedValue
        ? addClass($.CreatePanel("Panel", core, ""), "statWithPostfix")
        : core;

    if (options.number !== undefined) {
        const number = addClass($.CreatePanel("Label", valueParent, ""), "statNumber");
        number.text = String(options.number);
    }
    if (options.postfix !== undefined) {
        const postfix = addClass($.CreatePanel("Label", valueParent, ""), "statPostfix");
        postfix.text = String(options.postfix);
    }
    if (options.delta !== undefined) {
        const delta = addClass($.CreatePanel("Label", core, ""), "statNumberDelta");
        delta.text = String(options.delta);
    }
    return core;
}

function addModifier($, parent, id, options = {}) {
    const row = $.CreatePanel("Panel", parent, id);
    addClass(row, "miniModifier");
    for (const className of options.classes || []) addClass(row, className);
    addModifierCore($, row, options);

    const casters = $.CreatePanel("Panel", row, "casterList");
    for (const casterClass of options.casters || []) {
        const caster = addClass($.CreatePanel("Panel", casters, ""), "casterAndModifiers");
        addClass(caster, casterClass);
    }
    return row;
}

function enableActiveStats(Q) {
    Q.core.ConfigAdapter.loadFromFlat({
        ENABLE_CROSSHAIR_STATS: 1,
        CROSSHAIR_STATS_SHOW_BUFFS: 1,
        CROSSHAIR_STATS_SHOW_DEBUFFS: 1,
        CROSSHAIR_STATS_SHOW_FIRERATE: 1,
        CROSSHAIR_STATS_SHOW_WEAPONPOWER: 1,
        CROSSHAIR_STATS_SHOW_SPIRIT: 1,
        CROSSHAIR_STATS_SHOW_REGEN: 1,
        CROSSHAIR_STATS_SHOW_CLIPSIZE: 1,
    });
}

function row(root, key) {
    return root.FindChildTraverse(`QOLCrosshairStatRow_${key}`);
}

function value(root, key) {
    return root.FindChildTraverse(`QOLCrosshairStatRow_${key}_value`);
}

// Owner paths shared by extracted active-player-stats XML and the native
// Debugger capture. Value/caster contents below these owners are test data.
function nativeOwners($, source) {
    const list = $.CreatePanel("Panel", source, "StatList");
    const weapon = $.CreatePanel("Panel", list, "WeaponColumn");
    const spirit = $.CreatePanel("Panel", list, "SpiritColumn");
    const vitality = $.CreatePanel("Panel", list, "VitalityColumn");
    const block = $.CreatePanel("Panel", source, "HudStatBlock");
    const core = $.CreatePanel("Panel", block, "CoreStats");
    const weaponCore = $.CreatePanel("Panel", core, "Weapon");
    const spiritCore = $.CreatePanel("Panel", core, "Spirit");
    return { list, weapon, spirit, vitality, weaponCore, spiritCore };
}

test("crosshair discovers conditional rows in narrow owners and recovers from row/owner replacement", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    enableActiveStats(Q);
    hud.clock.advance(300);
    assert.strictEqual(row(hud.root, "fireRate").BHasClass("qol-hidden"), true);

    // The entire native source can appear after the feature is enabled.
    const source = $.CreatePanel("Panel", hud.root, "hudActivePlayerStats");
    const owners = nativeOwners($, source);
    hud.clock.advance(200);
    const fire = addModifier($, owners.weapon, "fireRateContainer", {
        number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%");

    // No column is asserted for damageAmp: this synthetic conditional row
    // verifies discovery without treating its snapshot absence as invalidity.
    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_SHOW_DAMAGEAMP: 1 });
    hud.clock.advance(200);
    const damage = addModifier($, owners.vitality, "damageAmpContainer", {
        number: "+7", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "damageAmp").text, "+7");
    damage.DeleteAsync(0);
    hud.clock.advance(100);
    assert.strictEqual(row(hud.root, "damageAmp").BHasClass("qol-hidden"), true);

    // A live row moved out of the active owner must not retain cached values.
    const retired = $.CreatePanel("Panel", hud.doc.absRoot, "RetiredTestPanels");
    fire.SetParent(retired);
    addModifier($, owners.weapon, "fireRateContainer", {
        number: "-15", postfix: "%", classes: ["shouldShow", "isNegative"]
    });
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "fireRate").text, "-15%");

    // Retain the old column within the same source, but away from StatList.
    // Both its handles and source ancestry stay valid; the route must change.
    owners.weapon.SetParent(source);
    const replacement = $.CreatePanel("Panel", owners.list, "WeaponColumn");
    hud.clock.advance(100);
    addModifier($, replacement, "fireRateContainer", {
        number: "+25", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "fireRate").text, "+25%");
    replacement.DeleteAsync(0);
    owners.weapon.DeleteAsync(0);
    hud.clock.advance(100);
    assert.strictEqual(row(hud.root, "fireRate").BHasClass("qol-hidden"), true);
    const lateColumn = $.CreatePanel("Panel", owners.list, "WeaponColumn");
    addModifier($, lateColumn, "fireRateContainer", {
        number: "+30", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "fireRate").text, "+30%");
});

test("crosshair compatibility search finds late rows outside verified paths and resets on disable", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.root, "hudActivePlayerStats");
    nativeOwners($, source);
    enableActiveStats(Q);
    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_SHOW_BULLETEVASION: 1 });
    hud.clock.advance(300);
    // Intentionally unfamiliar test structure, not an inferred native path.
    const unexpected = $.CreatePanel("Panel", source, "TestUnfamiliarLayout");
    const evasion = addModifier($, unexpected, "bulletEvasionContainer", {
        number: "+4", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(1600);
    assert.strictEqual(value(hud.root, "bulletEvasion").text, "+4");
    const number = evasion.FindChildrenWithClassTraverse("statNumber")[0];
    number.text = "+5";
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "bulletEvasion").text, "+5", "fallback discovery must not slow value updates");

    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_CROSSHAIR_STATS: 0 });
    hud.clock.advance(200);
    assert.strictEqual(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null);
    assert.strictEqual(Q.state.crosshairStats.sourcePanel, null);
    assert.deepStrictEqual(Object.keys(Q.state.crosshairStats.sourceContainers), []);
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_CROSSHAIR_STATS: 1 });
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "bulletEvasion").text, "+5");
});

test("crosshair Active Stats reads the renamed source and current value classes", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;

    // This ID is now a different CitadelHudPlayerStats component. Giving it a
    // convincing row ensures the feature cannot accidentally fall back to it.
    const unrelated = $.CreatePanel("Panel", hud.root, "hudPlayerStats");
    addModifier($, unrelated, "fireRateContainer", {
        number: "+999",
        postfix: "%",
        classes: ["shouldShow", "isNegative"],
    });

    const source = $.CreatePanel("Panel", hud.root, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", {
        number: "+20",
        postfix: "%",
        classes: ["shouldShow", "isPositive"],
        // Native polarity wins over incomplete caster tagging.
        casters: ["enemy"],
    });
    addModifier($, source, "weaponPowerContainer", {
        number: "125",
        postfix: "%",
        delta: "17",
        nestedValue: true,
        classes: ["shouldShow", "isPositive", "has_delta"],
    });
    addModifier($, source, "spiritContainer", {
        number: "42",
        delta: "5",
        classes: ["shouldShow", "isPositive", "has_delta"],
    });
    addModifier($, source, "regenPerSecondContainer", {
        number: "+3",
        postfix: "/s",
        classes: ["isPositive"],
    });
    const lateClip = addClass($.CreatePanel("Panel", source, "clipSizeContainer"), "miniModifier");
    addClass(lateClip, "shouldShow");
    addClass(lateClip, "isPositive");

    // A hot-reload can leave the old source under the feature's cache key.
    // Its now-distinct id must prevent that valid panel from being reused.
    Q.setCachedPanel("crosshairStatsSource", unrelated);
    enableActiveStats(Q);
    hud.clock.advance(500);

    assert.strictEqual(value(hud.root, "fireRate").text, "+20%", "number and postfix classes must be joined");
    assert.strictEqual(row(hud.root, "fireRate").BHasClass("isBuff"), true, "native isPositive must beat caster tags");
    assert.strictEqual(value(hud.root, "weaponPower").text, "17%", "weapon power must show its modifier delta, not absolute value");
    assert.strictEqual(value(hud.root, "spirit").text, "+5", "unsigned spirit deltas need one leading plus");
    assert.strictEqual(row(hud.root, "regen").BHasClass("qol-hidden"), true, "a value without shouldShow must remain hidden");
    assert.strictEqual(row(hud.root, "clipSize").BHasClass("qol-hidden"), true, "an incomplete native row must remain hidden");

    addModifierCore($, lateClip, { number: "8" });
    hud.clock.advance(200);
    assert.strictEqual(value(hud.root, "clipSize").text, "8", "late-created value children must be discovered");
    assert.strictEqual(row(hud.root, "clipSize").BHasClass("qol-hidden"), false);

    const fire = source.FindChildTraverse("fireRateContainer");
    const oldFireCore = fire.FindChildrenWithClassTraverse("miniModifierCore")[0];
    oldFireCore.DeleteAsync(0);
    hud.clock.advance(0);
    addModifierCore($, fire, { number: "+25", postfix: "%" });
    hud.clock.advance(200);
    assert.strictEqual(value(hud.root, "fireRate").text, "+25%", "replaced value children must invalidate cached labels");

    const weapon = source.FindChildTraverse("weaponPowerContainer");
    weapon.RemoveClass("has_delta");
    hud.clock.advance(200);
    assert.strictEqual(row(hud.root, "weaponPower").BHasClass("qol-hidden"), true, "stale delta text must be ignored after has_delta clears");
});

test("crosshair Active Stats invalidates cached rows when its native source is replaced", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;

    let source = $.CreatePanel("Panel", hud.root, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", {
        number: "+10",
        postfix: "%",
        classes: ["shouldShow", "isPositive"],
    });
    enableActiveStats(Q);
    hud.clock.advance(300);
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%");

    // Keep the old generation alive but move it out of the current #Hud. A
    // validity-only cache would keep reading this stale same-id panel forever.
    const oldHud = $.CreatePanel("Panel", hud.doc.absRoot, "OldHudGeneration");
    source.SetParent(oldHud);
    source = $.CreatePanel("Panel", hud.root, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", {
        number: "-30",
        postfix: "%",
        classes: ["shouldShow", "isNegative"],
    });
    hud.clock.advance(300);

    assert.strictEqual(value(hud.root, "fireRate").text, "-30%");
    assert.strictEqual(row(hud.root, "fireRate").BHasClass("isDebuff"), true);
});
