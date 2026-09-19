// import_translations.js — write a filled translator CSV back into the locale files.
//
// Counterpart to scripts/export_translations.js. Reads a CSV with an "English" column plus one
// column per language (Russian, Ukrainian, ...) and merges every non-empty cell into the matching
// ql_settings_loc_<lang>.js file.
//
// Merge semantics (safe by default):
//   - A non-empty cell sets/overrides that language's translation for the English key.
//   - An empty cell leaves the existing in-code translation untouched (so a partial sheet never
//     wipes existing work).
//   - Existing key order is preserved; brand-new keys are appended at the end of the map.
//
// Usage:
//   node scripts/import_translations.js [path/to/filled.csv]
// Default CSV: translations/qollock_settings_translations.csv
//
// After importing, validate with:
//   npm test

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { PROJECT_ROOT, LOCALES_DIR, LANGUAGES, loadLocaleMaps, saveLocaleFile } = require("./locales_helper");

const inPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(PROJECT_ROOT, "translations", "qollock_settings_translations.csv");

// ── RFC 4180 CSV parser (handles quoted fields, "" escapes, embedded commas/newlines, CRLF) ──
function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(field); field = "";
        } else if (c === "\n") {
            row.push(field); field = ""; rows.push(row); row = [];
        } else if (c === "\r") {
            if (text[i + 1] !== "\n") { row.push(field); field = ""; rows.push(row); row = []; }
        } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
}

function main() {
    if (!fs.existsSync(inPath)) {
        console.error("[translations] CSV not found: " + inPath);
        process.exit(1);
    }

    const csvText = fs.readFileSync(inPath, "utf8");
    const rows = parseCsv(csvText);
    if (rows.length < 2) {
        console.error("[translations] CSV is empty or has no data rows");
        process.exit(1);
    }

    const header = rows[0].map(h => h.trim());
    const enIdx = header.indexOf("English");
    if (enIdx === -1) {
        console.error("[translations] CSV missing required 'English' header column");
        process.exit(1);
    }

    // Map column index -> language definition
    const colToLang = new Map();
    for (let col = 0; col < header.length; col++) {
        if (col === enIdx) continue;
        const name = header[col];
        const lang = LANGUAGES.find(l => l.header.toLowerCase() === name.toLowerCase());
        if (lang) {
            colToLang.set(col, lang);
        } else {
            console.warn(`[translations] Warning: unknown language column '${name}' in CSV — skipping`);
        }
    }

    const { maps, keyOrders } = loadLocaleMaps();

    // Data rows
    const stats = {};
    for (const lang of LANGUAGES) {
        stats[lang.code] = { updated: 0, added: 0 };
    }

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length <= enIdx) continue;
        const enKey = row[enIdx];
        if (!enKey || !enKey.trim()) continue;

        for (const [col, lang] of colToLang.entries()) {
            const rawVal = row[col];
            if (rawVal === undefined || rawVal === null) continue;
            const val = String(rawVal).trim();
            if (val === "") continue; // blanks are safe, never erase work

            const map = maps[lang.code];
            const order = keyOrders[lang.code];

            if (Object.prototype.hasOwnProperty.call(map, enKey)) {
                if (map[enKey] !== val) {
                    map[enKey] = val;
                    stats[lang.code].updated++;
                }
            } else {
                map[enKey] = val;
                order.push(enKey);
                stats[lang.code].added++;
            }
        }
    }

    // Write updated maps back
    for (const lang of LANGUAGES) {
        if (lang.code === "en") continue;
        const s = stats[lang.code];
        if (s.updated > 0 || s.added > 0) {
            saveLocaleFile(lang, keyOrders[lang.code], maps[lang.code]);
            execSync(`node --check ${path.join(LOCALES_DIR, lang.file)}`);
            console.log(`[translations] ${lang.header.padEnd(16)} updated: ${s.updated}, added: ${s.added}`);
        } else {
            console.log(`[translations] ${lang.header.padEnd(16)} unchanged`);
        }
    }

    console.log("[translations] Import completed successfully.");
}

main();
