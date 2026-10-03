// Offline lookup trace of production HUD JavaScript over a captured panel tree.
// Native execution time, layout, rendering and gameplay are not simulated.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createProfiledHud } = require("./simulator/perf/profile.js");
const { loadXmlEvidence, indexEvidence, sourceStatus } = require("./capture_sources");

const DEFAULT_CAPTURE = path.join(__dirname, "..", "captures", "deadlock_hud_dump.json");

function parseArgs(args = process.argv.slice(2)) {
    const opts = {
        feature: null, seconds: 10, warmupMs: 8000, capturePath: DEFAULT_CAPTURE,
        verbose: false, json: false, includeEvents: false, enableAll: true, configOverrides: {},
        vanilla: null,
    };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        const value = () => {
            const v = args[++i];
            if (!v || v.startsWith("--")) throw new Error(`missing value for ${a}`);
            return v;
        };
        if (a === "--all") continue;
        if (a === "--verbose" || a === "-v") opts.verbose = true;
        else if (a === "--json") opts.json = true;
        else if (a === "--events") opts.includeEvents = true;
        else if (a === "--defaults") opts.enableAll = false;
        else if (a === "--capture") opts.capturePath = value();
        else if (a === "--vanilla") opts.vanilla = value();
        else if (a === "--seconds") opts.seconds = Number(value());
        else if (a === "--warmup") opts.warmupMs = Number(value()) * 1000;
        else if (a === "--enable") {
            for (const spec of value().split(",")) {
                const [key, raw = "1"] = spec.split("=");
                const n = Number(raw);
                if (!key || !raw || !Number.isFinite(n)) throw new Error(`invalid override: ${spec}`);
                opts.configOverrides[key] = n;
            }
        } else if (!a.startsWith("-") && !opts.feature) opts.feature = a;
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!Number.isFinite(opts.seconds) || opts.seconds <= 0 || opts.seconds > 120) {
        throw new Error("--seconds must be greater than 0 and at most 120");
    }
    if (!Number.isFinite(opts.warmupMs) || opts.warmupMs < 0 || opts.warmupMs > 120000) {
        throw new Error("--warmup must be between 0 and 120 seconds");
    }
    return opts;
}

function matchesLabel(label, feature) {
    if (!feature) return true;
    return label === feature || label.replace(/^(mf:|feat:|loop:)/, "") === feature;
}

function registryState(hud) {
    return hud.sandbox.evalJson(`({
        enabled: QOL.core.FeatureRegistry.getEnabledIds(),
        errors: QOL.core.FeatureRegistry.getErrorCounts()
    })`);
}

// Child-index paths distinguish anonymous panels and duplicate IDs. Breadcrumbs
// alone can be identical for two different search roots or results.
function panelPath(panel) {
    const parts = [];
    for (let current = panel; current; current = current._parent) {
        parts.unshift(current._parent ? current._parent._children.indexOf(current) : 0);
    }
    return parts.join("/");
}

// Called after HUD construction/warm-up. Callbacks read the virtual clock at
// execution time; no fixed time slicing or rounded-up sample duration.
function collectTrace(hud, { seconds, feature = null, xmlEvidence = [] }) {
    const counters = hud.counters;
    const events = [];
    const startMs = hud.clock.now();
    const startState = registryState(hud);
    const hooks = ["onTraverse", "onClassTraverse", "onFindChild"];
    const previous = hooks.map(key => counters[key]);
    const observe = e => {
        const label = e.label || "<unattributed>";
        if (!matchesLabel(label, feature)) return;
        events.push({
            t: (hud.clock.now() - startMs) / 1000,
            feature: label, type: e.type,
            target: e.type === "FindChildrenWithClassTraverse" ? "." + e.target : e.target,
            found: e.matches === undefined ? !!e.found : e.matches > 0,
            matches: e.matches, visited: e.visited,
            hudRootSearch: e.type !== "FindChild" &&
                (e.rootPanel === hud.doc.root || e.rootPanel === hud.doc.absRoot),
            searchRoot: e.rootPanel.getBreadcrumbs(),
            searchRootPath: panelPath(e.rootPanel),
            resultBreadcrumbs: e.found ? e.found.getBreadcrumbs() : null,
            resultPath: e.found ? panelPath(e.found) : null,
        });
    };
    for (const key of hooks) counters[key] = observe;
    let snapshot;
    try { snapshot = hud.measure(seconds * 1000); }
    finally { hooks.forEach((key, i) => { counters[key] = previous[i]; }); }

    const byFeature = new Map(), bySearch = new Map();
    for (const e of events) {
        const key = JSON.stringify([e.feature, e.type, e.target, e.searchRootPath]);
        if (!bySearch.has(key)) bySearch.set(key, { feature: e.feature, type: e.type, target: e.target,
            searchRoot: e.searchRoot, searchRootPath: e.searchRootPath, calls: 0, visits: 0, misses: 0 });
        const search = bySearch.get(key);
        search.calls++;
        search.visits += e.visited;
        if (!e.found) search.misses++;
        let row = byFeature.get(e.feature);
        if (!row) {
            row = { feature: e.feature, calls: 0, visits: 0, misses: 0,
                hudRootMisses: 0, missedTargets: Object.create(null), foundTargets: Object.create(null) };
            byFeature.set(e.feature, row);
        }
        row.calls++;
        row.visits += e.visited;
        if (!e.found) {
            row.misses++;
            if (e.hudRootSearch) row.hudRootMisses++;
            row.missedTargets[e.target] = (row.missedTargets[e.target] || 0) + 1;
        } else row.foundTargets[e.target] = { path: e.resultBreadcrumbs, resultPath: e.resultPath, visits: e.visited };
    }
    const endState = registryState(hud);
    const xmlIndex = indexEvidence(xmlEvidence);
    const searches = [...bySearch.values()].sort((a, b) => b.visits - a.visits).map(row => {
        const kind = row.type === "FindChildrenWithClassTraverse" ? "class" : "id";
        const token = kind === "class" ? row.target.slice(1) : row.target;
        const evidence = xmlIndex.get(kind + ":" + token) || [];
        return { ...row, sourceStatus: sourceStatus(evidence), xmlEvidence: evidence };
    });
    return {
        scope: "offline simulated lookup operations; no native timings or FPS",
        selection: "label filter only; other enabled features remain running",
        seconds: (hud.clock.now() - startMs) / 1000,
        totalPanels: hud.tree.panels, meta: hud.meta, notes: hud.tree.notes,
        enabledStart: startState.enabled, enabledEnd: endState.enabled,
        registryErrorsStart: startState.errors, registryErrorsEnd: endState.errors,
        callbackErrors: hud.clock.errors.map(e => ({ atMs: e.at, message: e.error.message })),
        features: [...byFeature.values()].sort((a, b) => b.visits - a.visits).map(row => ({
            ...row, callsPerSec: row.calls / seconds, visitsPerSec: row.visits / seconds,
            missesPerSec: row.misses / seconds,
        })),
        snapshot, events,
        searches,
    };
}

function reportText(result, verbose) {
    const out = ["QOLLOCK OFFLINE HUD LOOKUP TRACE", result.scope, result.selection,
        `Tree: ${result.totalPanels} panels; sample: ${result.seconds}s; warm-up: ${result.meta.warmupMs / 1000}s`,
        `Config: ${result.meta.configMode}; enabled: ${result.enabledStart.length} -> ${result.enabledEnd.length}`];
    for (const note of result.notes) out.push(`NOTE: ${note}`);
    if (verbose) for (const e of result.events) {
        out.push(`[T=${e.t.toFixed(3)}s] [${e.feature}] ${e.type}(${JSON.stringify(e.target)}) ` +
            `${e.found ? "FOUND" : "MISS"}; ${e.visited} model visits`,
        `  Under: ${e.searchRoot}`);
        if (e.resultBreadcrumbs) out.push(`  Result: ${e.resultBreadcrumbs}`);
    }
    out.push("", "FEATURE                             LOOKUPS/S     VISITS/S     MISSES/S");
    for (const r of result.features) {
        out.push(`${r.feature.padEnd(35)} ${r.callsPerSec.toFixed(1).padStart(9)} ` +
            `${r.visitsPerSec.toFixed(1).padStart(12)} ${r.missesPerSec.toFixed(1).padStart(12)}`);
        for (const [target, count] of Object.entries(r.missedTargets)) {
            out.push(`  Missed in simulated searches: ${target} (${(count / result.seconds).toFixed(1)}/s)`);
        }
    }
    if (!result.features.length) out.push("No lookup events for this label in this window; this does not establish performance.");
    out.push("", "TOP SEARCH SCOPES (modeled visits, not native timings)");
    for (const search of result.searches.slice(0, 10)) {
        out.push(`${search.feature} ${search.type}(${JSON.stringify(search.target)}): ` +
            `${(search.visits / result.seconds).toFixed(1)} visits/s; ${(search.misses / result.seconds).toFixed(1)} misses/s`,
        `  Under [${search.searchRootPath}]: ${search.searchRoot}`);
        if (search.misses) {
            out.push(`  ${search.sourceStatus}; missing in this simulated scope/state, not proof of native absence.`);
            for (const symbol of search.xmlEvidence.slice(0, 2)) out.push(`  ${symbol.evidence}: ${symbol.file}:${symbol.line}`);
        }
    }
    out.push("", "Misses are investigation candidates, not proof of invalid IDs or memory leaks.");
    for (const error of result.callbackErrors) out.push(`CALLBACK ERROR @${error.atMs}ms: ${error.message}`);
    return out.join("\n");
}

function main() {
    try {
        const opts = parseArgs();
        const capturedTree = JSON.parse(fs.readFileSync(opts.capturePath, "utf8"));
        const hud = createProfiledHud({
            capturedTree, warmupMs: opts.warmupMs,
            enableAll: opts.enableAll, configOverrides: opts.configOverrides,
        });
        const result = collectTrace(hud, { ...opts, xmlEvidence: loadXmlEvidence({ vanilla: opts.vanilla }) });
        result.xmlScope = opts.vanilla ? "QOLLOCK and extracted native layouts; overrides take precedence" : "QOLLOCK layouts only; pass --vanilla for native source evidence";
        if (opts.json) {
            if (!opts.includeEvents) delete result.events;
            process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else process.stdout.write(reportText(result, opts.verbose || !!opts.feature) + "\n");
        if (result.callbackErrors.length || Object.values(result.registryErrorsEnd).some(n => n > 0)) {
            process.exitCode = 1;
        }
    } catch (e) {
        process.stderr.write(`[tracer] FATAL: ${e.message}\n`);
        process.exitCode = 2;
    }
}

if (require.main === module) main();
module.exports = { parseArgs, matchesLabel, collectTrace, reportText };
