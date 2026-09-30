"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

function ruleBody(css, selector) {
    const selectorStart = css.indexOf(selector);
    assert.ok(selectorStart >= 0, `missing selector: ${selector}`);
    const bodyStart = css.indexOf("{", selectorStart);
    const bodyEnd = css.indexOf("}", bodyStart);
    assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, `missing rule body: ${selector}`);
    return css.slice(bodyStart + 1, bodyEnd);
}

test("shop layout exposes the current catalog surfaces and navigation tabs", () => {
    const layout = read("panorama/layout/citadel_hud_hero_shop.xml");
    for (const id of ["ShopModsSelectedBuild", "ShopModsFiltered", "ShopModsRecommended", "ShopFilters"]) {
        assert.match(layout, new RegExp(`id="${id}"`));
    }
    for (const id of ["FavoritesNav", "RecommendedNav", "FilteredNav", "WeaponNav", "TechNav", "ArmorNav"]) {
        assert.match(layout, new RegExp(`id="${id}"`));
    }
});

test("minimalist shop compacts the filtered and recommended catalog components", () => {
    const css = read("panorama/styles/citadel_hud_hero_shop.css");
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active #ShopNavigation .NavigationButton"), /background-image:\s*none !important;/);
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended #PopularItemsHeader"), /visibility:\s*collapse;/);
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended .CostSticker"), /visibility:\s*collapse;/);
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended #ModLists"), /border-top:\s*0px;/);
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended .tierRow .CostLabel"), /width:\s*100px;/);
});

test("minimalist category tabs preserve the legacy flat tier geometry", () => {
    const css = read("panorama/styles/citadel_hud_hero_shop.css");
    const row = ruleBody(css, "CitadelHudHeroShop.simplify_shop_active.showingWeapon CitadelShopModsFiltered .tierRow,");
    assert.match(row, /width:\s*100%;/);
    assert.match(row, /x:\s*0px;/);
    assert.doesNotMatch(row, /ignore-parent-flow/);
    const expected = [
        ["showingWeapon", 1, 0],
        ["showingWeapon", 2, 145],
        ["showingWeapon", 3, 375],
        ["showingWeapon", 4, 605],
        ["showingArmor", 3, 375],
        ["showingArmor", 4, 605],
        ["showingTech", 3, 290],
        ["showingTech", 4, 520]
    ];
    for (const [state, tier, y] of expected) {
        const selector = `CitadelHudHeroShop.simplify_shop_active.${state} CitadelShopModsFiltered .tierRow.EModTier_${tier}`;
        const tierRule = ruleBody(css, selector);
        assert.match(tierRule, new RegExp(`y:\\s*${y}px;`));
        assert.match(tierRule, /ignore-parent-flow:\s*true;/);
    }
});

test("minimalist build and item cards override the patched resizable geometry", () => {
    const build = read("panorama/styles/citadel_shop_mods_build.css");
    const category = read("panorama/styles/citadel_shop_mods_build_category.css");
    const card = read("panorama/styles/citadel_shop_mod_view.css");
    assert.match(ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild .BuildHeaderShared"), /height:\s*60px;/);
    assert.match(ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild .SelectedBuildName"), /color:\s*offWhite;/);
    const compactCategory = ruleBody(category, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuildCategory");
    assert.match(compactCategory, /background-color:\s*none;/);
    assert.doesNotMatch(category, /fit-children !important/);
    assert.match(ruleBody(category, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuildCategory #BuildCategoryHeader"), /width:\s*fit-children;/);
    const compactCard = ruleBody(card, "CitadelHudHeroShop.simplify_shop_active CitadelShopMod");
    assert.match(compactCard, /width:\s*80px;/);
    assert.match(compactCard, /height:\s*80px;/);
    assert.match(compactCard, /margin:\s*2px;/);
});
