"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { PROJECT_ROOT, LANGUAGES, loadLocaleMaps } = require("./locales_helper");
const { planImport, applyWrites, report } = require("./translation_io");
function parseCsv(text) {
    text = text.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [], field = "", quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { quoted = false; closed = true; }
            } else field += c;
        } else if (c === ",") {
            row.push(field); field = ""; closed = false;
        } else if (c === "\r" || c === "\n") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field); rows.push(row); row = []; field = ""; closed = false;
        } else if (c === '"' && !field && !closed) quoted = true;
        else if (closed || c === '"') throw new Error("Malformed CSV quoting");
        else field += c;
    }
    if (quoted) throw new Error("Unclosed CSV quote");
    if (field || row.length || closed) { row.push(field); rows.push(row); }
    return rows;
}
function readCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSV has no data rows");
    const header = rows.shift().map(value => value.trim());
    if (new Set(header.map(value => value.toLowerCase())).size !== header.length) throw new Error("Duplicate CSV headers");
    const english = header.indexOf("English");
    if (english < 0) throw new Error("Missing English header");
    const columns = header.map(name => LANGUAGES.find(lang => lang.header.toLowerCase() === name.toLowerCase()));
    const warnings = header.filter((name, i) => !columns[i]).map(name => `Unsupported column skipped: ${name}`);
    const catalogs = Object.create(null), seen = new Set();
    for (const row of rows) {
        if (row.every(value => !value.trim())) continue;
        if (row.length !== header.length) throw new Error("CSV row has wrong column count");
        const key = row[english];
        if (!key.trim()) throw new Error("Missing English key");
        if (seen.has(key)) throw new Error(`Duplicate CSV key: ${key}`);
        seen.add(key);
        columns.forEach((lang, index) => {
            if (!lang || lang.code === "en") return;
            catalogs[lang.code] ||= Object.create(null);
            catalogs[lang.code][key] = row[index];
        });
    }
    return { catalogs, warnings };
}
function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg.startsWith("--") && !["--dry-run", "--json"].includes(arg))) throw new Error("Unknown CSV import option");
    const positions = args.filter(arg => !arg.startsWith("--"));
    if (positions.length > 1) throw new Error("Expected one CSV path");
    const file = path.resolve(positions[0] || path.join(PROJECT_ROOT, "translations/qollock_settings_translations.csv"));
    const { catalogs, warnings } = readCsv(fs.readFileSync(file, "utf8"));
    const plan = planImport(loadLocaleMaps(), catalogs);
    if (args.includes("--json")) console.log(JSON.stringify({ ...plan, writes: undefined, warnings }, null, 2));
    else report(plan, warnings);
    if (!args.includes("--dry-run")) applyWrites(plan.writes);
}
if (require.main === module) {
    try { main(); } catch (error) { console.error(`[translations] ${error.message}`); process.exitCode = 1; }
}
module.exports = { parseCsv, readCsv };

