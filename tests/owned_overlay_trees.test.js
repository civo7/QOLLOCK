"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

const owners = [
    { id: "ql_zipboost", key: "ENABLE_ZIP_BOOST", overlay: "QOLZipBoostOverlay", child: "QOLZipBoostState" },
    { id: "ql_better_unsecured_hud", key: "ENABLE_BETTER_UNSECURED", overlay: "QOLBetterUnsecuredOverlay", child: "QOLBetterUnsecuredMirrorLabel" },
    { id: "ql_unsecured_souls_timer", key: "ENABLE_UNSECURED_SOUL_TIMER", overlay: "QOLUnsecuredSoulsOverlay", child: "QOLUnsecuredSoulsState" },
    { id: "ql_stat_bonuses", key: "ENABLE_STAT_BONUSES", overlay: "QOLStatBonusesOverlay", child: "QOLStatBonusesMaxHealth" }
];

function fixture(owner) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { $, QOL: Q } = env.sandbox.global;
    Q.core.App.shutdown(); env.sandbox.eval("Math.random = () => 0;");
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), [owner.key]: 1 });
    const cfg = Q.core.ConfigStore.view(owner.id);
    let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest(owner.id).create({ id: owner.id, config: { view() { reads++; return cfg; } } });
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    const label = (parent, id, value) => { const panel = add(parent, id, "Label"); panel.text = value; return panel; };
    const scene = (root = env.doc.root) => {
        const core = add(root, ""); core.AddClass("HudCore");
        const gameplay = add(core, "gameplay_hud"), top = add(core, "TopBar"); label(top, "GameTime", "0:00");
        const hint = add(gameplay, "citadel_ability_zipline_boost_"); hint.AddClass("active"); add(gameplay, "StatusEffects");
        const modern = label(gameplay, "HudUnsecuredLabel", "500");
        const stats = add(core, "StatsAndModsContainer"), gold = add(stats, "gold_and_ap_container");
        const container = add(gold, ""); container.AddClass("hudDeathGoldContainer");
        const amount = label(container, "hudDeathGoldLabel", "500"); amount.AddClass("death_penalty_gold");
        label(container, "hudUnsecuredLabel", "Native caption");
        const statOwner = add(core, "HeroStatsDisplay"), health = add(statOwner, "StatContainer_MaxHealth");
        const modified = label(health, "ModifiedLabel", "300"); label(health, "BaseLabel", "100");
        return { core, gameplay, hint, modern, amount, modified };
    };
    const find = id => env.doc.root.FindChildTraverse(id);
    const overlay = () => find(owner.overlay);
    const children = () => {
        const result = [], queue = [overlay()];
        while (queue.length) { const panel = queue.shift(); if (!panel) continue; result.push(panel); queue.push(...panel.Children()); }
        return result;
    };
    const stop = () => {
        feature.onDisable(); env.clock.advance(20);
        assert.equal(overlay(), null); assert.deepEqual(env.clock.errors, []);
    };
    return { ...env, $, Q, cfg, feature, add, label, scene, find, overlay, children, stop, reads: () => reads };
}

for (const owner of owners) {
    test(owner.id + ": waits for native parents and retires every moved child without idle settings reads", () => {
        const env = fixture(owner); env.feature.onEnable(); env.clock.advance(500); assert.equal(env.overlay(), null);
        const native = env.scene(); env.clock.advance(2200); assert.ok(env.overlay());
        const previous = env.children().slice(1), detached = env.add(null, "DetachedOwnedChildren");
        for (const panel of previous) panel.SetParent(detached);
        env.clock.advance(500);
        for (const panel of previous) assert.equal(panel.IsValid(), false, panel.id);
        assert.ok(env.find(owner.child)); assert.equal(env.reads(), 1);
        assert.equal(native.amount.text, "500"); assert.equal(native.modern.text, "500"); assert.equal(native.modified.text, "300");
        const moved = env.find(owner.child); moved.SetParent(detached); env.stop(); assert.equal(moved.IsValid(), false);
        env.feature.onSettingsChanged(); env.clock.advance(1000); assert.equal(env.overlay(), null);
        assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(record => record.id === owner.id), false);
    });

    test(owner.id + ": retires a living native scope and a living old Hud before rebuilding", () => {
        const env = fixture(owner), native = env.scene(); env.feature.onEnable(); env.clock.advance(500);
        const old = env.children(); native.core.SetParent(env.add(null, "OldGameplay")); env.scene(); env.clock.advance(2200);
        for (const panel of old) assert.equal(panel.IsValid(), false, panel.id);
        assert.ok(env.overlay());
        const sameHud = env.children(); env.doc.root = env.add(null, "Hud", "CitadelHud"); env.scene(); env.clock.advance(500);
        for (const panel of sameHud) assert.equal(panel.IsValid(), false, panel.id);
        assert.equal(env.root.IsValid(), true); assert.ok(env.overlay());
        assert.equal(native.amount.text, "500"); assert.equal(native.modified.text, "300");
        if (owner.id === "ql_zipboost") assert.equal(env.find(owner.child).text, "READY");
        if (owner.id === "ql_unsecured_souls_timer") assert.equal(env.find(owner.child).text, "20s");
        env.stop();
    });

    test(owner.id + ": retries partial construction/styles and releases every created panel", () => {
        const env = fixture(owner); env.scene(); const create = env.$.CreatePanel; let failCreate = true, failStyle = true;
        env.$.CreatePanel = (type, parent, id, properties) => {
            if (id === owner.child && failCreate) throw Error("modeled child creation failure");
            const panel = create(type, parent, id, properties);
            if (id === owner.overlay) panel.style = new Proxy(panel.style, { set(target, key, value) {
                if (key === "marginLeft" && failStyle) throw Error("modeled style failure"); target[key] = value; return true;
            } });
            return panel;
        };
        env.feature.onEnable(); env.clock.advance(500); assert.equal(env.find(owner.child), null);
        failCreate = false; env.clock.advance(500); assert.ok(env.find(owner.child)); assert.equal(env.overlay().style.marginLeft, undefined);
        failStyle = false; env.clock.advance(500); assert.match(env.overlay().style.marginLeft, /px$/);
        const created = env.children(); env.stop(); for (const panel of created) assert.equal(panel.IsValid(), false, panel.id);
    });

    test(owner.id + ": rapid registry re-enable does not write into the previous instance's pending deletion", () => {
        const env = fixture(owner); env.scene(); const registry = env.Q.core.FeatureRegistry;
        registry.enable(owner.id); env.clock.advance(500); const previous = env.overlay(); let writes = 0;
        previous.style = new Proxy(previous.style, { set(target, key, value) { writes++; target[key] = value; return true; } });
        registry.disable(owner.id); registry.enable(owner.id); assert.equal(writes, 0);
        env.clock.advance(500); assert.equal(previous.IsValid(), false); assert.ok(env.overlay()); assert.notEqual(env.overlay(), previous);
        registry.disable(owner.id); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
    });
}

test("owned tree retries failed deletion and retires moved descendants after partial construction", () => {
    const env = fixture(owners[0]), P = env.Q.core.panel, tree = P.createOwnedTree();
    const native = env.add(env.root, "NativeParent"), overlay = tree.child(native, "Panel", "QOLHelperOverlay");
    const child = tree.child(overlay, "Label", "QOLHelperChild"), grandchild = tree.child(child, "Label", "QOLHelperGrandchild");
    const detached = env.add(null, "MovedChildren"); grandchild.SetParent(detached);
    const deleteChild = child.DeleteAsync.bind(child); let reject = true;
    child.DeleteAsync = delay => { if (reject) throw Error("modeled deletion failure"); deleteChild(delay); };
    child.SetParent(detached); tree.clear(); assert.equal(child.visible, false); assert.equal(grandchild.visible, false);
    env.clock.advance(20); assert.equal(child.IsValid(), true); assert.equal(grandchild.IsValid(), false);
    reject = false; tree.sweep(); env.clock.advance(20); assert.equal(child.IsValid(), false);
    assert.equal(native.IsValid(), true); assert.equal(overlay.IsValid(), false); tree.dispose(); assert.deepEqual(env.clock.errors, []);
});
