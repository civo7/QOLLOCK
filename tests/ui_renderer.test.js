// tests/ui_renderer.test.js
// =============================================================================
// Unit tests for declarative UI renderer (panorama/scripts/ui/renderer.js)
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
    const rootPanel = doc.create("Panel", { id: "Root" });

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
            if (type === "DropDown") {
                p._options = [];
                p._selectedId = null;
                p.AddOption = (optPanel) => {
                    p._options.push(optPanel);
                    p.addChild(optPanel);
                };
                p.SetSelected = (optId) => {
                    p._selectedId = optId;
                };
                p.GetSelected = () => {
                    return p._options.find((opt) => opt.id === p._selectedId) || null;
                };
            }
            if (type === "Slider") {
                p.min = 0;
                p.max = 100;
                p.value = 0;
            }
            if (type === "ToggleButton") {
                p.checked = false;
                p.SetSelected = (v) => { p.checked = !!v; };
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
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id, props) => mockDollar.CreatePanel(type, parent, id, props),
                },
            },
            ui: {},
        },
        globalThis: null,
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis = sandbox;

    const rendererCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/renderer.js"),
        "utf8"
    );
    vm.runInNewContext(rendererCode, sandbox);

    return {
        rootPanel,
        QOL: sandbox.QOL,
        renderer: sandbox.QOL.ui.renderer,
        clock,
    };
}

test("renderer: exports all required factory functions", () => {
    const { renderer } = createTestEnvironment();
    assert.ok(renderer, "QOL.ui.renderer must be defined");

    const expectedFns = [
        "createRow",
        "createResetButton",
        "createToggle",
        "createCheckbox",
        "createSlider",
        "createDropdown",
        "createButtonGroup",
        "createMultiToggle",
        "createPalette",
        "createAction",
        "createSeparator",
        "createSpacer",
        "createSectionHeader",
        "createSubsectionHeader",
        "createAnimatedInlineToggleSection",
        "createControl",
        "registerDependent",
        "updateDependents",
        "clearDependents",
        "snapToStep",
        "localize",
    ];

    for (const fn of expectedFns) {
        assert.strictEqual(
            typeof renderer[fn],
            "function",
            `Expected renderer.${fn} to be a function`
        );
    }
});

test("renderer: snapToStep calculates correct increments and precision", () => {
    const { renderer } = createTestEnvironment();
    assert.strictEqual(renderer.snapToStep(12.345, 0.05, 0, 100), 12.35);
    assert.strictEqual(renderer.snapToStep(12.32, 0.05, 0, 100), 12.3);
    assert.strictEqual(renderer.snapToStep(7, 5, 0, 100), 5);
    assert.strictEqual(renderer.snapToStep(8, 5, 0, 100), 10);
    assert.strictEqual(renderer.snapToStep(150, 10, 0, 100), 100);
    assert.strictEqual(renderer.snapToStep(-10, 1, 0, 100), 0);
});

test("renderer: createToggle toggles state and invokes onChange callback", () => {
    const { renderer, rootPanel } = createTestEnvironment();
    let changeLog = [];

    const setting = {
        key: "TEST_TOGGLE",
        label: "Test Toggle Setting",
        default: false,
    };

    const result = renderer.createToggle(rootPanel, setting, false, (k, v) => {
        changeLog.push({ k, v });
    });

    assert.ok(result.row, "Toggle row must be created");
    assert.ok(result.button, "Toggle button panel must be created");
    assert.strictEqual(result.button.BHasClass("ToggleOn"), false);

    // Simulate clicking switch button
    const switchBtn = result.button.Children().find((c) => c.BHasClass("SwitchButton"));
    assert.ok(switchBtn, "SwitchButton must exist inside toggle button");
    switchBtn.activate();

    assert.strictEqual(changeLog.length, 1);
    assert.deepStrictEqual(changeLog[0], { k: "TEST_TOGGLE", v: true });
    assert.strictEqual(result.button.BHasClass("ToggleOn"), true);
});

test("renderer: createCheckbox toggles checkbox selection state", () => {
    const { renderer, rootPanel } = createTestEnvironment();
    let lastValue = null;

    const setting = {
        key: "TEST_CHECKBOX",
        label: "Test Checkbox Setting",
        default: false,
    };

    const result = renderer.createCheckbox(rootPanel, setting, false, (k, v) => {
        lastValue = v;
    });

    assert.ok(result.button, "Checkbox button panel must be created");
    assert.strictEqual(result.button.BHasClass("CitadelSettingsCheckbox"), true);

    result.button.activate();
    assert.strictEqual(lastValue, true);
    assert.strictEqual(result.button.BHasClass("IsSelected"), true);
});

test("renderer: createDropdown manages options and selection", () => {
    const { renderer, rootPanel } = createTestEnvironment();
    let selected = null;

    const setting = {
        key: "TEST_DROPDOWN",
        label: "Select Option",
        options: [
            { label: "Alpha", value: "a" },
            { label: "Beta", value: "b" },
            { label: "Gamma", value: "c" },
        ],
        default: "a",
    };

    const result = renderer.createDropdown(rootPanel, setting, "a", (k, v) => {
        selected = v;
    });

    assert.ok(result.dropdown, "DropDown panel must be created");
    assert.strictEqual(result.dropdown.BHasClass("SettingsDropDown"), true);

    // Change selection to Beta
    result.dropdown.SetSelected("opt_TEST_DROPDOWN_1");
    result.dropdown._fire("oninputsubmit");

    assert.strictEqual(selected, "b");
});

test("renderer: createButtonGroup updates active button on activation", () => {
    const { renderer, rootPanel } = createTestEnvironment();
    let activeKey = null;

    const setting = {
        key: "TEST_GROUP",
        options: [
            { label: "Low", value: 1 },
            { label: "Med", value: 2 },
            { label: "High", value: 3 },
        ],
        default: 1,
    };

    const result = renderer.createButtonGroup(rootPanel, setting, 1, (k, v) => {
        activeKey = v;
    });

    assert.strictEqual(result.buttons.length, 3);
    assert.strictEqual(result.buttons[0].btn.BHasClass("Active"), true);
    assert.strictEqual(result.buttons[1].btn.BHasClass("Active"), false);

    // Activate second button
    result.buttons[1].btn.activate();
    assert.strictEqual(activeKey, 2);
    assert.strictEqual(result.buttons[1].btn.BHasClass("Active"), true);
    assert.strictEqual(result.buttons[0].btn.BHasClass("Active"), false);
});

test("renderer: createResetButton marks dirty state when value differs from default", () => {
    const { renderer, rootPanel } = createTestEnvironment();
    let resetFired = false;

    const setting = {
        key: "TEST_RESET",
        default: 50,
    };

    const resetObj = renderer.createResetButton(rootPanel, setting, 75, (k, v) => {
        resetFired = (k === "TEST_RESET" && v === 50);
    });

    assert.ok(resetObj.button, "Reset button must exist");
    assert.strictEqual(resetObj.button.BHasClass("NotDefault"), true);

    // Trigger reset
    resetObj.button.activate();
    assert.strictEqual(resetFired, true);
    assert.strictEqual(resetObj.button.BHasClass("NotDefault"), false);
});

test("renderer: createControl dispatches dependsOn visibility", () => {
    const { renderer, rootPanel } = createTestEnvironment();

    const parentSetting = {
        key: "PARENT_TOGGLE",
        type: "toggle",
        default: false,
    };

    const childSetting = {
        key: "CHILD_TOGGLE",
        type: "toggle",
        default: true,
        dependsOn: { key: "PARENT_TOGGLE", value: true },
    };

    renderer.createControl(rootPanel, parentSetting, false, () => {});
    const childResult = renderer.createControl(rootPanel, childSetting, true, () => {}, {
        getDependencyValue: (k) => (k === "PARENT_TOGGLE" ? false : undefined),
    });

    const parentRow = childResult.row.GetParent();
    assert.ok(parentRow.BHasClass("QOLDependent"), "Child container must be QOLDependent");
    assert.strictEqual(parentRow.BHasClass("Collapsed"), true);

    // Now update parent setting to true
    renderer.updateDependents("PARENT_TOGGLE", true);
    assert.strictEqual(parentRow.BHasClass("Collapsed"), false);

    // Update parent setting back to false
    renderer.updateDependents("PARENT_TOGGLE", false);
    assert.strictEqual(parentRow.BHasClass("Collapsed"), true);
});
