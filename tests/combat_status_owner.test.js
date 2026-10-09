"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
function setup() {
    const env = createHud({ inHideout: false }); env.assertLoaded(); const { $, QOL: Q } = env.sandbox.global;
    Q.core.App.shutdown(); Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_COMBAT_STATUS: 1 });
    const cfg = Q.core.ConfigStore.view("ql_combat_status"); let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest("ql_combat_status").create({ id: "ql_combat_status", config: { view() { reads++; return cfg; } } });
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    function gameplay(root = env.doc.root) { const core = add(root, ""); core.AddClass("HudCore"); return add(core, "gameplay_hud"); }
    const overlay = () => env.doc.root.FindChildTraverse("QOLCombatStatusOverlay"), label = id => overlay()?.FindChild(id);
    function stop() { feature.onDisable(); env.clock.advance(20); assert.equal(overlay(), null); assert.deepEqual(env.clock.errors, []); }
    return { ...env, $, Q, cfg, feature, add, gameplay, overlay, label, reads: () => reads, stop };
}

test("combat text owner waits for native gameplay and derives reactive geometry without idle config reads", () => {
    const env = setup(); env.feature.onEnable(); assert.equal(env.overlay(), null);
    env.gameplay(); env.clock.advance(250); assert.equal(env.label("QOLCombatStatusState").text, "OUT OF COMBAT");
    env.cfg.COMBAT_STATUS_SCALE = 150; env.cfg.COMBAT_STATUS_X_OFFSET = 80; env.cfg.COMBAT_STATUS_Y_OFFSET = 40;
    env.feature.onSettingsChanged(); assert.equal(env.overlay().style.uiScale, "150%"); assert.equal(env.overlay().style.marginLeft, "80px");
    assert.equal(env.overlay().style.marginBottom, "205px"); env.clock.advance(500); assert.equal(env.reads(), 2); env.stop();
});

test("combat text owner retires living moved labels and preserves same-HUD phase history across gameplay replacement", () => {
    const env = setup(), first = env.gameplay(); env.root.AddClass("InCombat"); env.feature.onEnable(); env.clock.advance(1000);
    const oldLabel = env.label("QOLCombatStatusState"); oldLabel.SetParent(env.add(null, "RetiredLabels")); env.clock.advance(250);
    assert.equal(oldLabel.IsValid(), false); assert.equal(env.label("QOLCombatStatusState").text, "IN COMBAT");
    const old = env.overlay(); first.GetParent().SetParent(env.add(null, "RetiredGameplay")); env.gameplay(); env.clock.advance(250);
    assert.equal(old.IsValid(), false); assert.equal(env.label("QOLCombatStatusState").text, "IN COMBAT");
    assert.ok(Number.parseFloat(env.label("QOLCombatStatusTimer").text) >= 1); env.stop();
});

test("combat text owner resets old phase history for a new living Hud and contains stopped settings hooks", () => {
    const env = setup(); env.gameplay(); env.root.AddClass("InCombat"); env.feature.onEnable(); const old = env.overlay();
    env.doc.root = env.add(null, "Hud", "CitadelHud"); env.gameplay(); env.clock.advance(250);
    assert.equal(old.IsValid(), false); assert.equal(env.root.IsValid(), true);
    assert.equal(env.label("QOLCombatStatusState").text, "OUT OF COMBAT"); assert.equal(env.label("QOLCombatStatusTimer").text, "--");
    env.stop(); env.feature.onSettingsChanged(); env.clock.advance(1000); assert.equal(env.overlay(), null);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_combat_status"), false); assert.deepEqual(env.clock.errors, []);
});

test("combat text owner retries partial creation/styles and releases moved children after partial enable", () => {
    const env = setup(); env.gameplay(); const create = env.$.CreatePanel; let reject = true;
    env.$.CreatePanel = (type, parent, id, properties) => {
        if (id === "QOLCombatStatusTimer" && reject) throw Error("modeled partial creation");
        const panel = create(type, parent, id, properties);
        if (id === "QOLCombatStatusOverlay") panel.style = new Proxy({}, { set(target, key, value) {
            if (key === "uiScale" && reject) throw Error("modeled partial style"); target[key] = value; return true;
        } });
        return panel;
    };
    env.feature.onEnable(); assert.equal(env.label("QOLCombatStatusTimer"), null);
    reject = false; env.clock.advance(250); assert.equal(env.overlay().style.uiScale, "100%"); assert.equal(env.label("QOLCombatStatusTimer").text, "--");
    reject = true; env.cfg.COMBAT_STATUS_SCALE = 150; env.feature.onSettingsChanged(); assert.equal(env.overlay().style.uiScale, "100%");
    reject = false; env.clock.advance(250); assert.equal(env.overlay().style.uiScale, "150%");
    const moved = env.label("QOLCombatStatusState"); moved.SetParent(env.add(null, "RetiredLabels")); env.stop(); assert.equal(moved.IsValid(), false);
});

test("combat text registry unwinds partial enable without retaining owned UI or scheduled work", () => {
    const env = setup(); env.gameplay(); const registry = env.Q.core.FeatureRegistry, create = env.$.CreatePanel; let reject = true;
    env.$.CreatePanel = (type, parent, id, properties) => {
        const panel = create(type, parent, id, properties);
        if (id === "QOLCombatStatusState" && reject) Object.defineProperty(panel, "text", { get() { return ""; }, set() { throw Error("modeled enable failure"); } });
        return panel;
    };
    registry.enable("ql_combat_status"); env.clock.advance(20); assert.equal(registry.isEnabled("ql_combat_status"), false); assert.equal(env.overlay(), null);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_combat_status"), false);
    reject = false; registry.enable("ql_combat_status"); assert.ok(env.overlay()); registry.disable("ql_combat_status"); env.clock.advance(20);
    assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("rapid combat text re-enable waits for the retired tree instead of adopting its pending deletion", () => {
    const env = setup(); env.gameplay(); const registry = env.Q.core.FeatureRegistry;
    registry.enable("ql_combat_status"); const first = env.overlay(); let writes = 0;
    first.style = new Proxy(first.style, { set(target, key, value) { writes++; target[key] = value; return true; } });
    registry.disable("ql_combat_status"); registry.enable("ql_combat_status");
    assert.equal(writes, 0); env.clock.advance(300); assert.equal(first.IsValid(), false);
    assert.ok(env.overlay()); assert.notEqual(env.overlay(), first); assert.equal(env.label("QOLCombatStatusState").text, "OUT OF COMBAT");
    registry.disable("ql_combat_status"); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});
