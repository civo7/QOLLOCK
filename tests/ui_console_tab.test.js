// tests/ui_console_tab.test.js
// =============================================================================
// Unit tests for Console & Runtime CVars subsystem (panorama/scripts/ui/console_tab.js)
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
    const settingsWin = doc.create("Panel", { id: "SettingsWindow" });
    rootPanel.addChild(settingsWin);

    let registeredTabName = null;
    let registeredTabRenderer = null;
    const dispatchedEvents = [];

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
        GetContextPanel: () => rootPanel,
        DispatchEvent: (eventName, arg) => {
            dispatchedEvents.push({ eventName, arg });
        },
        Localize: (s) => s,
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "3.2.0",
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id) => mockDollar.CreatePanel(type, parent, id),
                    findRoot: () => rootPanel,
                },
            },
            ui: {
                window: {
                    registerTabRenderer: (name, fn) => {
                        registeredTabName = name;
                        registeredTabRenderer = fn;
                    },
                },
            },
        },
        globalThis: {
            LocalizeSettingsText: (t) => t,
            CreateRuntimeSectionTitle: (parent, title) => {
                const p = mockDollar.CreatePanel("Panel", parent, "");
                const lbl = mockDollar.CreatePanel("Label", p, "");
                lbl.text = title;
                return p;
            },
            CreateRow: (parent, label, key, type) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                r.AddClass("SettingRow");
                if (type === "runtime_slider") r.AddClass("RuntimeSliderRow");
                if (type === "runtime_buttongroup") r.AddClass("RuntimeButtonGroupRow");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
            CreateSeparator: (parent) => {
                return mockDollar.CreatePanel("Panel", parent, "");
            },
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const consoleCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/console_tab.js"),
        "utf8"
    );
    vm.runInNewContext(consoleCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        dispatchedEvents,
        getRegisteredTab: () => ({ name: registeredTabName, renderer: registeredTabRenderer }),
    };
}

test("ui/console_tab: exports public API on QOL.ui.consoleTab and globalThis", () => {
    const env = createTestEnvironment();
    const consoleApi = env.sandbox.QOL.ui.consoleTab;

    assert.ok(consoleApi, "QOL.ui.consoleTab should be defined");
    assert.strictEqual(typeof consoleApi.runConsoleCommand, "function");
    assert.strictEqual(typeof consoleApi.runConsoleCommandBestEffort, "function");
    assert.strictEqual(typeof consoleApi.render, "function");
    assert.strictEqual(typeof consoleApi.createConsoleNotesCard, "function");
    assert.ok(Array.isArray(consoleApi.RUNTIME_SLIDER_DEFS));
    assert.ok(Array.isArray(consoleApi.HITMARKERS_RUNTIME_OPTIONS));

    assert.strictEqual(typeof env.sandbox.globalThis.RunConsoleCommand, "function");
    assert.strictEqual(typeof env.sandbox.globalThis.RunConsoleCommandBestEffort, "function");
    assert.ok(Array.isArray(env.sandbox.globalThis.HITMARKERS_RUNTIME_OPTIONS));
});

test("ui/console_tab: runConsoleCommand dispatches CitadelConCommand event", () => {
    const env = createTestEnvironment();
    const consoleApi = env.sandbox.QOL.ui.consoleTab;

    const res = consoleApi.runConsoleCommand("citadel_minimap_unit_click_radius 250");
    assert.strictEqual(res, true);
    assert.strictEqual(env.dispatchedEvents.length, 1);
    assert.strictEqual(env.dispatchedEvents[0].eventName, "CitadelConCommand");
    assert.strictEqual(env.dispatchedEvents[0].arg, "citadel_minimap_unit_click_radius 250");
});

test("ui/console_tab: createConsoleNotesCard constructs hero note card with bullets", () => {
    const env = createTestEnvironment();
    const consoleApi = env.sandbox.QOL.ui.consoleTab;
    const parent = env.doc.create("Panel", { id: "Container" });

    const card = consoleApi.createConsoleNotesCard(parent);
    assert.ok(card);
    assert.ok(card.BHasClass("ConsoleTabNoteWrap"));

    const bullets = card.FindChildrenWithClassTraverse("ConsoleTabNoteBullet");
    assert.strictEqual(bullets.length, 2, "Should render 2 note bullet items");
});

test("ui/console_tab: render constructs full console tab with minimap sliders and stat buttons", () => {
    const env = createTestEnvironment();
    const consoleApi = env.sandbox.QOL.ui.consoleTab;
    const list = env.doc.create("Panel", { id: "SettingsList" });

    consoleApi.render(list);

    const rows = list.FindChildrenWithClassTraverse("SettingRow");
    // 1 Hitmarkers + 7 minimap sliders + 5 statistics buttongroups = 13 rows
    assert.strictEqual(rows.length, 13, "Should render 13 console runtime rows");

    const sliders = list.FindChildrenWithClassTraverse("RuntimeSliderRow");
    assert.strictEqual(sliders.length, 7, "Should render 7 minimap runtime sliders");

    const btnGroups = list.FindChildrenWithClassTraverse("RuntimeButtonGroupRow");
    assert.strictEqual(btnGroups.length, 6, "Should render 6 runtime buttongroups (1 general + 5 stats)");

    const reg = env.getRegisteredTab();
    assert.strictEqual(reg.name, "Console");
    assert.strictEqual(typeof reg.renderer, "function");
});
