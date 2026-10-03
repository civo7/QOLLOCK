"use strict";

// Static dependencies in active HUD scripts vs one observed hierarchy. Presence
// does not prove reachability from a caller, timing, visibility or native cost.
const fs = require("node:fs");
const path = require("node:path");
const { inspectCapture } = require("./capture_tree");
const { scanSource } = require("./audit_game_update");
const { hudScripts, REPO_ROOT } = require("./simulator/layout");
const { loadXmlEvidence, indexEvidence, sourceStatus } = require("./capture_sources");
const DEFAULT_CAPTURE = path.join(REPO_ROOT, "captures", "deadlock_hud_dump.json");

function auditCapture(capture, sources, xmlEvidence = []) {
    const inspected = inspectCapture(capture, { allowSummary: true });
    const xmlIndex = indexEvidence(xmlEvidence);
    const grouped = new Map(), dynamic = [], created = new Map();
    for (const { file, text } of sources) {
        const scanned = scanSource(text, file);
        dynamic.push(...scanned.dynamic);
        for (const site of scanned.created) {
            if (!created.has(site.token)) created.set(site.token, []);
            created.get(site.token).push(site);
        }
        for (const site of scanned.lookups) {
            const key = site.kind + ":" + site.token;
            if (!grouped.has(key)) grouped.set(key, { kind: site.kind, token: site.token, sites: [] });
            grouped.get(key).sites.push(site);
        }
    }
    const dependencies = [...grouped.values()].map(row => {
        const matches = (row.kind === "id" ? inspected.ids : inspected.classes).get(row.token) || [];
        const declarations = xmlIndex.get(row.kind + ":" + row.token) || [];
        const creation = row.kind === "id" ? created.get(row.token) || [] : [];
        return { ...row, status: matches.length ? "OBSERVED" : "NOT_OBSERVED",
            occurrences: matches[0]?.count || matches.length, examples: matches.slice(0, 3),
            modCreationEvidence: creation, sourceStatus: sourceStatus(declarations, creation), xmlEvidence: declarations };
    }).sort((a, b) => a.status.localeCompare(b.status) || b.sites.length - a.sites.length || a.token.localeCompare(b.token));
    return {
        scope: "static active-HUD dependencies; not native lookup execution or performance",
        fidelity: inspected.fidelity, notes: inspected.notes,
        summary: { scripts: sources.length, dependencies: dependencies.length,
            notObserved: dependencies.filter(r => r.status === "NOT_OBSERVED").length,
            duplicateIds: dependencies.filter(r => r.kind === "id" && r.occurrences > 1).length,
            sourceCreatedNotObserved: dependencies.filter(r => r.status === "NOT_OBSERVED" && r.modCreationEvidence.length).length,
            xmlDeclaredNotObserved: dependencies.filter(r => r.status === "NOT_OBSERVED" && r.sourceStatus === "XML_DECLARED").length,
            dynamicCalls: dynamic.length },
        dependencies, dynamic,
    };
}

function reportText(result) {
    const out = ["QOLLOCK CAPTURE DEPENDENCY AUDIT", result.scope,
        `Capture: ${result.fidelity.panels} panels under ${result.fidelity.scope}; classes: ${result.fidelity.classCoverage}`,
        `Active HUD scripts: ${result.summary.scripts}; dependencies: ${result.summary.dependencies}; not observed: ${result.summary.notObserved}`,
        `Dynamic arguments omitted from static comparison: ${result.summary.dynamicCalls}`,
        `XML-declared but not observed in this snapshot: ${result.summary.xmlDeclaredNotObserved}`];
    for (const note of result.notes) out.push("NOTE: " + note);
    for (const row of result.dependencies) {
        if (row.status === "OBSERVED" && (row.kind !== "id" || row.occurrences < 2)) continue;
        out.push("", `${row.status} ${row.kind === "class" ? "." : "#"}${row.token} (${row.occurrences} occurrences)`);
        for (const site of row.sites) out.push(`  ${site.file}:${site.line} ${site.call}`);
        if (row.modCreationEvidence.length) out.push("  QOLLOCK source creates this ID; availability depends on feature config/lifecycle.");
        for (const symbol of row.xmlEvidence.slice(0, 3)) out.push(`  ${symbol.evidence}: ${symbol.file}:${symbol.line} (${symbol.ancestry})`);
        if (row.status === "NOT_OBSERVED" && row.sourceStatus === "XML_DECLARED") out.push("  Declared in XML; may be conditional, a snippet or another UI state. Absence here is not a broken lookup.");
        if (row.occurrences > 1) out.push("  Duplicate IDs require caller scope/order inspection; existence does not identify the intended panel.");
    }
    out.push("", "NOT_OBSERVED means unknown outside this captured scope/state. Do not delete a lookup from this result.",
        "OBSERVED does not establish reachability from the caller. Use trace_feature_hud.js for simulated search scopes.");
    return out.join("\n") + "\n";
}

function main(args = process.argv.slice(2)) {
    let capturePath = null, vanilla = null, json = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--json") json = true;
        else if (arg === "--vanilla") {
            vanilla = args[++i];
            if (!vanilla || vanilla.startsWith("--")) throw new Error("--vanilla requires an extracted Panorama directory");
        } else if (!arg.startsWith("-") && !capturePath) capturePath = arg;
        else throw new Error("usage: node scripts/audit_lookups_vs_capture.js [capture.json] [--vanilla <panorama-dir>] [--json]");
    }
    const capture = JSON.parse(fs.readFileSync(capturePath || DEFAULT_CAPTURE, "utf8"));
    const loaded = hudScripts();
    if (loaded.missing.length) throw new Error("HUD includes missing scripts");
    const sources = [...new Set(loaded.scripts.map(s => s.absPath))]
        .filter(file => !file.includes(path.sep + "tools" + path.sep))
        .map(file => ({ file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"), text: fs.readFileSync(file, "utf8") }));
    const result = auditCapture(capture, sources, loadXmlEvidence({ vanilla }));
    result.xmlScope = vanilla ? "QOLLOCK layouts plus extracted native layouts; QOLLOCK overrides take precedence" : "QOLLOCK layouts only; pass --vanilla for native source evidence";
    process.stdout.write(json ? JSON.stringify(result, null, 2) + "\n" : result.xmlScope + "\n" + reportText(result));
}

module.exports = { auditCapture, reportText, main };
if (require.main === module) {
    try { main(); } catch (error) { process.stderr.write("[capture audit] FATAL: " + error.message + "\n"); process.exitCode = 2; }
}
