"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const ID = "ql_recent_purchases";

function fixture(config = {}) {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    env.sandbox.eval("Math.random = () => 0;");
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"),
        ENABLE_SHOP_RECENT_PURCHASES: 1, ENABLE_SHOP_ITEM_NOTIFICATIONS: 1, ENABLE_HERO_PURCHASE_POPUPS: 0,
        ENABLE_OBJ_MAP: 0, ENABLE_URN_DIFF: 0, ENABLE_ULT_COOLDOWNS: 0, ...config });
    const add = (parent, id = "", classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id);
        for (const cls of classes) panel.AddClass(cls);
        return panel;
    };
    const core = add(env.root, "", ["HudCore"]);
    const heroShop = add(core, "CitadelHudHeroShop");
    const shopRoot = add(heroShop, "Shop");
    const main = add(shopRoot, "MainPanel");
    const nav = add(shopRoot, "NavPanel");
    const createShop = () => {
        const panel = add(nav, "RecentPurchasesPanel");
        const header = add(panel, "RecentPurchases", [], "Label");
        const list = add(panel, "RecentPurchasesContainer");
        return { panel, header, list };
    };
    const shop = createShop();
    const top = add(core, "TopBar");
    const retired = add(null, "RetiredPurchaseGeneration");
    const create = () => Q.core.FeatureRegistry.getManifest(ID).create(Q.core.FeatureRegistry.createContext(ID));
    let feature = create();
    const set = patch => { Q.core.ConfigStore.load({ [ID]: patch }); feature.onSettingsChanged(); };
    const purchase = (list = shop.list, options = {}) => {
        const row = add(list, "", ["recentPurchase", ...(options.classes || ["isTier1Purchase", "isTeam1Purchase"])]);
        const labels = {};
        for (const [cls, value] of [["recentModPurchaseName", options.name || "Mystic Burst"],
            ["recentTimePurchased", options.time || "01:00"], ["recentModPurchaserHero", options.hero || "BEBOP"]]) {
            labels[cls] = add(row, "", [cls], "Label"); labels[cls].text = value;
        }
        const icon = add(row, "", ["mod_icon"]);
        return { row, labels, icon };
    };
    const card = (owner = top, name = "BEBOP", id = 1) => {
        const panel = add(owner, "");
        const badge = add(panel, "HeroBadge"); badge.heroid = id;
        const label = add(panel, "", ["HeroNameHidden"], "Label"); label.text = name;
        return { panel, badge, label };
    };
    const feed = (owner = top) => owner.FindChild("QuickPurchasesPanel");
    const entries = (owner = env.root) => owner.FindChildrenWithClassTraverse("quickPurchase");
    const start = () => { feature.onEnable(); env.clock.advance(1200); };
    const stop = () => { feature.onDisable(); env.clock.advance(0); };
    const clean = () => { assert.deepEqual(env.clock.errors, []); assert.equal(env.sandbox.messages.filter(line => /\[ERROR\]/.test(line)).length, 0); };
    const replaceInstance = () => { feature = create(); return feature; };
    return { ...env, Q, $, add, core, heroShop, main, nav, shop, top, retired, createShop, create, set, purchase, card, feed, entries,
        start, stop, clean, replaceInstance, get feature() { return feature; } };
}

test("shop geometry releases defaults to CSS without touching native feedback", () => {
    const env = fixture();
    env.shop.panel.style.preTransformScale2d = "native feedback scale";
    env.start();
    assert.equal(env.shop.panel.style.uiScale, undefined, "CSS retains its original shop scale");
    assert.equal(env.feed().style.uiScale, undefined, "default feed scale retains scoreboard CSS");
    env.set({ RECENT_PURCHASES_PANEL_X_OFFSET: 32, RECENT_PURCHASES_PANEL_Y_OFFSET: 19,
        RECENT_PURCHASES_PANEL_SCALE: 1.5, RECENT_PURCHASES_PANEL_OPACITY: 0.4 });
    assert.equal(env.shop.panel.style.x, "32px");
    assert.equal(env.shop.panel.style.y, "-19px");
    assert.equal(env.shop.panel.style.uiScale, "195%");
    assert.equal(env.shop.panel.style.opacity, "0.40");
    env.set({ RECENT_PURCHASES_PANEL_X_OFFSET: 0, RECENT_PURCHASES_PANEL_Y_OFFSET: 0,
        RECENT_PURCHASES_PANEL_SCALE: 1, RECENT_PURCHASES_PANEL_OPACITY: 1 });
    for (const property of ["x", "y", "uiScale", "opacity"]) assert.equal(env.shop.panel.style[property], undefined, property);
    assert.equal(env.shop.panel.style.preTransformScale2d, "native feedback scale");
    env.stop(); env.clean();
});

test("purchase rows use direct native leaves and observe replacements without caching stale text", () => {
    const env = fixture();
    const first = env.purchase();
    let traversals = 0;
    const traverse = first.row.FindChildrenWithClassTraverse.bind(first.row);
    first.row.FindChildrenWithClassTraverse = name => { traversals++; return traverse(name); };
    env.start();
    assert.equal(traversals, 0, "populated direct rows need no repeated per-leaf subtree search");
    const replacement = env.add(first.row, "", ["recentModPurchaseName"], "Label"); replacement.text = "Extra Health";
    first.labels.recentModPurchaseName.SetParent(env.retired);
    first.labels.recentTimePurchased.text = "01:01";
    env.clock.advance(250);
    assert.equal(env.entries().length, 1);
    assert.equal(traversals, 0);
    env.stop(); env.clean();
});

test("nested compatibility purchase leaves still notify and accept late hero text", () => {
    const env = fixture(); env.start();
    const source = env.purchase();
    const wrapper = env.add(source.row, "CompatibilityContents");
    for (const panel of [...Object.values(source.labels), source.icon]) panel.SetParent(wrapper);
    source.labels.recentModPurchaserHero.text = "";
    env.clock.advance(250); assert.equal(env.entries().length, 1);
    source.labels.recentModPurchaserHero.text = "BEBOP";
    env.clock.advance(250); assert.equal(env.entries().length, 1, "late hero text cannot replay the purchase");
    env.stop(); env.clean();
});

test("still-live shop replacement releases native styles, icons, filters and controls", () => {
    const env = fixture({ RECENT_PURCHASES_PANEL_X_OFFSET: 27, RECENT_PURCHASES_PANEL_OPACITY: 0.3 });
    const old = env.purchase();
    env.start(); env.shop.panel.FindChildTraverse("Tier1Toggle").activate();
    const controls = env.shop.panel.FindChild("PurchaseFiltersContainer");
    assert.equal(old.row.BHasClass("filterHidden"), true);
    assert.ok(old.icon.style.backgroundImage);
    env.shop.panel.SetParent(env.retired);
    const next = env.createShop();
    const existing = env.purchase(next.list, { time: "01:01" });
    env.clock.advance(250);
    assert.equal(env.shop.panel.IsValid(), true);
    assert.equal(old.row.IsValid(), true);
    assert.equal(old.row.BHasClass("filterHidden"), false);
    assert.equal(old.icon.BHasClass("iconSet"), false);
    assert.equal(old.icon.style.backgroundImage, undefined);
    assert.equal(old.icon.style.washColor, undefined);
    assert.equal(env.shop.panel.style.x, undefined);
    assert.equal(env.shop.panel.style.opacity, undefined);
    assert.equal(controls.IsValid(), false);
    assert.equal(next.panel.style.x, "27px");
    assert.equal(existing.row.BHasClass("filterHidden"), true, "active owner's filter choice follows its new source");
    assert.equal(env.entries().length, 0, "new source history seeds without replay");
    env.stop(); env.clean();
});

test("container replacement inside an unchanged shop retires the previous native row ownership", () => {
    const env = fixture(); const old = env.purchase();
    env.start(); env.shop.panel.FindChildTraverse("Tier1Toggle").activate();
    env.shop.list.SetParent(env.retired);
    const next = env.add(env.shop.panel, "RecentPurchasesContainer");
    const current = env.purchase(next);
    env.clock.advance(250);
    assert.equal(old.row.IsValid(), true);
    assert.equal(old.row.BHasClass("filterHidden"), false);
    assert.equal(old.icon.style.backgroundImage, undefined);
    assert.equal(current.row.BHasClass("filterHidden"), true);
    assert.equal(env.shop.panel.Children().filter(panel => panel.id === "PurchaseFiltersContainer").length, 1);
    env.stop(); env.clean();
});

test("filters follow recycled and replaced later rows with unchanged count and first child", () => {
    const env = fixture({ ENABLE_SHOP_ITEM_NOTIFICATIONS: 0 });
    const first = env.purchase();
    const later = env.purchase(env.shop.list, { classes: ["isTier2Purchase"], time: "01:01" });
    env.start(); env.shop.panel.FindChildTraverse("Tier1Toggle").activate();
    assert.equal(first.row.BHasClass("filterHidden"), true);
    assert.equal(later.row.BHasClass("filterHidden"), false);
    later.row.RemoveClass("isTier2Purchase"); later.row.AddClass("isTier1Purchase");
    env.clock.advance(250);
    assert.equal(later.row.BHasClass("filterHidden"), true, "recycled purchase classes are read live");
    later.row.SetParent(env.retired);
    const next = env.purchase(env.shop.list, { time: "01:02" });
    env.clock.advance(250);
    assert.equal(later.row.BHasClass("filterHidden"), false);
    assert.equal(next.row.BHasClass("filterHidden"), true);
    assert.equal(env.shop.list.GetChild(0), first.row);
    env.stop(); env.clean();
});

test("native icon contents update after row recycling and release for an unmapped item", () => {
    const env = fixture({ ENABLE_SHOP_ITEM_NOTIFICATIONS: 0 });
    const item = env.purchase(); env.start();
    const original = item.icon.style.backgroundImage;
    item.icon.style.backgroundImage = "native recycled image";
    item.icon.style.washColor = "native recycled tint";
    env.clock.advance(250);
    assert.equal(item.icon.style.backgroundImage, original, "native replacement values invalidate the applied signature");
    assert.equal(item.icon.style.washColor, "none");
    item.labels.recentModPurchaseName.text = "Extra Stamina";
    env.clock.advance(250);
    assert.ok(item.icon.style.backgroundImage);
    assert.notEqual(item.icon.style.backgroundImage, original);
    item.labels.recentModPurchaseName.text = "Unknown native item";
    env.clock.advance(250);
    assert.equal(item.icon.style.backgroundImage, undefined);
    assert.equal(item.icon.BHasClass("iconSet"), false);
    env.stop(); env.clean();
});

test("native shop styling is released when only notifications remain enabled", () => {
    const env = fixture({ RECENT_PURCHASES_PANEL_SCALE: 1.3 });
    const item = env.purchase(); env.start();
    env.shop.panel.FindChildTraverse("Tier1Toggle").activate();
    env.set({ ENABLE_SHOP_RECENT_PURCHASES: 0 }); env.clock.advance(0);
    assert.equal(env.shop.panel.style.uiScale, undefined);
    assert.equal(env.shop.panel.FindChild("PurchaseFiltersContainer"), null);
    assert.equal(item.row.BHasClass("filterHidden"), false);
    assert.equal(item.icon.style.backgroundImage, undefined);
    env.purchase(env.shop.list, { time: "01:01" }); env.clock.advance(250);
    assert.equal(env.entries().length, 1);
    env.stop(); env.clean();
});

test("filter choices belong to an instance and spectator/team controls remain reactive", () => {
    const env = fixture({ ENABLE_SHOP_ITEM_NOTIFICATIONS: 0 });
    env.root.AddClass("Team1");
    const ally = env.purchase();
    const enemy = env.purchase(env.shop.list, { classes: ["isTeam2Purchase"] });
    env.start();
    const myTeam = env.shop.panel.FindChildTraverse("MyTeamToggle");
    myTeam.activate();
    assert.equal(ally.row.BHasClass("filterHidden"), true);
    assert.equal(enemy.row.BHasClass("filterHidden"), false);
    env.root.AddClass("TeamSpectator"); env.clock.advance(250);
    assert.equal(myTeam.BHasClass("filterButtonHidden"), true);
    assert.equal(env.shop.panel.FindChildTraverse("Team1OnlyToggle").BHasClass("filterButtonHidden"), false);
    assert.equal(ally.row.BHasClass("filterHidden"), false);
    env.shop.panel.FindChildTraverse("Team1OnlyToggle").activate();
    assert.equal(ally.row.BHasClass("filterHidden"), true);
    env.stop();
    env.replaceInstance(); env.start();
    assert.equal(env.shop.panel.FindChildTraverse("Team1OnlyToggle").checked, true);
    assert.equal(ally.row.BHasClass("filterHidden"), false);
    env.stop(); env.clean();
});

test("simultaneous equal item/time purchases remain distinct, with no replay of late hero text", () => {
    const env = fixture({ ENABLE_SHOP_RECENT_PURCHASES: 0, RECENT_PURCHASES_QUICK_MAX: 5 });
    env.start();
    const first = env.purchase(); const second = env.purchase();
    first.labels.recentModPurchaserHero.text = "";
    env.clock.advance(250);
    assert.equal(env.entries().length, 2);
    first.labels.recentModPurchaserHero.text = "BEBOP"; env.clock.advance(250);
    assert.equal(env.entries().length, 2);
    second.labels.recentModPurchaseName.text = "Extra Stamina"; env.clock.advance(250);
    assert.equal(env.entries().length, 3, "native row recycling creates a new event");
    env.clock.advance(12000);
    assert.equal(env.entries().length, 0);
    assert.equal(env.shop.list.GetChildCount(), 2);
    env.stop(); env.clean();
});

test("central feed rebinds a still-live top bar and seeds its existing history", () => {
    const env = fixture(); env.start(); env.purchase(); env.clock.advance(250);
    const oldFeed = env.feed();
    env.top.SetParent(env.retired);
    const top = env.add(env.core, "TopBar"); env.clock.advance(250);
    assert.equal(env.top.IsValid(), true);
    assert.equal(oldFeed.IsValid(), false);
    assert.ok(env.feed(top));
    assert.equal(env.entries().length, 0);
    env.purchase(env.shop.list, { time: "01:01" }); env.clock.advance(250);
    assert.equal(env.entries(top).length, 1);
    env.stop(); env.clean();
});

test("hero popups follow living card replacement and native hero identity changes", () => {
    const env = fixture({ ENABLE_HERO_PURCHASE_POPUPS: 1 });
    const first = env.card(); env.start(); env.purchase(); env.clock.advance(250);
    const oldPopup = first.panel.FindChildrenWithClassTraverse("QuickPurchasesPanel")[0];
    first.panel.SetParent(env.retired);
    const next = env.card(); env.clock.advance(800);
    assert.equal(first.panel.IsValid(), true);
    assert.equal(first.badge.heroid, 1);
    assert.equal(oldPopup.IsValid(), false);
    assert.equal(env.entries().length, 0);
    env.purchase(env.shop.list, { time: "01:01" }); env.clock.advance(250);
    assert.equal(env.entries(next.panel).length, 1);
    const secondPopup = next.panel.FindChildrenWithClassTraverse("QuickPurchasesPanel")[0];
    next.badge.heroid = 2; next.label.text = "INFERNUS"; env.clock.advance(800);
    assert.equal(secondPopup.IsValid(), false);
    env.purchase(env.shop.list, { time: "01:02", hero: "INFERNUS" }); env.clock.advance(250);
    assert.equal(env.entries(next.panel).length, 1);
    assert.equal(next.panel.GetDialogVariable("hero_id"), "2");
    env.stop(); env.clean();
});

test("hero popups retain late purchaser evidence without blocking another purchase", () => {
    const env = fixture({ ENABLE_HERO_PURCHASE_POPUPS: 1, RECENT_PURCHASES_QUICK_MAX: 5 });
    const player = env.card(); env.start();
    const late = env.purchase(); late.labels.recentModPurchaserHero.text = "";
    env.purchase(env.shop.list, { time: "01:01" }); env.clock.advance(250);
    assert.equal(env.entries(player.panel).length, 1);
    late.labels.recentModPurchaserHero.text = "BEBOP"; env.clock.advance(250);
    assert.equal(env.entries(player.panel).length, 2);
    env.clock.advance(500); assert.equal(env.entries(player.panel).length, 2, "late evidence completes the same event once");
    env.stop(); env.clean();
});

test("hero popups do not attribute recycled-row evidence to a previous unresolved purchase", () => {
    const env = fixture({ ENABLE_HERO_PURCHASE_POPUPS: 1, RECENT_PURCHASES_QUICK_MAX: 5, RECENT_PURCHASES_QUICK_DISPLAY_SEC: 3 });
    const player = env.card(); env.start();
    const recycled = env.purchase(); recycled.labels.recentModPurchaserHero.text = "";
    env.clock.advance(250); assert.equal(env.entries().length, 0);
    recycled.labels.recentTimePurchased.text = "01:01";
    recycled.labels.recentModPurchaseName.text = "Extra Stamina";
    recycled.labels.recentModPurchaserHero.text = "BEBOP"; env.clock.advance(250);
    assert.equal(env.entries(player.panel).length, 1);
    env.clock.advance(6000); assert.equal(env.entries().length, 0);
    env.stop(); env.clean();
});

test("unresolved hero purchases expire without replay when purchaser evidence arrives later", () => {
    const env = fixture({ ENABLE_HERO_PURCHASE_POPUPS: 1, RECENT_PURCHASES_QUICK_DISPLAY_SEC: 3 });
    env.card(); env.start();
    const late = env.purchase(); late.labels.recentModPurchaserHero.text = "";
    env.clock.advance(6000);
    late.labels.recentModPurchaserHero.text = "BEBOP"; env.clock.advance(250);
    assert.equal(env.entries().length, 0);
    env.purchase(env.shop.list, { time: "01:01" }); env.clock.advance(250);
    assert.equal(env.entries().length, 1);
    env.stop(); env.clean();
});

test("hero popup margins observe native ultimate state and shared cooldown setting", () => {
    const env = fixture({ ENABLE_HERO_PURCHASE_POPUPS: 1 });
    const player = env.card(); env.start(); env.purchase(); env.clock.advance(250);
    const popup = player.panel.FindChildrenWithClassTraverse("QuickPurchasesPanel")[0];
    assert.equal(popup.style.marginTop, "125px");
    player.panel.AddClass("UltimateUnlocked"); env.clock.advance(250);
    assert.equal(popup.style.marginTop, "152px");
    env.Q.core.ConfigStore.set("ql_ult_cooldowns", "ENABLE_ULT_COOLDOWNS", true);
    env.feature.onSettingsChanged();
    assert.equal(popup.style.marginTop, "172px");
    player.panel.AddClass("UltimateCooldownReady"); env.clock.advance(250);
    assert.equal(popup.style.marginTop, "152px");
    env.stop(); env.clean();
});

test("hero popup overlap preserves measured rows, current scale and ultimate margins", () => {
    const env = fixture({ ENABLE_HERO_PURCHASE_POPUPS: 1 });
    const first = env.card(), second = env.card(env.top, "INFERNUS", 2);
    second.panel.actualxoffset = 100;
    env.start();
    env.purchase(); env.purchase(env.shop.list, { hero: "INFERNUS", time: "01:01" }); env.clock.advance(250);
    const left = first.panel.FindChildrenWithClassTraverse("QuickPurchasesPanel")[0];
    const right = second.panel.FindChildrenWithClassTraverse("QuickPurchasesPanel")[0];
    left.actuallayoutwidth = right.actuallayoutwidth = 400;
    left.contentheight = right.contentheight = 100;
    env.clock.advance(250);
    assert.equal(left.style.marginTop, "125px");
    assert.equal(right.style.marginTop, "200px");
    env.set({ RECENT_PURCHASES_QUICK_SCALE: 1.5 });
    assert.equal(right.style.marginTop, "237.5px");
    first.panel.AddClass("UltimateUnlocked"); env.clock.advance(250);
    assert.equal(left.style.marginTop, "152px");
    assert.equal(right.style.marginTop, "264.5px");
    env.stop(); env.clean();
});

test("hero identity replacement during pending mapping cannot publish the previous card generation", () => {
    const env = fixture({ ENABLE_HERO_PURCHASE_POPUPS: 1 });
    const player = env.card();
    env.feature.onEnable(); env.clock.advance(100);
    player.badge.heroid = 2; player.label.text = "INFERNUS";
    env.clock.advance(1100);
    env.purchase(env.shop.list, { hero: "BEBOP" }); env.clock.advance(250);
    assert.equal(env.entries().length, 0, "retired hero identity is not mapped onto the current card");
    env.purchase(env.shop.list, { hero: "INFERNUS", time: "01:01" }); env.clock.advance(250);
    assert.equal(env.entries(player.panel).length, 1);
    assert.equal(player.panel.GetDialogVariable("hero_id"), "2");
    env.stop(); env.clean();
});

test("central geometry observes canonical objective/urn changes and live timer replacement", () => {
    const env = fixture();
    const charges = env.add(env.top, "RejuvenatorCharges");
    const timer = env.add(charges, "RejuvenatorTimer", ["has_rejuv"]);
    const objectives = env.add(env.top, "ObjectivesMap"); objectives.actualyoffset = 30; objectives.actuallayoutheight = 200;
    const urn = env.add(env.top, "UrnTracker"); urn.actualyoffset = 30; urn.actuallayoutheight = 260;
    env.Q.core.FeatureRegistry.boot();
    for (const id of env.Q.core.FeatureRegistry.getEnabledIds()) if (id !== ID) env.Q.core.FeatureRegistry.disable(id);
    const feed = env.feed(); assert.equal(feed.style.marginTop, "153px");
    timer.SetParent(env.retired); env.add(charges, "RejuvenatorTimer"); env.clock.advance(250);
    assert.equal(feed.BHasClass("has_rejuv"), false);
    assert.equal(feed.style.marginTop, "90px");
    env.Q.core.ConfigStore.set("ql_topbar", "ENABLE_OBJ_MAP", true);
    assert.equal(feed.style.marginTop, "242px", "shared observer hook applies immediately");
    env.Q.core.ConfigStore.set("ql_urn_tracker", "ENABLE_URN_DIFF", true);
    assert.equal(feed.style.marginTop, "302px");
    env.Q.core.FeatureRegistry.shutdown(); env.clock.advance(0); env.clean();
});

test("quick scaling composes scoreboard CSS and releases code offsets on defaults", () => {
    const env = fixture({ RECENT_PURCHASES_QUICK_SCALE: 1.5, RECENT_PURCHASES_QUICK_X_OFFSET: 40 });
    env.start(); const feed = env.feed();
    assert.equal(feed.style.uiScale, "150%");
    env.root.AddClass("gScoreboardOpen"); env.clock.advance(250);
    assert.equal(feed.style.uiScale, "128%");
    assert.equal(feed.style.marginTop, "175px");
    env.set({ RECENT_PURCHASES_QUICK_SCALE: 1, RECENT_PURCHASES_QUICK_X_OFFSET: 0 });
    assert.equal(feed.style.uiScale, undefined);
    assert.equal(feed.style.x, undefined);
    assert.equal(feed.BHasClass("rp_quick_scoreboard_active"), true);
    env.stop(); env.clean();
});

test("partial native and overlay style writes remain retryable and cleanup clears attempted properties", () => {
    const env = fixture(); env.start();
    let rejected = 0;
    Object.defineProperty(env.shop.panel.style, "opacity", { configurable: true, get: () => "native", set: () => { rejected++; throw new Error("transient native rejection"); } });
    env.set({ RECENT_PURCHASES_PANEL_X_OFFSET: 35, RECENT_PURCHASES_PANEL_OPACITY: 0.3 });
    env.clock.advance(250);
    assert.ok(rejected >= 2);
    assert.equal(env.shop.panel.style.x, "35px");
    Object.defineProperty(env.shop.panel.style, "opacity", { configurable: true, writable: true, value: "native" });
    env.clock.advance(250);
    assert.equal(env.shop.panel.style.opacity, "0.30");
    const feed = env.feed(); let feedRejected = 0;
    Object.defineProperty(feed.style, "opacity", { configurable: true, get: () => "native", set: () => { feedRejected++; throw new Error("transient overlay rejection"); } });
    env.set({ RECENT_PURCHASES_QUICK_OPACITY: 0.2, RECENT_PURCHASES_QUICK_Y_OFFSET: 17 });
    env.clock.advance(250); assert.ok(feedRejected >= 2);
    Object.defineProperty(feed.style, "opacity", { configurable: true, writable: true, value: "native" });
    env.clock.advance(250);
    assert.equal(feed.style.opacity, "0.20"); assert.equal(feed.style.y, "-17px");
    Object.defineProperty(env.shop.panel.style, "x", { configurable: true, get: () => "35px", set: () => { throw new Error("native offset reset rejected"); } });
    env.stop();
    assert.equal(env.shop.panel.style.opacity, undefined); assert.equal(env.shop.panel.style.x, undefined);
    assert.equal(feed.IsValid(), false); env.clean();
});

test("a rejected default release is retried by the next poll", () => {
    const env = fixture({ RECENT_PURCHASES_PANEL_OPACITY: 0.3 }); env.start();
    const clear = env.shop.panel.ClearPropertyFromCode;
    let first = true;
    env.shop.panel.ClearPropertyFromCode = function(property) {
        if (property === "opacity" && first) { first = false; return false; }
        return clear.call(this, property);
    };
    env.set({ RECENT_PURCHASES_PANEL_OPACITY: 1 });
    assert.equal(env.shop.panel.style.opacity, "0.30");
    env.clock.advance(250);
    assert.equal(env.shop.panel.style.opacity, undefined);
    env.stop(); env.clean();
});

test("failed enable releases partially-created filter roots and can be retried", () => {
    const env = fixture({ ENABLE_SHOP_ITEM_NOTIFICATIONS: 0 });
    const create = env.$.CreatePanel;
    env.$.CreatePanel = (type, parent, id, ...args) => {
        if (id === "PurchaseFiltersContainer") throw new Error("native control creation rejected");
        return create(type, parent, id, ...args);
    };
    env.Q.core.FeatureRegistry.enable(ID); env.clock.advance(0);
    assert.equal(env.Q.core.FeatureRegistry.getInstance(ID), null);
    assert.equal(env.shop.panel.FindChild("FiltersCollapseToggle"), null);
    assert.equal(env.shop.list.IsValid(), true);
    env.$.CreatePanel = create;
    env.Q.core.FeatureRegistry.enable(ID); env.clock.advance(250);
    assert.ok(env.shop.panel.FindChild("PurchaseFiltersContainer"));
    env.Q.core.FeatureRegistry.disable(ID); env.clock.advance(0);
    assert.equal(env.shop.panel.FindChild("PurchaseFiltersContainer"), null);
    assert.deepEqual(env.clock.errors, []);
});

test("a failed notification creation retries the purchase without retaining an orphan entry", () => {
    const env = fixture(); env.start();
    const create = env.$.CreatePanel;
    let rejected = false;
    env.$.CreatePanel = (type, parent, id, ...args) => {
        if (!rejected && type === "Label" && parent.BHasClass("quickItemInfo")) {
            rejected = true; throw new Error("native notification child creation rejected");
        }
        return create(type, parent, id, ...args);
    };
    const source = env.purchase(); env.clock.advance(250);
    assert.equal(rejected, true);
    assert.equal(env.entries().length, 0);
    env.clock.advance(250);
    assert.equal(env.entries().length, 1, "the purchase remains pending after failed creation");
    assert.equal(source.row.IsValid(), true);
    env.$.CreatePanel = create; env.stop(); assert.deepEqual(env.clock.errors, []);
});

test("notification expiry retains its fade while history remains native-owned", () => {
    const env = fixture({ RECENT_PURCHASES_QUICK_DISPLAY_SEC: 3, RECENT_PURCHASES_QUICK_MAX: 1 });
    env.start(); const source = env.purchase(); env.clock.advance(250);
    const entry = env.entries()[0];
    env.clock.advance(3000);
    assert.equal(entry.IsValid(), true); assert.equal(entry.BHasClass("quickFading"), true);
    env.clock.advance(500);
    assert.equal(entry.IsValid(), false); assert.equal(source.row.IsValid(), true);
    env.clock.advance(3000); assert.equal(env.entries().length, 0);
    env.stop(); env.clean();
});
