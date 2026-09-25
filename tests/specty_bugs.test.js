// tests/specty_bugs.test.js
// =============================================================================
// Unit tests verifying fixes for the 5 Specty reported bugs:
// 1. "Cant edit any ammo settings" - ql_ammo activates on custom scale/offset/angle/color
// 2. "Enabling Visual on Ammo makes it really tiny? DIsabling it makes it big" - neutral scale leaves font size null
// 3. "Cant move qol lock settings menu anymore" - DragToggleBtnRail in tabFooter
// 4. "Hitting X on QolLock settings also closes the escape menu" - CitadelResumePlaying not fired
// 5. Unsecured Plus must recover after zero souls or a temporarily missing source.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sim = require("../scripts/simulator/index.js");

test("Bug 1 & 2: ql_ammo enables when slider is customized and neutral scale leaves font size null", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const QOL = hud.sandbox.global.QOL;
    const FR = QOL.core.FeatureRegistry;
    const defaultCfg = hud.sandbox.global.QOL_DEFAULT_CONFIG;

    // 1. Initially disabled at neutral defaults
    assert.strictEqual(FR.isEnabled("ql_ammo"), false, "ql_ammo should initially be disabled");

    // Create dummy ammo panel in the DOM
    const root = hud.root;
    const ap = hud.sandbox.global.$.CreatePanel("Panel", root, "ammo_panel");
    const labelCurrent = hud.sandbox.global.$.CreatePanel("Label", ap, "current");
    labelCurrent.AddClass("weapon_ammo");
    const labelMax = hud.sandbox.global.$.CreatePanel("Label", ap, "max");
    labelMax.AddClass("weapon_ammo_max");

    // 2. Customizing AMMO_CURRENT_SCALE to 150 enables ql_ammo via isEnabled
    const newConfig = Object.assign({}, defaultCfg, {
        AMMO_CURRENT_SCALE: 150
    });
    const raw = JSON.stringify({ schema: "3.1.9", data: newConfig });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", raw);
    hud.clock.advance(1000);

    assert.strictEqual(FR.isEnabled("ql_ammo"), true, "ql_ammo should be enabled when AMMO_CURRENT_SCALE is customized");
    assert.strictEqual(labelCurrent.style.fontSize, "24px", "Scaled font size should be 24px (16 * 1.5)");

    // 3. Enabling Visual with 100% scale must NOT force 16px (must leave fontSize null)
    const neutralConfig = Object.assign({}, defaultCfg, {
        ENABLE_AMMO_STATUS: 1,
        AMMO_CURRENT_SCALE: 100,
        AMMO_TOTAL_SCALE: 100
    });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "3.1.9", data: neutralConfig }));
    hud.clock.advance(1000);

    assert.strictEqual(FR.isEnabled("ql_ammo"), true, "ql_ammo should be enabled when ENABLE_AMMO_STATUS is 1");
    assert.strictEqual(labelCurrent.style.fontSize, null, "Neutral scale (100) must keep fontSize null to preserve game scaling");
    assert.strictEqual(labelCurrent.style.width, null, "Neutral scale (100) must keep width null");

    // 4. Disabling clears all styles
    const disabledConfig = Object.assign({}, defaultCfg, {
        ENABLE_AMMO_STATUS: 0,
        AMMO_CURRENT_SCALE: 100,
        AMMO_TOTAL_SCALE: 100
    });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "3.1.9", data: disabledConfig }));
    hud.clock.advance(1000);

    assert.strictEqual(FR.isEnabled("ql_ammo"), false, "ql_ammo should be disabled when all settings neutral");
    assert.strictEqual(labelCurrent.style.fontSize, null);
    assert.strictEqual(ap.style.x, "0px");
    assert.strictEqual(ap.style.y, "80px");
});

test("Bug 3: setupSettingsWindowDragging attaches drag handles to header without rail toggle button", () => {
    const { Document } = require("../scripts/simulator/panel.js");
    const { Clock } = require("../scripts/simulator/clock.js");

    const clock = new Clock(1000);
    const doc = new Document(clock);
    const emRoot = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    const win = doc.create("Panel", { id: "SettingsWindow" });
    const header = doc.create("Panel", { id: "SettingsHeader" });
    const list = doc.create("Panel", { id: "SettingsList" });
    const closeBtn = doc.create("Button", { id: "CloseBtn" });
    header.addChild(closeBtn);
    win.addChild(header);
    win.addChild(list);
    emRoot.addChild(win);

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => setTimeout(cb, delaySec * 1000),
        CancelScheduled: (id) => clearTimeout(id),
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            if (parent && typeof parent.addChild === "function") parent.addChild(p);
            return p;
        },
        GetContextPanel: () => emRoot,
        DispatchEvent: () => {},
        RegisterEventHandler: () => {},
        RegisterForUnhandledEvent: () => {},
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
                    findRoot: () => emRoot,
                },
                ConfigStore: {
                    hasSchema: () => false,
                    getDefault: () => false,
                    getFlat: () => 0,
                    setFlat: () => {},
                },
            },
            ui: {},
            events: { emit: () => {} },
        },
        MOD_CONFIG: { DRAG_ENABLED: 1 },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis = sandbox;

    // Load drag.js and window.js
    require("./load_ui_helpers")(sandbox);
    const dragCode = fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/ui/drag.js"), "utf8");
    vm.runInNewContext(dragCode, sandbox);
    const windowCode = fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/ui/window.js"), "utf8");
    vm.runInNewContext(windowCode, sandbox);

    sandbox.QOL.ui.window.buildUI();

    const dragBtn = win.FindChildTraverse("DragToggleBtnRail");
    assert.strictEqual(dragBtn, null, "DragToggleBtnRail must NOT be in SettingsWindow UI");

    const leftHandle = header.FindChildTraverse("SettingsHeaderDragAreaLeft");
    const rightHandle = header.FindChildTraverse("SettingsHeaderDragAreaRight");
    assert.ok(leftHandle, "SettingsHeaderDragAreaLeft must exist");
    assert.ok(rightHandle, "SettingsHeaderDragAreaRight must exist");
});

test("Bug 4: Closing SettingsWindow does not close the Escape Menu", () => {
    const { Document } = require("../scripts/simulator/panel.js");
    const { Clock } = require("../scripts/simulator/clock.js");

    const clock = new Clock(1000);
    const doc = new Document(clock);
    const emRoot = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    const win = doc.create("Panel", { id: "SettingsWindow" });
    const header = doc.create("Panel", { id: "SettingsHeader" });
    const closeBtn = doc.create("Button", { id: "CloseBtn" });
    header.addChild(closeBtn);
    win.addChild(header);
    emRoot.addChild(win);

    let resumePlayingFired = false;
    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => setTimeout(cb, delaySec * 1000),
        CancelScheduled: (id) => clearTimeout(id),
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            if (parent && typeof parent.addChild === "function") parent.addChild(p);
            return p;
        },
        GetContextPanel: () => emRoot,
        DispatchEvent: (eventName) => {
            if (eventName === "CitadelResumePlaying") {
                resumePlayingFired = true;
            }
        },
        RegisterEventHandler: () => {},
        RegisterForUnhandledEvent: () => {},
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
                    findRoot: () => emRoot,
                },
                ConfigStore: {
                    hasSchema: () => false,
                    getDefault: () => false,
                    getFlat: () => 0,
                    setFlat: () => {},
                },
            },
            ui: {},
            events: { emit: () => {} },
        },
        globalThis: {
            MOD_CONFIG: { DRAG_ENABLED: 0 },
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis = sandbox;

    require("./load_ui_helpers")(sandbox);
    const windowCode = fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/ui/window.js"), "utf8");
    vm.runInNewContext(windowCode, sandbox);

    sandbox.QOL.ui.window.boot();
    sandbox.QOL.ui.window.setOpen(true);
    assert.strictEqual(sandbox.QOL.ui.window.isOpen(), true);

    // Close window via forceCloseModSettings
    sandbox.QOL.ui.window.forceCloseModSettings();
    assert.strictEqual(sandbox.QOL.ui.window.isOpen(), false);
    assert.strictEqual(resumePlayingFired, false, "CitadelResumePlaying must NOT be dispatched when closing mod settings");
});

test("Unsecured Plus recovers after zero souls and a late native label", () => {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const create = hud.sandbox.global.$.CreatePanel;
    const root = hud.root;
    // IDs/classes from Valve's hud.xml and hud_gold_and_ap_container.xml.
    // This fixture checks JS visibility transitions, not Panorama rendering.
    const stats = create("Panel", root, "StatsAndModsContainer");
    const gold = create("Panel", stats, "gold_and_ap_container");
    const container = create("Panel", gold, "");
    container.AddClass("hudDeathGoldContainer");
    const config = Object.assign({}, hud.sandbox.global.QOL_DEFAULT_CONFIG, {
        ENABLE_BETTER_UNSECURED: 1
    });
    root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "4.0.0", data: config }));
    hud.clock.advance(1000);
    const overlay = root.FindChildTraverse("QOLBetterUnsecuredOverlay");
    assert.ok(overlay.BHasClass("qol-hidden"), "No source yet: overlay stays hidden");

    const label = create("Label", container, "hudDealthGoldLabel");
    label.AddClass("death_penalty_gold");
    const mirror = overlay.FindChildTraverse("QOLBetterUnsecuredMirrorLabel");
    for (const value of ["125", "0", "250", "0", "125"]) {
        label.text = value;
        hud.clock.advance(250);
        assert.strictEqual(overlay.BHasClass("qol-hidden"), value === "0", `Visibility after ${value} souls`);
        if (value !== "0") assert.strictEqual(mirror.text, value);
    }
    config.ENABLE_BETTER_UNSECURED = 0;
    root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "4.0.0", data: config }));
    hud.clock.advance(1000);
    assert.strictEqual(root.FindChildTraverse("QOLBetterUnsecuredOverlay"), null);
    config.ENABLE_BETTER_UNSECURED = 1;
    root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({ schema: "4.0.0", data: config }));
    hud.clock.advance(1000);
    const restored = root.FindChildTraverse("QOLBetterUnsecuredOverlay");
    assert.strictEqual(restored.BHasClass("qol-hidden"), false);
    assert.strictEqual(restored.FindChildTraverse("QOLBetterUnsecuredMirrorLabel").text, "125");
});
