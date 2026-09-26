"use strict";

// Resolve static helper calls, including lexically scoped aliases/destructuring.
// This checks export spelling against a loaded HUD, not native API semantics.
const fs = require("node:fs");
const path = require("node:path");
const espree = require("espree");
const scope = require("eslint-scope");
const { createHud } = require("./simulator");
const root = path.resolve(__dirname, "..");
const prefixes = ["QOL_UTILS", "QOL.utils", "QOL.core.panel", "QOL.core.PanelHelpers",
    "QOL.ui.PanelHelpers", "QOL.core.hud", "QOL.core.time", "QOL.panelCache",
    "QOL.core.Scheduler", "QOL.core.EventBus"];

function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        if (entry.isDirectory()) return entry.name === "tools" ? [] : files(path.join(dir, entry.name));
        return entry.name.endsWith(".js") ? [path.join(dir, entry.name)] : [];
    });
}

function audit() {
    const hud = createHud();
    hud.assertLoaded();
    let calls = 0;
    const used = new Set();
    const missing = [];
    const sources = files(path.join(root, "panorama/scripts"));
    for (const file of sources) {
        const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script", range: true, loc: true });
        const scopes = scope.analyze(ast, { ecmaVersion: 2022, sourceType: "script", optimistic: true, ignoreEval: true });
        const refs = new Map();
        for (const s of scopes.scopes) for (const r of s.references) refs.set(r.identifier, r.resolved);
        function names(node, visited = new Set()) {
            if (!node || visited.has(node)) return [];
            const seen = new Set(visited);
            seen.add(node);
            if (node.type === "ChainExpression") return names(node.expression, seen);
            if (node.type === "Identifier") {
                if (["QOL", "QOL_UTILS", "globalThis", "window"].includes(node.name)) return [node.name];
                const variable = refs.get(node);
                if (!variable) return [];
                return variable.defs.flatMap(def => {
                    if (def.type !== "Variable") return [];
                    let result = names(def.node.init, seen);
                    if (def.node.id.type === "ObjectPattern") {
                        const property = def.node.id.properties.find(p => p.value?.name === node.name);
                        result = property ? result.map(x => x + "." + (property.key.name || property.key.value)) : [];
                    }
                    return result;
                });
            }
            if (node.type === "MemberExpression") {
                const prop = node.computed ? node.property.value : node.property.name;
                return typeof prop === "string" ? names(node.object, seen).map(x =>
                    (x + "." + prop).replace(/^(globalThis|window)\.(QOL|QOL_UTILS)/, "$2")) : [];
            }
            if (node.type === "ConditionalExpression") return [...names(node.consequent, seen), ...names(node.alternate, seen)];
            if (node.type === "LogicalExpression") return [...names(node.left, seen), ...names(node.right, seen)];
            return [];
        }
        function walk(node) {
            if (!node || typeof node !== "object") return;
            if (node.type === "CallExpression") for (const name of new Set(names(node.callee))) {
                if (!prefixes.some(p => name.startsWith(p + ".") && !name.slice(p.length + 1).includes("."))) continue;
                calls++;
                used.add(name);
                const actual = name.split(".").reduce((owner, key) => owner?.[key], hud.sandbox.global);
                if (typeof actual !== "function") missing.push({ file: path.relative(root, file), line: node.loc.start.line, name });
            }
            for (const [key, value] of Object.entries(node)) {
                if (key === "loc" || key === "range") continue;
                if (Array.isArray(value)) value.forEach(walk);
                else if (value && typeof value === "object") walk(value);
            }
        }
        walk(ast);
    }
    return { files: sources.length, calls, helpers: [...used].sort(), missing };
}

module.exports = { audit };
if (require.main === module) {
    const result = audit();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.missing.length ? 1 : 0;
}
