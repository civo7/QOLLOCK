"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("hero-testing menu remains visible when hero testing is enabled in hideout", () => {
    const css = read("panorama/styles/hero_testing_menu.css");

    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/hero_testing_menu\.vcss_c"\);/);
    assert.match(css, /\.connectedToHeroTesting\.connectedToHideout \.hud_hero_testing_root\s*\{[^}]*visibility:\s*visible;/s);
    assert.match(css, /\.connectedToHeroTesting\.InHideout #hud_hero_testing\s*\{[^}]*opacity:\s*1;[^}]*pre-transform-scale2d:\s*1;[^}]*wash-color:\s*white;/s);
});

test("hero-testing base copy tracks the current localized-layout rules", () => {
    const css = read("panorama/styles/base/hero_testing_menu.css");

    assert.match(css, /CitadelHud:not\(\.Language_english\) #hero_testing_stub/);
    assert.match(css, /CitadelHud:not\(\.Language_english\) \.hotkey_hint/);
});
