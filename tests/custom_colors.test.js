"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

test("RGB encoding distinguishes native default, black and white; malformed HEX is rejected", () => {
    const { global: g } = load();
    const U = g.QOL_UTILS;
    for (const hex of ["#000000", "#FFFFFF", "#123ABC", "#010203"]) {
        const value = U.EncodeHexColor(hex);
        assert.ok(value > 29);
        assert.equal(U.DecodeHexColor(value), hex);
        assert.equal(U.ResolveWashColorFromPalette(value), hex);
    }
    assert.equal(U.EncodeHexColor(" abcdef "), U.EncodeHexColor("#ABCDEF"));
    for (const invalid of ["", "#FFF", "#12GG00", "#12345678", "red", null]) {
        assert.equal(U.EncodeHexColor(invalid), null);
    }
    assert.equal(U.ResolveWashColorFromPalette(0), "");
    for (const invalid of [30, 99, 0xffffff, 0x2000000, Infinity]) {
        assert.equal(U.NormalizePaletteColorIndex(invalid), 0);
    }
});

test("RGB settings survive the production UI publication, HUD, export and import", () => {
    const { global: g, hud, clock, list, doc } = load();
    const colors = { ITEMS_WASH_COLOR: "#000000", STAMINA_CHARGE_COLOR: "#FFFFFF", AMMO_TEXT_COLOR: "#123ABC",
        BOTTOM_BAR_WASH_COLOR: "#010203", KEYBOARD_OVERLAY_WASH_COLOR: "#AB45CD", PLAYER_HEALTHBAR_ACCENT_COLOR: "#345678", MINIMAP_ICON_COLOR: "#987654" };
    const owners = { ITEMS_WASH_COLOR: "ql_items", STAMINA_CHARGE_COLOR: "ql_stamina", AMMO_TEXT_COLOR: "ql_ammo",
        BOTTOM_BAR_WASH_COLOR: "ql_bottom_bar", KEYBOARD_OVERLAY_WASH_COLOR: "ql_keyboard", PLAYER_HEALTHBAR_ACCENT_COLOR: "ql_healthbar", MINIMAP_ICON_COLOR: "ql_minimap_runtime" };
    const syncs = [];
    g.RegisterSettingsListRowSync = callback => syncs.push(callback);
    for (const [key, hex] of Object.entries(colors)) {
        g.MOD_CONFIG[key] = g.QOL_UTILS.EncodeHexColor(hex);
        g.CreateRow(list, "Color", key, "palette", null, null, null, g.QOL_COLOR_PALETTE_OPTIONS);
        syncs.at(-1)();
        assert.equal(g.QOL_UTILS.DecodeHexColor(g.MOD_CONFIG[key]), hex, "rendering a palette never overwrites HEX");
    }
    g.MarkConfigDirty();
    clock.advance(1200);
    for (const [key, hex] of Object.entries(colors)) {
        const value = hud.sandbox.global.QOL.core.ConfigStore.get(owners[key], key);
        assert.equal(g.QOL_UTILS.DecodeHexColor(value), hex);
    }
    const code = g.QOL.ui.configTab.getCurrentExportSettingsString();
    const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
    assert.equal(result.ok, true);
    assert.equal(result.schemaVersion, g.QOL_SCHEMA_SEMVER);
    for (const [key, hex] of Object.entries(colors)) {
        assert.equal(g.QOL_UTILS.DecodeHexColor(result.candidateConfig[key]), hex);
        g.MOD_CONFIG[key] = 0;
    }
    g.QOL.persistence.applyParsedConfigWithDiagnostics(result.parsedConfig, result.schemaVersion);
    g.SaveAndSync();
    clock.advance(1200);
    for (const [key, hex] of Object.entries(colors)) {
        assert.equal(g.QOL_UTILS.DecodeHexColor(g.MOD_CONFIG[key]), hex);
        assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get(owners[key], key), g.MOD_CONFIG[key]);
    }
    assert.deepEqual(doc.eventErrors, []);
    assert.deepEqual(clock.errors, []);
});

test("historical palettes retain their bounds; current colors reject invalid values", () => {
    const { global: g, hud } = load();
    const fields = g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema;
    for (const key of ["ITEMS_WASH_COLOR", "STAMINA_CHARGE_COLOR", "AMMO_TEXT_COLOR"]) {
        assert.equal(fields.find(field => field.key === key).max, 29);
        assert.equal(g.QOL_DEFAULT_CONFIG[key], 0);
    }
    for (const key of ["BOTTOM_BAR_WASH_COLOR", "KEYBOARD_OVERLAY_WASH_COLOR", "PLAYER_HEALTHBAR_ACCENT_COLOR", "MINIMAP_ICON_COLOR"]) {
        assert.equal(g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema.find(field => field.key === key).max, 29);
        assert.equal(g.QOL_DEFAULT_CONFIG[key], 0);
    }
    const store = hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.set("ql_bottom_bar", "BOTTOM_BAR_WASH_COLOR", g.QOL_UTILS.EncodeHexColor("#010203")), true);
    assert.equal(g.QOL_UTILS.SupportsCustomColor("ENABLE_COLOR_WARNING_25"), false);
    assert.equal(store.set("ql_items", "ITEMS_WASH_COLOR", 99), false);
    assert.equal(store.set("ql_items", "ITEMS_WASH_COLOR", g.QOL_UTILS.EncodeHexColor("#000000")), true);
});
