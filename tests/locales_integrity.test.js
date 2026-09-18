// tests/locales_integrity.test.js
// =============================================================================
// Validates integrity of all 15 locale files in panorama/scripts/ql_settings_loc/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { LANGUAGES, loadLocaleMaps } = require("../scripts/locales_helper");

test("locales: all 15 locale files exist and load into SETTINGS_LOCALE_TEXT", () => {
    const { maps } = loadLocaleMaps();
    assert.strictEqual(LANGUAGES.length, 15, "Expected 15 supported languages");

    for (const lang of LANGUAGES) {
        assert.ok(maps[lang.code], `Language map for '${lang.code}' must exist`);
        const count = Object.keys(maps[lang.code]).length;
        if (lang.code === "it") {
            assert.ok(count >= 50, `Italian map should have at least 50 entries, found ${count}`);
        } else {
            assert.ok(count >= 800, `Language map '${lang.code}' should have >= 800 entries, found ${count}`);
        }
    }
});

test("locales: english identity map has key === value for all entries", () => {
    const { maps } = loadLocaleMaps();
    const enMap = maps.en;
    assert.ok(enMap, "English map must exist");

    for (const [k, v] of Object.entries(enMap)) {
        assert.strictEqual(v, k, `English map entry for "${k}" must equal its key`);
    }
});

test("locales: no keys contain malformed HTML tags or chopped markup", () => {
    const { maps } = loadLocaleMaps();
    const enMap = maps.en;

    for (const [k, v] of Object.entries(enMap)) {
        // Must not start with a rogue closing tag or lone '>'
        assert.ok(!k.startsWith(">"), `Key should not start with lone '>': "${k}"`);

        // Check matched <font> and </font>
        const openFont = (k.match(/<font\b[^>]*>/gi) || []).length;
        const closeFont = (k.match(/<\/font>/gi) || []).length;
        assert.strictEqual(
            openFont,
            closeFont,
            `Mismatched <font> tags in key: "${k}" (open: ${openFont}, close: ${closeFont})`
        );
    }
});

test("locales: all non-English maps share keys defined in English map", () => {
    const { maps } = loadLocaleMaps();
    const enKeys = new Set(Object.keys(maps.en));

    for (const lang of LANGUAGES) {
        if (lang.code === "en") continue;
        const dict = maps[lang.code];
        const orphans = [];
        for (const k of Object.keys(dict)) {
            if (!enKeys.has(k)) {
                orphans.push(k);
            }
        }
        assert.strictEqual(
            orphans.length,
            0,
            `Language '${lang.code}' has ${orphans.length} orphan keys not in English: ${orphans.slice(0, 5).join(", ")}`
        );
    }
});
