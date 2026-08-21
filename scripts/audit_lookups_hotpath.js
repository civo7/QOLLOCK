// scripts/audit_lookups_hotpath.js
// =============================================================================
// Of the literal FindChildTraverse ids absent from a live capture, which ones are
// called from the 20Hz dispatch loop — i.e., the ones that burn a full-tree walk
// every tick?
//
//   node scripts/audit_lookups_hotpath.js
//
// Takes no arguments — reads the same captured tree the profiler uses, and the
// source files directly. Output is the subset of absences that matter for perf.
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CAPTURE = path.join(__dirname, "simulator", "perf", "runs", "captured_tree.json");
const SCRIPTS = path.join(__dirname, "..", "panorama", "scripts");

function modScripts(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === "tools") continue;
            modScripts(full, out);
        } else if (e.name.endsWith(".js")) {
            out.push(full);
        }
    }
    return out;
}

function main() {
    const cap = JSON.parse(fs.readFileSync(CAPTURE, "utf8"));
    const real = new Set(Object.keys(cap.byId || {}));
    const RE = /FindChildTraverse\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;
    const idSites = new Map();

    for (const file of modScripts(SCRIPTS)) {
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        const rel = path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/");
        lines.forEach((line, i) => {
            let m;
            RE.lastIndex = 0;
            while ((m = RE.exec(line)) !== null) {
                if (!idSites.has(m[1])) idSites.set(m[1], []);
                idSites.get(m[1]).push({ file: rel, line: i + 1, code: line.trim().slice(0, 100) });
            }
        });
    }

    // Heuristic: a "hot" call is one whose line appears inside a function that is
    // likely called per-tick. We can't do full control-flow analysis, but we CAN
    // check whether the surrounding context mentions keywords that indicate per-tick
    // execution: _tick, _tryLoad, _processSlot, _refresh, update, loop, schedule.
    const HOT_KEYWORDS = /_tick|_tryLoad|_processSlot|_refresh|_update|_loop|_poll|_check|_apply|_reset|_ensure|_scan|_process|CreatePollLoop|\.update\(|\.tick\(|\.onTick/;

    const absent = [];
    for (const [id, sites] of idSites) {
        if (real.has(id)) continue;
        const hotSites = sites.filter(s => HOT_KEYWORDS.test(s.code));
        absent.push({ id, total: sites.length, hot: hotSites.length, sites });
    }
    absent.sort((a, b) => b.hot - a.hot || b.total - a.total);

    process.stdout.write(`=== absent ids with hot-path call sites ===\n\n`);
    let shown = 0;
    for (const { id, total, hot, sites } of absent) {
        if (hot === 0 && total <= 2) continue; // cold, one-shot — skip
        if (shown >= 40) { process.stdout.write(`  ... and ${absent.length - shown} more (all cold or single-call-site)\n`); break; }
        shown++;
        const label = hot > 0 ? `HOT(${hot}/${total})` : `cold(${total})`;
        process.stdout.write(`  ${label.padEnd(14)} ${id}\n`);
        for (const s of sites.slice(0, 3)) {
            process.stdout.write(`               ${s.file}:${s.line}\n`);
        }
        if (sites.length > 3) process.stdout.write(`               ... +${sites.length - 3} more\n`);
    }
    process.stdout.write(`\ntotal: ${absent.filter(a => a.hot > 0).length} hot absences, ${absent.filter(a => a.hot === 0).length} cold\n`);
}

if (require.main === module) main();
