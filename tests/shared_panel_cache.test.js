"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
function setup() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { $, QOL: Q } = env.sandbox.global; Q.core.App.shutdown();
    return { ...env, $, Q, add: (parent, id, type = "Panel") => $.CreatePanel(type, parent, id) };
}

test("typed and compatibility cache names share one validated storage without a State mirror", () => {
    const env = setup(), { Q } = env;
    const first = env.add(env.root, "First"), second = env.add(env.root, "Second");
    Q.setCachedPanel("shared", first); assert.equal(Q.panelCache.getPanel("shared"), first);
    Q.panelCache.setPanel("shared", second); assert.equal(Q.getCachedPanel("shared"), second);
    Q.panelCache.setList("shared", [first, second]); assert.equal(Q.getList("shared").length, 2);
    Q.panelCache.setData("shared", "diagnostic"); Q.setCachedPanel("shared", null);
    assert.equal(Q.getCachedPanel("shared"), null); assert.equal(Q.getList("shared"), null); assert.equal(Q.getData("shared"), undefined);
    assert.equal(Q.resolveCachedPanel, Q.panelCache.resolve); assert.equal(Object.hasOwn(Q.state, "cachedPanels"), false);
    assert.equal(Object.hasOwn(Q.state, "_panelCache"), false);
    Q.setPanel("retired", first); first.DeleteAsync(0); env.clock.advance(1); assert.equal(Q.getCachedPanel("retired"), null);
    Q.setData("__proto__", "safe"); Q.setData("hasOwnProperty", 5); assert.equal(Q.getData("__proto__"), "safe");
    assert.equal(Q.getData("hasOwnProperty"), 5); Q.clearPanelCache(); assert.equal(Q.getData("__proto__"), undefined);
});

test("public cache resolution follows living source moves and changed lookup roots", () => {
    const env = setup(), { Q } = env;
    const one = env.add(null, "One"), two = env.add(null, "Two");
    const first = env.add(one, "Target"), second = env.add(two, "Target");
    assert.equal(Q.resolveCachedPanel(one, "source", "Target"), first);
    assert.equal(Q.resolveCachedPanel(two, "source", "Target"), second);
    second.SetParent(env.add(null, "RetiredSource")); const replacement = env.add(two, "Target");
    assert.equal(Q.resolveCachedPanel(two, "source", "Target"), replacement); assert.equal(second.IsValid(), true);
    assert.equal(Q.resolveCachedPanel(null, "source", "Target"), null); assert.equal(Q.getCachedPanel("source"), null);
});

test("core lookup misses are private and do not delay a changed root or ID", () => {
    const env = setup(), { Q } = env, resolve = Q.core.hud.resolveCachedPanel;
    const one = env.add(null, "One"), two = env.add(null, "Two"), source = env.add(two, "Target");
    assert.equal(resolve(one, "probe", "Target"), null); assert.equal(resolve(two, "probe", "Target"), source);
    const other = env.add(one, "Other"); assert.equal(resolve(one, "probe", "Other"), other);
    other.SetParent(env.add(null, "RetiredSource")); const replacement = env.add(one, "Other");
    assert.equal(resolve(one, "probe", "Other"), replacement); assert.equal(Q.getCachedPanel("probe"), replacement);
    assert.equal(Object.hasOwn(Q.state, "_panelMissBackoff"), false); assert.deepEqual(env.clock.errors, []);
});

test("panel configuration reads equal revisions from the selected root generation", () => {
    const env = setup(), { Q } = env, persistence = Q.core.persistence;
    const first = env.root, second = env.add(null, "Hud", "CitadelHud");
    for (const [root, text] of [[first, "first config"], [second, "second config"]]) {
        root.SetAttributeString("Deadlock_Mod_Settings_v1", text); root.SetAttributeString("QOL_USER_EDIT_REV", "5");
    }
    assert.equal(persistence.readStorageConfigRawFromUi(first), "first config");
    assert.equal(persistence.readStorageConfigRawFromUi(second), "second config");
    assert.equal(persistence.readStorageConfigRawFromUi(first), "first config");
    second.SetAttributeString("QOL_CONFIG_EDIT_REV", "7"); persistence.markConfigEdited(second);
    assert.equal(second.GetAttributeString("QOL_CONFIG_EDIT_REV", ""), "8"); assert.equal(first.GetAttributeString("QOL_CONFIG_EDIT_REV", ""), "");
    assert.deepEqual(env.clock.errors, []);
});

test("persistence follows a still-live replaced Hud and a changed absolute context root", () => {
    const env = setup(), persistence = env.Q.core.persistence;
    const outer = env.add(null, "WindowRoot"); env.root.SetParent(outer);
    env.$.GetContextPanel = () => env.root;
    env.root.SetAttributeString("Deadlock_Mod_Settings_v1", "old HUD"); env.root.SetAttributeString("QOL_USER_EDIT_REV", "3");
    assert.equal(persistence.getUIRoot(), outer); assert.equal(persistence.readStorageConfigRawFromUi(outer), "old HUD");
    env.root.SetParent(env.add(null, "RetiredHud")); const next = env.add(outer, "Hud", "CitadelHud");
    next.SetAttributeString("Deadlock_Mod_Settings_v1", "new HUD"); next.SetAttributeString("QOL_USER_EDIT_REV", "3");
    assert.equal(persistence.resolveHudPanel(outer), next); assert.equal(persistence.readStorageConfigRawFromUi(outer), "new HUD");
    const other = env.add(null, "OtherWindow"); next.SetParent(other); env.$.GetContextPanel = () => next;
    assert.equal(persistence.getUIRoot(), other); assert.equal(persistence.resolveHudPanel(other), next);
    assert.equal(env.root.IsValid(), true); assert.deepEqual(env.clock.errors, []);
});

test("rejected native config writes never enter the read cache as accepted data", () => {
    const env = setup(), persistence = env.Q.core.persistence;
    env.root.SetAttributeString("Deadlock_Mod_Settings_v1", "accepted config");
    assert.equal(persistence.readStorageConfigRawFromUi(env.root), "accepted config");
    const set = env.root.SetAttributeString.bind(env.root);
    env.root.SetAttributeString = (key, value) => { if (key === "Deadlock_Mod_Settings_v1") throw Error("modeled native rejection"); set(key, value); };
    persistence.writeStorageConfigRawToUi(env.root, "attempted config");
    assert.equal(persistence.readStorageConfigRawFromUi(env.root), "accepted config");
    assert.equal(env.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), "accepted config"); assert.deepEqual(env.clock.errors, []);
});
