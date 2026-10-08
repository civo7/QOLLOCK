"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup(config) {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    const defaults = env.sandbox.evalJson("QOL.buildDefaultConfig()");
    for (const key of Object.keys(defaults)) if (/^ENABLE_(?:COLORED_HEALTHBAR|COLOR_WARNING_|ENEMY_COLORED|ALLY_COLORED|TOPBAR_(?:ENEMY|ALLY)_HP_WARNING)/.test(key)) defaults[key] = 0;
    Q.core.ConfigAdapter.loadFromFlat({ ...defaults, ...config });
    const feature = Q.core.FeatureRegistry.getManifest("ql_color_warnings").create({
        id: "ql_color_warnings", config: { view: () => Q.core.ConfigStore.view("ql_color_warnings") }
    });
    return { ...env, Q, $, feature };
}

function selfHealth(env, current = 700, total = 1000) {
    const container = env.$.CreatePanel("Panel", env.root, "health_and_abilities_container");
    const regen = env.$.CreatePanel("Panel", container, "HealthRegenAndTotal");
    const currentLabel = env.$.CreatePanel("Label", regen, "CurrentHealth");
    currentLabel.AddClass("currentHealthLabel");
    currentLabel.text = String(current);
    const totalLabel = env.$.CreatePanel("Label", regen, "TotalHealth");
    totalLabel.AddClass("totalHealthLabel");
    totalLabel.text = String(total);
    const bars = env.$.CreatePanel("Panel", container, "hud_health_bars_stacked");
    const bar = env.$.CreatePanel("ProgressBar", bars, "health_bars_container");
    const fill = env.$.CreatePanel("Panel", bar, "health_bar_left");
    return { container, currentLabel, totalLabel, bars, bar, fill };
}

function topbarHealth(env, kind = "enemy", current = 500, total = 1000) {
    const slot = env.$.CreatePanel("Panel", env.root, "");
    slot.AddClass(kind);
    const owner = env.$.CreatePanel("Panel", slot, "HealthBar");
    const parent = env.$.CreatePanel("ProgressBar", owner, "HeroHealth");
    parent.value = current;
    parent.max = total;
    const fill = env.$.CreatePanel("Panel", parent, "HeroHealth_Left");
    fill.AddClass("ProgressBarLeft");
    return { slot, owner, parent, fill };
}

test("warning channels keep their existing palette and release only their owned properties", () => {
    const env = setup({ ENABLE_COLOR_WARNING_75: 1, ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1, ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1 });
    const self = selfHealth(env), enemy = topbarHealth(env), ally = topbarHealth(env, "friend", 700);
    enemy.fill.style.opacity = "0.42";
    self.currentLabel.style.fontSize = "37px";
    env.feature.onEnable();
    assert.equal(self.fill.style.washColor, "rgb(255, 240, 120)");
    assert.equal(self.currentLabel.style.color, "rgb(255, 240, 120)");
    assert.equal(enemy.fill.style.backgroundColor, "rgb(255, 123, 0)");
    assert.equal(ally.fill.style.backgroundColor, "rgb(255, 240, 120)");
    env.feature.onDisable();
    assert.equal(self.fill.style.washColor, undefined);
    assert.equal(self.currentLabel.style.color, undefined);
    assert.equal(enemy.fill.style.backgroundColor, undefined, "return to native CSS rather than hardcoding a color");
    assert.equal(ally.fill.style.backgroundColor, undefined);
    assert.equal(enemy.fill.style.opacity, "0.42");
    assert.equal(self.currentLabel.style.fontSize, "37px");
    assert.deepEqual(env.clock.errors, []);
});

test("switching off self warnings clears its styles while the enemy observer remains enabled", () => {
    const env = setup({ ENABLE_COLOR_WARNING_75: 1, ENABLE_ENEMY_COLORED_HEALTHBAR: 1 });
    const self = selfHealth(env), enemy = topbarHealth(env);
    env.feature.onEnable();
    env.Q.core.ConfigStore.set("ql_color_warnings", "ENABLE_COLOR_WARNING_75", false);
    env.feature.onSettingsChanged();
    assert.equal(self.bars.style.washColor, undefined);
    assert.equal(self.currentLabel.style.color, undefined);
    assert.equal(enemy.fill.style.backgroundColor, "rgb(255, 86, 86)");
    env.feature.onDisable();
});

test("self warnings rebind a living health-container replacement and restore retired native panels", () => {
    const env = setup({ ENABLE_COLOR_WARNING_75: 1 });
    const original = selfHealth(env);
    env.feature.onEnable();
    original.container.SetParent(env.$.CreatePanel("Panel", null, "RetiredHealthHUD"));
    const replacement = selfHealth(env, 900);
    env.clock.advance(300);
    assert.equal(original.container.IsValid(), true);
    assert.equal(original.fill.style.washColor, undefined);
    assert.equal(original.currentLabel.style.color, undefined);
    assert.equal(replacement.fill.style.washColor, "rgb(255, 255, 255)");
    env.feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("top-bar discovery finds added native slots and replaces a living fill without inheriting its style signature", () => {
    const env = setup({ ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1 });
    const original = topbarHealth(env);
    env.feature.onEnable();
    const added = topbarHealth(env);
    env.clock.advance(1500);
    assert.equal(added.fill.style.backgroundColor, "rgb(255, 123, 0)", "living old slots cannot suppress discovery of new slots");
    original.fill.SetParent(env.$.CreatePanel("Panel", null, "RetiredHealthFill"));
    const replacement = env.$.CreatePanel("Panel", original.parent, "HeroHealth_Left");
    replacement.AddClass("ProgressBarLeft");
    env.clock.advance(300);
    assert.equal(original.fill.style.backgroundColor, undefined);
    assert.equal(replacement.style.backgroundColor, "rgb(255, 123, 0)");
    env.feature.onDisable();
    assert.equal(replacement.style.backgroundColor, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("reusing a native health slot across team changes has one presentation owner", () => {
    const env = setup({ ENABLE_ENEMY_COLORED_HEALTHBAR: 1, ENABLE_ALLY_COLORED_HEALTHBAR: 1 });
    const slot = topbarHealth(env, "friend");
    env.feature.onEnable();
    assert.equal(slot.fill.style.backgroundColor, "rgb(255, 255, 255)");
    slot.slot.RemoveClass("friend");
    slot.slot.AddClass("enemy");
    env.clock.advance(300);
    assert.equal(slot.fill.style.backgroundColor, "rgb(255, 86, 86)");
    env.feature.onDisable();
});

test("a living native panel recycled out of its health-bar role releases its warning immediately", () => {
    const env = setup({ ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1 });
    const slot = topbarHealth(env);
    env.feature.onEnable();
    assert.equal(slot.fill.style.backgroundColor, "rgb(255, 123, 0)");
    slot.fill.RemoveClass("ProgressBarLeft");
    env.clock.advance(300);
    assert.equal(slot.fill.style.backgroundColor, undefined);
    env.feature.onDisable();
});

test("failed native color writes retry and missing health data releases stale self warnings", () => {
    const env = setup({ ENABLE_COLOR_WARNING_75: 1, ENABLE_ENEMY_COLORED_HEALTHBAR: 1 });
    const self = selfHealth(env), enemy = topbarHealth(env);
    let color, attempts = 0;
    Object.defineProperty(enemy.fill.style, "backgroundColor", {
        configurable: true, get: () => color,
        set(value) { attempts++; if (attempts === 1) throw new Error("native style temporarily unavailable"); color = value; }
    });
    env.feature.onEnable();
    assert.equal(color, undefined);
    self.currentLabel.text = "";
    self.totalLabel.text = "";
    env.clock.advance(300);
    assert.equal(color, "rgb(255, 86, 86)");
    assert.ok(attempts >= 2);
    assert.equal(self.currentLabel.style.color, undefined);
    assert.equal(self.fill.style.washColor, undefined);
    env.feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("low-health pulses share a phase within each team and accept physical-height progress fallback", () => {
    const env = setup({ ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1 });
    const first = topbarHealth(env, "enemy", 200), second = topbarHealth(env, "enemy", 200);
    delete second.parent.value;
    delete second.parent.max;
    second.parent.actuallayoutheight = 100;
    second.fill.actuallayoutheight = 20;
    env.feature.onEnable();
    const initial = first.fill.style.backgroundColor;
    assert.equal(initial, second.fill.style.backgroundColor);
    env.clock.advance(300);
    assert.notEqual(first.fill.style.backgroundColor, initial);
    assert.equal(first.fill.style.backgroundColor, second.fill.style.backgroundColor);
    env.feature.onDisable();
});

test("native health-bar discovery backs off while sources are missing", () => {
    const env = setup({ ENABLE_ENEMY_COLORED_HEALTHBAR: 1 });
    const traverse = env.root.FindChildrenWithClassTraverse.bind(env.root);
    let searches = 0;
    env.root.FindChildrenWithClassTraverse = name => { if (name === "ProgressBarLeft") searches++; return traverse(name); };
    env.feature.onEnable();
    env.clock.advance(5000);
    assert.ok(searches <= 4, `missing bars triggered ${searches} scans`);
    const slot = topbarHealth(env);
    env.clock.advance(2200);
    assert.equal(slot.fill.style.backgroundColor, "rgb(255, 86, 86)");
    env.feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});
