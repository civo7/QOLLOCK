"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { PROJECT_ROOT } = require("./locales_helper");
const { scanSettings } = require("./settings_localization_audit");
function main() {
    if (process.argv.length > 3) throw new Error("Expected one output path");
    const file = path.resolve(process.argv[2] || path.join(PROJECT_ROOT, "translations/qollock-context.json"));
    const { contexts, tabs } = scanSettings();
    if (!Object.keys(contexts).length || !tabs.includes("Shop") || !tabs.includes("Customize")) throw new Error("Context scan is empty or incomplete");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(contexts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), null, 2) + "\n");
    console.log(`[context] ${Object.keys(contexts).length} entries, ${tabs.length} tabs -> ${file}`);
}
if (require.main === module) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
