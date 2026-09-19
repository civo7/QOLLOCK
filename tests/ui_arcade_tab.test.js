// tests/ui_arcade_tab.test.js
// =============================================================================
// Unit tests for Arcade & MOG subsystem (panorama/scripts/ui/arcade_tab.js)
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

    const registeredTabs = new Map();
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

    let minesweeperOpened = false;

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "4.0.0",
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id) => mockDollar.CreatePanel(type, parent, id),
                    findRoot: () => rootPanel,
                },
            },
            arcade: {
                openMinesweeper: () => { minesweeperOpened = true; },
                openBlackjack: () => {},
                openFlappy: () => {},
                openAimTrainer: () => {},
                openTrainTracking: () => {},
                openWhackRem: () => {},
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
            MOD_CONFIG: {
                ENABLE_GAME_AUDIO: 1,
                GAME_DEFAULT_DIFFICULTY: "MEDIUM",
                ENABLE_ON_DEATH_GAMES: 0,
                ON_DEATH_GAME_MINESWEEPER: 0,
                ENABLE_BHOP: 1,
            },
            SaveAndSync: () => {},
            LocalizeSettingsText: (t) => t,
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
            CreateSeparator: (parent) => {
                return mockDollar.CreatePanel("Panel", parent, "");
            },
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const arcadeCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/arcade_tab.js"),
        "utf8"
    );
    vm.runInNewContext(arcadeCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        dispatchedEvents,
        registeredTabs,
        isMinesweeperOpened: () => minesweeperOpened,
    };
}

test("ui/arcade_tab: exports public API on QOL.ui.arcadeTab and globalThis", () => {
    const env = createTestEnvironment();
    const arcadeApi = env.sandbox.QOL.ui.arcadeTab;

    assert.ok(arcadeApi, "QOL.ui.arcadeTab should be defined");
    assert.strictEqual(typeof arcadeApi.render, "function");
    assert.strictEqual(typeof arcadeApi.renderArcadeTab, "function");
    assert.strictEqual(typeof arcadeApi.renderMogTab, "function");
    assert.strictEqual(typeof arcadeApi.createArcadeGameRow, "function");
    assert.ok(Array.isArray(arcadeApi.ARCADE_GAMES));
    assert.ok(Array.isArray(arcadeApi.ARCADE_DEFAULT_DIFFICULTY_OPTIONS));

    assert.ok(Array.isArray(env.sandbox.globalThis.ARCADE_DEFAULT_DIFFICULTY_OPTIONS));
    assert.strictEqual(typeof env.sandbox.globalThis.RenderArcadeTabContent, "function");
    assert.strictEqual(typeof env.sandbox.globalThis.RenderMogTabContent, "function");
});

test("ui/arcade_tab: createArcadeGameRow builds row and triggers game launch", () => {
    const env = createTestEnvironment();
    const arcadeApi = env.sandbox.QOL.ui.arcadeTab;
    const parent = env.doc.create("Panel", { id: "Container" });

    const gameDef = arcadeApi.ARCADE_GAMES[0]; // Bebop Sweeper
    const row = arcadeApi.createArcadeGameRow(parent, gameDef);

    assert.ok(row);
    assert.ok(row.BHasClass("ArcadeGameRow"));

    // Find and trigger Play button
    const playBtn = row.FindChildrenWithClassTraverse("ArcadePlayActionBtn")[0];
    assert.ok(playBtn, "Play button should exist");
    playBtn.activate();
    assert.strictEqual(env.isMinesweeperOpened(), true, "Minesweeper launch function should have been called");
});

test("ui/arcade_tab: onDeath checkbox toggles MOD_CONFIG value", () => {
    const env = createTestEnvironment();
    const arcadeApi = env.sandbox.QOL.ui.arcadeTab;
    const parent = env.doc.create("Panel", { id: "Container" });

    const gameDef = arcadeApi.ARCADE_GAMES[0];
    const row = arcadeApi.createArcadeGameRow(parent, gameDef);

    const onDeathBtn = row.FindChildrenWithClassTraverse("ArcadeOnDeathCheckBtn")[0];
    assert.ok(onDeathBtn, "On Death checkbox button should exist");

    assert.strictEqual(env.sandbox.globalThis.MOD_CONFIG.ON_DEATH_GAME_MINESWEEPER, 0);
    onDeathBtn.activate();
    assert.strictEqual(env.sandbox.globalThis.MOD_CONFIG.ON_DEATH_GAME_MINESWEEPER, 1);
    onDeathBtn.activate();
    assert.strictEqual(env.sandbox.globalThis.MOD_CONFIG.ON_DEATH_GAME_MINESWEEPER, 0);
});

test("ui/arcade_tab: renderArcadeTab builds all game setting rows and 6 game cards", () => {
    const env = createTestEnvironment();
    const arcadeApi = env.sandbox.QOL.ui.arcadeTab;
    const list = env.doc.create("Panel", { id: "SettingsList" });

    arcadeApi.renderArcadeTab(list);

    const gameRows = list.FindChildrenWithClassTraverse("ArcadeGameRow");
    assert.strictEqual(gameRows.length, 6, "Should render 6 arcade games");

    assert.ok(env.registeredTabs.has("Arcade"));
    assert.ok(env.registeredTabs.has("MOG"));
});

test("ui/arcade_tab: renderMogTab constructs MOG community card and website button", () => {
    const env = createTestEnvironment();
    const arcadeApi = env.sandbox.QOL.ui.arcadeTab;
    const list = env.doc.create("Panel", { id: "SettingsList" });

    arcadeApi.renderMogTab(list);

    const mogCard = list.FindChildrenWithClassTraverse("MogTabNoteWrap")[0];
    assert.ok(mogCard, "MOG hero card should be rendered");

    const linkBtn = list.FindChildrenWithClassTraverse("MogTabSiteLink")[0];
    assert.ok(linkBtn, "MOG website link button should exist");

    linkBtn.activate();
    assert.ok(env.dispatchedEvents.some((e) => e.eventName === "ExternalBrowserGoToURL" && e.arg === "https://moglock.gg"));
});
