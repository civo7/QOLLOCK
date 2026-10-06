"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("4:3 overrides adapt current native geometry without restoring stale fixed layouts", () => {
    const feature = read("panorama/styles/features/ql_feat_aspect_ratio.css");
    const shop = read("panorama/styles/citadel_hud_hero_shop.css");
    const builds = read("panorama/styles/citadel_hud_hero_builds.css");
    const abilityOrder = read("panorama/styles/citadel_ui_ability_order.css");

    assert.match(feature, /\.support_4_3_active #health_and_abilities_container\s*\{[^}]*margin-left:\s*0px;[^}]*margin-right:\s*960px;/s);
    assert.doesNotMatch(feature, /\.support_4_3_active #Shop/);
    assert.doesNotMatch(feature, /width:\s*1350px/);
    assert.doesNotMatch(feature, /margin-left:\s*150px/);

    assert.match(shop, /\.support_4_3_active #Shop\s*\{[^}]*margin-right:\s*0px;/s);
    assert.doesNotMatch(shop, /width:\s*1350px/);
    assert.match(builds, /\.support_4_3_active \.BuildEditSection\s*\{[^}]*width:\s*220px;/s);
    assert.match(abilityOrder, /\.support_4_3_active \.gEditingBuilds #AbilityBuildContainer\s*\{[^}]*ui-scale:\s*88%;/s);
    assert.doesNotMatch(abilityOrder, /width:\s*450px/);
});
