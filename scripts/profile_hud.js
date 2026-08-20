// scripts/profile_hud.js
// =============================================================================
// QOLLOCK frame-cost profiler — CLI.
// =============================================================================
// Answers "which feature is making the game stutter in a teamfight" with numbers
// instead of guesses, and lets you prove an optimisation worked.
//
//   node scripts/profile_hud.js                     # profile, print report
//   node scripts/profile_hud.js --save baseline     # write perf/runs/baseline.json
//   node scripts/profile_hud.js --compare baseline  # diff against a saved run
//   node scripts/profile_hud.js --seconds 30        # longer sample (default 10)
//   node scripts/profile_hud.js --players 12        # teamfight size (default 12)
//   node scripts/profile_hud.js --healthbar 5       # 0 default 1 minimalist 2 fg
//                                                  # 3 klutz 4 budhud 5 minecraft
//   node scripts/profile_hud.js --json              # machine-readable
//   node scripts/profile_hud.js --top 25            # rows to show (default 20)
//
// --healthbar matters more than it looks. HEALTHBAR_TYPE is a numeric enum, not an
// ENABLE_* toggle, so the default "everything on" config leaves it at 0 and NONE of
// the five healthbar variants run. Profiling the Minecraft variant (5) in
// particular exercises a few hundred lines of per-heart panel work that is
// invisible at the default. Compare like with like: a run saved at one healthbar
// setting is not a baseline for a run at another.
//
// WHAT THE NUMBERS MEAN — read this before quoting any of them.
//
//   Counts are EXACT for the simulated tree: the harness intercepts every
//   engine-facing call the mod makes. What is estimated is the tree itself (see
//   simulator/perf/hud_tree.js) and the relative weights that combine ops into a
//   single `cost` column (see simulator/perf/counters.js WEIGHTS).
//
//   So: "feature A does 40x the tree walks of feature B" is a fact.
//   "This change cut total cost 60%" is a fact about the same tree.
//   "This costs 3ms per frame in-game" is NOT something this tool can tell you —
//   it has no engine timings. Verify wins in-game with the perf overlay.
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createProfiledHud } = require("./simulator/perf/profile.js");

const PERF_DIR = path.join(__dirname, "simulator", "perf", "runs");

function arg(name, fallback) {
    const argv = process.argv.slice(2);
    const i = argv.indexOf("--" + name);
    if (i < 0) return fallback;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) return true;
    return next;
}

function has(name) {
    return process.argv.slice(2).includes("--" + name);
}

function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function fmt(n) {
    if (n === 0) return "0";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(1);
}

function pct(part, whole) {
    if (!whole) return "  -  ";
    return (100 * part / whole).toFixed(1).padStart(5) + "%";
}

/** Per-second rate for a raw count over the sample window. */
function rate(count, seconds) {
    return count / seconds;
}

function report(snap, meta, tree, opts) {
    const secs = snap.seconds;
    const out = [];
    const total = snap.total;

    out.push("=".repeat(100));
    out.push("QOLLOCK FRAME-COST PROFILE");
    out.push("=".repeat(100));
    out.push(`scenario        : ${meta.players} players (teamfight), ${meta.damageNumbers} floating damage panels`);
    out.push(`healthbar       : HEALTHBAR_TYPE=${meta.healthbarType} ` +
             `(${["default", "minimalist", "fg", "klutz", "budhud", "minecraft"][meta.healthbarType] || "?"})`);
    out.push(`HUD tree        : ${tree.panels} panels`);
    out.push(`sample          : ${secs}s of virtual game time (after ${meta.warmupMs / 1000}s warm-up)`);
    out.push(`config          : ${meta.configApplied ? `all features ON (${fmt(meta.configBytes)} bytes stored)` : "DEFAULTS ONLY — no config applied!"}`);
    out.push(`attribution     : ${meta.wrappedFeatures} old-system features wrapped, scheduler ${meta.wrappedScheduler ? "wrapped" : "NOT WRAPPED"}`);
    if (tree.notes.length > 0) {
        out.push("");
        out.push("tree construction notes (affects fidelity — read these):");
        for (const n of tree.notes) out.push(`  ! ${n}`);
    }

    out.push("");
    out.push("-".repeat(100));
    out.push("TOTALS  (per second of game time)");
    out.push("-".repeat(100));
    const rows = [
        ["tree nodes visited", total.traverseNodes + total.classTraverseNodes,
         `${fmt(rate(total.traverseCalls + total.classTraverseCalls, secs))} lookups/s`],
        ["  of which MISSED (walked whole subtree, found nothing)", null,
         `${fmt(rate(total.traverseMisses, secs))} misses/s`],
        ["style writes — value CHANGED", total.styleWritesChanged, "each dirties layout"],
        ["style writes — value IDENTICAL (pure waste)", total.styleWritesRedundant, "still dirties layout"],
        ["class writes — CHANGED", total.classWritesChanged, "each re-matches styles"],
        ["class writes — no-op", total.classWritesRedundant, "cheap, but noise"],
        ["attribute reads", total.attrReads, `${fmt(rate(total.attrReadBytes, secs))} bytes/s`],
        ["attribute writes", total.attrWrites, `${fmt(rate(total.attrWriteBytes, secs))} bytes/s`],
        ["label text writes — CHANGED", total.textWritesChanged, "re-measures font, re-lays out"],
        ["label text writes — IDENTICAL (pure waste)", total.textWritesRedundant, ""],
        ["panels created", total.panelCreates, "most expensive op per unit"],
        ["panels destroyed", total.panelDeletes, ""],
    ];
    for (const [label, count, note] of rows) {
        const value = count === null ? "" : fmt(rate(count, secs)).padStart(10);
        out.push(`  ${label.padEnd(52)} ${value.padStart(10)}  ${note}`);
    }
    out.push("");
    out.push(`  COMPOSITE COST  ${fmt(total.costPerSec).padStart(12)} units/s   (weighted; see counters.js WEIGHTS)`);

    out.push("");
    out.push("-".repeat(100));
    out.push(`BY FEATURE — top ${opts.top} of ${snap.rows.length}, ranked by composite cost`);
    out.push("-".repeat(100));
    out.push([
        "feature".padEnd(34),
        "cost/s".padStart(9),
        "share".padStart(6),
        "nodes/s".padStart(9),
        "miss/s".padStart(7),
        "style±".padStart(7),
        "style=".padStart(7),
        "class±".padStart(7),
        "text±".padStart(6),
        "new".padStart(5),
    ].join(" "));
    for (const r of snap.rows.slice(0, opts.top)) {
        out.push([
            r.label.slice(0, 34).padEnd(34),
            fmt(r.costPerSec).padStart(9),
            pct(r.costUnits, total.costUnits),
            fmt(rate(r.traverseNodes + r.classTraverseNodes, secs)).padStart(9),
            fmt(rate(r.traverseMisses, secs)).padStart(7),
            fmt(rate(r.styleWritesChanged, secs)).padStart(7),
            fmt(rate(r.styleWritesRedundant, secs)).padStart(7),
            fmt(rate(r.classWritesChanged, secs)).padStart(7),
            fmt(rate(r.textWritesChanged, secs)).padStart(6),
            fmt(rate(r.panelCreates, secs)).padStart(5),
        ].join(" "));
    }
    out.push("");
    out.push("  style± = value changed   style= = same value rewritten (waste)   new = panels created");

    if (snap.misses.length > 0) {
        out.push("");
        out.push("-".repeat(100));
        out.push("WASTED TREE WALKS — lookups that found nothing, ranked by nodes burned");
        out.push("A miss visits every descendant. If the id can never exist, the whole walk is dead work.");
        out.push("-".repeat(100));
        out.push(`  ${"panel id".padEnd(42)} ${"nodes/s".padStart(9)} ${"calls/s".padStart(8)}  charged to`);
        for (const m of snap.misses.slice(0, 25)) {
            out.push(`  ${m.id.slice(0, 42).padEnd(42)} ${fmt(rate(m.nodes, secs)).padStart(9)} ${fmt(rate(m.count, secs)).padStart(8)}  ${m.labels.slice(0, 3).join(", ")}`);
        }
        const shown = snap.misses.slice(0, 25).reduce((n, m) => n + m.nodes, 0);
        const all = snap.misses.reduce((n, m) => n + m.nodes, 0);
        out.push("");
        out.push(`  total wasted: ${fmt(rate(all, secs))} nodes/s across ${snap.misses.length} distinct ids ` +
                 `(${pct(shown, all).trim()} shown) — ${pct(all, total.traverseNodes + total.classTraverseNodes).trim()} of ALL tree walking`);
    }

    if (snap.redundantStyleProps.length > 0) {
        out.push("");
        out.push("-".repeat(100));
        out.push("REDUNDANT STYLE WRITES — same value rewritten, by feature and property");
        out.push("Panorama does not compare before dirtying layout, so these cost the same as real writes.");
        out.push("-".repeat(100));
        for (const r of snap.redundantStyleProps.slice(0, 25)) {
            out.push(`  ${r.label.slice(0, 34).padEnd(34)} ${r.prop.padEnd(28)} ${fmt(rate(r.count, secs)).padStart(9)}/s`);
        }
    }

    return out.join("\n");
}

function compareReport(cur, prev, opts) {
    const out = [];
    out.push("=".repeat(100));
    out.push("COMPARISON vs SAVED RUN");
    out.push("=".repeat(100));

    const delta = (a, b) => {
        if (!b) return a > 0 ? "  new  " : "   =   ";
        const d = 100 * (a - b) / b;
        if (Math.abs(d) < 0.05) return "   =   ";
        return (d > 0 ? "+" : "") + d.toFixed(1) + "%";
    };

    const keys = [
        ["composite cost/s", "costPerSec"],
        ["tree nodes/s", "traverseNodes"],
        ["misses/s", "traverseMisses"],
        ["style changed/s", "styleWritesChanged"],
        ["style redundant/s", "styleWritesRedundant"],
        ["class changed/s", "classWritesChanged"],
        ["attr reads/s", "attrReads"],
        ["attr bytes/s", "attrReadBytes"],
        ["text changed/s", "textWritesChanged"],
        ["panels created/s", "panelCreates"],
    ];
    out.push(`  ${"metric".padEnd(24)} ${"before".padStart(11)} ${"after".padStart(11)}  change`);
    for (const [label, key] of keys) {
        const b = key === "costPerSec" ? prev.total.costPerSec : prev.total[key] / prev.seconds;
        const a = key === "costPerSec" ? cur.total.costPerSec : cur.total[key] / cur.seconds;
        out.push(`  ${label.padEnd(24)} ${fmt(b).padStart(11)} ${fmt(a).padStart(11)}  ${delta(a, b)}`);
    }

    out.push("");
    out.push("  per-feature cost/s change (worst regressions and best wins):");
    const prevByLabel = new Map(prev.rows.map((r) => [r.label, r]));
    const diffs = cur.rows.map((r) => {
        const p = prevByLabel.get(r.label);
        const before = p ? p.costUnits / prev.seconds : 0;
        const after = r.costUnits / cur.seconds;
        return { label: r.label, before, after, diff: after - before };
    });
    for (const p of prev.rows) {
        if (!cur.rows.some((r) => r.label === p.label)) {
            diffs.push({ label: p.label, before: p.costUnits / prev.seconds, after: 0, diff: -p.costUnits / prev.seconds });
        }
    }
    diffs.sort((a, b) => b.diff - a.diff);
    const interesting = diffs.filter((d) => Math.abs(d.diff) > 1);
    const top = interesting.slice(0, 8);
    const bottom = interesting.slice(-8).reverse();
    for (const d of top) {
        out.push(`    ${d.label.slice(0, 34).padEnd(34)} ${fmt(d.before).padStart(10)} -> ${fmt(d.after).padStart(10)}  ${delta(d.after, d.before)}`);
    }
    if (bottom.length > 0 && top.length > 0 && bottom[0].label !== top[0].label) {
        out.push("    ...");
        for (const d of bottom) {
            out.push(`    ${d.label.slice(0, 34).padEnd(34)} ${fmt(d.before).padStart(10)} -> ${fmt(d.after).padStart(10)}  ${delta(d.after, d.before)}`);
        }
    }
    return out.join("\n");
}

function main() {
    const seconds = num(arg("seconds", 10), 10);
    const players = num(arg("players", 12), 12);
    const top = num(arg("top", 20), 20);
    const healthbar = num(arg("healthbar", 0), 0);
    const wantJson = has("json");
    const saveName = arg("save", null);
    const compareName = arg("compare", null);

    const h = createProfiledHud({
        players,
        warmupMs: 8000,
        configOverrides: { HEALTHBAR_TYPE: healthbar },
    });

    // A harness that produces an empty profile must fail loudly, not print
    // reassuring zeroes.
    if (h.meta.wrappedFeatures === 0) {
        process.stderr.write("[profiler] FATAL: no features wrapped — QOL_FEATURE_REGISTRY was empty.\n");
        process.stderr.write(h.diagnose() + "\n");
        process.exit(2);
    }

    const snap = h.measure(seconds * 1000);

    if (snap.total.costUnits === 0) {
        process.stderr.write("[profiler] FATAL: zero operations recorded — the mod did nothing.\n");
        process.stderr.write(h.diagnose() + "\n");
        process.exit(2);
    }

    const payload = { meta: h.meta, tree: { panels: h.tree.panels, notes: h.tree.notes }, snapshot: snap };

    if (wantJson) {
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    } else {
        process.stdout.write(report(snap, h.meta, h.tree, { top }) + "\n");
    }

    if (compareName) {
        const p = path.join(PERF_DIR, String(compareName).replace(/\.json$/, "") + ".json");
        if (!fs.existsSync(p)) {
            process.stderr.write(`[profiler] no saved run at ${p}\n`);
            process.exit(1);
        }
        const prev = JSON.parse(fs.readFileSync(p, "utf8"));
        process.stdout.write("\n" + compareReport(snap, prev.snapshot, { top }) + "\n");
    }

    if (saveName) {
        fs.mkdirSync(PERF_DIR, { recursive: true });
        const p = path.join(PERF_DIR, String(saveName).replace(/\.json$/, "") + ".json");
        fs.writeFileSync(p, JSON.stringify(payload, null, 2));
        process.stdout.write(`\nsaved -> ${path.relative(process.cwd(), p)}\n`);
    }

    // Report any scheduled-callback throws: a feature crashing every tick both
    // skews the profile and is a bug in its own right.
    if (h.clock.errors.length > 0) {
        process.stderr.write(`\n[profiler] WARNING: ${h.clock.errors.length} scheduled callback(s) threw during the run.\n`);
        for (const e of h.clock.errors.slice(0, 5)) {
            process.stderr.write(`  @${e.at}ms ${e.error.message}\n`);
        }
    }
}

if (require.main === module) main();
