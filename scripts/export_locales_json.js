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
// the first positional arg so the output lands in the public repo the workbench reads from.
// Without one (direct `node` call) we fall back to the local translations/locales directory.
//
// OVERWRITE SAFETY (default): the public <lang>/translation.json is the live baseline that the
// workbench and merged community PRs write to. It can be *ahead* of the in-code maps (someone
// translated a string that has not been imported back into ql_settings.js yet). A blind rewrite
// would silently revert that work. So by default we MERGE: existing public values are kept, and
// we only ADD keys the public file is missing. Pass --replace to force the old behaviour (emit
// the maps verbatim, dropping anything not in them). en/ is always a full regenerate (it is the
// identity source catalog, so it must mirror the current key set exactly).
const REPLACE = process.argv.includes("--replace");
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const outRoot = positional[0] ? path.resolve(positional[0]) : path.join(projectRoot, "translations", "locales");

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
    { code: "es", mapVar: "SETTINGS_ES_TEXT" },
    { code: "ko", mapVar: "SETTINGS_KO_TEXT" },
    { code: "it", mapVar: "SETTINGS_IT_TEXT" },
    { code: "tr", mapVar: "SETTINGS_TR_TEXT" }
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

// Read the current public <lang>/translation.json as a flat { key: value } map, or {} if it does
// not exist yet. Used to preserve values already live in the mirror when merging (overwrite-safe).
function readExistingFlat(file) {
    if (!fs.existsSync(file)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        const out = {};
        for (const k of Object.keys(parsed)) {
            if (typeof parsed[k] === "string") out[k] = parsed[k];
        }
        return out;
    } catch (e) {
        console.error(`[locales] WARNING: could not parse existing ${file} (${e.message}); treating as empty`);
        return {};
    }
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

    const keySet2 = new Set(keys); // for orphan detection: which keys the current source still has
    for (const l of LANGUAGES) {
        const m = maps[l.mapVar] || {};
        const file = path.join(outRoot, l.code, "translation.json");

        // Translations coming from the in-code maps (non-empty only). Missing keys stay absent so
        // the workbench reports them as untranslated rather than as the English string.
        const fromMap = {};
        for (const k of keys) {
            if (Object.prototype.hasOwnProperty.call(m, k) && m[k] !== "") fromMap[k] = m[k];
        }

        let out, added = 0, kept = 0;
        if (REPLACE) {
            // Old behaviour: the maps win outright.
            out = fromMap;
        } else {
            // Overwrite-safe merge: start from what is already live in the mirror (community /
            // workbench work, possibly ahead of the maps), then fill in only the keys it is
            // missing from the in-code maps. Never overwrite an existing public value.
            const existing = readExistingFlat(file);
            out = Object.assign({}, existing);
            for (const k of Object.keys(fromMap)) {
                if (!Object.prototype.hasOwnProperty.call(out, k)) { out[k] = fromMap[k]; added++; }
                else kept++;
            }
            // Orphans: keys the mirror carries that the current English source no longer has
            // (string renamed or deleted in ql_settings.js). We KEEP them here — export must not
            // destroy translations — but surface them so a human can retire them deliberately.
            const orphans = Object.keys(existing).filter(k => !keySet2.has(k));
            if (orphans.length) {
                console.log(`[locales] ${l.code.padEnd(6)} ${orphans.length} orphaned key(s) (renamed/removed in source, kept):`);
                for (const k of orphans.slice(0, 12)) console.log(`             · ${JSON.stringify(k)}`);
                if (orphans.length > 12) console.log(`             … and ${orphans.length - 12} more`);
            }
        }

        writeFlatJson(file, Object.keys(out).map(k => [k, out[k]]));
        const count = Object.keys(out).length;
        const pct = keys.length ? Math.round((count / keys.length) * 100) : 0;
        const note = REPLACE ? "" : `  (+${added} new, ${kept} already present)`;
        console.log(`[locales] ${l.code.padEnd(6)} ${String(count).padStart(5)} / ${keys.length}  (${pct}%)${note}`);
    }

    console.log(`[locales] wrote ${LANGUAGES.length + 1} catalogs -> ${path.relative(projectRoot, outRoot)}${REPLACE ? "  [--replace: maps win]" : "  [merge: mirror preserved]"}`);
}

main();
