// tests/ui_window.test.js
// =============================================================================
// Unit tests for settings window manager (panorama/scripts/ui/window.js)
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

    const scheduled = new Map();
    let schedId = 0;

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => {
            const id = ++schedId;
            const timer = setTimeout(cb, delaySec * 1000);
            scheduled.set(id, timer);
            return id;
        },
        CancelScheduled: (id) => {
            if (scheduled.has(id)) {
                clearTimeout(scheduled.get(id));
                scheduled.delete(id);
            }
        },
        CreatePanel: (type, parent, id, props) => {
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

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "3.2.0",
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id, props) => mockDollar.CreatePanel(type, parent, id, props),
                    findRoot: () => emRoot,
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

    const windowCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/window.js"),
        "utf8"
    );
    vm.runInNewContext(windowCode, sandbox);

    return {
        emRoot,
        win,
        closeBtn,
        bg,
        windowApi: sandbox.QOL.ui.window,
        QOL: sandbox.QOL,
        mockDollar,
    };
}

test("window: exports all public window manager API functions", () => {
    const { windowApi } = createTestEnvironment();
    assert.ok(windowApi, "QOL.ui.window must be defined");

    const expectedFns = [
        "findShell",
        "rebuildTabs",
        "rebuildFooter",
        "setActiveTab",
        "getActiveTab",
        "renderTab",
        "registerTabRenderer",
        "setOpen",
        "toggle",
        "isOpen",
        "boot",
    ];

    for (const fn of expectedFns) {
        assert.strictEqual(typeof windowApi[fn], "function", `Expected windowApi.${fn} to be a function`);
    }
});

test("window: findShell discovers SettingsWindow in the tree", () => {
    const { windowApi, win } = createTestEnvironment();
    const shell = windowApi.findShell();
    assert.strictEqual(shell, win);
    assert.strictEqual(shell.hittest, true);
});

test("window: setOpen and toggle control Visible class", () => {
    const { windowApi, win } = createTestEnvironment();

    assert.strictEqual(windowApi.isOpen(), false);
    assert.strictEqual(win.BHasClass("Visible"), false);

    windowApi.setOpen(true);
    assert.strictEqual(windowApi.isOpen(), true);
    assert.strictEqual(win.BHasClass("Visible"), true);

    windowApi.setOpen(false);
    assert.strictEqual(windowApi.isOpen(), false);
    assert.strictEqual(win.BHasClass("Visible"), false);

    windowApi.toggle();
    assert.strictEqual(windowApi.isOpen(), true);
    assert.strictEqual(win.BHasClass("Visible"), true);

    windowApi.toggle();
    assert.strictEqual(windowApi.isOpen(), false);
});

test("window: close button closes the window", () => {
    const { windowApi, win, closeBtn } = createTestEnvironment();

    windowApi.setOpen(true);
    assert.strictEqual(windowApi.isOpen(), true);

    closeBtn.activate();
    assert.strictEqual(windowApi.isOpen(), false);
    assert.strictEqual(win.BHasClass("Visible"), false);
});

test("window: rebuildTabs constructs groups and tab buttons", () => {
    const { windowApi, win } = createTestEnvironment();
    windowApi.rebuildTabs();

    const tabBar = win.FindChildTraverse("SettingsTabBar");
    assert.ok(tabBar, "SettingsTabBar must exist");

    const tabsContainer = tabBar.FindChildTraverse("SettingsTabRailTabs");
    assert.ok(tabsContainer, "SettingsTabRailTabs must exist");

    const healthbarTab = tabsContainer.FindChildTraverse("TabButton_Healthbar");
    assert.ok(healthbarTab, "TabButton_Healthbar must be rendered");

    const crosshairTab = tabsContainer.FindChildTraverse("TabButton_Crosshair");
    assert.ok(crosshairTab, "TabButton_Crosshair must be rendered");
});

test("window: setActiveTab updates active tab state and renders registered content", () => {
    const { windowApi, win } = createTestEnvironment();
    windowApi.rebuildTabs();

    let renderedTab = null;
    windowApi.registerTabRenderer("Crosshair", (container) => {
        renderedTab = "Crosshair";
    });

    windowApi.setActiveTab("Crosshair");
    assert.strictEqual(windowApi.getActiveTab(), "Crosshair");
    assert.strictEqual(renderedTab, "Crosshair");

    const tabsContainer = win.FindChildTraverse("SettingsTabRailTabs");
    const crosshairTab = tabsContainer.FindChildTraverse("TabButton_Crosshair");
    assert.ok(crosshairTab.BHasClass("Active"), "Active tab must have Active class");
});

test("window: footer renders Discord and Version buttons", () => {
    const { windowApi, win } = createTestEnvironment();
    windowApi.rebuildTabs();

    const footer = win.FindChildTraverse("SettingsTabRailFooter");
    assert.ok(footer, "SettingsTabRailFooter must exist");

    const discordBtn = footer.FindChildTraverse("FooterDiscordRailButton");
    assert.ok(discordBtn, "FooterDiscordRailButton must exist");

    const versionBtn = footer.FindChildTraverse("FooterVersionLabel");
    assert.ok(versionBtn, "FooterVersionLabel must exist");
});

test("window: escape background click closes settings window first if open", () => {
    const { windowApi, bg } = createTestEnvironment();

    windowApi.boot();
    windowApi.setOpen(true);
    assert.strictEqual(windowApi.isOpen(), true);

    // Click background
    bg.activate();
    assert.strictEqual(windowApi.isOpen(), false);
});

test("window: ensureDiscordTextureLogo and ensureDiscordFooterTextureLogo attach logo image", () => {
    const { windowApi, mockDollar, win } = createTestEnvironment();
    const btn = mockDollar.CreatePanel("Button", win, "TestDiscordBtn");

    windowApi.ensureDiscordFooterTextureLogo(btn);
    const logoImg = btn.FindChildTraverse("FooterDiscordLogoTexture");
    assert.ok(logoImg, "FooterDiscordLogoTexture should be created");
    assert.strictEqual(logoImg.BHasClass("FooterDiscordLogoTexture"), true);
});

