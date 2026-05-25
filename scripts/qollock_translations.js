"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO_ROOT = path.resolve(__dirname, "..");
const SETTINGS_PATH = path.join(REPO_ROOT, "panorama", "scripts", "ql_settings.js");
const CORE_PATH = path.join(REPO_ROOT, "panorama", "scripts", "ql_core.js");
const CSV_PATH = path.join(REPO_ROOT, "docs", "translations", "qollock_settings_translations.csv");

const LANGUAGE_COLUMNS = [
    { column: "ru", mapName: "SETTINGS_RU_TEXT" },
    { column: "uk", mapName: "SETTINGS_UK_TEXT" },
    { column: "pl", mapName: "SETTINGS_PL_TEXT" },
    { column: "bg", mapName: "SETTINGS_BG_TEXT" },
    { column: "ja", mapName: "SETTINGS_JA_TEXT" },
    { column: "zh", mapName: "SETTINGS_ZH_TEXT" },
    { column: "fr", mapName: "SETTINGS_FR_TEXT" },
    { column: "pt", mapName: "SETTINGS_PT_TEXT" },
    { column: "pt_br", mapName: "SETTINGS_PT_BR_TEXT" },
    { column: "es", mapName: "SETTINGS_ES_TEXT" }
];
const CSV_HEADERS = ["english"].concat(LANGUAGE_COLUMNS.map((entry) => entry.column));

function readUtf8(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function writeUtf8(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function findObjectLiteralEnd(source, braceIndex) {
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = braceIndex; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === quote) {
                quote = "";
            }
            continue;
        }
        if (ch === "\"" || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error("Unclosed object literal");
}

function extractMapBlock(source, mapName) {
    const marker = "const " + mapName + " = ";
    const start = source.indexOf(marker);
    if (start < 0) throw new Error("Missing translation map " + mapName);
    const braceStart = source.indexOf("{", start);
    if (braceStart < 0) throw new Error("Missing object literal for " + mapName);
    const braceEnd = findObjectLiteralEnd(source, braceStart);
    let end = braceEnd + 1;
    while (end < source.length && /\s/.test(source.charAt(end))) end++;
    if (source.charAt(end) === ";") end++;
    return {
        start,
        end,
        objectText: source.slice(braceStart, braceEnd + 1)
    };
}

function loadTranslationMaps(settingsSource) {
    const maps = {};
    for (const lang of LANGUAGE_COLUMNS) {
        const block = extractMapBlock(settingsSource, lang.mapName);
        maps[lang.column] = vm.runInNewContext("(" + block.objectText + ")", {});
    }
    return maps;
}

function addString(out, value) {
    if (value === undefined || value === null) return;
    const text = String(value);
    if (!text) return;
    if (!/\p{L}/u.test(text)) return;
    if (/^[\s\d.,:;!?%+\-_/()[\]{}'"|\\<>=$#@*&~]+$/.test(text)) return;
    if (/^(changed\)\.|px|s|s\.|x|win|loss|push)$/i.test(text.trim())) return;
    if (/^\d+(?:\.\d+)?\s*(?:s|px|%)$/i.test(text.trim())) return;
    if (/^s2r:\/\//i.test(text)) return;
    if (/^https?:\/\//i.test(text)) return;
    if (/^[A-Z0-9_]+$/.test(text) && text.length > 3 && !/^(HUD|UI|QOL|FPS|XQC|APPLY|APPLIED|CLEAR|CLEARED|COPY|COPIED|FAILED|SAVE|SAVED|TIMEOUT|DISCORD)$/.test(text)) return;
    if (/^(ExternalBrowserGoToURL|SteamOverlayOpenURL|UIShowTextTooltip|UIHideTextTooltip)$/.test(text.trim())) return;
    if (/^[A-Za-z][A-Za-z0-9]*(?:Btn|Icon|Panel|Label|Container|Wrap|Row|Grid)(?:[A-Za-z0-9]*)$/.test(text.trim())) return;
    if (/^[A-Z0-9_]+:[A-Za-z0-9_]+$/.test(text)) return;
    if (/^[A-Za-z0-9_]+$/.test(text) && /_(SCALE|OFFSET|OPACITY|ENABLED|COLOR|TYPE|VOLUME|SIZE|THEME|LANGUAGE)$/i.test(text)) return;
    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(text.trim())) return;
    if (/^(buttongroup|slider|toggle|angle_slider|runtime_buttongroup|runtime_slider)$/i.test(text.trim())) return;
    out.add(text);
}

function isTranslatorSourceString(value) {
    const out = new Set();
    addString(out, value);
    return out.size > 0;
}

function decodeJsStringLiteral(rawLiteral) {
    return vm.runInNewContext(rawLiteral, {});
}

function collectStringLiteralsFromCall(callText) {
    const strings = [];
    const stringRegex = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
    let match;
    while ((match = stringRegex.exec(callText))) {
        strings.push(decodeJsStringLiteral(match[0]));
    }
    return strings;
}

function collectCallStrings(source, functionNames, out) {
    for (const fn of functionNames) {
        const regex = new RegExp(fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(", "g");
        let match;
        while ((match = regex.exec(source))) {
            let depth = 0;
            let quote = "";
            let escaped = false;
            let end = -1;
            for (let i = match.index; i < source.length; i++) {
                const ch = source[i];
                if (quote) {
                    if (escaped) escaped = false;
                    else if (ch === "\\") escaped = true;
                    else if (ch === quote) quote = "";
                    continue;
                }
                if (ch === "\"" || ch === "'") {
                    quote = ch;
                    continue;
                }
                if (ch === "(") depth++;
                else if (ch === ")") {
                    depth--;
                    if (depth === 0) {
                        end = i + 1;
                        break;
                    }
                }
            }
            if (end > match.index) {
                const callText = source.slice(match.index, end);
                for (const text of collectStringLiteralsFromCall(callText)) addString(out, text);
                regex.lastIndex = end;
            }
        }
    }
}

function collectObjectValueStrings(source, objectNames, out) {
    for (const objectName of objectNames) {
        let block;
        try {
            block = extractMapBlock(source, objectName);
        } catch (e) {
            continue;
        }
        let objectValue;
        try {
            objectValue = vm.runInNewContext("(" + block.objectText + ")", {});
        } catch (e2) {
            continue;
        }
        for (const value of Object.values(objectValue)) {
            addString(out, value);
        }
    }
}

function findBalancedLiteralEnd(source, startIndex, openChar, closeChar) {
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = startIndex; i < source.length; i++) {
        const ch = source.charAt(i);
        if (quote) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === quote) quote = "";
            continue;
        }
        if (ch === "\"" || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === openChar) depth++;
        else if (ch === closeChar) {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error("Unclosed literal block");
}

function collectNamedLiteralBlockStrings(source, variableNames, out) {
    for (const variableName of variableNames) {
        const regex = new RegExp("\\b(?:var|const|let)\\s+" + variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*([\\[{])", "g");
        let match;
        while ((match = regex.exec(source))) {
            const openChar = match[1];
            const closeChar = openChar === "[" ? "]" : "}";
            const literalStart = match.index + match[0].length - 1;
            let literalEnd = -1;
            try {
                literalEnd = findBalancedLiteralEnd(source, literalStart, openChar, closeChar);
            } catch (e) {
                continue;
            }
            const literalText = source.slice(literalStart, literalEnd + 1);
            for (const text of collectStringLiteralsFromCall(literalText)) addString(out, text);
            regex.lastIndex = literalEnd + 1;
        }
    }
}

function collectNamedStringConstants(source, variableNames, out) {
    for (const variableName of variableNames) {
        const regex = new RegExp("\\b(?:var|const|let)\\s+" + variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')", "g");
        let match;
        while ((match = regex.exec(source))) {
            addString(out, decodeJsStringLiteral(match[1]));
        }
    }
}

function collectTextAssignmentStrings(source, out) {
    const regex = /\.text\s*=\s*("((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/g;
    let match;
    while ((match = regex.exec(source))) {
        addString(out, decodeJsStringLiteral(match[1]));
    }
}

function collectUserFacingStrings(settingsSource, coreSource, maps) {
    const out = new Set();
    for (const map of Object.values(maps)) {
        for (const key of Object.keys(map)) addString(out, key);
    }
    collectCallStrings(settingsSource, [
        "LocalizeSettingsText",
        "SetLocalizedConfigFeedbackMessage",
        "SetConfigFeedbackMessage",
        "CreateSectionTitle",
        "CreateRuntimeSectionTitle",
        "CreateRow",
        "UpdateMinesweeperStatus",
        "UpdateFlappyStatus",
        "EndFlappyGame",
        "UpdateAimTrainerStatus",
        "UpdateTrainTrackingStatus",
        "UpdateWhackRemStatus",
        "SetBlackjackResult"
    ], out);
    collectObjectValueStrings(settingsSource, [
        "SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG",
        "SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW",
        "SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE"
    ], out);
    collectNamedLiteralBlockStrings(settingsSource, [
        "heroBodyLines",
        "consoleNoteLines",
        "ctaDefs"
    ], out);
    collectNamedStringConstants(settingsSource, [
        "MINESWEEPER_STATUS_DEFAULT_TEXT"
    ], out);
    collectTextAssignmentStrings(settingsSource, out);
    collectTextAssignmentStrings(coreSource, out);
    return Array.from(out).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function csvEscape(value) {
    const text = value === undefined || value === null ? "" : String(value);
    if (!/[",\r\n]/.test(text)) return text;
    return "\"" + text.replace(/"/g, "\"\"") + "\"";
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (quote) {
            if (ch === "\"") {
                if (text.charAt(i + 1) === "\"") {
                    cell += "\"";
                    i++;
                } else {
                    quote = false;
                }
            } else {
                cell += ch;
            }
            continue;
        }
        if (ch === "\"") quote = true;
        else if (ch === ",") {
            row.push(cell);
            cell = "";
        } else if (ch === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else if (ch !== "\r") {
            cell += ch;
        }
    }
    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

function exportCsv() {
    const settingsSource = readUtf8(SETTINGS_PATH);
    const coreSource = readUtf8(CORE_PATH);
    const maps = loadTranslationMaps(settingsSource);
    const strings = collectUserFacingStrings(settingsSource, coreSource, maps);
    const rows = [CSV_HEADERS];
    for (const english of strings) {
        const row = [english];
        for (const lang of LANGUAGE_COLUMNS) {
            row.push(maps[lang.column][english] || "");
        }
        rows.push(row);
    }
    writeUtf8(CSV_PATH, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n");
    console.log("[Translations] Exported " + String(strings.length) + " strings to " + path.relative(REPO_ROOT, CSV_PATH));
}

function formatJsMap(mapName, entries) {
    const keys = Object.keys(entries).filter((key) => entries[key] !== "").sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    const lines = ["const " + mapName + " = {"];
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const suffix = i === keys.length - 1 ? "" : ",";
        lines.push("    " + JSON.stringify(key) + ": " + JSON.stringify(entries[key]) + suffix);
    }
    lines.push("};");
    return lines.join("\n");
}

function importCsv() {
    const rows = parseCsv(readUtf8(CSV_PATH));
    if (!rows.length) throw new Error("CSV is empty");
    const headers = rows[0];
    const expected = CSV_HEADERS.join(",");
    if (headers.join(",") !== expected) {
        throw new Error("Unexpected CSV headers. Expected: " + expected);
    }
    const maps = {};
    for (const lang of LANGUAGE_COLUMNS) maps[lang.column] = {};
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const english = row[0] || "";
        if (!english) continue;
        if (!isTranslatorSourceString(english)) continue;
        for (let c = 1; c < CSV_HEADERS.length; c++) {
            const value = row[c] || "";
            if (value !== "") maps[CSV_HEADERS[c]][english] = value;
        }
    }

    let source = readUtf8(SETTINGS_PATH);
    const replacements = [];
    for (const lang of LANGUAGE_COLUMNS) {
        const block = extractMapBlock(source, lang.mapName);
        replacements.push({
            start: block.start,
            end: block.end,
            text: formatJsMap(lang.mapName, maps[lang.column])
        });
    }
    replacements.sort((a, b) => b.start - a.start);
    for (const replacement of replacements) {
        source = source.slice(0, replacement.start) + replacement.text + source.slice(replacement.end);
    }
    writeUtf8(SETTINGS_PATH, source);
    console.log("[Translations] Imported " + String(rows.length - 1) + " CSV rows into ql_settings.js");
}

function main() {
    const mode = String(process.argv[2] || "export").toLowerCase();
    if (mode === "export" || mode === "--export") return exportCsv();
    if (mode === "import" || mode === "--import") return importCsv();
    throw new Error("Usage: node scripts/qollock_translations.js [export|import]");
}

main();
