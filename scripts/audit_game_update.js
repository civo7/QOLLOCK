"use strict";

// Source evidence, not a claim about the native C++ panel tree.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const espree = require("espree");
const scope = require("eslint-scope");
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BASELINE = path.join(__dirname, "game_update_runs", "before.json");
const slash = value => value.replace(/\\/g, "/");

function files(dir, extension) {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? files(full, extension) : entry.name.endsWith(extension) ? [full] : [];
    });
}
function stripComments(text) {
    return text.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, " "));
}
function xmlSymbols(raw) {
    const text = stripComments(raw);
    const symbols = [];
    const parents = [];
    for (const match of text.matchAll(/<\/?[A-Za-z_][\w:.-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
        const tag = match[0];
        if (tag.startsWith("</")) { parents.pop(); continue; }
        const type = tag.match(/^<([\w:.-]+)/)[1];
        const attrs = Object.fromEntries([...tag.matchAll(/\s([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m => [m[1], m[3]]));
        const ancestry = parents.join("/");
        const line = text.slice(0, match.index).split("\n").length;
        if (attrs.id) symbols.push({ kind: "id", token: attrs.id, line, ancestry, type, evidence: "xml" });
        for (const token of (attrs.class || attrs.classes || "").split(/\s+/).filter(Boolean)) {
            symbols.push({ kind: "class", token, line, ancestry, type, evidence: "xml" });
        }
        if (!/\/\s*>$/.test(tag)) parents.push(type + (attrs.id ? "#" + attrs.id : "") + (attrs.class ? "." + attrs.class.trim().split(/\s+/).sort().join(".") : ""));
    }
    return symbols;
}
function cssSymbols(raw) {
    // Selector references are weaker evidence than XML declarations. They may
    // describe C++ panels or obsolete rules; never treat them as live panels.
    const text = stripComments(raw).replace(/@define\s+[^;]+;/g, "");
    const symbols = [];
    for (const block of text.matchAll(/([^{}]+)\{/g)) {
        const selector = block[1].trim();
        if (selector.startsWith("@")) continue;
        for (const match of selector.matchAll(/([#.])([A-Za-z_][\w-]*)/g)) {
            symbols.push({ kind: match[1] === "#" ? "id" : "class", token: match[2], evidence: "css" });
        }
    }
    return symbols;
}
function snapshot(panorama, label = "") {
    const layouts = files(path.join(panorama, "layout"), ".xml");
    const styles = files(path.join(panorama, "styles"), ".css");
    if (!layouts.length || !styles.length) throw new Error("Expected nonempty Panorama layout/ and styles/ directories.");
    let revision = null;
    try { revision = execFileSync("git", ["-C", panorama, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (_) { /* Extracts need not be Git checkouts. */ }
    const entries = {};
    for (const file of [...layouts, ...styles]) {
        const text = fs.readFileSync(file, "utf8");
        entries[slash(path.relative(panorama, file))] = {
            hash: crypto.createHash("sha256").update(text.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, "").replace(/\r\n/g, "\n").trim()).digest("hex"),
            symbols: file.endsWith(".xml") ? xmlSymbols(text) : cssSymbols(text)
        };
    }
    return { version: 1, label, revision, capturedAt: new Date().toISOString(), files: entries };
}

const nativeCalls = {
    FindChildTraverse: ["id", 0], FindChildInLayoutFile: ["id", 0], FindChild: ["id", 0],
    FindChildrenWithClassTraverse: ["class", 0], BHasClass: ["class", 0]
};
const helperCalls = {};
for (const prefix of ["QOL.core.panel", "QOL.ui.PanelHelpers", "QOL.core.PanelHelpers"]) {
    for (const name of ["findChild", "findTraverse"]) helperCalls[prefix + "." + name] = ["id", 1];
}
for (const prefix of ["QOL.utils", "QOL_UTILS"]) {
    for (const name of ["FindPanelsByClass", "FindFirstPanelByClass", "FindAncestorWithClass", "HasClassInHierarchy"]) {
        helperCalls[prefix + "." + name] = ["class", 1];
    }
}
helperCalls["QOL.panelCache.resolve"] = ["id", 2];
helperCalls["QOL.resolveCachedPanel"] = ["id", 2];
helperCalls["QOL.core.hud.resolveCachedPanel"] = ["id", 2];

function scanSource(text, file = "fixture.js") {
    const ast = espree.parse(text, { ecmaVersion: 2021, sourceType: "script", range: true, loc: true });
    const scopes = scope.analyze(ast, { ecmaVersion: 2021, sourceType: "script", optimistic: true, ignoreEval: true });
    const refs = new Map();
    for (const s of scopes.scopes) for (const ref of s.references) refs.set(ref.identifier, ref.resolved);
    function initializer(node) {
        const variable = refs.get(node);
        if (!variable || variable.defs.length !== 1 || variable.references.some(ref => ref.isWrite() && !ref.init)) return null;
        const def = variable.defs[0];
        return def.type === "Variable" && def.node.id.type === "Identifier" ? def.node.init : null;
    }
    function literal(node, seen = new Set()) {
        if (!node || seen.has(node)) return null;
        seen = new Set(seen).add(node);
        if (node.type === "Literal" && typeof node.value === "string") return node.value;
        if (node.type === "TemplateLiteral" && !node.expressions.length) return node.quasis[0].value.cooked;
        if (node.type === "Identifier") return literal(initializer(node), seen);
        if (node.type === "BinaryExpression" && node.operator === "+") {
            const a = literal(node.left, seen), b = literal(node.right, seen);
            return a !== null && b !== null ? a + b : null;
        }
        return null;
    }
    function names(node, seen = new Set()) {
        if (!node || seen.has(node)) return [];
        seen = new Set(seen).add(node);
        if (node.type === "ChainExpression") return names(node.expression, seen);
        if (node.type === "Identifier") {
            if (!refs.get(node) && ["QOL", "QOL_UTILS", "$"].includes(node.name)) return [node.name];
            return names(initializer(node), seen);
        }
        if (node.type === "MemberExpression") {
            const prop = node.computed ? literal(node.property) : node.property.name;
            return prop === null ? [] : names(node.object, seen).map(name => name + "." + prop);
        }
        if (node.type === "ConditionalExpression") return [...names(node.consequent, seen), ...names(node.alternate, seen)];
        if (node.type === "LogicalExpression") return [...names(node.left, seen), ...names(node.right, seen)];
        return [];
    }
    const lookups = [], dynamic = [], created = [];
    function walk(node) {
        if (!node || typeof node !== "object") return;
        if (node.type === "CallExpression") {
            const callee = node.callee;
            const resolved = names(callee);
            const method = callee.type === "MemberExpression" ? (callee.computed ? literal(callee.property) : callee.property.name) : null;
            const specs = [];
            if (Object.prototype.hasOwnProperty.call(nativeCalls, method)) specs.push([method, nativeCalls[method]]);
            for (const name of resolved) if (helperCalls[name]) specs.push([name, helperCalls[name]]);
            for (const [call, [kind, index]] of specs) {
                const arg = node.arguments[index];
                const token = literal(arg);
                const site = { file, line: node.loc.start.line, call, kind, expression: arg ? text.slice(...arg.range) : "<missing>" };
                if (token === null) dynamic.push(site);
                else if (token) lookups.push({ ...site, token });
            }
            if (resolved.some(name => ["$.CreatePanel", "QOL.core.panel.create", "QOL.ui.PanelHelpers.create"].includes(name))) {
                const token = literal(node.arguments[2]);
                if (token) created.push({ kind: "id", token, file, line: node.loc.start.line, evidence: "mod-js" });
            }
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === "range" || key === "loc") continue;
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === "object") walk(value);
        }
    }
    walk(ast);
    return { lookups, dynamic, created };
}
function indexSnapshot(data) {
    if (data.version !== 1 || !data.files || !Object.keys(data.files).length) throw new Error("Invalid or empty baseline snapshot.");
    const index = new Map();
    for (const [file, entry] of Object.entries(data.files)) {
        if (typeof entry.hash !== "string" || !Array.isArray(entry.symbols)) throw new Error("Invalid snapshot file: " + file);
        for (const symbol of entry.symbols) {
            if (!["id", "class"].includes(symbol.kind) || typeof symbol.token !== "string") throw new Error("Invalid snapshot symbol: " + file);
            const key = symbol.kind + ":" + symbol.token;
            if (!index.has(key)) index.set(key, []);
            index.get(key).push({ file, ...symbol });
        }
    }
    return index;
}
function compare(before, after, scanned, modSymbols = [], overriddenLayouts = []) {
    const oldIndex = indexSnapshot(before), newIndex = indexSnapshot(after);
    const modIndex = new Map();
    for (const item of [...modSymbols, ...scanned.created]) {
        const key = item.kind + ":" + item.token;
        if (!modIndex.has(key)) modIndex.set(key, []);
        modIndex.get(key).push(item);
    }
    const grouped = new Map();
    for (const site of scanned.lookups) {
        const key = site.kind + ":" + site.token;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(site);
    }
    const findings = [], unresolved = [];
    let unchanged = 0, modOnly = 0;
    const signature = e => JSON.stringify([e.file, e.type, e.ancestry, e.evidence]);
    for (const [key, sites] of grouped) {
        const old = oldIndex.get(key) || [], current = newIndex.get(key) || [], mod = modIndex.get(key) || [];
        const lost = old.filter(e => !current.some(n => signature(n) === signature(e)));
        const entry = { kind: sites[0].kind, token: sites[0].token, sites, before: old, after: current, modEvidence: mod };
        if (old.length && !current.length) findings.push({ status: "SOURCE_REMOVED", ...entry });
        else if (lost.length) findings.push({ status: "SOURCE_CHANGED", ...entry });
        else if (!old.length && !current.length && !mod.length) unresolved.push({ status: "UNVERIFIED", ...entry });
        else if (!old.length && !current.length) modOnly++;
        else unchanged++;
    }
    const changedOverrides = overriddenLayouts.filter(file => before.files[file] && (!after.files[file] || before.files[file].hash !== after.files[file].hash));
    return {
        baseline: { label: before.label, revision: before.revision, capturedAt: before.capturedAt },
        current: { label: after.label, revision: after.revision, capturedAt: after.capturedAt },
        summary: { dependencies: grouped.size, findings: findings.length, unresolved: unresolved.length, dynamic: scanned.dynamic.length, unchanged, modOnly, changedOverrides: changedOverrides.length },
        findings, changedOverrides, unresolved, dynamic: scanned.dynamic
    };
}
function auditRepository(repo, before, after) {
    const scanned = { lookups: [], dynamic: [], created: [] };
    const scripts = files(path.join(repo, "panorama/scripts"), ".js").filter(file => !slash(path.relative(repo, file)).startsWith("panorama/scripts/tools/"));
    if (!scripts.length) throw new Error("No mod scripts found.");
    for (const file of scripts) {
        const result = scanSource(fs.readFileSync(file, "utf8"), slash(path.relative(repo, file)));
        for (const key of Object.keys(scanned)) scanned[key].push(...result[key]);
    }
    const layouts = files(path.join(repo, "panorama/layout"), ".xml");
    const modSymbols = layouts.flatMap(file => xmlSymbols(fs.readFileSync(file, "utf8")).map(symbol => ({ file: slash(path.relative(repo, file)), ...symbol })));
    const stylesRoot = path.join(repo, "panorama/styles");
    for (const file of files(stylesRoot, ".css").filter(file => !slash(path.relative(stylesRoot, file)).startsWith("base/"))) {
        modSymbols.push(...cssSymbols(fs.readFileSync(file, "utf8")).map(symbol => ({ file: slash(path.relative(repo, file)), ...symbol })));
    }
    const result = compare(before, after, scanned, modSymbols, layouts.map(file => slash(path.relative(path.join(repo, "panorama"), file))));
    result.summary.scripts = scripts.length;
    return result;
}
function formatReport(result) {
    const out = ["QOLLOCK game update audit", JSON.stringify(result.summary),
        "Source changes are review candidates, NOT confirmed client failures.",
        "All runtime JS files scanned (including inactive ones); dynamic expressions need manual review.", ""];
    for (const finding of result.findings) {
        out.push(`${finding.status} ${finding.kind} ${finding.token}`);
        for (const site of finding.sites) out.push(`  ${site.file}:${site.line} ${site.call}(${site.expression})`);
        for (const [label, evidence] of [["before", finding.before], ["after", finding.after]]) {
            out.push("  " + label + ":");
            if (!evidence.length) out.push("    no source evidence");
            for (const e of evidence.slice(0, 6)) out.push(`    ${e.file}${e.line ? ":" + e.line : ""} [${e.evidence}] ${e.ancestry || ""}${e.type ? " -> " + e.type : ""}`);
            if (evidence.length > 6) out.push(`    ... ${evidence.length - 6} more locations in --json`);
        }
        if (finding.modEvidence.length) out.push("  Still present in mod sources; this does NOT hide upstream removal/change.");
    }
    out.push("", "Changed vanilla layouts overridden by QOLLOCK:", ...result.changedOverrides.map(file => "  " + file));
    for (const [title, entries] of [["UNVERIFIED (may be C++/conditional panels)", result.unresolved], ["DYNAMIC (not statically resolved)", result.dynamic]]) {
        out.push("", `${title}: ${entries.length} (first 20; --json contains all)`);
        for (const item of entries.slice(0, 20)) {
            const site = item.sites ? item.sites[0] : item;
            out.push(`  ${item.token || item.expression} — ${site.file}:${site.line}`);
        }
    }
    return out.join("\n") + "\n";
}
function main(args) {
    const command = args.shift();
    if (!command || command === "--help") {
        console.log("Usage: node scripts/audit_game_update.js snapshot|check --vanilla <panorama-dir> [--baseline <file>] [--label <text>] [--json] [--fail-on-change]\nSnapshot refuses to overwrite an existing baseline. Check never writes files. Defaults: QOLLOCK_VANILLA and scripts/game_update_runs/before.json.");
        return;
    }
    if (!["snapshot", "check"].includes(command)) throw new Error("Unknown command: " + command);
    const options = {};
    while (args.length) {
        const key = args.shift();
        if (["--json", "--fail-on-change"].includes(key)) options[key] = true;
        else if (["--vanilla", "--baseline", "--label"].includes(key) && args.length && !args[0].startsWith("--")) options[key] = args.shift();
        else throw new Error("Unknown option or missing value: " + key);
    }
    const vanilla = options["--vanilla"] || process.env.QOLLOCK_VANILLA;
    if (!vanilla) throw new Error("Supply --vanilla <panorama-dir> or QOLLOCK_VANILLA.");
    const baseline = path.resolve(options["--baseline"] || DEFAULT_BASELINE);
    if (command === "snapshot") {
        if (fs.existsSync(baseline)) throw new Error("Baseline already exists; choose a new --baseline path to preserve pre-update evidence.");
        const data = snapshot(vanilla, options["--label"] || "");
        fs.mkdirSync(path.dirname(baseline), { recursive: true });
        fs.writeFileSync(baseline, JSON.stringify(data), { flag: "wx" });
        console.log(`Saved ${Object.keys(data.files).length} source files to ${baseline}`);
    } else {
        const before = JSON.parse(fs.readFileSync(baseline, "utf8"));
        indexSnapshot(before);
        const result = auditRepository(ROOT, before, snapshot(vanilla, options["--label"] || ""));
        process.stdout.write(options["--json"] ? JSON.stringify(result, null, 2) + "\n" : formatReport(result));
        if (options["--fail-on-change"] && (result.findings.length || result.changedOverrides.length)) process.exitCode = 1;
    }
}
module.exports = { xmlSymbols, cssSymbols, snapshot, scanSource, compare, auditRepository, formatReport, main };
if (require.main === module) {
    try { main(process.argv.slice(2)); } catch (error) { console.error("Game update audit failed: " + error.message); process.exitCode = 2; }
}
