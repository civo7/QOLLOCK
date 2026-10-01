"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function addLegacyTeam($, teams, id, className, values) {
    const team = $.CreatePanel("Panel", teams, id);
    team.AddClass(className);
    for (let i = 0; i < values.length; i++) {
        const label = $.CreatePanel("Label", team, `${id}Gold${i}`);
        label.AddClass("hiddenGoldValue");
        label.text = values[i];
    }
}

test("urn tracker reads current native team networth labels before legacy player totals", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const topBar = $.CreatePanel("Panel", hud.root, "TopBar");
    const networth = $.CreatePanel("Panel", topBar, "TeamNetworthPanel");
    networth.AddClass("TeamNetworth");

    const friendly = $.CreatePanel("Panel", networth, "TeamScoreFriendly");
    const friendlyLabel = $.CreatePanel("Label", friendly, "FriendlyScoreLabel");
    friendlyLabel.AddClass("ScoreLabel");
    friendlyLabel.text = "3<span class=\"demote\">.0k</span>";

    const enemy = $.CreatePanel("Panel", networth, "TeamScoreEnemy");
    const enemyLabel = $.CreatePanel("Label", enemy, "EnemyScoreLabel");
    enemyLabel.AddClass("ScoreLabel");
    enemyLabel.text = "2,000";

    // Deliberately contradictory legacy values prove that the current native
    // team totals are the authoritative source when both are present.
    const teams = $.CreatePanel("Panel", topBar, "TeamsContainer");
    addLegacyTeam($, teams, "TeamFriendly", "team1", ["100"]);
    addLegacyTeam($, teams, "TeamEnemy", "team2", ["900"]);

    let result = Q.core.hud.computeUrnTrackerState(hud.root, 1000);
    assert.deepEqual(
        { friendlyVal: result.friendlyVal, enemyVal: result.enemyVal, display: result.display, mood: result.mood },
        { friendlyVal: 3000, enemyVal: 2000, display: "+33.3%", mood: "good" }
    );

    friendlyLabel.text = "1.5k";
    enemyLabel.text = "3k";
    result = Q.core.hud.computeUrnTrackerState(hud.root, 2000);
    assert.deepEqual(
        { friendlyVal: result.friendlyVal, enemyVal: result.enemyVal, display: result.display, mood: result.mood },
        { friendlyVal: 1500, enemyVal: 3000, display: "-50.0%", mood: "bad" }
    );
    assert.deepEqual(hud.clock.errors, []);
});

test("urn tracker retains the legacy per-player gold fallback", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const topBar = $.CreatePanel("Panel", hud.root, "TopBar");
    const teams = $.CreatePanel("Panel", topBar, "TeamsContainer");
    addLegacyTeam($, teams, "TeamFriendly", "friend", ["1,000", "2,000"]);
    addLegacyTeam($, teams, "TeamEnemy", "enemy", ["1,000", "1,000"]);

    const result = Q.core.hud.computeUrnTrackerState(hud.root, 1000);
    assert.deepEqual(
        { friendlyVal: result.friendlyVal, enemyVal: result.enemyVal, display: result.display },
        { friendlyVal: 3000, enemyVal: 2000, display: "+33.3%" }
    );
    assert.deepEqual(hud.clock.errors, []);
});

test("urn tracker reapplies an unchanged result to a replaced overlay", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const topBar = $.CreatePanel("Panel", hud.root, "TopBar");
    const networth = $.CreatePanel("Panel", topBar, "TeamNetworthPanel");
    networth.AddClass("TeamNetworth");
    const friendly = $.CreatePanel("Panel", networth, "TeamScoreFriendly");
    const friendlyLabel = $.CreatePanel("Label", friendly, "FriendlyScoreLabel");
    friendlyLabel.AddClass("ScoreLabel");
    friendlyLabel.text = "3k";
    const enemy = $.CreatePanel("Panel", networth, "TeamScoreEnemy");
    const enemyLabel = $.CreatePanel("Label", enemy, "EnemyScoreLabel");
    enemyLabel.AddClass("ScoreLabel");
    enemyLabel.text = "2k";

    Q.core.hud.updateUrnTrackerOverlay(hud.root, { ENABLE_URN_DIFF: 1 }, 1000);
    const first = hud.root.FindChildTraverse("UrnTracker");
    assert.equal(first.FindChildTraverse("UrnTrackerLabel").text, "+33.3%");

    first.DeleteAsync(0);
    hud.clock.advance(1);
    Q.core.hud.updateUrnTrackerOverlay(hud.root, { ENABLE_URN_DIFF: 1 }, 2000);
    const replacement = hud.root.FindChildTraverse("UrnTracker");
    assert.notEqual(replacement, first);
    assert.equal(replacement.FindChildTraverse("UrnTrackerLabel").text, "+33.3%");
    assert.deepEqual(hud.clock.errors, []);
});

test("urn tracker hidden fallback follows the current string gold binding", () => {
    const layoutPath = path.join(__dirname, "..", "panorama", "layout", "citadel_hud_top_bar_player.xml");
    const layout = fs.readFileSync(layoutPath, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const tag = layout.match(/<Label\b(?=[^>]*\bid="HiddenGoldValue")[^>]*>/)?.[0] || "";

    assert.match(tag, /\bclass="[^"]*\bhiddenGoldValue\b[^"]*"/);
    assert.match(tag, /\bhtml="true"/);
    assert.match(tag, /\btext="\{s:gold\}"/);
});
