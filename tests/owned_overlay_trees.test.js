"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

const owners = [
    { id: "ql_zipboost", key: "ENABLE_ZIP_BOOST", overlay: "QOLZipBoostOverlay", child: "QOLZipBoostState" },
    { id: "ql_better_unsecured_hud", key: "ENABLE_BETTER_UNSECURED", overlay: "QOLBetterUnsecuredOverlay", child: "QOLBetterUnsecuredMirrorLabel" },
    { id: "ql_unsecured_souls_timer", key: "ENABLE_UNSECURED_SOUL_TIMER", overlay: "QOLUnsecuredSoulsOverlay", child: "QOLUnsecuredSoulsState" },
];

function fixture(owner) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { $, QOL: Q } = env.sandbox.global;
    Q.core.App.shutdown(); env.sandbox.eval("Math.random = () => 0;");
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), [owner.key]: 1 });
    const cfg = Q.core.ConfigStore.view(owner.id);
    let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest(owner.id).create({ events: Q.core.EventBus, id: owner.id, config: { view() { reads++; return cfg; } } });
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    const label = (parent, id, value) => { const panel = add(parent, id, "Label"); panel.text = value; return panel; };
    const scene = (root = env.doc.root) => {
        const core = add(root, ""); core.AddClass("HudCore");
        const gameplay = add(core, "gameplay_hud"), top = add(core, "TopBar"); label(top, "GameTime", "0:00");
        const alive = add(gameplay, "gameplay_hud_alive"), crosshair = add(alive, "crosshair");
        const hints = add(crosshair, "button_hints_container", "Citadel_AbilityHUDElement_ButtonHint");
        const bucket = add(add(hints, "RightContainer"), ""); bucket.AddClass("priority_bucket");
        const hint = add(bucket, "citadel_ability_zipline_boost_"); hint.AddClass("active"); add(alive, "StatusEffects");
        const stats = add(core, "StatsAndModsContainer"), lower = add(stats, "LowerLeft"), gold = add(lower, "gold_and_ap_container");
        const container = add(add(gold, "hudGoldContainer"), ""); container.AddClass("hudDeathGoldContainer");
        const amount = label(container, "hudDeathGoldLabel", "500"); amount.AddClass("death_penalty_gold");
        label(container, "hudUnsecuredLabel", "Native caption");
        const statOwner = add(core, "HeroStatsDisplay"), health = add(statOwner, "StatContainer_MaxHealth");
        const modified = label(health, "ModifiedLabel", "300"); label(health, "BaseLabel", "100");
        return { core, gameplay, hint, amount, modified };
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
        assert.equal(native.amount.text, "500"); assert.equal(native.modified.text, "300");
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
        if (owner.id === "ql_unsecured_souls_timer") assert.equal(env.find(owner.child).text, "173s");
        env.stop();
    });

    test(owner.id + ": retries partial construction/styles and releases every created panel", () => {
        const env = fixture(owner); env.scene(); const create = env.$.CreatePanel; let failCreate = true, failStyle = true;
        const position = owner.id === "ql_unsecured_souls_timer" ? "marginLeft" : "x";
        env.$.CreatePanel = (type, parent, id, properties) => {
            if (id === owner.child && failCreate) throw Error("modeled child creation failure");
            const panel = create(type, parent, id, properties);
            if (id === owner.overlay) panel.style = new Proxy(panel.style, { set(target, key, value) {
                if (key === position && failStyle) throw Error("modeled style failure"); target[key] = value; return true;
            } });
            return panel;
        };
        env.feature.onEnable(); env.clock.advance(500); assert.equal(env.find(owner.child), null);
        failCreate = false; env.clock.advance(500); assert.ok(env.find(owner.child)); assert.equal(env.overlay().style[position], undefined);
        failStyle = false; env.clock.advance(500); assert.match(env.overlay().style[position], /px$/);
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

test("owned tree reuses creation attributes without native attribute writes on every child lookup", () => {
    const env = fixture(owners[0]);
    const tree = env.Q.core.panel.createOwnedTree();
    const parent = env.add(env.root, "CreationOnlyParent");
    const properties = { "require-composition-layer": "true" };
    const child = tree.child(parent, "Panel", "QOLCreationOnlyChild", properties);
    assert.equal(child.GetAttributeString("require-composition-layer", ""), "true");
    const setAttribute = child.SetAttributeString.bind(child);
    let writes = 0;
    child.SetAttributeString = (key, value) => { writes++; setAttribute(key, value); };
    for (let iteration = 0; iteration < 20; iteration++) {
        assert.equal(tree.child(parent, "Panel", "QOLCreationOnlyChild", properties), child);
    }
    assert.equal(writes, 0, "creation properties must not be reapplied as arbitrary native attributes");
    assert.equal(child.GetAttributeString("require-composition-layer", ""), "true");
    tree.dispose();
    env.clock.advance(20);
    assert.deepEqual(env.clock.errors, []);
});

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

test("owned tree removes one branch including moved descendants without touching siblings or native IDs", () => {
    const env = fixture(owners[0]), tree = env.Q.core.panel.createOwnedTree();
    const native = env.add(env.root, "NativeParent"), foreign = env.add(native, "NativeChild");
    const overlay = tree.child(native, "Panel", "QOLRemoveRoot");
    const branch = tree.child(overlay, "Panel", "QOLRemoveBranch");
    const moved = tree.child(branch, "Label", "QOLRemoveMoved"), sibling = tree.child(overlay, "Label", "QOLRemoveSibling");
    moved.SetParent(env.add(null, "DetachedBranch"));
    tree.remove("NativeChild"); tree.remove("QOLRemoveBranch"); env.clock.advance(20);
    assert.equal(branch.IsValid(), false); assert.equal(moved.IsValid(), false);
    assert.equal(overlay.IsValid(), true); assert.equal(sibling.IsValid(), true); assert.equal(foreign.IsValid(), true);
    assert.equal(tree.child(overlay, "Label", "QOLRemoveSibling"), sibling);
    tree.dispose(); env.clock.advance(20); assert.equal(sibling.IsValid(), false); assert.deepEqual(env.clock.errors, []);
});

test("owned tree sweep reports current topology loss without invalidating surviving nodes for deletion retries", () => {
    const env = fixture(owners[0]), tree = env.Q.core.panel.createOwnedTree();
    const overlay = tree.child(env.root, "Panel", "QOLSweepRoot"), child = tree.child(overlay, "Label", "QOLSweepChild");
    assert.equal(tree.sweep(), true);
    const remove = child.DeleteAsync.bind(child); let reject = true;
    child.DeleteAsync = delay => { if (reject) throw Error("modeled queued deletion failure"); remove(delay); };
    child.SetParent(env.add(null, "MovedSweepChild"));
    assert.equal(tree.sweep(), false); assert.equal(child.visible, false); assert.equal(overlay.IsValid(), true);
    assert.equal(tree.sweep(), true); reject = false; assert.equal(tree.sweep(), true);
    env.clock.advance(20); assert.equal(child.IsValid(), false);
    tree.dispose(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("owned sibling batches and sweep remain linear while detecting live moves and duplicate replacements", () => {
    const env = fixture(owners[0]), tree = env.Q.core.panel.createOwnedTree();
    const parent = env.add(env.root, "MarkerBatch"), detached = env.add(null, "OldMarkers");
    const entries = Array.from({ length: 400 }, (_, i) => ({ id: "QOLMarker" + i }));
    const first = tree.children(parent, "Panel", entries);
    assert.equal(first.length, 400);
    let searches = 0, snapshots = 0;
    const find = parent.FindChild.bind(parent), children = parent.Children.bind(parent);
    parent.FindChild = id => { searches++; return find(id); };
    parent.Children = () => { snapshots++; return children(); };
    for (let i = 0; i < 20; i++) {
        assert.equal(tree.sweep(), true);
        const next = tree.children(parent, "Panel", entries);
        assert.ok(next.every((panel, j) => panel === first[j]));
    }
    assert.equal(searches, 0, "steady-state batch must not walk siblings for every ID");
    assert.equal(snapshots, 40, "one linear snapshot per parent/pass");
    first[200].SetParent(detached);
    const duplicate = env.add(parent, "QOLMarker0"); parent.MoveChildBefore(duplicate, first[0]);
    assert.equal(tree.sweep(), false);
    assert.equal(first[0].visible, false);
    assert.equal(first[200].visible, false, "moved owned markers still retire");
    const partial = tree.children(parent, "Panel", entries);
    assert.equal(partial[0], null, "foreign replacement is retired, never adopted");
    env.clock.advance(20);
    const recovered = tree.children(parent, "Panel", entries);
    assert.ok(recovered.every(panel => panel && panel.IsValid()));
    assert.notEqual(recovered[0], first[0]); assert.notEqual(recovered[200], first[200]);
    tree.dispose(); env.clock.advance(20);
    assert.equal(parent.IsValid(), true);
    assert.ok(recovered.every(panel => !panel.IsValid()));
});

test("bulk owned-tree clear retires mixed handles with linear record visits", () => {
    const env = fixture(owners[0]), tree = env.Q.core.panel.createOwnedTree();
    const parent = env.add(env.root, "NativeClearParent"), foreign = env.add(parent, "NativeUnownedChild");
    const entries = Array.from({ length: 400 }, (_, index) => ({ id: "QOLClearMarker" + index }));
    const markers = tree.children(parent, "Panel", entries);
    const moved = tree.child(markers[0], "Label", "QOLClearMoved");
    const fresh = tree.create("Label", markers[1], "QOLClearFresh");
    const detached = env.add(null, "DetachedClearChildren"); moved.SetParent(detached); fresh.SetParent(detached);
    // Count actual record enumeration in the helper's realm, retaining Map's
    // behavior. This catches quadratic rescans without native-time estimates.
    env.sandbox.eval(`
        globalThis.clearOwnedVisits = 0;
        const ownedRecord = record => record && record.panel && record.panel.id.startsWith("QOLClear");
        const recordEntries = Map.prototype[Symbol.iterator], recordValues = Map.prototype.values;
        Map.prototype[Symbol.iterator] = function* () {
            for (const entry of recordEntries.call(this)) {
                if (ownedRecord(entry[1])) clearOwnedVisits++;
                yield entry;
            }
        };
        Map.prototype.values = function* () {
            for (const record of recordValues.call(this)) {
                if (ownedRecord(record)) clearOwnedVisits++;
                yield record;
            }
        };
    `);
    tree.clear();
    const visits = env.sandbox.eval("clearOwnedVisits"), owned = [...markers, moved, fresh];
    assert.ok(visits <= owned.length * 4, `${owned.length} owned handles required ${visits} record visits`);
    assert.ok(owned.every(panel => panel.visible === false));
    env.clock.advance(20);
    assert.ok(owned.every(panel => !panel.IsValid()));
    assert.equal(parent.IsValid(), true); assert.equal(foreign.IsValid(), true);
    const replacement = tree.child(parent, "Panel", entries[0].id);
    assert.ok(replacement && replacement !== markers[0], "the cleared owner remains reusable");
    tree.dispose(); env.clock.advance(20); assert.equal(replacement.IsValid(), false);
    assert.deepEqual(env.clock.errors, []);
});
