// import_locales_json.js — merge i18next JSON locale files back into the ql_settings.js maps.
//
// Counterpart to export_locales_json.js. Reads one or more <lang>/translation.json files (the shape
// the grimoire-translate workbench opens PRs with) and merges every non-empty value into the
// matching SETTINGS_XX_TEXT map in ql_settings.js — the maps stay the single source of truth that
// compiles into the VPK.
//
// Merge semantics (safe by default, identical to import_translations.js):
//   - A non-empty value sets/overrides that language's translation for the English key.
//   - A blank/absent value leaves the existing in-code translation untouched.
//   - Existing key order is preserved; brand-new keys are appended (sorted) at the end of the map.
//
// Key handling: the file is read with the same flatten as the workbench (catalog.ts flattenValues),
// so both FLAT files (what we emit / what a fork patched to opaque keys produces) and any nested
// file are accepted. A nested file only round-trips correctly when keys are collision-free — emit
// flat (see export_locales_json.js) to stay safe.
//
// Usage:
//   node scripts/import_locales_json.js [path]
//     path = a single translation.json, a <lang> directory, or the locales/ root (imports every
//     language found). Default: translations/locales
//   Language code is taken from the parent directory name (locales/<code>/translation.json) or a
//   "<code>-translation.json" filename.
//
// After importing, validate and repack:
//   node --check panorama/scripts/ql_settings.js

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const settingsPath = path.join(projectRoot, "panorama", "scripts", "ql_settings.js");
const defaultRoot = path.join(projectRoot, "translations", "locales");

// i18next locale code -> in-code map variable. MUST match export_locales_json.js. The English
// source ("en") has no map (it is the key column) and is ignored on import.
const CODE_TO_MAPVAR = {
    ru: "SETTINGS_RU_TEXT", uk: "SETTINGS_UK_TEXT", pl: "SETTINGS_PL_TEXT", bg: "SETTINGS_BG_TEXT",
    be: "SETTINGS_BY_TEXT", ja: "SETTINGS_JA_TEXT", zh: "SETTINGS_ZH_TEXT", fr: "SETTINGS_FR_TEXT",
    pt: "SETTINGS_PT_TEXT", "pt-BR": "SETTINGS_PT_BR_TEXT", es: "SETTINGS_ES_TEXT",
    ko: "SETTINGS_KO_TEXT", it: "SETTINGS_IT_TEXT", tr: "SETTINGS_TR_TEXT"
};

// ── i18next flatten (identical to grimoire-translate src/lib/catalog.ts) ──
function flattenValues(obj) {
    const out = {};
    (function visit(value, prefix) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            for (const k of Object.keys(value)) visit(value[k], prefix ? prefix + "." + k : k);
            return;
        }
        if (typeof value === "string") out[prefix] = value;
    })(obj, "");
    return out;
}

// ── JS double-quoted string literal, matching the existing file's escaping (from import_translations.js) ──
function jsString(s) {
    return '"' + String(s)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t") + '"';
}

// Read the existing map's keys IN FILE ORDER from the block text (from import_translations.js).
function readExistingBlock(blockBody) {
    const order = [], values = {};
    const entryRe = /^\s*("(?:\\.|[^"\\])*")\s*:\s*("(?:\\.|[^"\\])*")\s*,?\s*$/;
    for (const line of blockBody.split("\n")) {
        if (!line.trim()) continue;
        const m = line.match(entryRe);
        if (!m) throw new Error("Unparseable map entry line: " + line);
        const k = JSON.parse(m[1]);
        const v = JSON.parse(m[2]);
        if (!Object.prototype.hasOwnProperty.call(values, k)) order.push(k);
        values[k] = v;
    }
    return { order: order, values: values };
}

function emitBlock(varName, order, values, eol) {
    const lines = ["const " + varName + " = {"];
    for (let i = 0; i < order.length; i++) {
        const k = order[i];
        lines.push("    " + jsString(k) + ": " + jsString(values[k]) + (i === order.length - 1 ? "" : ","));
    }
    lines.push("};");
    return lines.join(eol);
}

// Resolve a translation.json path to its locale code, then to a map variable.
function mapVarForFile(file) {
    const base = path.basename(file);
    let code = null;
    const fnMatch = base.match(/^(.+)-translation\.json$/i); // workbench download: "pt-BR-translation.json"
    if (fnMatch) code = fnMatch[1];
    else if (/^translation\.json$/i.test(base)) code = path.basename(path.dirname(file)); // locales/<code>/translation.json
    if (!code) return null;
    if (code === "en") return null; // source catalog, not a target map
    return { code: code, mapVar: CODE_TO_MAPVAR[code] || null };
}

// Collect every translation.json under a path (file or directory).
function collectFiles(target) {
    const stat = fs.statSync(target);
    if (stat.isFile()) return [target];
    const out = [];
    for (const entry of fs.readdirSync(target)) {
        const full = path.join(target, entry);
        if (fs.statSync(full).isDirectory()) out.push(...collectFiles(full));
        else if (/(^|[-/\\])translation\.json$/i.test(entry) || /-translation\.json$/i.test(entry)) out.push(full);
    }
    return out;
}

function main() {
    const target = process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot;
    if (!fs.existsSync(target)) { console.error("[locales] path not found: " + target); process.exit(1); }

    // file -> { mapVar, code, translations:{english:value} }
    const jobs = [];
    for (const file of collectFiles(target)) {
        const resolved = mapVarForFile(file);
        if (!resolved) continue; // en source or unrecognized name
        if (!resolved.mapVar) {
            console.error(`[locales] unknown locale code "${resolved.code}" (${path.relative(projectRoot, file)}); skipping`);
            continue;
        }
        let parsed;
        try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); }
        catch (e) { console.error(`[locales] bad JSON ${path.relative(projectRoot, file)}: ${e.message}`); process.exit(1); }
        jobs.push({ file: file, code: resolved.code, mapVar: resolved.mapVar, translations: flattenValues(parsed) });
    }
    if (!jobs.length) { console.error("[locales] no translatable locale files found under " + target); process.exit(1); }

    let src = fs.readFileSync(settingsPath, "utf8");
    const summary = [];
    for (const job of jobs) {
        const varName = job.mapVar;
        const declMarker = "const " + varName + " = {";
        const declStart = src.indexOf(declMarker);
        if (declStart < 0) { console.error("[locales] map not found in ql_settings.js: " + varName); process.exit(1); }
        const bodyStart = declStart + declMarker.length;
        const endIdx = src.indexOf("\n};", bodyStart);
        if (endIdx < 0) { console.error("[locales] map close not found: " + varName); process.exit(1); }
        const blockBody = src.slice(bodyStart, endIdx);
        const eol = blockBody.indexOf("\r\n") >= 0 ? "\r\n" : "\n";

        const existing = readExistingBlock(blockBody);
        const order = existing.order.slice();
        const values = Object.assign({}, existing.values);
        let updated = 0, added = 0;
        const newKeys = [];
        for (const key of Object.keys(job.translations)) {
            const val = job.translations[key];
            if (val === undefined || val === "") continue; // blank: leave existing untouched
            if (Object.prototype.hasOwnProperty.call(values, key)) {
                if (values[key] !== val) { values[key] = val; updated++; }
            } else {
                newKeys.push(key);
            }
        }
        newKeys.sort();
        for (const key of newKeys) { values[key] = job.translations[key]; order.push(key); added++; }

        src = src.slice(0, declStart) + emitBlock(varName, order, values, eol) + src.slice(endIdx + "\n};".length);
        summary.push({ code: job.code, total: order.length, updated: updated, added: added });
    }

    fs.writeFileSync(settingsPath, src, "utf8");
    console.log("[locales] merged " + jobs.length + " locale file(s) -> panorama/scripts/ql_settings.js");
    for (const s of summary) {
        console.log("  " + s.code.padEnd(6) + " total " + String(s.total).padStart(4) +
            "   updated " + String(s.updated).padStart(3) + "   added " + String(s.added).padStart(3));
    }
    console.log("Done");
}

main();
