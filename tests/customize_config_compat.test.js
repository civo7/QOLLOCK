"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const fixtures = require("./fixtures/legacy_customize_configs.json");
const mainFixtures = require("./fixtures/main_customize_configs.json");

for (const fixture of mainFixtures.cases) {
    test(`frozen main ${fixture.name} retains customization through scoped edits and export`, () => {
        const env = load();
        const { global: g, clock } = env;
        const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(fixture.code);
        assert.equal(imported.ok, true);
        for (const [key, value] of Object.entries(fixture.expected)) assert.equal(imported.candidateConfig[key], value, key);
        g.QOL.persistence.applyParsedConfigWithDiagnostics(imported.parsedConfig, imported.schemaVersion);
        g.SaveAndSync(); clock.advance(1200);
        g.QOL.ui.window.setOpen(true); clock.advance(500);
        // Editing a different owner must not reset imported healthbar/map modes.
        assert.equal(g.QOL.ui.customize.start(null, { elementId: "abilityPoints" }), true);
        const input = env.em.FindChildTraverse("QOLCustomize_AP_X_OFFSET");
        input.text = "123"; input._fire("oninputsubmit"); clock.advance(600);
        g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
        env.em.FindChildTraverse("QOLCustomizeApply")._fire("onactivate"); clock.advance(1200);
        const exported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
        assert.equal(exported.ok, true);
        assert.equal(exported.candidateConfig.AP_X_OFFSET, 123);
        for (const [key, value] of Object.entries(fixture.expected)) assert.equal(exported.candidateConfig[key], value, key);
        assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(clock.errors, []);
    });
}

// Frozen codes were encoded with main's shared codec/schema at sourceCommit.
// Re-encoding legacy input with the current writer would miss compatibility loss.
for (const fixture of fixtures.cases) {
    test(`legacy ${fixture.version} code survives import, Customize and current export`, () => {
        const env = load();
        const { global: g, clock } = env;
        const parsed = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(fixture.code);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.schemaVersion, fixture.version);
        for (const [key, value] of Object.entries(fixture.expected)) assert.equal(parsed.candidateConfig[key], value, key);
        for (const key of ["SOULS_SCALE", "ITEMS_SCALE", "STAMINA_SCALE", "STATS_POSITION_SCALE", "COMPASS_SPEED_SCALE", "AMMO_HUD_SCALE", "AP_SCALE", "DAMAGE_REPORT_SCALE"]) {
            assert.equal(parsed.candidateConfig[key], 100, "legacy import preserves native size: " + key);
        }
        g.QOL.persistence.applyParsedConfigWithDiagnostics(parsed.parsedConfig, parsed.schemaVersion);
        g.SaveAndSync();
        clock.advance(1200);
        g.QOL.ui.window.setOpen(true);
        clock.advance(500);
        assert.equal(g.QOL.ui.customize.start(), true);
        for (const [key, value] of Object.entries(fixture.expected)) assert.equal(g.MOD_CONFIG[key], value, key);
        const input = env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET");
        assert.equal(Number(input.text), fixture.expected.SOULS_X_OFFSET);
        input.text = "450";
        input._fire("oninputsubmit");
        env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate");
        clock.advance(500); // Native DeleteAsync completes before the next user action.
        assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, fixture.expected.SOULS_X_OFFSET, "Cancel preserves imported placement");
        assert.equal(g.QOL.ui.customize.start(), true);
        const pending = env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET");
        pending.text = "450";
        g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
        env.em.FindChildTraverse("QOLCustomizeApply")._fire("onactivate");
        clock.advance(1200);
        const exported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
        assert.equal(exported.ok, true);
        assert.equal(exported.schemaVersion, g.QOL_SCHEMA_SEMVER);
        for (const [key, value] of Object.entries(fixture.expected)) {
            assert.equal(exported.candidateConfig[key], key === "SOULS_X_OFFSET" ? 450 : value, key);
        }
        assert.deepEqual(env.doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("legacy flat JSON and storage envelopes retain visual values when opening Customize", () => {
    for (const enveloped of [false, true]) {
        const env = load();
        const { global: g, clock } = env;
        const values = fixtures.cases.at(-1).expected;
        const raw = JSON.stringify(enveloped ? { schema: "4.0.5", data: values } : values);
        Object.assign(g.MOD_CONFIG, g.QOL.parseStoredConfig(raw));
        g.SaveAndSync();
        clock.advance(1200);
        g.QOL.ui.window.setOpen(true);
        clock.advance(500);
        assert.equal(g.QOL.ui.customize.start(), true);
        env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate");
        for (const [key, value] of Object.entries(values)) assert.equal(g.MOD_CONFIG[key], value, key);
        assert.deepEqual(env.doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    }
});
