"use strict";
const fs = require("node:fs");
const { Sandbox, Clock, Document } = require("./simulator");
const { settingsScripts } = require("./simulator/layout");
const { loadLocaleMaps } = require("./locales_helper");

function scanSettings() {
    const clock = new Clock(), doc = new Document(clock);
    const escapeMenu = doc.create("Panel", { id: "EscapeMenu" });
    doc.root.addChild(escapeMenu);
    const sandbox = new Sandbox({ clock, doc, name: "settings-localization" });
    sandbox.global.$.GetContextPanel = () => escapeMenu;
    const { scripts, missing } = settingsScripts();
    if (missing.length) throw new Error("Missing settings includes");
    const { maps } = loadLocaleMaps();
    const contexts = Object.create(null), seen = new Set(), registered = new Set();
    let tab = "Settings", section = "", instrumented = false;
    const record = text => {
        if (typeof text !== "string" || !text.trim()) return;
        seen.add(text);
        if (Object.hasOwn(maps.en, text) && (!contexts[text] || contexts[text].tab === "Settings")) {
            contexts[text] = { breadcrumb: [tab, section].filter(Boolean).join(" / "), tab, section, group: "" };
        }
    };
    for (const script of scripts) {
        const source = fs.readFileSync(script.absPath, "utf8");
        for (const match of source.matchAll(/registerTabRenderer\(\s*["']([^"']+)["']/g)) registered.add(match[1]);
        // Literal keys used only by delayed callbacks are invisible to a tab
        // render. Include those without evaluating diagnostic actions.
        for (const match of source.matchAll(/(?:\blocalize|\bformat|\bsetStatus|\b_Localize|LocalizeSettingsText|FormatSettingsText)\(\s*("(?:\\.|[^"\\])*")/g)) {
            record(JSON.parse(match[1]));
        }
        sandbox.load(script.absPath);
        // Instrument before modules capture their localization dependency.
        if (!instrumented && typeof sandbox.global.LocalizeSettingsText === "function") {
            const original = sandbox.global.LocalizeSettingsText;
            const wrapped = (text, force) => { record(text); return original(text, force); };
            sandbox.global.LocalizeSettingsText = wrapped;
            sandbox.global.QOL.ui.theme.LocalizeSettingsText = wrapped;
            instrumented = true;
        }
    }
    if (sandbox.loadErrors.length || !instrumented) throw new Error("Settings loading failed; scan is incomplete");
    const global = sandbox.global, Q = global.QOL;
    const wrapTitle = (owner, name) => {
        if (typeof owner?.[name] !== "function") return;
        const original = owner[name];
        owner[name] = function(parent, title, ...rest) {
            if (typeof title === "string") { section = title; record(title); }
            return original.call(this, parent, title, ...rest);
        };
    };
    for (const name of ["createSectionHeader", "createSubsectionHeader", "createAnimatedInlineToggleSection"]) wrapTitle(Q.ui.renderer, name);
    wrapTitle(global, "CreateSectionTitle");
    const tabs = [...new Set([...global.GetSettingsTabOrder(), ...registered])];
    const container = global.$.CreatePanel("Panel", escapeMenu, "LocalizationScan");
    for (const id of tabs) {
        tab = id; section = ""; global.currentTab = id;
        record(global.GetSettingsTabDisplayName(id));
        Q.ui.window.renderTab(id, container);
    }
    // Metadata carries tooltip contexts even when optional rows are hidden.
    for (const [source, description] of Object.entries(global.SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW || {})) {
        const [location, label] = source.split("|");
        const [metaTab, metaSection = ""] = location.split(" / ");
        for (const text of [label, description]) {
            record(text);
            if (Object.hasOwn(maps.en, text)) contexts[text] = { breadcrumb: location, tab: metaTab, section: metaSection, group: "" };
        }
    }
    for (const values of [global.SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG, global.SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE]) {
        for (const text of Object.values(values || {})) record(text);
    }
    for (const key of Object.keys(maps.en)) {
        contexts[key] ||= { breadcrumb: "Settings", tab: "Settings", section: "", group: "" };
    }
    return { seen: [...seen].sort(), contexts, tabs };
}
module.exports = { scanSettings };
