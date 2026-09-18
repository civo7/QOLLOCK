// tests/ui_tabs.test.js
// =============================================================================
// Unit tests for Settings Tabs subsystem (panorama/scripts/ui/ql_settings_tabs.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("ui/tabs: exports tab definitions on QOL.ui.tabs and globalThis", () => {
    const ctx = {
        QOL: {},
        globalThis: null
    };
    ctx.globalThis = ctx;

    const script = fs.readFileSync(
        path.join(__dirname, "../panorama/scripts/ui/ql_settings_tabs.js"),
        "utf8"
    );
    vm.runInNewContext(script, ctx);

    assert.ok(ctx.QOL.ui.tabs, "QOL.ui.tabs must exist");

    // Order
    const order = ctx.QOL.ui.tabs.GetSettingsTabOrder();
    assert.strictEqual(order.length, 11);
    assert.strictEqual(order[0], "Support");
    assert.strictEqual(order[1], "Config");

    // Display Name
    assert.strictEqual(ctx.QOL.ui.tabs.GetSettingsTabDisplayName("Config"), "Settings");
    assert.strictEqual(ctx.QOL.ui.tabs.GetSettingsTabDisplayName("MOG"), "MOGLOCK");
    assert.strictEqual(ctx.QOL.ui.tabs.GetSettingsTabDisplayName("Crosshair"), "Crosshair");

    // Groups
    const groups = ctx.QOL.ui.tabs.GetSettingsTabGroups();
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].title, "General");
    assert.strictEqual(groups[1].title, "Gameplay");

    // Icons
    assert.ok(ctx.QOL.ui.tabs.GetSettingsTabIconSource("Support").includes("icon_thumbsup"));
    assert.ok(ctx.QOL.ui.tabs.GetSettingsTabIconSource("Config").includes("icon_gear"));
    assert.ok(ctx.QOL.ui.tabs.GetSettingsTabIconSource("Shop").includes("icon_cart"));
    assert.strictEqual(ctx.QOL.ui.tabs.GetSettingsTabIconSource("Unknown"), "");

    // Globals
    assert.strictEqual(ctx.GetSettingsTabOrder, ctx.QOL.ui.tabs.GetSettingsTabOrder);
    assert.strictEqual(ctx.GetSettingsTabDisplayName, ctx.QOL.ui.tabs.GetSettingsTabDisplayName);
});

test("ui/tabs: dynamically reflects QOL.ui.layout ordering, custom names, and icons", () => {
    const ctx = {
        QOL: {
            ui: {
                layout: [
                    { heading: "Custom Group" },
                    { id: "MyTabA", name: "Custom Tab A", icon: "s2r://panorama/images/a.vsvg" },
                    { id: "MyTabB", name: "Custom Tab B", icon: "s2r://panorama/images/b.vsvg" },
                    { heading: "Another Group" },
                    { id: "MyTabC", name: "Custom Tab C", icon: "s2r://panorama/images/c.vsvg" }
                ]
            }
        },
        globalThis: null
    };
    ctx.globalThis = ctx;

    const script = fs.readFileSync(
        path.join(__dirname, "../panorama/scripts/ui/ql_settings_tabs.js"),
        "utf8"
    );
    vm.runInNewContext(script, ctx);

    // Dynamic order
    const order = ctx.QOL.ui.tabs.GetSettingsTabOrder();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(order)), ["MyTabA", "MyTabB", "MyTabC"]);

    // Dynamic groups
    const groups = ctx.QOL.ui.tabs.GetSettingsTabGroups();
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].title, "Custom Group");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(groups[0].tabs)), ["MyTabA", "MyTabB"]);
    assert.strictEqual(groups[1].title, "Another Group");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(groups[1].tabs)), ["MyTabC"]);

    // Dynamic display names & icons
    assert.strictEqual(ctx.QOL.ui.tabs.GetSettingsTabDisplayName("MyTabA"), "Custom Tab A");
    assert.strictEqual(ctx.QOL.ui.tabs.GetSettingsTabIconSource("MyTabB"), "s2r://panorama/images/b.vsvg");
});
