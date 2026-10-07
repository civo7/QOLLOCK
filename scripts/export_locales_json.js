"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { PROJECT_ROOT, LANGUAGES, loadLocaleMaps } = require("./locales_helper");
const { readFlat, readIntegrationBaseline, applyWrites } = require("./translation_io");
function main() {
    const args = process.argv.slice(2);
    const positions = args.filter(arg => !arg.startsWith("--"));
    if (positions.length > 1 || args.some(arg => arg.startsWith("--") && !["--replace", "--dry-run"].includes(arg))) throw new Error("Usage: export_locales_json.js [directory] [--replace] [--dry-run]");
    const root = path.resolve(positions[0] || path.join(PROJECT_ROOT, "translations/locales"));
    const { maps } = loadLocaleMaps();
    const baseline = readIntegrationBaseline(path.join(PROJECT_ROOT, "translations/import-baseline.json"));
    const keys = Object.keys(maps.en).sort();
    const writes = [];
    for (const lang of LANGUAGES) {
        const file = path.join(root, lang.wbCode, "translation.json");
        const existing = !args.includes("--replace") && fs.existsSync(file) ? readFlat(file) : {};
        const values = { ...existing };
        if (lang.code === "en") {
            for (const key of Object.keys(values)) delete values[key];
            for (const key of keys) values[key] = key;
        } else {
            for (const key of keys) {
                const incoming = maps[lang.code][key];
                // Blank community entries are missing, not reviewed translations.
                if ((!Object.hasOwn(values, key) || !values[key].trim() ||
                    values[key] === baseline?.catalogs[lang.code]?.[key]) && incoming?.trim()) values[key] = incoming;
                else if (incoming?.trim() && values[key] !== incoming) console.log(`[locales] ${lang.wbCode}: community correction preserved: ${JSON.stringify(key)}`);
            }
        }
        const count = keys.filter(key => values[key]?.trim()).length;
        console.log(`[locales] ${lang.wbCode}: ${count}/${keys.length} (${(count / keys.length * 100).toFixed(1)}%), ${Object.keys(values).filter(key => !Object.hasOwn(maps.en, key)).length} retired keys preserved`);
        const sorted = Object.fromEntries(Object.entries(values).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
        writes.push({ file, content: JSON.stringify(sorted, null, 2) + "\n" });
    }
    const rev = spawnSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT, encoding: "utf8" });
    const dirty = spawnSync("git", ["status", "--porcelain", "--", "panorama/scripts", "panorama/layout/hud_escape_menu.xml"], { cwd: PROJECT_ROOT, encoding: "utf8" });
    writes.push({ file: path.join(root, "source-manifest.json"), content: JSON.stringify({
        sourceRevision: rev.status === 0 ? rev.stdout.trim() : null,
        uncommittedSource: dirty.status === 0 ? !!dirty.stdout.trim() : null,
        sourceDigest: crypto.createHash("sha256").update(JSON.stringify(keys)).digest("hex"),
        integratedPublicRevision: baseline?.revision || null,
        languages: LANGUAGES.map(lang => ({ runtime: lang.code, catalog: lang.wbCode }))
    }, null, 2) + "\n" });
    if (args.includes("--dry-run")) return;
    for (const { file } of writes) fs.mkdirSync(path.dirname(file), { recursive: true });
    applyWrites(writes);
}
try { main(); } catch (error) { console.error(`[locales] ${error.message}`); process.exitCode = 1; }
