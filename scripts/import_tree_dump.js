// scripts/import_tree_dump.js
// =============================================================================
// Import a [QOLTREE] hierarchy or a [QOLSUM] aggregate from the game log.
// =============================================================================
// The headless profiler's tree (simulator/perf/hud_tree.js) is assembled from layout
// XML plus hand-modelled guesses about what C++ creates at runtime. Its numbers are
// therefore relative to a guess, and the guesses have been wrong by more than an
// order of magnitude in both directions: it ranked ql_nicknames at ~1% of mod cost
// while the in-game overlay measured it as the most expensive feature in the mod
// (2.4ms avg, 9ms peak), and ranked ql_showrank at 13.5% where the game measured
// 1-3ms total.
//
// The Dev Panel button writes an aggregate summary, which this importer can
// validate and save. It has no ancestry and cannot drive profile_hud.js --tree.
// That mode requires a complete per-panel Hud dump, which is usually too large
// for the game's rolling console log.
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
 * Parse a [QOLSUM] aggregate capture.
 *
 * This is the mode that survives a real HUD. A live match measured 37,524 panels;
 * a full per-panel dump of that is ~3MB and the game's console log is a rolling
 * buffer, so the first attempt arrived with 2,152 of 37,524 lines and no START.
 *
 * The aggregate constrains the size of a synthetic stress tree and inventories
 * ids, but it has no parent-child links or traversal order. It cannot be used
 * as a full profiler tree.
 */
function parseTreeSummary(text) {
    const lines = String(text || "").split(/\r?\n/);
    const warnings = [];
    const byDepth = {};
    const byId = {};
    const byType = {};
    let meta = { root: null, panels: null, maxDepth: null, anonymous: null };
    let end = null;

    const field = (line, marker) => {
        const at = line.indexOf(marker);
        return at === -1 ? null : line.slice(at + marker.length);
    };

    for (const line of lines) {
        let rest = field(line, "[QOLSUM:START]\t");
        if (rest !== null) {
            const get = (k) => {
                const m = new RegExp(`${k}=([^\\t]*)`).exec(rest);
                return m ? m[1].trim() : null;
            };
            meta = {
                root: get("root"),
                panels: Number(get("panels")),
                maxDepth: Number(get("maxDepth")),
                anonymous: Number(get("anonymous")),
            };
            continue;
        }

        rest = field(line, "[QOLSUM:END]\t");
        if (rest !== null) {
            const get = (k) => {
                const m = new RegExp(`${k}=([^\\t]*)`).exec(rest);
                return m ? m[1].trim() : null;
            };
            end = {
                panels: Number(get("panels")),
                distinctIds: Number(get("distinctIds")),
                idsEmitted: Number(get("idsEmitted")),
                idsCapped: get("idsCapped") === "1",
                distinctTypes: Number(get("distinctTypes")),
            };
            continue;
        }

        rest = field(line, "[QOLSUM:DEPTH]\t");
        if (rest !== null) {
            const [d, n] = rest.split("\t");
            byDepth[Number(d)] = Number(n) || 0;
            continue;
        }

        rest = field(line, "[QOLSUM:TYPE]\t");
        if (rest !== null) {
            const [type, n] = rest.split("\t");
            if (type) byType[type] = Number(n) || 0;
            continue;
        }

        rest = field(line, "[QOLSUM:ID]\t");
        if (rest !== null) {
            const [id, n] = rest.split("\t");
            if (id) byId[id] = Number(n) || 0;
            continue;
        }
    }

    if (meta.panels === null || !isFinite(meta.panels)) {
        return { ok: false, warnings: ["no [QOLSUM:START] line — is this the right log, or was it rolled?"] };
    }
    if (!end) {
        warnings.push("no [QOLSUM:END] line — the capture was cut off, treat every count as a floor");
    } else if (end.panels !== meta.panels) {
        warnings.push(`START says ${meta.panels} panels, END says ${end.panels} — lines were lost`);
    }
    if (end && end.idsCapped) {
        warnings.push(`id list was capped at ${end.idsEmitted} of ${end.distinctIds} distinct ids ` +
                      `(the omitted ones are the rarest, so a lookup for one of them may read as a miss)`);
    }

    const depthSum = Object.values(byDepth).reduce((a, b) => a + b, 0);
    if (depthSum !== meta.panels) {
        warnings.push(`depth histogram sums to ${depthSum} but the tree is ${meta.panels} panels — depth lines were lost`);
    }

    return { ok: true, meta, end, byDepth, byId, byType, warnings };
}

/**
 * Parse a full per-panel [QOLTREE] dump into a nested tree.
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

    const text = fs.readFileSync(logPath, "utf8");

    // Prefer the aggregate: it is the mode that survives a real HUD. The full dump is
    // only usable on a subtree small enough not to overrun the console log.
    const summary = parseTreeSummary(text);
    if (summary.ok) {
        const m = summary.meta;
        process.stdout.write(`captured SUMMARY: ${m.panels} panels, max depth ${m.maxDepth}, ` +
                             `${m.anonymous} with no id (root=${m.root})\n`);
        for (const w of summary.warnings) process.stdout.write(`WARNING: ${w}\n`);

        if (argv.includes("--stats")) {
            const top = (map, n) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
            process.stdout.write("\npanels per depth:\n");
            for (const [d, n] of Object.entries(summary.byDepth)) {
                process.stdout.write(`  depth ${String(d).padStart(2)}  ${String(n).padStart(6)}\n`);
            }
            process.stdout.write("\nmost common panel types:\n");
            for (const [type, n] of top(summary.byType, 15)) {
                process.stdout.write(`  ${String(n).padStart(6)}  ${type}\n`);
            }
            // Duplicate ids are why FindChildTraverse-by-id is unreliable here: it
            // returns the first match in traversal order, not necessarily the live one.
            const dupes = top(summary.byId, 200).filter(([, n]) => n > 1).slice(0, 15);
            if (dupes.length > 0) {
                process.stdout.write("\nduplicated ids (FindChildTraverse returns the first):\n");
                for (const [id, n] of dupes) process.stdout.write(`  ${String(n).padStart(6)}  ${id}\n`);
            }
        }

        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify({
            kind: "summary",
            capturedFrom: path.basename(logPath),
            panels: m.panels,
            maxDepth: m.maxDepth,
            anonymous: m.anonymous,
            root: m.root,
            byDepth: summary.byDepth,
            byId: summary.byId,
            byType: summary.byType,
            end: summary.end,
            warnings: summary.warnings,
        }, null, 1));
        process.stdout.write(`\nwrote ${outPath}\n`);
        return;
    }

    const parsed = parseTreeDump(text);

    if (!parsed.root) {
        process.stderr.write("FATAL: no tree found in that log.\n");
        // Report the summary attempt too, so "wrong log" and "rolled log" are
        // distinguishable instead of both reading as a parse failure.
        for (const w of summary.warnings) process.stderr.write(`  - ${w}\n`);
        const firstFew = parsed.warnings.slice(0, 6);
        for (const w of firstFew) process.stderr.write(`  - ${w}\n`);
        if (parsed.warnings.length > firstFew.length) {
            process.stderr.write(`  - ...and ${parsed.warnings.length - firstFew.length} more of the same\n`);
        }
        process.stderr.write("\nA full per-panel dump of a live HUD does not fit the game's console log\n" +
                             "(37,524 panels measured). Use the Dev Panel button, which captures the\n" +
                             "aggregate summary instead.\n");
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

module.exports = { parseTreeDump, parseTreeSummary, summarize };
