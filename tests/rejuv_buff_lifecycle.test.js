"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function exposeClassTokens(panel) {
    panel.GetClassTokens = () => panel.GetClasses().split(/\s+/).filter(Boolean);
    return panel;
}

test("rejuvenator capture timer stays visible while current native charges remain", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;

    const topBar = $.CreatePanel("Panel", hud.root, "TopBar");
    const gameTime = $.CreatePanel("Label", topBar, "GameTime");
    gameTime.text = "20:00";

    const charges = $.CreatePanel("Panel", topBar, "RejuvenatorCharges");
    const friendly = exposeClassTokens($.CreatePanel("Panel", charges, "RejuvenatorFriendly"));
    friendly.AddClass("RejuvCount_3");
    exposeClassTokens($.CreatePanel("Panel", friendly, "FriendlyRejuvIcon"));
    const timer = $.CreatePanel("Panel", charges, "RejuvenatorTimer");
    const enemy = exposeClassTokens($.CreatePanel("Panel", charges, "RejuvenatorEnemy"));
    enemy.AddClass("RejuvCount_0");

    const buff = $.CreatePanel("Panel", topBar, "RejuvBuff");
    const buffTime = $.CreatePanel("Label", buff, "RejuvTimeBuff");

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

    assert.equal(buff.style.opacity, "1.00");
    assert.equal(buff.BHasClass("pop-out"), true);
    assert.equal(buff.BHasClass("pop-in"), false);
    assert.equal(buffTime.text, "2:59");
    assert.deepEqual(hud.clock.errors, []);

    feature.onDisable();
});

test("rejuvenator charge helper retains the legacy class token", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    const panel = exposeClassTokens($.CreatePanel("Panel", hud.root, "LegacyRejuvCharges"));
    panel.AddClass("rejuv_charges_2");

    assert.equal(Q.getHighestRejuvChargeTokenOnPanel(panel), 2);
});
