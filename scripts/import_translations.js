// import_translations.js — write a filled translator CSV back into the ql_settings.js language maps.
//
// Counterpart to scripts/export_translations.js. Reads a CSV with an "English" column plus one
// column per language (Russian, Ukrainian, ...) and merges every non-empty cell into the matching
// SETTINGS_XX_TEXT map in ql_settings.js.
//
// Merge semantics (safe by default):
//   - A non-empty cell sets/overrides that language's translation for the English key.
//   - An empty cell leaves the existing in-code translation untouched (so a partial sheet never
//     wipes existing work).
//   - Existing key order is preserved; brand-new keys are appended (sorted) at the end of the map.
//
// Usage:
//   node scripts/import_translations.js [path/to/filled.csv]
// Default CSV: translations/qollock_settings_translations.csv
//
// After importing, validate and repack:
//   node --check panorama/scripts/ql_settings.js

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const settingsPath = path.join(projectRoot, "panorama", "scripts", "ql_settings.js");
const inPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(projectRoot, "translations", "qollock_settings_translations.csv");

// CSV header label -> in-code map variable. English is the key column (no map).
const LANGUAGES = [
    { header: "English", mapVar: null },
    { header: "Russian", mapVar: "SETTINGS_RU_TEXT" },
    { header: "Ukrainian", mapVar: "SETTINGS_UK_TEXT" },
    { header: "Polish", mapVar: "SETTINGS_PL_TEXT" },
    { header: "Bulgarian", mapVar: "SETTINGS_BG_TEXT" },
    { header: "Belarusian", mapVar: "SETTINGS_BY_TEXT" },
    { header: "Japanese", mapVar: "SETTINGS_JA_TEXT" },
    { header: "Chinese", mapVar: "SETTINGS_ZH_TEXT" },
    { header: "French", mapVar: "SETTINGS_FR_TEXT" },
    { header: "Portuguese", mapVar: "SETTINGS_PT_TEXT" },
    { header: "BR Portuguese", mapVar: "SETTINGS_PT_BR_TEXT" },
    { header: "Spanish", mapVar: "SETTINGS_ES_TEXT" }
];

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
            // swallow; \n handles row break (CRLF) or lone \r below
            if (text[i + 1] !== "\n") { row.push(field); field = ""; rows.push(row); row = []; }
        } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
}

// ── JS double-quoted string literal, matching the existing file's escaping ──
function jsString(s) {
    return '"' + String(s)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t") + '"';
}

// Read the existing map's keys IN FILE ORDER directly from the block text, so we can preserve
// ordering and re-emit unchanged entries byte-for-byte. Returns { order: [keys], values: {k:v} }
// by parsing the object literal lines (each entry is on its own line: "key": "value",).
function readExistingBlock(blockBody) {
    const order = [], values = {};
    // Match one entry per line: optional whitespace, "key" : "value" , (key/value may contain \" ).
    const entryRe = /^\s*("(?:\\.|[^"\\])*")\s*:\s*("(?:\\.|[^"\\])*")\s*,?\s*$/;
    const lines = blockBody.split("\n");
    for (const line of lines) {
        if (!line.trim()) continue;
        const m = line.match(entryRe);
        if (!m) {
            throw new Error("Unparseable map entry line: " + line);
        }
        const k = JSON.parse(m[1]);
        const v = JSON.parse(m[2]);
        if (!Object.prototype.hasOwnProperty.call(values, k)) order.push(k);
        values[k] = v;
    }
    return { order: order, values: values };
}

function emitBlock(varName, order, values, eol) {
    const lines = [];
    lines.push("const " + varName + " = {");
    for (let i = 0; i < order.length; i++) {
        const k = order[i];
        const comma = (i === order.length - 1) ? "" : ",";
        lines.push("    " + jsString(k) + ": " + jsString(values[k]) + comma);
    }
    lines.push("};");
    return lines.join(eol);
}

function main() {
    if (!fs.existsSync(inPath)) {
        console.error("[translations] CSV not found: " + inPath);
        process.exit(1);
    }
    const rows = parseCsv(fs.readFileSync(inPath, "utf8")).filter(r => r.length && r.some(c => c !== ""));
    if (!rows.length) { console.error("[translations] empty CSV"); process.exit(1); }

    const header = rows[0].map(h => h.trim());
    // Map each language to its column index by header label.
    const colByMapVar = {};
    let englishCol = -1;
    for (const lang of LANGUAGES) {
        const idx = header.indexOf(lang.header);
        if (lang.mapVar === null) englishCol = idx;
        else if (idx >= 0) colByMapVar[lang.mapVar] = idx;
    }
    if (englishCol < 0) { console.error("[translations] no 'English' column in header: " + header.join("|")); process.exit(1); }

    // Gather CSV translations per map: { mapVar: { english: translation } } (non-empty cells only).
    const csvByMap = {};
    for (const lang of LANGUAGES) if (lang.mapVar) csvByMap[lang.mapVar] = {};
    for (let r = 1; r < rows.length; r++) {
        const eng = rows[r][englishCol];
        if (eng === undefined || eng === "") continue;
        for (const mapVar of Object.keys(colByMapVar)) {
            const val = rows[r][colByMapVar[mapVar]];
            if (val !== undefined && val !== "") csvByMap[mapVar][eng] = val;
        }
    }

    let src = fs.readFileSync(settingsPath, "utf8");
    const summary = [];
    for (const lang of LANGUAGES) {
        if (!lang.mapVar) continue;
        const varName = lang.mapVar;
        if (!Object.prototype.hasOwnProperty.call(colByMapVar, varName)) continue; // column absent

        const declMarker = "const " + varName + " = {";
        const declStart = src.indexOf(declMarker);
        if (declStart < 0) { console.error("[translations] map not found: " + varName); process.exit(1); }
        const bodyStart = declStart + declMarker.length;
        const endIdx = src.indexOf("\n};", bodyStart);
        if (endIdx < 0) { console.error("[translations] map close not found: " + varName); process.exit(1); }
        const blockBody = src.slice(bodyStart, endIdx);
        const eol = blockBody.indexOf("\r\n") >= 0 ? "\r\n" : "\n"; // preserve the block's endings

        const existing = readExistingBlock(blockBody);
        const csv = csvByMap[varName];

        // Preserve original order; new keys appended (sorted) at the end.
        const order = existing.order.slice();
        const values = Object.assign({}, existing.values);
        let updated = 0, added = 0;
        const newKeys = [];
        for (const key of Object.keys(csv)) {
            if (Object.prototype.hasOwnProperty.call(values, key)) {
                if (values[key] !== csv[key]) { values[key] = csv[key]; updated++; }
            } else {
                newKeys.push(key);
            }
        }
        newKeys.sort();
        for (const key of newKeys) { values[key] = csv[key]; order.push(key); added++; }

        const newBlock = emitBlock(varName, order, values, eol);
        src = src.slice(0, declStart) + newBlock + src.slice(endIdx + "\n};".length);
        summary.push({ lang: lang.header, total: order.length, updated: updated, added: added });
    }

    fs.writeFileSync(settingsPath, src, "utf8");
    console.log("[translations] merged " + path.relative(projectRoot, inPath) + " -> panorama/scripts/ql_settings.js");
    for (const s of summary) {
        console.log("  " + s.lang.padEnd(14) + " total " + String(s.total).padStart(4) +
            "   updated " + String(s.updated).padStart(3) + "   added " + String(s.added).padStart(3));
    }
    console.log("[translations] now run: node --check panorama/scripts/ql_settings.js  (then repack the VPK)");
}

main();
