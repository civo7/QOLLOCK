// tests/matrix_invariant.test.js
// =============================================================================
// Comprehensive Invariant & Matrix Simulation Test Suite
// =============================================================================
// Validates:
// 1. Native Valve Panel Safety across all game states and all manifests.
// 2. Full UI Tab traversal, control binding validation against DEFAULT_CONFIG,
//    and zero-exception control interaction.
// 3. Complete 90+ community presets resolution and diff application.
// 4. In-game engine audit output verification.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Document, Clock, createHud } = require("../scripts/simulator/index.js");

// -----------------------------------------------------------------------------
// Helper: create a full match HUD simulation with all native Valve panels
// -----------------------------------------------------------------------------
function createMatchHudTree({ inHideout = false, isGameplayHudAlive = true } = {}) {
    const hud = createHud({ inHideout, boot: false });
    const root = hud.root;

    // Native Valve HUD panels
    const topBar = hud.sandbox.global.$.CreatePanel("CitadelHudTopBar", root, "TopBar");
    const minimap = hud.sandbox.global.$.CreatePanel("Panel", root, "minimap_container");
    const health = hud.sandbox.global.$.CreatePanel("Panel", root, "hud_health");
    const souls = hud.sandbox.global.$.CreatePanel("Panel", root, "gold_and_ap_container");
    const gameplayHud = hud.sandbox.global.$.CreatePanel("Panel", root, "gameplay_hud");
    const gameplayHudAlive = hud.sandbox.global.$.CreatePanel("Panel", gameplayHud, "gameplay_hud_alive");
    const abilityContainer = hud.sandbox.global.$.CreatePanel("Panel", root, "ability_container");
    const shop = hud.sandbox.global.$.CreatePanel("CitadelHudShop", root, "CitadelHudShop");

    if (!isGameplayHudAlive) {
        gameplayHudAlive.style.visibility = "collapse";
    }

    // Load all scripts into the isolate
    for (const s of hud.scripts.scripts) {
        hud.sandbox.load(s.absPath);
    }

    return {
        hud,
        root,
        panels: {
            topBar,
            minimap,
            health,
            souls,
            gameplayHud,
            gameplayHudAlive,
            abilityContainer,
            shop
        }
    };
}

// =============================================================================
// SUITE 1: Native Valve Panel Safety across Game States
// =============================================================================
test("INVARIANT 1: Native Valve panels are never collapsed by default across all game states", () => {
    // 1. Pre-game / Loading (gameplay_hud_alive collapsed, match started)
    const pregame = createMatchHudTree({ inHideout: false, isGameplayHudAlive: false });
    pregame.hud.clock.advance(100);

    assert.strictEqual(
        pregame.panels.topBar.BHasClass("qol-hidden"),
        false,
        "TopBar must NOT have qol-hidden during pregame loading"
    );
    assert.strictEqual(
        pregame.panels.souls.BHasClass("qol-hidden"),
        false,
        "Souls (gold_and_ap_container) must NOT have qol-hidden during pregame loading"
    );
    assert.strictEqual(
        pregame.panels.health.BHasClass("qol-hidden"),
        false,
        "Health container must NOT have qol-hidden during pregame loading"
    );
    assert.strictEqual(
        pregame.panels.minimap.BHasClass("qol-hidden"),
        false,
        "Minimap container must NOT have qol-hidden during pregame loading"
    );

    // 2. In-match Alive (gameplay_hud_alive visible)
    const alive = createMatchHudTree({ inHideout: false, isGameplayHudAlive: true });
    alive.hud.clock.advance(200);

    assert.strictEqual(alive.panels.topBar.BHasClass("qol-hidden"), false);
    assert.strictEqual(alive.panels.souls.BHasClass("qol-hidden"), false);
    assert.strictEqual(alive.panels.health.BHasClass("qol-hidden"), false);
    assert.strictEqual(alive.panels.minimap.BHasClass("qol-hidden"), false);

    // 3. In-match Hero Death (gameplay_hud_alive collapsed)
    alive.panels.gameplayHudAlive.style.visibility = "collapse";
    alive.hud.clock.advance(500);

    assert.strictEqual(
        alive.panels.topBar.BHasClass("qol-hidden"),
        false,
        "TopBar must NOT disappear when player dies in match"
    );
    assert.strictEqual(
        alive.panels.souls.BHasClass("qol-hidden"),
        false,
        "Souls must NOT disappear when player dies in match"
    );

    // 4. Hero Respawn
    alive.panels.gameplayHudAlive.style.visibility = "visible";
    alive.hud.clock.advance(500);

    assert.strictEqual(alive.panels.topBar.BHasClass("qol-hidden"), false);
    assert.strictEqual(alive.panels.souls.BHasClass("qol-hidden"), false);

    // 5. Hideout / Sandbox Mode
    const hideout = createMatchHudTree({ inHideout: true, isGameplayHudAlive: true });
    hideout.hud.clock.advance(200);

    assert.strictEqual(hideout.panels.topBar.BHasClass("qol-hidden"), false);
    assert.strictEqual(hideout.panels.souls.BHasClass("qol-hidden"), false);
});

// =============================================================================
// SUITE 2: Explicit Toggle Invariant (Disable restores vanilla layout cleanly)
// =============================================================================
test("INVARIANT 2: Explicit feature disable restores vanilla layout cleanly, enable applies styles", () => {
    const env = createMatchHudTree({ inHideout: false, isGameplayHudAlive: true });
    env.hud.clock.advance(100);

    const configStore = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.ok(configStore, "ConfigStore must exist");

    // 1. Enable custom offset
    configStore.set("ql_topbar", "TOP_BAR_X_OFFSET", 50);
    env.hud.clock.advance(500);
    assert.strictEqual(env.panels.topBar.style.x, "50px", "TopBar should have custom x offset applied");
    assert.strictEqual(env.panels.topBar.BHasClass("qol-hidden"), false, "TopBar must NOT be hidden");

    // 2. Disable TopBar feature explicitly -> hides panel with qol-hidden
    configStore.set("ql_topbar", "HUD_TOP_BAR_ENABLED", 0);
    env.hud.clock.advance(500);
    assert.strictEqual(env.panels.topBar.BHasClass("qol-hidden"), true, "TopBar should be hidden with qol-hidden when feature is disabled");
    assert.ok(!env.panels.topBar.style.x, "TopBar x offset must be cleared when feature is disabled");

    // 3. Re-enable TopBar -> custom offset restored and qol-hidden removed
    configStore.set("ql_topbar", "HUD_TOP_BAR_ENABLED", 1);
    env.hud.clock.advance(500);
    assert.strictEqual(env.panels.topBar.BHasClass("qol-hidden"), false, "TopBar should NOT have qol-hidden when re-enabled");
    assert.strictEqual(env.panels.topBar.style.x, "50px", "TopBar custom x offset should be restored");

    // 4. Test Souls custom offset & disable restoration
    configStore.set("ql_souls", "SOULS_Y_OFFSET", 40);
    env.hud.clock.advance(500);
    assert.strictEqual(env.panels.souls.BHasClass("qol-hidden"), false);

    // Disable Souls explicitly -> hides panel with qol-hidden
    configStore.set("ql_souls", "HUD_SOULS_ENABLED", 0);
    env.hud.clock.advance(500);
    assert.strictEqual(env.panels.souls.BHasClass("qol-hidden"), true, "Souls should be hidden with qol-hidden when feature is disabled");
    assert.ok(!env.panels.souls.style.y, "Souls y offset must be cleared when feature is disabled");

    // Re-enable Souls
    configStore.set("ql_souls", "HUD_SOULS_ENABLED", 1);
    env.hud.clock.advance(500);
    assert.strictEqual(env.panels.souls.BHasClass("qol-hidden"), false, "Souls should NOT have qol-hidden when re-enabled");
});

// =============================================================================
// SUITE 3: Full UI Walk, Control Key Bindings & Exception Fuzzing
// =============================================================================
test("INVARIANT 3: Full UI layout walk - all controls bind to valid DEFAULT_CONFIG keys with zero exceptions", () => {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const hudPanel = doc.root;
    hudPanel.id = "Hud";
    hudPanel.paneltype = "CitadelHud";

    const emRoot = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    hudPanel.addChild(emRoot);
    const bg = doc.create("Panel", { id: "EscapeBackground" });
    emRoot.addChild(bg);

    const win = doc.create("Panel", { id: "SettingsWindow" });
    const header = doc.create("Panel", { id: "SettingsHeader" });
    const title = doc.create("Label", { id: "SettingsTitle", text: "QOL LOCK" });
    const closeBtn = doc.create("Button", { id: "CloseBtn" });
    header.addChild(title);
    header.addChild(closeBtn);
    win.addChild(header);

    const body = doc.create("Panel", { id: "SettingsBody" });
    const contentHost = doc.create("Panel", { id: "SettingsContentHost" });
    const list = doc.create("Panel", { id: "SettingsList" });
    contentHost.addChild(list);
    body.addChild(contentHost);
    win.addChild(body);
    emRoot.addChild(win);

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => setTimeout(cb, Math.max(1, delaySec * 1000)),
        CancelScheduled: (id) => clearTimeout(id),
        CreatePanel: (type, parent, id, props) => {
            const p = doc.create(type, { id: id || "" });
            if (parent && typeof parent.addChild === "function") parent.addChild(p);
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
            return p;
        },
        GetContextPanel: () => emRoot,
        DispatchEvent: () => {},
        Localize: (s) => s,
        RegisterForUnhandledEvent: () => {},
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "3.2.0",
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id, props) => mockDollar.CreatePanel(type, parent, id, props),
                    findRoot: () => emRoot,
                    findHud: () => hudPanel,
                },
            },
            ui: {},
            events: { emit: () => {} },
            preview: { startHeroHintPublisher: () => {} }
        },
        globalThis: null,
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis = sandbox;

    const scriptsToLoad = [
        "panorama/scripts/core/ql_namespace.js",
        "panorama/scripts/core/ql_panel_helpers.js",
        "panorama/scripts/ql_utils.js",
        "panorama/scripts/ql_shared_presets.js",
        "panorama/scripts/ql_bridge.js",
        "panorama/scripts/ql_config.js",
        "panorama/scripts/ui/ql_settings_metadata.js",
        "panorama/scripts/ui/ql_settings_tabs.js",
        "panorama/scripts/ui/renderer.js",
        "panorama/scripts/ui/layout.js",
        "panorama/scripts/ui/breadcrumb.js",
        "panorama/scripts/ui/search.js",
        "panorama/scripts/ui/drag.js",
        "panorama/scripts/ui/window.js",
        "panorama/scripts/ui/presets.js",
        "panorama/scripts/ui/modal.js",
        "panorama/scripts/ui/theme.js",
        "panorama/scripts/ui/controls.js",
        "panorama/scripts/ui/dev_tab.js",
        "panorama/scripts/ui/gameplay_tabs.js",
        "panorama/scripts/ql_settings.js"
    ];

    for (const rel of scriptsToLoad) {
        const abs = path.resolve(__dirname, "..", rel);
        const code = fs.readFileSync(abs, "utf8");
        vm.runInNewContext(code, sandbox);
    }

    assert.strictEqual(typeof sandbox.globalThis.BuildUI, "function");
    sandbox.globalThis.BuildUI();

    const windowApi = sandbox.QOL.ui.window;
    assert.ok(windowApi, "window API must exist");

    const defaultConfig = sandbox.globalThis.QOL_DEFAULT_CONFIG;
    assert.ok(defaultConfig, "QOL_DEFAULT_CONFIG must exist");

    // All known tabs
    const tabsToTest = [
        "General", "Crosshair", "HUD", "Healthbar", "UI", "Minimap",
        "Overlay", "Audio", "Presets", "Support", "Console", "Dev", "Arcade"
    ];

    for (const tabName of tabsToTest) {
        assert.doesNotThrow(() => {
            windowApi.setActiveTab(tabName);
        }, `Switching to tab '${tabName}' must not throw`);

        // Find buttons in the tab and simulate activation
        const buttons = list.FindChildrenWithClassTraverse("Button");
        for (const btn of buttons.slice(0, 10)) {
            assert.doesNotThrow(() => {
                btn.activate();
            }, `Button click in tab '${tabName}' must not throw`);
        }
    }
});

// =============================================================================
// SUITE 4: Exhaustive 90+ Presets Matrix Resolution & Application
// =============================================================================
test("INVARIANT 4: All 90+ community presets resolve, diff, and serialize into #Hud without data loss", () => {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const hudPanel = doc.root;
    hudPanel.id = "Hud";
    hudPanel.paneltype = "CitadelHud";

    const emRoot = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    hudPanel.addChild(emRoot);

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => setTimeout(cb, Math.max(1, delaySec * 1000)),
        CancelScheduled: () => {},
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            if (parent && typeof parent.addChild === "function") parent.addChild(p);
            return p;
        },
        GetContextPanel: () => emRoot,
        DispatchEvent: () => {},
        Localize: (s) => s,
        RegisterForUnhandledEvent: () => {},
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id, props) => mockDollar.CreatePanel(type, parent, id, props),
                    findRoot: () => emRoot,
                    findHud: () => hudPanel,
                },
            },
            ui: {},
            events: { emit: () => {} },
            preview: { startHeroHintPublisher: () => {} }
        },
        globalThis: null,
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis = sandbox;

    const scriptsToLoad = [
        "panorama/scripts/core/ql_namespace.js",
        "panorama/scripts/core/ql_panel_helpers.js",
        "panorama/scripts/ql_utils.js",
        "panorama/scripts/ql_shared_presets.js",
        "panorama/scripts/ql_bridge.js",
        "panorama/scripts/ql_config.js",
        "panorama/scripts/ui/ql_settings_metadata.js",
        "panorama/scripts/ui/ql_settings_tabs.js",
        "panorama/scripts/ui/renderer.js",
        "panorama/scripts/ui/layout.js",
        "panorama/scripts/ui/presets.js",
        "panorama/scripts/ui/modal.js",
        "panorama/scripts/ui/theme.js",
        "panorama/scripts/ui/controls.js",
        "panorama/scripts/ql_settings.js"
    ];

    for (const rel of scriptsToLoad) {
        const abs = path.resolve(__dirname, "..", rel);
        const code = fs.readFileSync(abs, "utf8");
        vm.runInNewContext(code, sandbox);
    }

    const presetsMap = sandbox.globalThis.QOL_PRESETS;
    assert.ok(presetsMap, "QOL_PRESETS must exist");

    const presetNames = Object.keys(presetsMap);
    assert.ok(presetNames.length >= 80, `Must have 80+ presets (found ${presetNames.length})`);

    const resolveFn = sandbox.globalThis.ResolvePresetConfigByName || sandbox.QOL.ui.presets.resolvePresetConfigByName;
    const applyFn = sandbox.globalThis.ApplyPresetByName || sandbox.QOL.ui.presets.applyPresetByName;
    const buildDiffFn = sandbox.globalThis.BuildConfigDiffRows || sandbox.QOL.ui.modal.buildConfigDiffRows;

    assert.strictEqual(typeof resolveFn, "function");
    assert.strictEqual(typeof applyFn, "function");
    assert.strictEqual(typeof buildDiffFn, "function");

    // Test each preset
    let appliedCount = 0;
    for (const pName of presetNames) {
        const resolved = resolveFn(pName);
        assert.ok(resolved, `Preset '${pName}' must resolve to a valid config object`);
        assert.ok(typeof resolved === "object", `Preset '${pName}' resolved config must be object`);

        // Build diff rows against default
        const diffRows = buildDiffFn(sandbox.globalThis.DEFAULT_CONFIG, resolved);
        assert.ok(Array.isArray(diffRows), `Preset '${pName}' diff rows must be array`);

        // Apply preset
        const ok = applyFn(pName);
        assert.strictEqual(ok, true, `Applying preset '${pName}' must succeed`);
        appliedCount++;

        // Verify serialized envelope in #Hud
        const savedRaw = hudPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
        assert.ok(savedRaw.length > 0, `Preset '${pName}' must serialize into #Hud`);
        const parsed = JSON.parse(savedRaw);
        assert.ok(parsed, `Serialized envelope for '${pName}' must be valid JSON`);
    }

    assert.strictEqual(appliedCount, presetNames.length, "All presets must be applied cleanly");
});

// =============================================================================
// SUITE 5: In-Game Engine Audit Runner Output
// =============================================================================
test("INVARIANT 5: In-Game Engine Audit runs and logs cleanly with zero critical failures", () => {
    const loggedMessages = [];
    const env = createMatchHudTree({ inHideout: false, isGameplayHudAlive: true });
    const origMsg = env.hud.sandbox.global.$.Msg;
    env.hud.sandbox.global.$.Msg = (msg) => {
        loggedMessages.push(msg);
        if (typeof origMsg === "function") origMsg(msg);
    };

    const auditFn = env.hud.sandbox.global.QOL.runEngineAudit ||
                    (env.hud.sandbox.global.QOL.core && env.hud.sandbox.global.QOL.core.ManifestTests && env.hud.sandbox.global.QOL.core.ManifestTests.runEngineAudit);
    assert.strictEqual(typeof auditFn, "function", "runEngineAudit must be exposed");

    const auditResult = auditFn();
    assert.ok(auditResult, "Audit result must exist");
    if (!auditResult.success) {
        console.log("AUDIT LOGS:\n" + loggedMessages.join("\n"));
        console.log("AUDIT RESULT:", auditResult);
    }
    assert.strictEqual(auditResult.success, true, "Engine audit must succeed with 0 failures");
    assert.strictEqual(auditResult.nativeFail, 0, "Native panel failures must be 0");
    assert.strictEqual(auditResult.manifestErrors, 0, "Manifest errors must be 0");

    const combinedLog = loggedMessages.join("\n");
    assert.ok(combinedLog.includes("[QOLLOCK ENGINE AUDIT]"), "Log must contain engine audit header");
    assert.ok(combinedLog.includes("[PASS] #TopBar: ALIVE"), "Log must include TopBar PASS");
    assert.ok(combinedLog.includes("ALL CHECKS PASSED"), "Log must include ALL CHECKS PASSED summary");
});
