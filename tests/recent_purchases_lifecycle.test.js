"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup(overrides = {}) {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    const preset = env.sandbox.evalJson('Object.assign({}, QOL.buildDefaultConfig(), QOL_PRESETS["7eventy7"])');
    Q.core.ConfigAdapter.loadFromFlat({ ...preset, ...overrides });
    const cfg = Q.core.ConfigStore.view("ql_recent_purchases");
    const feature = Q.core.FeatureRegistry.getManifest("ql_recent_purchases").create({ config: { view: () => cfg } });
    const shop = $.CreatePanel("Panel", env.root, "RecentPurchasesPanel");
    const container = $.CreatePanel("Panel", shop, "RecentPurchasesContainer");
    const topbar = $.CreatePanel("Panel", env.root, "TopBar");
    const player = $.CreatePanel("Panel", topbar, "PlayerFixture");
    $.CreatePanel("Panel", player, "HeroBadge").heroid = 1;
    const heroName = $.CreatePanel("Label", player, "");
    heroName.AddClass("HeroNameHidden");
    heroName.text = "BEBOP";
    return { ...env, Q, $, feature, cfg, shop, container };
}

function purchase(env, time) {
    const row = env.$.CreatePanel("Panel", env.container, "");
    row.AddClass("recentPurchase");
    for (const [cls, text] of [["recentModPurchaseName", "Mystic Burst"],
        ["recentTimePurchased", time], ["recentModPurchaserHero", "BEBOP"]]) {
        const label = env.$.CreatePanel("Label", row, "");
        label.AddClass(cls);
        label.text = text;
    }
    return row;
}

function clean(env) {
    assert.deepEqual(env.clock.errors, []);
    assert.equal(env.sandbox.messages.filter(line => /\[ERROR\]/.test(line)).length, 0);
}

for (const cls of ["InHideout", "connectedToHideout"]) {
    for (const perHero of [false, true]) {
        test(`purchase -> ${cls} preserves native history and stops ${perHero ? "hero" : "central"} notifications`, () => {
            const env = setup({ ENABLE_HERO_PURCHASE_POPUPS: perHero ? 1 : 0 });
            env.feature.onEnable();
            env.clock.advance(1200);
            const row = purchase(env, "00:10");
            env.clock.advance(250);
            assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 1);
            env.root.AddClass(cls);
            env.clock.advance(1100);
            assert.equal(row.IsValid(), true, "QOL must not delete a native purchase row");
            assert.equal(row.GetParent(), env.container);
            assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 0);

            const lateRow = purchase(env, "00:11");
            let scans = 0;
            const find = env.container.FindChildrenWithClassTraverse;
            env.container.FindChildrenWithClassTraverse = function(name) { scans++; return find.call(this, name); };
            env.clock.advance(6000);
            assert.equal(scans, 0, "hideout must not process late native purchases");
            assert.equal(lateRow.IsValid(), true);
            assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 0);
            env.container.FindChildrenWithClassTraverse = find;

            env.root.RemoveClass(cls);
            env.clock.advance(1200);
            assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 0,
                "old native rows must seed deduplication without replaying notifications");
            const newRow = purchase(env, "00:12");
            env.clock.advance(250);
            assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 1);
            env.feature.onDisable();
            env.clock.advance(6000);
            assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 0);
            assert.ok([row, lateRow, newRow].every(panel => panel.IsValid()));
            clean(env);
        });
    }
}

test("enabling and polling recent purchases never trims the native history", () => {
    const env = setup();
    const existing = Array.from({ length: 55 }, (_, i) => purchase(env, `00:${i}`));
    env.feature.onEnable();
    env.clock.advance(1200);
    assert.ok(existing.every(panel => panel.IsValid()), "initial activation must preserve existing rows");
    const added = Array.from({ length: 55 }, (_, i) => purchase(env, `01:${i}`));
    env.clock.advance(1200);
    assert.ok(added.every(panel => panel.IsValid()), "history-size guard must not delete engine-owned rows");
    assert.equal(env.container.GetChildCount(), 110);
    env.feature.onDisable();
    clean(env);
});

test("disable cancels pending hero mapping and reenable remains functional", () => {
    const env = setup();
    const pendingBefore = env.clock.pendingCount();
    env.feature.onEnable();
    env.clock.advance(100);
    env.feature.onDisable();
    env.clock.advance(0);
    assert.ok(env.clock.pendingCount() <= pendingBefore, "owned mapping callbacks must be cancelled");
    const nativeRow = purchase(env, "00:01");
    env.clock.advance(1000);
    assert.equal(nativeRow.IsValid(), true);
    assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 0);
    env.feature.onEnable();
    env.clock.advance(1200);
    purchase(env, "00:02");
    env.clock.advance(250);
    assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 1);
    env.feature.onDisable();
    clean(env);
});

test("more than 300 retained native purchases never replay after notifications expire", () => {
    const env = setup({ ENABLE_HERO_PURCHASE_POPUPS: 0 });
    env.feature.onEnable();
    env.clock.advance(1200);
    const rows = Array.from({ length: 310 }, (_, i) => purchase(env, String(i)));
    env.clock.advance(250);
    assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 3);
    env.clock.advance(7000);
    assert.equal(env.root.FindChildrenWithClassTraverse("quickPurchase").length, 0,
        "retained history must not trigger another notification wave");
    assert.ok(rows.every(row => row.IsValid()));
    env.feature.onDisable();
    clean(env);
});

test("shop filter controls do not duplicate across feature disable and reenable", () => {
    const env = setup({ ENABLE_SHOP_RECENT_PURCHASES: 1, ENABLE_SHOP_ITEM_NOTIFICATIONS: 0 });
    const nativeRow = purchase(env, "00:01");
    for (let i = 0; i < 3; i++) {
        env.feature.onEnable();
        env.clock.advance(250);
        assert.equal(env.shop.Children().filter(p => p.id === "PurchaseFiltersContainer").length, 1);
        env.feature.onDisable();
        env.clock.advance(0);
        assert.equal(env.shop.Children().filter(p => p.id === "PurchaseFiltersContainer").length, 0);
        assert.equal(nativeRow.IsValid(), true);
    }
    clean(env);
});
