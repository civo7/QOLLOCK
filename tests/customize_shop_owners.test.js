"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const loadSettings = require("./load_settings_environment");

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

test("Shop Stats and in-shop Quick Buy apply separate geometry and release replaced or closed surfaces", () => {
    const { global: g, hud, clock } = loadSettings();
    const { $ } = hud.sandbox.global;
    const add = (parent, id, className = "") => {
        const panel = $.CreatePanel("Panel", parent, id);
        if (className) panel.AddClass(className);
        return panel;
    };
    const core = add(hud.root, "", "HudCore");
    const shop = add(add(core, "CitadelHudHeroShop"), "Shop");
    const duplicate = add(add(shop, "MainPanel"), "TestPanel");
    const nav = add(shop, "NavPanel");
    const stats = add(nav, "TestPanel");
    const lower = add(add(core, "StatsAndModsContainer"), "LowerLeft");
    const quickbuy = add(lower, "CitadelHudQuickbuy");
    const queue = add(quickbuy, "QuickBuyQueueContainer");
    const summary = add(quickbuy, "", "QuickbuyShopSummaryContainer");

    Object.assign(g.MOD_CONFIG, {
        ENABLE_SHOP_STATS: 1, SHOP_STATS_X_OFFSET: 51, SHOP_STATS_Y_OFFSET: -76, SHOP_STATS_SCALE: 73, SHOP_STATS_OPACITY: 0.68,
        QUICKBUY_X_OFFSET: 114, QUICKBUY_SCALE: 70,
        SHOP_QUICKBUY_X_OFFSET: 303, SHOP_QUICKBUY_Y_OFFSET: -40, SHOP_QUICKBUY_SCALE: 96, SHOP_QUICKBUY_OPACITY: 0.82
    });
    g.SaveAndSync();
    clock.advance(1100);
    assert.equal(stats.style.x, "51px");
    assert.equal(stats.style.y, "76px");
    assert.equal(stats.style.uiScale, "73%");
    assert.equal(stats.style.opacity, "0.68");
    assert.equal(duplicate.style.x, undefined);
    assert.equal(quickbuy.style.x, "114px");
    assert.equal(queue.style.x, undefined);

    hud.root.AddClass("gShopOpen");
    clock.advance(1100);
    assert.equal(quickbuy.style.x, undefined);
    assert.equal(quickbuy.style.uiScale, undefined);
    for (const panel of [queue, summary]) {
        assert.equal(panel.style.x, "303px");
        assert.equal(panel.style.y, "40px");
        assert.equal(panel.style.uiScale, "96%");
        assert.equal(panel.style.opacity, "0.82");
    }

    const retired = add(hud.root, "RetiredShopSurfaces");
    stats.SetParent(retired);
    queue.SetParent(retired);
    const replacementStats = add(nav, "TestPanel");
    const replacementQueue = add(quickbuy, "QuickBuyQueueContainer");
    clock.advance(1100);
    assert.equal(stats.style.x, undefined);
    assert.equal(queue.style.opacity, undefined);
    assert.equal(replacementStats.style.uiScale, "73%");
    assert.equal(replacementQueue.style.uiScale, "96%");

    Object.assign(g.MOD_CONFIG, { ENABLE_SHOP_STATS: 0, DISABLE_QUICK_BUY: 1 });
    g.SaveAndSync();
    clock.advance(1100);
    assert.equal(replacementStats.style.x, undefined);
    assert.equal(replacementQueue.style.x, undefined);
    assert.equal(summary.style.opacity, undefined);

    Object.assign(g.MOD_CONFIG, { ENABLE_SHOP_STATS: 1, DISABLE_QUICK_BUY: 0 });
    g.SaveAndSync();
    clock.advance(1100);
    assert.equal(replacementStats.style.x, "51px");
    assert.equal(replacementQueue.style.x, "303px");
    hud.root.RemoveClass("gShopOpen");
    clock.advance(1100);
    assert.equal(replacementQueue.style.x, undefined);
    assert.equal(summary.style.opacity, undefined);
    assert.equal(quickbuy.style.uiScale, "70%");
    assert.deepEqual(clock.errors, []);
});
