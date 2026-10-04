"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("the shop stacks above the top bar and below the active build editor", () => {
    const shop = read("panorama/styles/citadel_hud_hero_shop.css");
    const builds = read("panorama/styles/citadel_hud_hero_builds.css");
    const topBarBase = read("panorama/styles/base/citadel_hud_top_bar.css");

    const topBarLayer = Number(topBarBase.match(/CitadelHudTopBar\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);
    const shopLayer = Number(shop.match(/\.gShopOpen CitadelHudHeroShop\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);
    const buildEditorLayer = Number(builds.match(/CitadelHudHeroBuilds\.gEditingBuilds\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);

    assert.ok(Number.isFinite(topBarLayer), "native top-bar layer must be readable");
    assert.ok(Number.isFinite(shopLayer), "open-shop layer must be declared");
    assert.ok(Number.isFinite(buildEditorLayer), "active build-editor layer must be declared");
    assert.ok(shopLayer > topBarLayer, "open shop must cover the top bar");
    assert.ok(buildEditorLayer > shopLayer, "active build editor must cover the shop");
});
