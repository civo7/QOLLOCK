"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");
const KEY = "Deadlock_Mod_Settings_v1", REV = "QOL_USER_EDIT_REV";

test("failed HUD payload writes cannot give stale data a newer settings revision", () => {
    const e = load(), g = e.global, hud = e.hud.root;
    g.MOD_CONFIG.SOULS_X_OFFSET = 50; g.SaveAndSync();
    const oldRaw = hud.GetAttributeString(KEY, ""), oldRev = hud.GetAttributeString(REV, "");
    const write = hud.SetAttributeString.bind(hud);
    hud.SetAttributeString = (key, value) => { if (key === KEY) throw Error("modeled payload rejection"); return write(key, value); };
    g.MOD_CONFIG.SOULS_X_OFFSET = 125; g.SaveAndSync();
    assert.equal(hud.GetAttributeString(KEY, ""), oldRaw);
    assert.equal(hud.GetAttributeString(REV, ""), oldRev, "failed payload must not promote stale HUD data");
    hud.SetAttributeString = write; g.SaveAndSync();
    assert.equal(JSON.parse(hud.GetAttributeString(KEY, "")).data.SOULS_X_OFFSET, 125);
    assert.equal(hud.GetAttributeString(KEY, ""), e.em.GetAttributeString(KEY, ""));
});

test("failed revision writes restore the old pair and a later identical save retries publication", () => {
    const e = load(), g = e.global, hud = e.hud.root;
    g.SaveAndSync();
    const oldRaw = hud.GetAttributeString(KEY, ""), oldRev = hud.GetAttributeString(REV, "");
    const write = hud.SetAttributeString.bind(hud);
    hud.SetAttributeString = (key, value) => key === REV ? false : write(key, value);
    g.MOD_CONFIG.SOULS_X_OFFSET = 250; g.SaveAndSync();
    assert.equal(hud.GetAttributeString(KEY, ""), oldRaw, "a rejected revision cannot leave an unversioned new payload");
    assert.equal(hud.GetAttributeString(REV, ""), oldRev);
    hud.SetAttributeString = write; g.SaveAndSync();
    assert.equal(JSON.parse(hud.GetAttributeString(KEY, "")).data.SOULS_X_OFFSET, 250);
    assert.ok(Number(hud.GetAttributeString(REV, "")) > Number(oldRev));
});

test("core publication deduplicates shared hosts and reports rejected pairs without caching attempts", () => {
    const e = load(), p = e.global.QOL.core.persistence, hud = e.hud.root;
    const writes = [], write = hud.SetAttributeString.bind(hud);
    hud.SetAttributeString = (key, value) => { writes.push([key, value]); return write(key, value); };
    const result = p.writeStorageConfigRawToUi(hud, "accepted");
    assert.equal(writes.filter(([key]) => key === REV).length, 1, "root === Hud is one publication host");
    assert.equal(result.acceptedCount, 1); assert.equal(result.complete, true);
    const oldRev = hud.GetAttributeString(REV, "");
    hud.SetAttributeString = (key, value) => key === KEY ? false : write(key, value);
    const rejected = p.writeStorageConfigRawToUi(hud, "rejected");
    assert.equal(rejected.acceptedCount, 0); assert.equal(rejected.complete, false);
    assert.equal(hud.GetAttributeString(REV, ""), oldRev);
    assert.equal(p.readStorageConfigRawFromUi(hud), "accepted");
});

test("settings import and save use the HUD normalization chain after live config replacement", () => {
    const e = load(), g = e.global;
    const defaults = e.hud.sandbox.evalJson("QOL.buildDefaultConfig()");
    const input = { MINIMAP_LARGE_SIZE: 820, ZOOM_X_OFFSET: 60, HEALTHBAR_TYPE: 2, DEFAULT_HERO: "unknown_hero", ENABLE_ENEMY_COLOR_WARNING: 1 };
    const expected = e.hud.sandbox.evalJson(`QOL.mergeConfig(${JSON.stringify(input)})`);
    g.MOD_CONFIG = { ...defaults };
    g.QOL.persistence.applyParsedConfig(input);
    for (const key of Object.keys(expected)) assert.equal(g.MOD_CONFIG[key], expected[key], key);
    g.MOD_CONFIG.DEFAULT_HERO = "unknown_hero";
    g.SaveAndSync();
    const published = JSON.parse(e.em.GetAttributeString(KEY, "")).data;
    assert.equal(published.DEFAULT_HERO, expected.DEFAULT_HERO);
    assert.equal(g.QOL.getSettingsConfig(), g.MOD_CONFIG);
});
