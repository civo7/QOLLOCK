// find_untranslated.js — find user-facing settings strings that have no translation-map entry.
//
// The settings UI localizes via LocalizeSettingsText(raw): it looks `raw` up in the active
// language map and falls back to English when absent. So any UI string that is NOT a key in the
// maps shows up untranslated. This script discovers the FULL set of strings the UI tries to
// localize (by instrumenting LocalizeSettingsText and driving every tab's build, plus harvesting
// the description-override maps), then prints the ones missing from the language maps.
//
// Usage: node scripts/find_untranslated.js [--json]

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.resolve(__dirname, "..");
const sharedPath = path.join(projectRoot, "panorama", "scripts", "ql_shared_presets.js");
const bridgePath = path.join(projectRoot, "panorama", "scripts", "ql_bridge.js");
const settingsPath = path.join(projectRoot, "panorama", "scripts", "ql_settings.js");

const LANG_MAP_VARS = [
    "SETTINGS_RU_TEXT", "SETTINGS_UK_TEXT", "SETTINGS_PL_TEXT", "SETTINGS_BG_TEXT",
    "SETTINGS_BY_TEXT", "SETTINGS_JA_TEXT", "SETTINGS_ZH_TEXT", "SETTINGS_FR_TEXT",
    "SETTINGS_PT_TEXT", "SETTINGS_PT_BR_TEXT", "SETTINGS_ES_TEXT"
];

function makePanelStub() {
    const stub = {
        style: {}, text: "", visible: true, enabled: true, hittest: true, hittestchildren: true,
        GetParent: () => null, GetChild: () => makePanelStub(), GetChildCount: () => 0,
        FindChild: () => makePanelStub(), FindChildTraverse: () => makePanelStub(),
        FindChildInLayoutFile: () => makePanelStub(), Data: () => ({}),
        FindChildrenWithClassTraverse: () => [], Children: () => [],
        BHasClass: () => false, AddClass: () => {}, RemoveClass: () => {}, SetHasClass: () => {},
        ToggleClass: () => {}, SetSelected: () => {}, SetReady: () => {},
        SetAttributeString: () => {}, GetAttributeString: (_k, f) => (f === undefined ? "" : f),
        SetAttributeInt: () => {}, GetAttributeInt: (_k, f) => (f === undefined ? 0 : f),
        SetAttributeFloat: () => {}, GetAttributeFloat: (_k, f) => (f === undefined ? 0 : f),
        SetDialogVariable: () => {}, SetDialogVariableInt: () => {}, SetPanelEvent: () => {},
        ClearPanelEvent: () => {}, SetImage: () => {}, SetScaling: () => {},
        DeleteAsync: () => {}, RemoveAndDeleteChildren: () => {}, SetParent: () => {},
        BLoadLayoutFromString: () => true, IsValid: () => true, MoveChildBefore: () => {},
        ScrollToTop: () => {}, SetFocus: () => {}
    };
    return stub;
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

// Epilogue appended to the settings source so it runs in the same top-level scope (where the
// const maps and function declarations live). It instruments LocalizeSettingsText, builds every
// tab, harvests the override maps, and exposes the result.
const EPILOGUE = `
;(function(){
    var __seen = new Set();
    var __orig = LocalizeSettingsText;
    LocalizeSettingsText = function(text, force) {
        if (text !== undefined && text !== null && String(text) !== "") __seen.add(String(text));
        try { return __orig(text, force); } catch (e) { return String(text == null ? "" : text); }
    };
    // Capture inline description args that are only localized on hover (never at build time).
    function wrapDesc(name, idxList) {
        var orig = globalThis[name] || (typeof eval(name) === "function" ? eval(name) : null);
    }
    // Wrap the row/section builders to record their description-ish string args directly.
    var _CreateRow = CreateRow;
    CreateRow = function(parent, label, configId, type, min, max, step, options, description) {
        if (description) __seen.add(String(description));
        return _CreateRow.apply(this, arguments);
    };
    if (typeof CreateAnimatedInlineToggleSection === "function") {
        var _CAITS = CreateAnimatedInlineToggleSection;
        CreateAnimatedInlineToggleSection = function(parent, title, enableConfigId, enableDescription) {
            if (enableDescription) __seen.add(String(enableDescription));
            return _CAITS.apply(this, arguments);
        };
    }
    if (typeof CreateAnimatedInlineEnumSection === "function") {
        var _CAIES = CreateAnimatedInlineEnumSection;
        CreateAnimatedInlineEnumSection = function() { return _CAIES.apply(this, arguments); };
    }
    if (typeof CreateSliderRow === "function") {
        var _CSR = CreateSliderRow;
        CreateSliderRow = function(parent, label, configId, shapeKey, description) {
            if (description) __seen.add(String(description));
            return _CSR.apply(this, arguments);
        };
    }
    if (typeof CreateInlineSecondaryCheckboxToggleRow === "function") {
        var _CIST = CreateInlineSecondaryCheckboxToggleRow;
        CreateInlineSecondaryCheckboxToggleRow = function(parent, label, configId, secondaryLabel, secondaryConfigId, description, secondaryDescription) {
            if (description) __seen.add(String(description));
            if (secondaryDescription) __seen.add(String(secondaryDescription));
            if (secondaryLabel) __seen.add(String(secondaryLabel));
            return _CIST.apply(this, arguments);
        };
    }

    var stub = $.CreatePanel("Panel", null, "");
    var tabs = ["Support","Config","Presets","Crosshair","Healthbar","HUD","UI","Overlay","Minimap","Audio","Arcade","Console","Dev","MOG"];
    var _orig_currentTab = currentTab;
    for (var i = 0; i < tabs.length; i++) {
        currentTab = tabs[i];
        try { RenderCurrentTabContent(stub); } catch (e) {}
        // Tab display names (Settings, MOGLOCK, ...)
        try { __seen.add(String(GetSettingsTabDisplayName(tabs[i]))); } catch (e) {}
        try { __seen.add(String(tabs[i])); } catch (e) {}
    }
    currentTab = _orig_currentTab;

    // Harvest description-override map VALUES (localized on hover via the override resolution).
    function harvestValues(obj) {
        if (!obj) return;
        for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) {
            var v = obj[k];
            if (typeof v === "string" && v !== "") __seen.add(v);
        } }
    }
    try { harvestValues(SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG); } catch (e) {}
    try { harvestValues(SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW); } catch (e) {}
    try { harvestValues(SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE); } catch (e) {}

    var maps = {};
    ${JSON.stringify(LANG_MAP_VARS)}.forEach(function(mv){
        try { maps[mv] = (typeof eval(mv) !== 'undefined') ? eval(mv) : {}; } catch (e) { maps[mv] = {}; }
    });
    globalThis.__qolFind = { seen: Array.from(__seen), maps: maps };
})();
`;

function main() {
    const ctx = makeSandbox();
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(path.dirname(sharedPath), "ql_utils.js"), "utf8"), ctx);
    vm.runInContext(fs.readFileSync(sharedPath, "utf8"), ctx, { filename: sharedPath });
    vm.runInContext(fs.readFileSync(bridgePath, "utf8"), ctx, { filename: bridgePath });
    const src = fs.readFileSync(settingsPath, "utf8") + EPILOGUE;
    vm.runInContext(src, ctx, { filename: settingsPath });
    const result = vm.runInContext("JSON.stringify(globalThis.__qolFind)", ctx);
    const { seen, maps } = JSON.parse(result);

    // Union of all existing map keys.
    const known = new Set();
    for (const mv of LANG_MAP_VARS) {
        const m = maps[mv] || {};
        for (const k of Object.keys(m)) known.add(k);
    }

    const missing = seen.filter(s => !known.has(s)).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);

    if (process.argv.includes("--json")) {
        console.log(JSON.stringify(missing, null, 2));
        return;
    }
    console.log(`[find] localizable strings discovered: ${seen.length}`);
    console.log(`[find] already in maps (union):        ${known.size}`);
    console.log(`[find] MISSING (no map entry):         ${missing.length}`);
    console.log("");
    for (const s of missing) console.log("  • " + s);
}

main();
