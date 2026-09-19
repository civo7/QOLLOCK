// export_locales_json.js — regenerate i18next JSON catalogs from locale files.
//
// QOLLOCK's settings UI is localized via per-language string maps in
// panorama/scripts/ql_settings_loc/ql_settings_loc_<lang>.js.
// This script exports flat JSON files into translations/locales/<wbCode>/translation.json
// (or the public mirror directory passed as argument).

"use strict";

const fs = require("fs");
const path = require("path");
const { PROJECT_ROOT, LANGUAGES, loadLocaleMaps } = require("./locales_helper");

const REPLACE = process.argv.includes("--replace");
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const outRoot = positional[0] ? path.resolve(positional[0]) : path.join(PROJECT_ROOT, "translations", "locales");

// Emit a flat { key: value } object with keys sorted, so files diff cleanly across runs.
function writeFlatJson(file, pairs) {
    const obj = {};
    for (const [k, v] of pairs.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
        obj[k] = v;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function readExistingFlat(file) {
    if (!fs.existsSync(file)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        const out = {};
        for (const k of Object.keys(parsed)) {
            if (typeof parsed[k] === "string") out[k] = parsed[k];
        }
        return out;
    } catch (e) {
        console.error(`[locales] WARNING: could not parse existing ${file} (${e.message}); treating as empty`);
        return {};
    }
}

function main() {
    const { maps } = loadLocaleMaps();

    // Canonical English string set = union of every key across every language map
    const keySet = new Set();
    if (maps.en) {
        for (const k of Object.keys(maps.en)) keySet.add(k);
    }
    for (const l of LANGUAGES) {
        if (l.code === "en") continue;
        for (const k of Object.keys(maps[l.code] || {})) keySet.add(k);
    }
    const keys = Array.from(keySet);

    // English source: identity map (key === source string).
    writeFlatJson(path.join(outRoot, "en", "translation.json"), keys.map(k => [k, k]));
    console.log(`[locales] en      ${String(keys.length).padStart(5)} source strings`);

    const keySet2 = new Set(keys);
    const nonEnLangs = LANGUAGES.filter(l => l.code !== "en");

    for (const l of nonEnLangs) {
        const m = maps[l.code] || {};
        const file = path.join(outRoot, l.wbCode, "translation.json");

        const fromMap = {};
        for (const k of keys) {
            if (Object.prototype.hasOwnProperty.call(m, k) && m[k] !== "") fromMap[k] = m[k];
        }

        let out, added = 0, kept = 0;
        if (REPLACE) {
            out = fromMap;
        } else {
            const existing = readExistingFlat(file);
            out = Object.assign({}, existing);
            for (const k of Object.keys(fromMap)) {
                if (!Object.prototype.hasOwnProperty.call(out, k)) {
                    out[k] = fromMap[k];
                    added++;
                } else {
                    kept++;
                }
            }
            const orphans = Object.keys(existing).filter(k => !keySet2.has(k));
            if (orphans.length) {
                console.log(`[locales] ${l.wbCode.padEnd(6)} ${orphans.length} orphaned key(s) (renamed/removed in source, kept):`);
                for (const k of orphans.slice(0, 12)) console.log(`             · ${JSON.stringify(k)}`);
                if (orphans.length > 12) console.log(`             … and ${orphans.length - 12} more`);
            }
        }

        writeFlatJson(file, Object.keys(out).map(k => [k, out[k]]));
        const count = Object.keys(out).length;
        const pct = keys.length ? Math.round((count / keys.length) * 100) : 0;
        const note = REPLACE ? "" : `  (+${added} new, ${kept} already present)`;
        console.log(`[locales] ${l.wbCode.padEnd(6)} ${String(count).padStart(5)} / ${keys.length}  (${pct}%)${note}`);
    }

    console.log(`[locales] wrote ${nonEnLangs.length + 1} catalogs -> ${path.relative(PROJECT_ROOT, outRoot)}${REPLACE ? "  [--replace: maps win]" : "  [merge: mirror preserved]"}`);
}

main();
