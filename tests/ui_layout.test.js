// tests/ui_layout.test.js
// =============================================================================
// Unit tests for declarative settings layout (panorama/scripts/ui/layout.js)
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
            VERSION: "3.2.0",
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

    // Load renderer.js first
    const rendererCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/renderer.js"),
        "utf8"
    );
    vm.runInNewContext(rendererCode, sandbox);

    // Load layout.js
    const layoutCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/layout.js"),
        "utf8"
    );
    vm.runInNewContext(layoutCode, sandbox);

    // Load window.js
    const windowCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/window.js"),
        "utf8"
    );
    vm.runInNewContext(windowCode, sandbox);

    return {
        sandbox,
        doc,
        emRoot,
        win,
        list,
        manifests,
        configValues,
    };
}

test("layout: exports valid layout array and getTabLayout helper", () => {
    const env = createTestEnvironment();
    const layout = env.sandbox.QOL.ui.layout;
    assert.ok(Array.isArray(layout), "QOL.ui.layout should be an array");
    assert.ok(layout.length > 0, "layout should have entries");
    assert.strictEqual(typeof env.sandbox.QOL.ui.getTabLayout, "function");
});

test("layout: all defined tabs have unique non-empty IDs", () => {
    const env = createTestEnvironment();
    const layout = env.sandbox.QOL.ui.layout;
    const seenIds = new Set();

    for (const entry of layout) {
        if (entry.heading) continue;
        assert.ok(entry.id && typeof entry.id === "string", "Tab must have non-empty ID");
        assert.ok(!seenIds.has(entry.id), `Duplicate tab ID found: ${entry.id}`);
        seenIds.add(entry.id);
    }
    assert.ok(seenIds.size >= 10, "Should have at least 10 settings tabs");
});

test("layout: getTabLayout finds tab by ID and returns null for unknown", () => {
    const env = createTestEnvironment();
    const getTabLayout = env.sandbox.QOL.ui.getTabLayout;

    const hbTab = getTabLayout("Healthbar");
    assert.ok(hbTab, "Healthbar tab should be found");
    assert.strictEqual(hbTab.id, "Healthbar");
    assert.strictEqual(hbTab.name, "Healthbar");

    const unknown = getTabLayout("NonExistentTab_XYZ");
    assert.strictEqual(unknown, null);
});

test("layout: all features referenced in layout exist in manifest directory", () => {
    const env = createTestEnvironment();
    const layout = env.sandbox.QOL.ui.layout;
    const manifestsDir = path.resolve(__dirname, "../panorama/scripts/manifests");

    for (const entry of layout) {
        if (!entry.sections) continue;
        for (const section of entry.sections) {
            if (!Array.isArray(section.features)) continue;
            for (const item of section.features) {
                const featureId = typeof item === "string" ? item : item.id;
                const manifestPath = path.join(manifestsDir, featureId, "manifest.js");
                assert.ok(
                    fs.existsSync(manifestPath),
                    `Feature '${featureId}' referenced in tab '${entry.id}' must have manifest at ${manifestPath}`
                );
            }
        }
    }
});

test("window: renderLayoutTab renders declarative sections and controls", () => {
    const env = createTestEnvironment();
    const { QOL } = env.sandbox;

    // Register a mock manifest for testing
    QOL.core.FeatureRegistry.register({
        id: "ql_healthbar",
        enableKey: "ENABLE_HEALTHBAR",
        settings: [
            { key: "ENABLE_HEALTHBAR", type: "toggle", label: "Healthbar", default: true },
            { key: "PLAYER_HEALTHBAR_SCALE", type: "slider", label: "Scale", min: 50, max: 200, step: 5, default: 100 },
        ],
    });

    const targetPanel = env.doc.create("Panel", { id: "TestContainer" });
    const rendered = QOL.ui.window.renderLayoutTab("Healthbar", targetPanel);

    assert.strictEqual(rendered, true, "renderLayoutTab should return true for valid layout tab");
    assert.ok(targetPanel.Children().length > 0, "Target container should have rendered elements");
});

test("window: renderLayoutTab defers on custom tabs", () => {
    const env = createTestEnvironment();
    const { QOL } = env.sandbox;

    const targetPanel = env.doc.create("Panel", { id: "TestContainer" });
    const rendered = QOL.ui.window.renderLayoutTab("Presets", targetPanel);

    assert.strictEqual(rendered, false, "renderLayoutTab should defer on custom tab 'Presets'");
});

test("window: renderTab renders layout-driven tab into content list", () => {
    const env = createTestEnvironment();
    const { QOL } = env.sandbox;

    QOL.core.FeatureRegistry.register({
        id: "ql_combat_status",
        settings: [
            { key: "ENABLE_COMBAT_INDICATOR", type: "toggle", label: "Combat Indicator", default: false },
        ],
    });

    QOL.ui.window.renderTab("Healthbar");
    assert.ok(env.list.Children().length > 0, "SettingsList should have rendered children for Healthbar tab");
});

test("window: renderLayoutTab suppresses section enableKey to avoid duplicate toggle row", () => {
    const env = createTestEnvironment();
    const { QOL } = env.sandbox;

    QOL.core.FeatureRegistry.register({
        id: "ql_passive_cooldown",
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        settings: [
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", label: "Passive Cooldowns", default: false },
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider", label: "Size", min: 30, max: 60, default: 40 },
        ],
    });

    const targetPanel = env.doc.create("Panel", { id: "CrosshairContainer" });
    const rendered = QOL.ui.window.renderLayoutTab("Crosshair", targetPanel);
    assert.strictEqual(rendered, true);

    // Verify ENABLE_PASSIVE_COOLDOWN is NOT rendered as an inner SettingRow
    const duplicateRow = targetPanel.FindChildTraverse("SettingRow_ENABLE_PASSIVE_COOLDOWN");
    assert.strictEqual(duplicateRow, null, "Section enableKey should not be duplicated as an inner SettingRow");
});
