"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function fixture(config = {}) {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    env.sandbox.eval("Math.random = () => 0;");
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_RELOAD_COOLDOWN: 1, ...config });
    const id = "ql_reload_cooldown";
    const create = () => Q.core.FeatureRegistry.getManifest(id).create({ id, config: { view: () => Q.core.ConfigStore.view(id) } });
    const addSource = () => {
        const reticle = $.CreatePanel("Panel", env.root, "reticle_status");
        const bar = $.CreatePanel("Panel", reticle, "attack_delayed_progress_bar");
        bar.AddClass("has_active_reload");
        return { reticle, bar };
    };
    const clip = (bar, angle) => { bar.style.clip = `radial(50% 50%, ${angle}deg, 0deg)`; };
    const label = reticle => reticle.FindChild("QOLReloadCooldownText");
    const sample = (bar, angle) => { clip(bar, angle); env.clock.advance(50); };
    const retired = $.CreatePanel("Panel", null, "RetiredReloadGeneration");
    return { ...env, Q, $, create, addSource, clip, label, sample, retired };
}

test("reload estimate follows both radial directions and retains native clip/classes", () => {
    for (const increasing of [false, true]) {
        const env = fixture();
        const { reticle, bar } = env.addSource();
        env.clip(bar, increasing ? 120 : 240);
        const feature = env.create();
        feature.onEnable(); env.clock.advance(0);
        assert.equal(env.label(reticle).text, "", "one angle cannot establish a speed");
        env.sample(bar, increasing ? 130 : 230);
        const label = env.label(reticle);
        assert.equal(label.text, "2");
        assert.equal(label.style.visibility, "visible");
        env.sample(bar, increasing ? 150 : 210);
        assert.ok(Number(label.text) <= 2, "smoothed estimate does not grow during the reload");
        env.sample(bar, increasing ? 250 : 110);
        assert.match(label.text, /^0\.\d$/);
        assert.equal(bar.BHasClass("has_active_reload"), true);
        const nativeClip = bar.style.clip;
        feature.onDisable(); env.clock.advance(0);
        assert.equal(env.label(reticle), null);
        assert.equal(bar.style.clip, nativeClip);
        assert.equal(bar.BHasClass("has_active_reload"), true);
        assert.deepEqual(env.clock.errors, []);
    }
});

test("reload rebinds a still-live reticle and resets the previous estimate", () => {
    const env = fixture({ RELOAD_COOLDOWN_X_OFFSET: 23, RELOAD_COOLDOWN_Y_OFFSET: 17, RELOAD_COOLDOWN_SIZE: 35 });
    const first = env.addSource();
    env.clip(first.bar, 240);
    const feature = env.create(); feature.onEnable(); env.clock.advance(0);
    env.sample(first.bar, 230);
    const oldLabel = env.label(first.reticle);
    first.reticle.SetParent(env.retired);
    const next = env.addSource(); env.clip(next.bar, 100);
    env.clock.advance(50);
    const nextLabel = env.label(next.reticle);
    assert.equal(first.reticle.IsValid(), true);
    assert.equal(oldLabel.IsValid(), false);
    assert.equal(nextLabel.text, "", "new source must establish its own velocity");
    assert.equal(nextLabel.style.marginLeft, "23px");
    assert.equal(nextLabel.style.marginTop, "-17px");
    assert.equal(nextLabel.style.fontSize, "35px");
    env.sample(next.bar, 90);
    assert.equal(nextLabel.text, "0.5");
    feature.onDisable(); env.clock.advance(0);
    assert.deepEqual(env.clock.errors, []);
});

test("reload resets on a living progress replacement inside an unchanged reticle", () => {
    const env = fixture();
    const { reticle, bar } = env.addSource(); env.clip(bar, 240);
    const feature = env.create(); feature.onEnable(); env.clock.advance(0);
    env.sample(bar, 230);
    assert.equal(env.label(reticle).text, "2");
    bar.SetParent(env.retired);
    const next = env.$.CreatePanel("Panel", reticle, "attack_delayed_progress_bar");
    next.AddClass("reloading"); env.clip(next, 200);
    env.clock.advance(50);
    assert.equal(env.label(reticle).text, "");
    env.sample(next, 190);
    assert.equal(Number(env.label(reticle).text), 1);
    feature.onDisable(); env.clock.advance(0);
    assert.equal(bar.IsValid(), true);
});

test("reload recreates a replaced label and retries rejected layout writes", () => {
    const env = fixture();
    const { reticle, bar } = env.addSource(); env.clip(bar, 240);
    const feature = env.create(); feature.onEnable(); env.clock.advance(0);
    env.sample(bar, 230);
    const oldLabel = env.label(reticle); oldLabel.SetParent(env.retired);
    env.sample(bar, 220);
    const label = env.label(reticle);
    assert.notEqual(label, oldLabel);
    assert.equal(oldLabel.IsValid(), false);
    assert.equal(label.style.opacity, "0.6");
    assert.equal(label.hittest, false);
    let writes = 0;
    Object.defineProperty(label.style, "opacity", { configurable: true, get: () => "0.6", set: () => { writes++; throw new Error("transient native style rejection"); } });
    env.Q.core.ConfigStore.set("ql_reload_cooldown", "RELOAD_COOLDOWN_OPACITY", 0.35);
    feature.onSettingsChanged();
    assert.equal(writes, 1);
    env.clock.advance(50);
    assert.equal(writes, 2, "a partial signature remains pending");
    Object.defineProperty(label.style, "opacity", { configurable: true, writable: true, value: "0.6" });
    env.clock.advance(50);
    assert.equal(label.style.opacity, "0.35");
    feature.onDisable(); env.clock.advance(0);
});

test("reload handles late sources and an unreadable clip without carrying a stale estimate", () => {
    const env = fixture();
    const feature = env.create(); feature.onEnable(); env.clock.advance(1000);
    const { reticle, bar } = env.addSource(); env.clip(bar, 240);
    env.clock.advance(600);
    env.sample(bar, 230);
    assert.ok(env.label(reticle).text);
    bar.style.clip = "";
    env.clock.advance(50);
    assert.equal(env.label(reticle).text, "");
    assert.equal(env.label(reticle).style.visibility, "collapse");
    env.clip(bar, 40);
    env.clock.advance(500);
    assert.equal(env.label(reticle).text, "", "recovery begins with a fresh sample");
    env.sample(bar, 30);
    assert.equal(env.label(reticle).text, "0.2");
    feature.onDisable(); env.clock.advance(0);
    assert.deepEqual(env.clock.errors, []);
});

test("reload retries partial label creation and reads the native style attribute fallback", () => {
    const env = fixture();
    const { reticle, bar } = env.addSource();
    bar.SetAttributeString("style", "opacity: 1; clip: radial( 50% 50%, 240deg, 90deg );");
    const createPanel = env.$.CreatePanel;
    env.$.CreatePanel = (type, parent, id, props) => {
        if (id === "QOLReloadCooldownText") throw new Error("reticle not ready");
        return createPanel(type, parent, id, props);
    };
    const feature = env.create(); feature.onEnable(); env.clock.advance(0);
    assert.equal(env.label(reticle), null);
    env.$.CreatePanel = createPanel;
    env.clock.advance(500);
    assert.ok(env.label(reticle));
    bar.SetAttributeString("style", "clip: radial(50% 50%, 230deg, 90deg);");
    env.clock.advance(50);
    assert.equal(env.label(reticle).text, "2");
    feature.onDisable(); env.clock.advance(0);
    assert.deepEqual(env.clock.errors, []);
});

test("reload disable and rapid re-enable retire old labels and all scheduled updates", () => {
    const env = fixture();
    const createPanel = env.$.CreatePanel; let creations = 0;
    env.$.CreatePanel = (...args) => { if (args[2] === "QOLReloadCooldownText") creations++; return createPanel(...args); };
    const { reticle, bar } = env.addSource(); env.clip(bar, 240);
    const first = env.create(); first.onEnable(); env.clock.advance(0);
    const oldLabel = env.label(reticle);
    first.onDisable();
    const second = env.create(); second.onEnable(); second.onSettingsChanged();
    assert.equal(creations, 1, "no new label is created while the old ID awaits deletion"); assert.equal(oldLabel.visible, false);
    env.clock.advance(0);
    assert.equal(oldLabel.IsValid(), false);
    const current = env.label(reticle);
    assert.ok(current?.IsValid());
    env.sample(bar, 230);
    assert.ok(current.text);
    second.onDisable(); env.clock.advance(2000);
    assert.equal(env.label(reticle), null);
    assert.deepEqual(env.clock.errors, []);
});

test("reload stopped hooks cannot create labels and cleanup survives a rejected owned-text setter", () => {
    const env = fixture(), { reticle, bar } = env.addSource(); env.clip(bar, 240);
    const feature = env.create(); feature.onSettingsChanged(); assert.equal(env.label(reticle), null);
    feature.onEnable(); env.clock.advance(0); env.sample(bar, 230);
    const label = env.label(reticle); label.SetParent(env.retired);
    Object.defineProperty(label, "text", { configurable: true, get() { return "2"; }, set() { throw Error("retired text rejects writes"); } });
    assert.doesNotThrow(() => feature.onDisable()); feature.onSettingsChanged(); env.clock.advance(1000);
    assert.equal(label.IsValid(), false); assert.equal(env.label(reticle), null);
    assert.equal(bar.BHasClass("has_active_reload"), true); assert.deepEqual(env.clock.errors, []);
});

test("reload releases a living HUD and loading scope before starting an independent estimate", () => {
    const env = fixture(), first = env.addSource(); env.clip(first.bar, 240);
    const feature = env.create(); feature.onEnable(); env.clock.advance(0); env.sample(first.bar, 230);
    const previous = env.label(first.reticle); assert.equal(previous.text, "2");
    env.doc.root = env.$.CreatePanel("Panel", null, "LoadingRoot");
    const fake = env.$.CreatePanel("Panel", env.doc.root, "reticle_status"), fakeProgress = env.$.CreatePanel("Panel", fake, "attack_delayed_progress_bar");
    fakeProgress.AddClass("reloading"); env.clip(fakeProgress, 120); env.clock.advance(50);
    assert.equal(previous.IsValid(), false); assert.equal(env.label(fake), null); assert.equal(first.bar.IsValid(), true);
    env.doc.root = env.$.CreatePanel("CitadelHud", null, "Hud");
    const reticle = env.$.CreatePanel("Panel", env.doc.root, "reticle_status"), bar = env.$.CreatePanel("Panel", reticle, "attack_delayed_progress_bar");
    bar.AddClass("reloading"); env.clip(bar, 100); feature.onSettingsChanged();
    assert.equal(env.label(reticle).text, ""); env.clock.advance(500);
    assert.equal(env.label(reticle).text, ""); env.sample(bar, 90); assert.equal(env.label(reticle).text, "0.5");
    feature.onDisable(); env.clock.advance(0); assert.equal(env.label(reticle), null); assert.deepEqual(env.clock.errors, []);
});
