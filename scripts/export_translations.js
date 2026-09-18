// export_translations.js — reconstruct the translator spreadsheet from the in-code language maps.
//
// QOLLOCK's settings UI is localized via per-language string maps in ql_settings.js
// (SETTINGS_RU_TEXT, SETTINGS_UK_TEXT, ...), each mapping an English source string to its
// translation. English is the source (no map). This script loads those maps in a sandbox and
// writes a single CSV with one row per English string and one column per language, filling in
// existing translations and leaving blanks where a translation is missing.
//
// Usage:
//   node scripts/export_translations.js
// Output:
//   translations/qollock_settings_translations.csv   (import this into Google Sheets, share it)
//
// Round-trip: translators fill the blanks, you export the sheet back to CSV and run
//   node scripts/import_translations.js <that.csv>
// to write the translations back into ql_settings.js.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.resolve(__dirname, "..");
const sharedPath = path.join(projectRoot, "panorama", "scripts", "ql_shared_presets.js");
const bridgePath = path.join(projectRoot, "panorama", "scripts", "ql_bridge.js");
const settingsPath = path.join(projectRoot, "panorama", "scripts", "ql_settings.js");
const outDir = path.join(projectRoot, "translations");
const outPath = path.join(outDir, "qollock_settings_translations.csv");

// English source strings that exist in the UI but aren't in ANY language map yet (newly added,
// not translated anywhere). Listed here so they still appear in the export — with blank cells —
// for translators to fill. Append new UI strings here until they've been translated at least once;
// once a translation lands in a map, the union picks them up automatically and you can prune them.
const EXTRA_SOURCE_STRINGS = [
    // (empty) — the 3.1.8 Active Stats "Visible Stats" labels are now translated in every map, so
    // the key union picks them up automatically. Add new untranslated UI strings here as they appear.
];

// Column order mirrors SETTINGS_LANGUAGE_OPTIONS in ql_settings.js. `header` is the CSV column
// label; `mapVar` is the in-code map variable name. English has no map (it's the source/key).
const LANGUAGES = [
    { header: "English", mapVar: null },
    { header: "Russian", mapVar: "SETTINGS_RU_TEXT" },
    { header: "Ukrainian", mapVar: "SETTINGS_UK_TEXT" },
    { header: "Polish", mapVar: "SETTINGS_PL_TEXT" },
    { header: "Bulgarian", mapVar: "SETTINGS_BG_TEXT" },
    { header: "Belarusian", mapVar: "SETTINGS_BY_TEXT" },
    { header: "Japanese", mapVar: "SETTINGS_JA_TEXT" },
    { header: "Chinese", mapVar: "SETTINGS_ZH_TEXT" },
    { header: "French", mapVar: "SETTINGS_FR_TEXT" },
    { header: "Portuguese", mapVar: "SETTINGS_PT_TEXT" },
    { header: "BR Portuguese", mapVar: "SETTINGS_PT_BR_TEXT" },
    { header: "Spanish", mapVar: "SETTINGS_ES_TEXT" }
];

// ── Minimal Panorama sandbox (mirrors scripts/validate_compact_schema.js) ──
function makePanelStub() {
    return {
        style: {}, text: "", visible: true, enabled: true,
        GetParent: () => null, GetChild: () => null, GetChildCount: () => 0,
        FindChild: () => null, FindChildTraverse: () => null, FindChildInLayoutFile: () => null,
        FindChildrenWithClassTraverse: () => [], Children: () => [],
        BHasClass: () => false, AddClass: () => {}, RemoveClass: () => {}, SetHasClass: () => {},
        SetAttributeString: () => {}, GetAttributeString: (_k, f) => (f === undefined ? "" : f),
        SetAttributeInt: () => {}, GetAttributeInt: (_k, f) => (f === undefined ? 0 : f),
        SetAttributeFloat: () => {}, GetAttributeFloat: (_k, f) => (f === undefined ? 0 : f),
        SetDialogVariable: () => {}, SetPanelEvent: () => {}, ClearPanelEvent: () => {},
        DeleteAsync: () => {}, RemoveAndDeleteChildren: () => {}, SetParent: () => {},
        BLoadLayoutFromString: () => true, IsValid: () => true
    };
}

function makeNoopProxy() {
    const fn = function() { return undefined; };
    return new Proxy(fn, {
        get(_t, prop) {
            if (prop === Symbol.toPrimitive) return () => "";
            if (prop === "toString") return () => "";
            if (prop === "valueOf") return () => 0;
            return makeNoopProxy();
        },
        apply() { return undefined; },
        construct() { return {}; }
    });
}

function makeSandbox() {
    const rootPanel = makePanelStub();
    const storage = new Map();
    const noop = () => {};
    return {
        console, JSON, Math, Object, Array, String, Number, Boolean, Date, RegExp,
        parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
        setTimeout: () => 0, setInterval: () => 0, clearTimeout: noop, clearInterval: noop,
        performance: { now: () => 0 },
        $: {
            Msg: noop, Warning: noop, Localize: (t) => String(t || ""), Schedule: () => 0,
            CancelScheduled: noop, DispatchEvent: noop, RegisterForUnhandledEvent: noop,
            RegisterEventHandler: noop, CreatePanel: () => makePanelStub(),
            GetContextPanel: () => rootPanel,
            persistentStorage: {
                getItem: (k) => (storage.has(String(k)) ? storage.get(String(k)) : ""),
                setItem: (k, v) => storage.set(String(k), String(v)),
                removeItem: (k) => storage.delete(String(k))
            },
            NetProps: {}
        },
        Game: { Events: { Subscribe: noop, Unsubscribe: noop } },
        GameEvents: { Subscribe: noop, Unsubscribe: noop, SendCustomGameEventToServer: noop },
        GameUI: { CustomUIConfig: () => ({}) },
        GameStateAPI: makeNoopProxy(), Players: makeNoopProxy(), Entities: makeNoopProxy(),
        Abilities: makeNoopProxy(), Buffs: makeNoopProxy(), GameModeAPI: makeNoopProxy(),
        GameInterfaceAPI: makeNoopProxy(), MatchDetailsAPI: makeNoopProxy(),
        PartyListAPI: makeNoopProxy(), SteamOverlayAPI: makeNoopProxy(), FriendsUI: makeNoopProxy(),
        PanoramaRunScript: noop
    };
}

function loadMaps() {
    // The maps are top-level `const`, so they aren't visible to a separate runInContext call.
    // Append the capture to the settings source itself so it runs in the same script scope.
    const captureParts = LANGUAGES.filter(l => l.mapVar)
        .map(l => `${l.mapVar}: (typeof ${l.mapVar} !== 'undefined' ? ${l.mapVar} : {})`);
    const settingsSrc = fs.readFileSync(settingsPath, "utf8") +
        `\nglobalThis.__qolTranslations = { ${captureParts.join(", ")} };\n`;
    const ctx = makeSandbox();
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(path.dirname(sharedPath), "ql_utils.js"), "utf8"), ctx);
    vm.runInContext(fs.readFileSync(sharedPath, "utf8"), ctx, { filename: sharedPath });
    vm.runInContext(fs.readFileSync(bridgePath, "utf8"), ctx, { filename: bridgePath });
    vm.runInContext(settingsSrc, ctx, { filename: settingsPath });
    return vm.runInContext("JSON.stringify(globalThis.__qolTranslations)", ctx);
}

// ── CSV (RFC 4180) ──
function csvCell(value) {
    const s = String(value === undefined || value === null ? "" : value);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function main() {
    const maps = JSON.parse(loadMaps());

    // Canonical English string set = union of every key across every language map.
    const keySet = new Set();
    for (const lang of LANGUAGES) {
        if (!lang.mapVar) continue;
        const m = maps[lang.mapVar] || {};
        for (const k of Object.keys(m)) keySet.add(k);
    }
    for (const s of EXTRA_SOURCE_STRINGS) keySet.add(s);

    // How many language columns are still blank for a given English key.
    const langMaps = LANGUAGES.filter(l => l.mapVar);
    function missingCount(key) {
        let n = 0;
        for (const lang of langMaps) {
            const m = maps[lang.mapVar] || {};
            const val = Object.prototype.hasOwnProperty.call(m, key) ? m[key] : "";
            if (val === "") n++;
        }
        return n;
    }
    const missingByKey = new Map();
    for (const key of keySet) missingByKey.set(key, missingCount(key));

    // Sort so translators only have to scroll to the end: fully-translated strings come first
    // (alphabetical), then everything still needing work sinks to the bottom. Within the
    // needs-work block, the more-complete rows come first and the brand-new strings (blank in
    // EVERY language) land at the very bottom. CSV row order doesn't affect import — it merges by
    // the English key — so this is purely a convenience for whoever fills the sheet.
    const lc = (s) => s.toLowerCase();
    const keys = Array.from(keySet).sort((a, b) => {
        const ma = missingByKey.get(a), mb = missingByKey.get(b);
        const tierA = ma === 0 ? 0 : 1, tierB = mb === 0 ? 0 : 1;
        if (tierA !== tierB) return tierA - tierB;          // translated block above needs-work block
        if (tierA === 1 && ma !== mb) return ma - mb;       // fewer-missing first → all-blank at the very bottom
        return lc(a) < lc(b) ? -1 : (lc(a) > lc(b) ? 1 : 0); // alphabetical within a tier
    });

    const lines = [];
    lines.push(LANGUAGES.map(l => csvCell(l.header)).join(","));
    const coverage = {};
    for (const lang of LANGUAGES) coverage[lang.header] = 0;
    for (const key of keys) {
        const row = [csvCell(key)];
        coverage["English"]++;
        for (const lang of LANGUAGES) {
            if (!lang.mapVar) continue;
            const m = maps[lang.mapVar] || {};
            const val = Object.prototype.hasOwnProperty.call(m, key) ? m[key] : "";
            if (val !== "") coverage[lang.header]++;
            row.push(csvCell(val));
        }
        lines.push(row.join(","));
    }

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    // BOM so Excel/Sheets read UTF-8 (Cyrillic/CJK) correctly.
    fs.writeFileSync(outPath, "﻿" + lines.join("\r\n") + "\r\n", "utf8");

    console.log(`[translations] wrote ${keys.length} strings -> ${path.relative(projectRoot, outPath)}`);
    console.log("[translations] coverage (translated / total):");
    for (const lang of LANGUAGES) {
        if (!lang.mapVar) continue;
        const have = coverage[lang.header];
        const pct = keys.length ? Math.round((have / keys.length) * 100) : 0;
        const missing = keys.length - have;
        console.log(`  ${lang.header.padEnd(14)} ${String(have).padStart(4)} / ${keys.length}  (${pct}%, ${missing} missing)`);
    }
}

main();
