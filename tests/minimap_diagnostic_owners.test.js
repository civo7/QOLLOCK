"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const { QOL: Q, $ } = hud.sandbox.global;
    let parent = hud.root;
    for (const props of [{ classes: ["HudCore"] }, { id: "gameplay_hud" }, { classes: ["clamp_width"] },
        { id: "minimap_persp" }, { id: "minimap_container" }, { id: "HudMinimapContainer" },
        { id: "hud_minimap", classes: ["HudMinimap", "dl_midtown"] }]) parent = parent.addChild(hud.doc.create("Panel", props));
    const renderer = parent;
    const background = $.CreatePanel("Panel", renderer, "MinimapBackgroundTest");
    const canvas = $.CreatePanel("Panel", background, "canvas");
    Q.core.ConfigAdapter.loadFromFlat({ ENABLE_MINIMAP_CRATE_OVERLAY: 1, ENABLE_MINIMAP_TOUGH_CRATES: 1,
        ENABLE_MINIMAP_HEALING_SNACKS: 1, ENABLE_MINIMAP_STATUES: 1, ENABLE_MINIMAP_CRATE_ROUTES: 1,
        MINIMAP_CAMP_NAMES: 1, ENABLE_MINIMAP_REM_TUNNELS: 1, MINIMAP_SMALL_SIZE: 600,
        MINIMAP_FIXED_ICON_SIZE: 1, MINIMAL_MINIMAP: 1 });
    hud.clock.advance(1200);
    const instance = id => Q.core.FeatureRegistry.getInstance(id);
    return { hud, Q, renderer, canvas, instance };
}

for (const id of ["ql_minimap_runtime", "ql_minimap_loot"]) {
    test(`${id} diagnostic lease retains content, selectively hides and rejects retired writers`, () => {
        const { hud, Q, renderer, instance } = setup();
        const owner = instance(id);
        assert.equal(typeof owner.diagnostics?.begin, "function");
        const lease = owner.diagnostics.begin();
        const before = lease.snapshot();
        assert.ok(before.root.present);
        lease.apply({ hideRoot: true, skipSweep: true });
        hud.clock.advance(600);
        const hidden = lease.snapshot();
        assert.equal(hidden.root.identity, before.root.identity);
        assert.equal(hidden.root.visible, false);
        assert.equal(hidden.counts.total, before.counts.total);
        assert.equal(hidden.controls.skipSweep, true);
        assert.ok(hidden.stages.skippedSweeps > 0);
        lease.restore();
        hud.clock.advance(600);
        assert.equal(renderer.FindChild(id === "ql_minimap_runtime" ? "minimap_overlay_root" : "QOLMinimapLootRoot").visible, true);
        assert.throws(() => lease.apply({ hideRoot: true }), /retired/);
        const old = owner.diagnostics.begin();
        const current = owner.diagnostics.begin();
        current.apply({ hideRoot: true }); old.restore();
        assert.equal(current.snapshot().root.visible, false, "stale restoration cannot unhide the successor's tree");
        Q.core.FeatureRegistry.disable(id);
        assert.throws(() => current.apply({ hideRoot: false }), /retired/);
        current.restore(); hud.clock.advance(300);
        assert.deepEqual(hud.clock.errors, []);
    });

    test(`${id} composition variants recreate complete owned trees and restore the production policy`, () => {
        const { hud, instance } = setup();
        const owner = instance(id);
        assert.equal(typeof owner.diagnostics?.begin, "function");
        const lease = owner.diagnostics.begin();
        const original = lease.snapshot();
        const create = hud.sandbox.global.$.CreatePanel;
        const creations = [];
        hud.sandbox.global.$.CreatePanel = (...args) => { creations.push(args); return create(...args); };
        for (const policy of ["layer", "none", "cache"]) {
            lease.apply({ composition: policy }); hud.clock.advance(600);
            const state = lease.snapshot();
            assert.equal(state.composition, policy);
            assert.ok(state.root.present);
            assert.equal(state.counts.total, original.counts.total);
            assert.notEqual(state.root.identity, original.root.identity);
            const rootId = id === "ql_minimap_runtime" ? "minimap_overlay_root" : "QOLMinimapLootRoot";
            const properties = creations.filter(args => args[2] === rootId).at(-1)[3];
            assert.equal(properties["require-composition-layer"], policy === "none" ? undefined : "true");
            assert.equal(properties["always-cache-composition-layer"], policy === "cache" ? "true" : undefined);
        }
        lease.apply({ composition: "none" }); hud.clock.advance(600);
        lease.restore(); hud.clock.advance(600);
        const next = owner.diagnostics.begin();
        assert.equal(next.snapshot().composition, "cache"); next.restore();
        assert.deepEqual(hud.clock.errors, []);
    });
}

test("loot diagnostic gates hide one populated group without hiding siblings or deleting labels", () => {
    const { hud, instance } = setup();
    const owner = instance("ql_minimap_loot");
    assert.equal(typeof owner.diagnostics?.begin, "function");
    const lease = owner.diagnostics.begin();
    const before = lease.snapshot();
    lease.apply({ hideGroups: ["runs"] }); hud.clock.advance(600);
    const state = lease.snapshot();
    assert.equal(state.groups.runs.visible, false);
    assert.equal(state.groups.runs.identity, before.groups.runs.identity);
    assert.ok(state.groups.runs.children > 0);
    assert.equal(state.groups.snacks.visible, true);
    assert.equal(state.groups.names.visible, true);
    assert.equal(state.counts.total, before.counts.total);
    lease.restore();
    assert.equal(owner.diagnostics.begin().snapshot().groups.runs.visible, true);
});

test("runtime diagnostics release geometry and decoration while retaining crates, tunnel and native content", () => {
    const { hud, renderer, canvas, instance } = setup();
    const owner = instance("ql_minimap_runtime");
    assert.equal(typeof owner.diagnostics?.begin, "function");
    const lease = owner.diagnostics.begin();
    const before = lease.snapshot();
    assert.equal(canvas.IsValid(), true);
    lease.apply({ releaseGeometry: true, releaseDecoration: true, hideTunnel: true }); hud.clock.advance(600);
    const state = lease.snapshot();
    assert.equal(state.root.identity, before.root.identity);
    assert.equal(state.tunnel.identity, before.tunnel.identity);
    assert.equal(state.tunnel.visible, false);
    assert.equal(renderer.BHasClass("QOLFixedMinimapIcons"), false);
    assert.equal(state.controls.releaseDecoration, true);
    assert.equal(canvas.IsValid(), true);
    lease.restore(); hud.clock.advance(600);
    assert.equal(renderer.BHasClass("QOLFixedMinimapIcons"), true);
    assert.deepEqual(hud.clock.errors, []);
});

test("fine native/geometry controls release only their declared targets and restore them", () => {
    const { hud, renderer, canvas, instance } = setup();
    const lease = instance("ql_minimap_runtime").diagnostics.begin();
    const before = lease.snapshot(), host = renderer.GetParent().GetParent().GetParent();
    lease.apply({ releaseNativeTargets: ["renderer"] });
    assert.equal(renderer.BHasClass("minimalist_minimap_active"), false);
    assert.equal(renderer.BHasClass("QOLFixedMinimapIcons"), true);
    assert.equal(canvas.IsValid(), true);
    assert.equal(lease.snapshot().root.identity, before.root.identity);
    lease.apply({ releasePlacement: true });
    assert.equal(host.style.margin || "", "");
    assert.equal(host.FindChild("minimap_container").style.opacity, undefined);
    assert.equal(host.style.uiScale, "100%");
    lease.apply({ releaseViewport: true });
    assert.equal(renderer.BHasClass("QOLFixedMinimapIcons"), false);
    assert.notEqual(host.style.margin, "");
    lease.apply({ releaseGeometryRoles: ["renderer"] });
    assert.equal(renderer.BHasClass("QOLFixedMinimapIcons"), false);
    assert.equal(lease.snapshot().geometry.targets.viewport.present, true);
    lease.restore();
    assert.equal(renderer.BHasClass("QOLFixedMinimapIcons"), true);
    assert.equal(renderer.BHasClass("minimalist_minimap_active"), true);
    assert.equal(host.style.opacity, "1");
    assert.notEqual(host.FindChild("minimap_container").style.opacity, undefined);
    assert.deepEqual(hud.clock.errors, []);
});
