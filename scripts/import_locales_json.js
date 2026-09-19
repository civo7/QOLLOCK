// import_locales_json.js — merge i18next JSON locale files back into the locale files.
//
// Counterpart to export_locales_json.js. Reads one or more <lang>/translation.json files (the shape
// the workbench opens PRs with) and merges every non-empty value into the matching
// ql_settings_loc_<lang>.js file.
//
// Merge semantics (safe by default, identical to import_translations.js):
//   - A non-empty value sets/overrides that language's translation for the English key.
//   - A blank/absent value leaves the existing in-code translation untouched.
//   - Existing key order is preserved; brand-new keys are appended at the end of the map.
//
// Usage:
//   node scripts/import_locales_json.js [path]
//     path = a single translation.json, a <lang> directory, or the locales/ root (imports every
//     language found). Default: translations/locales
//
// After importing, validate with:
//   npm test

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { PROJECT_ROOT, LOCALES_DIR, LANGUAGES, loadLocaleMaps, saveLocaleFile } = require("./locales_helper");

const defaultRoot = path.join(PROJECT_ROOT, "translations", "locales");
const targetPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot;

// Map workbench code -> language definition
const WB_TO_LANG = new Map();
for (const l of LANGUAGES) {
    WB_TO_LANG.set(l.wbCode.toLowerCase(), l);
    WB_TO_LANG.set(l.code.toLowerCase(), l);
}

// ── i18next flatten (identical to workbench src/lib/catalog.ts) ──
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

function findJsonFiles(p) {
    const files = [];
    if (!fs.existsSync(p)) return files;
    const stat = fs.statSync(p);
    if (stat.isFile()) {
        if (p.endsWith(".json")) files.push(p);
        return files;
    }
    const entries = fs.readdirSync(p);
    for (const e of entries) {
        const full = path.join(p, e);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
            files.push(...findJsonFiles(full));
        } else if (st.isFile() && e === "translation.json") {
            files.push(full);
        }
    }
    return files;
}

function detectLangCode(filePath) {
    const dir = path.basename(path.dirname(filePath));
    if (dir && WB_TO_LANG.has(dir.toLowerCase())) return WB_TO_LANG.get(dir.toLowerCase());
    const base = path.basename(filePath, ".json");
    const prefix = base.replace(/-?translation$/, "");
    if (prefix && WB_TO_LANG.has(prefix.toLowerCase())) return WB_TO_LANG.get(prefix.toLowerCase());
    return null;
}

function main() {
    const jsonFiles = findJsonFiles(targetPath);
    if (jsonFiles.length === 0) {
        console.error(`[locales] No JSON catalogs found under ${targetPath}`);
        process.exit(1);
    }

    const { maps, keyOrders } = loadLocaleMaps();
    const stats = {};
    for (const lang of LANGUAGES) stats[lang.code] = { updated: 0, added: 0 };

    let touchedAny = false;

    for (const f of jsonFiles) {
        const lang = detectLangCode(f);
        if (!lang) {
            console.warn(`[locales] Warning: skipping ${f} (could not infer language code)`);
            continue;
        }

        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(f, "utf8"));
        } catch (e) {
            console.error(`[locales] Error parsing ${f}: ${e.message}`);
            continue;
        }

        const flat = flattenValues(parsed);
        const map = maps[lang.code];
        const order = keyOrders[lang.code];

        for (const [key, rawVal] of Object.entries(flat)) {
            if (!key || !rawVal) continue;
            const val = String(rawVal).trim();
            if (val === "") continue;

            if (Object.prototype.hasOwnProperty.call(map, key)) {
                if (map[key] !== val) {
                    map[key] = val;
                    stats[lang.code].updated++;
                }
            } else {
                map[key] = val;
                order.push(key);
                stats[lang.code].added++;
            }
        }
    }

    for (const lang of LANGUAGES) {
        if (lang.code === "en") continue;
        const s = stats[lang.code];
        if (s.updated > 0 || s.added > 0) {
            touchedAny = true;
            saveLocaleFile(lang, keyOrders[lang.code], maps[lang.code]);
            execSync(`node --check ${path.join(LOCALES_DIR, lang.file)}`);
            console.log(`[locales] ${lang.header.padEnd(16)} (${lang.wbCode}): updated ${s.updated}, added ${s.added}`);
        }
    }

    if (!touchedAny) {
        console.log(`[locales] In-code maps are already in sync with JSON files.`);
    } else {
        console.log(`[locales] Import complete.`);
    }
}

main();
