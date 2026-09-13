"use strict";

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "game_api_registry.json");

if (!fs.existsSync(DATA_FILE)) {
    console.error(`[check_api] Data file not found: ${DATA_FILE}. Run 'node scripts/extract_game_api.js' first.`);
    process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const query = process.argv[2];

if (!query) {
    console.log("Deadlock Game API Search Tool");
    console.log("Usage: node scripts/check_api.js <command_or_function_name>");
    console.log("Examples:");
    console.log("  node scripts/check_api.js citadel_open_hero_sheet");
    console.log("  node scripts/check_api.js hud_free_cursor");
    console.log("  node scripts/check_api.js DropInputFocus");
    console.log("  node scripts/check_api.js CitadelResumePlaying");
    console.log("  node scripts/check_api.js openherosheet");
    process.exit(0);
}

function levenshtein(a, b) {
    const al = a.length;
    const bl = b.length;
    const m = [];
    for (let i = 0; i <= al; i++) m[i] = [i];
    for (let j = 0; j <= bl; j++) m[0][j] = j;
    for (let i = 1; i <= al; i++) {
        for (let j = 1; j <= bl; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            m[i][j] = Math.min(
                m[i - 1][j] + 1,
                m[i][j - 1] + 1,
                m[i - 1][j - 1] + cost
            );
        }
    }
    return m[al][bl];
}

console.log(`\n🔍 Searching Deadlock API for: '${query}'\n`);

let foundExact = false;

// 1. Check ConCommands
if (registry.concommands[query]) {
    foundExact = true;
    const cmd = registry.concommands[query];
    console.log(`✅ [ConCommand] ${cmd.name}`);
    console.log(`   Flags:     [${cmd.flags.join(", ") || "none"}]`);
    console.log(`   Cheat:     ${cmd.isCheat ? "⚠️  YES (Requires sv_cheats 1)" : "NO (Safe in matchmaking)"}`);
    console.log(`   Client:    ${cmd.isClient ? "YES (Client-executable)" : "NO (Server-only)"}`);
    console.log(`   Release:   ${cmd.isRelease ? "YES (Shipped release)" : "NO"}`);
    if (cmd.help) console.log(`   Help:      "${cmd.help}"`);
    console.log(`   Usage in JS: $.DispatchEvent('CitadelConCommand', '${cmd.name}');\n`);
}

// 2. Check ConVars
if (registry.convars[query]) {
    foundExact = true;
    const cvar = registry.convars[query];
    console.log(`✅ [ConVar] ${cvar.name}`);
    console.log(`   Default:   "${cvar.defaultValue}"`);
    console.log(`   Flags:     [${cvar.flags.join(", ") || "none"}]`);
    console.log(`   Cheat:     ${cvar.isCheat ? "⚠️  YES (Requires sv_cheats 1)" : "NO (Safe in matchmaking)"}`);
    console.log(`   Client:    ${cvar.isClient ? "YES (Client-executable)" : "NO (Server-only)"}`);
    if (cvar.help) console.log(`   Help:      "${cvar.help}"`);
    console.log(`   Usage in JS: $.DispatchEvent('CitadelConCommand', '${cvar.name} <value>');\n`);
}

// 3. Check Global Engine Functions
if (registry.citadelFunctions[query]) {
    foundExact = true;
    const fn = registry.citadelFunctions[query];
    console.log(`✅ [Global Engine Function] ${fn.name}()`);
    console.log(`   Source:    ${fn.source}`);
    console.log(`   XML Usage: ${fn.xmlUsageCount} time(s) in official Deadlock layout`);
    console.log(`   Usage in JS: ${fn.name}();\n`);
}

// 4. Check Panorama Events
if (registry.citadelEvents[query]) {
    foundExact = true;
    const evt = registry.citadelEvents[query];
    console.log(`✅ [Panorama Event] '${evt.name}'`);
    console.log(`   XML Usage: ${evt.xmlUsageCount} time(s) in official Deadlock layout`);
    console.log(`   Usage in JS: $.DispatchEvent('${evt.name}', panel, ...);\n`);
}

// 5. Check Panel Classes
if (registry.panelTypes[query]) {
    foundExact = true;
    const count = registry.panelTypes[query];
    console.log(`✅ [C++ Panel Type] <${query}>`);
    console.log(`   Occurrences: ${count} in official layout XMLs\n`);
}

// 6. Check Panel Methods
if (registry.panelMethods.includes(query)) {
    foundExact = true;
    console.log(`✅ [Panorama Panel Method] panel.${query}(...)\n`);
}

// 7. Check Dollar Methods
if (registry.dollarMethods.includes(query)) {
    foundExact = true;
    console.log(`✅ [Panorama $ Method] $.${query}(...)\n`);
}

// If not found, find similar symbols
if (!foundExact) {
    console.log(`❌ NOT FOUND: '${query}' DOES NOT EXIST in Deadlock engine!\n`);

    const qLower = query.toLowerCase();
    const qClean = qLower.replace(/[_\s\-+]/g, "");
    const suggestions = [];

    function checkCandidate(cand, type, detail) {
        const cLower = cand.toLowerCase();
        const cClean = cLower.replace(/[_\s\-+]/g, "");
        let score = 999;
        if (cLower === qLower) {
            score = 0;
        } else if (cClean === qClean) {
            score = 1;
        } else if (cClean.includes(qClean) || qClean.includes(cClean)) {
            score = 2 + Math.abs(cClean.length - qClean.length) * 0.05;
        } else if (cLower.includes(qLower) || qLower.includes(cLower)) {
            score = 3 + Math.abs(cand.length - query.length) * 0.1;
        } else {
            const dist = levenshtein(qClean, cClean);
            if (dist <= 3 || (qClean.length > 8 && dist <= 5)) {
                score = 10 + dist;
            }
        }
        if (score < 999) {
            suggestions.push({ name: cand, type, detail, score });
        }
    }

    // Check all concommands
    for (const [name, cmd] of Object.entries(registry.concommands)) {
        checkCandidate(name, "ConCommand", cmd.help ? `"${cmd.help}"` : `flags: [${cmd.flags.join(", ")}]`);
    }
    // Check all convars
    for (const [name, cv] of Object.entries(registry.convars)) {
        checkCandidate(name, "ConVar", cv.help ? `"${cv.help}"` : `flags: [${cv.flags.join(", ")}]`);
    }
    // Check all functions
    for (const [name, fn] of Object.entries(registry.citadelFunctions)) {
        checkCandidate(name, "Function", `source: ${fn.source}`);
    }
    // Check all events
    for (const [name, evt] of Object.entries(registry.citadelEvents)) {
        checkCandidate(name, "Event", `xml usage: ${evt.xmlUsageCount}`);
    }

    suggestions.sort((a, b) => a.score - b.score);
    const top = suggestions.slice(0, 8);

    if (top.length > 0) {
        console.log(`💡 Did you mean one of these real engine symbols?`);
        for (const s of top) {
            console.log(`   • [${s.type}] ${s.name} (${s.detail})`);
        }
        console.log("");
    } else {
        console.log(`   (No similar symbols found in the engine dump)\n`);
    }
}
