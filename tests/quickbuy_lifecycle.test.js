"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { Sandbox } = require("../scripts/simulator/sandbox");
const { parseLayoutScripts } = require("../scripts/simulator/layout");

function setup(activeClass) {
    // hud_quickbuy.xml loads this script in its own context, without QOL globals.
    const sandbox = new Sandbox({ name: "quickbuy" });
    const $ = sandbox.global.$;
    const host = $.CreatePanel("Panel", sandbox.doc.root, "CitadelHudQuickbuy");
    const context = $.CreatePanel("Panel", host, "");
    $.GetContextPanel = () => context;
    if (activeClass) host.AddClass(activeClass);
    const total = $.CreatePanel("Label", context, "QuickbuyShopTotalCostLabel");
    const next = $.CreatePanel("Label", context, "QuickbuyNextSoulsNeededLabel");
    const queue = $.CreatePanel("Panel", context, "QuickbuyQueue");
    const layout = parseLayoutScripts(path.resolve(__dirname, "../panorama/layout/hud_quickbuy.xml"));
    assert.deepEqual(layout.missing, []);
    for (const script of layout.scripts) sandbox.load(script.absPath);
    assert.deepEqual(sandbox.loadErrors, []);
    return { sandbox, clock: sandbox.clock, $, host, context, total, next, queue };
}

for (const activeClass of [null, "enhanced_quickbuy_active", "shop_click_to_notify_active"]) {
    test(`quickbuy queue events retain one polling loop (${activeClass || "disabled"})`, () => {
        const env = setup(activeClass);
        // An event can arrive before the initial zero-delay callback too.
        env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
        env.clock.advance(0);
        assert.equal(env.clock.pendingCount(), 1);
        for (let i = 0; i < 20; i++) {
            env.clock.advance(75);
            env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
        }
        assert.equal(env.clock.pendingCount(), 1, "events must replace, not multiply, pending polls");
        env.sandbox.doc.root.AddClass("connectedToHideout");
        const before = env.clock.stats.fired;
        env.clock.advance(10000);
        assert.equal(env.clock.stats.fired - before, 20, "queue events must not accumulate background work");
        assert.equal(env.clock.pendingCount(), 1);
        assert.deepEqual(env.clock.errors, []);
        assert.deepEqual(env.sandbox.messages, []);
    });
}

for (const invalid of ["missing", "destroyed", "throwing"]) {
    for (const viaEvent of [false, true]) {
        test(`quickbuy stops on ${viaEvent ? "event" : "poll"} when its context is ${invalid}`, () => {
            const env = setup();
            env.clock.advance(0);
            if (invalid === "missing") env.$.GetContextPanel = () => null;
            if (invalid === "destroyed") {
                env.context.DeleteAsync(0);
                env.clock.advance(0);
            }
            if (invalid === "throwing") env.context.IsValid = () => { throw new Error("freed native handle"); };
            if (viaEvent) env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
            env.clock.advance(1000);
            assert.equal(env.clock.pendingCount(), 0);
            const before = env.clock.stats.fired;
            env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
            env.clock.advance(5000);
            assert.equal(env.clock.stats.fired, before, "late events must not restart a destroyed context");
            assert.deepEqual(env.clock.errors, []);
            assert.deepEqual(env.sandbox.messages, []);
        });
    }
}

test("quickbuy keeps immediate queue updates and passive soul polling", () => {
    const env = setup("enhanced_quickbuy_active");
    const gold = env.$.CreatePanel("Panel", env.sandbox.doc.root, "CurrentGoldAmount");
    const souls = env.$.CreatePanel("Label", gold, "hudCurGoldLabel");
    souls.text = "100";
    env.clock.advance(0);
    const item = env.$.CreatePanel("Panel", env.queue, "");
    item.AddClass("QuickbuyItem");
    env.$.CreatePanel("Label", item, "ModCost").text = "500";
    env.$.CreatePanel("Label", item, "ModName").text = "Test item";
    env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
    assert.equal(env.total.text, "500", "event refresh stays synchronous");
    assert.equal(env.next.text, "400");
    souls.text = "200";
    env.clock.advance(500);
    assert.equal(env.next.text, "300", "passive souls still refresh without a queue event");
    item.DeleteAsync(0);
    env.clock.advance(0);
    env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
    assert.equal(env.total.text, "0");
    assert.equal(env.next.text, "0");
    assert.equal(env.clock.pendingCount(), 1);
    assert.deepEqual(env.clock.errors, []);
    assert.deepEqual(env.sandbox.messages, []);
});
