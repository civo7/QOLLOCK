"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const fixtures = require("./fixtures/legacy_customize_configs.json");

const OFFSET_KEYS = [
    "AMMO_PANEL_X_OFFSET", "AMMO_PANEL_Y_OFFSET",
    "STATS_POSITION_X_OFFSET", "STATS_POSITION_Y_OFFSET"
];

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
