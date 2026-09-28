"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

test("healthbar accent and native position react in hideout and reset", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const container = $.CreatePanel("Panel", hud.root, "health_and_abilities_container");
    const frame = $.CreatePanel("Panel", container, "health_bar_frame");
    Q.core.ConfigStore.set("ql_healthbar", "PLAYER_HEALTHBAR_X_OFFSET", 100);
    Q.core.ConfigStore.set("ql_healthbar", "PLAYER_HEALTHBAR_ACCENT_COLOR", 3);
    hud.clock.advance(600);
    assert.equal(container.style.x, "100px");
    assert.equal(frame.style.washColor, Q.core.panel.resolvePaletteColor(3));

    frame.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", container, "health_bar_frame");
    hud.clock.advance(600);
    assert.equal(replacement.style.washColor, Q.core.panel.resolvePaletteColor(3));

    Q.core.ConfigStore.set("ql_healthbar", "PLAYER_HEALTHBAR_X_OFFSET", 0);
    Q.core.ConfigStore.set("ql_healthbar", "PLAYER_HEALTHBAR_ACCENT_COLOR", 0);
    hud.clock.advance(600);
    assert.equal(container.style.x || "", "");
    assert.equal(replacement.style.washColor || "", "");
    assert.deepEqual(hud.clock.errors, []);
});

test("bottom bar reapplies unchanged settings to a replacement panel", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const first = $.CreatePanel("Panel", hud.root, "hud_signature");
    Q.core.ConfigStore.set("ql_bottom_bar", "BOTTOM_BAR_X_OFFSET", 100);
    hud.clock.advance(600);
    assert.equal(first.style.x, "100px");

    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = $.CreatePanel("Panel", hud.root, "hud_signature");
    hud.clock.advance(600);
    assert.equal(replacement.style.x, "100px");

    Q.core.ConfigStore.set("ql_bottom_bar", "BOTTOM_BAR_X_OFFSET", 0);
    hud.clock.advance(100);
    assert.equal(replacement.style.x || "", "");
    assert.deepEqual(hud.clock.errors, []);
});
