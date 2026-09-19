// tests/ui_search.test.js
// =============================================================================
// Unit tests for settings search & breadcrumbs
// (panorama/scripts/ui/search.js, panorama/scripts/ui/breadcrumb.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Panel, Document } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");

function createTestEnvironment() {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const emRoot = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    const bg = doc.create("Panel", { id: "EscapeBackground" });
    emRoot.addChild(bg);

    const win = doc.create("Panel", { id: "SettingsWindow" });
    const header = doc.create("Panel", { id: "SettingsHeader" });
    const title = doc.create("Label", { id: "SettingsTitle", text: "QOL LOCK" });
    const closeBtn = doc.create("Button", { id: "CloseBtn" });
    header.addChild(title);
    header.addChild(closeBtn);
    win.addChild(header);

    const body = doc.create("Panel", { id: "SettingsBody" });
    const contentHost = doc.create("Panel", { id: "SettingsContentHost" });
    const list = doc.create("Panel", { id: "SettingsList" });
    contentHost.addChild(list);
    body.addChild(contentHost);
    win.addChild(body);
    emRoot.addChild(win);

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => setTimeout(cb, delaySec * 1000),
        CancelScheduled: (id) => clearTimeout(id),
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            if (parent && typeof parent.addChild === "function") {
                parent.addChild(p);
            }
            return p;
        },
        GetContextPanel: () => emRoot,
        DispatchEvent: () => {},
        Localize: (s) => s,
    };

    const manifests = new Map();
    const configValues = {};

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "4.0.0",
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id) => mockDollar.CreatePanel(type, parent, id),
                    findRoot: () => emRoot,
                },
                FeatureRegistry: {
                    register: (m) => manifests.set(m.id, m),
                    getManifest: (id) => manifests.get(id) || null,
                },
                ConfigStore: {
                    hasSchema: (id) => manifests.has(id),
                    get: (id, key) => configValues[`${id}:${key}`],
                    set: (id, key, val) => { configValues[`${id}:${key}`] = val; },
                },
            },
            ui: {},
            events: {
                emit: () => {},
            },
        },
        globalThis: null,
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis = sandbox;

    const loadScript = (relativePath) => {
        const fullPath = path.resolve(__dirname, relativePath);
        const code = fs.readFileSync(fullPath, "utf8");
        vm.runInNewContext(code, sandbox);
    };

    loadScript("../panorama/scripts/ui/renderer.js");
    loadScript("../panorama/scripts/ui/layout.js");
    loadScript("../panorama/scripts/ui/breadcrumb.js");
    loadScript("../panorama/scripts/ui/search.js");
    loadScript("../panorama/scripts/ui/window.js");

    return {
        sandbox,
        doc,
        emRoot,
        win,
        header,
        list,
        manifests,
        configValues,
    };
}

test("breadcrumb: lookup and label identify feature locations", () => {
    const env = createTestEnvironment();
    const { breadcrumb } = env.sandbox.QOL.ui;

    const hpLoc = breadcrumb.lookup("ql_healthbar");
    assert.ok(hpLoc, "ql_healthbar should be mapped in layout");
    assert.strictEqual(hpLoc.tabId, "Healthbar");
    assert.strictEqual(hpLoc.sectionTitle, "Player");

    const hpLabel = breadcrumb.label("ql_healthbar");
    assert.strictEqual(hpLabel, "Healthbar / Player");

    const unknown = breadcrumb.lookup("ql_unknown_nonexistent");
    assert.strictEqual(unknown, null);
    assert.strictEqual(breadcrumb.label("ql_unknown_nonexistent"), "");
});

test("search: matchSetting matches by key, label, description", () => {
    const env = createTestEnvironment();
    const { search } = env.sandbox.QOL.ui;

    const setting = {
        key: "PLAYER_HEALTHBAR_SCALE",
        label: "Healthbar Scale",
        description: "Scale percentage of player healthbar",
    };

    assert.strictEqual(search.matchSetting(setting, "scale"), true);
    assert.strictEqual(search.matchSetting(setting, "healthbar"), true);
    assert.strictEqual(search.matchSetting(setting, "percentage"), true);
    assert.strictEqual(search.matchSetting(setting, "nonexistent_query"), false);
});

test("search: matchManifest matches manifest name, ID, or child settings", () => {
    const env = createTestEnvironment();
    const { search } = env.sandbox.QOL.ui;

    const manifest = {
        id: "ql_ammo",
        name: "Ammo Status",
        description: "Visual indicator for ammo",
        settings: [
            { key: "ENABLE_AMMO_STATUS", type: "toggle", label: "Enabled" },
            { key: "AMMO_CLIP_ANGLE", type: "slider", label: "Angle" },
        ],
    };

    // By manifest name
    const resName = search.matchManifest(manifest, "ammo");
    assert.strictEqual(resName.matches, true);
    assert.strictEqual(resName.matchingSettings.length, 2);

    // By setting key/label
    const resSetting = search.matchManifest(manifest, "angle");
    assert.strictEqual(resSetting.matches, true);
    assert.strictEqual(resSetting.matchingSettings.length, 1);
    assert.strictEqual(resSetting.matchingSettings[0].key, "AMMO_CLIP_ANGLE");

    // No match
    const resNone = search.matchManifest(manifest, "unrelated_xyz");
    assert.strictEqual(resNone.matches, false);
    assert.strictEqual(resNone.matchingSettings.length, 0);
});

test("search: runSearch returns results across tabs", () => {
    const env = createTestEnvironment();
    const { QOL } = env.sandbox;

    QOL.core.FeatureRegistry.register({
        id: "ql_crosshair_stats",
        name: "Crosshair Stats",
        settings: [
            { key: "CROSSHAIR_STATS_SCALE", type: "slider", label: "Stats Scale" },
        ],
    });

    QOL.core.FeatureRegistry.register({
        id: "ql_healthbar",
        name: "Healthbar",
        settings: [
            { key: "PLAYER_HEALTHBAR_SCALE", type: "slider", label: "Healthbar Scale" },
        ],
    });

    const results = QOL.ui.search.runSearch("scale");
    assert.ok(results.length >= 2, "Should find at least 2 features with 'scale' setting");

    const featureIds = results.map((r) => r.featureId);
    assert.ok(featureIds.includes("ql_crosshair_stats"));
    assert.ok(featureIds.includes("ql_healthbar"));
});

test("search: search and clear update window content and search state", () => {
    const env = createTestEnvironment();
    const { QOL } = env.sandbox;

    QOL.core.FeatureRegistry.register({
        id: "ql_healthbar",
        name: "Healthbar",
        settings: [
            { key: "ENABLE_HEALTHBAR", type: "toggle", label: "Enable Healthbar" },
        ],
    });

    // Run search
    QOL.ui.search.search("healthbar");
    assert.strictEqual(QOL.ui.search.isSearching(), true);
    assert.strictEqual(QOL.ui.search.getQuery(), "healthbar");
    assert.ok(env.list.Children().length > 0, "Settings list should display search results");

    // Clear search
    QOL.ui.search.clear();
    assert.strictEqual(QOL.ui.search.isSearching(), false);
    assert.strictEqual(QOL.ui.search.getQuery(), "");
});

test("search: normalizeSearchText, buildSearchAliasList, and isSearchRowMatch", () => {
    const env = createTestEnvironment();
    const { search } = env.sandbox.QOL.ui;

    assert.strictEqual(search.normalizeSearchText("  FOO  BAR  "), "  foo  bar  ");
    assert.strictEqual(search.normalizeSearchText(null), "");

    const aliases = search.buildSearchAliasList("My Label", "cfg_key_1", "Sub Info", ["extra alias"]);
    assert.ok(aliases.includes("my label"));
    assert.ok(aliases.includes("cfg_key_1"));
    assert.ok(aliases.includes("sub info"));
    assert.ok(aliases.includes("extra alias"));

    const row = search.buildSearchCollectedRow("Crosshair Scale", "cfg_crosshair", "toggle", 0, 100, 1, null, "Scale size", ["reticle"]);
    assert.strictEqual(search.isSearchRowMatch(row, "reticle"), true);
    assert.strictEqual(search.isSearchRowMatch(row, "crosshair"), true);
    assert.strictEqual(search.isSearchRowMatch(row, "scale size"), true);
    assert.strictEqual(search.isSearchRowMatch(row, "nonexistent"), false);

    assert.strictEqual(search.buildSearchSectionIndexCacheKey(), "lang=en");
    search.invalidateSearchSectionIndexCache();

    env.sandbox.currentSearchQuery = "test query";
    assert.strictEqual(search.isSettingsSearchActiveQuery(), true);
    search.clearSettingsSearchQuery(env.emRoot);
    assert.strictEqual(search.isSettingsSearchActiveQuery(), false);
});

