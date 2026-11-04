"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { REPO_ROOT, hudScripts } = require("./simulator/layout");
const { createHud } = require("./simulator");
const { digest } = require("./analyze_minimap_frames");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");

function collectSourceIdentity() {
    const files = [];
    const captureSources = ["capture_game_frames.ps1", "capture_game_frames.cmd", "analyze_game_frames.js", "analyze_minimap_frames.js", "analyze_config_frames.js", "native_capture_identity.js"];
    const visit = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(full);
            else if (/\.(?:js|css|xml)$/.test(entry.name)) files.push(full);
        }
    };
    visit(path.join(REPO_ROOT, "panorama"));
    for (const name of captureSources) files.push(path.join(__dirname, name));
    const records = files.map(full => ({ file: path.relative(REPO_ROOT, full).replace(/\\/g, "/"), sha256: sha(fs.readFileSync(full)) })).sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
    const sourcePaths = ["panorama", ...captureSources.map(name => "scripts/" + name)];
    const git = args => {
        const result = spawnSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
        if (result.error || result.status !== 0) return null;
        return result.stdout;
    };
    const hud = createHud(); hud.assertLoaded();
    const Q = hud.sandbox.global.QOL, registry = Q.core.FeatureRegistry;
    const functions = [...Q.core.MinimapPlan.owners.map(id => [id, registry.getManifest(id).create]),
        ["geometry", Q.features.minimapGeometry.create], ["plan", Q.core.MinimapPlan.create], ["verify", Q.core.MinimapPlan.verify],
        ["probe", Q.core.minimapProbe.createOwner], ["runner", Q.core.MinimapInvestigation.start], ["styleOwner", Q.core.panel.createNativeStyleOwner],
        ["keyboardDiagnostics", Q.features.keyboardDiagnostics.create],
        ["configPlan", Q.core.ConfigInvestigation.plan], ["configRunner", Q.core.ConfigInvestigation.start], ["configBenchmark", Q.core.Scheduler.startBenchmark],
        ...registry.getRegisteredIds().map(id => ["owner:" + id, registry.getManifest(id).create])];
    const graph = hudScripts();
    if (graph.missing.length) throw Error("HUD source graph has missing scripts");
    const status = git(["status", "--porcelain=v1", "--untracked-files=all", "--", ...sourcePaths]);
    const diff = git(["diff", "HEAD", "--binary", "--", ...sourcePaths]);
    return { sha256: sha(JSON.stringify(records)), files: records,
        scope: "Local Panorama JS/CSS/XML and native capture/analyzer sources; not compiled resources, assets, installed VPK or proof of native execution.",
        git: { head: git(["rev-parse", "HEAD"])?.trim() || null, branch: git(["branch", "--show-current"])?.trim() || null,
            dirtyFiles: status === null ? null : status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3)), diffSha256: diff === null ? null : sha(diff) },
        hudLoadGraph: graph.scripts.map(script => path.relative(REPO_ROOT, script.absPath).replace(/\\/g, "/")),
        loadedFunctionFingerprints: Object.fromEntries(functions.map(([key, fn]) => [key, digest(fn.toString().replace(/\r\n/g, "\n"))])) };
}
if (require.main === module) {
    try { process.stdout.write(JSON.stringify(collectSourceIdentity()) + "\n"); }
    catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
module.exports = { collectSourceIdentity };
