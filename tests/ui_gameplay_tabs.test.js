// tests/ui_gameplay_tabs.test.js
// =============================================================================
// Unit tests for Gameplay Tabs subsystem (panorama/scripts/ui/gameplay_tabs.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Document } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");

function createTestEnvironment() {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const rootPanel = doc.create("Panel", { id: "Root" });

    const registeredTabs = new Map();

    const mockDollar = {
        Msg: () => {},
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            if (parent && typeof parent.addChild === "function") {
                parent.addChild(p);
            }
            return p;
        },
        GetContextPanel: () => rootPanel,
        Localize: (s) => s,
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "4.0.0",
            preview: {
                isAdvancedItemCooldownModeEnabled: () => false,
            },
            ui: {
                window: {
                    registerTabRenderer: (name, fn) => {
                        registeredTabs.set(name, fn);
                    },
                },
            },
        },
        globalThis: {
            QOL_COLOR_PALETTE_OPTIONS: [],
            CreateSectionTitle: (parent, title) => {
                const p = mockDollar.CreatePanel("Panel", parent, "");
                const lbl = mockDollar.CreatePanel("Label", p, "");
                lbl.text = title;
                return p;
            },
            CreateRow: (parent, label) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                r.AddClass("SettingRow");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
            CreateSliderRow: (parent, label) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                r.AddClass("SettingSliderRow");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
            CreateSeparator: (parent) => {
                return mockDollar.CreatePanel("Panel", parent, "");
            },
            CreateAnimatedInlineToggleSection: (parent, title, key, desc, fn) => {
                const sec = mockDollar.CreatePanel("Panel", parent, "");
                if (typeof fn === "function") fn(sec);
                return sec;
            },
            CreateCollapsibleSubSection: (parent, title, fn) => {
                const sub = mockDollar.CreatePanel("Panel", parent, "");
                if (typeof fn === "function") fn(sub);
                return sub;
            },
            CreateAnimatedInlineEnumSection: (parent, title, key, val, fn) => {
                const en = mockDollar.CreatePanel("Panel", parent, "");
                if (typeof fn === "function") fn(en);
                return en;
            },
            CreateInlineSecondaryCheckboxToggleRow: (parent, label) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
        },
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const code = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/gameplay_tabs.js"),
        "utf8"
    );
    vm.runInNewContext(code, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        registeredTabs,
    };
}

test("ui/gameplay_tabs: exports public API and registers all 6 tabs", () => {
    const env = createTestEnvironment();
    const api = env.sandbox.QOL.ui.gameplayTabs;

    assert.ok(api, "QOL.ui.gameplayTabs must be defined");
    assert.strictEqual(typeof api.render, "function");
    assert.strictEqual(typeof api.renderCrosshairTab, "function");
    assert.strictEqual(typeof api.renderHudTab, "function");
    assert.strictEqual(typeof api.renderHealthbarTab, "function");
    assert.strictEqual(typeof api.renderShopTab, "function");
    assert.strictEqual(typeof api.renderUiTab, "function");
    assert.strictEqual(typeof api.renderOverlayTab, "function");
    assert.strictEqual(typeof api.renderMinimapTab, "function");

    const expectedTabs = ["Crosshair", "HUD", "Healthbar", "Minimap", "Shop", "UI", "Overlay"];
    for (const t of expectedTabs) {
        assert.ok(env.registeredTabs.has(t), `Tab '${t}' must be registered with window manager`);
    }

    assert.ok(Array.isArray(env.sandbox.globalThis.HEALTHBAR_TYPE_DROPDOWN_OPTIONS));
    assert.ok(Array.isArray(env.sandbox.globalThis.COLOR_WARNING_THRESHOLD_OPTIONS));
});

test("ui/gameplay_tabs: render dispatches to corresponding tab renderers", () => {
    const env = createTestEnvironment();
    const { render } = env.sandbox.QOL.ui.gameplayTabs;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "TestList");

    assert.strictEqual(render("Crosshair", list), true);
    assert.strictEqual(render("HUD", list), true);
    assert.strictEqual(render("Healthbar", list), true);
    assert.strictEqual(render("Minimap", list), true);
    assert.strictEqual(render("Shop", list), true);
    assert.strictEqual(render("UI", list), true);
    assert.strictEqual(render("Overlay", list), true);
    assert.strictEqual(render("UnknownTab", list), false);

    assert.ok(list.Children().length > 0, "List should have rendered children");
});

test("ui/gameplay_tabs: renderCrosshairTab builds crosshair controls", () => {
    const env = createTestEnvironment();
    const { renderCrosshairTab } = env.sandbox.QOL.ui.gameplayTabs;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "CrosshairList");
    renderCrosshairTab(list);
    assert.ok(list.Children().length > 0, "Crosshair list should have rendered controls");
});

test("ui/gameplay_tabs: renderHudTab builds HUD controls", () => {
    const env = createTestEnvironment();
    const { renderHudTab } = env.sandbox.QOL.ui.gameplayTabs;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "HudList");
    renderHudTab(list);
    assert.ok(list.Children().length > 0, "HUD list should have rendered controls");
});

test("ui/gameplay_tabs: renderHealthbarTab builds Healthbar controls", () => {
    const env = createTestEnvironment();
    const { renderHealthbarTab } = env.sandbox.QOL.ui.gameplayTabs;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "HealthbarList");
    renderHealthbarTab(list);
    assert.ok(list.Children().length > 0, "Healthbar list should have rendered controls");
});

test("ui/gameplay_tabs: renderUiTab builds UI controls", () => {
    const env = createTestEnvironment();
    const { renderUiTab } = env.sandbox.QOL.ui.gameplayTabs;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "UiList");
    renderUiTab(list);
    assert.ok(list.Children().length > 0, "UI list should have rendered controls");
});

test("ui/gameplay_tabs: renderOverlayTab builds Overlay controls", () => {
    const env = createTestEnvironment();
    const { renderOverlayTab } = env.sandbox.QOL.ui.gameplayTabs;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "OverlayList");
    renderOverlayTab(list);
    assert.ok(list.Children().length > 0, "Overlay list should have rendered controls");
});

test("ui/gameplay_tabs: renderMinimapTab builds Minimap controls", () => {
    const env = createTestEnvironment();
    const { renderMinimapTab } = env.sandbox.QOL.ui.gameplayTabs;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "MinimapList");
    renderMinimapTab(list);
    assert.ok(list.Children().length > 0, "Minimap list should have rendered controls");
});

test("ui/gameplay_tabs: renderShopTab builds Shop controls", () => {
    const env = createTestEnvironment();
    const { renderShopTab } = env.sandbox.QOL.ui.gameplayTabs;

    const list = env.sandbox.$.CreatePanel("Panel", env.rootPanel, "ShopList");
    renderShopTab(list);
    assert.ok(list.Children().length > 0, "Shop list should have rendered controls");
});
