"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfiledHud } = require("../scripts/simulator/perf/profile");
const { collectTrace } = require("../scripts/trace_feature_hud");

test("active native HUD owners never start recurring ID discovery at the whole HUD", () => {
    const hud = createProfiledHud({ enableAll: false, configOverrides: {
        ENABLE_RELOAD_COOLDOWN: 1, ENABLE_URN_TIMER: 1, ENABLE_ON_DEATH_GAMES: 1,
        ON_DEATH_GAME_MINESWEEPER: 1,
        ENABLE_LANE_WITH_PARTY: 1, DAMAGE_NUMBER_OPACITY: 0.5, ENABLE_MINIMAP_CRATE_OVERLAY: 1
    } });
    const result = collectTrace(hud, { seconds: 6 });
    assert.deepEqual(result.validity.issues, []);
    const owners = new Set(["mf:ql_minimap_runtime", "mf:ql_reload_cooldown", "mf:ql_urn_timer",
        "mf:ql_chat_translate", "mf:ql_on_death_arcade", "mf:ql_damage_numbers", "mf:ql_lane_with_party"]);
    const broad = result.events.filter(event => event.hudRootSearch && owners.has(event.feature));
    assert.deepEqual(broad.map(({ feature, target }) => ({ feature, target })), [],
        "verified owners must replace full-HUD ID searches, including periodic refreshes");
    for (const owner of owners) {
        assert.ok(result.snapshot.rows.some(row => row.label === owner && row.calls > 0), owner + " must actually run");
    }
});
