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
        RegisterForUnhandledEvent: () => {},
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "4.0.0",
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
    require("./load_ui_helpers")(sandbox);
    vm.runInNewContext(windowCode, sandbox);

    return {
        sandbox,
        doc,
        emRoot,
        win,
        closeBtn,
        bg,
        list,
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
        "buildUI",
        "toggleSettingsWindow",
        "forceCloseModSettings",
        "closeOpenSettingsDropdowns",
        "syncTabActiveStates",
        "setActiveTabAndRefresh",
        "renderCurrentTabContent",
        "updateListContent",
        "buildSettingsListRenderSignature",
        "getSettingsListPanel",
        "closeSettingsSideModalsIfOpen",
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

test("Escape closes QOLLOCK settings once, then resumes the native pause menu", () => {
    const { windowApi, win, mockDollar, sandbox } = createTestEnvironment();
    let now = 1000;
    sandbox.Date = { now: () => now };
    const xml = fs.readFileSync(path.resolve(__dirname, "../panorama/layout/hud_escape_menu.xml"), "utf8");
    const handler = xml.match(/<CitadelHudEscapeMenu oncancel="([^"]+)"/);
    assert.ok(handler, "escape menu must declare a cancel handler");
    let resumes = 0;
    const cancel = () => vm.runInNewContext(handler[1], {
        $: mockDollar,
        CitadelResumePlaying: () => { resumes++; }
    });

    windowApi.boot();
    cancel();
    assert.equal(resumes, 1, "Escape should resume when QOLLOCK settings are closed");

    windowApi.setOpen(true);
    cancel();
    assert.equal(windowApi.isOpen(), false);
    assert.equal(resumes, 1, "first Escape should only close QOLLOCK settings");

    windowApi.setOpen(true);
    win._fire("oncancel");
    cancel();
    assert.equal(resumes, 1, "a cancel bubbling from the settings window must not resume in the same press");
    now += 101;
    cancel();
    assert.equal(resumes, 2, "next Escape should resume the native menu");

    const backgroundHandler = xml.match(/<Panel id="EscapeBackground" onactivate="([^"]+)"/);
    assert.ok(backgroundHandler);
    const clickBackground = () => vm.runInNewContext(backgroundHandler[1].replace(/&amp;/g, "&"), {
        $: mockDollar,
        CitadelResumePlaying: () => { resumes++; }
    });
    windowApi.setOpen(true);
    clickBackground();
    assert.equal(windowApi.isOpen(), false);
    assert.equal(resumes, 2);
    clickBackground();
    assert.equal(resumes, 3, "background click should resume when QOLLOCK settings are closed");
});

test("the native MenuBack binding remains the only EscapeButton", () => {
    const xml = fs.readFileSync(path.resolve(__dirname, "../panorama/layout/hud_escape_menu.xml"), "utf8");
    const buttons = xml.match(/\bid="EscapeButton"/g) || [];
    assert.equal(buttons.length, 1, "duplicate EscapeButton ids can intercept the native MenuBack action");
    assert.match(xml, /<CitadelBindingButton\s+id="EscapeButton"\s+action="MenuBack"\s+onactivate="CitadelResumePlaying\(\)"/);
});

test("window: ensureDiscordTextureLogo and ensureDiscordFooterTextureLogo attach logo image", () => {
    const { windowApi, mockDollar, win } = createTestEnvironment();
    const btn = mockDollar.CreatePanel("Button", win, "TestDiscordBtn");

    windowApi.ensureDiscordFooterTextureLogo(btn);
    const logoImg = btn.FindChildTraverse("FooterDiscordLogoTexture");
    assert.ok(logoImg, "FooterDiscordLogoTexture should be created");
    assert.strictEqual(logoImg.BHasClass("FooterDiscordLogoTexture"), true);
});

test("window: isInHideout and isInActiveMatch evaluate context classes", () => {
    const { windowApi, emRoot } = createTestEnvironment();

    assert.strictEqual(windowApi.isInHideout(), false);
    assert.strictEqual(windowApi.isInActiveMatch(), false);

    emRoot.AddClass("InHideout");
    assert.strictEqual(windowApi.isInHideout(), true);

    emRoot.AddClass("GameStateGameInProgress");
    assert.strictEqual(windowApi.isInActiveMatch(), true);
});

test("window: ensureSettingsListHosts and ensureSettingsListContentPanelForSignature create panels", () => {
    const { windowApi, list } = createTestEnvironment();

    const hosts = windowApi.ensureSettingsListHosts(list);
    assert.ok(hosts, "Hosts should be created");
    assert.ok(hosts.cacheHost, "CacheHost should exist");
    assert.ok(hosts.searchHost, "SearchHost should exist");

    const entry = windowApi.ensureSettingsListContentPanelForSignature(list, "tab=Healthbar", false);
    assert.ok(entry, "Panel entry should exist");
    assert.ok(entry.panel, "Content panel should exist");
    assert.strictEqual(entry.created, true);

    // Second call retrieves cached panel
    const cachedEntry = windowApi.ensureSettingsListContentPanelForSignature(list, "tab=Healthbar", false);
    assert.strictEqual(cachedEntry.panel, entry.panel);
    assert.strictEqual(cachedEntry.created, false);
});

test("window: registerSettingsListRowSync and runSettingsListRowSync invoke registered callbacks", () => {
    const { windowApi } = createTestEnvironment();

    windowApi.setActiveSettingsListRenderSignature("test_sig");
    let called = false;
    windowApi.registerSettingsListRowSync(() => {
        called = true;
        return true;
    });

    windowApi.runSettingsListRowSync();
    assert.strictEqual(called, true);

    windowApi.resetSettingsListRowSyncRegistry();
    called = false;
    windowApi.runSettingsListRowSync();
    assert.strictEqual(called, false);
});

test("window: buildSettingsListRenderSignature formats tab|lang|theme", () => {
    const { windowApi } = createTestEnvironment();
    const sig = windowApi.buildSettingsListRenderSignature();
    assert.ok(typeof sig === "string");
    assert.ok(sig.includes("|"));
});

test("window: closeOpenSettingsDropdowns removes DropDownMenuVisible class", () => {
    const { windowApi, emRoot } = createTestEnvironment();
    emRoot.AddClass("DropDownMenuVisible");
    assert.strictEqual(emRoot.BHasClass("DropDownMenuVisible"), true);

    windowApi.closeOpenSettingsDropdowns(emRoot);
    assert.strictEqual(emRoot.BHasClass("DropDownMenuVisible"), false);
});

test("window: syncTabActiveStates updates active class on window and tab buttons", () => {
    const { windowApi, doc, win } = createTestEnvironment();
    const tabBar = doc.create("Panel", { id: "SettingsTabBar" });
    const tabBtn = doc.create("Button", { id: "TabButton_Crosshair" });
    tabBar.addChild(tabBtn);
    win.addChild(tabBar);

    windowApi.setActiveTab("Crosshair");
    windowApi.syncTabActiveStates(tabBar);

    assert.strictEqual(win.BHasClass("SettingsTabActive_Crosshair"), true);
    assert.strictEqual(tabBtn.BHasClass("Active"), true);
});

test("window: buildUI initializes navigation structure and attaches events", () => {
    const { windowApi, win } = createTestEnvironment();
    windowApi.buildUI();

    const tabBar = win.FindChildTraverse("SettingsTabBar");
    assert.ok(tabBar, "SettingsTabBar should be created by buildUI");
    const searchWrap = win.FindChildTraverse("SettingsSearchWrap");
    assert.ok(searchWrap, "SettingsSearchWrap should be created in header by buildUI");

    const headerCenterHost = win.FindChildTraverse("SettingsHeaderCenterHost");
    assert.ok(headerCenterHost, "SettingsHeaderCenterHost must exist");
    assert.strictEqual(searchWrap.GetParent(), headerCenterHost, "SettingsSearchWrap must be child of SettingsHeaderCenterHost");

    const header = win.FindChildTraverse("SettingsHeader");
    const closeBtn = header.FindChildTraverse("CloseBtn");
    const moglockLink = header.FindChildTraverse("ModVersionLabelTop");
    assert.ok(closeBtn, "CloseBtn must exist");
    assert.ok(moglockLink, "ModVersionLabelTop must exist");

    const headerChildren = header.Children();
    const verIdx = headerChildren.indexOf(moglockLink);
    const centerIdx = headerChildren.indexOf(headerCenterHost);
    const closeIdx = headerChildren.indexOf(closeBtn);
    assert.ok(verIdx >= 0 && centerIdx >= 0 && closeIdx >= 0, "All header elements must be in header");
    assert.ok(verIdx < centerIdx, "ModVersionLabelTop must precede SettingsHeaderCenterHost in header child order");
    assert.ok(centerIdx < closeIdx, "SettingsHeaderCenterHost must precede CloseBtn in header child order");
});

test("window: setActiveTabAndRefresh clears search query and cancels pending search timer", async () => {
    const { windowApi, win, sandbox } = createTestEnvironment();
    windowApi.buildUI();

    const searchInput = win.FindChildTraverse("SettingsSearchInput");
    assert.ok(searchInput, "SettingsSearchInput must exist");
    searchInput.text = "d";
    sandbox.currentSearchQuery = "d";

    windowApi.setActiveTabAndRefresh("Console");
    assert.strictEqual(sandbox.currentSearchQuery, "", "currentSearchQuery must be cleared on tab navigation");
    assert.strictEqual(searchInput.text, "", "searchInput text must be cleared on tab navigation");

    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.strictEqual(windowApi.getActiveTab(), "Console", "Active tab must be Console after fade");
});

test("window: setActiveTabAndRefresh with same active tab exits search mode if search was active", () => {
    const { windowApi, win, sandbox } = createTestEnvironment();
    windowApi.buildUI();

    windowApi.setActiveTab("Presets");
    assert.strictEqual(windowApi.getActiveTab(), "Presets");

    const searchInput = win.FindChildTraverse("SettingsSearchInput");
    searchInput.text = "d";
    sandbox.currentSearchQuery = "d";

    // Re-clicking "Presets" while search is active must exit search and restore Presets tab
    windowApi.setActiveTabAndRefresh("Presets");
    assert.strictEqual(sandbox.currentSearchQuery, "", "Search query must be reset even when clicking same tab");
    assert.strictEqual(searchInput.text, "", "Search input text must be cleared");
    assert.strictEqual(windowApi.getActiveTab(), "Presets");
});



