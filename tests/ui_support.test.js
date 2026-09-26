// tests/ui_support.test.js
// =============================================================================
// Unit tests for Support & Credits subsystem (panorama/scripts/ui/support.js)
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
        DispatchEvent: () => {},
        Localize: (s) => s,
    };

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
            gSearchCollectMode: false,
            gSearchCollectState: null,
            LocalizeSettingsText: (t) => t,
            CreateSectionTitle: (parent, title) => {
                const p = mockDollar.CreatePanel("Panel", parent, "");
                const lbl = mockDollar.CreatePanel("Label", p, "");
                lbl.text = title;
                return lbl;
            },
            CreateRow: (parent, label) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const supportCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/support.js"),
        "utf8"
    );
    require("./load_ui_helpers")(sandbox);
    vm.runInNewContext(supportCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        getRegisteredTab: () => ({ name: registeredTabName, renderer: registeredTabRenderer }),
    };
}

test("ui/support: exports public API on QOL.ui.support and globalThis", () => {
    const { sandbox, getRegisteredTab } = createTestEnvironment();
    const support = sandbox.QOL.ui.support;

    assert.ok(support, "QOL.ui.support exists");
    assert.strictEqual(typeof support.render, "function");
    assert.strictEqual(typeof support.createSupportThanksPlaques, "function");
    assert.strictEqual(typeof support.createSupportThanksGroup, "function");
    assert.ok(Array.isArray(support.contributors));
    assert.ok(Array.isArray(support.translators));
    assert.ok(Array.isArray(support.ctaDefs));
    assert.ok(Array.isArray(support.heroBodyLines));

    // Backward compatibility globals
    assert.strictEqual(sandbox.globalThis.CreateSupportThanksPlaques, support.createSupportThanksPlaques);
    assert.strictEqual(sandbox.globalThis.CreateSupportThanksGroup, support.createSupportThanksGroup);
    assert.strictEqual(sandbox.globalThis.RenderSupportTabContent, support.render);

    // Auto registration with window manager
    const reg = getRegisteredTab();
    assert.strictEqual(reg.name, "Support");
    assert.strictEqual(reg.renderer, support.render);
});

test("ui/support: createSupportThanksPlaques constructs plaque grid and handles entries", () => {
    const { sandbox, doc } = createTestEnvironment();
    const { createSupportThanksPlaques } = sandbox.QOL.ui.support;

    const parent = doc.create("Panel", { id: "Parent" });
    const entries = [
        { label: "Person A", role: "Contributor", url: "https://example.com" },
        { label: "Person B", role: "Translator" },
        { label: "Person C", breakBefore: true },
    ];

    const grid = createSupportThanksPlaques(parent, entries, 2);
    assert.ok(grid);
    assert.ok(grid.BHasClass("SupportThanksPlaqueGrid"));

    // Ensure rows were created
    const rows = grid.FindChildrenWithClassTraverse("SupportThanksPlaqueRow");
    assert.ok(rows.length >= 2, "Rows split by column limit and breakBefore");
});

test("ui/support: createSupportThanksGroup creates titled group with plaque grid", () => {
    const { sandbox, doc } = createTestEnvironment();
    const { createSupportThanksGroup } = sandbox.QOL.ui.support;

    const parent = doc.create("Panel", { id: "Parent" });
    const entries = [{ label: "Contributor 1" }, { label: "Contributor 2" }];

    const group = createSupportThanksGroup(parent, "Contributors", entries, 4, "RoleContrib");
    assert.ok(group);
    assert.ok(group.BHasClass("SupportThanksGroup"));
    assert.ok(group.BHasClass("RoleContrib"));
    assert.ok(group.thanksGrid);
});

test("ui/support: render constructs hero card, CTA buttons, and thanks block", () => {
    const { sandbox, doc } = createTestEnvironment();
    const { render } = sandbox.QOL.ui.support;

    const list = doc.create("Panel", { id: "SettingsList" });
    render(list);

    const hero = list.FindChildTraverse("SupportIntroCard");
    assert.ok(hero, "SupportIntroCard exists");

    const cta = list.FindChildTraverse("SupportCtaSection");
    assert.ok(cta, "SupportCtaSection exists");

    const thanks = list.FindChildTraverse("SupportTabThanksBlock");
    assert.ok(thanks, "SupportTabThanksBlock exists");

    const discordBtn = cta.FindChildTraverse("SupportCtaDiscordBtn");
    assert.ok(discordBtn, "SupportCtaDiscordBtn exists");
});

test("ui/support: contributors list contains BubbleGumXD with GameBanana profile", () => {
    const { sandbox } = createTestEnvironment();
    const entry = sandbox.QOL.ui.support.contributors.find((c) => c.label === "BubbleGumXD");
    assert.ok(entry, "BubbleGumXD should be in contributors");
    assert.strictEqual(entry.role, "Contributor");
    assert.strictEqual(entry.url, "https://gamebanana.com/members/5281881");
});

