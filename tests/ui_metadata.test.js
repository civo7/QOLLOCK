// tests/ui_metadata.test.js
// =============================================================================
// Unit tests for Settings Metadata (panorama/scripts/ui/ql_settings_metadata.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("ui/metadata: exports all metadata tables on QOL.ui.metadata and globalThis", () => {
    const ctx = {
        QOL: {},
        globalThis: null
    };
    ctx.globalThis = ctx;

    const script = fs.readFileSync(
        path.join(__dirname, "../panorama/scripts/ui/ql_settings_metadata.js"),
        "utf8"
    );
    vm.runInNewContext(script, ctx);

    assert.ok(ctx.QOL.ui.metadata, "QOL.ui.metadata must exist");
    assert.strictEqual(ctx.QOL.ui.metadata.PERF_IMPACT_TIER_NONE, "none");
    assert.strictEqual(ctx.QOL.ui.metadata.PERF_IMPACT_TIER_LOW, "low");
    assert.strictEqual(ctx.QOL.ui.metadata.PERF_IMPACT_TIER_MEDIUM, "medium");
    assert.strictEqual(ctx.QOL.ui.metadata.PERF_IMPACT_TIER_HIGH, "high");

    // Tier order and labels
    assert.strictEqual(ctx.QOL.ui.metadata.PERF_IMPACT_TIER_ORDER.none, 0);
    assert.strictEqual(ctx.QOL.ui.metadata.PERF_IMPACT_TIER_ORDER.high, 3);
    assert.strictEqual(ctx.QOL.ui.metadata.PERF_IMPACT_LABEL_BY_TIER.medium, "Medium");

    // Dictionaries
    assert.ok(ctx.QOL.ui.metadata.SETTING_CREATED_BY_BY_CONFIG.ENABLE_PASSIVE_COOLDOWN, "Hanturaya");
    assert.strictEqual(ctx.QOL.ui.metadata.SETTING_PERF_IMPACT_TIERS.COMPASS_SCALE, "none");
    assert.strictEqual(ctx.QOL.ui.metadata.SETTING_PERF_IMPACT_TIERS.ENABLE_COMPASS, "medium");

    // Globals
    assert.strictEqual(ctx.PERF_IMPACT_TIER_NONE, "none");
    assert.strictEqual(ctx.SETTING_PERF_IMPACT_TIERS, ctx.QOL.ui.metadata.SETTING_PERF_IMPACT_TIERS);

    // Hero metadata
    assert.ok(Array.isArray(ctx.DEFAULT_HERO_OPTIONS), "DEFAULT_HERO_OPTIONS must be an array");
    assert.strictEqual(ctx.DEFAULT_HERO_OPTIONS.length, 38);
    assert.strictEqual(ctx.DEFAULT_HERO_DISPLAY_NAMES.hero_inferno, "Infernus");
    assert.ok(Array.isArray(ctx.DEFAULT_HERO_DROPDOWN_OPTIONS), "DEFAULT_HERO_DROPDOWN_OPTIONS must be an array");
    assert.strictEqual(ctx.COMPACT_DEFAULT_HERO_FIELD, "DEFAULT_HERO_INDEX");
});
