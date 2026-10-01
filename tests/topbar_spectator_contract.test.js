"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readLayout() {
    return fs.readFileSync(
        path.resolve(__dirname, "../panorama/layout/citadel_hud_top_bar_player.xml"),
        "utf8"
    ).replace(/\r\n/g, "\n");
}

function openingTag(layout, type, id) {
    const idPattern = id ? `(?=[^>]*\\bid="${id}")` : "";
    const match = layout.match(new RegExp(`<${type}\\b${idPattern}[^>]*>`));
    assert.ok(match, `missing ${type}${id ? `#${id}` : ""}`);
    return match[0];
}

test("top-bar player override preserves current spectator hit routing", () => {
    const layout = readLayout().replace(/<!--[\s\S]*?-->/g, "");

    // Observed-player selection and the resulting bottom ability rebinding are
    // native C++ behavior. The source contract we can verify offline is the
    // current native hit-test split: the player root is click-through while
    // its interaction children remain eligible to receive input.
    const root = openingTag(layout, "CitadelHudTopBarPlayer");
    assert.match(root, /\bhittest="false"/);

    const details = openingTag(layout, "Panel", "PlayerDetailsContainer");
    assert.doesNotMatch(details, /\bhittest="false"/);

    const spectateTarget = openingTag(layout, "Panel", "SpectatePlayerButtonPanel");
    assert.doesNotMatch(spectateTarget, /\bhittest="false"/);

    for (let slot = 1; slot <= 4; slot += 1) {
        const ability = openingTag(layout, "CitadelAbilityIcon", `AbilityButton${slot}`);
        assert.match(ability, new RegExp(`\\bability_slot="${slot}"`));
        assert.match(ability, /\bread_only="true"/);
    }
});
