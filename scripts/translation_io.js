"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { LANGUAGES, LOCALES_DIR, emitLocaleFile } = require("./locales_helper");
const has = (object, key) => Object.hasOwn(object, key);
const nonempty = value => typeof value === "string" && value.trim() !== "";

function readFlat(file) {
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const values = JSON.parse(text);
    if (!values || Array.isArray(values) || typeof values !== "object" ||
        Object.entries(values).some(([key, value]) => !key || typeof value !== "string")) {
        throw new Error(`Expected a flat string dictionary: ${file}`);
    }
    // Consume whole strings so escaped quotes/colons cannot masquerade as keys.
    const seen = new Set();
    for (const match of text.matchAll(/"(?:\\.|[^"\\])*"/g)) {
        if (!/^\s*:/.test(text.slice(match.index + match[0].length))) continue;
        const key = JSON.parse(match[0]);
        if (seen.has(key)) throw new Error(`Duplicate JSON key in ${file}: ${key}`);
        seen.add(key);
    }
    return values;
}
function languageFor(code) {
    return LANGUAGES.find(lang => [lang.code, lang.wbCode, lang.fileSuffix].some(alias => alias.toLowerCase() === code.toLowerCase()));
}
function readIntegrationBaseline(file) {
    if (!fs.existsSync(file)) return null;
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!state || !state.catalogs || typeof state.catalogs !== "object" || Array.isArray(state.catalogs)) throw new Error("Invalid import baseline");
    for (const [code, values] of Object.entries(state.catalogs)) {
        if (!languageFor(code) || !values || Array.isArray(values) || typeof values !== "object" || Object.values(values).some(value => typeof value !== "string")) {
            throw new Error(`Invalid import baseline language: ${code}`);
        }
    }
    return state;
}
function readCatalogs(target) {
    if (!fs.existsSync(target)) throw new Error(`Catalog path does not exist: ${target}`);
    const files = [];
    const visit = file => {
        if (fs.statSync(file).isDirectory()) {
            for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
        } else if (path.basename(file) === "translation.json" || file === target) files.push(file);
    };
    visit(target);
    if (!files.length) throw new Error(`No catalogs found: ${target}`);
    const catalogs = Object.create(null), origins = Object.create(null), warnings = [];
    for (const file of files) {
        const code = path.basename(path.dirname(file));
        const lang = languageFor(code) || languageFor(path.basename(file, ".json").replace(/-?translation$/, ""));
        if (!lang) { warnings.push(`Unsupported language, left external: ${file}`); continue; }
        const values = readFlat(file);
        if (lang.code === "en") {
            for (const [key, value] of Object.entries(values)) if (key !== value) throw new Error(`English identity mismatch: ${key}`);
        }
        if (catalogs[lang.code]) {
            // zh-CN is the website catalog; zh is the old export snapshot.
            if (lang.code === "zh" && [code, origins.zh].includes("zh-CN") && [code, origins.zh].includes("zh")) {
                warnings.push("Chinese: using zh-CN; historical zh catalog ignored");
                if (code === "zh") continue;
            } else throw new Error(`Duplicate language inputs: ${lang.code}`);
        }
        catalogs[lang.code] = values;
        origins[lang.code] = code;
    }
    if (!Object.keys(catalogs).length) throw new Error("No supported language catalogs found");
    return { catalogs, warnings };
}
function validateTranslation(key, value) {
    const tags = text => (text.match(/<\/?font\b[^>]*>|<br\s*\/?\s*>/gi) || []).map(tag => tag.toLowerCase()).sort();
    const placeholders = text => [...new Set((text.match(/\{\{\s*[\w.-]+\s*\}\}|\{[\w.-]+\}/g) || []).map(token => token.replace(/\s/g, "")))].sort();
    if (JSON.stringify(tags(key)) !== JSON.stringify(tags(value))) throw new Error(`Changed markup: ${key}`);
    if (JSON.stringify(placeholders(key)) !== JSON.stringify(placeholders(value))) throw new Error(`Changed placeholders: ${key}`);
    let fonts = 0;
    for (const tag of value.match(/<\/?font\b[^>]*>/gi) || []) {
        fonts += tag.startsWith("</") ? -1 : 1;
        if (fonts < 0) throw new Error(`Unbalanced markup: ${key}`);
    }
    if (fonts) throw new Error(`Unbalanced markup: ${key}`);
}
function planImport({ maps, keyOrders }, catalogs, { baseline = null, resolve = null } = {}) {
    const changes = [], retired = [], conflicts = [], keptLocal = [];
    const proposed = Object.fromEntries(LANGUAGES.map(lang => [lang.code, { ...maps[lang.code] }]));
    for (const lang of LANGUAGES) {
        if (lang.code === "en") continue;
        for (const [key, incoming] of Object.entries(catalogs[lang.code] || {})) {
            if (!has(maps.en, key)) { retired.push({ language: lang.code, key }); continue; }
            if (!nonempty(incoming) || incoming === maps[lang.code][key]) continue;
            const local = maps[lang.code][key];
            const base = baseline?.[lang.code]?.[key];
            if (baseline && incoming === base) { keptLocal.push({ language: lang.code, key }); continue; }
            if (baseline && nonempty(local) && local !== base) {
                conflicts.push({ language: lang.code, key, base, local, incoming });
                if (resolve === "local") { keptLocal.push({ language: lang.code, key }); continue; }
                if (resolve !== "incoming") continue;
            }
            validateTranslation(key, incoming);
            proposed[lang.code][key] = incoming;
            changes.push({ language: lang.code, key, before: local, after: incoming });
        }
    }
    const writes = [];
    for (const lang of LANGUAGES) {
        if (!changes.some(change => change.language === lang.code)) continue;
        const order = [...keyOrders[lang.code], ...Object.keys(proposed[lang.code]).filter(key => !has(maps[lang.code], key)).sort()];
        const content = emitLocaleFile(lang, order, proposed[lang.code]);
        const sandbox = {};
        vm.runInNewContext(content, sandbox, { timeout: 1000 });
        if (JSON.stringify(sandbox.SETTINGS_LOCALE_TEXT[lang.code]) !== JSON.stringify(Object.fromEntries(order.map(key => [key, proposed[lang.code][key]])))) {
            throw new Error(`Generated locale failed round-trip: ${lang.code}`);
        }
        writes.push({ file: path.join(LOCALES_DIR, lang.file), content });
    }
    return { changes, retired, conflicts, keptLocal, writes, blocked: conflicts.length > 0 && !resolve };
}
function applyWrites(writes) {
    // Complete preflight before calling; roll back an I/O failure, including
    // integration state, so a retry always has the same ancestor.
    const originals = writes.map(({ file }) => ({ file, content: fs.existsSync(file) ? fs.readFileSync(file) : null }));
    try {
        for (const { file, content } of writes) fs.writeFileSync(file, content, "utf8");
    } catch (error) {
        for (const { file, content } of originals) {
            if (content !== null) fs.writeFileSync(file, content);
            else if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        throw error;
    }
}
function report(plan, warnings = []) {
    for (const warning of warnings) console.warn(`[translations] ${warning}`);
    for (const lang of LANGUAGES) {
        const changes = plan.changes.filter(change => change.language === lang.code);
        if (changes.length) console.log(`[translations] ${lang.wbCode}: ${changes.length} changes`);
    }
    console.log(`[translations] ${plan.changes.length} changes, ${plan.retired.length} retired keys skipped, ${plan.keptLocal.length} local corrections kept, ${plan.conflicts.length} conflicts`);
    for (const item of plan.conflicts) console.log(`[conflict] ${item.language} ${JSON.stringify(item.key)}: local=${JSON.stringify(item.local)} incoming=${JSON.stringify(item.incoming)}`);
}
module.exports = { readFlat, readCatalogs, languageFor, readIntegrationBaseline, validateTranslation, planImport, applyWrites, report };
