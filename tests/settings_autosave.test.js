"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load_settings_environment");

// Native transport is controlled here; the real bridge/page path is covered
// separately in storage_bridge.test.js. These checks observe saved snapshots.
function setup() {
    const e = load(), g = e.global, requests = [], feedback = [];
    e.hud.sandbox.global.QOL.core.App.shutdown();
    g.QOL.core.storageBridge.saveSettings = (raw, callback) => {
        requests.push({ config: g.QOL.parseStoredConfig(typeof raw === "string" ? raw : g.WrapConfigForStorage(raw)), callback });
    };
    g.QOL.ui.configTab.setLocalizedConfigFeedbackMessage = (...args) => feedback.push(args);
    const edit = (patch) => { Object.assign(g.MOD_CONFIG, patch); g.SaveAndSync(); };
    return { ...e, g, requests, feedback, edit };
}

test("Auto-Save defaults off and manual publication never writes durable storage", () => {
    const e = setup();
    assert.equal(e.g.MOD_CONFIG.AUTO_SAVE_CHANGES, 0);
    e.edit({ SOULS_X_OFFSET: 82 }); e.clock.advance(2000);
    assert.equal(e.requests.length, 0);
    assert.equal(JSON.parse(e.hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", "")).data.SOULS_X_OFFSET, 82);
});

test("Auto-Save coalesces both immediate controls and dirty sliders into the latest immutable snapshot", () => {
    const e = setup();
    e.edit({ AUTO_SAVE_CHANGES: 1 }); e.clock.advance(200);
    e.edit({ SOULS_X_OFFSET: 60 }); e.clock.advance(200);
    e.g.MOD_CONFIG.SOULS_X_OFFSET = 93; e.g.MarkConfigDirty();
    e.clock.advance(300);
    assert.equal(e.requests.length, 0);
    e.clock.advance(700);
    assert.equal(e.requests.length, 1);
    assert.equal(e.requests[0].config.SOULS_X_OFFSET, 93);
    e.g.MOD_CONFIG.SOULS_X_OFFSET = 105;
    assert.equal(e.requests[0].config.SOULS_X_OFFSET, 93);
    assert.equal(e.feedback.some(row => row[0] === "Settings saved successfully."), false, "dispatch is not acknowledgment");
    e.requests[0].callback(null);
    assert.equal(e.feedback.some(row => row[0] === "Settings saved successfully."), true);
    assert.deepEqual(e.clock.errors, []);
});

test("Auto-Save keeps one write in flight and follows it with only the latest edit", () => {
    const e = setup();
    e.edit({ AUTO_SAVE_CHANGES: 1 }); e.clock.advance(1000);
    assert.equal(e.requests.length, 1);
    for (let value = 40; value < 60; value++) { e.edit({ SOULS_X_OFFSET: value }); e.clock.advance(30); }
    e.clock.advance(1000); assert.equal(e.requests.length, 1);
    e.requests[0].callback(null); e.clock.advance(1000);
    assert.equal(e.feedback.some(row => row[0] === "Settings saved successfully."), false,
        "an acknowledgment for superseded data cannot claim that newer edits were saved");
    assert.equal(e.requests.length, 2);
    assert.equal(e.requests[1].config.SOULS_X_OFFSET, 59);
    e.requests[1].callback(null);
    e.g.SaveAndSync(); e.clock.advance(2000);
    assert.equal(e.requests.length, 2, "identical acknowledged config does not write again");
});

test("disabling Auto-Save saves the off preference once, then edits stay manual", () => {
    const e = setup();
    e.edit({ AUTO_SAVE_CHANGES: 1 }); e.clock.advance(1000);
    assert.equal(e.requests.length, 1); e.requests[0].callback(null);
    e.edit({ AUTO_SAVE_CHANGES: 0 }); e.clock.advance(1000);
    assert.equal(e.requests.length, 2); assert.equal(e.requests[1].config.AUTO_SAVE_CHANGES, 0);
    e.requests[1].callback(null);
    e.edit({ SOULS_X_OFFSET: 88 }); e.clock.advance(2000);
    assert.equal(e.requests.length, 2);
});

test("restored Auto-Save can be disabled as the first edit without saving during restore", () => {
    const e = setup(), g = e.g;
    const raw = g.WrapConfigForStorage({ ...g.MOD_CONFIG, AUTO_SAVE_CHANGES: 1 });
    g.QOL.core.persistence.writeStorageConfigRawToUi(e.hud.root, raw);
    g.SyncConfigFromStorage(); e.clock.advance(1000);
    assert.equal(g.MOD_CONFIG.AUTO_SAVE_CHANGES, 1); assert.equal(e.requests.length, 0);
    e.edit({ AUTO_SAVE_CHANGES: 0 }); e.clock.advance(1000);
    assert.equal(e.requests.length, 1); assert.equal(e.requests[0].config.AUTO_SAVE_CHANGES, 0);
});

test("Auto-Save failure stays observable and identical user retry can save again", () => {
    const e = setup();
    e.edit({ AUTO_SAVE_CHANGES: 1 }); e.clock.advance(1000);
    assert.equal(e.requests.length, 1);
    e.requests[0].callback(new Error("CEF unavailable"));
    assert.equal(e.feedback.at(-1)[1], "error");
    assert.equal(e.feedback.some(row => row[0] === "Settings saved successfully."), false);
    e.g.SaveAndSync(); e.clock.advance(1000);
    assert.equal(e.requests.length, 2);
});

test("Auto-Save drops retired context timers and ignores stale acknowledgments", () => {
    const e = setup();
    e.edit({ AUTO_SAVE_CHANGES: 1 }); e.clock.advance(1000);
    assert.equal(e.requests.length, 1);
    e.edit({ SOULS_X_OFFSET: 71 });
    const root = e.doc.create("CitadelHud", { id: "ReplacementHud" });
    const context = e.doc.create("CitadelHudEscapeMenu", { id: "ReplacementSettings" }); root.addChild(context);
    e.g.$.GetContextPanel = () => context;
    const before = e.feedback.length;
    e.requests[0].callback(null); e.clock.advance(2000);
    assert.equal(e.requests.length, 1); assert.equal(e.feedback.length, before);
    assert.deepEqual(e.clock.errors, []);
});

test("a dirty slider cancels an older pending snapshot before its publication debounce", () => {
    const e = setup();
    e.edit({ AUTO_SAVE_CHANGES: 1 }); e.clock.advance(500);
    e.g.MOD_CONFIG.SOULS_X_OFFSET = 114; e.g.MarkConfigDirty();
    e.clock.advance(150);
    assert.equal(e.requests.length, 0, "the earlier timer must not save stale slider data");
    e.clock.advance(1000);
    assert.equal(e.requests.length, 1); assert.equal(e.requests[0].config.SOULS_X_OFFSET, 114);
});

test("manual Save supersedes queued Auto-Save and its old acknowledgments", () => {
    const e = setup();
    e.edit({ AUTO_SAVE_CHANGES: 1 }); e.clock.advance(1000);
    e.edit({ SOULS_X_OFFSET: 77 });
    const button = e.doc.create("Button", { id: "ManualSave" });
    const label = e.doc.create("Label", { id: "ManualSaveLabel" }); button.addChild(label);
    e.g.QOL.ui.cloudSync.activateSaveFromUi(button, label);
    assert.equal(e.requests.length, 2); assert.equal(e.requests[1].config.SOULS_X_OFFSET, 77);
    const before = e.feedback.length;
    e.requests[0].callback(null); e.clock.advance(1000);
    assert.equal(e.requests.length, 2); assert.equal(e.feedback.length, before);
    e.requests[1].callback(null); assert.equal(label.text, "SAVED");
});

test("explicit Load and Clear cancel pending Auto-Save instead of overwriting newer storage intent", () => {
    for (const action of ["loadSettings", "clearSettings"]) {
        const e = setup();
        e.edit({ AUTO_SAVE_CHANGES: 1 });
        // Use the production operation and controlled transport. Completion is
        // irrelevant here: the request must retire the queued save immediately.
        e.g.QOL.core.storageBridge[action](() => {});
        e.clock.advance(1000);
        assert.equal(e.requests.length, 0, action);
    }
});

test("retired Preview Changes is absent from current controls, defaults and active includes", () => {
    const e = load(), g = e.global;
    assert.equal(Object.hasOwn(g.MOD_CONFIG, "PREVIEWS_ENABLED"), false);
    assert.equal(g.QOL.preview, undefined);
    g.QOL.ui.configTab.render(e.list);
    assert.equal(e.list.FindChildrenWithClassTraverse("SettingRow_AUTO_SAVE_CHANGES").length, 1);
    assert.equal(e.list.FindChildrenWithClassTraverse("SettingRow_PREVIEWS_ENABLED").length, 0);
    assert.equal(fs.existsSync(path.resolve(__dirname, "../panorama/scripts/ql_settings_previews.js")), false);
    assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, "../panorama/styles/ql_settings.css"), "utf8"),
        /#MinimapSizePreview|#ZipBoostPreview|\.PreviewToggleTabAction/);
    const parsed = g.QOL.parseStoredConfig(JSON.stringify({ PREVIEWS_ENABLED: 1, TOP_BAR_SCALE: 1.7 }));
    assert.equal(parsed.TOP_BAR_SCALE, 1.7); assert.equal(parsed.AUTO_SAVE_CHANGES, 0);
    assert.equal(Object.hasOwn(parsed, "PREVIEWS_ENABLED"), false);
});

test("Auto-Save survives sharing in both states and stays a local preference on preset/import Apply", () => {
    const e = setup(), g = e.g;
    for (const value of [0, 1]) {
        const code = g.QOL.ui.configTab.getCurrentExportSettingsString({ ...g.MOD_CONFIG, AUTO_SAVE_CHANGES: value });
        const raw = g.QOL.persistence.fromBase64Url(code.split(":")[1]);
        assert.equal(e.hud.sandbox.global.QOL.core.codec.deserializeSettings(raw).AUTO_SAVE_CHANGES, value);
        g.MOD_CONFIG.AUTO_SAVE_CHANGES = 1 - value;
        const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
        assert.equal(result.ok, true);
        assert.equal(result.candidateConfig.AUTO_SAVE_CHANGES, 1 - value);
        assert.equal(g.ApplyPresetByName("Default"), true);
        assert.equal(g.MOD_CONFIG.AUTO_SAVE_CHANGES, 1 - value);
    }
});

test("superseded Auto-Save timers remain inert with zero IDs and rejected native cancellation", () => {
    const e = setup(), schedule = e.g.$.Schedule, cancel = e.g.$.CancelScheduled, callbacks = [];
    let cancelled = 0;
    e.g.$.Schedule = (delay, callback) => {
        if (delay === 0.6) { callbacks.push(callback); return 0; }
        return schedule(delay, callback);
    };
    e.g.$.CancelScheduled = handle => { if (handle === 0) { cancelled++; throw new Error("native cancellation failed"); } cancel(handle); };
    e.edit({ AUTO_SAVE_CHANGES: 1 }); e.edit({ SOULS_X_OFFSET: 112 });
    assert.equal(callbacks.length, 2); callbacks[0]();
    assert.equal(e.requests.length, 0);
    callbacks[1](); assert.equal(e.requests.length, 1);
    assert.equal(e.requests[0].config.SOULS_X_OFFSET, 112); assert.equal(cancelled, 1);
});

test("published origin/main Preview on/off configs restore and import without enabling Auto-Save", () => {
    const fixture = require("./fixtures/main_preview_retirement.json");
    const { global: g, hud } = load();
    for (const sample of fixture.cases) {
        const restored = g.QOL.parseStoredConfig(sample.storage);
        assert.equal(restored.TOP_BAR_SCALE, 1.25); assert.equal(restored.SOULS_X_OFFSET, 87);
        assert.equal(restored.AUTO_SAVE_CHANGES, 0); assert.equal(Object.hasOwn(restored, "PREVIEWS_ENABLED"), false);
        const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(sample.code);
        assert.equal(imported.ok, true);
        assert.equal(imported.candidateConfig.TOP_BAR_SCALE, 1.25);
        assert.equal(imported.candidateConfig.AUTO_SAVE_CHANGES, 0);
        assert.equal(Object.hasOwn(imported.candidateConfig, "PREVIEWS_ENABLED"), false);
        const payload = g.QOL.persistence.fromBase64Url(sample.code.split(":")[1]);
        assert.equal(g.QOL_CODEC.DeserializeLegacySettings(payload, "4.0.5").PREVIEWS_ENABLED, sample.preview,
            "the original compact slot still decodes both historical values");
        const other = hud.sandbox.global;
        const restoredInHud = other.QOL.parseStoredConfig(other.WrapConfigForStorage(other.QOL.core.codec.deserializeSettings(payload)));
        assert.equal(restoredInHud.AUTO_SAVE_CHANGES, 0);
        assert.equal(Object.hasOwn(restoredInHud, "PREVIEWS_ENABLED"), false);
    }
});

test("rendered Auto-Save control localizes, toggles and appears in real search collection", () => {
    for (const [language, expected] of [[0, "Auto-Save Changes"], [1, "Автосохранение изменений"], [5, "Auto-Save Changes"]]) {
        const e = setup(), g = e.g;
        g.MOD_CONFIG.LANGUAGE = language;
        g.QOL.ui.configTab.render(e.list);
        const row = e.list.FindChildrenWithClassTraverse("SettingRow_AUTO_SAVE_CHANGES")[0];
        assert.ok(row); assert.equal(row.FindChildrenWithClassTraverse("SettingLabel")[0].text, expected);
        row.FindChildrenWithClassTraverse("SwitchButton")[0].activate();
        assert.equal(g.MOD_CONFIG.AUTO_SAVE_CHANGES, 1); e.clock.advance(1000);
        assert.equal(e.requests.length, 1); assert.equal(e.requests[0].config.AUTO_SAVE_CHANGES, 1);
        g.gSearchCollectMode = true; g.gSearchCollectState = { sections: [] };
        g.QOL.ui.configTab.render(e.list);
        const rows = g.gSearchCollectState.sections.flatMap(section => section.rows);
        assert.equal(rows.filter(item => item.configId === "AUTO_SAVE_CHANGES").length, 1);
        assert.equal(rows.filter(item => item.configId === "PREVIEWS_ENABLED").length, 0);
    }
});
