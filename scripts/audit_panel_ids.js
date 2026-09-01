// scripts/audit_panel_ids.js
// =============================================================================
// Finds FindChildTraverse() lookups that can NEVER hit.
// =============================================================================
// WHY THIS IS THE CHEAPEST REAL WIN AVAILABLE
//
// FindChildTraverse is a depth-first C++ walk. On a HIT it stops early-ish. On a
// MISS it visits EVERY descendant — for a call on the HUD root that is the whole
// HUD, a few thousand panels, every time. A lookup for an id that exists nowhere
// is therefore a full tree walk that can never do anything but return null, and
// if it sits in a 20Hz loop it burns that walk 20 times a second for the entire
// match.
//
// This audit is deliberately independent of the simulator's tree fidelity: it
// asks a question about SOURCE TEXT, not about a simulated run. An id is
// reachable only if something can create a panel with it, which means one of:
//   1. it appears as id="..." in a vanilla Deadlock layout,
//   2. it appears as id="..." in one of the mod's own layouts,
//   3. the mod creates it at runtime via $.CreatePanel(type, parent, "id", ...),
//   4. it is a known engine-provided panel id (see ENGINE_IDS).
// Anything else is unreachable, and every call site for it is dead weight.
//
// Usage:
//   node scripts/audit_panel_ids.js                 # report unreachable ids
//   node scripts/audit_panel_ids.js --all            # also list reachable ones
//   node scripts/audit_panel_ids.js --json           # machine-readable
//
// Set QOLLOCK_VANILLA to point at the extracted game tree if it is not at the
// maintainer's default path; the audit degrades to "mod layouts only" without
// it and says so loudly rather than reporting false positives.
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MOD_LAYOUT_DIR = path.join(REPO_ROOT, "panorama", "layout");
const MOD_SCRIPT_DIR = path.join(REPO_ROOT, "panorama", "scripts");

const VANILLA_ROOT =
    process.env.QOLLOCK_VANILLA ||
    "G:/GameTracking-Deadlock/game/citadel/pak01_dir/panorama";

/**
 * Panel ids the engine creates without any layout declaring them, so they are
 * reachable even though they appear in no XML. Keep this list short and
 * justified — every entry here is a potential false negative.
 */
const ENGINE_IDS = new Set([
    "Hud",              // <CitadelHud id="Hud"> in base_hud.xml, but also engine-owned
    "PanoramaRoot",
    "EscapeMenu",
    "SettingsWindow",   // created by the mod's own settings layout at runtime
]);

function walk(dir, exts, out = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, exts, out);
        else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
    }
    return out;
}

function readSafe(p) {
    try {
        return fs.readFileSync(p, "utf8");
    } catch {
        return "";
    }
}

/** Strip XML comments so commented-out panels do not count as reachable. */
function stripXmlComments(xml) {
    return xml.replace(/<!--[\s\S]*?-->/g, "");
}

/** Every id="..." in a set of XML files. */
function collectXmlIds(files) {
    const ids = new Map(); // id -> [file]
    for (const f of files) {
        const src = stripXmlComments(readSafe(f));
        const re = /\bid\s*=\s*"([^"]+)"/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            const list = ids.get(m[1]) || [];
            if (!list.includes(f)) list.push(f);
            ids.set(m[1], list);
        }
    }
    return ids;
}

/**
 * Ids the mod creates at runtime.
 *
 * $.CreatePanel(type, parent, "id"[, props]) is the third positional argument.
 * Also honour the `id:` key in a props object, which a few call sites use, and
 * SetAttributeString("id", ...) style assignment via panel.id = "...".
 */
function collectRuntimeCreatedIds(files) {
    const ids = new Map();
    const add = (id, f) => {
        if (!id) return;
        const list = ids.get(id) || [];
        if (!list.includes(f)) list.push(f);
        ids.set(id, list);
    };
    for (const f of files) {
        const src = readSafe(f);
        // $.CreatePanel("Panel", parent, "SomeId"
        const reCreate = /\$\.CreatePanel\s*\(\s*["'][^"']*["']\s*,\s*[^,]+,\s*["']([^"']*)["']/g;
        let m;
        while ((m = reCreate.exec(src)) !== null) add(m[1], f);
        // { id: "SomeId" } inside a props literal
        const reProp = /\bid\s*:\s*["']([^"']+)["']/g;
        while ((m = reProp.exec(src)) !== null) add(m[1], f);
        // panel.id = "SomeId"
        const reAssign = /\.id\s*=\s*["']([^"']+)["']/g;
        while ((m = reAssign.exec(src)) !== null) add(m[1], f);
    }
    return ids;
}

/**
 * Every literal-id FindChildTraverse / FindChildInLayoutFile call site.
 * Dynamic ids (variables, concatenation) are reported separately as
 * "unverifiable" rather than silently ignored — a dynamic id in a hot loop is
 * still worth a human look.
 */
function collectLookups(files) {
    const sites = new Map(); // id -> [{file, line}]
    const dynamic = [];
    for (const f of files) {
        const src = readSafe(f);
        const lines = src.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.indexOf("FindChildTraverse") < 0 && line.indexOf("FindChildInLayoutFile") < 0) continue;
            const reLit = /Find(?:ChildTraverse|ChildInLayoutFile)\s*\(\s*["']([^"']+)["']\s*\)/g;
            let m;
            let matched = false;
            while ((m = reLit.exec(line)) !== null) {
                matched = true;
                const list = sites.get(m[1]) || [];
                list.push({ file: path.relative(REPO_ROOT, f), line: i + 1 });
                sites.set(m[1], list);
            }
            if (!matched) {
                dynamic.push({ file: path.relative(REPO_ROOT, f), line: i + 1, text: line.trim().slice(0, 140) });
            }
        }
    }
    return { sites, dynamic };
}

function main() {
    const argv = process.argv.slice(2);
    const wantJson = argv.includes("--json");
    const wantAll = argv.includes("--all");

    const vanillaLayoutDir = path.join(VANILLA_ROOT, "layout");
    const haveVanilla = fs.existsSync(vanillaLayoutDir);

    const vanillaFiles = haveVanilla ? walk(vanillaLayoutDir, [".xml"]) : [];
    const modLayoutFiles = walk(MOD_LAYOUT_DIR, [".xml"]);
    const modScriptFiles = walk(MOD_SCRIPT_DIR, [".js"]);

    const vanillaIds = collectXmlIds(vanillaFiles);
    const modIds = collectXmlIds(modLayoutFiles);
    const runtimeIds = collectRuntimeCreatedIds(modScriptFiles);
    const { sites, dynamic } = collectLookups(modScriptFiles);

    const unreachable = [];
    const reachable = [];

    for (const [id, callSites] of sites) {
        const inVanilla = vanillaIds.has(id);
        const inMod = modIds.has(id);
        const atRuntime = runtimeIds.has(id);
        const isEngine = ENGINE_IDS.has(id);
        const entry = {
            id,
            calls: callSites.length,
            sites: callSites,
            source: inVanilla ? "vanilla" : inMod ? "mod-layout" : atRuntime ? "runtime" : isEngine ? "engine" : "NONE",
        };
        if (entry.source === "NONE") unreachable.push(entry);
        else reachable.push(entry);
    }

    unreachable.sort((a, b) => b.calls - a.calls);
    reachable.sort((a, b) => b.calls - a.calls);

    if (wantJson) {
        process.stdout.write(JSON.stringify({ haveVanilla, unreachable, reachable, dynamic }, null, 2) + "\n");
        return;
    }

    const out = [];
    out.push("=".repeat(78));
    out.push("PANEL ID REACHABILITY AUDIT");
    out.push("=".repeat(78));
    if (!haveVanilla) {
        out.push("");
        out.push(`!! VANILLA LAYOUTS NOT FOUND at ${vanillaLayoutDir}`);
        out.push("!! Every vanilla panel id will look unreachable. Set QOLLOCK_VANILLA");
        out.push("!! to the extracted game panorama dir before trusting this output.");
    }
    out.push("");
    out.push(`vanilla layout files : ${vanillaFiles.length} (${vanillaIds.size} distinct ids)`);
    out.push(`mod layout files     : ${modLayoutFiles.length} (${modIds.size} distinct ids)`);
    out.push(`mod scripts scanned  : ${modScriptFiles.length}`);
    out.push(`runtime-created ids  : ${runtimeIds.size}`);
    out.push(`literal lookups      : ${sites.size} distinct ids across ` +
             `${Array.from(sites.values()).reduce((n, l) => n + l.length, 0)} call sites`);
    out.push(`dynamic lookups      : ${dynamic.length} call sites (id not a literal — not checked)`);
    out.push("");
    out.push("-".repeat(78));
    out.push(`UNREACHABLE IDS — ${unreachable.length} distinct, ` +
             `${unreachable.reduce((n, e) => n + e.calls, 0)} call sites`);
    out.push("Nothing in vanilla, the mod's layouts, or $.CreatePanel can produce these.");
    out.push("Every call is a full-subtree walk that must return null.");
    out.push("-".repeat(78));
    for (const e of unreachable) {
        out.push(`  ${e.id}  (${e.calls} call site${e.calls === 1 ? "" : "s"})`);
        for (const s of e.sites.slice(0, 6)) out.push(`      ${s.file}:${s.line}`);
        if (e.sites.length > 6) out.push(`      ... and ${e.sites.length - 6} more`);
    }
    if (wantAll) {
        out.push("");
        out.push("-".repeat(78));
        out.push(`REACHABLE IDS — ${reachable.length}`);
        out.push("-".repeat(78));
        for (const e of reachable) out.push(`  ${e.id.padEnd(46)} ${String(e.calls).padStart(3)}x  [${e.source}]`);
    }
    process.stdout.write(out.join("\n") + "\n");
}

if (require.main === module) main();

module.exports = { collectXmlIds, collectRuntimeCreatedIds, collectLookups };
