"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function createCaptureHarness() {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const topBar = $.CreatePanel("Panel", hud.root, "TopBar");
    const gameTime = $.CreatePanel("Label", topBar, "GameTime");
    gameTime.text = "20:00";

    const charges = $.CreatePanel("Panel", topBar, "RejuvenatorCharges");
    const friendly = $.CreatePanel("Panel", charges, "RejuvenatorFriendly");
    friendly.AddClass("RejuvCount_3");
    $.CreatePanel("Panel", friendly, "FriendlyRejuvIcon");
    const timer = $.CreatePanel("Panel", charges, "RejuvenatorTimer");
    const enemy = $.CreatePanel("Panel", charges, "RejuvenatorEnemy");
    enemy.AddClass("RejuvCount_0");

    const buff = $.CreatePanel("Panel", topBar, "RejuvBuff");
    const buffTime = $.CreatePanel("Label", buff, "RejuvTimeBuff");

    assert.equal(typeof friendly.GetClassTokens, "undefined");
    assert.equal(Array.from(Q.getPanelClassTokens(friendly)).join(" "), "RejuvCount_3");
    assert.equal(Q.getHighestRejuvChargeTokenOnPanel(friendly), 3);

    const feature = Q.core.FeatureRegistry.getManifest("ql_rejuv_hud").create({
        config: { view: () => ({ ENABLE_BUFF_HUD: 1 }) }
    });
    feature.onEnable();
    // The native charge panels use the feature's deliberately backed-off lookup.
    hud.clock.advance(6500);

    timer.AddClass("has_rejuv");
    hud.clock.advance(500);
    gameTime.text = "20:01";
    hud.clock.advance(1200);

    return { hud, Q, gameTime, friendly, timer, buff, buffTime, feature };
}

test("rejuvenator capture timer stays visible while native charges remain", () => {
    const { hud, buff, buffTime, feature } = createCaptureHarness();

    assert.equal(buff.style.opacity, "1.00");
    assert.equal(buff.BHasClass("pop-out"), true);
    assert.equal(buff.BHasClass("pop-in"), false);
    assert.equal(buffTime.text, "2:59");

    assert.deepEqual(hud.clock.errors, []);

    feature.onDisable();
});

test("rejuvenator capture timer ends early when native charges reach zero", () => {
    const { hud, gameTime, friendly, timer, buff, feature } = createCaptureHarness();

    friendly.RemoveClass("RejuvCount_3");
    friendly.AddClass("RejuvCount_0");
    timer.RemoveClass("has_rejuv");
    gameTime.text = "20:02";
    hud.clock.advance(1200);

    assert.equal(buff.style.opacity, "0.00");
    assert.equal(buff.BHasClass("pop-out"), false);
    assert.equal(buff.BHasClass("pop-in"), true);
    assert.deepEqual(hud.clock.errors, []);

    feature.onDisable();
});

test("rejuvenator capture timer ends after 180 seconds while charges remain", () => {
    const { hud, gameTime, buff, feature } = createCaptureHarness();

    gameTime.text = "23:00";
    hud.clock.advance(1200);

    assert.equal(buff.style.opacity, "0.00");
    assert.equal(buff.BHasClass("pop-out"), false);
    assert.deepEqual(hud.clock.errors, []);

    feature.onDisable();
});

test("rejuvenator charge helper retains the legacy class token", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    const panel = $.CreatePanel("Panel", hud.root, "LegacyRejuvCharges");
    panel.AddClass("rejuv_charges_2");

    assert.equal(Q.getHighestRejuvChargeTokenOnPanel(panel), 2);
});
