// find_untranslated.js — find user-facing settings strings that have no translation-map entry.
//
// Discovers the full set of strings the UI tries to localize (by instrumenting LocalizeSettingsText
// and driving tab rendering across all tabs, plus harvesting description-override tables),
// then compares them against in-code locale maps in panorama/scripts/ql_settings_loc/*.js.
//
// Usage: node scripts/find_untranslated.js [--json] [--lang=ru]

"use strict";

const { Sandbox, Clock, Document } = require("./simulator/index.js");
const { settingsScripts } = require("./simulator/layout.js");
const { loadLocaleMaps, LANGUAGES } = require("./locales_helper.js");

function main() {
    const clock = new Clock();
    const doc = new Document();
    const root = doc.root;
    const escapeMenu = doc.create("Panel", { id: "EscapeMenu" });
    root.addChild(escapeMenu);

    const sandbox = new Sandbox({ clock, doc, name: "settings" });
    sandbox.global.$.GetContextPanel = () => escapeMenu;

    const { scripts } = settingsScripts();
    for (const s of scripts) {
        sandbox.load(s.absPath);
    }

    const seen = new Set();

    // Instrument LocalizeSettingsText
    const origLocalize = sandbox.global.LocalizeSettingsText;
    sandbox.global.LocalizeSettingsText = function(text, force) {
        if (text && typeof text === "string" && text.trim() !== "") {
            seen.add(text);
        }
        return origLocalize ? origLocalize.apply(this, arguments) : text;
    };

    // Instrument UI helpers if present
    const Q = sandbox.global.QOL;
    if (Q && Q.ui && Q.ui.theme && Q.ui.theme.LocalizeSettingsText) {
        Q.ui.theme.LocalizeSettingsText = sandbox.global.LocalizeSettingsText;
    }

    // Drive rendering through tabs
    const stub = sandbox.global.$.CreatePanel("Panel", escapeMenu, "SettingsListStub");
    const tabs = [
        "Support", "Config", "Presets", "Crosshair", "Healthbar",
        "HUD", "UI", "Overlay", "Minimap", "Audio", "Arcade", "Console", "Dev"
    ];

    for (const tab of tabs) {
        try {
            if (Q && Q.ui && Q.ui.window && typeof Q.ui.window.renderTab === "function") {
                Q.ui.window.renderTab(tab, stub);
            } else if (typeof sandbox.global.RenderCurrentTabContent === "function") {
                sandbox.global.currentTab = tab;
                sandbox.global.RenderCurrentTabContent(stub);
            }
        } catch (_) {}

        try {
            if (typeof sandbox.global.GetSettingsTabDisplayName === "function") {
                seen.add(String(sandbox.global.GetSettingsTabDisplayName(tab)));
            }
        } catch (_) {}
        seen.add(tab);
    }

    // Harvest description overrides
    function harvestValues(obj) {
        if (!obj) return;
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (typeof v === "string" && v.trim() !== "") seen.add(v);
        }
    }

    try { harvestValues(sandbox.global.SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG); } catch (_) {}
    try { harvestValues(sandbox.global.SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW); } catch (_) {}
    try { harvestValues(sandbox.global.SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE); } catch (_) {}

    const { maps } = loadLocaleMaps();
    const knownUnion = new Set();
    for (const lang of LANGUAGES) {
        const m = maps[lang.code] || {};
        for (const k of Object.keys(m)) knownUnion.add(k);
    }

    const seenArr = Array.from(seen);
    const missing = seenArr.filter(s => !knownUnion.has(s)).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);

    if (process.argv.includes("--json")) {
        console.log(JSON.stringify(missing, null, 2));
        return;
    }

    console.log(`[find] Localizable strings discovered: ${seenArr.length}`);
    console.log(`[find] Already in maps (union):        ${knownUnion.size}`);
    console.log(`[find] MISSING from all maps:          ${missing.length}`);
    if (missing.length > 0) {
        console.log("");
        for (const s of missing) {
            console.log("  • " + s);
        }
    }
}

main();
