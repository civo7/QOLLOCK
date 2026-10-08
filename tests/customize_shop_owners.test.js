"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

test("Customize binds purchases in the verified navigation owner before a same-ID shop content child", () => {
    const hud = createHud({ inHideout: false }); hud.assertLoaded();
    const { QOL: Q, $ } = hud.sandbox.global;
    Q.core.App.shutdown();
    const core = $.CreatePanel("Panel", hud.root, ""); core.AddClass("HudCore");
    const shop = $.CreatePanel("Panel", core, "CitadelHudHeroShop");
    const body = $.CreatePanel("Panel", shop, "Shop");
    const content = $.CreatePanel("Panel", body, "MainPanel");
    const other = $.CreatePanel("Panel", content, "RecentPurchasesPanel");
    const nav = $.CreatePanel("Panel", body, "NavPanel");
    const owner = $.CreatePanel("Panel", nav, "RecentPurchasesPanel");
    const catalog = Q.presentation;
    const element = catalog.elements.find(row => row.id === "recentPurchases");
    assert.equal(catalog.resolve(element, hud.root) === owner, true);
    assert.equal(catalog.resolve(element, hud.root) === other, false);
    owner.SetParent($.CreatePanel("Panel", null, "RetiredPurchaseOwner"));
    const replacement = $.CreatePanel("Panel", nav, "RecentPurchasesPanel");
    assert.equal(catalog.resolve(element, hud.root) === replacement, true);
    assert.equal(owner.IsValid(), true);
});
