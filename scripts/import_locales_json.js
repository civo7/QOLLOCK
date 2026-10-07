"use strict";
const path = require("node:path");
const { PROJECT_ROOT, loadLocaleMaps } = require("./locales_helper");
const { readCatalogs, planImport, applyWrites, report } = require("./translation_io");
function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg.startsWith("--") && !["--dry-run", "--json"].includes(arg))) throw new Error("Unknown import option");
    const paths = args.filter(arg => !arg.startsWith("--"));
    if (paths.length > 1) throw new Error("Expected one catalog path");
    const target = path.resolve(paths[0] || path.join(PROJECT_ROOT, "translations/locales"));
    const { catalogs, warnings } = readCatalogs(target);
    const plan = planImport(loadLocaleMaps(), catalogs);
    if (args.includes("--json")) console.log(JSON.stringify({ ...plan, writes: undefined, warnings }, null, 2));
    else report(plan, warnings);
    if (!args.includes("--dry-run")) applyWrites(plan.writes);
}
try { main(); } catch (error) { console.error(`[translations] ${error.message}`); process.exitCode = 1; }

