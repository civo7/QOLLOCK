"use strict";
const { scanSettings } = require("./settings_localization_audit");
const { loadLocaleMaps } = require("./locales_helper");
const { languageFor } = require("./translation_io");
const { isIntentionalName } = require("./translation_exceptions");
function main() {
    const args = process.argv.slice(2);
    for (const arg of args) if (arg !== "--json" && !arg.startsWith("--lang=")) throw new Error(`Unknown option: ${arg}`);
    const language = args.find(arg => arg.startsWith("--lang="))?.slice(7);
    const lang = language ? languageFor(language) : null;
    if (language && !lang) throw new Error(`Unsupported language: ${language}`);
    const { maps } = loadLocaleMaps();
    const { seen, tabs } = scanSettings();
    const sourceMissing = seen.filter(text => !Object.hasOwn(maps.en, text) && !isIntentionalName(text));
    const intentional = seen.filter(isIntentionalName);
    const translationMissing = lang ? seen.filter(text => Object.hasOwn(maps.en, text) && !maps[lang.code][text]?.trim()) : [];
    if (args.includes("--json")) console.log(JSON.stringify({ tabs, sourceMissing, intentional, language: lang?.code || null, translationMissing }, null, 2));
    else {
        console.log(`[find] ${seen.length} strings across ${tabs.length} current tabs; ${sourceMissing.length} source keys missing`);
        sourceMissing.forEach(text => console.log("  source: " + text));
        if (lang) { console.log(`[find] ${translationMissing.length} missing ${lang.code} translations`); translationMissing.forEach(text => console.log("  translation: " + text)); }
    }
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
