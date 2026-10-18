"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Damage Fountain window geometry is limited to damage event indicators", () => {
    const css = fs.readFileSync(
        path.join(__dirname, "../panorama/styles/qol_damage_fountain_full.css"),
        "utf8"
    );

    // Subtitles also use WindowRoot in the captured native HUD tree.
    assert.doesNotMatch(css, /\.damage_fountain_active\s+\.Window(?:Root)?\s*\{/);

    for (const windowClass of ["WindowRoot", "Window"]) {
        const selector = new RegExp(
            `\\.damage_fountain_active CitadelHudDamageEventIndicator\\.${windowClass}\\s*\\{([^}]+)\\}`
        );
        const rule = css.match(selector);
        assert.ok(rule, `${windowClass} must retain damage-event window styling`);
        assert.match(rule[1], /height:\s*300px;/);
        assert.match(rule[1], /width:\s*300px;/);
        assert.match(rule[1], /flow-children:\s*right;/);
    }
});
