"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("shop item modifier rows retain the native full-width layout", () => {
    const css = read("panorama/styles/citadel_ui_modified_stats_panel.css");

    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/citadel_ui_modified_stats_panel\.vcss_c"\);/);
    assert.doesNotMatch(css, /\.gShopOpen \.Affected(?:Ability|Item|Stat)/);
    assert.doesNotMatch(css, /\.gShopOpen #SpiritImpactContainer/);
    assert.match(css, /\.gScoreboardOpen \.AffectedAbility,[^{]+\{[^}]*width:\s*100%;[^}]*height:\s*fit-children;[^}]*flow-children:\s*right;/s);
});
