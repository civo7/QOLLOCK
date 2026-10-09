"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

const cases = [
    { id: "ql_souls", prefix: "SOULS", toggle: "HUD_SOULS_ENABLED", config: { SOULS_X_OFFSET: 60, SOULS_Y_OFFSET: 25, SOULS_OPACITY: 0.4 } },
    { id: "ql_topbar", prefix: "TOP_BAR", toggle: "HUD_TOP_BAR_ENABLED", config: { TOP_BAR_X_OFFSET: 60, TOP_BAR_Y_OFFSET: 25, TOP_BAR_OPACITY: 0.4, TOP_BAR_SCALE: 1.3 }, scale: "130%" },
    { id: "ql_bottom_bar", prefix: "BOTTOM_BAR", toggle: "HUD_BOTTOM_BAR_ENABLED", config: { BOTTOM_BAR_X_OFFSET: 60, BOTTOM_BAR_Y_OFFSET: 25, BOTTOM_BAR_OPACITY: 0.4, BOTTOM_BAR_SCALE: 1.3, BOTTOM_BAR_WASH_COLOR: 13, ACTIVE_ITEMS_SCALE: 145, ACTIVE_ITEMS_X_OFFSET: 80 }, scale: "117%" }
];

function setup(scenario) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global; Q.core.App.shutdown(); env.clock.advance(1);
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ...scenario.config });
    const cfg = Q.core.ConfigStore.view(scenario.id), registry = Q.core.FeatureRegistry;
    let reads = 0;
    const feature = registry.getManifest(scenario.id).create({ id: scenario.id, config: { view() { reads++; return cfg; } }, events: Q.core.EventBus });
    const add = (parent, id = "", classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id); for (const name of classes) panel.AddClass(name); return panel;
    };
    const native = root => {
        const core = add(root, "", ["HudCore"]), stats = add(core, "StatsAndModsContainer"), left = add(stats, "LowerLeft");
        const souls = add(left, "gold_and_ap_container");
        if (scenario.id === "ql_souls") return { core, panel: souls, souls };
        if (scenario.id === "ql_topbar") return { core, panel: add(core, "TopBar"), souls };
        const abilities = add(core, "AbilitiesContainer"), panel = add(abilities, "hud_signature"), slots = add(abilities, "ActiveAbilitiesMenu"), ap = add(abilities, "APContainer");
        const icon = add(ap, "", ["APCurrencyIcon"]), amount = add(ap, "", ["APCurrencyAmount"], "Label"), infinite = add(ap, "hudAPInfinite");
        const soulIcon = add(souls, "", ["APCurrencyIcon"]);
        return { core, panel, abilities, slots, ap, icon, amount, infinite, souls, soulIcon };
    };
    return { ...env, Q, $, cfg, feature, add, native, registry, reads: () => reads, baselinePending: env.clock.pendingCount() };
}

for (const scenario of cases) {
    test(`${scenario.id}: living HUD replacement retains rejected native retirement and rebinds unchanged settings`, () => {
        const env = setup(scenario), old = env.native(env.root);
        old.panel.style.transform = "rotateZ(7deg)";
        env.feature.onEnable();
        assert.equal(old.panel.style.x, "60px"); assert.equal(old.panel.style.opacity, "0.40");
        const clear = old.panel.ClearPropertyFromCode.bind(old.panel), setClass = old.panel.SetHasClass.bind(old.panel);
        let reject = true;
        old.panel.ClearPropertyFromCode = property => reject && (property === "x" || property === "opacity") ? false : clear(property);
        old.panel.SetHasClass = (name, value) => { if (reject && name === "qol-hidden" && !value) throw Error("native class temporarily unavailable"); setClass(name, value); };
        old.panel.AddClass("qol-hidden");
        const currentRoot = env.add(null, "Hud", [], "CitadelHud"), current = env.native(currentRoot);
        env.$.GetContextPanel = () => currentRoot; env.clock.advance(1200);
        assert.equal(old.panel.style.x, "0px"); assert.equal(old.panel.style.opacity, "0.40");
        assert.equal(old.panel.BHasClass("qol-hidden"), true);
        assert.equal(current.panel.style.x, "60px"); assert.equal(current.panel.style.opacity, "0.40");
        if (scenario.scale) assert.equal(current.panel.style.uiScale, scenario.scale);
        if (old.slots) {
            assert.equal(old.slots.style.x, undefined); assert.equal(old.icon.style.washColor, undefined);
            assert.equal(current.slots.style.x, "80px");
            assert.equal(current.icon.style.washColor, env.Q.core.panel.resolvePaletteColor(13));
        }
        reject = false; env.clock.advance(1200);
        assert.equal(old.panel.style.x, undefined); assert.equal(old.panel.style.opacity, undefined);
        assert.equal(old.panel.style.transform, "rotateZ(7deg)"); assert.equal(old.panel.BHasClass("qol-hidden"), false);
        assert.equal(current.panel.style.x, "60px"); assert.equal(env.reads(), 1);
        env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
    });

    test(`${scenario.id}: loading lookalikes wait for native HUD and failed disable cleanup cannot revive stopped presentation`, () => {
        const env = setup(scenario), loading = env.add(null, "LoadingRoot"), fake = env.native(loading);
        env.$.GetContextPanel = () => loading; env.feature.onEnable();
        assert.equal(fake.panel.style.x, undefined); assert.equal(env.reads(), 1);
        if (fake.icon) assert.equal(fake.icon.style.washColor, undefined);
        const current = env.native(env.root); env.$.GetContextPanel = () => env.root; env.clock.advance(1200);
        assert.equal(current.panel.style.x, "60px");
        const clear = current.panel.ClearPropertyFromCode.bind(current.panel); let reject = true;
        current.panel.ClearPropertyFromCode = property => reject ? false : clear(property);
        env.feature.onDisable(); assert.equal(current.panel.style.x, "0px");
        env.cfg[scenario.prefix + "_X_OFFSET"] = 100; env.feature.onSettingsChanged();
        reject = false; env.clock.advance(1200);
        assert.equal(current.panel.style.x, undefined); assert.equal(current.panel.style.opacity, undefined);
        assert.equal(current.panel.IsValid(), true); assert.equal(env.reads(), 1);
        assert.equal(env.clock.pendingCount(), env.baselinePending, "retirement does not become an extra feature poll");
        assert.deepEqual(env.clock.errors, []);
    });

    test(`${scenario.id}: production registry disable and rapid re-enable protect the new generation's native styles`, () => {
        const env = setup(scenario), current = env.native(env.root);
        env.registry.enable(scenario.id); const first = env.registry.getInstance(scenario.id);
        assert.ok(first); assert.equal(current.panel.style.x, "60px");
        const clear = current.panel.ClearPropertyFromCode.bind(current.panel); let reject = true;
        current.panel.ClearPropertyFromCode = property => reject ? false : clear(property);
        env.registry.disable(scenario.id); assert.equal(current.panel.style.x, "0px");
        env.cfg[scenario.prefix + "_X_OFFSET"] = 95;
        env.registry.enable(scenario.id);
        assert.notEqual(env.registry.getInstance(scenario.id), first); assert.equal(current.panel.style.x, "95px");
        first.onSettingsChanged(); reject = false; env.clock.advance(1200);
        assert.equal(current.panel.style.x, "95px"); assert.equal(current.panel.style.opacity, "0.40");
        env.registry.disable(scenario.id); env.clock.advance(1200);
        assert.equal(current.panel.style.x, undefined); assert.equal(current.panel.style.opacity, undefined);
        assert.equal(env.clock.pendingCount(), env.baselinePending);
        assert.deepEqual(env.clock.errors, []);
    });

    test(`${scenario.id}: partial writes retry and native feedback invalidates readback without repeated idle writes`, () => {
        const env = setup(scenario), current = env.native(env.root); let reject = true, writes = 0;
        current.panel.style = new Proxy(current.panel.style, { set(target, key, value) {
            writes++; if (reject && key === "opacity") throw Error("native opacity temporarily unavailable");
            target[key] = value; return true;
        } });
        env.feature.onEnable(); assert.equal(current.panel.style.opacity, undefined);
        reject = false; env.clock.advance(1200); assert.equal(current.panel.style.opacity, "0.40");
        const stable = writes; env.clock.advance(1200); assert.equal(writes, stable);
        current.panel.style.opacity = "0.9"; current.panel.style.x = "120px";
        env.clock.advance(1200); assert.equal(current.panel.style.opacity, "0.40"); assert.equal(current.panel.style.x, "60px");
        const restored = writes; env.clock.advance(1200); assert.equal(writes, restored); assert.equal(env.reads(), 1);
        env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
    });
}

test("bottom bar currency follows changing leaves and tint gates independently of active-slot geometry", () => {
    const env = setup(cases[2]), current = env.native(env.root); env.feature.onEnable();
    const color = env.Q.core.panel.resolvePaletteColor(13);
    assert.equal(current.icon.style.washColor, color); assert.equal(current.amount.style.color, color);
    assert.equal(current.soulIcon.style.washColor, color);
    const clear = current.icon.ClearPropertyFromCode.bind(current.icon); let reject = true;
    current.icon.ClearPropertyFromCode = property => reject ? false : clear(property);
    const detached = env.add(null, "RetiredCurrency"); current.icon.SetParent(detached);
    const late = env.add(current.ap, "", ["APCurrencyIcon"]); env.clock.advance(600);
    assert.equal(current.icon.style.washColor, color); assert.equal(late.style.washColor, color);
    reject = false; env.clock.advance(600); assert.equal(current.icon.style.washColor, undefined);
    late.style.washColor = "#000000"; current.amount.style.color = "#FFFFFF"; env.clock.advance(600);
    assert.equal(late.style.washColor, color); assert.equal(current.amount.style.color, color);
    // A recycled leaf can change its presentation role without replacing its handle.
    late.RemoveClass("APCurrencyIcon"); late.AddClass("APCurrencyAmount"); env.clock.advance(600);
    assert.equal(late.style.washColor, undefined); assert.equal(late.style.color, color);
    env.cfg.HUD_BOTTOM_BAR_ENABLED = 0; env.feature.onSettingsChanged();
    assert.equal(current.panel.style.visibility, "collapse"); assert.equal(current.panel.BHasClass("qol-hidden"), true);
    assert.equal(late.style.color, undefined); assert.equal(current.soulIcon.style.washColor, undefined);
    assert.equal(current.slots.style.x, "80px"); assert.equal(current.slots.style.uiScale, "145%");
    env.cfg.HUD_BOTTOM_BAR_ENABLED = 1; env.feature.onSettingsChanged();
    assert.equal(late.style.color, color); assert.equal(current.panel.style.visibility, undefined);
    env.cfg.BOTTOM_BAR_WASH_COLOR = 0; env.feature.onSettingsChanged();
    assert.equal(late.style.color, undefined); assert.equal(current.amount.style.color, undefined);
    assert.equal(current.panel.style.washColor, undefined); assert.equal(current.slots.style.uiScale, "145%");
    env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});
