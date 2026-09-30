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

    const surface = ruleBody(shop, "CitadelHudHeroShop.simplify_shop_active #ShopModListsContainer");
    assert.match(surface, /background-image:\s*none !important;/);
    assert.match(surface, /background-color:\s*#070b0bf2;/);
    assert.match(ruleBody(shop, "CitadelHudHeroShop.simplify_shop_active #ShopNavigation .NavigationButton"), /background-image:\s*none !important;/);
    assert.match(ruleBody(shop, "CitadelHudHeroShop.simplify_shop_active .ShopNavigationTabBackground"), /background-image:\s*none !important;/);
    assert.match(ruleBody(shop, "CitadelHudHeroShop.simplify_shop_active .ShopNavigationTabEdgeOverlay"), /background-image:\s*none !important;/);
    assert.match(ruleBody(filtered, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered"), /background-color:\s*#070b0bf2;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended"), /background-color:\s*#070b0bf2;/);
    assert.match(ruleBody(filtered, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered #ModsContainer"), /background-image:\s*none !important;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended #ModsContainer"), /background-image:\s*none !important;/);

    const recommendationHeader = ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended #PopularItemsHeader");
    assert.match(recommendationHeader, /background-color:\s*#2b2c2b99;/);
    assert.doesNotMatch(recommendationHeader, /visibility:\s*collapse;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended #PopularItemsHeader #HeaderLabel"), /visibility:\s*visible;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended #PopularItemsHeader .recommendations_header_bg"), /background-image:\s*none !important;/);

    assert.match(ruleBody(filtered, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered #TreeHeaders"), /visibility:\s*collapse;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended .CostSticker"), /visibility:\s*collapse;/);
    assert.match(ruleBody(recommended, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsRecommended #ModLists .mod_list_bg"), /background-image:\s*none;/);
    assert.match(ruleBody(filtered, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered #ModLists .mod_list_bg"), /background-image:\s*none;/);
});

test("minimalist category tabs stack full-width item rows by price", () => {
    const css = read("panorama/styles/citadel_shop_mods_filtered.css");
    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/citadel_shop_mods_filtered\.vcss_c"\);/);

    const tiers = ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered #ModTiers");
    assert.match(tiers, /flow-children:\s*down !important;/);

    const row = ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered .tierRow");
    assert.match(row, /width:\s*100% !important;/);
    assert.match(row, /x:\s*0px !important;/);
    assert.match(row, /y:\s*0px !important;/);
    assert.match(row, /ignore-parent-flow:\s*false !important;/);
    const tierRules = cssRules(css).filter((rule) => rule.selectors.some((selector) => (
        selector.includes("simplify_shop_active") && selector.includes(".tierRow.EModTier_")
    )));
    for (const rule of tierRules) {
        assert.doesNotMatch(rule.body, /(?:^|[;\s])(x|y|width):\s*[^;]+;/);
        assert.doesNotMatch(rule.body, /ignore-parent-flow:\s*true;/);
    }

    for (const state of ["showingWeapon", "showingArmor", "showingTech", "ShowingWeaponOnly", "ShowingVitalityOnly", "ShowingSpiritOnly"]) {
        const selector = `CitadelHudHeroShop.simplify_shop_active.${state} CitadelShopModsFiltered #ModLists .ModList`;
        assert.match(ruleBody(css, selector), /width:\s*100% !important;/);
    }
    const price = ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsFiltered .tierRow .CostLabel");
    assert.match(price, /background-color:\s*#2b2c2b;/);
});

test("minimalist All Items controls use dark surfaces without hiding the catalog", () => {
    const css = read("panorama/styles/citadel_ui_shop_filters.css");
    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/citadel_ui_shop_filters\.vcss_c"\);/);

    const backer = ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopFilters .filter_backer");
    assert.match(backer, /background-image:\s*none !important;/);
    assert.match(backer, /background-color:\s*#0b0c0ce6;/);
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopFilters #ActiveFiltersContainer"), /background-color:\s*#0b0c0cf2;/);
    const filterGroup = ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopFilters #FilterContainer .FilterGroup.TopLevel");
    assert.match(filterGroup, /background-image:\s*none !important;/);
    assert.match(filterGroup, /background-color:\s*#151616f2;/);
    assert.match(ruleBody(css, "CitadelHudHeroShop.simplify_shop_active CitadelShopFilters #FilterContainer .FilterGroup.TopLevel ToggleButton Label"), /color:\s*offWhite;/);
    assert.doesNotMatch(css, /CitadelHudHeroShop\.simplify_shop_active CitadelShopFilters\s*\{[^}]*background-color:/s);
});

test("minimalist builds retain patch controls on the historical dark surfaces", () => {
    const build = read("panorama/styles/citadel_shop_mods_build.css");
    const category = read("panorama/styles/citadel_shop_mods_build_category.css");
    const card = read("panorama/styles/citadel_shop_mod_view.css");

    assert.match(ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild"), /background-image:\s*none !important;/);
    assert.match(ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild"), /background-color:\s*#070b0bf2;/);
    const buildHeader = ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild .BuildHeaderShared");
    assert.match(buildHeader, /background-image:\s*none !important;/);
    assert.match(buildHeader, /background-color:\s*#2b2c2b99;/);
    assert.match(ruleBody(build, "CitadelHudHeroShop.simplify_shop_active CitadelShopModsBuild .SelectedBuildName"), /color:\s*offWhite;/);

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
