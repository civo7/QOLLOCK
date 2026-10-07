// Three-way integration of a reviewed public snapshot; no network or Git writes.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const { PROJECT_ROOT, loadLocaleMaps } = require("./locales_helper");
const { readCatalogs, readIntegrationBaseline, planImport, applyWrites, report } = require("./translation_io");
function main() {
    const args = process.argv.slice(2);
    const paths = args.filter(arg => !arg.startsWith("--"));
    if (paths.length > 1) throw new Error("Usage: sync_translations.js [reviewed locales path] [--dry-run] [--json] [--resolve=local|incoming]");
    for (const arg of args.filter(arg => arg.startsWith("--"))) {
        if (!["--dry-run", "--json", "--resolve=local", "--resolve=incoming"].includes(arg)) throw new Error(`Unknown option: ${arg}`);
    }
    const target = path.resolve(paths[0] || path.join(PROJECT_ROOT, "../QOLLOCK-translations/locales"));
    const stateFile = path.join(PROJECT_ROOT, "translations/import-baseline.json");
    const previous = readIntegrationBaseline(stateFile);
    // Bootstrap is explicitly unverified; its local corrections still survive.
    const baseline = previous?.catalogs || readCatalogs(path.join(PROJECT_ROOT, "translations/locales")).catalogs;
    const { catalogs, warnings } = readCatalogs(target);
    const resolve = args.find(arg => arg.startsWith("--resolve="))?.split("=")[1];
    const plan = planImport(loadLocaleMaps(), catalogs, { baseline, resolve });
    const git = spawnSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" });
    const revision = git.status === 0 ? git.stdout.trim() : null;
    const dirty = spawnSync("git", ["-C", target, "status", "--porcelain", "--", "."], { encoding: "utf8" });
    const uncommittedCatalogs = dirty.status === 0 ? !!dirty.stdout.trim() : null;
    if (!previous) warnings.push("Bootstrap baseline is the local exchange snapshot; no earlier public revision is recorded");
    if (args.includes("--json")) console.log(JSON.stringify({ ...plan, writes: undefined, warnings, revision, uncommittedCatalogs }, null, 2));
    else report(plan, warnings);
    if (plan.blocked) { process.exitCode = 1; return; }
    if (args.includes("--dry-run")) return;
    const nextCatalogs = { ...baseline, ...catalogs };
    const digest = crypto.createHash("sha256").update(JSON.stringify(nextCatalogs)).digest("hex");
    const next = { revision, uncommittedCatalogs, snapshotDigest: digest, catalogs: nextCatalogs };
    applyWrites([...plan.writes, { file: stateFile, content: JSON.stringify(next, null, 2) + "\n" }]);
}
try { main(); } catch (error) { console.error(`[translations] ${error.message}`); process.exitCode = 1; }
