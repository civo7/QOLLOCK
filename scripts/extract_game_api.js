"use strict";

const fs = require("fs");
const path = require("path");

const CVARLIST_PATH = "D:/GitHub2/panorama-deadlock-stuff/cvarlist.txt";
const STRINGS_DIR = "D:/GitHub2/panorama-deadlock-stuff/strings_dump";
const GAME_TRACKING_PANORAMA = "G:/GameTracking-Deadlock/game/citadel/pak01_dir/panorama";
const OUTPUT_DATA_DIR = path.join(__dirname, "data");
const OUTPUT_FILE = path.join(OUTPUT_DATA_DIR, "game_api_registry.json");

if (!fs.existsSync(OUTPUT_DATA_DIR)) {
    fs.mkdirSync(OUTPUT_DATA_DIR, { recursive: true });
}

console.log("[Extractor] Starting Deadlock Game API extraction...");

function unescapeXml(str) {
    if (!str) return "";
    return str
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

// ─────────────────────────────────────────────────────────────
// 1. Parse cvarlist.txt
// ─────────────────────────────────────────────────────────────
function parseCvarlist() {
    console.log("[Extractor] Parsing cvarlist.txt...");
    const content = fs.readFileSync(CVARLIST_PATH, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);

    const convars = {};
    const concommands = {};

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const tokens = [];
        let cur = "";
        let inQuote = false;
        for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === "," && !inQuote) {
                tokens.push(cur.trim());
                cur = "";
            } else {
                cur += char;
            }
        }
        tokens.push(cur.trim());

        if (tokens.length < 2) continue;

        const name = tokens[0].replace(/^"|"$/g, "").trim();
        const val = tokens[1].replace(/^"|"$/g, "").trim();
        const help = (tokens[tokens.length - 1] || "").replace(/^"|"$/g, "").trim();

        const flags = [];
        for (let t = 2; t < tokens.length - 1; t++) {
            const flag = tokens[t].toLowerCase();
            if (flag && flag.length > 0) {
                flags.push(flag);
            }
        }

        const isCommand = val === "cmd";
        const entry = {
            name,
            isCommand,
            defaultValue: isCommand ? undefined : val,
            flags,
            isCheat: flags.includes("cheat"),
            isClient: flags.includes("cl") || flags.includes("clientdll"),
            isRelease: flags.includes("release"),
            help: help || ""
        };

        if (isCommand) {
            concommands[name] = entry;
        } else {
            convars[name] = entry;
        }
    }

    console.log(`[Extractor] Loaded ${Object.keys(concommands).length} ConCommands, ${Object.keys(convars).length} ConVars.`);
    return { concommands, convars };
}

// ─────────────────────────────────────────────────────────────
// 2. Scan official layout XMLs and scripts in GameTracking
// ─────────────────────────────────────────────────────────────
function scanOfficialPanorama() {
    if (!fs.existsSync(GAME_TRACKING_PANORAMA)) {
        console.warn(`[Extractor] Official Panorama dir not found: ${GAME_TRACKING_PANORAMA}`);
        return { xmlFunctions: {}, xmlEvents: {}, xmlPanels: {} };
    }

    console.log("[Extractor] Scanning official XML layouts & scripts in GameTracking...");
    const xmlFunctions = {}; // name -> count
    const xmlEvents = {};    // name -> count
    const xmlPanels = {};    // tag/class -> count

    function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.name.endsWith(".xml") || entry.name.endsWith(".js")) {
                const raw = fs.readFileSync(fullPath, "utf8");
                const content = unescapeXml(raw);

                // If XML, match element tags: e.g. <CitadelFriendsList ...
                if (entry.name.endsWith(".xml")) {
                    const tagMatches = content.matchAll(/<([A-Z][A-Za-z0-9_]+)[\s>]/g);
                    for (const m of tagMatches) {
                        const tag = m[1];
                        xmlPanels[tag] = (xmlPanels[tag] || 0) + 1;
                    }
                }

                // Match attribute function calls: onactivate="CitadelFunction(args)" or "Function(args)"
                const attrMatches = content.matchAll(/\s(?:on\w+|onload|oncancel|onactivate|onmouseover|onmouseout|onfocus)\s*=\s*"([^"]+)"/g);
                for (const m of attrMatches) {
                    const val = m[1].trim();

                    // Direct function call: FooBar(...)
                    const fnMatch = val.match(/^([A-Za-z0-9_]+)\s*\(/);
                    if (fnMatch) {
                        const fnName = fnMatch[1];
                        if (fnName !== "if" && fnName !== "function") {
                            xmlFunctions[fnName] = (xmlFunctions[fnName] || 0) + 1;
                        }
                    }
                }

                // Match $.DispatchEvent( 'EventName', ... ) across all XML and JS
                const dispatchMatches = content.matchAll(/(?:\$\.DispatchEvent|DispatchEventAsync)\s*\(\s*['"]([^'"]+)['"]/g);
                for (const d of dispatchMatches) {
                    const evt = d[1].trim();
                    if (evt && !evt.includes("$") && !evt.includes(" ") && !evt.includes("+")) {
                        xmlEvents[evt] = (xmlEvents[evt] || 0) + 1;
                    }
                }

                // Match $.RegisterEventHandler( 'EventName', ... )
                const handlerMatches = content.matchAll(/\$\.RegisterEventHandler\s*\(\s*['"]([^'"]+)['"]/g);
                for (const h of handlerMatches) {
                    const evt = h[1].trim();
                    if (evt && !evt.includes("$") && !evt.includes(" ") && !evt.includes("+")) {
                        xmlEvents[evt] = (xmlEvents[evt] || 0) + 1;
                    }
                }
            }
        }
    }

    walk(GAME_TRACKING_PANORAMA);
    console.log(`[Extractor] Found in official Panorama: ${Object.keys(xmlFunctions).length} functions, ${Object.keys(xmlEvents).length} events, ${Object.keys(xmlPanels).length} panel types.`);
    return { xmlFunctions, xmlEvents, xmlPanels };
}

// ─────────────────────────────────────────────────────────────
// 3. Scan strings dumps from client.dll, panorama.dll, server.dll
// ─────────────────────────────────────────────────────────────
function scanStringsDumps() {
    console.log("[Extractor] Scanning DLL string dumps...");
    const clientStringsPath = path.join(STRINGS_DIR, "client.dll.strings.txt");
    const panoramaStringsPath = path.join(STRINGS_DIR, "panorama.dll.strings.txt");
    const clientUiStringsPath = path.join(STRINGS_DIR, "panoramauiclient.dll.strings.txt");
    const serverStringsPath = path.join(STRINGS_DIR, "server.dll.strings.txt");

    const clientStrings = fs.existsSync(clientStringsPath)
        ? new Set(fs.readFileSync(clientStringsPath, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean))
        : new Set();

    const panoramaStrings = fs.existsSync(panoramaStringsPath)
        ? new Set(fs.readFileSync(panoramaStringsPath, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean))
        : new Set();

    const clientUiStrings = fs.existsSync(clientUiStringsPath)
        ? new Set(fs.readFileSync(clientUiStringsPath, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean))
        : new Set();

    const serverStrings = fs.existsSync(serverStringsPath)
        ? new Set(fs.readFileSync(serverStringsPath, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean))
        : new Set();

    console.log(`[Extractor] Loaded string dumps: client=${clientStrings.size}, panorama=${panoramaStrings.size}, clientUi=${clientUiStrings.size}, server=${serverStrings.size}`);
    return { clientStrings, panoramaStrings, clientUiStrings, serverStrings };
}

// ─────────────────────────────────────────────────────────────
// 4. Correlate and Build Master API Database
// ─────────────────────────────────────────────────────────────
function buildRegistry() {
    const { concommands, convars } = parseCvarlist();
    const { xmlFunctions, xmlEvents, xmlPanels } = scanOfficialPanorama();
    const { clientStrings, panoramaStrings, clientUiStrings, serverStrings } = scanStringsDumps();

    // Extra engine concommands present in DLLs but not in standard cvarlist dump
    const dllEngineCommands = [
        "open_item_shop",
        "open_item_draft",
        "selecthero",
        "unstick",
        "say",
        "say_team",
        "say_chat_team",
        "kill",
        "disconnect",
        "quit"
    ];

    for (const cmd of dllEngineCommands) {
        if (!concommands[cmd] && (clientStrings.has(cmd) || serverStrings.has(cmd))) {
            concommands[cmd] = {
                name: cmd,
                isCommand: true,
                flags: ["dll_engine"],
                isCheat: false,
                isClient: clientStrings.has(cmd),
                isRelease: true,
                help: "Engine concommand verified in Deadlock DLLs"
            };
        }
    }

    // Collect all Citadel global functions
    const citadelFunctions = {};
    for (const str of clientStrings) {
        if (str.startsWith("Citadel") && /^[A-Za-z0-9_]+$/.test(str)) {
            citadelFunctions[str] = {
                name: str,
                source: "client.dll",
                xmlUsageCount: xmlFunctions[str] || 0
            };
        }
    }
    for (const [fn, count] of Object.entries(xmlFunctions)) {
        if (!citadelFunctions[fn]) {
            citadelFunctions[fn] = {
                name: fn,
                source: "official_layout",
                xmlUsageCount: count
            };
        }
    }

    // Panorama global helper functions exposed to JS
    const globalPanoramaFunctions = [
        "DropInputFocus",
        "DismissAllContextMenus",
        "UIShowTextTooltip",
        "UIHideTextTooltip",
        "CitadelUIShowTextTooltip",
        "CitadelUIHideTextTooltip",
        "ToggleStyleEditor",
        "ToggleDebugger",
        "SetInputFocus",
        "IsKeyDown"
    ];

    for (const fn of globalPanoramaFunctions) {
        citadelFunctions[fn] = {
            name: fn,
            source: "panorama_global",
            xmlUsageCount: xmlFunctions[fn] || 0
        };
    }

    // Core Panorama events from panorama.dll
    const panoramaCoreEvents = [
        "Activated",
        "Cancelled",
        "ContextMenu",
        "TextEntryChanged",
        "TextEntrySubmit",
        "CopyStringToClipboard",
        "TextEntryCopyToClipboard",
        "TextEntryInsertFromClipboard",
        "PageLeft",
        "PageRight",
        "PageUp",
        "PageDown",
        "DragStart",
        "DragEnd",
        "DragEnter",
        "DragLeave",
        "DragDrop",
        "FocusChanged",
        "PanelLoaded"
    ];

    const citadelEvents = {};

    // CitadelHTMLPanel title callback lives in panoramauiclient.dll, not panorama.dll.
    if (clientUiStrings.has("HTMLTitle")) {
        citadelEvents.HTMLTitle = { name: "HTMLTitle", xmlUsageCount: xmlEvents.HTMLTitle || 0, source: "panoramauiclient.dll" };
    }

    for (const evt of panoramaCoreEvents) {
        if (panoramaStrings.has(evt) || clientStrings.has(evt)) {
            citadelEvents[evt] = {
                name: evt,
                xmlUsageCount: xmlEvents[evt] || 0,
                source: "panorama.dll"
            };
        }
    }

    // Collect Citadel Events (from $.DispatchEvent or client strings)
    for (const [evt, count] of Object.entries(xmlEvents)) {
        citadelEvents[evt] = {
            name: evt,
            xmlUsageCount: count,
            source: "official_code"
        };
    }

    // Index event-like strings from client.dll (e.g. Citadel* events)
    for (const str of clientStrings) {
        if (str.startsWith("Citadel") && !str.includes(" ") && !str.includes(".") && !str.includes("/")) {
            if (!citadelEvents[str] && !str.endsWith("Manifest") && !str.endsWith("_t") && !str.startsWith("CitadelHud")) {
                citadelEvents[str] = {
                    name: str,
                    xmlUsageCount: xmlEvents[str] || 0,
                    source: "client.dll"
                };
            }
        }
    }

    // Standard Panel methods in Panorama
    const panelMethods = [
        "FindChildTraverse",
        "FindChildrenWithClassTraverse",
        "FindChild",
        "FindChildInLayoutFile",
        "GetParent",
        "GetChildCount",
        "GetChild",
        "Children",
        "AddClass",
        "RemoveClass",
        "SetHasClass",
        "ToggleClass",
        "BHasClass",
        "HasClass",
        "SwitchClass",
        "SetDialogVariable",
        "SetDialogVariableInt",
        "SetDialogVariableFloat",
        "SetDialogVariableTime",
        "SetAttributeString",
        "GetAttributeString",
        "SetAttributeInt",
        "GetAttributeInt",
        "SetAttributeUInt32",
        "GetAttributeUInt32",
        "SetFocus",
        "SetAcceptsFocus",
        "BLoadLayout",
        "BLoadLayoutFromString",
        "DeleteAsync",
        "SetPanelEvent",
        "ClearPanelEvent",
        "ScrollToBottom",
        "ScrollToTop",
        "ApplyStyles",
        "style",
        "text",
        "html",
        "visible",
        "enabled",
        "hittest",
        "hittestchildren",
        "actuallayoutwidth",
        "actuallayoutheight",
        "actualxoffset",
        "actualyoffset",
        "id"
    ];

    // Standard $ methods in Panorama
    const dollarMethods = [
        "Msg",
        "Schedule",
        "CancelScheduled",
        "DispatchEvent",
        "DispatchEventAsync",
        "RegisterEventHandler",
        "RegisterForUnhandledEvent",
        "UnregisterForUnhandledEvent",
        "CreatePanel",
        "CreatePanelWithProperties",
        "GetContextPanel",
        "Localize",
        "Async",
        "Each"
    ];

    // Built-in namespaces
    const namespaces = {
        Game: {
            description: "Source 2 Game engine interface (local player, game rules, time)",
            methods: ["GetLocalPlayerID", "GetLocalPlayerTeamID", "Time", "ServerTime", "IsInGame", "GetGameTime"]
        },
        GameUI: {
            description: "Source 2 Game UI controller",
            methods: ["CustomUIConfig", "SetCameraPitchMin", "SetCameraPitchMax"]
        },
        GameEvents: {
            description: "Source 2 Game Events subscription bridge",
            methods: ["Subscribe", "Unsubscribe", "SendCustomGameEventToServer", "SendCustomGameEventToAllClients"]
        },
        Entities: {
            description: "Source 2 Entities interface for hero testing / unit queries",
            methods: ["GetLocalPlayer", "GetAllEntities", "GetHealth", "GetMaxHealth"]
        }
    };

    const registry = {
        metadata: {
            generatedAt: new Date().toISOString(),
            concommandsCount: Object.keys(concommands).length,
            convarsCount: Object.keys(convars).length,
            citadelFunctionsCount: Object.keys(citadelFunctions).length,
            citadelEventsCount: Object.keys(citadelEvents).length,
            panelTypesCount: Object.keys(xmlPanels).length
        },
        concommands,
        convars,
        citadelFunctions,
        citadelEvents,
        panelTypes: xmlPanels,
        panelMethods,
        dollarMethods,
        namespaces
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2), "utf8");
    console.log(`[Extractor] SUCCESS: Registry saved to ${OUTPUT_FILE}`);
    console.log(`[Extractor] Summary:`);
    console.log(`  - ConCommands: ${registry.metadata.concommandsCount}`);
    console.log(`  - ConVars: ${registry.metadata.convarsCount}`);
    console.log(`  - Global Functions: ${registry.metadata.citadelFunctionsCount}`);
    console.log(`  - Panorama Events: ${registry.metadata.citadelEventsCount}`);
    console.log(`  - Panel Classes: ${registry.metadata.panelTypesCount}`);
}

buildRegistry();
