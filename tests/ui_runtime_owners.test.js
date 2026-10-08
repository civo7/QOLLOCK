"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup(id, config = {}) {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ...config });
    const feature = Q.core.FeatureRegistry.getManifest(id).create({
        id, config: { view: () => Q.core.ConfigStore.view(id) }
    });
    return { ...env, Q, $, feature };
}

test("party lane selection rebinds a living dropdown before its old selected retry expires", () => {
    const env = setup("ql_lane_with_party", { ENABLE_LANE_WITH_PARTY: 1 });
    const makeSelector = () => {
        const selector = env.$.CreatePanel("DropDown", env.root, "LanePreferenceSelector");
        const option = env.$.CreatePanel("Label", selector, "lanepreference_1");
        selector.AddOption(option);
        return { selector, option };
    };
    const original = makeSelector();
    env.feature.onEnable();
    env.clock.advance(600);
    assert.equal(original.selector.GetSelected(), original.option);

    const detached = env.$.CreatePanel("Panel", null, "RetiredLaneUI");
    original.selector.SetParent(detached);
    const replacement = makeSelector();
    env.clock.advance(600);
    assert.equal(original.selector.IsValid(), true, "the old panel is still a living handle");
    assert.equal(replacement.selector.GetSelected(), replacement.option, "replacement cannot inherit the old retry deadline");

    env.feature.onDisable();
    replacement.selector.SetSelected("missing");
    env.clock.advance(6000);
    assert.equal(replacement.selector.GetSelected(), null, "disable retires all selection callbacks");
    assert.deepEqual(env.clock.errors, []);
});

test("party lane selection discovers late native options and accepts settings changes immediately", () => {
    const env = setup("ql_lane_with_party", { ENABLE_LANE_WITH_PARTY: 1 });
    const selector = env.$.CreatePanel("DropDown", env.root, "LanePreferenceSelector");
    env.feature.onEnable();
    env.clock.advance(600);
    assert.equal(selector.GetSelected(), null);
    const option = env.$.CreatePanel("Label", selector, "lanepreference_1");
    selector.AddOption(option);
    env.clock.advance(3000);
    assert.equal(selector.GetSelected(), option);

    env.Q.core.ConfigStore.set("ql_lane_with_party", "ENABLE_LANE_WITH_PARTY", false);
    env.feature.onSettingsChanged();
    selector.SetSelected("missing");
    env.clock.advance(6000);
    assert.equal(selector.GetSelected(), null);
    env.Q.core.ConfigStore.set("ql_lane_with_party", "ENABLE_LANE_WITH_PARTY", true);
    env.feature.onSettingsChanged();
    assert.equal(selector.GetSelected(), option);
    env.feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("custom cursor binds a living replacement at unchanged pointer coordinates", () => {
    const env = setup("ql_mouse_cursor");
    env.sandbox.global.GameUI.GetCursorPosition = () => ({ x: 200, y: 300 });
    env.root.AddClass("gShopOpen");
    env.feature.onEnable();
    env.clock.advance(100);
    const original = env.root.FindChild("QOLGameplayMouseCursor");
    assert.equal(original.style.x, "173px");
    original.SetParent(env.$.CreatePanel("Panel", null, "RetiredCursorUI"));
    const replacement = env.$.CreatePanel("Panel", env.root, "QOLGameplayMouseCursor");
    env.feature.onSettingsChanged();
    assert.equal(replacement.style.x, "173px");
    assert.equal(replacement.style.y, "273px");
    assert.equal(replacement.hittest, false);
    assert.equal(replacement.hittestchildren, false);
    assert.ok(replacement.FindChild("QOLGameplayMouseCursorImage"));
    env.feature.onDisable();
    env.clock.advance(100);
    assert.equal(env.root.BHasClass("qol_custom_cursor_replace_active"), false);
    assert.equal(original.IsValid(), false, "release removes retired owned cursor panels");
    assert.equal(replacement.IsValid(), false);
    assert.deepEqual(env.clock.errors, []);
});

test("cursor failures restore native pointer presentation until image and coordinates recover", () => {
    const env = setup("ql_mouse_cursor");
    env.root.AddClass("gShopOpen");
    env.sandbox.global.GameUI.GetCursorPosition = () => ({ x: 200, y: 300 });
    const overlay = env.$.CreatePanel("Panel", env.root, "QOLGameplayMouseCursor");
    const image = env.$.CreatePanel("Image", overlay, "QOLGameplayMouseCursorImage");
    image.SetImage = () => { throw new Error("asset unavailable"); };
    assert.throws(() => env.feature.onSettingsChanged(), /asset unavailable/);
    assert.equal(env.root.BHasClass("qol_custom_cursor_replace_active"), false);
    assert.equal(overlay.BHasClass("qol-hidden"), true);

    image.SetImage = () => {};
    env.feature.onSettingsChanged();
    assert.equal(env.root.BHasClass("qol_custom_cursor_replace_active"), true);
    env.sandbox.global.GameUI.GetCursorPosition = () => { throw new Error("pointer unavailable"); };
    assert.throws(() => env.feature.onSettingsChanged(), /pointer unavailable/);
    assert.equal(env.root.BHasClass("qol_custom_cursor_replace_active"), false);

    env.sandbox.global.GameUI.GetCursorPosition = () => ({ x: 0, y: 0 });
    env.feature.onSettingsChanged();
    assert.equal(env.root.BHasClass("qol_custom_cursor_replace_active"), true);
    assert.equal(overlay.style.x, "-27px");
    env.feature.onDisable();
});

test("UI metadata lifecycle preserves classes projected from the accepted whole HUD config", () => {
    const env = setup("ql_ui_controls", { SUPPORT_4_3: 1, ENABLE_CENTER_ESC: 1, ENABLE_HIDE_AMMO_ALL: 1 });
    env.feature.onEnable();
    env.feature.onDisable();
    for (const name of ["support_4_3_active", "center_esc_active", "hide_current_ammo_active"]) {
        assert.equal(env.root.BHasClass(name), true, `${name} belongs to the shared accepted-config projector`);
    }
    env.Q.core.ConfigStore.set("ql_ui_controls", "ENABLE_CENTER_ESC", false);
    env.feature.onSettingsChanged();
    assert.equal(env.root.BHasClass("center_esc_active"), false);
    assert.equal(env.root.BHasClass("support_4_3_active"), true);
});
