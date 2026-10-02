// scripts/trace_feature_hud.js
// =============================================================================
// Live Feature Trace & Traversal Profiler against real captured HUD DOM.
// =============================================================================
// Usage:
//   node scripts/trace_feature_hud.js [feature] [--seconds 1] [--capture path.json] [--verbose]
//   node scripts/trace_feature_hud.js --all
//   node scripts/trace_feature_hud.js ql_rejuv_hud --verbose
//   node scripts/trace_feature_hud.js ql_hud --verbose
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createProfiledHud } = require("./simulator/perf/profile.js");
const { install } = require("./simulator/perf/instrument.js");

const DEFAULT_CAPTURE = path.join(__dirname, "..", "captures", "deadlock_hud_dump.json");

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        feature: null,
        seconds: 1,
        capturePath: DEFAULT_CAPTURE,
        verbose: false,
        all: false,
        json: false,
    };

    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--all") {
            opts.all = true;
        } else if (a === "--verbose" || a === "-v") {
            opts.verbose = true;
        } else if (a === "--json") {
            opts.json = true;
        } else if (a === "--seconds" && i + 1 < args.length) {
            opts.seconds = Math.max(0.1, Number(args[++i]) || 1);
        } else if (a === "--capture" && i + 1 < args.length) {
            opts.capturePath = args[++i];
        } else if (!a.startsWith("--") && !opts.feature) {
            opts.feature = a;
        }
    }

    if (opts.feature) {
        opts.verbose = true; // Auto-enable verbose in single-feature inspection
    }

    return opts;
}

function formatFmt(n) {
    if (n === 0) return "0";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(1);
}

function truncateMiddle(str, maxLen = 70) {
    if (!str || str.length <= maxLen) return str;
    const half = Math.floor((maxLen - 5) / 2);
    return str.slice(0, half) + " ... " + str.slice(-half);
}

function main() {
    const opts = parseArgs();

    if (!fs.existsSync(opts.capturePath)) {
        process.stderr.write(`[tracer] FATAL: capture file not found at ${opts.capturePath}\n`);
        process.exit(2);
    }

    let capture;
    try {
        capture = JSON.parse(fs.readFileSync(opts.capturePath, "utf8"));
    } catch (e) {
        process.stderr.write(`[tracer] FATAL: failed to parse JSON from ${opts.capturePath}: ${e.message}\n`);
        process.exit(2);
    }

    const totalDumpPanels = capture.summary?.totalPanels || 16511;

    // Instrumentation & Event Log
    const counters = install();
    const events = [];
    let currentVirtualSec = 0;

    counters.onTraverse = (e) => {
        const label = e.label || "<unattributed>";
        const searchRoot = e.rootPanel?.getBreadcrumbs ? e.rootPanel.getBreadcrumbs() : (e.rootPanel?.id || "root");
        const isRoot = e.visited >= totalDumpPanels * 0.9;
        
        events.push({
            t: currentVirtualSec,
            feature: label,
            type: e.type,
            target: e.target,
            found: !!e.found,
            visited: e.visited,
            isRoot,
            searchRoot,
            resultBreadcrumbs: e.found?.getBreadcrumbs ? e.found.getBreadcrumbs() : null,
        });
    };

    counters.onClassTraverse = (e) => {
        const label = e.label || "<unattributed>";
        const searchRoot = e.rootPanel?.getBreadcrumbs ? e.rootPanel.getBreadcrumbs() : (e.rootPanel?.id || "root");
        const isRoot = e.visited >= totalDumpPanels * 0.9;

        events.push({
            t: currentVirtualSec,
            feature: label,
            type: e.type,
            target: "." + e.target,
            found: e.matches > 0,
            matches: e.matches,
            visited: e.visited,
            isRoot,
            searchRoot,
            resultBreadcrumbs: null,
        });
    };

    if (!opts.json) {
        process.stdout.write("=".repeat(95) + "\n");
        process.stdout.write("  QOLLOCK PANORAMA LIVE FEATURE TRACER\n");
        process.stdout.write(`  Capture : ${path.basename(opts.capturePath)} (${totalDumpPanels} panels)\n`);
        process.stdout.write(`  Target  : ${opts.feature ? `Single feature [${opts.feature}]` : "All active features"}\n`);
        process.stdout.write(`  Window  : ${opts.seconds}s virtual gameplay\n`);
        process.stdout.write("=".repeat(95) + "\n\n");
    }

    // Configure overrides if a single feature is requested
    const overrides = {};
    if (opts.feature) {
        // Find matching feature key or manifest
        const normalized = opts.feature.toLowerCase().replace(/^(mf:|feat:)/, "");
        // If it starts with ql_, we can enable it specifically
        overrides["ENABLE_ALL_FOR_PROFILE"] = 0;
    }

    const hud = createProfiledHud({
        warmupMs: 1000,
        capturedTree: capture,
        configOverrides: overrides,
    });

    // Run virtual clock in small time steps to track timestamps accurately
    counters.enabled = true;
    const startSec = 0;
    const endSec = opts.seconds;
    const stepSec = 0.05; // 50ms tick granularity

    for (let t = startSec; t < endSec; t += stepSec) {
        currentVirtualSec = Number(t.toFixed(2));
        hud.clock.advance(stepSec * 1000);
    }

    counters.enabled = false;

    // Filter events if single feature requested
    const filteredEvents = opts.feature
        ? events.filter(e => {
            const f = e.feature.toLowerCase();
            const target = opts.feature.toLowerCase();
            return f.includes(target);
        })
        : events;

    // ── Live Chronological Trace Output ──────────────────────────────────────
    if (opts.verbose && filteredEvents.length > 0) {
        process.stdout.write("--- CHRONOLOGICAL EXECUTION TRACE ---\n");
        let lastTime = -1;

        for (const ev of filteredEvents) {
            if (ev.t !== lastTime) {
                lastTime = ev.t;
                process.stdout.write(`\n[T = ${ev.t.toFixed(2)}s]\n`);
            }

            const prefix = `  [${ev.feature}] ${ev.type}("${ev.target}")`;
            if (ev.found) {
                process.stdout.write(`${prefix}\n`);
                process.stdout.write(`     ↳ 🟢 FOUND in ${ev.visited} node visits\n`);
                if (ev.resultBreadcrumbs) {
                    process.stdout.write(`     ↳ Path: ${truncateMiddle(ev.resultBreadcrumbs, 80)}\n`);
                }
            } else {
                const leakFlag = ev.isRoot ? " 🚨 FULL TREE WALK (100% HUD PENALTY)" : "";
                process.stdout.write(`${prefix}\n`);
                process.stdout.write(`     ↳ ❌ MISSED after ${ev.visited} node visits!${leakFlag}\n`);
                process.stdout.write(`     ↳ Searched under: ${truncateMiddle(ev.searchRoot, 70)}\n`);
            }
        }
        process.stdout.write("\n" + "-".repeat(95) + "\n\n");
    }

    // ── Per-Feature Aggregate Analysis ──────────────────────────────────────
    const statsByFeature = new Map();

    for (const ev of filteredEvents) {
        let st = statsByFeature.get(ev.feature);
        if (!st) {
            st = {
                feature: ev.feature,
                calls: 0,
                visits: 0,
                misses: 0,
                fullTreeMisses: 0,
                missedTargets: new Map(), // target -> count
                foundTargets: new Map(),  // target -> { path, visits }
            };
            statsByFeature.set(ev.feature, st);
        }

        st.calls++;
        st.visits += ev.visited;
        if (!ev.found) {
            st.misses++;
            if (ev.isRoot) st.fullTreeMisses++;
            st.missedTargets.set(ev.target, (st.missedTargets.get(ev.target) || 0) + 1);
        } else {
            st.foundTargets.set(ev.target, {
                path: ev.resultBreadcrumbs,
                visits: ev.visited,
            });
        }
    }

    const featureRows = [...statsByFeature.values()].sort((a, b) => b.visits - a.visits);

    if (opts.json) {
        process.stdout.write(JSON.stringify({
            seconds: opts.seconds,
            totalPanels: totalDumpPanels,
            features: featureRows.map(r => ({
                feature: r.feature,
                callsPerSec: r.calls / opts.seconds,
                visitsPerSec: r.visits / opts.seconds,
                missesPerSec: r.misses / opts.seconds,
                fullTreeMisses: r.fullTreeMisses,
                missedTargets: Object.fromEntries(r.missedTargets),
                foundTargets: Object.fromEntries(r.foundTargets),
            }))
        }, null, 2));
        return;
    }

    process.stdout.write("PER-FEATURE PERFORMANCE SCORECARD\n");
    process.stdout.write("-".repeat(95) + "\n");
    process.stdout.write(
        `  ${"FEATURE".padEnd(32)} ${"LOOKUPS/S".padStart(10)} ${"VISITS/S".padStart(12)} ${"MISSES/S".padStart(10)} ${"HEALTH".padStart(12)}\n`
    );
    process.stdout.write("-".repeat(95) + "\n");

    for (const r of featureRows) {
        const callsSec = (r.calls / opts.seconds).toFixed(1);
        const visitsSec = formatFmt(r.visits / opts.seconds);
        const missSec = (r.misses / opts.seconds).toFixed(1);
        
        let health = "🟢 OPTIMAL";
        if (r.fullTreeMisses > 0) {
            health = "🔴 LEAK";
        } else if (r.misses > 0 || r.visits / opts.seconds > 50000) {
            health = "🟡 WATCH";
        }

        process.stdout.write(
            `  ${r.feature.padEnd(32)} ${callsSec.padStart(10)} ${visitsSec.padStart(12)} ${missSec.padStart(10)} ${health.padStart(12)}\n`
        );

        if (r.missedTargets.size > 0) {
            for (const [t, cnt] of r.missedTargets.entries()) {
                const ratePerSec = (cnt / opts.seconds).toFixed(1);
                process.stdout.write(`     └─ ❌ Missing: "${t}" (${ratePerSec}/s)\n`);
            }
        }
    }

    process.stdout.write("-".repeat(95) + "\n");
    process.stdout.write("\n💡 SUGGESTIONS & OPTIMIZATION PATHS:\n");

    for (const r of featureRows) {
        if (r.missedTargets.size > 0) {
            process.stdout.write(`  [${r.feature}]:\n`);
            for (const [target] of r.missedTargets) {
                if (target === "CitadelHudAbilitiesContainer") {
                    process.stdout.write(`     • Replace "CitadelHudAbilitiesContainer" -> "AbilitiesContainer" (Hud.xml)\n`);
                } else if (target === "CitadelHudTopBar") {
                    process.stdout.write(`     • Replace "CitadelHudTopBar" -> "TopBar" (CitadelHudTopBar is a type, id is "TopBar")\n`);
                } else if (target === "CitadelShop") {
                    process.stdout.write(`     • Replace "CitadelShop" -> "CitadelHudHeroShop" or "Shop"\n`);
                } else if (target === "MainContents") {
                    process.stdout.write(`     • "MainContents" is a CSS class, NOT an ID! Use FindFirstPanelByClass.\n`);
                } else if (target === "SelectedBuildInfoTitle") {
                    process.stdout.write(`     • "SelectedBuildInfoTitle" does not exist; target is inside ShopModsSelectedBuild > SelectedBuildOuter\n`);
                } else {
                    process.stdout.write(`     • Unresolved target "${target}" wastes full tree walks when called from root.\n`);
                }
            }
        }

        // Check if feature found panels through expensive root traversals that could be shallow
        for (const [target, info] of r.foundTargets) {
            if (info.visits > 50 && info.path) {
                // If it took > 50 visits, a shallow lookup or parent cache could optimize it
                // process.stdout.write(`     • Found "${target}" in ${info.visits} visits at ${truncateMiddle(info.path, 60)}\n`);
            }
        }
    }

    process.stdout.write("\n" + "=".repeat(95) + "\n");
}

main();
