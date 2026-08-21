// scripts/import_tree_dump.js
// =============================================================================
// Convert a captured [QOLTREE] console dump into a tree the profiler can build.
// =============================================================================
// The headless profiler's tree (simulator/perf/hud_tree.js) is assembled from layout
// XML plus hand-modelled guesses about what C++ creates at runtime. Its numbers are
// therefore relative to a guess, and the guesses have been wrong by more than an
// order of magnitude in both directions: it ranked ql_nicknames at ~1% of mod cost
// while the in-game overlay measured it as the most expensive feature in the mod
// (2.4ms avg, 9ms peak), and ranked ql_showrank at 13.5% where the game measured
// 1-3ms total.
//
// This closes that loop. Dev Panel -> "Panel Tree Dump" writes the live tree to the
// console log; this turns that log into JSON; profile_hud.js --tree <json> then
// measures against the real thing.
//
//   node scripts/import_tree_dump.js <console.log> [-o out.json]
//   node scripts/import_tree_dump.js <console.log> --stats
//
// Line format (see panorama/scripts/tools/qol_dump_tree.js):
//   [QOLTREE]\t<depth>\t<id>\t<paneltype>\t<classes>\t<childCount>
//
// The dump is depth-first PRE-ORDER, which is what makes it reconstructible: a
// node's parent is the most recent node at depth-1. Any reordering of the dump
// breaks that and this importer will reject it rather than silently build a wrong
// tree.
// =============================================================================

"use strict";

const fs = require("fs");
const path = require("path");

const MARKER = "[QOLTREE]";
const START = "[QOLTREE:START]";
const END = "[QOLTREE:END]";

/**
 * Parse a console log into a nested tree.
 *
 * Returns { root, panels, maxDepth, warnings, meta }. `root` is
 * { id, type, classes: string[], children: [...] }.
 */
function parseTreeDump(text) {
    const lines = String(text || "").split(/\r?\n/);
    const warnings = [];
    const meta = { truncated: false, clipped: false, reportedPanels: null, root: null };

    /** Strip any log prefix ahead of the marker (timestamps, [PanoramaScript], etc). */
    const afterMarker = (line, marker) => {
        const at = line.indexOf(marker);
        return at === -1 ? null : line.slice(at + marker.length);
    };

    let root = null;
    const stack = [];          // stack[d] = node currently open at depth d
    let count = 0;
    let maxDepth = 0;
    let sawStart = false;
    let sawEnd = false;

    for (const line of lines) {
        if (line.indexOf(START) !== -1) {
            // A second START means the button was pressed twice into one log. The last
            // dump wins — an earlier one may be from a different match state.
            if (sawStart && count > 0) {
                warnings.push("multiple dumps in this log — using the last one");
                root = null;
                stack.length = 0;
                count = 0;
                maxDepth = 0;
                sawEnd = false;
            }
            sawStart = true;
            const rest = afterMarker(line, START) || "";
            const m = /root=([^\t]*)/.exec(rest);
            if (m) meta.root = m[1].trim();
            continue;
        }

        if (line.indexOf(END) !== -1) {
            sawEnd = true;
            const rest = afterMarker(line, END) || "";
            const reported = /panels=(\d+)/.exec(rest);
            if (reported) meta.reportedPanels = Number(reported[1]);
            meta.truncated = /truncated=1/.test(rest);
            meta.clipped = /clipped=1/.test(rest);
            continue;
        }

        // Must test the plain marker last: START and END also contain "[QOLTREE".
        const rest = afterMarker(line, MARKER + "\t");
        if (rest === null) continue;

        const parts = rest.split("\t");
        if (parts.length < 5) {
            warnings.push(`malformed line skipped: ${line.slice(0, 80)}`);
            continue;
        }

        const depth = Number(parts[0]);
        if (!Number.isInteger(depth) || depth < 0) {
            warnings.push(`bad depth skipped: ${line.slice(0, 80)}`);
            continue;
        }

        const node = {
            id: parts[1] === "-" ? "" : parts[1],
            type: parts[2] === "-" ? "Panel" : parts[2],
            classes: parts[3] === "-" ? [] : parts[3].split(" ").filter(Boolean),
            childCount: Number(parts[4]) || 0,
            children: [],
        };

        if (depth > maxDepth) maxDepth = depth;

        if (depth === 0) {
            if (root) {
                warnings.push("second depth-0 node — ignoring, a dump has one root");
                continue;
            }
            root = node;
            stack[0] = node;
        } else {
            const parent = stack[depth - 1];
            if (!parent) {
                // Only possible if the dump is not pre-order, or lines were lost.
                warnings.push(`orphan at depth ${depth} (id="${node.id}") — dump is not pre-order or is missing lines`);
                continue;
            }
            parent.children.push(node);
            stack[depth] = node;
        }
        stack.length = depth + 1;
        count++;
    }

    if (!sawStart) warnings.push("no [QOLTREE:START] line — is this the right log?");
    if (!sawEnd) warnings.push("no [QOLTREE:END] line — the dump was cut off mid-write");
    if (meta.reportedPanels !== null && meta.reportedPanels !== count) {
        warnings.push(`dump reported ${meta.reportedPanels} panels, parsed ${count} — lines were lost`);
    }
    if (meta.truncated) warnings.push("dump hit its panel cap: the real tree is LARGER than this");
    if (meta.clipped) warnings.push("dump hit its depth cap: deep subtrees are missing");

    return { root, panels: count, maxDepth, warnings, meta };
}

/** Count panels per id and per class, for a quick sanity read of a capture. */
function summarize(root) {
    const byId = new Map();
    const byType = new Map();
    let total = 0;
    const stack = root ? [root] : [];
    while (stack.length > 0) {
        const node = stack.pop();
        total++;
        if (node.id) byId.set(node.id, (byId.get(node.id) || 0) + 1);
        byType.set(node.type, (byType.get(node.type) || 0) + 1);
        for (const child of node.children) stack.push(child);
    }
    const top = (map, n) =>
        [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return { total, duplicateIds: top(byId, 15).filter(([, c]) => c > 1), topTypes: top(byType, 15) };
}

function main() {
    const argv = process.argv.slice(2);
    const logPath = argv.find((a) => !a.startsWith("-"));
    if (!logPath) {
        process.stderr.write(
            "usage: node scripts/import_tree_dump.js <console.log> [-o out.json] [--stats]\n" +
            "\nProduce the log with: Settings -> Dev Panel -> Panel Tree Dump, in a real match.\n"
        );
        process.exit(2);
    }
    if (!fs.existsSync(logPath)) {
        process.stderr.write(`no such file: ${logPath}\n`);
        process.exit(2);
    }

    const outIdx = argv.indexOf("-o");
    const outPath = outIdx !== -1 && argv[outIdx + 1]
        ? argv[outIdx + 1]
        : path.join("scripts", "simulator", "perf", "runs", "captured_tree.json");

    const parsed = parseTreeDump(fs.readFileSync(logPath, "utf8"));

    if (!parsed.root) {
        process.stderr.write("FATAL: no tree found in that log.\n");
        for (const w of parsed.warnings) process.stderr.write(`  - ${w}\n`);
        process.exit(1);
    }

    const stats = summarize(parsed.root);
    process.stdout.write(`parsed ${parsed.panels} panels, max depth ${parsed.maxDepth}\n`);
    if (parsed.meta.root) process.stdout.write(`dump root: ${parsed.meta.root}\n`);

    // Warnings are the point, not noise: a truncated or non-pre-order capture would
    // otherwise become a confidently wrong baseline.
    for (const w of parsed.warnings) process.stdout.write(`WARNING: ${w}\n`);

    if (argv.includes("--stats")) {
        process.stdout.write("\nmost common panel types:\n");
        for (const [type, n] of stats.topTypes) process.stdout.write(`  ${String(n).padStart(6)}  ${type}\n`);
        if (stats.duplicateIds.length > 0) {
            // Duplicate ids are the reason FindChildTraverse-by-id is unreliable in this
            // codebase; seeing them counted is directly useful.
            process.stdout.write("\nduplicated ids (FindChildTraverse returns the first):\n");
            for (const [id, n] of stats.duplicateIds) process.stdout.write(`  ${String(n).padStart(6)}  ${id}\n`);
        }
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({
        capturedFrom: path.basename(logPath),
        panels: parsed.panels,
        maxDepth: parsed.maxDepth,
        meta: parsed.meta,
        warnings: parsed.warnings,
        root: parsed.root,
    }, null, 1));
    process.stdout.write(`\nwrote ${outPath}\n`);
    process.stdout.write("profile against it with: node scripts/profile_hud.js --tree " + outPath + "\n");
}

if (require.main === module) main();

module.exports = { parseTreeDump, summarize };
