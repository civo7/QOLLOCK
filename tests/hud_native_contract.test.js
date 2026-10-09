"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readLayout(name) {
    return fs.readFileSync(
        path.resolve(__dirname, `../panorama/layout/${name}`),
        "utf8"
    ).replace(/\r\n/g, "\n");
}

function readStyle(name) {
    return fs.readFileSync(
        path.resolve(__dirname, `../panorama/styles/${name}`),
        "utf8"
    ).replace(/\r\n/g, "\n");
}

test("HUD override is the current native layout plus QOLLOCK includes", () => {
    const layout = readLayout("hud.xml");

    assert.doesNotMatch(layout, /<CitadelChatWheel\b/);
    assert.equal((layout.match(/<CitadelHudMovementSpeed\b/g) || []).length, 1);
    assert.match(layout, /styles\/ability_property_icons\.vcss"/);
    assert.doesNotMatch(layout, /styles\/hud_timer\.vcss_c/);
    assert.doesNotMatch(layout, /styles\/ability_property_icons\.vcss_c/);

    assert.match(layout, /scripts\/core\/ql_app\.vjs_c/);
    assert.doesNotMatch(layout, /id="minimap_overlay_root"/);
    assert.doesNotMatch(layout, /id="QOLStorageBridge"/);
});

test("property icons load once in each Panorama context", () => {
    const hudLayout = readLayout("hud.xml");
    const crosshair = readStyle("features/ql_feat_crosshair_stats.css");
    const settings = readStyle("ql_settings.css");

    assert.equal((hudLayout.match(/styles\/ability_property_icons\.vcss/g) || []).length, 1);
    assert.doesNotMatch(crosshair, /ability_property_icons\.vcss_c/);

    const settingsIcons = settings.indexOf("styles/ability_property_icons.vcss_c");
    const settingsCrosshair = settings.indexOf("styles/features/ql_feat_crosshair_stats.vcss_c");
    assert.notEqual(settingsIcons, -1);
    assert.notEqual(settingsCrosshair, -1);
    assert.ok(settingsIcons < settingsCrosshair);
});

test("unit-target styling preserves native CSS hooks without an XML override", () => {
    assert.equal(fs.existsSync(path.resolve(__dirname, "../panorama/layout/ability_hud_element_unit_target.xml")), false);
    const css = readStyle("ability_hud_element_unit_target.css");
    assert.match(css, /\.improved_hint_active \.ability_element_unit_target #unscaled_panel > #hint_container/);
    assert.doesNotMatch(css, /qol_hint_target/);
});
