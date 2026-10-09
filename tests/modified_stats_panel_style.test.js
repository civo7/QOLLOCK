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

test("shop stats retain normal/simplified styles through the existing shop listener without component XML copies", () => {
    const layout = read("panorama/layout/citadel_hud_hero_shop.xml");
    const shop = read("panorama/styles/citadel_hud_hero_shop.css");
    assert.match(layout, /<CitadelHudHeroShop\b[^>]*>\s*<GlobalClassListener classes="[^"]*\bgShopOpen\b/);
    for (const [name, type] of [["weapon", "Weapon"], ["armor", "Armor"], ["tech", "Tech"]]) {
        assert.equal(fs.existsSync(path.join(__dirname, `../panorama/layout/citadel_hero_stats_${name}_panel.xml`)), false);
        assert.match(layout, new RegExp(`<CitadelHeroStats${type} id="HeroStats${type}" class="heroStatsDisplay" bonus_type="${type}" />`));
    }
    for (const name of ["panels_shared", "tech_panel", "weapon_panel"]) {
        const css = read(`panorama/styles/citadel_hero_stats_${name}.css`);
        assert.ok(css.includes(`@import url("s2r://panorama/styles/base/citadel_hero_stats_${name}.vcss_c");`));
        assert.doesNotMatch(css, /(?:^|\})\s*\.gShopOpen(?:\s|,|\{)/);
        assert.match(css, /CitadelHudHeroShop\.gShopOpen/);
        assert.match(css, /CitadelHudHeroShop\.simplify_shop_stats_active/);
    }
    const shared = read("panorama/styles/citadel_hero_stats_panels_shared.css");
    assert.match(shared, /CitadelHudHeroShop\.gShopOpen \.heroStatsDisplay\s*\{[^}]*width:\s*650px;[^}]*border-radius:\s*5px;[^}]*ui-scale:\s*105%;/s);
    assert.match(shared, /\.statTitle\s*\{[^}]*visibility:\s*collapse;/s);
    assert.match(shop, /\.shop_stats_disabled #TestPanel\s*\{[^}]*visibility:\s*collapse;/s);
    assert.match(shop, /#HeroStatsWeapon,#HeroStatsArmor,#HeroStatsTech\s*\{[^}]*visibility:\s*visible;/s);
    assert.match(shop, /CitadelHudHeroShop\.simplify_shop_stats_active \.heroStatsDisplay/);
});
