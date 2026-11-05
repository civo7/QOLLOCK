"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const loadSettings = require("./load_settings_environment");

for (const firstAckBeforeSecondSave of [false, true]) {
    test(`Save feedback belongs to the latest request, prior acknowledgment first=${firstAckBeforeSecondSave}`, () => {
        const e = loadSettings(), g = e.global, Q = g.QOL, callbacks = [];
        e.hud.sandbox.global.QOL.core.App.shutdown();
        Q.core.storageBridge = { saveSettings(config, callback) { callbacks.push(callback); } };
        const button = g.$.CreatePanel("Button", e.em, "AsyncSave"), label = g.$.CreatePanel("Label", button, "AsyncSaveLabel");
        Q.ui.cloudSync.activateSaveFromUi(button, label);
        if (firstAckBeforeSecondSave) callbacks[0](null);
        e.clock.advance(1100);
        Q.ui.cloudSync.activateSaveFromUi(button, label);
        assert.equal(callbacks.length, 2);
        assert.equal(label.text, "SAVING");
        if (!firstAckBeforeSecondSave) callbacks[0](null);
        e.clock.advance(1250);
        assert.equal(label.text, "SAVING", "neither an older reply nor its reset may finish the pending save UI");
        callbacks[1](null);
        assert.equal(label.text, "SAVED");
        e.clock.advance(1250); assert.equal(label.text, "SAVE");
        assert.deepEqual(e.clock.errors, []);
    });
}

test("a retired settings context's Save callback cannot publish success onto a replacement root", () => {
    const e = loadSettings(), g = e.global, callbacks = [];
    e.hud.sandbox.global.QOL.core.App.shutdown();
    g.QOL.core.storageBridge = { saveSettings(config, callback) { callbacks.push(callback); } };
    const button = g.$.CreatePanel("Button", e.em, "AsyncSave"), label = g.$.CreatePanel("Label", button, "AsyncSaveLabel");
    g.QOL.ui.cloudSync.activateSaveFromUi(button, label);
    const root = e.doc.create("CitadelHud", { id: "Hud" });
    const nextContext = g.$.CreatePanel("Panel", root, "EscapeMenu");
    g.$.GetContextPanel = () => nextContext;
    callbacks[0](null); e.clock.advance(1500);
    assert.equal(label.text, "SAVING", "a retired context must not display success");
    assert.deepEqual(e.clock.errors, []);
});

test("persistent Saving feedback retires the preceding message's clear callback", () => {
    const e = loadSettings(), Q = e.global.QOL;
    e.hud.sandbox.global.QOL.core.App.shutdown();
    Q.ui.configTab.render(e.list);
    const feedback = e.list.FindChildTraverse("ConfigFeedbackLabel");
    Q.ui.configTab.setConfigFeedbackMessage("Export string copied.", "success", 1800);
    e.clock.advance(500);
    Q.ui.configTab.setConfigFeedbackMessage("Saving settings...", "info", 0);
    e.clock.advance(1400);
    assert.equal(feedback.text, "Saving settings...");
    assert.deepEqual(e.clock.errors, []);
});

for (const returnToCurrentTab of [false, true]) {
    test(`the latest tab request wins over a pending transition, return to current=${returnToCurrentTab}`, () => {
        const e = loadSettings(), g = e.global, window = g.QOL.ui.window;
        window.setOpen(true); e.clock.advance(500);
        const requested = returnToCurrentTab ? g.currentTab : "HUD";
        window.setActiveTabAndRefresh("Audio");
        window.setActiveTabAndRefresh(requested);
        e.clock.advance(500);
        assert.equal(g.currentTab, requested);
        assert.equal(window.findShell().FindChildTraverse("SettingsList").BHasClass("TabFading"), false);
        assert.deepEqual(e.clock.errors, []);
    });
}

test("window discovery releases a living retired shell and opens the current replacement", () => {
    const e = loadSettings(), g = e.global, window = g.QOL.ui.window;
    window.setOpen(true); e.clock.advance(500);
    const old = window.findShell();
    old.SetParent(g.$.CreatePanel("Panel", null, "RetiredSettings"));
    const next = g.$.CreatePanel("Panel", e.em, "SettingsWindow"); next.AddClass("SettingsWindow");
    assert.equal(window.findShell() === next, true, "discovery must select the current shell");
    window.setOpen(true);
    assert.equal(next.BHasClass("Visible"), true);
    assert.equal(old.BHasClass("Visible"), false);
    assert.equal(window.isOpen(), true);
    assert.deepEqual(e.clock.errors, []);
});

test("replacement settings drag handles bind once while retired handlers remain inert", () => {
    const e = loadSettings(), g = e.global, Q = g.QOL;
    e.hud.sandbox.global.QOL.core.App.shutdown();
    Q.getSettingsConfig().DRAG_ENABLED = 1;
    const window = e.em.FindChildTraverse("SettingsWindow"), oldHeader = window.FindChildTraverse("SettingsHeader");
    Q.ui.drag.setupSettingsWindowDragging(oldHeader, window);
    const oldHandle = oldHeader.FindChildTraverse("SettingsHeaderDragAreaLeft"), first = {};
    g.$.DispatchEvent("DragStart", oldHandle, first); assert.equal(first.displayPanel === window, true);
    oldHeader.SetParent(g.$.CreatePanel("Panel", null, "RetiredHeader"));
    const header = g.$.CreatePanel("Panel", window, "SettingsHeader");
    g.$.CreatePanel("Button", header, "CloseBtn");
    Q.ui.drag.setupSettingsWindowDragging(header, window);
    Q.ui.drag.setupSettingsWindowDragging(header, window);
    for (const side of ["Left", "Right"]) {
        const event = {};
        g.$.DispatchEvent("DragStart", header.FindChildTraverse("SettingsHeaderDragArea" + side), event);
        assert.equal(event.displayPanel === window, true, "replacement drag handle must be bound");
    }
    const retired = {};
    g.$.DispatchEvent("DragStart", oldHandle, retired);
    assert.equal(retired.displayPanel, undefined);
    e.clock.advance(200);
    assert.deepEqual(e.clock.errors, []);
});

test("stopping Feature Test restores the complete canonical settings and retires pending callbacks", () => {
    const e = loadSettings(), g = e.global, Q = g.QOL;
    const label = g.$.CreatePanel("Label", e.em, "FitStatus"), button = g.$.CreatePanel("Button", e.em, "FitButton");
    g.SaveAndSync();
    const baseline = JSON.stringify(Q.getSettingsConfig());
    Q.ui.devTab.runFeatureIsolationTest(label, button);
    for (let i = 0; i < 20 && JSON.stringify(Q.getSettingsConfig()) === baseline; i++) e.clock.advance(50);
    assert.notEqual(JSON.stringify(Q.getSettingsConfig()), baseline, "the production test must reach a temporary setting");
    Q.ui.devTab.runFeatureIsolationTest(label, button);
    e.clock.advance(10000);
    assert.equal(label.text, "Stopped");
    assert.deepEqual(JSON.parse(JSON.stringify(Q.getSettingsConfig())), JSON.parse(baseline));
    const published = Q.parseStoredConfig(e.hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""));
    assert.deepEqual(JSON.parse(JSON.stringify(published)), JSON.parse(baseline));
    assert.deepEqual(e.clock.errors, []);
});