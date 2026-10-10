"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const fixtures = require("./fixtures/legacy_customize_configs.json");

const OFFSET_KEYS = [
    "AMMO_PANEL_X_OFFSET", "AMMO_PANEL_Y_OFFSET",
    "STATS_POSITION_X_OFFSET", "STATS_POSITION_Y_OFFSET"
];

test("reload offsets use expanded current bounds and preserve the old compact range", () => {
    const { global: g } = load();
    const config = { ...g.QOL_DEFAULT_CONFIG, RELOAD_COOLDOWN_X_OFFSET: -1999, RELOAD_COOLDOWN_Y_OFFSET: 1234 };
    const imported = g.QOL.persistence.deserializeCompactV2(g.QOL.persistence.serializeCompactV2(config));
    for (const key of ["RELOAD_COOLDOWN_X_OFFSET", "RELOAD_COOLDOWN_Y_OFFSET"]) {
        const field = g.QOL_SETTINGS_FIELDS.find(field => field.key === key);
        assert.equal(field.min, -2000); assert.equal(field.max, 2000);
        assert.equal(imported[key], config[key]);
        const old = g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema.find(field => field.key === key);
        assert.equal(old.min, -75); assert.equal(old.max, 75);
    }
});

test("full-HUD overlay and shop offsets round-trip outside their historic limits", () => {
    const { global: g } = load();
    const config = { ...g.QOL_DEFAULT_CONFIG };
    const keys = ["CROSSHAIR_STATS", "COMPASS", "COMPASS_SPEED", "ZIP_BOOST", "STAT_BONUSES", "UNSECURED_SOUL_TIMER",
        "UNSECURED_SOULS_HUD", "RECENT_PURCHASES_QUICK", "RECENT_PURCHASES_PANEL"]
        .flatMap(prefix => [prefix + "_X_OFFSET", prefix + "_Y_OFFSET"]).concat(["SHOP_OFFSET_X", "SHOP_OFFSET_Y"]);
    const oldFields = g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const field = g.QOL_SETTINGS_FIELDS.find(field => field.key === key);
        const baseline = key === "UNSECURED_SOULS_HUD_Y_OFFSET" ? config[key] : 0;
        assert.equal(field.min, baseline - 2000); assert.equal(field.max, baseline + 2000); assert.equal(field.step, 1);
        config[key] = baseline + (i % 2 ? -1999 : 1999);
    }
    Object.assign(g.MOD_CONFIG, config);
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
    assert.equal(imported.ok, true);
    for (const key of keys) assert.equal(imported.candidateConfig[key], config[key], key);
    assert.equal(oldFields.find(field => field.key === "ZIP_BOOST_Y_OFFSET").min, 0);
    assert.equal(oldFields.find(field => field.key === "UNSECURED_SOULS_HUD_Y_OFFSET").min, 800);
    assert.equal(oldFields.find(field => field.key === "SHOP_OFFSET_X").max, 500);
});

test("current ammo and stats offsets use one-pixel precision while published schemas stay frozen", () => {
    const { global: g } = load();
    const currentByKey = new Map(g.QOL_SETTINGS_FIELDS.map(field => [field.key, field]));
    const published = g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema;

    for (const key of OFFSET_KEYS) {
        assert.equal(currentByKey.get(key).step, 1, key + " current step");
        const historic = published.find(field => field.key === key);
        assert.equal(historic.step, 5, key + " historical step");
    }
});

test("one-pixel ammo and stats values survive envelope export and import", () => {
    const { global: g } = load();
    const values = {
        AMMO_PANEL_X_OFFSET: -1999,
        AMMO_PANEL_Y_OFFSET: 1999,
        STATS_POSITION_X_OFFSET: 1,
        STATS_POSITION_Y_OFFSET: -1
    };
    const schema = g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema;
    assert.equal(g.QOL_CODEC.RequiresSettingsEnvelope(values, schema), true);

    const serialized = g.QOL.persistence.serializeCompactV2(Object.assign({}, g.QOL_DEFAULT_CONFIG, values));
    assert.equal(serialized.startsWith("{"), true, "unsupported precision is stored in the JSON envelope");
    const decoded = g.QOL.persistence.deserializeCompactV2(serialized);
    for (const [key, value] of Object.entries(values)) assert.equal(decoded[key], value, key);

    Object.assign(g.MOD_CONFIG, values);
    const token = g.QOL.ui.configTab.getCurrentExportSettingsString();
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(token);
    assert.equal(imported.ok, true);
    for (const [key, value] of Object.entries(values)) assert.equal(imported.candidateConfig[key], value, key);
});

test("frozen legacy Customize fixtures retain their original ammo and stats offsets", () => {
    const { global: g } = load();
    for (const fixture of fixtures.cases) {
        const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(fixture.code);
        assert.equal(imported.ok, true, fixture.version);
        for (const key of OFFSET_KEYS) {
            assert.equal(imported.candidateConfig[key], fixture.expected[key], fixture.version + " " + key);
        }
    }
});
