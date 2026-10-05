"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("hero-testing menu is restored only in the UI-visible practice area", () => {
    const css = read("panorama/styles/hero_testing_menu.css");

    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/hero_testing_menu\.vcss_c"\);/);
    assert.match(css, /\.hud_hero_testing_root\s*\{[^}]*y:\s*75px;/s);
    assert.match(css, /\.connectedToHeroTesting\.connectedToHideout:not\(\.InHideout\) \.hud_hero_testing_root\s*\{[^}]*visibility:\s*visible;/s);
    assert.doesNotMatch(css, /\.connectedToHeroTesting\.connectedToHideout \.hud_hero_testing_root/);
    assert.doesNotMatch(css, /\.connectedToHeroTesting\.InHideout #hud_hero_testing/);
});

test("hero-testing base copy tracks the current localized-layout rules", () => {
    const css = read("panorama/styles/base/hero_testing_menu.css");

    assert.match(css, /CitadelHud:not\(\.Language_english\) #hero_testing_stub/);
    assert.match(css, /CitadelHud:not\(\.Language_english\) \.hotkey_hint/);
});
