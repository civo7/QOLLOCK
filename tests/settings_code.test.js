"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const fs = require("node:fs");
const path = require("node:path");
const { crc32 } = require("node:zlib");

const sampleChanges = {
    MINIMAL_MINIMAP: 1, AMMO_PANEL_SCALE: 300, AMMO_CURRENT_SCALE: 300,
    AMMO_TOTAL_SCALE: 238, AMMO_CLIP_ANGLE: 131, ENABLE_RELOAD_COOLDOWN: 1,
    RELOAD_COOLDOWN_Y_OFFSET: -27, AMMO_CURRENT_X_OFFSET: 76,
    AMMO_CURRENT_Y_OFFSET: -16, AMMO_MAX_X_OFFSET: 66, AMMO_MAX_Y_OFFSET: -16,
    STAMINA_X_OFFSET: -9, STAMINA_Y_OFFSET: 1, STAMINA_SCALE: 125,
    ENABLE_ULT_COOLDOWNS: 1, ENABLE_PASSIVE_COOLDOWN: 1, ENABLE_OBJ_MAP: 1,
    STAMINA_CHARGE_ANGLE: 139, STAMINA_CHARGE_COLOR: 16842563,
    ENABLE_BUFF_HUD: 1, ENABLE_REJUV_HUD: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1, ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    SOULS_HIDE_NORMAL: 1
};
const plain = value => JSON.parse(JSON.stringify(value));
const frozenCode = "[QOL-4-0-5-C]:UQGsA2lm9DIYHLkBkAMBkAMBlAIJhgIEDTVpmAEBHwGEAQEfSREADTIsEOACqQK8AQGG_YcQWAA0BIAB7StP9w";
const installedWouksCode = "[QOL-4-0-5-C]:UQHoA3TWZug9DQgB1gMGAzAuOAACAzAuMgwEDAm0AQF3rAGUAigAAQecAQgACQkWAzAuOBAcHAAAAAAAcAAEAfwBAU8gBCxMSAAEAAREALkCBQVDBRAFRSgNY2FjASIB5AEBDgU7AWYBlwEBNQXeBAFPAQcJFR_A";
const gitBreadCode = "[QOL-4-0-5-C]:UQHhA7PxE98wBAAFeAgCAzAuNyQN7gWwAxQtB5gBDAAABQkFJyAIBCwAAAAAAARBAiwFdwgUAgMwLjUALAgAHQ8RYwgEQACkBAkZARMBAgFBKNYVjN8";

test("published Stat Bonuses codes import unrelated settings without reviving retired controls", () => {
    const { global: g } = load();
    const code = "[QOL-4-0-5-C]:UQHMA5nicYsHogMEMC40NYIEBDIuNzO8AQFkAaoLAZ8GxAOIpJEu";
    const decoded = g.QOL.settingsCode.deserialize(g.QOL.persistence.fromBase64Url(code.split(":")[1]));
    assert.equal(decoded.ENABLE_STAT_BONUSES, 1);
    assert.equal(decoded.STAT_BONUSES_SCALE, 150);
    assert.equal(decoded.STAT_BONUSES_Y_OFFSET, -400);
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
    assert.equal(imported.ok, true);
    assert.equal(imported.candidateConfig.TOP_BAR_SCALE, 2.73);
    for (const key of ["ENABLE_STAT_BONUSES", "STAT_BONUSES_SCALE", "STAT_BONUSES_X_OFFSET", "STAT_BONUSES_Y_OFFSET",
        "STAT_BONUSES_OPACITY", "STAT_BONUSES_HIDE_NORMAL", "STAT_BONUSES_HIDE_SCOREBOARD"]) {
        assert.equal(Object.hasOwn(imported.candidateConfig, key), false, key);
    }
});

test("published Active Stats IDs still decode while retired fields stay out of imported current settings", () => {
    const { global: g } = load();
    const raw = g.QOL.persistence.fromBase64Url(frozenCode.split(":")[1]);
    const decoded = g.QOL.settingsCode.deserialize(raw);
    const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(frozenCode);
    assert.equal(result.ok, true);
    for (const key of ["CROSSHAIR_STATS_SHOW_DAMAGEAMP", "CROSSHAIR_STATS_SHOW_BULLETEVASION"]) {
        assert.equal(decoded[key], 1, "published dictionary slots retain their original reference");
        assert.equal(Object.hasOwn(result.candidateConfig, key), false);
        assert.equal(Object.hasOwn(g.MOD_CONFIG, key), false);
    }
});
const codeSource = fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/ql_settings_code.js"), "utf8");
const withChecksum = bytes => {
    const checksum = Buffer.alloc(4); checksum.writeUInt32LE(crc32(bytes));
    return Buffer.concat([bytes, checksum]).toString("latin1");
};

test("production clipboard export is short and decodes the complete supplied configuration", () => {
    const { global: g, hud } = load();
    const config = { ...g.QOL_DEFAULT_CONFIG, ...sampleChanges };
    const code = g.QOL.ui.configTab.getCurrentExportSettingsString(config);
    assert.ok(code.startsWith("[QOL-4-1-0-C]:"), "compact codes display the release version");
    assert.ok(code.length <= 120, `Expected <=120 characters, received ${code.length}`);
    assert.equal(Buffer.from(code.split(":")[1], "base64url").subarray(2, 8).toString("hex"), "e0039cb144a3",
        "Both original readers recognize the frozen shared prefix");
    const payload = g.QOL.persistence.fromBase64Url(code.split(":")[1]);
    assert.deepEqual({ ...g.QOL_DEFAULT_CONFIG, ...hud.sandbox.global.QOL.core.codec.deserializeSettings(payload, "4.0.5") }, config);
    assert.equal(g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code).ok, true);
    assert.equal(g.QOL.persistence.serializeSettings(config).charAt(0), "{", "disk storage remains JSON");
    const frozenPayload = g.QOL.persistence.fromBase64Url(frozenCode.split(":")[1]);
    assert.deepEqual({ ...g.QOL_DEFAULT_CONFIG, ...plain(g.QOL.persistence.deserializeSettings(frozenPayload)) }, config,
        "previously published IDs and reference values must never change");
});

test("new exchange preserves changed fractions, wide coordinates, custom colors and Unicode", () => {
    const { global: g, hud } = load();
    const cfg = { ...g.QOL_DEFAULT_CONFIG, TOP_BAR_SCALE: 2.73,
        PLAYER_HEALTHBAR_X_OFFSET: 8000, SOULS_OPACITY: .73,
        DRAG_ENABLED: 0, AUTO_SAVE_CHANGES: 0, ENABLE_UPDATE_CHECKER: 0,
        STAMINA_CHARGE_COLOR: 0x112abef, ACTIVE_PRESET_NAME: "Тест 🐈 日本語\ud800" };
    const code = g.QOL.ui.configTab.getCurrentExportSettingsString(cfg);
    const raw = g.QOL.persistence.fromBase64Url(code.split(":")[1]);
    assert.deepEqual({ ...g.QOL_DEFAULT_CONFIG, ...hud.sandbox.global.QOL.core.codec.deserializeSettings(raw) }, cfg);
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
    assert.equal(imported.ok, true);
    assert.equal(imported.source, "settingsCode");
    for (const key of ["DRAG_ENABLED", "AUTO_SAVE_CHANGES", "ENABLE_UPDATE_CHECKER"]) {
        assert.equal(imported.candidateConfig[key], g.MOD_CONFIG[key]);
    }
});

test("every built-in preset round-trips through the production sharing writer and other realm", () => {
    const { global: g, hud } = load();
    for (const [name, preset] of Object.entries(g.QOL_PRESETS)) {
        const cfg = { ...g.QOL_DEFAULT_CONFIG, ...preset };
        const expected = JSON.parse(g.QOL.persistence.serializeSettings(cfg)).data;
        const code = g.QOL.ui.configTab.getCurrentExportSettingsString(cfg);
        const raw = g.QOL.persistence.fromBase64Url(code.split(":")[1]);
        const reader = hud.sandbox.global.QOL.core.codec;
        assert.deepEqual({ ...g.QOL_DEFAULT_CONFIG, ...reader.deserializeSettings(raw) }, expected, name);
        assert.deepEqual(plain(reader.deserializeSettings(g.QOL.persistence.serializeSettingsCode(cfg))), expected, name);
    }
});

test("the two published dictionary branches resolve their overlapping ID and re-export through the named envelope", () => {
    const { global: g, hud } = load();
    const importer = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics;
    const installed = importer(installedWouksCode);
    const git = importer(gitBreadCode);
    assert.equal(installed.ok, true);
    assert.equal(git.ok, true);
    const shopValues = {
        SHOP_STATS_X_OFFSET: 51, SHOP_STATS_Y_OFFSET: -76, SHOP_STATS_SCALE: 73, SHOP_STATS_OPACITY: 1,
        SHOP_QUICKBUY_X_OFFSET: 303, SHOP_QUICKBUY_Y_OFFSET: -40, SHOP_QUICKBUY_SCALE: 96, SHOP_QUICKBUY_OPACITY: 1
    };
    assert.equal(installed.candidateConfig.ENABLE_BETTER_BUILDS, 0);
    assert.equal(git.candidateConfig.ENABLE_BETTER_BUILDS, 1);
    assert.equal(git.candidateConfig.SHOP_STATS_X_OFFSET, 0);
    for (const [key, value] of Object.entries(shopValues)) assert.equal(installed.candidateConfig[key], value, key);

    const config = { ...installed.candidateConfig, ENABLE_BETTER_BUILDS: 1 };
    const token = g.QOL.ui.configTab.getCurrentExportSettingsString(config);
    assert.ok(token.startsWith("[QOL-4-1-0][QOL-4-0-5]:"));
    assert.match(g.QOL.ui.configTab.formatImportSettingsDisplayString(token),
        /^\[QOL-4-1-0\]\[QOL-4-0-5\]:[A-Za-z0-9_-]+\n[A-Za-z0-9_-]+$/);
    const result = importer(token);
    assert.equal(result.ok, true);
    assert.equal(result.source, "json");
    assert.deepEqual(plain(result.candidateConfig), config);
    assert.deepEqual(plain(hud.sandbox.global.QOL.core.codec.deserializeSettings(
        g.QOL.persistence.fromBase64Url(token.split(":")[1]), "4.0.5")), JSON.parse(g.QOL.persistence.serializeSettings(config)).data);

    assert.equal(g.QOL.ui.presets.applyPresetByName("Wouks"), true);
    // The retired Unspent Souls flag remains off for community presets.
    const expectedPreset = { ...installed.candidateConfig, ENABLE_UNSPENT_SOULS: 0 };
    assert.deepEqual(plain(g.MOD_CONFIG), expectedPreset);
});

test("new-code corruption, truncation and appended data reject before changing live settings", () => {
    const { global: g } = load();
    const code = g.QOL.ui.configTab.getCurrentExportSettingsString({ ...g.MOD_CONFIG, ...sampleChanges });
    const colon = code.indexOf(":");
    const raw = Buffer.from(code.slice(colon + 1), "base64url");
    const before = plain(g.MOD_CONFIG);
    const damaged = Buffer.from(raw); damaged[damaged.length - 1] ^= 1;
    for (const bytes of [damaged, raw.subarray(0, raw.length - 1), Buffer.concat([raw, Buffer.from([0])])]) {
        const invalid = code.slice(0, colon + 1) + bytes.toString("base64url");
        assert.equal(g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(invalid).ok, false);
        assert.deepEqual(plain(g.MOD_CONFIG), before);
    }
    assert.equal(g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code + "!").ok, false);
});

test("reference snapshots survive default changes, appended settings and later release tags", () => {
    const env = load(), g = env.global;
    const oldCode = g.QOL.ui.configTab.getCurrentExportSettingsString(g.QOL_DEFAULT_CONFIG);
    const oldPayload = g.QOL.persistence.fromBase64Url(oldCode.split(":")[1]);
    g.QOL_DEFAULT_CONFIG.MINIMAL_MINIMAP = 1;
    assert.equal(g.QOL.persistence.deserializeSettings(oldPayload).MINIMAL_MINIMAP, 0);
    // Simulate the next catalog in the actual module, including an unchanged
    // new field: it must still declare that field's existence to an old reader.
    env.settings.eval(codeSource.replace(
        "    ].map(entry =>", '        ,["FUTURE_SETTING",0]\n    ].map(entry =>'));
    g.QOL_DEFAULT_CONFIG.FUTURE_SETTING = 0;
    g.QOL.settings.fields.set("FUTURE_SETTING", { key: "FUTURE_SETTING", kind: "toggle" });
    assert.equal(g.QOL.persistence.deserializeSettings(oldPayload).MINIMAL_MINIMAP, 0);
    const newPayload = g.QOL.persistence.serializeSettingsCode(g.QOL_DEFAULT_CONFIG);
    const oldReader = env.hud.sandbox.global.QOL.core.codec;
    assert.throws(() => oldReader.deserializeSettings(newPayload), /Unsupported settings code/);
    delete g.QOL_DEFAULT_CONFIG.FUTURE_SETTING;
    g.QOL_SCHEMA_SEMVER = "4.0.6";
    assert.equal(g.QOL.persistence.deserializeSettings(oldPayload, "4.0.5").MINIMAL_MINIMAP, 0);
});

test("dictionary mismatches and unknown formats surface an update requirement without applying", () => {
    const { global: g } = load();
    const payload = Buffer.from(frozenCode.split(":")[1], "base64url");
    const before = plain(g.MOD_CONFIG);
    for (const index of [1, 4]) {
        const body = Buffer.from(payload.subarray(0, -4)); body[index] ^= 1;
        const code = "[QOL-4-0-5-C]:" + Buffer.from(withChecksum(body), "latin1").toString("base64url");
        const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
        assert.equal(result.ok, false);
        assert.equal(result.requiresUpdate, true);
        assert.deepEqual(plain(g.MOD_CONFIG), before);
    }
});

test("unsupported-code feedback is visible in English, Russian and an untranslated locale", () => {
    const body = Buffer.from(frozenCode.split(":")[1], "base64url").subarray(0, -4);
    body[1] = 2;
    const code = "[QOL-4-0-5-C]:" + Buffer.from(withChecksum(body), "latin1").toString("base64url");
    for (const [language, expected] of [
        [0, "Unsupported settings code. Update QOLLOCK and try again."],
        [1, "Этот код настроек не поддерживается. Обновите QOLLOCK и попробуйте снова."],
        [5, "Unsupported settings code. Update QOLLOCK and try again."]
    ]) {
        const env = load(), g = env.global;
        g.QOL.ui.window.setOpen(true); env.clock.advance(500);
        g.MOD_CONFIG.LANGUAGE = language;
        g.QOL.ui.configTab.render(env.list);
        env.em.FindChildTraverse("ConfigImportTextEntry").text = code;
        env.em.FindChildTraverse("ConfigApplyBtn")._fire("onactivate");
        assert.equal(env.em.FindChildTraverse("ConfigFeedbackLabel").text, expected);
    }
});

test("well-checksummed invalid records and missing dictionary registrations reject", () => {
    const { global: g } = load();
    const original = Buffer.from(frozenCode.split(":")[1], "base64url");
    // Hand-built invalid bodies reuse only the verified header (8 bytes).
    const header = original.subarray(0, 8);
    const bodies = [
        [0, 1], // no changes, but trailing data
        [1, 0x80, 0], // non-minimal varint
        [1, 0xff, 0x7f], // ID beyond the declared catalog
        [1, 1, 0], // record assigns the reference value again
        [1, 3, 0], // string for a numeric field
        [1, 2, 3, 78, 97, 78], // NaN
        [1, 2, 3, 49, 101, 48], // noncanonical 1e0
        [1, 3, 0xff, 0xff, 0x7f] // truncated text
    ];
    for (const body of bodies) {
        assert.throws(() => g.QOL.persistence.deserializeSettings(withChecksum(Buffer.concat([header, Buffer.from(body)]))),
            /Invalid settings code/);
    }
    const sourceConfig = plain(g.MOD_CONFIG);
    g.QOL_DEFAULT_CONFIG.UNREGISTERED_SETTING = 0;
    assert.throws(() => g.QOL.ui.configTab.getCurrentExportSettingsString(g.MOD_CONFIG), /Unsupported settings code/);
    assert.deepEqual(plain(g.MOD_CONFIG), sourceConfig);
});
