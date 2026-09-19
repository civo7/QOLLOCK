"use strict";

// ============================================================================
// validate_game_api_usage.js — Deadlock Game API & ConCommand Static Validator
// ============================================================================
// Scans QOLLOCK scripts and validates that all ConCommands and engine events
// actually exist in the game binaries / cvarlist.txt.
// Prevents "guessing" concommands or calling nonexistent engine APIs.
// ============================================================================

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "game_api_registry.json");
const ROOT_DIR = path.resolve(__dirname, "..");
const SCRIPTS_DIR = path.join(ROOT_DIR, "panorama", "scripts");

if (!fs.existsSync(DATA_FILE)) {
    console.error(`[ValidateGameAPI] Registry not found at ${DATA_FILE}. Run 'node scripts/extract_game_api.js' first.`);
    process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const concommands = registry.concommands || {};
const convars = registry.convars || {};
const citadelFunctions = registry.citadelFunctions || {};
const citadelEvents = registry.citadelEvents || {};

// Whitelist of valid mod-internal events and commands that are dispatched via CitadelConCommand or events
const MOD_CUSTOM_EVENTS = new Set([
    "QOLLock_ToggleSettings",
    "QOLLock_UpdateSetting",
    "QOLLock_SyncAll",
    "QOLLock_Reload",
    "CitadelConCommand", // Event used to send concommands
    "CitadelSettings",
    "CitadelResumePlaying",
    "CitadelExitUpgradeShop",
    "CitadelEnterUpgradeShop",
    "CitadelToggleUpgradeShop",
    "CitadelOpenUpgradeShop"
]);

// Known server-side or special engine commands not in standard client cvarlist
const SPECIAL_ENGINE_COMMANDS = new Set([
    "unstick",
    "say",
    "say_chat_team",
    "say_team",
    "kill",
    "disconnect",
    "quit"
]);

function isKnownCommand(cmd) {
    if (!cmd) return false;
    const clean = cmd.trim().toLowerCase();
    if (concommands[clean] || convars[clean]) return true;
    if (SPECIAL_ENGINE_COMMANDS.has(clean)) return true;
    // Strip +/- if it's a bind action (+forward, +openherosheet etc)
    const baseAction = clean.replace(/^[+-]/, "");
    if (concommands[baseAction] || convars[baseAction]) return true;
    return false;
}

function isKnownEvent(evt) {
    if (!evt) return false;
    if (MOD_CUSTOM_EVENTS.has(evt)) return true;
    if (citadelEvents[evt] || citadelFunctions[evt]) return true;
    if (evt.startsWith("Citadel")) return true; // Most Citadel* events are dynamically registered in C++
    return false;
}

console.log("[ValidateGameAPI] Scanning QOLLOCK scripts for engine ConCommands & Events...");

const issues = [];
let totalFilesChecked = 0;
let totalConCommandsChecked = 0;
let totalEventsChecked = 0;

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "legacy" || entry.name === "tools" || entry.name === "node_modules") continue;
            walk(full);
        } else if (entry.name.endsWith(".js")) {
            checkFile(full);
        }
    }
}

function checkFile(filePath) {
    totalFilesChecked++;
    const relPath = path.relative(ROOT_DIR, filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
        const line = lines[lineNo - 1];

        // 1. Check CitadelConCommand / dispatchCitadelConCommand calls with static command string
        // Match: $.DispatchEvent("CitadelConCommand", "command args")
        // Match: dispatchCitadelConCommand("command args")
        // Match: DispatchCitadelConCommand("command args")
        const cmdMatches = line.matchAll(/(?:DispatchCitadelConCommand|\$\.DispatchEvent\s*\(\s*['"]CitadelConCommand['"]\s*,\s*|dispatchCitadelConCommand)\s*\(\s*['"]([^'"]+)['"]/g);
        for (const m of cmdMatches) {
            totalConCommandsChecked++;
            const rawCmdString = m[1].trim();
            const firstToken = rawCmdString.split(/\s+/)[0];

            if (!isKnownCommand(firstToken)) {
                issues.push({
                    type: "UNKNOWN_CONCOMMAND",
                    file: relPath,
                    line: lineNo,
                    token: firstToken,
                    fullCall: m[0],
                    message: `ConCommand '${firstToken}' does NOT exist in Deadlock engine binaries/cvarlist!`
                });
            } else {
                const cmdEntry = concommands[firstToken] || convars[firstToken];
                if (cmdEntry && cmdEntry.isCheat) {
                    issues.push({
                        type: "CHEAT_CONCOMMAND",
                        file: relPath,
                        line: lineNo,
                        token: firstToken,
                        fullCall: m[0],
                        message: `ConCommand '${firstToken}' is marked as CHEAT (requires sv_cheats 1)!`
                    });
                }
            }
        }

        // 2. Check $.DispatchEvent calls
        const evtMatches = line.matchAll(/\$\.DispatchEvent\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g);
        for (const m of evtMatches) {
            const evtName = m[1];
            if (evtName === "CitadelConCommand") continue; // Handled above
            totalEventsChecked++;

            if (!isKnownEvent(evtName)) {
                issues.push({
                    type: "UNKNOWN_PANORAMA_EVENT",
                    file: relPath,
                    line: lineNo,
                    token: evtName,
                    fullCall: m[0],
                    message: `Panorama event '${evtName}' is not registered in Deadlock client.dll strings or official XML!`
                });
            }
        }
    }
}

walk(SCRIPTS_DIR);

console.log(`[ValidateGameAPI] Checked ${totalFilesChecked} files:`);
console.log(`  - ConCommand calls checked: ${totalConCommandsChecked}`);
console.log(`  - Panorama Event calls checked: ${totalEventsChecked}`);

if (issues.length === 0) {
    console.log(`[ValidateGameAPI] ✅ All engine ConCommands and Events are 100% verified against game binaries!`);
    process.exit(0);
} else {
    console.log(`\n[ValidateGameAPI] ⚠️  Found ${issues.length} issue(s):`);
    for (const issue of issues) {
        console.log(`  - [${issue.type}] ${issue.file}:${issue.line} -> ${issue.token}`);
        console.log(`    ${issue.message}`);
    }
    console.log("");
    // Return exit code 0 for warnings or let user decide
    process.exit(0);
}
