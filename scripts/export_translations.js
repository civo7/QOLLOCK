// export_translations.js — reconstruct the translator spreadsheet from the in-code language maps.
//
// QOLLOCK's settings UI is localized via per-language string maps in
// panorama/scripts/ql_settings_loc/ql_settings_loc_<lang>.js.
// English is the source. This script loads those maps and writes a single CSV
// with one row per English string and one column per language, filling in
// existing translations and leaving blanks where a translation is missing.
//
// Usage:
//   node scripts/export_translations.js
// Output:
//   translations/qollock_settings_translations.csv   (import this into Google Sheets, share it)
//
// Round-trip: translators fill the blanks, you export the sheet back to CSV and run
//   node scripts/import_translations.js <that.csv>
// to write the translations back into the locale files.

"use strict";

const fs = require("fs");
const path = require("path");
const { PROJECT_ROOT, LANGUAGES, loadLocaleMaps } = require("./locales_helper");

const outDir = path.join(PROJECT_ROOT, "translations");
const outPath = path.join(outDir, "qollock_settings_translations.csv");

const EXTRA_SOURCE_STRINGS = [];

// ── CSV (RFC 4180) ──
function csvCell(value) {
    const s = String(value === undefined || value === null ? "" : value);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function main() {
    const { maps } = loadLocaleMaps();

    // English alone owns the source inventory. Orphan translations must never
    // resurrect retired source strings during export.
    const keySet = new Set(Object.keys(maps.en));
    for (const s of EXTRA_SOURCE_STRINGS) keySet.add(s);

    const nonEnLangs = LANGUAGES.filter(l => l.code !== "en");

    function missingCount(key) {
        let n = 0;
        for (const lang of nonEnLangs) {
            const m = maps[lang.code] || {};
            const val = Object.prototype.hasOwnProperty.call(m, key) ? m[key] : "";
            if (!val || val.trim() === "") n++;
        }
        return n;
    }

    const missingByKey = new Map();
    for (const key of keySet) missingByKey.set(key, missingCount(key));

    const lc = (s) => s.toLowerCase();
    const keys = Array.from(keySet).sort((a, b) => {
        const ma = missingByKey.get(a), mb = missingByKey.get(b);
        const tierA = ma === 0 ? 0 : 1, tierB = mb === 0 ? 0 : 1;
        if (tierA !== tierB) return tierA - tierB;          // fully translated first
        if (tierA === 1 && ma !== mb) return ma - mb;       // fewer missing first
        return lc(a) < lc(b) ? -1 : (lc(a) > lc(b) ? 1 : 0);
    });

    const lines = [];
    lines.push(LANGUAGES.map(l => csvCell(l.header)).join(","));

    const coverage = {};
    for (const lang of LANGUAGES) coverage[lang.header] = 0;

    for (const key of keys) {
        const row = [csvCell(key)];
        coverage["English"]++;
        for (const lang of nonEnLangs) {
            const m = maps[lang.code] || {};
            const val = Object.prototype.hasOwnProperty.call(m, key) ? m[key] : "";
            if (val && val.trim() !== "") coverage[lang.header]++;
            row.push(csvCell(val));
        }
        lines.push(row.join(","));
    }

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    // UTF-8 BOM so Excel/Google Sheets read Cyrillic/CJK correctly.
    fs.writeFileSync(outPath, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");

    console.log(`[translations] wrote ${keys.length} strings -> ${path.relative(PROJECT_ROOT, outPath)}`);
    console.log("[translations] coverage (translated / total):");
    for (const lang of LANGUAGES) {
        if (lang.code === "en") continue;
        const have = coverage[lang.header];
        const pct = keys.length ? (have / keys.length * 100).toFixed(1) : "0.0";
        const missing = keys.length - have;
        console.log(`  ${lang.header.padEnd(16)} ${String(have).padStart(4)} / ${keys.length}  (${String(pct).padStart(3)}%, ${String(missing).padStart(3)} missing)`);
    }
}

main();
