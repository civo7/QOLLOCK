"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../scripts/simulator");

function fixture() {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    hud.sandbox.eval("Math.random = () => 0;"); // Make newly enabled poll phases deterministic.
    const { $, QOL: Q } = hud.sandbox.global;
    const add = (parent, id, classes = []) => {
        const panel = $.CreatePanel("Panel", parent, id);
        for (const cls of classes) panel.AddClass(cls);
        return panel;
    };
    const core = add(hud.root, "", ["HudCore"]);
    const gameplay = add(core, "gameplay_hud");
    const label = (parent, id, value, classes = []) => {
        const panel = $.CreatePanel("Label", parent, id);
        panel.text = value;
        for (const cls of classes) panel.AddClass(cls);
        return panel;
    };
    const config = patch => Q.core.ConfigAdapter.loadFromFlat(patch);
    const find = id => hud.root.FindChildTraverse(id);
    const clean = () => { assert.deepEqual(hud.clock.errors, []); };
    return { hud, Q, $, core, gameplay, add, label, config, find, clean };
}

test("small CSS features project the complete configuration and add no feature polls", () => {
    const env = fixture();
    const { Q, hud, core, add, config } = env;
    const abilities = add(core, "AbilitiesContainer");
    const native = add(abilities, "CosmeticAbilitiesMenu");
    native.style.opacity = "0.75";
    const createdPolls = [];
    const createPoll = Q.core.Scheduler.createPollLoop;
    Q.core.Scheduler.createPollLoop = (callback, interval, id) => {
        createdPolls.push(id);
        return createPoll(callback, interval, id);
    };
    config({ ENABLE_HIDE_MAGAZINE: 1, ENABLE_SIMPLIFY_ABILITY_ICONS: 1, ENABLE_NICKNAMES: 1,
        ENABLE_HIDE_FAILED_HINT: 1, ENABLE_CLEAN_STACKS: 1, HEALTHBAR_TYPE: 5 });
    assert.equal(hud.root.BHasClass("hide_magazine_active"), true);
    assert.equal(hud.root.BHasClass("simplify_ability_icons_active"), true);
    assert.equal(hud.root.BHasClass("nicknames_active"), true);
    assert.equal(hud.root.BHasClass("hide_failed_hint_active"), true);
    assert.equal(hud.root.BHasClass("clean_stacks_active"), false, "Minecraft healthbar keeps its stack gate");
    Q.core.ConfigStore.set("ql_ability_icons", "ENABLE_HIDE_COSMETIC_ABILITY", true);
    assert.equal(hud.root.BHasClass("hide_magazine_active"), true, "local feature changes retain unrelated settings");
    assert.equal(hud.root.BHasClass("minecraft_healthbar_active"), true);
    assert.equal(native.style.opacity, "0.75");
    assert.equal(native.GetParent(), abilities);
    for (const id of ["ql_ability_icons", "ql_cast_failed_hint", "ql_nicknames"])
        assert.equal(createdPolls.includes(id), false, id);
    env.clean();
});

test("damage impact owns only changed presentation properties and preserves native animation", () => {
    const env = fixture();
    const { Q, hud, core, add, config } = env;
    const panel = add(core, "damage_impact");
    panel.style.transform = "rotateZ(3deg)";
    panel.style.preTransformScale2d = "1.07";
    config({ DAMAGE_IMPACT_SCALE: 1.5, DAMAGE_IMPACT_X_OFFSET: 123, DAMAGE_IMPACT_OPACITY: 0.6 });
    assert.equal(panel.style.uiScale, "120%");
    assert.equal(panel.style.x, "123px");
    assert.equal(panel.style.opacity, "0.60");
    assert.equal(panel.style.y, undefined);
    Q.core.ConfigStore.set("ql_damage_impact", "ENABLE_DAMAGE_IMPACT", false);
    assert.equal(panel.BHasClass("qol-hidden"), true);
    assert.equal(panel.style.visibility, "collapse");
    config({ DAMAGE_IMPACT_SCALE: 1, DAMAGE_IMPACT_X_OFFSET: 0, DAMAGE_IMPACT_OPACITY: 1, ENABLE_DAMAGE_IMPACT: 1 });
    assert.equal(panel.style.uiScale, undefined);
    assert.equal(panel.style.x, undefined);
    assert.equal(panel.style.opacity, undefined);
    assert.equal(panel.style.visibility, undefined);
    assert.equal(panel.style.transform, "rotateZ(3deg)");
    assert.equal(panel.style.preTransformScale2d, "1.07");
    panel.DeleteAsync(0); hud.clock.advance(1);
    const replacement = add(core, "damage_impact");
    config({ DAMAGE_IMPACT_X_OFFSET: 123 });
    assert.equal(replacement.style.x, "123px", "settings bypass an earlier missing-panel retry deadline");
    env.clean();
});

test("damage report offsets have one owner across visible, hidden, replacement and disable states", () => {
    const env = fixture();
    const { Q, hud, core, add, config } = env;
    const panel = add(core, "CitadelHudDamageReport");
    panel.style.opacity = "0.8";
    panel.style.transform = "translateX(3px)";
    config({ DAMAGE_REPORT_X_OFFSET: 357, DAMAGE_REPORT_Y_OFFSET: -1400, DAMAGE_REPORT_SCALE: 150,
        DISABLE_DAMAGE_REPORT: 0, ENABLE_HIDE_MAGAZINE: 1 });
    assert.equal(Q.core.FeatureRegistry.isEnabled("ql_damage_report"), true);
    assert.equal(panel.style.x, "357px");
    assert.equal(panel.style.y, "1400px", "runtime accepts the same range as Customize");
    assert.equal(panel.style.uiScale, "150%");
    Q.core.ConfigStore.set("ql_damage_report", "DISABLE_DAMAGE_REPORT", true);
    assert.equal(hud.root.BHasClass("disable_damage_report_active"), true);
    assert.equal(hud.root.BHasClass("hide_magazine_active"), true);
    assert.equal(panel.style.x, "357px");
    Q.core.ConfigStore.set("ql_damage_report", "DISABLE_DAMAGE_REPORT", false);
    panel.DeleteAsync(0); hud.clock.advance(1);
    const replacement = add(core, "CitadelHudDamageReport");
    replacement.style.opacity = "0.9";
    hud.clock.advance(600);
    assert.equal(replacement.style.x, "357px");
    Q.core.FeatureRegistry.disable("ql_damage_report"); hud.clock.advance(1200);
    assert.equal(replacement.style.x, undefined, "core cannot reapply an offset after the owning feature stops");
    assert.equal(replacement.style.y, undefined);
    assert.equal(replacement.style.opacity, "0.9");
    assert.equal(replacement.style.uiScale, "150%", "independent scale owner remains active");
    env.clean();
});

test("combat overlay preserves indicator history, recovers owned labels and transitions phases", () => {
    const env = fixture();
    const { Q, hud, gameplay, add, config, find } = env;
    let signal = true;
    Q.core.hud.isCombatSignalActive = () => signal;
    const alert = add(gameplay, "InCombatAlert");
    Q.setCachedPanel("combatStatusAlertPanel", alert);
    Q.state.combatStatus.lastCombatMs = 500;
    config({ ENABLE_COMBAT_STATUS: 1, COMBAT_STATUS_SCALE: 150, COMBAT_STATUS_X_OFFSET: 80 });
    const overlay = find("QOLCombatStatusOverlay");
    assert.equal(overlay.style.visibility, "visible");
    assert.equal(overlay.style.uiScale, "150%");
    assert.equal(find("QOLCombatStatusState").text, "IN COMBAT");
    hud.clock.advance(1000);
    assert.equal(find("QOLCombatStatusTimer").text, "1.0s");
    const oldLabel = find("QOLCombatStatusState");
    oldLabel.DeleteAsync(0); hud.clock.advance(250);
    assert.notEqual(find("QOLCombatStatusState"), oldLabel);
    assert.equal(find("QOLCombatStatusState").text, "IN COMBAT");
    signal = false; hud.clock.advance(250);
    assert.equal(overlay.BHasClass("phase_recover"), true);
    assert.equal(find("QOLCombatStatusState").text, "RECOVERING");
    hud.clock.advance(3200);
    assert.equal(overlay.BHasClass("phase_idle"), true);
    Q.core.ConfigStore.set("ql_combat_status", "ENABLE_COMBAT_STATUS", false); hud.clock.advance(1);
    assert.equal(find("QOLCombatStatusOverlay"), null);
    assert.equal(Q.state.combatStatus.lastCombatMs, 500);
    assert.equal(Q.getCachedPanel("combatStatusAlertPanel"), alert);
    assert.equal(alert.IsValid(), true);
    env.clean();
});

test("zip boost distinguishes a ready hint from active buff and preserves cooldown through overlay replacement", () => {
    const env = fixture();
    const { hud, Q, gameplay, add, label, config, find } = env;
    const hint = add(gameplay, "citadel_ability_zipline_boost_", ["active"]);
    const context = label(hint, "context_label", "42s");
    const effects = add(gameplay, "StatusEffects");
    config({ ENABLE_ZIP_BOOST: 1, ZIP_BOOST_SCALE: 150, ZIP_BOOST_X_OFFSET: 80, ZIP_BOOST_Y_OFFSET: 60 });
    const first = find("QOLZipBoostOverlay");
    assert.equal(first.BHasClass("in_use"), false);
    assert.equal(find("QOLZipBoostState").text, "READY");
    hint.AddClass("on_cooldown"); hud.clock.advance(500);
    assert.equal(find("QOLZipBoostState").text, "COOLDOWN 42s");
    first.DeleteAsync(0); hud.clock.advance(500);
    const overlay = find("QOLZipBoostOverlay");
    assert.notEqual(overlay, first);
    assert.equal(overlay.style.uiScale, "150%");
    assert.equal(overlay.style.marginLeft, "-440px");
    assert.equal(find("QOLZipBoostState").text, "COOLDOWN 42s");
    const buff = add(effects, "status_citadel_ability_zipline_boost"); hud.clock.advance(500);
    assert.equal(overlay.BHasClass("in_use"), true);
    assert.match(find("QOLZipBoostState").text, /^ACTIVE \d+s$/);
    buff.DeleteAsync(0); hint.RemoveClass("on_cooldown"); hud.clock.advance(500);
    assert.equal(find("QOLZipBoostState").text, "READY");
    assert.equal(overlay.BHasClass("ready_flash"), true);
    hud.clock.advance(2200); assert.equal(overlay.BHasClass("ready_flash"), false);
    hud.root.AddClass("InHideout"); hud.clock.advance(500);
    assert.equal(overlay.BHasClass("qol-hidden"), true);
    assert.equal(context.text, "42s");
    Q.core.ConfigStore.set("ql_zipboost", "ENABLE_ZIP_BOOST", false); hud.clock.advance(1);
    assert.equal(find("QOLZipBoostOverlay"), null);
    assert.equal(hint.IsValid(), true); assert.equal(effects.IsValid(), true);
    env.clean();
});

test("better unsecured retains component scale, down-positive offsets and legacy icon/text setting", () => {
    const env = fixture();
    const { Q, hud, core, add, label, config, find } = env;
    const stats = add(core, "StatsAndModsContainer");
    const gold = add(stats, "gold_and_ap_container");
    const native = add(gold, "", ["hudDeathGoldContainer"]);
    const source = label(native, "hudDeathGoldLabel", "1.2k", ["death_penalty_gold"]);
    const caption = label(native, "hudUnsecuredLabel", "Native caption");
    const defaults = hud.sandbox.global.QOL_DEFAULT_CONFIG;
    config({ ENABLE_BETTER_UNSECURED: 1, UNSECURED_SOULS_HUD_SCALE: 200,
        UNSECURED_SOULS_HUD_X_OFFSET: defaults.UNSECURED_SOULS_HUD_X_OFFSET + 50,
        UNSECURED_SOULS_HUD_Y_OFFSET: defaults.UNSECURED_SOULS_HUD_Y_OFFSET + 30,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 0, ENABLE_BETTER_UNSECURED_SHOW_TEXT: 0,
        ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT: 1 });
    const overlay = find("QOLBetterUnsecuredOverlay");
    assert.equal(overlay.style.marginLeft, "165px"); assert.equal(overlay.style.marginBottom, "100px");
    assert.equal(find("QOLBetterUnsecuredMirrorLabel").style.fontSize, "28px");
    assert.equal(find("QOLBetterUnsecuredMirrorIcon").BHasClass("qol-hidden"), false);
    assert.equal(find("QOLBetterUnsecuredMirrorText").BHasClass("qol-hidden"), false);
    assert.equal(find("QOLBetterUnsecuredMirrorText").text, "Native caption");
    const mirror = find("QOLBetterUnsecuredMirrorLabel");
    mirror.DeleteAsync(0); hud.clock.advance(250);
    assert.notEqual(find("QOLBetterUnsecuredMirrorLabel"), mirror);
    assert.equal(find("QOLBetterUnsecuredMirrorLabel").text, "1.2k");
    assert.equal(find("QOLBetterUnsecuredMirrorLabel").style.fontSize, "28px");
    source.text = "0"; hud.clock.advance(250); assert.equal(overlay.BHasClass("qol-hidden"), true);
    source.text = "125"; hud.clock.advance(250); assert.equal(overlay.BHasClass("qol-hidden"), false);
    Q.core.ConfigStore.set("ql_better_unsecured_hud", "ENABLE_BETTER_UNSECURED", false); hud.clock.advance(1);
    assert.equal(find("QOLBetterUnsecuredOverlay"), null);
    assert.equal(source.text, "125"); assert.equal(caption.text, "Native caption");
    env.clean();
});

test("unsecured timer samples across its minimum interval, resets on gains/source replacement and owns only its overlay", () => {
    const env = fixture();
    const { Q, hud, core, gameplay, add, label, config, find } = env;
    const top = add(core, "TopBar"); label(top, "GameTime", "0:00");
    const source = label(gameplay, "HudUnsecuredLabel", "1000");
    config({ ENABLE_UNSECURED_SOUL_TIMER: 1, UNSECURED_SOUL_TIMER_SCALE: 200,
        UNSECURED_SOUL_TIMER_X_OFFSET: -300, UNSECURED_SOUL_TIMER_Y_OFFSET: 70 });
    hud.clock.advance(1);
    const overlay = find("QOLUnsecuredSoulsOverlay");
    const state = find("QOLUnsecuredSoulsState");
    assert.equal(overlay.style.marginLeft, "-820px"); assert.equal(overlay.style.marginBottom, "180px");
    assert.equal(state.style.fontSize, "32px"); assert.equal(state.text, "29s");
    source.text = "990"; hud.clock.advance(200);
    source.text = "980"; hud.clock.advance(200);
    assert.equal(state.text, "20s", "20 souls over400ms produces a50souls/s observed rate");
    source.text = "1200"; hud.clock.advance(200);
    assert.equal(state.text, "31s", "a gain releases the old decay-rate estimate");
    source.DeleteAsync(0); hud.clock.advance(1);
    const replacement = label(gameplay, "HudUnsecuredLabel", "500"); hud.clock.advance(200);
    assert.equal(state.text, "20s", "the new source cannot inherit a1200→500 decay sample");
    hud.root.AddClass("InHideout"); hud.clock.advance(200);
    assert.equal(overlay.BHasClass("qol-hidden"), false);
    Q.core.ConfigStore.set("ql_unsecured_souls_timer", "ENABLE_UNSECURED_SOUL_TIMER", false); hud.clock.advance(1);
    assert.equal(find("QOLUnsecuredSoulsOverlay"), null);
    assert.equal(replacement.text, "500");
    env.clean();
});

test("stat bonuses preserve integer zeros, react to native values and rebind their layout without altering stat sources", () => {
    const env = fixture();
    const { Q, hud, core, add, label, config, find } = env;
    const owner = add(core, "HeroStatsDisplay");
    const health = add(owner, "StatContainer_MaxHealth");
    const modified = label(health, "ModifiedLabel", "220");
    label(health, "BaseLabel", "100"); label(health, "ValueFromModsLabel", "10"); label(health, "StatScalingLabel", "10");
    config({ ENABLE_STAT_BONUSES: 1, STAT_BONUSES_SCALE: 125, STAT_BONUSES_X_OFFSET: 80, STAT_BONUSES_Y_OFFSET: 50 });
    assert.equal(find("QOLStatBonusesMaxHealth").text, "Max Health: 100");
    modified.text = "320"; hud.clock.advance(250);
    assert.equal(find("QOLStatBonusesMaxHealth").text, "Max Health: 200");
    const breakdown = add(health, "StatsBreakdownContainer");
    const row = add(breakdown, ""); label(row, "", "#citadel_shopstats_goldenstatues", ["StatName"]);
    const bonus = label(row, "", "+350", ["StatValue"]); hud.clock.advance(250);
    assert.equal(find("QOLStatBonusesMaxHealth").text, "Max Health: +350");
    const first = find("QOLStatBonusesOverlay");
    first.DeleteAsync(0); hud.clock.advance(250);
    const overlay = find("QOLStatBonusesOverlay");
    assert.notEqual(overlay, first);
    assert.equal(overlay.style.uiScale, "125%"); assert.equal(overlay.style.marginLeft, "-440px");
    assert.equal(find("QOLStatBonusesMaxHealth").text, "Max Health: +350");
    bonus.text = "0"; hud.clock.advance(250); assert.equal(find("QOLStatBonusesMaxHealth").BHasClass("is_zero"), true);
    owner.DeleteAsync(0); hud.clock.advance(1);
    const replacement = add(core, "HeroStatsDisplay");
    const newHealth = add(replacement, "StatContainer_MaxHealth");
    label(newHealth, "ModifiedLabel", "400"); label(newHealth, "BaseLabel", "100"); hud.clock.advance(250);
    assert.equal(find("QOLStatBonusesMaxHealth").text, "Max Health: 300", "replacement source releases old explicit-value cache");
    Q.core.ConfigStore.set("ql_stat_bonuses", "ENABLE_STAT_BONUSES", false); hud.clock.advance(1);
    assert.equal(find("QOLStatBonusesOverlay"), null);
    assert.equal(newHealth.IsValid(), true);
    env.clean();
});

test("unsecured mirrors rebind still-live native sources and reset the timer estimate", () => {
    const env = fixture();
    const { hud, $, core, gameplay, add, label, config, find } = env;
    const top = add(core, "TopBar"); label(top, "GameTime", "0:00");
    const stats = add(core, "StatsAndModsContainer");
    const gold = add(stats, "gold_and_ap_container");
    const oldContainer = add(gold, "", ["hudDeathGoldContainer"]);
    const oldAmount = label(oldContainer, "hudDeathGoldLabel", "1000", ["death_penalty_gold"]);
    const oldModern = label(gameplay, "HudUnsecuredLabel", "1000");
    config({ ENABLE_BETTER_UNSECURED: 1, ENABLE_UNSECURED_SOUL_TIMER: 1 });
    hud.clock.advance(1);
    oldModern.text = "980"; hud.clock.advance(400);
    assert.equal(find("QOLUnsecuredSoulsState").text, "20s");
    const detached = $.CreatePanel("Panel", null, "DetachedUnsecuredSources");
    oldContainer.SetParent(detached); oldModern.SetParent(detached);
    const currentContainer = add(gold, "", ["hudDeathGoldContainer"]);
    const amount = label(currentContainer, "hudDeathGoldLabel", "500", ["death_penalty_gold"]);
    label(gameplay, "HudUnsecuredLabel", "500");
    hud.clock.advance(2200);
    assert.equal(find("QOLBetterUnsecuredMirrorLabel").text, "500");
    assert.equal(find("QOLUnsecuredSoulsState").text, "20s", "replacement starts a fresh observed-rate history");
    assert.equal(oldAmount.text, "1000"); assert.equal(oldModern.text, "980");
    assert.equal(amount.IsValid(), true); assert.equal(oldContainer.IsValid(), true);
    env.clean();
});

test("zip boost replaces living hints and status containers with the current gameplay sources", () => {
    const env = fixture();
    const { hud, $, gameplay, add, label, config, find } = env;
    const oldHint = add(gameplay, "citadel_ability_zipline_boost_", ["on_cooldown"]);
    label(oldHint, "context_label", "42s");
    const oldEffects = add(gameplay, "StatusEffects");
    add(oldEffects, "status_citadel_ability_zipline_boost");
    config({ ENABLE_ZIP_BOOST: 1 });
    assert.match(find("QOLZipBoostState").text, /^ACTIVE /);
    const detached = $.CreatePanel("Panel", null, "DetachedZipSources");
    oldHint.SetParent(detached); oldEffects.SetParent(detached);
    add(gameplay, "citadel_ability_zipline_boost_", ["active"]);
    add(gameplay, "StatusEffects");
    hud.clock.advance(1800);
    assert.equal(find("QOLZipBoostState").text, "READY");
    assert.equal(oldHint.IsValid(), true); assert.equal(oldEffects.IsValid(), true);
    env.clean();
});

test("stat source replacement within a living owner releases the previous explicit bonus", () => {
    const env = fixture();
    const { hud, $, core, add, label, config, find } = env;
    const owner = add(core, "HeroStatsDisplay");
    const oldHealth = add(owner, "StatContainer_MaxHealth");
    const breakdown = add(oldHealth, "StatsBreakdownContainer");
    const row = add(breakdown, ""); label(row, "", "#citadel_shopstats_goldenstatues", ["StatName"]);
    label(row, "", "+350", ["StatValue"]);
    config({ ENABLE_STAT_BONUSES: 1 });
    assert.equal(find("QOLStatBonusesMaxHealth").text, "Max Health: +350");
    oldHealth.SetParent($.CreatePanel("Panel", null, "DetachedHealthStat"));
    const current = add(owner, "StatContainer_MaxHealth");
    label(current, "ModifiedLabel", "400"); label(current, "BaseLabel", "100");
    hud.clock.advance(1800);
    assert.equal(find("QOLStatBonusesMaxHealth").text, "Max Health: 300");
    assert.equal(oldHealth.IsValid(), true); assert.equal(owner.IsValid(), true);
    env.clean();
});
