"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

function cssRules(css) {
    const normalized = css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/@(import|define)[^;]+;/g, "");
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    return Array.from(normalized.matchAll(rulePattern), (match) => ({
        selectors: match[1].split(",").map((candidate) => candidate.trim()),
        body: match[2]
    }));
}

function ruleBody(css, selector) {
    let body = null;
    for (const rule of cssRules(css)) {
        const { selectors } = rule;
        if (selectors.includes(selector)) {
            body = rule.body;
        }
    }
    assert.notEqual(body, null, `missing selector: ${selector}`);
    return body;
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

test("minimalist catalog removes parchment while preserving refreshed controls", () => {
    const shop = read("panorama/styles/citadel_hud_hero_shop.css");
    const filtered = read("panorama/styles/citadel_shop_mods_filtered.css");
    const recommended = read("panorama/styles/citadel_shop_mods_recommended.css");

    assert.match(filtered, /@import url\("s2r:\/\/panorama\/styles\/base\/citadel_shop_mods_filtered\.vcss_c"\);/);
    assert.match(recommended, /@import url\("s2r:\/\/panorama\/styles\/base\/citadel_shop_mods_recommended\.vcss_c"\);/);
    assert.doesNotMatch(filtered, /!important/);
    assert.doesNotMatch(recommended, /!important/);

    const surface = ruleBody(shop, "CitadelHudHeroShop.simplify_shop_active #ShopModListsContainer");
    assert.match(surface, /background-image:\s*none;/);
    assert.doesNotMatch(surface, /!important/);
    assert.match(surface, /background-color:\s*#070b0bf2;/);
    assert.match(ruleBody(shop, "CitadelHudHeroShop.simplify_shop_active #ShopNavigation .NavigationButton"), /background-image:\s*none;/);
    assert.match(ruleBody(shop, "CitadelHudHeroShop.simplify_shop_active .ShopNavigationTabBackground"), /background-image:\s*none;/);
    assert.match(ruleBody(shop, "CitadelHudHeroShop.simplify_shop_active .ShopNavigationTabEdgeOverlay"), /background-image:\s*none;/);
    assert.match(ruleBody(filtered, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered#ShopModsFiltered"), /background-color:\s*#070b0bf2;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended#ShopModsRecommended"), /background-color:\s*#070b0bf2;/);
    assert.match(ruleBody(filtered, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered#ShopModsFiltered #ModsContainer"), /background-image:\s*none;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended#ShopModsRecommended #ModsContainer"), /background-image:\s*none;/);

    const recommendationHeader = ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended#ShopModsRecommended #PopularItemsHeader");
    assert.match(recommendationHeader, /background-color:\s*#2b2c2b99;/);
    assert.doesNotMatch(recommendationHeader, /visibility:\s*collapse;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended#ShopModsRecommended #PopularItemsHeader #HeaderLabel"), /visibility:\s*visible;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended#ShopModsRecommended #PopularItemsHeader .recommendations_header_bg"), /background-image:\s*none;/);

    assert.match(ruleBody(filtered, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered#ShopModsFiltered #TreeHeaders"), /visibility:\s*collapse;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended#ShopModsRecommended .CostSticker"), /visibility:\s*collapse;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended#ShopModsRecommended #ModLists .mod_list_bg"), /background-image:\s*none;/);
    assert.match(ruleBody(filtered, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered#ShopModsFiltered #ModLists .mod_list_bg"), /background-image:\s*none;/);
});

test("minimalist category tabs stack full-width item rows by price", () => {
    const css = read("panorama/styles/citadel_shop_mods_filtered.css");
    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/citadel_shop_mods_filtered\.vcss_c"\);/);

    assert.doesNotMatch(css, /!important/);
    // The native category-only catalog uses state/tier selectors to turn
    // #ModTiers into an absolute-positioned 2x2 board. Anchor the minimalist
    // resets on the known component ID so they beat those selectors without
    // depending on where Valve applies each Showing* state class.
    const componentPrefix = "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered#ShopModsFiltered";
    assert.match(ruleBody(css, `${componentPrefix} #ModTiers`), /flow-children:\s*down;/);

    for (let tier = 1; tier <= 5; tier += 1) {
        const tierRow = ruleBody(css, `${componentPrefix} .tierRow.EModTier_${tier}`);
        assert.match(tierRow, /width:\s*100%;/);
        assert.match(tierRow, /x:\s*0px;/);
        assert.match(tierRow, /y:\s*0px;/);
        assert.match(tierRow, /ignore-parent-flow:\s*false;/);
        assert.match(tierRow, /margin:\s*0px 0px 8px 0px;/);
    }

    for (const state of ["showingWeapon", "showingArmor", "showingTech", "ShowingWeaponOnly", "ShowingVitalityOnly", "ShowingSpiritOnly"]) {
        const selector = `CitadelHudHeroShop.simplify_shop_active.${state} CitadelShopModsFiltered#ShopModsFiltered #ModLists .ModList`;
        assert.match(ruleBody(css, selector), /width:\s*100%;/);
    }
    const price = ruleBody(css, `${componentPrefix} .tierRow .CostLabel`);
    assert.match(price, /background-color:\s*#2b2c2b;/);
    assert.match(price, /margin:\s*0px 0px 0px 15px;/);
});

test("minimalist All Items controls use dark surfaces without hiding the catalog", () => {
    const css = read("panorama/styles/citadel_ui_shop_filters.css");
    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/citadel_ui_shop_filters\.vcss_c"\);/);
    assert.doesNotMatch(css, /!important/);

    const backer = ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopFilters#ShopFilters .filter_backer");
    assert.match(backer, /background-image:\s*none;/);
    assert.match(backer, /background-color:\s*#0b0c0ce6;/);
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopFilters#ShopFilters #ActiveFiltersContainer"), /background-color:\s*#0b0c0cf2;/);
    const filterGroup = ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopFilters#ShopFilters #FilterContainer .FilterGroup.TopLevel");
    assert.match(filterGroup, /background-image:\s*none;/);
    assert.match(filterGroup, /background-color:\s*#151616f2;/);
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopFilters#ShopFilters #FilterContainer .FilterGroup.TopLevel ToggleButton Label"), /color:\s*offWhite;/);
    assert.doesNotMatch(css, /CitadelHudHeroShop\.simplify_shop_active CitadelShopFilters#ShopFilters\s*\{[^}]*background-color:/s);
});

test("minimalist builds retain patch controls on the historical dark surfaces", () => {
    const build = read("panorama/styles/citadel_shop_mods_build.css");
    const category = read("panorama/styles/citadel_shop_mods_build_category.css");
    const card = read("panorama/styles/citadel_shop_mod_view.css");
    assert.doesNotMatch(build, /!important/);

    assert.match(ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild#ShopModsSelectedBuild"), /background-image:\s*none;/);
    assert.match(ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild#ShopModsSelectedBuild"), /background-color:\s*#070b0bf2;/);
    const buildHeader = ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild#ShopModsSelectedBuild .BuildHeaderShared");
    assert.match(buildHeader, /background-image:\s*none;/);
    assert.match(buildHeader, /background-color:\s*#2b2c2b99;/);
    assert.match(ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild#ShopModsSelectedBuild .SelectedBuildName"), /color:\s*offWhite;/);

    const compactCategory = ruleBody(category, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuildCategory");
    assert.match(compactCategory, /background-color:\s*#ffffff0d;/);
    assert.match(ruleBody(category, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuildCategory.Optional"), /background-color:\s*#283e65a0;/);
    assert.doesNotMatch(ruleBody(category, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuildCategory #BuildCategoryHeader"), /width:\s*fit-children;/);

    const compactCard = ruleBody(card, "CitadelHudHeroShop.simplify_shop_active CitadelShopMod");
    assert.match(compactCard, /width:\s*80px;/);
    assert.match(compactCard, /min-width:\s*80px;/);
    assert.match(compactCard, /max-width:\s*80px;/);
    assert.match(compactCard, /height:\s*80px;/);
    assert.match(compactCard, /min-height:\s*80px;/);
    assert.match(compactCard, /max-height:\s*80px;/);
    assert.match(compactCard, /margin:\s*2px;/);
    assert.match(ruleBody(card, "CitadelHudHeroShop.simplify_shop_active .ModTier1.isWeapon #CardBacker"), /background-image:\s*none;/);
});
