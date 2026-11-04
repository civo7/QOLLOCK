"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const loadSettings = require("./load_settings_environment");
const { setImmediate: flush } = require("node:timers/promises");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Native storage and rendering are modeled; exercise the production settings owner.
function setup(disk = new Map()) {
    const e = loadSettings(), g = e.global, Q = g.QOL;
    e.hud.sandbox.global.QOL.core.App.shutdown();
    Q.core.storageBridge = {
        load: async key => disk.get(key) ?? null,
        save: async (key, value) => { disk.set(key, value); },
        remove: async key => { disk.delete(key); },
        clearSettings: async () => { disk.delete("qollock_settings"); }
    };
    return Object.assign(e, { Q, p: Q.ui.presets, disk });
}

function activeMenuAction(e, className) {
    const layer = e.em.FindChildrenWithClassTraverse("PersonalPresetMenuLayer").find(panel => panel.visible);
    assert.ok(layer, "the menu must be outside the clipped list");
    return layer.FindChildrenWithClassTraverse(className)[0];
}

test("personal presets persist independent named snapshots and require explicit replacement", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    await e.p.savePersonalPreset("  Мой HUD  ", g.MOD_CONFIG);
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    await assert.rejects(e.p.savePersonalPreset("мой hud", g.MOD_CONFIG));
    let entries = await e.p.readPersonalPresets();
    assert.equal(entries[0].name, "Мой HUD");
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).SOULS_X_OFFSET, 123);
    await e.p.savePersonalPreset("мой hud", g.MOD_CONFIG, true);
    entries = await setup(e.disk).p.readPersonalPresets();
    assert.equal(entries.length, 1);
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).SOULS_X_OFFSET, 456);
    await e.p.deletePersonalPreset(entries[0].name);
    assert.equal((await e.p.readPersonalPresets()).length, 0);
    assert.equal(e.disk.has("qollock_settings"), false, "personal collection never replaces the main settings save");
});

test("personal presets reject invalid names, corrupt storage and failed writes without changing live config", async () => {
    const e = setup(), before = JSON.stringify(e.global.MOD_CONFIG);
    await assert.rejects(e.p.savePersonalPreset(" ", e.global.MOD_CONFIG));
    await assert.rejects(e.p.savePersonalPreset("x\ny", e.global.MOD_CONFIG));
    await e.p.savePersonalPreset("Good", e.global.MOD_CONFIG);
    const saved = Array.from(e.disk.values())[0];
    e.Q.core.storageBridge.save = async () => { throw Error("quota"); };
    await assert.rejects(e.p.savePersonalPreset("Other", e.global.MOD_CONFIG), /quota/);
    assert.equal(Array.from(e.disk.values())[0], saved);
    e.Q.core.storageBridge.load = async () => '[{"name":"Bad","raw":"broken"}]';
    await assert.rejects(e.p.readPersonalPresets());
    assert.equal(JSON.stringify(e.global.MOD_CONFIG), before);
});

test("personal preset UI loads only on confirmation and preserves live UI preferences", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    await e.p.savePersonalPreset("My HUD", g.MOD_CONFIG);
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    g.MOD_CONFIG.DRAG_ENABLED = 0;
    g.MOD_CONFIG.AUTO_SAVE_CHANGES = 0;
    let preview;
    g.OpenConfigDiffPreviewModal = options => { preview = options; };
    e.p.renderPresetsTab(e.list);
    await flush();
    const section = e.list.FindChildTraverse("PersonalPresetsSection");
    section.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].activate();
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 456);
    assert.ok(preview.rows.some(row => row.key === "SOULS_X_OFFSET"));
    assert.equal(preview.onApply(), true);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 123);
    assert.equal(g.MOD_CONFIG.DRAG_ENABLED, 0);
    assert.equal(g.MOD_CONFIG.AUTO_SAVE_CHANGES, 0);
    assert.deepEqual(e.clock.errors, []);
});

test("new preset waits for acknowledgment, rejects duplicate names and deletes without another confirmation", async () => {
    const e = setup(), g = e.global;
    e.p.renderPresetsTab(e.list); await flush();
    const section = e.list.FindChildTraverse("PersonalPresetsSection");
    section.FindChildTraverse("PersonalPresetName").text = "Mine";
    let acknowledge;
    e.Q.core.storageBridge.save = (key, value) => new Promise(resolve => {
        acknowledge = () => { e.disk.set(key, value); resolve(); };
    });
    section.FindChildTraverse("PersonalPresetSave").activate(); await flush();
    assert.equal(section.FindChildrenWithClassTraverse("PersonalPresetLoad").length, 0);
    assert.equal(section.FindChildTraverse("PersonalPresetSave").enabled, false);
    acknowledge(); await flush();
    assert.equal(section.FindChildrenWithClassTraverse("PersonalPresetLoad").length, 1);
    const original = e.disk.get("qollock_personal_presets");
    g.MOD_CONFIG.SOULS_X_OFFSET = 300;
    section.FindChildTraverse("PersonalPresetSave").activate(); await flush();
    assert.equal(e.disk.get("qollock_personal_presets"), original);
    assert.equal(section.FindChildTraverse("PersonalPresetsStatus").BHasClass("FailureState"), true);
    section.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    activeMenuAction(e, "PersonalPresetDelete").activate(); await flush();
    assert.equal(e.disk.get("qollock_personal_presets"), original);
    acknowledge(); await flush();
    assert.equal((await e.p.readPersonalPresets()).length, 0);
    let finishRead;
    e.Q.core.storageBridge.load = key => key === "qollock_personal_presets" ? new Promise(resolve => { finishRead = resolve; }) : Promise.resolve(null);
    e.p.renderPresetsTab(e.list);
    const retired = e.list.Children().at(-1);
    await flush(); e.list.RemoveAndDeleteChildren(); finishRead(original); await flush();
    assert.equal(retired.IsValid(), false);
    assert.deepEqual(e.clock.errors, []);
    assert.deepEqual(e.doc.eventErrors, []);
});

test("personal UI localizes English/Russian, falls back for missing locales, and keeps names as data", async () => {
    const e = setup(), g = e.global;
    await e.p.savePersonalPreset("Cancel", g.MOD_CONFIG);
    for (const [language, title, load, startup] of [
        [0, "Personal Presets", "Load", "Use at Startup"], [1, "Личные пресеты", "Загрузить", "Загружать при запуске"], [13, "Personal Presets", "Load", "Use at Startup"]
    ]) {
        g.MOD_CONFIG.LANGUAGE = language;
        e.list.RemoveAndDeleteChildren();
        e.p.renderPresetsTab(e.list);
        await flush();
        const section = e.list.FindChildTraverse("PersonalPresetsSection");
        assert.equal(section.FindChildrenWithClassTraverse("SectionTitle")[0].text, title);
        assert.equal(section.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].Children()[0].text, load);
        assert.equal(section.FindChildrenWithClassTraverse("PersonalPresetTitle").at(-1).text, "Cancel");
        assert.equal(section.FindChildrenWithClassTraverse("PersonalPresetStartup")[0].GetChild(0).text, startup);
    }
});

test("failed initial read disables saving and stale load confirmations cannot apply", async () => {
    const e = setup(), g = e.global;
    await e.p.savePersonalPreset("Mine", g.MOD_CONFIG);
    let preview;
    g.OpenConfigDiffPreviewModal = options => { preview = options; };
    e.p.renderPresetsTab(e.list);
    await flush();
    e.list.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].activate();
    e.list.RemoveAndDeleteChildren();
    const before = JSON.stringify(g.MOD_CONFIG);
    assert.equal(preview.onApply(), false);
    assert.equal(JSON.stringify(g.MOD_CONFIG), before);
    e.Q.core.storageBridge.load = async () => { throw Error("offline"); };
    e.p.renderPresetsTab(e.list);
    await flush();
    assert.equal(e.list.FindChildTraverse("PersonalPresetSave").enabled, false);
    assert.equal(e.list.FindChildTraverse("PersonalPresetsStatus").BHasClass("FailureState"), true);
});

test("startup action saves the selected snapshot rather than current settings", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    await e.p.savePersonalPreset("Mine", g.MOD_CONFIG);
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    let saved, acknowledge;
    e.Q.core.storageBridge.saveStartupSettings = raw => new Promise(resolve => {
        saved = raw;
        acknowledge = resolve;
    });
    e.p.renderPresetsTab(e.list);
    await flush();
    const section = e.list.FindChildTraverse("PersonalPresetsSection");
    assert.equal(section.FindChildrenWithClassTraverse("PersonalPresetReplace").length, 0);
    section.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    activeMenuAction(e, "PersonalPresetStartup").activate();
    await flush();
    assert.equal(e.Q.parseStoredConfig(saved).SOULS_X_OFFSET, 123);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 456);
    assert.equal(section.FindChildTraverse("PersonalPresetsStatus").text, "Working...");
    acknowledge({ ok: true });
    await flush();
    assert.equal(section.FindChildTraverse("PersonalPresetsStatus").text, "Preset saved for startup.");
    assert.deepEqual(e.doc.eventErrors, []);
});

test("main users get their existing save as an ordinary My config preset without a service row", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    const original = g.WrapConfigForStorage(g.MOD_CONFIG);
    e.disk.set("qollock_settings", original);
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    await e.p.savePersonalPreset("Mine", g.MOD_CONFIG);
    e.p.renderPresetsTab(e.list); await flush();
    const entries = await e.p.readPersonalPresets();
    assert.deepEqual(Array.from(entries, entry => entry.name), ["Mine", "My config"]);
    assert.equal(e.Q.parseStoredConfig(entries[1].raw).SOULS_X_OFFSET, 123);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 456, "migration must not apply a snapshot");
    assert.equal(e.disk.get("qollock_settings"), original);
    assert.equal(e.list.FindChildrenWithClassTraverse("PersonalPresetLoad").length, 2);
    assert.equal(!!e.list.FindChildTraverse("PersonalPresetDefault"), false);
    const restarted = setup(e.disk);
    restarted.p.renderPresetsTab(restarted.list); await flush();
    assert.equal((await restarted.p.readPersonalPresets()).length, 2);
    const badges = restarted.list.FindChildrenWithClassTraverse("PersonalPresetStartupBadge");
    assert.deepEqual(badges.map(badge => badge.visible), [false, true]);
});

test("footer Save creates My config without replacing a colliding name and updates its own entry", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 11;
    await e.p.savePersonalPreset("My config", g.MOD_CONFIG);
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    await e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    let entries = await e.p.readPersonalPresets();
    assert.deepEqual(Array.from(entries, entry => entry.name), ["My config", "My config 2"]);
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).SOULS_X_OFFSET, 11);
    assert.equal(e.Q.parseStoredConfig(entries[1].raw).SOULS_X_OFFSET, 123);
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    await e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    entries = await e.p.readPersonalPresets();
    assert.equal(entries.length, 2);
    assert.equal(e.Q.parseStoredConfig(entries[1].raw).SOULS_X_OFFSET, 456, "Save updates its owned preset");
});

test("a delayed main save read cannot migrate over a newer acknowledged save", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    const oldRaw = g.WrapConfigForStorage(g.MOD_CONFIG);
    let finishRead;
    e.Q.core.storageBridge.load = key => key === "qollock_settings" ? new Promise(resolve => { finishRead = resolve; }) : Promise.resolve(e.disk.get(key) ?? null);
    e.p.renderPresetsTab(e.list);
    g.MOD_CONFIG.SOULS_X_OFFSET = 789;
    await e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    finishRead(oldRaw); await flush();
    const entries = await e.p.readPersonalPresets();
    assert.equal(entries.length, 1);
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).SOULS_X_OFFSET, 789);
});

test("personal menu toggles one row at a time and renames without changing snapshots", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    await e.p.savePersonalPreset("First", g.MOD_CONFIG);
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    await e.p.savePersonalPreset("Second", g.MOD_CONFIG);
    const original = (await e.p.readPersonalPresets())[0].raw;
    e.p.renderPresetsTab(e.list); await flush();
    const menus = e.list.FindChildrenWithClassTraverse("PersonalPresetMenu");
    assert.equal(menus[0].GetParent().BHasClass("PersonalPresetMenuAnchor"), true);
    const more = e.list.FindChildrenWithClassTraverse("PersonalPresetMore");
    assert.equal(menus[0].visible, false);
    more[0].activate();
    assert.equal(menus[0].visible, true);
    more[1].activate();
    assert.equal(menus[0].visible, false);
    assert.equal(menus[1].visible, true);
    more[1].activate();
    assert.equal(menus[1].visible, false);
    more[0].activate();
    activeMenuAction(e, "PersonalPresetRename").activate();
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameInput")[0].text = "Discard";
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameCancel")[0].activate();
    assert.equal((await e.p.readPersonalPresets())[0].name, "First");
    more[0].activate();
    activeMenuAction(e, "PersonalPresetRename").activate();
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameInput")[0].text = "Second";
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameSave")[0].activate(); await flush();
    assert.equal((await e.p.readPersonalPresets()).length, 2, "duplicate rename cannot replace another preset");
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameInput")[0].text = "Renamed";
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameSave")[0].activate(); await flush();
    const entries = await e.p.readPersonalPresets();
    assert.equal(entries[0].name, "Renamed");
    assert.equal(entries[0].raw, original);
    assert.equal(entries[1].name, "Second");
    assert.equal(e.Q.parseStoredConfig(entries[1].raw).SOULS_X_OFFSET, 456);
    assert.deepEqual(e.doc.eventErrors, []);
});

test("saving a matching snapshot for startup preserves its active row and tracks startup independently", async () => {
    const e = setup(), g = e.global;
    await e.p.savePersonalPreset("Mine", g.MOD_CONFIG);
    e.Q.core.storageBridge.saveStartupSettings = async raw => { e.disk.set("qollock_settings", raw); };
    e.p.renderPresetsTab(e.list); await flush();
    e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    activeMenuAction(e, "PersonalPresetStartup").activate(); await flush();
    const row = e.list.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].GetParent();
    assert.equal(row.BHasClass("PresetActive"), true);
    assert.equal(!!e.list.FindChildTraverse("PersonalPresetDefault"), false);
    assert.equal(row.FindChildrenWithClassTraverse("PersonalPresetStartupBadge")[0].visible, true);
    g.MOD_CONFIG.SOULS_X_OFFSET = 999;
    e.p.refreshActivePresetHighlight();
    assert.equal(row.BHasClass("PresetActive"), false);
    assert.equal(row.FindChildrenWithClassTraverse("PersonalPresetStartupBadge")[0].visible, true);
    assert.equal(e.list.FindChildrenWithClassTraverse("PersonalPresetUpdate").length, 0);
    await e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    const updatedRow = e.list.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].GetParent();
    assert.equal(e.Q.parseStoredConfig((await e.p.readPersonalPresets())[0].raw).SOULS_X_OFFSET, 999);
    assert.equal(updatedRow.BHasClass("PresetActive"), true);
    assert.equal(updatedRow.FindChildrenWithClassTraverse("PersonalPresetStartupBadge")[0].visible, true);
});


test("identical snapshots have only the explicitly chosen startup badge across restarts and rename", async () => {
    const e = setup(), g = e.global;
    await e.p.savePersonalPreset("BananaPreset", g.MOD_CONFIG);
    await e.p.savePersonalPreset("MinimalPreset", g.MOD_CONFIG);
    e.Q.core.storageBridge.saveStartupSettings = async raw => { e.disk.set("qollock_settings", raw); };
    e.p.renderPresetsTab(e.list); await flush();
    e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[1].activate();
    activeMenuAction(e, "PersonalPresetStartup").activate(); await flush();
    const visible = env => env.list.FindChildrenWithClassTraverse("PersonalPresetStartupBadge").filter(b => b.visible).map(b => b.GetParent().FindChildrenWithClassTraverse("PersonalPresetTitle")[0].text);
    assert.deepEqual(visible(e), ["MinimalPreset"]);
    const restarted = setup(e.disk);
    restarted.p.renderPresetsTab(restarted.list); await flush();
    assert.deepEqual(visible(restarted), ["MinimalPreset"]);
    restarted.list.FindChildrenWithClassTraverse("PersonalPresetMore")[1].activate();
    activeMenuAction(restarted, "PersonalPresetRename").activate();
    restarted.list.FindChildrenWithClassTraverse("PersonalPresetRenameInput")[1].text = "Renamed";
    restarted.list.FindChildrenWithClassTraverse("PersonalPresetRenameSave")[1].activate(); await flush();
    assert.deepEqual(visible(restarted), ["Renamed"]);
    restarted.list.FindChildrenWithClassTraverse("PersonalPresetMore")[1].activate();
    activeMenuAction(restarted, "PersonalPresetDelete").activate(); await flush();
    assert.deepEqual(visible(restarted), []);
});


test("an interrupted first snapshot capture retries without duplicating or replacing the original", async () => {
    const e = setup(), g = e.global;
    const save = e.Q.core.storageBridge.save;
    e.Q.core.storageBridge.save = async (key, value) => {
        if (key === "qollock_personal_presets_state") throw Error("quota");
        await save(key, value);
    };
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    const raw = g.WrapConfigForStorage(e.Q.parseStoredConfig(g.WrapConfigForStorage(g.MOD_CONFIG)));
    await assert.rejects(e.p.onDefaultSaved(raw), /quota/);
    assert.equal((await e.p.readPersonalPresets()).length, 1);
    e.Q.core.storageBridge.save = save;
    await e.p.onDefaultSaved(raw);
    const entries = await e.p.readPersonalPresets();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "My config");
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).SOULS_X_OFFSET, 123);
});


test("footer capture serializes behind an in-flight personal save without losing either entry", async () => {
    const e = setup(), g = e.global;
    let acknowledge;
    e.Q.core.storageBridge.save = (key, value) => new Promise(resolve => {
        acknowledge = () => { e.disk.set(key, value); resolve(); };
    });
    const manual = e.p.savePersonalPreset("Manual", g.MOD_CONFIG);
    await flush();
    const capture = e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    e.Q.core.storageBridge.save = async (key, value) => { e.disk.set(key, value); };
    acknowledge();
    await Promise.all([manual, capture]);
    assert.deepEqual(Array.from(await e.p.readPersonalPresets(), entry => entry.name), ["Manual", "My config"]);
});


test("two queued footer saves retain one entry with the latest saved settings", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    const first = e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    const second = e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    await Promise.all([first, second]);
    const entries = await e.p.readPersonalPresets();
    assert.equal(entries.length, 1);
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).SOULS_X_OFFSET, 456);
});


test("deleting the startup My config clears main storage and preserves live settings and other presets", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    g.MOD_CONFIG.DRAG_ENABLED = 0;
    g.MOD_CONFIG.AUTO_SAVE_CHANGES = 0;
    e.disk.set("qollock_settings", g.WrapConfigForStorage(g.MOD_CONFIG));
    await e.p.onDefaultSaved(e.disk.get("qollock_settings"));
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    await e.p.savePersonalPreset("Other", g.MOD_CONFIG);
    e.p.renderPresetsTab(e.list); await flush();
    e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    const beforeDelete = JSON.stringify(g.MOD_CONFIG);
    activeMenuAction(e, "PersonalPresetDelete").activate(); await flush();
    assert.equal(JSON.stringify(g.MOD_CONFIG), beforeDelete);
    assert.equal(e.disk.has("qollock_settings"), false);
    assert.equal(e.disk.has("qollock_personal_presets_state"), false);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 456);
    assert.equal(g.MOD_CONFIG.DRAG_ENABLED, 0);
    assert.equal(g.MOD_CONFIG.AUTO_SAVE_CHANGES, 0);
    const remaining = await e.p.readPersonalPresets();
    assert.deepEqual(Array.from(remaining, entry => entry.name), ["Other"]);
    assert.equal(e.Q.parseStoredConfig(remaining[0].raw).SOULS_X_OFFSET, 456);
    const restarted = setup(e.disk);
    restarted.p.renderPresetsTab(restarted.list); await flush();
    assert.equal((await restarted.p.readPersonalPresets()).length, 1, "opening without a main save cannot recreate My config");
    restarted.global.MOD_CONFIG.SOULS_X_OFFSET = 789;
    const raw = restarted.global.WrapConfigForStorage(restarted.global.MOD_CONFIG);
    restarted.disk.set("qollock_settings", raw);
    await restarted.p.onDefaultSaved(raw);
    assert.deepEqual(Array.from(await restarted.p.readPersonalPresets(), entry => entry.name), ["My config", "Other"]);
    const before = restarted.disk.get("qollock_settings");
    await restarted.p.deletePersonalPreset("Other");
    assert.equal(restarted.disk.get("qollock_settings"), before, "ordinary presets do not clear the main save");
    assert.equal(restarted.global.MOD_CONFIG.SOULS_X_OFFSET, 789);
    assert.deepEqual(e.doc.eventErrors, []);
    assert.deepEqual(restarted.doc.eventErrors, []);
});


test("startup deletion failure preserves the preset and live config; late completion preserves newer edits", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    const raw = g.WrapConfigForStorage(g.MOD_CONFIG);
    e.disk.set("qollock_settings", raw);
    await e.p.onDefaultSaved(raw);
    e.Q.core.storageBridge.clearSettings = async () => { throw Error("offline"); };
    await assert.rejects(e.p.deletePersonalPreset("My config"), /offline/);
    assert.equal((await e.p.readPersonalPresets()).length, 1);
    assert.equal(e.disk.get("qollock_settings"), raw);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 123);
    let acknowledge;
    e.Q.core.storageBridge.clearSettings = () => new Promise(resolve => {
        acknowledge = () => { e.disk.delete("qollock_settings"); resolve(); };
    });
    const deleting = e.p.deletePersonalPreset("My config");
    await flush();
    g.MOD_CONFIG.SOULS_X_OFFSET = 456;
    acknowledge();
    await deleting;
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 456);
    assert.equal(e.disk.has("qollock_settings"), false);
    assert.equal((await e.p.readPersonalPresets()).length, 0);
});

test("a save notification queued before clearing cannot resurrect the deleted original", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    const capturing = e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    await e.p.onDefaultSaved(null, false);
    await capturing;
    assert.equal((await e.p.readPersonalPresets()).length, 0);
});


test("failed rename metadata finalization recovers startup identity before deleting the renamed main preset", async () => {
    const e = setup(), g = e.global;
    const raw = g.WrapConfigForStorage(g.MOD_CONFIG);
    e.disk.set("qollock_settings", raw);
    await e.p.onDefaultSaved(raw);
    e.p.renderPresetsTab(e.list); await flush();
    const save = e.Q.core.storageBridge.save;
    e.Q.core.storageBridge.save = async (key, value) => {
        if (key === "qollock_personal_presets_state" && JSON.parse(value).startupName === "Renamed") throw Error("quota");
        await save(key, value);
    };
    e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    activeMenuAction(e, "PersonalPresetRename").activate();
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameInput")[0].text = "Renamed";
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameSave")[0].activate(); await flush();
    e.Q.core.storageBridge.save = save;
    await e.p.deletePersonalPreset("Renamed");
    assert.equal(e.disk.has("qollock_settings"), false);
    assert.equal((await e.p.readPersonalPresets()).length, 0);
});

test("failed main metadata removal leaves a retryable preset and next successful delete re-arms first Save", async () => {
    const e = setup(), g = e.global;
    const raw = g.WrapConfigForStorage(g.MOD_CONFIG);
    e.disk.set("qollock_settings", raw);
    await e.p.onDefaultSaved(raw);
    const remove = e.Q.core.storageBridge.remove;
    e.Q.core.storageBridge.remove = async () => { throw Error("offline"); };
    await assert.rejects(e.p.deletePersonalPreset("My config"), /offline/);
    assert.equal((await e.p.readPersonalPresets()).length, 1);
    e.Q.core.storageBridge.remove = remove;
    await e.p.deletePersonalPreset("My config");
    await e.p.onDefaultSaved(raw);
    assert.deepEqual(Array.from(await e.p.readPersonalPresets(), entry => entry.name), ["My config"]);
});


test("failed collection deletion after clearing main preserves live settings and remains retryable", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    const raw = g.WrapConfigForStorage(g.MOD_CONFIG);
    e.disk.set("qollock_settings", raw);
    await e.p.onDefaultSaved(raw);
    const save = e.Q.core.storageBridge.save;
    e.Q.core.storageBridge.save = async (key, value) => {
        if (key === "qollock_personal_presets") throw Error("quota");
        await save(key, value);
    };
    await assert.rejects(e.p.deletePersonalPreset("My config"), /quota/);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 123);
    assert.equal((await e.p.readPersonalPresets()).length, 1);
    e.Q.core.storageBridge.save = save;
    await e.p.deletePersonalPreset("My config");
    assert.equal((await e.p.readPersonalPresets()).length, 0);
    assert.equal(e.disk.has("qollock_settings"), false);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 123);
});


// Run the shipped bridge page against the real settings Save button and owner.
function connectSavePage(e, disk, failKey = "") {
    const bridge = e.global.QOL.core.storageBridge;
    bridge.enableAutoload(false);
    const panel = bridge.getPanel();
    const page = {
        atob: value => Buffer.from(value, "base64").toString("binary"),
        navigator: {}, crypto: require("node:crypto").webcrypto, location: { hash: "" }, document: {},
        localStorage: {
            getItem: key => disk.get(key) ?? null,
            setItem: (key, value) => { if (key === failKey) throw Error("quota"); disk.set(key, String(value)); },
            removeItem: key => disk.delete(key)
        },
        setTimeout: (callback, ms) => e.clock.schedule(ms / 1000, callback),
        addEventListener: (_name, callback) => { page.hashchange = callback; }
    };
    page.window = page.self = page.top = page;
    Object.defineProperty(page.document, "title", {
        set: title => { e.clock.schedule(0, () => bridge._onHtmlTitle(panel, title)); }
    });
    panel.SetURL = url => {
        const hash = url.indexOf("#");
        if (hash < 0) return;
        page.location.hash = url.slice(hash);
        e.clock.schedule(0, () => page.hashchange());
    };
    const script = fs.readFileSync(path.join(__dirname, "fixtures/qollock_bridge.html"), "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(script, page);
    return async () => { for (let i = 0; i < 35; i++) { e.clock.advance(0); await flush(); } };
}

test("fresh install footer Save creates My config through the real CEF page before visiting Presets", async () => {
    const e = loadSettings(), g = e.global, disk = new Map();
    e.hud.sandbox.global.QOL.core.App.shutdown();
    const drain = connectSavePage(e, disk);
    g.currentTab = "HUD";
    g.QOL.ui.window.buildUI();
    g.QOL.ui.window.setOpen(true); e.clock.advance(500);
    g.MOD_CONFIG.HEALTHBAR_TYPE = 1;
    const footer = e.em.FindChildTraverse("FooterSaveBuildButton");
    footer.activate(); await drain();
    assert.equal(footer.FindChildTraverse("TabLabel").text, "SAVED");
    g.QOL.ui.window.setActiveTabAndRefresh("Presets"); e.clock.advance(200); await drain();
    const entries = await (async () => { const loading = g.QOL.ui.presets.readPersonalPresets(); await drain(); return loading; })();
    assert.deepEqual(Array.from(entries, entry => entry.name), ["My config"]);
    assert.equal(g.QOL.parseStoredConfig(entries[0].raw).HEALTHBAR_TYPE, 1);
    assert.equal(e.em.FindChildrenWithClassTraverse("PersonalPresetLoad").length, 1);
    assert.deepEqual(e.doc.eventErrors, []);
    assert.deepEqual(e.clock.errors, []);
});

test("saving another personal profile preserves startup until explicitly selected", async () => {
    const e = loadSettings(), g = e.global, disk = new Map();
    e.hud.sandbox.global.QOL.core.App.shutdown();
    const drain = connectSavePage(e, disk);
    g.currentTab = "HUD";
    g.QOL.ui.window.buildUI();
    g.QOL.ui.window.setOpen(true); e.clock.advance(500);
    g.MOD_CONFIG.HEALTHBAR_TYPE = 1;
    const save = async () => {
        e.clock.advance(1500);
        e.em.FindChildTraverse("FooterSaveBuildButton").activate();
        await drain();
        assert.equal(e.em.FindChildTraverse("FooterSaveBuildButton").FindChildTraverse("TabLabel").text, "SAVED");
    };
    await save();
    const original = disk.get("qollock_settings");
    g.QOL.ui.window.setActiveTabAndRefresh("Presets"); e.clock.advance(200); await drain();
    e.em.FindChildTraverse("PersonalPresetName").text = "BoostyPreset";
    e.em.FindChildTraverse("PersonalPresetSave").activate(); await drain();
    g.MOD_CONFIG.HEALTHBAR_TYPE = 2;
    g.SaveAndSync();
    await save();
    assert.equal(disk.get("qollock_settings"), original, "Save of another profile must preserve the startup slot");
    assert.equal(JSON.parse(disk.get("qollock_personal_presets_state")).startupName, "My config");
    let entries = JSON.parse(disk.get("qollock_personal_presets"));
    assert.equal(g.QOL.parseStoredConfig(entries.find(entry => entry.name === "BoostyPreset").raw).HEALTHBAR_TYPE, 2);
    assert.equal(g.QOL.parseStoredConfig(entries.find(entry => entry.name === "My config").raw).HEALTHBAR_TYPE, 1);
    g.MOD_CONFIG.AUTO_SAVE_CHANGES = 1;
    g.MOD_CONFIG.SOULS_X_OFFSET = 123;
    g.SaveAndSync(); e.clock.advance(700); await drain();
    assert.equal(disk.get("qollock_settings"), original, "Auto-Save must also preserve another profile's startup slot");
    entries = JSON.parse(disk.get("qollock_personal_presets"));
    assert.equal(g.QOL.parseStoredConfig(entries.find(entry => entry.name === "BoostyPreset").raw).SOULS_X_OFFSET, 123);
    const restarted = setup(disk);
    restarted.p.renderPresetsTab(restarted.list); await flush();
    const badges = restarted.list.FindChildrenWithClassTraverse("PersonalPresetStartupBadge");
    assert.deepEqual(badges.map(badge => badge.visible), [false, true]);

    e.em.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    activeMenuAction(e, "PersonalPresetStartup").activate(); await drain();
    assert.equal(JSON.parse(disk.get("qollock_personal_presets_state")).startupName, "BoostyPreset");
    assert.equal(g.QOL.parseStoredConfig(disk.get("qollock_settings")).HEALTHBAR_TYPE, 2);
    g.MOD_CONFIG.HEALTHBAR_TYPE = 3;
    g.SaveAndSync();
    await save();
    assert.equal(JSON.parse(disk.get("qollock_personal_presets_state")).startupName, "BoostyPreset");
    assert.equal(g.QOL.parseStoredConfig(disk.get("qollock_settings")).HEALTHBAR_TYPE, 3);
    entries = JSON.parse(disk.get("qollock_personal_presets"));
    assert.equal(g.QOL.parseStoredConfig(entries.find(entry => entry.name === "BoostyPreset").raw).HEALTHBAR_TYPE, 3);
    assert.deepEqual(e.doc.eventErrors, []);
    assert.deepEqual(e.clock.errors, []);
});

test("profile saves serialize with startup selection and reject failed collection writes", async () => {
    const e = setup(), g = e.global;
    await e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    await e.p.savePersonalPreset("BoostyPreset", g.MOD_CONFIG);
    const original = g.WrapConfigForStorage(g.MOD_CONFIG);
    e.disk.set("qollock_settings", original);
    let acknowledge;
    e.Q.core.storageBridge.saveStartupSettings = raw => new Promise(resolve => {
        acknowledge = () => { e.disk.set("qollock_settings", raw); resolve(); };
    });
    let preview;
    g.OpenConfigDiffPreviewModal = options => { preview = options; };
    e.p.renderPresetsTab(e.list); await flush();
    e.list.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].activate(); preview.onApply();
    const target = e.p.getSaveTarget();
    e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    activeMenuAction(e, "PersonalPresetStartup").activate(); await flush();
    g.MOD_CONFIG.HEALTHBAR_TYPE = 2;
    const saving = e.p.savePersonalSettings(g.WrapConfigForStorage(g.MOD_CONFIG), target);
    acknowledge(); await flush(); await saving;
    assert.equal(JSON.parse(e.disk.get("qollock_personal_presets_state")).startupName, "BoostyPreset");
    assert.equal(e.Q.parseStoredConfig(e.disk.get("qollock_settings")).HEALTHBAR_TYPE, 2);

    const startup = e.disk.get("qollock_settings");
    e.list.FindChildrenWithClassTraverse("PersonalPresetLoad")[1].activate(); preview.onApply();
    const originalTarget = e.p.getSaveTarget();
    const save = e.Q.core.storageBridge.save;
    e.Q.core.storageBridge.save = async (key, value) => {
        if (key === "qollock_personal_presets") throw Error("quota");
        await save(key, value);
    };
    g.MOD_CONFIG.HEALTHBAR_TYPE = 3;
    await assert.rejects(e.p.savePersonalSettings(g.WrapConfigForStorage(g.MOD_CONFIG), originalTarget), /quota/);
    assert.equal(e.disk.get("qollock_settings"), startup);
    assert.equal(JSON.parse(e.disk.get("qollock_personal_presets_state")).startupName, "BoostyPreset");
    assert.deepEqual(e.doc.eventErrors, []);
    assert.deepEqual(e.clock.errors, []);
});

test("footer cannot report SAVED when its personal preset write fails", async () => {
    const e = loadSettings(), g = e.global, disk = new Map();
    e.hud.sandbox.global.QOL.core.App.shutdown();
    const drain = connectSavePage(e, disk, "qollock_personal_presets");
    g.currentTab = "HUD";
    g.QOL.ui.window.buildUI();
    g.QOL.ui.window.setOpen(true); e.clock.advance(500);
    const footer = e.em.FindChildTraverse("FooterSaveBuildButton");
    footer.activate(); await drain();
    assert.equal(footer.FindChildTraverse("TabLabel").text, "FAILED");
    assert.equal(disk.has("qollock_settings"), true, "the completed main write remains recoverable");
    assert.equal(disk.has("qollock_personal_presets"), false);
});

test("footer Save repairs a stale original identity when the collection is empty", async () => {
    const e = setup(), g = e.global;
    e.disk.set("qollock_personal_presets_state", JSON.stringify({ startupName: "", originalName: "My config" }));
    g.MOD_CONFIG.HEALTHBAR_TYPE = 1;
    await e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    const entries = await e.p.readPersonalPresets();
    assert.deepEqual(Array.from(entries, entry => entry.name), ["My config"]);
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).HEALTHBAR_TYPE, 1);
});


test("New Preset starts at factory settings, opens it and footer Save updates that named preset", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 789;
    g.MOD_CONFIG.HEALTHBAR_TYPE = 1;
    e.p.renderPresetsTab(e.list); await flush();
    e.list.FindChildTraverse("PersonalPresetName").text = "Fresh";
    const create = e.list.FindChildTraverse("PersonalPresetSave");
    assert.equal(create.GetChild(0).text, "New Preset");
    create.activate(); await flush();
    let entries = await e.p.readPersonalPresets();
    assert.equal(entries[0].name, "Fresh");
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).SOULS_X_OFFSET, g.DEFAULT_CONFIG.SOULS_X_OFFSET);
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).HEALTHBAR_TYPE, g.DEFAULT_CONFIG.HEALTHBAR_TYPE);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, g.DEFAULT_CONFIG.SOULS_X_OFFSET);
    g.MOD_CONFIG.HEALTHBAR_TYPE = 1;
    g.SaveAndSync();
    await e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    entries = await e.p.readPersonalPresets();
    assert.deepEqual(Array.from(entries, entry => entry.name), ["Fresh"]);
    assert.equal(e.Q.parseStoredConfig(entries[0].raw).HEALTHBAR_TYPE, 1);
    assert.equal(e.list.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].GetParent().BHasClass("PresetActive"), true);
});


test("a Save target renamed before completion cannot overwrite an unrelated main profile", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 100;
    await e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG));
    g.MOD_CONFIG.SOULS_X_OFFSET = 200;
    await e.p.savePersonalPreset("A", g.MOD_CONFIG);
    let preview;
    g.OpenConfigDiffPreviewModal = options => { preview = options; };
    e.p.renderPresetsTab(e.list); await flush();
    e.list.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].activate(); preview.onApply();
    const target = e.p.getSaveTarget();
    e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    activeMenuAction(e, "PersonalPresetRename").activate();
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameInput")[0].text = "B";
    e.list.FindChildrenWithClassTraverse("PersonalPresetRenameSave")[0].activate(); await flush();
    g.MOD_CONFIG.SOULS_X_OFFSET = 300;
    await assert.rejects(e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG), true, target), /changed while saving/);
    const entries = await e.p.readPersonalPresets();
    assert.equal(e.Q.parseStoredConfig(entries.find(entry => entry.name === "My config").raw).SOULS_X_OFFSET, 100);
    assert.equal(e.Q.parseStoredConfig(entries.find(entry => entry.name === "B").raw).SOULS_X_OFFSET, 200);
});


test("opening a new factory preset cannot redraw a section retired by the language refresh", async () => {
    const e = setup(), g = e.global;
    e.p.renderPresetsTab(e.list); await flush();
    const oldList = e.list.FindChildTraverse("PersonalPresetsList");
    let retiredDraws = 0;
    oldList.RemoveAndDeleteChildren = () => { retiredDraws++; };
    g.RefreshSettingsLanguageUiAfterConfigChange = () => {
        e.list.RemoveAndDeleteChildren();
        e.p.renderPresetsTab(e.list);
    };
    e.list.FindChildTraverse("PersonalPresetName").text = "Fresh";
    e.list.FindChildTraverse("PersonalPresetSave").activate(); await flush();
    assert.equal(retiredDraws, 0);
    assert.equal((await e.p.readPersonalPresets())[0].name, "Fresh");
    assert.equal(e.list.FindChildrenWithClassTraverse("PersonalPresetLoad").length, 1);
});


test("a pending Save cannot overwrite a replacement preset that reused the deleted name", async () => {
    const e = setup(), g = e.global;
    g.MOD_CONFIG.SOULS_X_OFFSET = 100;
    await e.p.savePersonalPreset("A", g.MOD_CONFIG);
    let preview;
    g.OpenConfigDiffPreviewModal = options => { preview = options; };
    e.p.renderPresetsTab(e.list); await flush();
    e.list.FindChildrenWithClassTraverse("PersonalPresetLoad")[0].activate(); preview.onApply();
    const target = e.p.getSaveTarget();
    await e.p.deletePersonalPreset("A");
    g.MOD_CONFIG.SOULS_X_OFFSET = 200;
    await e.p.savePersonalPreset("A", g.MOD_CONFIG);
    g.MOD_CONFIG.SOULS_X_OFFSET = 300;
    await assert.rejects(e.p.onDefaultSaved(g.WrapConfigForStorage(g.MOD_CONFIG), true, target), /changed while saving/);
    assert.equal(e.Q.parseStoredConfig((await e.p.readPersonalPresets())[0].raw).SOULS_X_OFFSET, 200);
});


test("preset menu leaves the clipped list and opens above its button in scaled window coordinates", async () => {
    const e = setup();
    await e.p.savePersonalPreset("Mine", e.global.MOD_CONFIG);
    e.p.renderPresetsTab(e.list); await flush();
    const win = e.em.FindChildTraverse("SettingsWindow");
    win.actualuiscale_x = 2;
    win.actualuiscale_y = 2;
    const more = e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[0];
    more.actuallayoutwidth = 68;
    more.GetPositionWithinAncestor = host => { assert.equal(host, win); return { x: 1040, y: 760 }; };
    more.activate();
    const layer = win.FindChildrenWithClassTraverse("PersonalPresetMenuLayer").find(panel => panel.visible);
    assert.equal(!!layer, true);
    const menu = layer.FindChildrenWithClassTraverse("PersonalPresetMenu")[0];
    assert.equal(menu.visible, true);
    assert.equal(menu.style.x, "304px");
    assert.equal(menu.style.y, "264px");
    assert.equal(e.list.FindChildrenWithClassTraverse("PersonalPresetMenu").length, 0);
    layer.FindChildrenWithClassTraverse("PersonalPresetMenuBackdrop")[0].activate();
    e.clock.advance(0);
    assert.equal(layer.IsValid(), false);
    assert.equal(e.list.FindChildrenWithClassTraverse("PersonalPresetMenu").length, 1);
});

test("preset menu is retired on settings close and cannot survive its section replacement", async () => {
    const e = setup();
    await e.p.savePersonalPreset("Mine", e.global.MOD_CONFIG);
    e.p.renderPresetsTab(e.list); await flush();
    e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    let layer = e.em.FindChildrenWithClassTraverse("PersonalPresetMenuLayer").find(panel => panel.visible);
    assert.equal(!!layer, true);
    e.p.stopPresetHighlightPolling(); e.clock.advance(0);
    assert.equal(layer.IsValid(), false);
    e.list.FindChildrenWithClassTraverse("PersonalPresetMore")[0].activate();
    layer = e.em.FindChildrenWithClassTraverse("PersonalPresetMenuLayer").find(panel => panel.visible);
    e.list.RemoveAndDeleteChildren();
    e.p.refreshActivePresetHighlight(); e.clock.advance(0);
    assert.equal(layer.IsValid(), false);
    assert.deepEqual(e.doc.eventErrors, []);
});
