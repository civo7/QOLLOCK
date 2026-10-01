// scripts/audit_lookups_vs_capture.js
// =============================================================================
// Cross-check every literal FindChildTraverse id in the mod against a CAPTURED
// panel tree, and report the ones that cannot resolve.
// =============================================================================
// This is the stronger sibling of audit_panel_ids.js. That script compares against
// layout XML plus $.CreatePanel calls, which cannot see the panels C++ builds at
// runtime — so it reports ids that do exist (false positives) and, worse, has no way
// to confirm the ones that don't.
//
// A capture from a live match has no such gap: if an id is not in the capture, no
// lookup for it succeeded in that match, and every attempt walked the whole tree
// (31,411 panels measured) before returning null.
//
// It found the top-bar slot numbering bug that both the XML audit and the modelled
// profiler had backwards: the engine creates TopBarPlayer1..12 and no TopBarPlayer0.
//
//   node scripts/audit_lookups_vs_capture.js [capture.json]
//
// CAVEAT, and it matters: absence from ONE capture means "did not exist in that
// match state", not "can never exist". A panel that only appears in the shop, the
// escape menu, a specific game mode, or the hideout will read as absent if the
// capture was taken elsewhere. Treat output as a list to investigate, not a kill
// list — check what state the capture was taken in first.
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CAPTURE = path.join(__dirname, "simulator", "perf", "runs", "captured_tree.json");

/** Every .js under panorama/scripts, excluding our own tooling. */
function modScripts(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "tools") continue;
            modScripts(full, out);
        } else if (entry.name.endsWith(".js")) {
            out.push(full);
        }
    }
    return out;
}

function main() {
    const capturePath = process.argv[2] || DEFAULT_CAPTURE;
    if (!fs.existsSync(capturePath)) {
        process.stderr.write(
            `no capture at ${capturePath}\n\n` +
            "Produce one with: Settings -> Dev Panel -> Panel Tree Dump (in a real match),\n" +
            "then: node scripts/import_tree_dump.js <log>\n"
        );
        process.exit(2);
    }

    const cap = JSON.parse(fs.readFileSync(capturePath, "utf8"));
    const real = new Set(
        Array.isArray(cap.uniqueIds)
            ? cap.uniqueIds
            : (cap.byId ? Object.keys(cap.byId) : [])
    );
    if (real.size === 0) {
        process.stderr.write("capture has no id table (neither uniqueIds nor byId) — is it a summary capture?\n");
        process.exit(2);
    }

    const scriptsRoot = path.join(__dirname, "..", "panorama", "scripts");
    const found = new Map();   // id -> Set of "file:line"
    const RE = /FindChildTraverse\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;

    for (const file of modScripts(scriptsRoot)) {
        const text = fs.readFileSync(file, "utf8");
        const lines = text.split(/\r?\n/);
        lines.forEach((line, i) => {
            let m;
            RE.lastIndex = 0;
            while ((m = RE.exec(line)) !== null) {
                const rel = path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/");
                if (!found.has(m[1])) found.set(m[1], new Set());
                found.get(m[1]).add(`${rel}:${i + 1}`);
            }
        });
    }

    const absent = [...found.entries()]
        .filter(([id]) => !real.has(id))
        .sort((a, b) => b[1].size - a[1].size);

    const totalPanels = cap.summary?.totalPanels || cap.panels || "unknown";
    process.stdout.write(`capture: ${totalPanels} panels, ${real.size} distinct ids (${cap.capturedFrom || capturePath})\n`);
    if (cap.end && cap.end.idsCapped) {
        // Without this the output is untrustworthy: a capped id list makes present ids
        // look absent, which is exactly the wrong direction for this check.
        process.stdout.write("WARNING: capture's id list was CAPPED — absences below may be false\n");
    }
    process.stdout.write(`literal FindChildTraverse ids in the mod: ${found.size}, absent from capture: ${absent.length}\n\n`);

    for (const [id, sites] of absent) {
        process.stdout.write(`  ${id}\n`);
        for (const site of [...sites].sort()) process.stdout.write(`      ${site}\n`);
    }

    process.stdout.write(
        "\nAbsent means \"not in this capture\", not \"impossible\". Panels that only exist\n" +
        "in the shop, escape menu, hideout or another mode will show up here if the\n" +
        "capture was taken elsewhere. Confirm the state before deleting a lookup.\n"
    );
}

if (require.main === module) main();
