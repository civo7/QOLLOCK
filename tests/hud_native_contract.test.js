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

test("unit-target override keeps QOLLOCK hooks on the refreshed native snippet", () => {
    const layout = readLayout("ability_hud_element_unit_target.xml");

    assert.doesNotMatch(layout, /class="stack_count"/);
    assert.equal((layout.match(/class="qol_hint_target"/g) || []).length, 2);
});
