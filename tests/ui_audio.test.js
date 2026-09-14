// tests/ui_audio.test.js
// =============================================================================
// Unit tests for Audio & Announcer subsystem (panorama/scripts/ui/audio.js)
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
            MOD_CONFIG: {
                VOICE_TYPE: 4,
                VOICE_VOLUME: 75,
                DL4D_VOLUME: 60,
                ENABLE_DL4D_REMINDERS: 1,
            },
            LocalizeSettingsText: (t) => t,
            NormalizeVoiceTypeValue: (v) => Math.round(Number(v) || 0),
            NormalizeVoiceVolumeValue: (v) => Math.round(Number(v) || 50),
            CreateSectionTitle: (parent, title) => {
                const p = mockDollar.CreatePanel("Panel", parent, "");
                const lbl = mockDollar.CreatePanel("Label", p, "");
                lbl.text = title;
                return p;
            },
            CreateRow: (parent, label, key, type, min, max, step, options) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                r.AddClass("SettingRow");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
            CreateSliderRow: (parent, label, key, shape) => {
                const r = mockDollar.CreatePanel("Panel", parent, "");
                r.AddClass("SettingSliderRow");
                const l = mockDollar.CreatePanel("Label", r, "");
                l.text = label;
                return r;
            },
            CreateSeparator: (parent) => {
                return mockDollar.CreatePanel("Panel", parent, "");
            },
            CreateAnimatedInlineToggleSection: (parent, title, key, desc, cb) => {
                const wrap = mockDollar.CreatePanel("Panel", parent, "");
                const body = mockDollar.CreatePanel("Panel", wrap, "");
                if (typeof cb === "function") cb(body);
                return wrap;
            },
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const audioCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/audio.js"),
        "utf8"
    );
    vm.runInNewContext(audioCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        dispatchedEvents,
        getRegisteredTab: () => ({ name: registeredTabName, renderer: registeredTabRenderer }),
    };
}

test("ui/audio: exports public API on QOL.ui.audio and globalThis", () => {
    const env = createTestEnvironment();
    const audio = env.sandbox.QOL.ui.audio;

    assert.ok(audio, "QOL.ui.audio should be defined");
    assert.strictEqual(typeof audio.getAnnouncerVoiceToken, "function");
    assert.strictEqual(typeof audio.buildVoiceDropdownOptions, "function");
    assert.strictEqual(typeof audio.playAnnouncerPreviewSound, "function");
    assert.strictEqual(typeof audio.playDl4dReminderPreviewSound, "function");
    assert.strictEqual(typeof audio.createDl4dReminderRow, "function");
    assert.strictEqual(typeof audio.render, "function");
    assert.ok(Array.isArray(audio.DL4D_REMINDER_OPTIONS));

    assert.strictEqual(typeof env.sandbox.globalThis.GetAnnouncerVoiceToken, "function");
    assert.strictEqual(typeof env.sandbox.globalThis.PlayAnnouncerPreviewSound, "function");
    assert.strictEqual(typeof env.sandbox.globalThis.PlayDl4dReminderPreviewSound, "function");
});

test("ui/audio: getAnnouncerVoiceToken maps voice types accurately", () => {
    const env = createTestEnvironment();
    const audio = env.sandbox.QOL.ui.audio;

    assert.strictEqual(audio.getAnnouncerVoiceToken(4), "Beep");
    assert.strictEqual(audio.getAnnouncerVoiceToken(5), "Custom_Slot2");
    assert.strictEqual(audio.getAnnouncerVoiceToken(6), "Custom_Slot3");
    assert.strictEqual(audio.getAnnouncerVoiceToken(7), "Custom_Slot4");
    assert.strictEqual(audio.getAnnouncerVoiceToken(8), "Custom_Slot5");
    assert.strictEqual(audio.getAnnouncerVoiceToken(0), "Custom_Slot1");
    assert.strictEqual(audio.getAnnouncerVoiceToken(-1), "Custom_Slot1");
});

test("ui/audio: custom announcer metadata resolution and dropdown builder", () => {
    const env = createTestEnvironment();
    const audio = env.sandbox.QOL.ui.audio;

    // Populate a test custom announcer pack in slot 2
    env.sandbox.globalThis.QOL_CUSTOM_ANNOUNCER_SLOT2_META = {
        name: "Glados Pack",
        author: "Aperture",
        voiceActor: "Ellen McLain"
    };

    const label = audio.resolveCustomAnnouncerSlotLabel(2, "Default");
    assert.strictEqual(label, "Glados Pack");

    const meta = audio.resolveCustomAnnouncerSlotMetadata(2);
    assert.strictEqual(meta.name, "Glados Pack");
    assert.strictEqual(meta.author, "Aperture");
    assert.strictEqual(meta.voiceActor, "Ellen McLain");

    const tooltip = audio.buildCustomAnnouncerSlotMetadataTooltipText(2);
    assert.ok(tooltip.includes("Author: Aperture"));
    assert.ok(tooltip.includes("Voice Actor: Ellen McLain"));

    const options = audio.buildVoiceDropdownOptions();
    assert.strictEqual(options.length, 6);
    assert.strictEqual(options[0].label, "Beep");
    assert.strictEqual(options[0].value, 4);
    assert.strictEqual(options[2].label, "Glados Pack");
    assert.strictEqual(options[2].value, 5);
});

test("ui/audio: preview sound event generation and playback dispatch", () => {
    const env = createTestEnvironment();
    const audio = env.sandbox.QOL.ui.audio;

    // VOICE_TYPE is 4 (Beep), VOICE_VOLUME is 75
    const previewEvent = audio.buildAnnouncerPreviewEventName();
    assert.strictEqual(previewEvent, "BuffReminder.Beep");

    const resolvedVolume = audio.resolveAnnouncerEventForVolume(previewEvent);
    assert.strictEqual(resolvedVolume, "BuffReminder.Beep_V75");

    audio.playAnnouncerPreviewSound();
    assert.strictEqual(env.dispatchedEvents.length, 1);
    assert.strictEqual(env.dispatchedEvents[0].eventName, "PlaySoundEffect");
    assert.strictEqual(env.dispatchedEvents[0].arg, "BuffReminder.Beep_V75");

    // DL4D volume preview
    audio.playDl4dReminderPreviewSound("QOL.DL4D.SmallCampsBoxes");
    assert.strictEqual(env.dispatchedEvents.length, 2);
    assert.strictEqual(env.dispatchedEvents[1].eventName, "PlaySoundEffect");
    assert.strictEqual(env.dispatchedEvents[1].arg, "QOL.DL4D.SmallCampsBoxes_V60");
});

test("ui/audio: createDl4dReminderRow constructs row with sound test button", () => {
    const env = createTestEnvironment();
    const audio = env.sandbox.QOL.ui.audio;
    const parent = env.doc.create("Panel", { id: "TestContainer" });

    const reminder = audio.DL4D_REMINDER_OPTIONS[0]; // Small Camps + Boxes
    const row = audio.createDl4dReminderRow(parent, reminder);

    assert.ok(row, "Row should be returned");
    assert.ok(row.BHasClass("DL4DReminderRow"));

    // Find the test button inside the row
    const testBtn = row.FindChildrenWithClassTraverse("DL4DReminderTestBtn")[0];
    assert.ok(testBtn, "Test button should exist inside row");

    // Trigger activation of test button
    testBtn.activate();
    assert.ok(env.dispatchedEvents.some((e) => e.eventName === "PlaySoundEffect" && e.arg === "QOL.DL4D.SmallCampsBoxes_V60"));
});

test("ui/audio: render constructs full audio tab with DL4D reminders", () => {
    const env = createTestEnvironment();
    const audio = env.sandbox.QOL.ui.audio;
    const list = env.doc.create("Panel", { id: "SettingsList" });

    audio.render(list);

    // Verify sections were created
    const rows = list.FindChildrenWithClassTraverse("SettingRow");
    assert.ok(rows.length > 0, "Settings rows should be created");

    const dl4dRows = list.FindChildrenWithClassTraverse("DL4DReminderRow");
    assert.strictEqual(dl4dRows.length, audio.DL4D_REMINDER_OPTIONS.length, "All 11 DL4D reminder rows should be rendered");

    // Verify registered tab
    const reg = env.getRegisteredTab();
    assert.strictEqual(reg.name, "Audio");
    assert.strictEqual(typeof reg.renderer, "function");
});
