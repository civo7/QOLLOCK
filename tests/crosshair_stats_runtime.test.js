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

function createCrosshairHud() {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { $ } = hud.sandbox.global;
    hud.root.AddClass("joined_team");
    const core = $.CreatePanel("Panel", hud.root, "");
    core.AddClass("HudCore");
    hud.core = core;
    hud.gameplay = $.CreatePanel("Panel", core, "gameplay_hud");
    return hud;
}

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

test("crosshair plain labels normalize internal whitespace like formatted labels", () => {
    const hud = createCrosshairHud(), { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", { number: " +10   20 ", postfix: "%", classes: ["shouldShow", "isPositive"] });
    enableActiveStats(Q); hud.clock.advance(300);
    assert.equal(value(hud.root, "fireRate").text, "+10 20%");
});

test("crosshair skips static decoration of inactive rows and repairs them before reveal", () => {
    const hud = createCrosshairHud(), { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    const fire = addModifier($, source, "fireRateContainer", { number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"] });
    enableActiveStats(Q); hud.clock.advance(300);
    fire.RemoveClass("shouldShow"); hud.clock.advance(100);
    const icon = row(hud.root, "fireRate").FindChild("QOLCrosshairStatRow_fireRate_icon");
    const hasClass = icon.BHasClass;
    let decorationReads = 0;
    icon.BHasClass = function (name) { decorationReads++; return hasClass.call(this, name); };
    icon.RemoveClass("FireRate"); icon.hittest = true;
    hud.clock.advance(500);
    assert.equal(decorationReads, 0, "hidden stat icons need no repeated presentation reconciliation");
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay").style.visibility, "collapse");
    fire.AddClass("shouldShow"); hud.clock.advance(100);
    assert.equal(value(hud.root, "fireRate").text, "+10%");
    assert.equal(icon.BHasClass("FireRate"), true, "static classes are repaired before the row is shown");
    assert.equal(icon.hittest, false);
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay").style.visibility, "visible");
    Q.core.FeatureRegistry.disable("ql_crosshair_stats"); hud.clock.advance(20);
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null);
    assert.deepEqual(hud.clock.errors, []);
});

test("crosshair defers its entire overlay tree until a visible modifier needs it", () => {
    const hud = createCrosshairHud(), { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    const fire = addModifier($, source, "fireRateContainer", { number: "+10", postfix: "%", classes: ["isPositive"] });
    enableActiveStats(Q); hud.clock.advance(1200);
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null, "idle stats must not allocate or reconcile an invisible tree");
    fire.AddClass("shouldShow"); hud.clock.advance(100);
    assert.equal(value(hud.root, "fireRate").text, "+10%");
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay").style.visibility, "visible");
    Q.core.FeatureRegistry.disable("ql_crosshair_stats"); hud.clock.advance(20);
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null);
    Q.core.FeatureRegistry.enable("ql_crosshair_stats"); hud.clock.advance(100);
    assert.equal(value(hud.root, "fireRate").text, "+10%");
    assert.deepEqual(hud.clock.errors, []);
});

test("Active Stats scoreboard visibility is controlled by Customize", () => {
    const hud = createCrosshairHud(), { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", { number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"] });
    enableActiveStats(Q); hud.clock.advance(300);
    const overlay = hud.root.FindChildTraverse("QOLCrosshairStatsOverlay");
    const scoreboard = open => {
        hud.root.SetHasClass("gScoreboardOpen", open);
        Q.core.EventBus.emit("engine:scoreboard_toggle");
        hud.clock.advance(200);
    };
    scoreboard(true);
    assert.equal(overlay.style.visibility, "visible", "TAB alone does not suppress Active Stats");
    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_HIDE_SCOREBOARD: 1 });
    hud.clock.advance(200);
    assert.equal(overlay.style.visibility, "collapse", "Customize can suppress the scoreboard state");
    scoreboard(false);
    assert.equal(overlay.style.visibility, "visible", "scoreboard suppression does not hide normal gameplay");
    scoreboard(true);
    assert.equal(overlay.style.visibility, "collapse");
    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_HIDE_SCOREBOARD: 0 });
    hud.clock.advance(200);
    assert.equal(overlay.style.visibility, "visible", "clearing Customize suppression restores content while TAB stays open");
    Q.core.FeatureRegistry.disable("ql_crosshair_stats");
    Q.core.FeatureRegistry.enable("ql_crosshair_stats"); hud.clock.advance(300);
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay").style.visibility, "visible");
    assert.equal(value(hud.root, "fireRate").text, "+10%");
    assert.deepEqual(hud.clock.errors, []);
});

test("crosshair ignores retired damage amplification and bullet evasion rows from old configs", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", { number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"] });
    const retired = ["damageAmpContainer", "bulletEvasionContainer"];
    for (const id of retired) addModifier($, source, id, { number: "+99", classes: ["shouldShow", "isPositive"] });
    const probes = [];
    for (const method of ["FindChild", "FindChildTraverse"]) {
        const find = source[method];
        source[method] = function (id) {
            if (retired.includes(id)) probes.push(id);
            return find.call(this, id);
        };
    }
    enableActiveStats(Q);
    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_SHOW_DAMAGEAMP: 1, CROSSHAIR_STATS_SHOW_BULLETEVASION: 1 });
    hud.clock.advance(2200);
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%");
    assert.strictEqual(row(hud.root, "damageAmp") === null, true);
    assert.strictEqual(row(hud.root, "bulletEvasion") === null, true);
    assert.deepStrictEqual(probes, []);
    assert.deepStrictEqual(hud.clock.errors, []);
});

test("crosshair reconciles row siblings in one pass and replaces a moved owned row", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", { number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"] });
    enableActiveStats(Q); hud.clock.advance(300);
    const overlay = hud.root.FindChildTraverse("QOLCrosshairStatsOverlay");
    const find = overlay.FindChild;
    let individualLookups = 0, overlayLookups = 0, contentReads = 0, childLookups = 0;
    for (const ownedRow of overlay.Children()) {
        const findChild = ownedRow.FindChild;
        ownedRow.FindChild = function (id) {
            childLookups++;
            return findChild.call(this, id);
        };
    }
    const findOverlay = hud.gameplay.FindChild, findSource = hud.core.FindChild;
    hud.gameplay.FindChild = function (id) {
        if (id === "QOLCrosshairStatsOverlay") overlayLookups++;
        return findOverlay.call(this, id);
    };
    hud.core.FindChild = function (id) {
        if (id === "hudActivePlayerStats") contentReads++;
        return findSource.call(this, id);
    };
    overlay.FindChild = function (id) {
        if (id.startsWith("QOLCrosshairStatRow_")) individualLookups++;
        return find.call(this, id);
    };
    hud.clock.advance(500);
    assert.equal(individualLookups, 0, "row construction must not search the same sibling list once per stat");
    assert.ok(contentReads > 0, "the normal live update path was exercised");
    assert.equal(childLookups, 0, "the ownership sweep already validates stable icon/value handles");
    assert.equal(overlayLookups, contentReads, "the owned tree resolves the overlay once per content update");
    const old = row(hud.root, "fireRate");
    old.SetParent($.CreatePanel("Panel", null, "RetiredRows"));
    hud.clock.advance(200);
    assert.equal(old.IsValid(), false);
    assert.notEqual(row(hud.root, "fireRate"), old);
    assert.equal(value(hud.root, "fireRate").text, "+10%");
    overlay.SetParent($.CreatePanel("Panel", null, "RetiredOverlay"));
    hud.clock.advance(200);
    assert.equal(overlay.IsValid(), false, "the owned tree retires a moved overlay without an extra lookup");
    assert.notEqual(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), overlay);
    assert.equal(value(hud.root, "fireRate").text, "+10%", "the replacement receives the current native content");
    Q.core.FeatureRegistry.disable("ql_crosshair_stats"); hud.clock.advance(20);
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null);
    assert.deepEqual(hud.clock.errors, []);
});

test("crosshair retries partial owned children and retires moved or replaced living icon/value handles", () => {
    const hud = createCrosshairHud(), { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", { number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"] });
    const create = $.CreatePanel;
    let rejectValue = true;
    $.CreatePanel = (type, parent, id, properties) => {
        if (id === "QOLCrosshairStatRow_fireRate_value" && rejectValue) throw Error("temporary value creation failure");
        return create(type, parent, id, properties);
    };
    enableActiveStats(Q); hud.clock.advance(300);
    assert.equal(value(hud.root, "fireRate"), null);
    rejectValue = false; hud.clock.advance(200);
    assert.equal(value(hud.root, "fireRate").text, "+10%");
    const detached = $.CreatePanel("Panel", null, "RetiredCrosshairChildren");
    for (const suffix of ["icon", "value"]) {
        const parent = row(hud.root, "fireRate"), id = `QOLCrosshairStatRow_fireRate_${suffix}`;
        const previous = parent.FindChild(id);
        previous.SetParent(detached);
        const foreign = create(suffix === "icon" ? "Panel" : "Label", parent, id);
        hud.clock.advance(300);
        const replacement = parent.FindChild(id);
        assert.equal(previous.IsValid(), false, "moved living children are retired");
        assert.equal(foreign.IsValid(), false, "a living foreign replacement is not adopted");
        assert.ok(replacement && replacement !== previous && replacement !== foreign);
        assert.equal(value(hud.root, "fireRate").text, "+10%");
        const icon = parent.FindChild("QOLCrosshairStatRow_fireRate_icon");
        assert.equal(icon.BHasClass("FireRate"), true);
        icon.RemoveClass("FireRate"); icon.hittest = true;
        hud.clock.advance(200);
        assert.equal(icon.BHasClass("FireRate"), true, "cached children retain class reconciliation");
        assert.equal(icon.hittest, false, "cached children retain owned input flags");
    }
    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_HIDE_SCOREBOARD: 1 });
    hud.root.AddClass("gScoreboardOpen"); hud.clock.advance(200);
    const hiddenChildren = row(hud.root, "fireRate").Children();
    for (const child of hiddenChildren) child.SetParent(detached);
    hud.clock.advance(200);
    assert.ok(hiddenChildren.every(child => !child.IsValid()), "hidden sweeps retire lost children");
    hud.root.RemoveClass("gScoreboardOpen"); hud.clock.advance(300);
    assert.equal(value(hud.root, "fireRate")?.text, "+10%", "showing the same row rebuilds children retired while hidden");
    assert.equal(row(hud.root, "fireRate").FindChild("QOLCrosshairStatRow_fireRate_icon").BHasClass("FireRate"), true);
    Q.core.FeatureRegistry.disable("ql_crosshair_stats");
    Q.core.FeatureRegistry.enable("ql_crosshair_stats"); hud.clock.advance(300);
    assert.equal(value(hud.root, "fireRate").text, "+10%");
    Q.core.FeatureRegistry.disable("ql_crosshair_stats"); hud.clock.advance(20);
    assert.equal(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null);
    assert.deepEqual(hud.clock.errors, []);
});

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

test("crosshair suspends stat work in the first hideout room and refreshes in the combat room", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    hud.root.AddClass("connectedToHideout");
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    const owners = nativeOwners($, source);
    const fire = addModifier($, owners.weapon, "fireRateContainer", {
        number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    const number = fire.FindChildrenWithClassTraverse("statNumber")[0];
    let hidden = false, currentText = "+10";
    Object.defineProperty(number, "text", { get() {
        if (hidden) throw new Error("stat labels must not be read while the gameplay HUD is suppressed");
        return currentText;
    }, set(text) { currentText = text; }, configurable: true });
    enableActiveStats(Q);
    hud.clock.advance(300);
    const overlay = hud.root.FindChildTraverse("QOLCrosshairStatsOverlay");
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%");
    assert.strictEqual(overlay.style.visibility, "visible");
    for (const cls of ["InHideout", "ShowEscapeMenu", "HudTakeoverEnabled"]) {
        hud.root.AddClass(cls);hidden = true;currentText = "+20";
        hud.clock.advance(900);
        assert.strictEqual(overlay.style.visibility, "collapse");
        assert.strictEqual(hud.clock.errors.length, 0);
        hud.root.RemoveClass(cls);hidden = false;
        hud.clock.advance(100);
        assert.strictEqual(overlay.style.visibility, "visible");
        assert.strictEqual(value(hud.root, "fireRate").text, "+20%");
    }
    hud.gameplay.visible = false;hidden = true;
    hud.clock.advance(900);
    assert.strictEqual(overlay.style.visibility, "collapse");
    assert.strictEqual(hud.clock.errors.length, 0);
    hud.gameplay.visible = true;hidden = false;
    hud.clock.advance(100);
    assert.strictEqual(overlay.style.visibility, "visible");
});

test("only selected Active Stats Customize preview bypasses Escape/scoreboard and releases on withdrawal", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    const owners = nativeOwners($, source);
    addModifier($, owners.weapon, "fireRateContainer", {
        number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    enableActiveStats(Q); hud.clock.advance(300);
    const overlay = hud.root.FindChildTraverse("QOLCrosshairStatsOverlay");
    const canonical = Q.core.ConfigAdapter.exportToFlat(), original = JSON.stringify(canonical);
    const preview = Q.presentation.preview;
    const stamp = Q.core.persistence.getConfigChangeStamp(Q.core.persistence.getUIRoot());
    hud.root.AddClass("ShowEscapeMenu"); hud.root.AddClass("gScoreboardOpen"); hud.root.AddClass("QOLCustomizeActive");
    const select = id => {
        preview.write(hud.root, {}, "crosshair-sample", stamp, id);
        preview.commit(preview.consume(hud.root, canonical));
        hud.clock.advance(200);
    };
    select("ammo"); assert.strictEqual(overlay.style.visibility, "collapse", "another selected surface cannot bypass the gate");
    select("activeStats");
    assert.strictEqual(Q.core.hud.isGameplayHudShown(hud.root), false, "shared gameplay semantics stay unchanged");
    assert.strictEqual(overlay.style.visibility, "visible");
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%", "preview uses the actual modifier mirror");
    assert.strictEqual(JSON.stringify(Q.core.ConfigAdapter.exportToFlat()), original, "sample metadata changes no setting");
    preview.clear(hud.root, "crosshair-sample"); hud.clock.advance(200);
    assert.strictEqual(overlay.style.visibility, "collapse", "withdrawal immediately restores normal suppression");
    select("activeStats");
    hud.root.RemoveClass("QOLCustomizeActive"); hud.clock.advance(200);
    assert.strictEqual(overlay.style.visibility, "collapse", "leaving Customize removes the scoped exception");
    Q.core.FeatureRegistry.disable("ql_crosshair_stats"); hud.clock.advance(20);
    assert.strictEqual(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null);
    assert.deepStrictEqual(hud.clock.errors, []);
});

test("selected Active Stats keeps its owned rows editable without native modifiers and retires the neutral sample", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    enableActiveStats(Q); hud.clock.advance(300);
    const preview = Q.presentation.preview;
    const canonical = Q.core.ConfigAdapter.exportToFlat(), before = JSON.stringify(canonical);
    hud.root.AddClass("ShowEscapeMenu"); hud.root.AddClass("gScoreboardOpen"); hud.root.AddClass("QOLCustomizeActive");
    preview.write(hud.root, {}, "empty-stats", Q.core.persistence.getConfigChangeStamp(Q.core.persistence.getUIRoot()), "activeStats");
    preview.commit(preview.consume(hud.root, canonical)); hud.clock.advance(200);
    const overlay = hud.root.FindChildTraverse("QOLCrosshairStatsOverlay");
    const samples = overlay.FindChildrenWithClassTraverse("QOLCrosshairStatRow").filter(panel => !panel.BHasClass("qol-hidden"));
    assert.strictEqual(overlay.style.visibility, "visible"); assert.strictEqual(samples.length, 1);
    assert.strictEqual(samples[0].BHasClass("isBuff"), false); assert.strictEqual(samples[0].BHasClass("isDebuff"), false);
    assert.strictEqual(samples[0].FindChildTraverse(samples[0].id + "_value").text, "--");
    assert.strictEqual(hud.root.FindChildTraverse("hudActivePlayerStats"), null, "sample creates no fake native source");
    assert.strictEqual(JSON.stringify(Q.core.ConfigAdapter.exportToFlat()), before);
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats"), owners = nativeOwners($, source);
    const fire = addModifier($, owners.weapon, "fireRateContainer", {
        number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(900);
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%", "actual modifiers replace the neutral sample");
    fire.RemoveClass("shouldShow"); hud.clock.advance(200);
    assert.strictEqual(overlay.style.visibility, "visible", "empty content remains editable only while selected");
    hud.clock.advance(1600);
    assert.strictEqual(overlay.style.visibility, "collapse", "expired selection retires the neutral sample");
    hud.root.RemoveClass("ShowEscapeMenu"); hud.root.RemoveClass("gScoreboardOpen"); hud.root.RemoveClass("QOLCustomizeActive");
    hud.clock.advance(200);
    assert.strictEqual(overlay.style.visibility, "collapse", "ordinary gameplay preserves the empty-content policy");
    Q.core.FeatureRegistry.disable("ql_crosshair_stats"); hud.clock.advance(20);
    assert.strictEqual(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null);
    assert.deepStrictEqual(hud.clock.errors, []);
});

test("crosshair missing-row discovery waits while cached values keep updating", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    const owners = nativeOwners($, source);
    const fire = addModifier($, owners.weapon, "fireRateContainer", {
        number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    enableActiveStats(Q);
    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_SHOW_CLIPSIZE: 1 });
    hud.clock.advance(100);
    const scanTimes = [];
    const traverse = source.FindChildTraverse.bind(source);
    source.FindChildTraverse = id => {
        if (id === "clipSizeContainer") scanTimes.push(hud.clock.now());
        return traverse(id);
    };
    hud.clock.advance(2000);
    assert.ok(scanTimes.length >= 2 && scanTimes.length <= 3);
    assert.ok(scanTimes.every((time, index) => index === 0 || time - scanTimes[index - 1] >= 800));
    addModifier($, owners.weapon, "clipSizeContainer", {
        number: "+7", classes: ["shouldShow", "isPositive"]
    });
    fire.FindChildrenWithClassTraverse("statNumber")[0].text = "+11";
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "fireRate").text, "+11%");
    hud.clock.advance(800);
    assert.strictEqual(value(hud.root, "clipSize").text, "+7");
});

test("crosshair resolves direct modifier cores without enumerating their descendants and retains nested values", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    const owners = nativeOwners($, source);
    const fire = addModifier($, owners.weapon, "fireRateContainer", {
        number: "+10", postfix: "%", nestedValue: true, classes: ["shouldShow", "isPositive"]
    });
    const traverse = fire.FindChildrenWithClassTraverse.bind(fire);
    let coreScans = 0;
    fire.FindChildrenWithClassTraverse = name => {
        if (name === "miniModifierCore") coreScans++;
        return traverse(name);
    };
    enableActiveStats(Q); hud.clock.advance(2200);
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%");
    assert.strictEqual(coreScans, 0);
    assert.deepStrictEqual(hud.clock.errors, []);
});

test("crosshair skips a detached first class candidate and retains the next current modifier core", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    const fire = addModifier($, nativeOwners($, source).weapon, "fireRateContainer", {
        number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    const retired = $.CreatePanel("Panel", null, "RetiredModifiers");
    const detached = addModifierCore($, retired, { number: "+99", postfix: "%" });
    const findFirst = Q.utils.FindFirstPanelByClass;
    Q.utils.FindFirstPanelByClass = (panel, name) => panel === fire && name === "miniModifierCore"
        ? detached : findFirst(panel, name);
    const traverse = fire.FindChildrenWithClassTraverse.bind(fire);
    fire.FindChildrenWithClassTraverse = name => name === "miniModifierCore"
        ? [detached, ...traverse(name)] : traverse(name);
    enableActiveStats(Q); hud.clock.advance(300);
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%");
    assert.deepStrictEqual(hud.clock.errors, []);
});

test("crosshair checks a verified owner path once for its cached modifier rows", () => {
    const hud = createCrosshairHud(), { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats"), owners = nativeOwners($, source);
    addModifier($, owners.weapon, "fireRateContainer", { number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"] });
    addModifier($, owners.weapon, "clipSizeContainer", { number: "+4", postfix: "%", classes: ["shouldShow", "isPositive"] });
    enableActiveStats(Q); hud.clock.advance(300);
    const parent = owners.weapon.GetParent.bind(owners.weapon);
    let reads = 0;
    owners.weapon.GetParent = () => { reads++; return parent(); };
    hud.clock.advance(100);
    assert.strictEqual(reads, 1, "rows must reuse their owner's path validation instead of walking it again");
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%");
    assert.strictEqual(value(hud.root, "clipSize").text, "+4%");
    Q.core.FeatureRegistry.disable("ql_crosshair_stats"); hud.clock.advance(20);
    assert.deepStrictEqual(hud.clock.errors, []);
});

test("crosshair discovers late rows in narrow owners and recovers from row/owner replacement", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    enableActiveStats(Q);
    hud.clock.advance(300);
    assert.strictEqual(row(hud.root, "fireRate"), null, "missing native stats allocate no overlay tree");

    // The entire native source can appear after the feature is enabled.
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    const owners = nativeOwners($, source);
    hud.clock.advance(200);
    const fire = addModifier($, owners.weapon, "fireRateContainer", {
        number: "+10", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(800);
    assert.strictEqual(value(hud.root, "fireRate").text, "+10%");

    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_SHOW_HEALAMP: 1 });
    hud.clock.advance(200);
    const healing = addModifier($, owners.vitality, "healingAmpContainer", {
        number: "+7", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(800);
    assert.strictEqual(value(hud.root, "healAmp").text, "+7%");
    healing.DeleteAsync(0);
    hud.clock.advance(100);
    assert.strictEqual(row(hud.root, "healAmp").BHasClass("qol-hidden"), true);

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
    hud.clock.advance(800);
    assert.strictEqual(value(hud.root, "fireRate").text, "+25%");
    replacement.DeleteAsync(0);
    owners.weapon.DeleteAsync(0);
    hud.clock.advance(100);
    assert.strictEqual(row(hud.root, "fireRate").BHasClass("qol-hidden"), true);
    const lateColumn = $.CreatePanel("Panel", owners.list, "WeaponColumn");
    addModifier($, lateColumn, "fireRateContainer", {
        number: "+30", postfix: "%", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(800);
    assert.strictEqual(value(hud.root, "fireRate").text, "+30%");
});

test("crosshair compatibility search finds late rows outside verified paths and resets on disable", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    nativeOwners($, source);
    enableActiveStats(Q);
    Q.core.ConfigAdapter.loadFromFlat({ CROSSHAIR_STATS_SHOW_CLIPSIZE: 1 });
    hud.clock.advance(300);
    // Intentionally unfamiliar test structure, not an inferred native path.
    const unexpected = $.CreatePanel("Panel", source, "TestUnfamiliarLayout");
    const clip = addModifier($, unexpected, "clipSizeContainer", {
        number: "+4", classes: ["shouldShow", "isPositive"]
    });
    hud.clock.advance(800);
    assert.strictEqual(value(hud.root, "clipSize").text, "+4");
    const number = clip.FindChildrenWithClassTraverse("statNumber")[0];
    number.text = "+5";
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "clipSize").text, "+5", "fallback discovery must not slow value updates");

    const retired = $.CreatePanel("Panel", null, "RetiredCompatibilityOwner");
    unexpected.SetParent(retired); hud.clock.advance(100);
    assert.strictEqual(row(hud.root, "clipSize").BHasClass("qol-hidden"), true,
        "a living compatibility parent still requires ancestry validation");
    unexpected.SetParent(source); hud.clock.advance(800);
    assert.strictEqual(value(hud.root, "clipSize").text, "+5");

    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_CROSSHAIR_STATS: 0 });
    hud.clock.advance(200);
    assert.strictEqual(hud.root.FindChildTraverse("QOLCrosshairStatsOverlay"), null);
    assert.strictEqual(Q.getCachedPanel("crosshairStatsOverlay"), null);
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_CROSSHAIR_STATS: 1 });
    hud.clock.advance(100);
    assert.strictEqual(value(hud.root, "clipSize").text, "+5");
});

test("crosshair Active Stats reads the renamed source and current value classes", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;

    // This ID is now a different CitadelHudPlayerStats component. Giving it a
    // convincing row ensures the feature cannot accidentally fall back to it.
    const unrelated = $.CreatePanel("Panel", hud.root, "hudPlayerStats");
    addModifier($, unrelated, "fireRateContainer", {
        number: "+999",
        postfix: "%",
        classes: ["shouldShow", "isNegative"],
    });

    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
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
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;

    let source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
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
    source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", {
        number: "-30",
        postfix: "%",
        classes: ["shouldShow", "isNegative"],
    });
    hud.clock.advance(300);

    assert.strictEqual(value(hud.root, "fireRate").text, "-30%");
    assert.strictEqual(row(hud.root, "fireRate").BHasClass("isDebuff"), true);
});


test("crosshair waits at verified owners and follows a living HudCore replacement without global probes", () => {
    const hud = createCrosshairHud();
    const { $, QOL: Q } = hud.sandbox.global;
    const decoy = $.CreatePanel("Panel", hud.root, "hudActivePlayerStats");
    addModifier($, decoy, "fireRateContainer", { number: "+99", postfix: "%", classes: ["shouldShow", "isPositive"] });
    Q.core.App.shutdown();
    enableActiveStats(Q);
    Q.core.hud.isGameplayHudShown(hud.root);
    const feature = Q.core.FeatureRegistry.getManifest("ql_crosshair_stats").create({
        id: "ql_crosshair_stats", events: Q.core.EventBus,
        config: { view: () => Q.core.ConfigStore.view("ql_crosshair_stats") }
    });
    const traverse = hud.root.FindChildTraverse, probes = [];
    hud.root.FindChildTraverse = function (id) {
        if (id === "hudActivePlayerStats") probes.push(id);
        return traverse.call(this, id);
    };
    feature.onEnable(); hud.clock.advance(1200);
    assert.equal(row(hud.root, "fireRate"), null, "unrelated native sources cannot create a mirror");
    const source = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    addModifier($, source, "fireRateContainer", { number: "+12", postfix: "%", classes: ["shouldShow", "isPositive"] });
    hud.clock.advance(200); assert.equal(value(hud.root, "fireRate").text, "+12%");
    const previousOverlay = hud.root.FindChildTraverse("QOLCrosshairStatsOverlay");
    hud.core.SetParent($.CreatePanel("Panel", hud.root, "RetiredCore"));
    hud.core = addClass($.CreatePanel("Panel", hud.root, ""), "HudCore");
    hud.gameplay = $.CreatePanel("Panel", hud.core, "gameplay_hud");
    const replacement = $.CreatePanel("Panel", hud.core, "hudActivePlayerStats");
    addModifier($, replacement, "fireRateContainer", { number: "-24", postfix: "%", classes: ["shouldShow", "isNegative"] });
    hud.clock.advance(200);
    assert.equal(previousOverlay.IsValid(), false);
    assert.equal(value(hud.root, "fireRate").text, "-24%");
    feature.onDisable(); hud.clock.advance(20);
    feature.onEnable(); hud.clock.advance(200);
    assert.equal(value(hud.root, "fireRate").text, "-24%");
    assert.deepEqual(probes, []);
    feature.onDisable();
    assert.deepEqual(hud.clock.errors, []);
});
