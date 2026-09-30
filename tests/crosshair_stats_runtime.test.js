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
