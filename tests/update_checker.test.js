const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createUpdateCheckerEnvironment(initialConfig = {}) {
    const panels = new Map();
    let idCounter = 0;

    class MockPanel {
        constructor(type, id) {
            this.type = type;
            this.id = id || `Panel_${++idCounter}`;
            this.classes = new Set();
            this.children = [];
            this.parent = null;
            this.attributes = new Map();
            this.events = new Map();
            this.actuallayoutwidth = 0;
            this.actuallayoutheight = 0;
            this.imagePath = "";
            panels.set(this.id, this);
        }

        AddClass(cls) {
            this.classes.add(cls);
        }

        RemoveClass(cls) {
            this.classes.delete(cls);
        }

        BHasClass(cls) {
            return this.classes.has(cls);
        }

        SetHasClass(cls, val) {
            if (val) this.AddClass(cls);
            else this.RemoveClass(cls);
        }

        SetAttributeString(k, v) {
            this.attributes.set(k, String(v));
        }

        GetAttributeString(k, fallback) {
            return this.attributes.has(k) ? this.attributes.get(k) : fallback;
        }

        SetPanelEvent(event, fn) {
            this.events.set(event, fn);
        }

        SetImage(path) {
            this.imagePath = path;
        }

        DeleteAsync(delay) {
            panels.delete(this.id);
            if (this.parent) {
                const idx = this.parent.children.indexOf(this);
                if (idx !== -1) this.parent.children.splice(idx, 1);
            }
        }

        FindChildTraverse(id) {
            if (this.id === id) return this;
            for (const c of this.children) {
                const res = c.FindChildTraverse(id);
                if (res) return res;
            }
            return null;
        }

        IsValid() {
            return panels.has(this.id);
        }
    }

    const rootPanel = new MockPanel("Panel", "Root");
    const settingsWindow = new MockPanel("Panel", "SettingsWindow");
    rootPanel.children.push(settingsWindow);
    settingsWindow.parent = rootPanel;

    const scheduled = [];
    const mockDollar = {
        Msg: () => {},
        GetContextPanel: () => rootPanel,
        CreatePanel: (type, parent, id) => {
            const p = new MockPanel(type, id);
            if (parent) {
                parent.children.push(p);
                p.parent = parent;
            }
            return p;
        },
        Schedule: (sec, cb) => {
            scheduled.push({ sec, cb });
            return scheduled.length;
        },
    };

    const sandbox = {
        $: mockDollar,
        QOL: {},
        QOL_UTILS: {
            IsPanelValid: (p) => !!(p && p.IsValid && p.IsValid()),
        },
        MOD_CONFIG: Object.assign({}, initialConfig),
    };

    const code = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ql_update_checker.js"),
        "utf8"
    );
    vm.runInNewContext(code, sandbox);

    return {
        sandbox,
        rootPanel,
        settingsWindow,
        scheduled,
    };
}

test("update_checker: marker is bumped to 3 and exports on QOL.updateChecker", () => {
    const { sandbox } = createUpdateCheckerEnvironment();
    assert.ok(sandbox.QOL.updateChecker, "QOL.updateChecker must exist");
    assert.strictEqual(sandbox.QOL.updateChecker.marker, 3);
    assert.strictEqual(typeof sandbox.QOL.updateChecker.onSettingsOpened, "function");
    assert.strictEqual(typeof sandbox.QOL.updateChecker.onSettingsChanged, "function");
    assert.strictEqual(typeof sandbox.QOL.updateChecker.classifyMarker, "function");
    assert.strictEqual(typeof sandbox.QOL.updateChecker.isEnabled, "function");
});

test("update_checker: classifyMarker classifies current, outdated, and invalid aspect ratios", () => {
    const { sandbox } = createUpdateCheckerEnvironment();
    const classify = sandbox.QOL.updateChecker.classifyMarker;

    assert.strictEqual(classify(100, 100), "current");
    assert.strictEqual(classify(120, 100), "current");
    assert.strictEqual(classify(400, 100), "outdated");
    assert.strictEqual(classify(100, 500), "outdated");
    assert.strictEqual(classify(0, 100), "invalid");
    assert.strictEqual(classify(-10, 100), "invalid");
    assert.strictEqual(classify("invalid", 100), "invalid");
});

test("update_checker: isEnabled adheres to ENABLE_UPDATE_CHECKER flag", () => {
    const envEnabled = createUpdateCheckerEnvironment({ ENABLE_UPDATE_CHECKER: 1 });
    assert.strictEqual(envEnabled.sandbox.QOL.updateChecker.isEnabled(), true);

    const envDefault = createUpdateCheckerEnvironment({});
    assert.strictEqual(envDefault.sandbox.QOL.updateChecker.isEnabled(), true);

    const envDisabled = createUpdateCheckerEnvironment({ ENABLE_UPDATE_CHECKER: 0 });
    assert.strictEqual(envDisabled.sandbox.QOL.updateChecker.isEnabled(), false);

    const envBoolFalse = createUpdateCheckerEnvironment({ ENABLE_UPDATE_CHECKER: false });
    assert.strictEqual(envBoolFalse.sandbox.QOL.updateChecker.isEnabled(), false);
});

test("update_checker: onSettingsOpened respects ENABLE_UPDATE_CHECKER gating", () => {
    const envDisabled = createUpdateCheckerEnvironment({ ENABLE_UPDATE_CHECKER: 0 });
    envDisabled.settingsWindow.AddClass("Visible");
    envDisabled.sandbox.QOL.updateChecker.onSettingsOpened();

    // With checker disabled, probe host should NOT be created
    const probeHost = envDisabled.rootPanel.FindChildTraverse("QOLUpdateMarkerProbeHost");
    assert.strictEqual(probeHost, null);
    assert.strictEqual(envDisabled.scheduled.length, 0);

    const envEnabled = createUpdateCheckerEnvironment({ ENABLE_UPDATE_CHECKER: 1 });
    envEnabled.settingsWindow.AddClass("Visible");
    envEnabled.sandbox.QOL.updateChecker.onSettingsOpened();

    // With checker enabled, probe host should be created and scheduled
    const enabledProbeHost = envEnabled.rootPanel.FindChildTraverse("QOLUpdateMarkerProbeHost");
    assert.ok(enabledProbeHost);
    assert.ok(envEnabled.scheduled.length > 0);
});

test("update_checker: onSettingsChanged removes popup class if disabled while active", () => {
    const env = createUpdateCheckerEnvironment({ ENABLE_UPDATE_CHECKER: 1 });
    env.settingsWindow.AddClass("Visible");
    env.sandbox.QOL.updateChecker.onSettingsOpened();

    const popupLayer = env.settingsWindow.FindChildTraverse("QOLUpdatePopupLayer");
    if (popupLayer) {
        popupLayer.AddClass("UpdateAvailable");
    }

    env.sandbox.MOD_CONFIG.ENABLE_UPDATE_CHECKER = 0;
    env.sandbox.QOL.updateChecker.onSettingsChanged();

    if (popupLayer) {
        assert.strictEqual(popupLayer.BHasClass("UpdateAvailable"), false);
    }
});
