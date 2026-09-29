"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

test("healthbar accent and native position react in hideout and reset", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const container = $.CreatePanel("Panel", hud.root, "health_and_abilities_container");
    const frame = $.CreatePanel("Panel", container, "health_bar_frame");
    Q.core.ConfigStore.set("ql_healthbar", "PLAYER_HEALTHBAR_X_OFFSET", 100);
    Q.core.ConfigStore.set("ql_healthbar", "PLAYER_HEALTHBAR_ACCENT_COLOR", 3);
    hud.clock.advance(600);
    assert.equal(container.style.x, "100px");
    assert.equal(frame.style.washColor, Q.core.panel.resolvePaletteColor(3));

    frame.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", container, "health_bar_frame");
    hud.clock.advance(600);
    assert.equal(replacement.style.washColor, Q.core.panel.resolvePaletteColor(3));

    Q.core.ConfigStore.set("ql_healthbar", "PLAYER_HEALTHBAR_X_OFFSET", 0);
    Q.core.ConfigStore.set("ql_healthbar", "PLAYER_HEALTHBAR_ACCENT_COLOR", 0);
    hud.clock.advance(600);
    assert.equal(container.style.x || "", "");
    assert.equal(replacement.style.washColor || "", "");
    assert.deepEqual(hud.clock.errors, []);
});

test("bottom bar reapplies unchanged settings to a replacement panel", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const first = $.CreatePanel("Panel", hud.root, "hud_signature");
    Q.core.ConfigStore.set("ql_bottom_bar", "BOTTOM_BAR_X_OFFSET", 100);
    hud.clock.advance(600);
    assert.equal(first.style.x, "100px");

    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", hud.root, "hud_signature");
    hud.clock.advance(600);
    assert.equal(replacement.style.x, "100px");

    Q.core.ConfigStore.set("ql_bottom_bar", "BOTTOM_BAR_X_OFFSET", 0);
    hud.clock.advance(100);
    assert.equal(replacement.style.x || "", "");
    assert.deepEqual(hud.clock.errors, []);
});

test("bottom bar checks its known parent between periodic full-HUD searches", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    Q.core.App.shutdown();
    const parent = $.CreatePanel("Panel", hud.root, "AbilitiesContainer");
    const first = $.CreatePanel("Panel", parent, "hud_signature");
    let fullSearches = 0;
    const original = hud.root.FindChildTraverse;
    hud.root.FindChildTraverse = function(id) {
        if (id === "hud_signature") fullSearches++;
        return original.call(this, id);
    };
    const cfg = { HUD_BOTTOM_BAR_ENABLED: 1, BOTTOM_BAR_X_OFFSET: 100 };
    const feature = Q.core.FeatureRegistry.getManifest("ql_bottom_bar").create({
        id: "ql_bottom_bar", config: { all: () => cfg }
    });
    feature.onEnable();
    assert.equal(first.style.x, "100px");
    assert.equal(fullSearches, 1);
    hud.clock.advance(2000);
    assert.equal(fullSearches, 1, "steady polls should use the direct parent");

    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", parent, "hud_signature");
    hud.clock.advance(600);
    assert.equal(replacement.style.x, "100px");
    assert.equal(fullSearches, 1, "same-parent replacement should not need a full HUD walk");
    hud.clock.advance(5000);
    assert.ok(fullSearches >= 2, "periodic full search should detect an unexpected reparent");
    feature.onDisable();
    assert.deepEqual(hud.clock.errors, []);
});

test("souls offsets follow a replacement panel without another setting edit", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const first = $.CreatePanel("Panel", hud.root, "gold_and_ap_container");
    Q.core.ConfigStore.set("ql_souls", "SOULS_X_OFFSET", 100);
    hud.clock.advance(1100);
    assert.equal(first.style.x, "100px");
    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", hud.root, "gold_and_ap_container");
    hud.clock.advance(1100);
    assert.equal(replacement.style.x, "100px");
    Q.core.ConfigStore.set("ql_souls", "SOULS_X_OFFSET", 0);
    assert.equal(replacement.style.x || "", "");
    assert.deepEqual(hud.clock.errors, []);
});

test("ammo geometry and late text targets survive hideout panel replacement", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const first = $.CreatePanel("Panel", hud.root, "ammo_panel");
    Q.core.ConfigStore.set("ql_ammo", "AMMO_PANEL_X_OFFSET", 100);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_TEXT_COLOR", 3);
    hud.clock.advance(600);
    assert.equal(first.style.x, "100px");
    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", hud.root, "ammo_panel");
    hud.clock.advance(600);
    assert.equal(replacement.style.x, "100px");
    const text = $.CreatePanel("Label", replacement, "AmmoText");
    text.AddClass("weapon_ammo");
    hud.clock.advance(600);
    assert.equal(text.style.color, Q.core.panel.resolvePaletteColor(3));
    const clip = $.CreatePanel("Panel", hud.root, "clip_status");
    const ring = $.CreatePanel("Panel", clip, "ClipRing");
    Q.core.ConfigStore.set("ql_ammo", "AMMO_CLIP_ANGLE", 45);
    hud.clock.advance(600);
    assert.equal(ring.style.transform, "rotateZ(-45deg)");
    ring.DeleteAsync(0);
    hud.clock.advance(1);
    const newRing = $.CreatePanel("Panel", clip, "ClipRing");
    hud.clock.advance(600);
    assert.equal(newRing.style.transform, "rotateZ(-45deg)");
    assert.deepEqual(hud.clock.errors, []);
});

test("damage impact styles follow a replacement panel and release on default", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const first = $.CreatePanel("Panel", hud.root, "damage_impact");
    Q.core.ConfigStore.set("ql_damage_impact", "DAMAGE_IMPACT_X_OFFSET", 100);
    hud.clock.advance(600);
    assert.equal(first.style.x, "100px");
    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", hud.root, "damage_impact");
    hud.clock.advance(600);
    assert.equal(replacement.style.x, "100px");
    Q.core.ConfigStore.set("ql_damage_impact", "DAMAGE_IMPACT_X_OFFSET", 0);
    assert.equal(replacement.style.x || "", "");
    assert.deepEqual(hud.clock.errors, []);
});

test("damage impact visibility toggle hides current and newly created panels", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const first = $.CreatePanel("Panel", hud.root, "damage_impact");
    Q.core.ConfigStore.set("ql_damage_impact", "ENABLE_DAMAGE_IMPACT", false);
    assert.equal(first.BHasClass("qol-hidden"), true);

    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", hud.root, "damage_impact");
    hud.clock.advance(600);
    assert.equal(replacement.BHasClass("qol-hidden"), true);

    Q.core.ConfigStore.set("ql_damage_impact", "ENABLE_DAMAGE_IMPACT", true);
    assert.equal(replacement.BHasClass("qol-hidden"), false);
    assert.deepEqual(hud.clock.errors, []);
});

for (const scenario of [
    { feature: "ql_topbar", key: "HUD_TOP_BAR_ENABLED", id: "TopBar", offsetKey: "TOP_BAR_X_OFFSET" },
    { feature: "ql_bottom_bar", key: "HUD_BOTTOM_BAR_ENABLED", id: "hud_signature", offsetKey: "BOTTOM_BAR_X_OFFSET" },
    { feature: "ql_souls", key: "HUD_SOULS_ENABLED", id: "gold_and_ap_container", offsetKey: "SOULS_X_OFFSET" },
    { feature: "ql_items", key: "HUD_ITEMS_ENABLED", id: "ModsContainer", parentId: "StatsAndModsContainer", panelClass: "ModsContainer", offsetKey: "ITEMS_X_OFFSET" },
    { feature: "ql_heroshop", key: "HUD_SHOP_ENABLED", id: "MainPanel", shop: true }
]) {
    test(`${scenario.feature} hides native panels created after its toggle is off`, () => {
        const hud = createHud({ inHideout: true });
        hud.assertLoaded();
        const { $, QOL: Q } = hud.sandbox.global;
        const parent = scenario.shop ? hud.game.shopPanel :
            scenario.parentId ? $.CreatePanel("Panel", hud.root, scenario.parentId) : hud.root;
        const first = $.CreatePanel("Panel", parent, scenario.id);
        if (scenario.panelClass) first.AddClass(scenario.panelClass);
        if (scenario.offsetKey) Q.core.ConfigStore.set(scenario.feature, scenario.offsetKey, 100);
        hud.clock.advance(2200);
        if (scenario.offsetKey) assert.equal(first.style.x, "100px", "configured offset");

        Q.core.ConfigStore.set(scenario.feature, scenario.key, false);
        hud.clock.advance(2200);
        assert.equal(first.BHasClass("qol-hidden"), true, "existing panel");
        if (scenario.offsetKey) assert.ok(!first.style.x || first.style.x === "0px", "hidden panel resets offset");

        first.DeleteAsync(0);
        hud.clock.advance(1);
        const replacement = $.CreatePanel("Panel", parent, scenario.id);
        if (scenario.panelClass) replacement.AddClass(scenario.panelClass);
        hud.clock.advance(2200);
        assert.equal(replacement.BHasClass("qol-hidden"), true, "replacement panel");

        Q.core.ConfigStore.set(scenario.feature, scenario.key, true);
        hud.clock.advance(2200);
        assert.equal(replacement.BHasClass("qol-hidden"), false, "re-enabled panel");
        if (scenario.offsetKey) assert.equal(replacement.style.x, "100px", "re-enabled offset");
        assert.deepEqual(hud.clock.errors, []);
    });
}

test("shop layout follows replacement MainPanel with unchanged settings", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const shop = hud.game.shopPanel;
    const first = $.CreatePanel("Panel", shop, "MainPanel");
    Q.core.ConfigStore.set("ql_heroshop", "SHOP_OFFSET_X", 100);
    assert.equal(Q.core.FeatureRegistry.isEnabled("ql_heroshop"), true);
    assert.equal(Q.core.ConfigStore.get("ql_heroshop", "SHOP_OFFSET_X"), 100);
    hud.clock.advance(2200);
    assert.deepEqual(hud.clock.errors, []);
    assert.equal(first.style.marginLeft, "100px");
    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", shop, "MainPanel");
    hud.clock.advance(2200);
    assert.equal(replacement.style.marginLeft, "100px");
    shop.DeleteAsync(0);
    hud.clock.advance(1);
    const newShop = $.CreatePanel("Panel", hud.root, "CitadelHudHeroShop");
    const newMain = $.CreatePanel("Panel", newShop, "MainPanel");
    hud.clock.advance(2200);
    assert.equal(newMain.style.marginLeft, "100px");
    assert.deepEqual(hud.clock.errors, []);
});

test("keyboard overlay keeps its wash on a recreated overlay", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    Q.core.ConfigStore.set("ql_keyboard", "ENABLE_KEYBOARD_OVERLAY", true);
    Q.core.ConfigStore.set("ql_keyboard", "KEYBOARD_OVERLAY_WASH_COLOR", 3);
    hud.clock.advance(500);
    const first = hud.root.FindChildTraverse("QOLKeyboardOverlayRoot");
    assert.ok(first);
    assert.equal(first.style.washColor, Q.core.panel.resolvePaletteColor(3));
    first.DeleteAsync(0);
    hud.clock.advance(500);
    const replacement = hud.root.FindChildTraverse("QOLKeyboardOverlayRoot");
    assert.ok(replacement);
    assert.notEqual(replacement, first);
    assert.equal(replacement.style.washColor, Q.core.panel.resolvePaletteColor(3));
    assert.deepEqual(hud.clock.errors, []);
});

test("reload label gets its configured style after replacement", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const reticle = $.CreatePanel("Panel", hud.root, "reticle_status");
    $.CreatePanel("Panel", reticle, "attack_delayed_progress_bar");
    Q.core.ConfigStore.set("ql_reload_cooldown", "ENABLE_RELOAD_COOLDOWN", true);
    Q.core.ConfigStore.set("ql_reload_cooldown", "RELOAD_COOLDOWN_X_OFFSET", 20);
    hud.clock.advance(600);
    const first = reticle.FindChildTraverse("QOLReloadCooldownText");
    assert.ok(first);
    assert.equal(first.style.marginLeft, "20px");
    first.DeleteAsync(0);
    hud.clock.advance(600);
    const replacement = reticle.FindChildTraverse("QOLReloadCooldownText");
    assert.ok(replacement);
    assert.notEqual(replacement, first);
    assert.equal(replacement.style.marginLeft, "20px");
    assert.deepEqual(hud.clock.errors, []);
});

test("combat status reapplies layout to a recreated overlay", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    Q.core.ConfigStore.set("ql_combat_status", "ENABLE_COMBAT_STATUS", true);
    Q.core.ConfigStore.set("ql_combat_status", "COMBAT_STATUS_X_OFFSET", 100);
    hud.clock.advance(500);
    const first = hud.root.FindChildTraverse("QOLCombatStatusOverlay");
    assert.ok(first);
    assert.equal(first.style.marginLeft, "100px");
    first.DeleteAsync(0);
    hud.clock.advance(500);
    const replacement = hud.root.FindChildTraverse("QOLCombatStatusOverlay");
    assert.ok(replacement);
    assert.notEqual(replacement, first);
    assert.equal(replacement.style.marginLeft, "100px");
    assert.deepEqual(hud.clock.errors, []);
});

test("build ID reapplies text and layout to a recreated label", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const lowerLeft = $.CreatePanel("Panel", hud.root, "LowerLeft");
    const source = $.CreatePanel("Label", hud.root, "SelectedBuildInfoTitle");
    source.text = "123 - Example - 1";
    Q.core.ConfigStore.set("ql_show_build_id", "ENABLE_SHOW_BUILD_ID", true);
    hud.clock.advance(1100);
    const first = lowerLeft.FindChildTraverse("build_info");
    assert.ok(first);
    assert.match(first.text, /123/);
    first.DeleteAsync(0);
    hud.clock.advance(1100);
    const replacement = lowerLeft.FindChildTraverse("build_info");
    assert.ok(replacement);
    assert.notEqual(replacement, first);
    assert.match(replacement.text, /123/);
    assert.equal(replacement.style.fontSize, "16px");
    assert.deepEqual(hud.clock.errors, []);
});
