// tests/ui_drag.test.js
// =============================================================================
// Unit tests for settings window dragging (panorama/scripts/ui/drag.js)
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
    const emRoot = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    const win = doc.create("Panel", { id: "SettingsWindow" });
    const header = doc.create("Panel", { id: "SettingsHeader" });
    const closeBtn = doc.create("Button", { id: "CloseBtn" });
    header.addChild(closeBtn);
    win.addChild(header);
    emRoot.addChild(win);

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
        GetContextPanel: () => emRoot,
        DispatchEvent: () => {},
        RegisterEventHandler: () => {},
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
            },
            ui: {},
        },
        globalThis: {
            MOD_CONFIG: { DRAG_ENABLED: 0 },
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const dragCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/drag.js"),
        "utf8"
    );
    require("./load_ui_helpers")(sandbox);
    vm.runInNewContext(dragCode, sandbox);

    return {
        sandbox,
        doc,
        emRoot,
        win,
        header,
        closeBtn,
    };
}

test("drag: exports all required functions on Q.ui.drag", () => {
    const env = createTestEnvironment();
    const drag = env.sandbox.QOL.ui.drag;

    assert.ok(drag, "Q.ui.drag should be defined");
    assert.strictEqual(typeof drag.ensureDragToggleButtonContent, "function");
    assert.strictEqual(typeof drag.ensureSettingsHeaderDragHandle, "function");
    assert.strictEqual(typeof drag.setupSettingsWindowDragging, "function");
    assert.strictEqual(typeof drag.wireDragToggleButton, "function");
    assert.strictEqual(typeof drag.isDragEnabled, "function");
});

test("drag: ensureSettingsHeaderDragHandle creates left and right handles", () => {
    const env = createTestEnvironment();
    const drag = env.sandbox.QOL.ui.drag;

    const handles = drag.ensureSettingsHeaderDragHandle(env.header);
    assert.ok(handles, "Handles object returned");
    assert.ok(handles.left, "Left drag handle created");
    assert.ok(handles.right, "Right drag handle created");
    assert.ok(handles.left.BHasClass("SettingsHeaderDragArea"));
    assert.ok(handles.right.BHasClass("SettingsHeaderDragArea"));
});

test("drag: wireDragToggleButton creates switch structure and toggles state", () => {
    const env = createTestEnvironment();
    const drag = env.sandbox.QOL.ui.drag;
    const btn = env.doc.create("Button", { id: "DragToggleBtn" });

    drag.wireDragToggleButton(btn, env.win);

    const switchPanel = btn.FindChildTraverse("DragToggleSwitch");
    const label = btn.FindChildTraverse("DragToggleLabel");
    assert.ok(switchPanel, "Should have DragToggleSwitch child");
    assert.ok(label, "Should have DragToggleLabel child");
    assert.strictEqual(btn.BHasClass("Active"), false);

    // Activate button
    btn.activate();
    assert.strictEqual(env.sandbox.globalThis.MOD_CONFIG.DRAG_ENABLED, 1);
    assert.strictEqual(btn.BHasClass("Active"), true);
});

test("drag: backward compatibility globals are attached", () => {
    const env = createTestEnvironment();
    const gt = env.sandbox.globalThis;

    assert.strictEqual(typeof gt.EnsureDragToggleButtonContent, "function");
    assert.strictEqual(typeof gt.EnsureSettingsHeaderDragHandle, "function");
    assert.strictEqual(typeof gt.SetupSettingsWindowDragging, "function");
    assert.strictEqual(typeof gt.WireDragToggleButton, "function");
});
