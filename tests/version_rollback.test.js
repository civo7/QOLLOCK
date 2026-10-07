"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

test("rolled-back version preserves current scales, colors and offsets in both sharing contexts", () => {
    const { global: g, hud } = load();
    assert.equal(g.QOL_SCHEMA_SEMVER, "4.0.5");
    assert.equal(g.QOL.VERSION, "4.0.5");
    assert.equal(g.QOL_LATEST_COMPACT_SEMVER, "4.0.5");
    for (const version of ["4.0.6", "4.0.7", "4.0.8", "4.0.9", "4.0.10"]) {
        assert.equal(g.QOL_COMPACT_SCHEMA_REGISTRY[version], undefined);
    }
    const codec = hud.sandbox.global.QOL.core.codec;
    const patch = {
        SOULS_SCALE: 50, ITEMS_SCALE: 200, STAMINA_SCALE: 149, STATS_POSITION_SCALE: 121,
        COMPASS_SPEED_SCALE: 178, AMMO_HUD_SCALE: 163, AP_SCALE: 180, DAMAGE_REPORT_SCALE: 62,
        AMMO_PANEL_X_OFFSET: -2000, STATS_POSITION_Y_OFFSET: 2000,
        ITEMS_WASH_COLOR: g.QOL_UTILS.EncodeHexColor("#124578")
    };
    const config = { ...g.MOD_CONFIG, ...patch };
    const payload = g.QOL.persistence.serializeCompactV2(config);
    assert.equal(payload, codec.serializeBuildPayloadCompact(config));
    assert.equal(payload.charAt(0), "{");
    const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString(config));
    assert.equal(result.ok, true);
    assert.equal(result.schemaVersion, "4.0.5");
    g.QOL.persistence.applyParsedConfigWithDiagnostics(result.parsedConfig, result.schemaVersion);
    const decoded = codec.deserializeBuildPayloadCompact(payload, "4.0.5");
    for (const [key, value] of Object.entries(patch)) {
        assert.equal(result.candidateConfig[key], value, key);
        assert.equal(g.MOD_CONFIG[key], value, key);
        assert.equal(decoded[key], value, key);
    }
    const compact = g.QOL.persistence.serializeCompactV2(g.QOL_DEFAULT_CONFIG);
    assert.equal(compact.charCodeAt(0), 2, "native defaults retain published binary layout");
    assert.equal(compact, codec.serializeBuildPayloadCompact(g.QOL_DEFAULT_CONFIG));
});

test("envelope imports reject malformed settings without changing the live config", () => {
    const { global: g } = load();
    const baseline = JSON.stringify(g.MOD_CONFIG);
    for (const raw of [
        '{"schema":"4.0.5","data":[]}',
        '{"schema":"4.0.5","data":{"SOULS_SCALE":null}}',
        '{"schema":"4.0.5","data":{"SOULS_SCALE":{}}}',
        '{"schema":"4.0.5","data":{"unknown":1}}',
        '{"schema":"4.0.10","data":{"SOULS_SCALE":100}}'
    ]) {
        const token = "[QOL-4-0-5]:" + g.QOL.persistence.toBase64Url(raw);
        assert.equal(g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(token).ok, false);
        assert.equal(JSON.stringify(g.MOD_CONFIG), baseline);
    }
});
