"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("the open shop stacks above the native top bar", () => {
    const shop = read("panorama/styles/citadel_hud_hero_shop.css");
    const topBarBase = read("panorama/styles/base/citadel_hud_top_bar.css");

    assert.match(topBarBase, /CitadelHudTopBar\s*\{[^}]*z-index:\s*10;/s);
    assert.match(shop, /\.gShopOpen CitadelHudHeroShop\s*\{[^}]*z-index:\s*20;/s);
});
