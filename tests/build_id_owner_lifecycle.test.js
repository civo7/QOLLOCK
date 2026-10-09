"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global; Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_SHOW_BUILD_ID: 1, ENABLE_SHOW_BUILD_ID_TITLE: 1 });
    const cfg = Q.core.ConfigStore.view("ql_show_build_id"); let reads = 0;
    const create = () => Q.core.FeatureRegistry.getManifest("ql_show_build_id").create({ id: "ql_show_build_id", config: { view() { reads++; return cfg; } } });
    const add = (parent, id, type = "Panel", className = "") => {
        const panel = $.CreatePanel(type, parent, id); if (className) panel.AddClass(className); return panel;
    };
    function mount(root = env.doc.root, raw = "123 - Example - 1") {
        const core = add(root, "", "Panel", "HudCore"), stats = add(core, "StatsAndModsContainer"), lower = add(stats, "LowerLeft");
        const shop = add(root, "SelectedBuildInfo"), source = add(shop, "SelectedBuildInfoTitle", "Label"); source.text = raw;
        const outer = root.FindChildTraverse("SelectedBuildOuter") || add(root, "SelectedBuildOuter");
        const name = add(outer, "", "Label", "SelectedBuildName"); name.text = "Native Name";
        return { core, stats, lower, shop, source, outer, name };
    }
    const overlay = () => env.doc.root.FindChildTraverse("selected_build_info"), label = () => overlay()?.FindChild("build_info");
    return { ...env, Q, $, cfg, create, feature: create(), add, mount, overlay, label, reads: () => reads };
}
function stop(e, feature = e.feature) { feature.onDisable(); e.clock.advance(20); assert.equal(e.overlay(), null); assert.deepEqual(e.clock.errors, []); }

test("build ID keeps parsing, native title fallback and reactive title settings without rereading idle config", () => {
    const e = setup(), source = e.mount(); e.feature.onEnable();
    for (const [raw, expected] of [["98,765 - Competitive Ivy - 1", "Public Build: 98765 - Competitive Ivy"],
        ["123 - Unknown - 1", "Public Build: 123 - Native Name"], ["custom - Named - 0", "Private Build: custom - Named"],
        ["456", "Public Build: 456 - Native Name"], ["12 - Multi - part - 1", "Public Build: 12 - Multi - part"]]) {
        source.source.text = raw; e.clock.advance(1100); assert.equal(e.label().text, expected);
    }
    assert.equal(e.reads(), 1);
    e.cfg.ENABLE_SHOW_BUILD_ID_TITLE = false; e.feature.onSettingsChanged(); assert.equal(e.label().text, "Public Build: 12");
    assert.equal(e.reads(), 2); source.source.text = "0 - Nothing - 0"; e.clock.advance(1100);
    assert.equal(e.overlay().style.visibility, "collapse");
    source.source.text = "987 - Restored - 2"; e.clock.advance(1100); assert.equal(e.label().text, "Public Build: 987");
    assert.equal(e.overlay().style.visibility, "visible"); stop(e);
});

test("build ID waits for late native parents and rebinds living shop/LowerLeft generations", () => {
    const e = setup(); e.feature.onEnable(); assert.equal(e.overlay(), null);
    const native = e.mount(); e.clock.advance(4200); assert.equal(e.label().text, "Public Build: 123 - Example");
    const previous = e.overlay(), moved = e.label(), retired = e.add(null, "RetiredBuildSources");
    moved.SetParent(retired); native.lower.SetParent(retired); native.source.SetParent(retired);
    const lower = e.add(native.stats, "LowerLeft"), source = e.add(native.shop, "SelectedBuildInfoTitle", "Label"); source.text = "456 - Current - 1";
    e.clock.advance(1100); assert.equal(previous.IsValid(), false); assert.equal(moved.IsValid(), false);
    assert.equal(lower.FindChild("selected_build_info"), e.overlay()); assert.equal(e.label().text, "Public Build: 456 - Current");
    assert.equal(native.lower.IsValid(), true); assert.equal(native.source.text, "123 - Example - 1"); stop(e);
});

test("build ID follows fallback-name replacement and keeps native binding text unchanged", () => {
    const e = setup(), native = e.mount(undefined, "123 - Unknown - 1"); e.feature.onEnable();
    assert.equal(e.label().text, "Public Build: 123 - Native Name");
    native.name.SetParent(e.add(null, "RetiredBuildName"));
    const name = e.add(native.outer, "", "Label", "SelectedBuildName"); name.text = "Current Name";
    e.clock.advance(1100); assert.equal(e.label().text, "Public Build: 123 - Current Name");
    name.text = "#unresolved_native_token"; e.clock.advance(1100); assert.equal(e.label().text, "Public Build: 123");
    assert.equal(native.source.text, "123 - Unknown - 1"); assert.equal(native.name.text, "Native Name"); stop(e);
});

test("build ID retries partial construction, styles and text without committing failed signatures", () => {
    const e = setup(), native = e.mount(), create = e.$.CreatePanel; let rejectCreation = true, rejectStyle = true, styleWrites = 0;
    e.$.CreatePanel = (...args) => {
        if (args[2] === "build_info" && rejectCreation) throw Error("modeled late label");
        const panel = create(...args);
        if (panel.id === "build_info") panel.style = new Proxy(panel.style, { set(target, key, value) {
            styleWrites++; if (key === "fontSize" && rejectStyle) throw Error("modeled style rejection"); target[key] = value; return true;
        } });
        return panel;
    };
    e.feature.onEnable(); assert.equal(e.label(), null); assert.equal(e.overlay().style.visibility, "collapse");
    rejectCreation = false; e.clock.advance(1100); assert.equal(e.label().text, "Public Build: 123 - Example"); assert.equal(e.label().style.fontSize, undefined);
    rejectStyle = false; e.clock.advance(1100); assert.equal(e.label().style.fontSize, "16px");
    const stableWrites = styleWrites; e.clock.advance(2200); assert.equal(styleWrites, stableWrites);
    let text = e.label().text, rejectText = true;
    Object.defineProperty(e.label(), "text", { configurable: true, get: () => text, set(value) { if (rejectText) throw Error("modeled text rejection"); text = value; } });
    native.source.text = "456 - Changed - 1"; e.clock.advance(1100); assert.equal(text, "Public Build: 123 - Example");
    rejectText = false; e.clock.advance(1100); assert.equal(text, "Public Build: 456 - Changed");
    stop(e);
});

test("build ID guards stopped hooks and waits for queued previous trees on immediate re-enable", () => {
    const e = setup(); e.mount(); e.feature.onSettingsChanged(); assert.equal(e.overlay(), null);
    e.feature.onEnable(); const previous = e.overlay(), moved = e.label(); moved.SetParent(e.add(null, "RetiredBuildLabel"));
    e.feature.onDisable(); const next = e.create(); next.onEnable(); next.onSettingsChanged(); assert.equal(previous.visible, false);
    e.clock.advance(1100); assert.equal(previous.IsValid(), false); assert.equal(moved.IsValid(), false);
    assert.notEqual(e.overlay(), previous); assert.equal(e.label().text, "Public Build: 123 - Example");
    stop(e, next); next.onSettingsChanged(); e.clock.advance(3300); assert.equal(e.overlay(), null);
    assert.equal(e.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_show_build_id"), false);
});

test("build ID releases living old HUDs and loading scopes before reading current native bindings", () => {
    const e = setup(); const native = e.mount(); e.feature.onEnable(); const previous = e.overlay();
    e.doc.root = e.add(null, "LoadingRoot"); e.mount(); e.clock.advance(1100);
    assert.equal(previous.IsValid(), false); assert.equal(e.overlay(), null); assert.equal(native.lower.IsValid(), true);
    e.doc.root = e.add(null, "Hud", "CitadelHud"); e.mount(undefined, "987 - Current HUD - 2"); e.clock.advance(1100);
    assert.equal(e.label().text, "Public Build: 987 - Current HUD"); stop(e);
});

test("build ID registry releases partial enable UI and permits a fresh owner", () => {
    const e = setup(); e.mount(); const create = e.$.CreatePanel; let reject = true;
    e.$.CreatePanel = (...args) => {
        const panel = create(...args);
        if (panel.id === "build_info" && reject) Object.defineProperty(panel, "text", { get: () => "", set() { throw Error("modeled enable rejection"); } });
        return panel;
    };
    const registry = e.Q.core.FeatureRegistry;
    registry.enable("ql_show_build_id"); e.clock.advance(20); assert.equal(registry.isEnabled("ql_show_build_id"), false); assert.equal(e.overlay(), null);
    reject = false; registry.enable("ql_show_build_id"); assert.equal(e.label().text, "Public Build: 123 - Example");
    registry.disable("ql_show_build_id"); e.clock.advance(20); assert.equal(e.overlay(), null); assert.deepEqual(e.clock.errors, []);
});
