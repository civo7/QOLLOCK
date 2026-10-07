"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("the shop stacks below interactive abilities and the active build editor", () => {
    const shop = read("panorama/styles/citadel_hud_hero_shop.css");
    const builds = read("panorama/styles/citadel_hud_hero_builds.css");
    const global = read("panorama/styles/qollock_global.css");
    const hud = read("panorama/layout/hud.xml");
    const topBarBase = read("panorama/styles/base/citadel_hud_top_bar.css");

    const topBarLayer = Number(topBarBase.match(/CitadelHudTopBar\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);
    const shopLayer = Number(shop.match(/\.gShopOpen CitadelHudHeroShop\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);
    const abilitiesLayer = Number(global.match(/#AbilitiesContainer\.gShopOpen\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);
    const buildEditorLayer = Number(builds.match(/CitadelHudHeroBuilds\.gEditingBuilds\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);

    assert.ok(Number.isFinite(topBarLayer), "native top-bar layer must be readable");
    assert.ok(Number.isFinite(shopLayer), "open-shop layer must be declared");
    assert.ok(Number.isFinite(abilitiesLayer), "open-shop ability layer must be declared");
    assert.ok(Number.isFinite(buildEditorLayer), "active build-editor layer must be declared");
    assert.match(
        hud,
        /<Panel id="AbilitiesContainer"[^>]*>\s*<GlobalClassListener classes="[^"]*\bgShopOpen\b[^"]*"/,
        "ability container must receive the open-shop state"
    );
    assert.match(
        hud,
        /<CitadelHud\b[^>]*>\s*(?:<!--[^]*?-->\s*)*<GlobalClassListener classes="[^"]*\bgShopOpen\b[^"]*"/,
        "HUD root must receive the open-shop state for sibling layering"
    );
    assert.match(
        global,
        /CitadelHud\.gShopOpen #minimap_persp\s*\{[^}]*visibility:\s*collapse;/s,
        "a reparented draw-over-UI minimap must not cover the shop"
    );
    assert.ok(shopLayer > topBarLayer, "open shop must cover the top bar");
    assert.ok(abilitiesLayer > shopLayer, "abilities must remain hoverable above the open shop");
    assert.ok(buildEditorLayer > abilitiesLayer, "active build editor must remain above the abilities");
    assert.ok(buildEditorLayer > shopLayer, "active build editor must cover the shop");
});
