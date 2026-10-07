// scripts/locales_helper.js — Shared helper for QOLLOCK locale files.
// Handles loading, parsing, and writing panorama/scripts/ql_settings_loc/*.js files.

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("node:vm");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(PROJECT_ROOT, "panorama", "scripts", "ql_settings_loc");

const LANGUAGES = [
    { header: "English", code: "en", fileSuffix: "en", file: "ql_settings_loc_en.js", wbCode: "en" },
    { header: "Russian", code: "ru", fileSuffix: "ru", file: "ql_settings_loc_ru.js", wbCode: "ru" },
    { header: "Ukrainian", code: "uk", fileSuffix: "uk", file: "ql_settings_loc_uk.js", wbCode: "uk" },
    { header: "Polish", code: "pl", fileSuffix: "pl", file: "ql_settings_loc_pl.js", wbCode: "pl" },
    { header: "Bulgarian", code: "bg", fileSuffix: "bg", file: "ql_settings_loc_bg.js", wbCode: "bg" },
    { header: "Belarusian", code: "by", fileSuffix: "by", file: "ql_settings_loc_by.js", wbCode: "be" },
    { header: "Japanese", code: "ja", fileSuffix: "ja", file: "ql_settings_loc_ja.js", wbCode: "ja" },
    { header: "Korean", code: "ko", fileSuffix: "ko", file: "ql_settings_loc_ko.js", wbCode: "ko" },
    { header: "Chinese", code: "zh", fileSuffix: "zh", file: "ql_settings_loc_zh.js", wbCode: "zh-CN" },
    { header: "French", code: "fr", fileSuffix: "fr", file: "ql_settings_loc_fr.js", wbCode: "fr" },
    { header: "Italian", code: "it", fileSuffix: "it", file: "ql_settings_loc_it.js", wbCode: "it" },
    { header: "Turkish", code: "tr", fileSuffix: "tr", file: "ql_settings_loc_tr.js", wbCode: "tr" },
    { header: "Portuguese", code: "pt", fileSuffix: "pt", file: "ql_settings_loc_pt.js", wbCode: "pt" },
    { header: "BR Portuguese", code: "pt-br", fileSuffix: "pt_br", file: "ql_settings_loc_pt_br.js", wbCode: "pt-BR" },
    { header: "Spanish", code: "es", fileSuffix: "es", file: "ql_settings_loc_es.js", wbCode: "es" }
];

function jsString(s) {
    return JSON.stringify(String(s === undefined || s === null ? "" : s));
}

function loadLocaleMaps(localesDir = LOCALES_DIR) {
    const maps = {};
    const keyOrders = {};
    const sandbox = { globalThis: {}, window: {} };

    for (const lang of LANGUAGES) {
        const filePath = path.join(localesDir, lang.file);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Missing runtime locale: ${filePath}`);
        }
        const content = fs.readFileSync(filePath, "utf8");
        vm.runInNewContext(content, sandbox, { filename: filePath, timeout: 1000 });

        // Also extract key order from file lines
        const order = [];
        const entryRe = /^\s*("(?:\\.|[^"\\])*")\s*:\s*("(?:\\.|[^"\\])*")\s*,?\s*$/;
        for (const line of content.split("\n")) {
            const m = line.match(entryRe);
            if (m) {
                try {
                    const k = JSON.parse(m[1]);
                    if (order.includes(k)) throw new Error(`Duplicate key in ${filePath}: ${k}`);
                    order.push(k);
                } catch (error) { throw new Error(`Invalid locale entry in ${filePath}: ${error.message}`); }
            }
        }
        keyOrders[lang.code] = order;
    }

    const dicts = sandbox.globalThis.SETTINGS_LOCALE_TEXT || {};
    for (const lang of LANGUAGES) {
        maps[lang.code] = dicts[lang.code];
        if (!maps[lang.code] || !Object.keys(maps[lang.code]).length) throw new Error(`Empty runtime locale: ${lang.code}`);
        for (const [key, value] of Object.entries(maps[lang.code])) {
            if (!key || typeof value !== "string") throw new Error(`Invalid runtime entry: ${lang.code}/${key}`);
            if (lang.code === "en" && key !== value) throw new Error(`English must be an identity map: ${key}`);
        }
        if (keyOrders[lang.code].length !== Object.keys(maps[lang.code]).length) {
            throw new Error(`Unrecognized locale entry syntax: ${lang.file}`);
        }
    }

    for (const lang of LANGUAGES) for (const key of Object.keys(maps[lang.code])) {
        if (!Object.hasOwn(maps.en, key)) throw new Error(`Orphan runtime key: ${lang.code}/${key}`);
    }

    return { maps, keyOrders };
}

function emitLocaleFile(langDef, order, values, eol = "\n") {
    const lines = [
        `// ${langDef.file} — QOLLOCK settings locale (${langDef.fileSuffix})`,
        `// English source keys; maintained through scripts/import_locales_json.js or CSV import.`,
        `(function() {`,
        `    'use strict';`,
        `    var _root = (typeof globalThis !== "undefined") ? globalThis : (typeof window !== "undefined") ? window : {};`,
        `    if (!_root.SETTINGS_LOCALE_TEXT) _root.SETTINGS_LOCALE_TEXT = {};`,
        `    _root.SETTINGS_LOCALE_TEXT[${JSON.stringify(langDef.code)}] = {`
    ];

    for (let i = 0; i < order.length; i++) {
        const k = order[i];
        if (!Object.prototype.hasOwnProperty.call(values, k)) continue;
        const v = values[k];
        const isLast = (i === order.length - 1);
        lines.push(`    ${jsString(k)}: ${jsString(v)}${isLast ? "" : ","}`);
    }

    lines.push(`};`);
    lines.push(`})();`);
    lines.push(``);

    return lines.join(eol);
}

function saveLocaleFile(langDef, order, values) {
    const filePath = path.join(LOCALES_DIR, langDef.file);
    const content = emitLocaleFile(langDef, order, values);
    fs.writeFileSync(filePath, content, "utf8");
}

module.exports = {
    PROJECT_ROOT,
    LOCALES_DIR,
    LANGUAGES,
    jsString,
    loadLocaleMaps,
    emitLocaleFile,
    saveLocaleFile
};
