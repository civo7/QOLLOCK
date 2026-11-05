"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const loadSettings = require("./load_settings_environment");

function controls() {
    const e = loadSettings(), g = e.global;
    e.hud.sandbox.global.QOL.core.App.shutdown();
    const button = g.$.CreatePanel("Button", e.em, "SaveFeedback");
    const label = g.$.CreatePanel("Label", button, "SaveFeedbackLabel");
    return { ...e, g, button, label };
}

test("manual Save fails immediately when durable storage is unavailable", () => {
    const e = controls(), { g, button, label } = e;
    delete g.QOL.core.storageBridge;
    delete g.QOLStorageBridge;
    g.QOL.ui.configTab.getCurrentExportSettingsString = () => "[QOL-4-0-0]:valid_export_token";
    g.QOL.ui.cloudSync.activateSaveFromUi(button, label);
    assert.equal(label.text, "FAILED");
    assert.equal(button.BHasClass("FailureState"), true);
    e.clock.advance(1500);
    assert.equal(label.text, "SAVE");
    assert.deepEqual(e.clock.errors, []);
});

for (const failed of [false, true]) {
    test(`manual Save waits for its durable acknowledgment, failed=${failed}`, () => {
        const e = controls(), { g, button, label } = e;
        let complete;
        g.QOL.core.storageBridge = { saveSettings(_config, callback) { complete = callback; } };
        g.QOL.ui.cloudSync.activateSaveFromUi(button, label);
        assert.equal(label.text, "SAVING");
        complete(failed ? new Error("quota exceeded") : null);
        assert.equal(label.text, failed ? "FAILED" : "SAVED");
        assert.equal(button.BHasClass("FailureState"), failed);
        assert.equal(button.BHasClass("SuccessState"), !failed);
        e.clock.advance(1500);
        assert.equal(label.text, "SAVE");
        assert.deepEqual(e.clock.errors, []);
    });
}
