// export_locales_json.js — emit i18next-style JSON locale files from the in-code language maps.
//
// Counterpart to export_translations.js (which targets a single CSV for a spreadsheet). This one
// targets the grimoire-translate web workbench (https://github.com/Slush97/grimoire-translate),
// which reads an English source catalog and per-language files of the shape
//   <locales>/<lang>/translation.json
// and opens GitHub PRs that write the same shape back.
//
// QOLLOCK's translations live as per-language maps in ql_settings.js (SETTINGS_RU_TEXT, ...), keyed
// by the English source string. Those maps stay the single source of truth (they compile into the
// VPK — Panorama cannot read JSON at runtime). These JSON files are an *interchange artifact* the
// workbench reads/writes; import_locales_json.js merges the workbench's output back into the maps.
//
// FLAT FILES, ON PURPOSE. The stock workbench treats "." in a key as a path separator (catalog.ts
// unflattenValues). Our keys are English sentences, and some are a dot-prefix of another (e.g.
// "Ready" vs "Ready.", "Reset to default value" vs "...value."), which that nesting silently
// corrupts. We therefore emit FLAT objects (string values only, no nesting) and the fork must patch
// catalog.ts to treat keys as opaque (no "." split) so its output stays flat too. See the bridge
// README in translations/locales/.
//
// Usage:
//   node scripts/export_locales_json.js
// Output:
//   translations/locales/en/translation.json        (identity: English -> English, the source catalog)
//   translations/locales/<lang>/translation.json     (English -> translation, one dir per language)

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.resolve(__dirname, "..");
const sharedPath = path.join(projectRoot, "panorama", "scripts", "ql_shared_presets.js");
const bridgePath = path.join(projectRoot, "panorama", "scripts", "ql_bridge.js");
const settingsPath = path.join(projectRoot, "panorama", "scripts", "ql_settings.js");
// When called from export_locales.bat a mirror path (QOLLOCK-translations/locales) is passed as
// argv[2] so the output lands in the public repo the workbench reads from. Without an argument
// (direct `node` call) we fall back to the local translations/locales directory.
const outRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(projectRoot, "translations", "locales");

// i18next locale code (the <lang> directory name) -> in-code map variable. The code is just the
// directory name the workbench uses; what matters is that this mapping is identical in
// import_locales_json.js so a round-trip lands back in the right map. Belarusian is ISO 639-1 "be"
// (not "by"); BR Portuguese is "pt-BR".
const LANGUAGES = [
    { code: "ru", mapVar: "SETTINGS_RU_TEXT" },
    { code: "uk", mapVar: "SETTINGS_UK_TEXT" },
    { code: "pl", mapVar: "SETTINGS_PL_TEXT" },
    { code: "bg", mapVar: "SETTINGS_BG_TEXT" },
    { code: "be", mapVar: "SETTINGS_BY_TEXT" },
    { code: "ja", mapVar: "SETTINGS_JA_TEXT" },
    { code: "zh", mapVar: "SETTINGS_ZH_TEXT" },
    { code: "fr", mapVar: "SETTINGS_FR_TEXT" },
    { code: "pt", mapVar: "SETTINGS_PT_TEXT" },
    { code: "pt-BR", mapVar: "SETTINGS_PT_BR_TEXT" },
    { code: "es", mapVar: "SETTINGS_ES_TEXT" }
];

// ── Minimal Panorama sandbox (mirrors export_translations.js / validate_compact_schema.js) ──
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
    const captureParts = LANGUAGES
        .map(l => `${l.mapVar}: (typeof ${l.mapVar} !== 'undefined' ? ${l.mapVar} : {})`);
    const settingsSrc = fs.readFileSync(settingsPath, "utf8") +
        `\nglobalThis.__qolTranslations = { ${captureParts.join(", ")} };\n`;
    const ctx = makeSandbox();
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(sharedPath, "utf8"), ctx, { filename: sharedPath });
    vm.runInContext(fs.readFileSync(bridgePath, "utf8"), ctx, { filename: bridgePath });
    vm.runInContext(settingsSrc, ctx, { filename: settingsPath });
    return JSON.parse(vm.runInContext("JSON.stringify(globalThis.__qolTranslations)", ctx));
}

// Emit a flat { key: value } object with keys sorted, so files diff cleanly across runs.
function writeFlatJson(file, pairs) {
    const obj = {};
    for (const [k, v] of pairs.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
        obj[k] = v;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function main() {
    const maps = loadMaps();

    // Canonical English string set = union of every key across every language map (same basis as
    // export_translations.js), so the source catalog covers every string any language has touched.
    const keySet = new Set();
    for (const l of LANGUAGES) for (const k of Object.keys(maps[l.mapVar] || {})) keySet.add(k);
    const keys = Array.from(keySet);

    // English source: identity map (key === source string). This is the workbench's catalog.
    writeFlatJson(path.join(outRoot, "en", "translation.json"), keys.map(k => [k, k]));
    console.log(`[locales] en      ${String(keys.length).padStart(5)} source strings`);

    for (const l of LANGUAGES) {
        const m = maps[l.mapVar] || {};
        // Only emit keys with a non-empty translation. Missing keys stay absent so the workbench
        // reports them as untranslated rather than as the English string.
        const pairs = keys
            .filter(k => Object.prototype.hasOwnProperty.call(m, k) && m[k] !== "")
            .map(k => [k, m[k]]);
        writeFlatJson(path.join(outRoot, l.code, "translation.json"), pairs);
        const pct = keys.length ? Math.round((pairs.length / keys.length) * 100) : 0;
        console.log(`[locales] ${l.code.padEnd(6)} ${String(pairs.length).padStart(5)} / ${keys.length}  (${pct}%)`);
    }

    console.log(`[locales] wrote ${LANGUAGES.length + 1} catalogs -> ${path.relative(projectRoot, outRoot)}`);
}

main();
