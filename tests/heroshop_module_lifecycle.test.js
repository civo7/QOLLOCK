"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

const appearance = ["simplify_shop_stats_active", "simplify_shop_active", "simplify_items_active",
    "disable_shop_blue_active", "shop_recent_purchases_active"];
const baseline = { HUD_SHOP_ENABLED: 1, SHOP_OFFSET_X: 0, SHOP_OFFSET_Y: 0, SHOP_OPACITY: 1, SHOP_SCALE: 1,
    ENABLE_SIMPLIFY_SHOP: 0, ENABLE_SIMPLIFY_ITEMS: 0, DISABLE_SHOP_BLUE: 0,
    ENABLE_SHOP_STATS: 1, ENABLE_SIMPLIFY_SHOP_STATS: 0, ENABLE_SHOP_RECENT_PURCHASES: 0 };

function fixture({ missing = false } = {}) {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.FeatureRegistry.disable("ql_heroshop");
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    const orphan = add(env.root, "RetiredShopGeneration");
    env.game.shopPanel.SetParent(orphan);
    const core = add(env.root, ""); core.AddClass("HudCore");
    const mount = () => {
        const shop = add(core, "CitadelHudHeroShop", "CitadelHudHeroShop");
        const body = add(shop, "Shop");
        const main = add(body, "MainPanel");
        const nav = add(body, "NavPanel");
        const hero = add(nav, "HeroScenePanel");
        const nativeContent = add(main, "ShopModsContainer");
        return { shop, body, main, nav, hero, nativeContent };
    };
    const initial = missing ? {} : mount();
    const configure = values => Q.core.ConfigAdapter.loadFromFlat(values);
    configure(baseline);
    const enable = () => {
        Q.core.FeatureRegistry.enable("ql_heroshop");
        assert.equal(Q.core.FeatureRegistry.isEnabled("ql_heroshop"), true);
    };
    const clean = () => {
        Q.core.FeatureRegistry.disable("ql_heroshop");
        env.clock.advance(1);
        assert.deepEqual(env.clock.errors, []);
    };
    return { ...env, ...initial, Q, $, add, orphan, core, mount, configure, enable, clean };
}

function onceFailStyle(panel, property) {
    const style = panel.style;
    let attempts = 0;
    panel.style = new Proxy(style, { set(target, key, value) {
        if (key === property && attempts++ === 0) throw new Error("modeled transient native style failure");
        target[key] = value;
        return true;
    } });
    return () => attempts;
}

test("shop defaults preserve native animation and layout, including simplified CSS margins", () => {
    const e = fixture();
    const native = { x: "native opening position", y: "native closing position",
        preTransformScale2d: "native animation scale", transform: "native content transition" };
    Object.assign(e.main.style, native);
    Object.assign(e.nativeContent.style, { uiScale: "native content scale", opacity: "native content opacity" });
    e.enable();
    for (const [key, value] of Object.entries(native)) assert.equal(e.main.style[key], value);
    for (const property of ["marginLeft", "marginRight", "marginTop", "marginBottom", "uiScale", "opacity", "visibility"]) {
        assert.equal(e.main.style[property], undefined, `${property} remains native/CSS-owned`);
    }
    e.configure({ ENABLE_SIMPLIFY_SHOP: 1 });
    assert.equal(e.shop.BHasClass("simplify_shop_active"), true);
    assert.equal(e.main.style.marginLeft, undefined, "simplified shop's CSS margin is not replaced with 0px");
    assert.equal(e.nativeContent.style.uiScale, "native content scale");
    assert.equal(e.nativeContent.style.opacity, "native content opacity");
    assert.equal(e.main.GetParent(), e.body);
    assert.equal(e.nav.GetParent(), e.body);
    assert.equal(e.hero.GetParent(), e.nav);
    e.clean();
    for (const [key, value] of Object.entries(native)) assert.equal(e.main.style[key], value);
});

test("shop offsets, scale, opacity and visibility react while the shop is closed or hidden", () => {
    const e = fixture(); e.enable();
    e.shop.AddClass("qol-hidden");
    e.configure({ SHOP_OFFSET_X: 125, SHOP_OFFSET_Y: -45, SHOP_SCALE: 1.25, SHOP_OPACITY: 0.4,
        HUD_SHOP_ENABLED: 0, ENABLE_SIMPLIFY_SHOP: 1, ENABLE_SIMPLIFY_ITEMS: 1,
        DISABLE_SHOP_BLUE: 1, ENABLE_SHOP_STATS: 1, ENABLE_SIMPLIFY_SHOP_STATS: 1,
        ENABLE_SHOP_RECENT_PURCHASES: 1 });
    assert.equal(e.main.style.marginLeft, "125px");
    assert.equal(e.main.style.marginRight, "-125px");
    assert.equal(e.main.style.marginTop, "45px");
    assert.equal(e.main.style.marginBottom, "-45px");
    assert.equal(e.main.style.uiScale, "125%");
    assert.equal(e.main.style.opacity, "0.40");
    assert.equal(e.main.style.visibility, "collapse");
    assert.equal(e.main.BHasClass("qol-hidden"), true);
    for (const name of appearance) assert.equal(e.shop.BHasClass(name), true, name);
    e.configure({ HUD_SHOP_ENABLED: 1, SHOP_SCALE: 0.75, ENABLE_SHOP_STATS: 0 });
    assert.equal(e.main.style.visibility, undefined);
    assert.equal(e.main.BHasClass("qol-hidden"), false);
    assert.equal(e.main.style.uiScale, "75%");
    assert.equal(e.shop.BHasClass("simplify_shop_stats_active"), false);
    assert.equal(e.shop.BHasClass("qol-hidden"), true, "native shop-root visibility remains with its existing owner");
    e.clean();
});

test("shop root projection retains hero scene and quickbuy settings without replacing companion content", () => {
    const e = fixture();
    const quickbuy = e.add(e.core, "CitadelHudQuickbuy", "CitadelHudQuickbuy");
    const queue = e.add(quickbuy, "QuickbuyQueue");
    const item = e.add(queue, "QueuedNativeItem");
    e.enable();
    e.configure({ SUPPORT_4_3: 1, ENABLE_HIDE_AMMO_ALL: 1, ENABLE_HERO_SCENE_PANEL: 1,
        ENABLE_ENHANCED_QUICKBUY: 1, DISABLE_QUICK_BUY: 0,
        ENHANCED_QUICKBUY_COUNT: 5, ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 1 });
    const exported = e.Q.core.ConfigAdapter.exportToFlat();
    assert.equal(exported.ENABLE_ENHANCED_QUICKBUY, 1, "existing enhanced mode survives complete config load/export");
    assert.equal(exported.ENHANCED_QUICKBUY_COUNT, 5);
    assert.equal(exported.ENABLE_QUICKBUY_CLICK_TO_NOTIFY, 1);
    for (const name of ["support_4_3_active", "hide_current_ammo_active", "hero_scene_panel_visible",
        "enhanced_quickbuy_active", "shop_click_to_notify_active"]) assert.equal(e.root.BHasClass(name), true, name);
    assert.equal(e.root.GetAttributeInt("qol_enhanced_quickbuy_count", 0), 5);
    assert.equal(quickbuy.GetAttributeInt("qol_enhanced_quickbuy_count", 0), 5);
    assert.equal(item.GetParent(), queue, "the shop owner preserves native quickbuy content");
    e.configure({ DISABLE_QUICK_BUY: 1, ENABLE_HERO_SCENE_PANEL: 0, ENABLE_SHOP_STATS: 0 });
    assert.equal(e.root.BHasClass("disable_quick_buy_active"), true);
    assert.equal(e.root.BHasClass("enhanced_quickbuy_active"), false);
    assert.equal(e.root.BHasClass("shop_click_to_notify_active"), false);
    assert.equal(e.root.BHasClass("hero_scene_panel_visible"), false);
    assert.equal(e.root.BHasClass("shop_stats_disabled"), true);
    assert.equal(e.hero.GetParent(), e.nav);
    e.clean();
});

test("shop discovery binds late verified sources and bounds missing-source tree searches", () => {
    const e = fixture({ missing: true });
    // The simulator's old owner is detached from the live HUD search subtree.
    e.orphan.SetParent(null);
    let searches = 0;
    const traverse = e.root.FindChildTraverse;
    e.root.FindChildTraverse = function(id) {
        if (id === "CitadelHudHeroShop") searches++;
        return traverse.call(this, id);
    };
    e.configure({ SHOP_OFFSET_X: 90, HUD_SHOP_ENABLED: 0 });
    e.enable();
    e.clock.advance(6500);
    assert.ok(searches >= 2 && searches <= 5, `bounded discovery performed ${searches} full searches`);
    const current = e.mount();
    e.clock.advance(1200);
    assert.equal(current.main.style.marginLeft, "90px");
    assert.equal(current.main.BHasClass("qol-hidden"), true);
    const stableSearches = searches;
    e.clock.advance(6000);
    assert.equal(searches, stableSearches, "verified live breadcrumbs need no full-HUD traversal");
    e.clean();
});

test("shop releases living replaced owners and independent MainPanel generations", () => {
    const e = fixture(); e.enable();
    e.configure({ SHOP_OFFSET_X: 80, SHOP_SCALE: 1.2, SHOP_OPACITY: 0.6,
        ENABLE_SIMPLIFY_SHOP: 1, ENABLE_SIMPLIFY_ITEMS: 1, HUD_SHOP_ENABLED: 0 });
    e.main.style.transform = "native main transition";
    e.main.SetParent(e.orphan);
    const main = e.add(e.body, "MainPanel");
    e.clock.advance(1200);
    assert.equal(main.style.marginLeft, "80px");
    assert.equal(main.style.uiScale, "120%");
    assert.equal(main.BHasClass("qol-hidden"), true);
    for (const key of ["marginLeft", "marginRight", "uiScale", "opacity", "visibility"]) assert.equal(e.main.style[key], undefined);
    assert.equal(e.main.BHasClass("qol-hidden"), false);
    assert.equal(e.main.style.transform, "native main transition");
    e.shop.SetParent(e.orphan);
    const next = e.mount();
    e.clock.advance(1200);
    assert.equal(e.shop.IsValid(), true, "previous native content is preserved");
    assert.equal(e.shop.BHasClass("simplify_shop_active"), false);
    assert.equal(e.shop.BHasClass("simplify_items_active"), false);
    assert.equal(main.style.marginLeft, undefined);
    assert.equal(next.main.style.marginLeft, "80px");
    assert.equal(next.main.style.opacity, "0.60");
    assert.equal(next.shop.BHasClass("simplify_shop_active"), true);
    assert.equal(next.main.GetParent(), next.body);
    e.clean();
    assert.equal(next.main.style.uiScale, undefined);
    assert.equal(next.main.BHasClass("qol-hidden"), false);
    assert.equal(next.shop.BHasClass("simplify_shop_active"), false);
});

test("shop native partial writes and externally cleared owned classes retry without settings changes", () => {
    const e = fixture(); e.enable();
    const attempts = onceFailStyle(e.main, "uiScale");
    let classAttempts = 0;
    const setClass = e.shop.SetHasClass;
    e.shop.SetHasClass = function(name, value) {
        if (name === "simplify_shop_active" && value && classAttempts++ === 0) throw new Error("modeled transient class failure");
        return setClass.call(this, name, value);
    };
    e.configure({ SHOP_SCALE: 1.3, SHOP_OFFSET_X: 50, ENABLE_SIMPLIFY_SHOP: 1 });
    assert.equal(e.main.style.uiScale, undefined);
    assert.equal(e.main.style.marginLeft, "50px", "successful portions can apply before the retry");
    e.clock.advance(1200);
    assert.ok(attempts() >= 2);
    assert.ok(classAttempts >= 2);
    assert.equal(e.main.style.uiScale, "130%");
    assert.equal(e.shop.BHasClass("simplify_shop_active"), true);
    e.shop.RemoveClass("simplify_shop_active");
    e.clock.advance(1200);
    assert.equal(e.shop.BHasClass("simplify_shop_active"), true, "native class removal does not poison a private signature");
    e.clean();
});

test("shop source replacement retries failed release and does not rewrite stable layout each poll", () => {
    const e = fixture(); e.enable();
    let writes = 0;
    const style = e.main.style;
    e.main.style = new Proxy(style, { set(target, key, value) { writes++; target[key] = value; return true; } });
    e.configure({ SHOP_OFFSET_X: 55, SHOP_SCALE: 1.15 });
    const appliedWrites = writes;
    e.clock.advance(5500);
    assert.equal(writes, appliedWrites, "unchanged model and owner reuse the successful native signature");
    const clear = e.main.ClearPropertyFromCode;
    let releaseAttempts = 0;
    e.main.ClearPropertyFromCode = function(name) {
        if (name === "margin-left" && releaseAttempts++ < 2) return false;
        return clear.call(this, name);
    };
    e.body.SetParent(e.orphan);
    const body = e.add(e.shop, "Shop"), main = e.add(body, "MainPanel");
    e.clock.advance(1200);
    assert.equal(main.style.marginLeft, "55px");
    assert.equal(main.style.uiScale, "115%");
    e.clock.advance(1200);
    assert.ok(releaseAttempts >= 3);
    assert.equal(e.main.style.marginLeft, undefined, "retired living owner remains tracked until native cleanup succeeds");
    assert.equal(e.main.style.uiScale, undefined);
    assert.equal(e.body.IsValid(), true, "only owned presentation changes are released");
    e.clean();
});

test("shop restores native defaults and retries a transient ClearPropertyFromCode failure", () => {
    const e = fixture(); e.enable();
    e.configure({ SHOP_OFFSET_X: 60, SHOP_OFFSET_Y: 25, SHOP_SCALE: 0.8, SHOP_OPACITY: 0.5 });
    const clear = e.main.ClearPropertyFromCode;
    let clears = 0;
    e.main.ClearPropertyFromCode = function(name) {
        if (name === "margin-left" && clears++ === 0) return false;
        return clear.call(this, name);
    };
    e.configure(baseline);
    assert.equal(e.main.style.marginLeft, "60px", "failed cleanup remains pending");
    e.clock.advance(1200);
    assert.ok(clears >= 2);
    for (const property of ["marginLeft", "marginRight", "marginTop", "marginBottom", "uiScale", "opacity"]) {
        assert.equal(e.main.style[property], undefined, `${property} is restored through native clearing`);
    }
    e.clean();
});

test("shop transition bursts share one deferred refresh and shutdown cancels owned work", () => {
    const e = fixture(); e.enable();
    e.configure({ SHOP_OFFSET_X: 70, ENABLE_SIMPLIFY_SHOP: 1 });
    const work = () => e.Q.core.Scheduler.getWorkSnapshot().find(row => row.id === "ql_heroshop");
    for (let i = 0; i < 25; i++) {
        e.Q.core.EventBus.emit("engine:shop_opened");
        e.Q.core.EventBus.emit("engine:shop_closed");
    }
    assert.deepEqual(JSON.parse(JSON.stringify(work())), { id: "ql_heroshop", polls: 1, once: 1 });
    e.clean();
    assert.equal(work(), undefined);
    assert.equal(e.main.style.marginLeft, undefined);
    for (let i = 0; i < 10; i++) e.Q.core.EventBus.emit("engine:shop_opened");
    e.clock.advance(3000);
    assert.equal(work(), undefined);
    assert.equal(e.main.style.marginLeft, undefined, "retired callbacks cannot reapply shop styles");
    e.enable();
    assert.equal(e.main.style.marginLeft, "70px");
    assert.equal(e.shop.BHasClass("simplify_shop_active"), true);
    assert.deepEqual(JSON.parse(JSON.stringify(work())), { id: "ql_heroshop", polls: 1, once: 0 });
    e.clean();
});

test("shop failed enable releases a partly styled native generation and subscriptions", () => {
    const e = fixture();
    e.configure({ SHOP_OFFSET_X: 40, SHOP_SCALE: 1.2, HUD_SHOP_ENABLED: 0, ENABLE_SIMPLIFY_SHOP: 1 });
    e.Q.core.FeatureRegistry.disable("ql_heroshop");
    const createLoop = e.Q.core.Scheduler.createPollLoop;
    e.Q.core.Scheduler.createPollLoop = function(callback, seconds, id) {
        if (id === "ql_heroshop") throw new Error("modeled scheduler failure after native styling");
        return createLoop(callback, seconds, id);
    };
    e.Q.core.FeatureRegistry.enable("ql_heroshop");
    e.Q.core.Scheduler.createPollLoop = createLoop;
    assert.equal(e.Q.core.FeatureRegistry.isEnabled("ql_heroshop"), false);
    assert.equal(e.main.style.marginLeft, undefined);
    assert.equal(e.main.style.uiScale, undefined);
    assert.equal(e.main.style.visibility, undefined);
    assert.equal(e.main.BHasClass("qol-hidden"), false);
    assert.equal(e.shop.BHasClass("simplify_shop_active"), false);
    e.Q.core.EventBus.emit("engine:shop_opened");
    e.clock.advance(1);
    assert.equal(e.Q.core.Scheduler.getWorkSnapshot().some(row => row.id === "ql_heroshop"), false);
    e.enable();
    assert.equal(e.main.style.marginLeft, "40px");
    e.clean();
});
