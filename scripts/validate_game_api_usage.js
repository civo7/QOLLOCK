"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Linter } = require("eslint");
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_REGISTRY = path.join(__dirname, "data", "game_api_registry.json");
const DEFAULT_SCRIPTS = path.join(ROOT_DIR, "panorama", "scripts");

// Use the installed ESLint parser, rather than line regexes that miss multiline
// calls, optional calls, command arguments, or accidentally inspect comments.
function scanSource(content, registry, file = "fixture.js") {
    const issues = [];
    const counts = { commands: 0, events: 0, dynamic: 0 };
    const own = (obj, name) => Object.prototype.hasOwnProperty.call(obj || {}, name);
    const issue = (node, severity, type, token, message) => {
        issues.push({ severity, type, file, line: node.loc.start.line, token, message });
    };
    function staticString(node) {
        if (!node) return null;
        if (node.type === "Literal" && typeof node.value === "string") return node.value;
        if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
        if (node.type === "BinaryExpression" && node.operator === "+") {
            const left = staticString(node.left);
            const right = staticString(node.right);
            if (left !== null && right !== null) return left + right;
        }
        return null;
    }
    function dynamic(node, kind) {
        counts.dynamic++;
        issue(node, "warning", "UNVERIFIED_DYNAMIC_" + kind, "<expression>", "Runtime expression: not verified by this static check.");
    }
    function checkCommands(node, argument) {
        const raw = staticString(argument);
        if (raw === null) return dynamic(node, "CONCOMMAND");
        // Console command chains use semicolons/newlines outside quoted arguments.
        const segments = [];
        let quoted = false, escaped = false, segment = "";
        for (const char of raw) {
            if (char === '"' && !escaped) quoted = !quoted;
            if (!quoted && /[;\r\n]/.test(char)) { segments.push(segment); segment = ""; }
            else segment += char;
            escaped = char === "\\" && !escaped;
        }
        segments.push(segment);
        for (const command of segments) {
            const token = command.trim().split(/\s+/)[0].toLowerCase();
            if (!token) continue;
            counts.commands++;
            const entry = own(registry.concommands, token) ? registry.concommands[token]
                : own(registry.convars, token) ? registry.convars[token] : null;
            if (!entry) issue(node, "error", "UNKNOWN_CONCOMMAND", token, "No evidence for this command in the checked-in registry; verify against game data.");
            else if (entry.isCheat) issue(node, "warning", "CHEAT_CONCOMMAND", token, "Registry marks this command as requiring sv_cheats; check its gameplay context.");
        }
    }
    const rule = {
        create() {
            return {
                CallExpression(node) {
                    const callee = node.callee;
                    const property = callee.type === "MemberExpression" ? (callee.computed ? staticString(callee.property) : callee.property.name) : null;
                    const name = callee.type === "Identifier" ? callee.name : property;
                    if (name === "DispatchCitadelConCommand" || name === "dispatchCitadelConCommand") {
                        checkCommands(node, node.arguments[0]);
                        return;
                    }
                    if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier" || callee.object.name !== "$") return;
                    if (!["DispatchEvent", "RegisterEventHandler", "RegisterForUnhandledEvent"].includes(name)) return;
                    const event = staticString(node.arguments[0]);
                    if (event === null) return dynamic(node, "EVENT");
                    counts.events++;
                    if (!own(registry.citadelEvents, event) && !own(registry.citadelFunctions, event)) {
                        // Existing optional compatibility probe only. The dump contains
                        // CCitadelUserMsg_ForceShopClosed, a protocol type, NOT proof of
                        // a Panorama event. Never apply this exception to dispatches.
                        const optionalProbe = file.replace(/\\/g, "/") === "panorama/scripts/core/ql_app.js"
                            && name === "RegisterForUnhandledEvent" && event === "CitadelUserMsg_ForceShopClosed";
                        issue(node, optionalProbe ? "warning" : "error", optionalProbe ? "UNVERIFIED_COMPATIBILITY_PROBE" : "UNKNOWN_PANORAMA_EVENT", event,
                            optionalProbe ? "Existing optional ql_app listener; protocol type found, Panorama event unverified. See docs/VALIDATION.md."
                                : "No evidence for this event name in the checked-in registry; verify against game data.");
                    }
                    if (name === "DispatchEvent" && event === "CitadelConCommand") checkCommands(node, node.arguments[1]);
                }
            };
        }
    };
    const messages = new Linter().verify(content, {
        languageOptions: { ecmaVersion: "latest", sourceType: "script" },
        plugins: { api: { rules: { inspect: rule } } },
        rules: { "api/inspect": "error" }
    });
    for (const msg of messages) {
        issues.push({ severity: "error", type: "PARSE_ERROR", file, line: msg.line || 1, token: "", message: msg.message });
    }
    return { issues, counts };
}

function main(args = process.argv.slice(2)) {
    let scriptsDir = DEFAULT_SCRIPTS;
    let registryFile = DEFAULT_REGISTRY;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--scripts-dir" && args[i + 1]) scriptsDir = path.resolve(args[++i]);
        else if (args[i] === "--registry" && args[i + 1]) registryFile = path.resolve(args[++i]);
        else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
    }
    const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
    for (const key of ["concommands", "convars", "citadelEvents", "citadelFunctions"]) {
        if (!registry[key] || typeof registry[key] !== "object" || Array.isArray(registry[key])) throw new Error(`Invalid registry section: ${key}`);
    }
    const issues = [];
    const counts = { files: 0, commands: 0, events: 0, dynamic: 0 };
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!["legacy", "tools", "node_modules"].includes(entry.name)) walk(full);
            } else if (entry.name.endsWith(".js")) {
                const result = scanSource(fs.readFileSync(full, "utf8"), registry, path.relative(ROOT_DIR, full));
                counts.files++;
                for (const key of ["commands", "events", "dynamic"]) counts[key] += result.counts[key];
                issues.push(...result.issues);
            }
        }
    }
    walk(scriptsDir);
    if (counts.files === 0) throw new Error("No JavaScript files found to validate.");
    for (const item of issues) console.log(`[${item.severity.toUpperCase()} ${item.type}] ${item.file}:${item.line} ${item.token}: ${item.message}`);
    const errors = issues.filter(item => item.severity === "error").length;
    const warnings = issues.length - errors;
    console.log(`[ValidateGameAPI] ${counts.files} files; ${counts.commands} static commands; ${counts.events} static event names; ${counts.dynamic} unverified dynamic calls; ${warnings} warnings; ${errors} errors.`);
    console.log("Registry name matching does not verify native signatures, availability, or in-game behavior.");
    return errors ? 1 : 0;
}

module.exports = { scanSource, main };
if (require.main === module) {
    try { process.exitCode = main(); }
    catch (error) { console.error(`[ValidateGameAPI] ${error.message}`); process.exitCode = 1; }
}
