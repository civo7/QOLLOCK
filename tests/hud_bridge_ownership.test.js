"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function fixture() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"),
        ENABLE_ENHANCED_QUICKBUY: 1, ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 1, ENHANCED_QUICKBUY_COUNT: 5, DISABLE_QUICK_BUY: 0,
        ENABLE_COLORED_HEALTHBAR: 1, ENABLE_COLOR_WARNING_25: 1 });
    const add = (parent, id, classes = []) => {
        const panel = $.CreatePanel("Panel", parent, id);
        for (const cls of classes) panel.AddClass(cls);
        return panel;
    };
    const core = add(env.root, "", ["HudCore"]);
    const stats = add(core, "StatsAndModsContainer"), left = add(stats, "LowerLeft"), gameplay = add(core, "gameplay_hud");
    const mountQuickbuy = () => add(left, "CitadelHudQuickbuy");
    const mountHealth = () => add(gameplay, "health_and_abilities_container");
    const retired = add(null, "RetiredBridgeGeneration");
    const refresh = () => Q.core.hud.refreshRootClasses(env.root);
    return { ...env, Q, $, add, left, gameplay, mountQuickbuy, mountHealth, retired, refresh };
}

test("HUD bridge projection releases living retired hosts and applies unchanged settings to replacements", () => {
    const e = fixture(), quickbuy = e.mountQuickbuy(), health = e.mountHealth();
    const content = e.add(quickbuy, "NativeQueueEntry");
    quickbuy.style.opacity = "native animated opacity";
    e.refresh();
    assert.equal(quickbuy.BHasClass("enhanced_quickbuy_active"), true);
    assert.equal(quickbuy.BHasClass("shop_click_to_notify_active"), true);
    assert.equal(quickbuy.GetAttributeInt("qol_enhanced_quickbuy_count", 0), 5);
    assert.equal(health.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "1");
    quickbuy.SetParent(e.retired); health.SetParent(e.retired);
    const nextQuickbuy = e.mountQuickbuy(), nextHealth = e.mountHealth();
    e.refresh();
    assert.equal(quickbuy.IsValid(), true);
    assert.equal(quickbuy.BHasClass("enhanced_quickbuy_active"), false);
    assert.equal(quickbuy.BHasClass("shop_click_to_notify_active"), false);
    assert.equal(quickbuy.GetAttributeString("qol_enhanced_quickbuy_count", ""), "");
    assert.equal(health.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "");
    assert.equal(nextQuickbuy.GetAttributeInt("qol_enhanced_quickbuy_count", 0), 5);
    assert.equal(nextHealth.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "1");
    assert.equal(quickbuy.style.opacity, "native animated opacity");
    assert.equal(content.GetParent() === quickbuy, true);
    assert.equal(e.Q.getCachedPanel("quickbuy") === nextQuickbuy, true);
    assert.equal(e.Q.getCachedPanel("healthContainer") === nextHealth, true);
});

test("HUD bridge values retry rejected writes even when root settings signatures are unchanged", () => {
    const e = fixture(), quickbuy = e.mountQuickbuy(), health = e.mountHealth();
    const reject = (panel, name) => {
        const write = panel.SetAttributeString;
        let attempts = 0;
        panel.SetAttributeString = function(attr, value) {
            if (attr === name && attempts++ === 0) throw new Error("modeled pending native bridge");
            return write.call(this, attr, value);
        };
        return () => attempts;
    };
    const quickWrites = reject(quickbuy, "qol_enhanced_quickbuy_count");
    const colorWrites = reject(health, "QOL_COLORED_HEALTHBAR");
    e.refresh();
    assert.equal(health.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "");
    assert.equal(quickbuy.GetAttributeString("qol_enhanced_quickbuy_count", ""), "");
    e.refresh();
    assert.equal(quickWrites(), 2); assert.equal(colorWrites(), 2);
    assert.equal(health.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "1");
    assert.equal(quickbuy.GetAttributeInt("qol_enhanced_quickbuy_count", 0), 5);
    const applied = [quickWrites(), colorWrites()];
    e.refresh();
    assert.deepEqual([quickWrites(), colorWrites()], applied, "stable native values avoid redundant writes");
    quickbuy.RemoveClass("enhanced_quickbuy_active"); e.refresh();
    assert.equal(quickbuy.BHasClass("enhanced_quickbuy_active"), true);
});

test("HUD bridge retirement retries failed clears independently of the current host", () => {
    const e = fixture(), quickbuy = e.mountQuickbuy(), health = e.mountHealth(); e.refresh();
    const write = health.SetAttributeString;
    let clears = 0;
    health.SetAttributeString = function(attr, value) {
        if (attr === "QOL_COLORED_HEALTHBAR" && value === "" && clears++ === 0) throw new Error("old host temporarily rejects clear");
        return write.call(this, attr, value);
    };
    health.SetParent(e.retired); quickbuy.SetParent(e.retired);
    const next = e.mountHealth(); e.mountQuickbuy(); e.refresh();
    assert.equal(health.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "1");
    assert.equal(next.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "1");
    e.refresh();
    assert.equal(clears, 2);
    assert.equal(health.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "");
    assert.equal(next.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "1");
});

test("HUD bridge projection publishes root quickbuy settings before a late queue is available", () => {
    const e = fixture(); e.refresh();
    assert.equal(e.root.GetAttributeInt("qol_enhanced_quickbuy_count", 0), 5);
    const quickbuy = e.mountQuickbuy(), health = e.mountHealth();
    e.clock.advance(1200); e.refresh();
    assert.equal(quickbuy.GetAttributeInt("qol_enhanced_quickbuy_count", 0), 5);
    assert.equal(health.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "1");
    e.Q.core.ConfigAdapter.loadFromFlat({ DISABLE_QUICK_BUY: 1, ENABLE_COLORED_HEALTHBAR: 0,
        ENABLE_COLOR_WARNING_25: 0, ENABLE_COLOR_WARNING_65: 0, ENABLE_COLOR_WARNING_75: 0 });
    e.refresh();
    assert.equal(quickbuy.BHasClass("enhanced_quickbuy_active"), false);
    assert.equal(quickbuy.BHasClass("shop_click_to_notify_active"), false);
    assert.equal(quickbuy.GetAttributeInt("qol_enhanced_quickbuy_count", 0), 3);
    assert.equal(health.GetAttributeString("QOL_COLORED_HEALTHBAR", ""), "0");
});
