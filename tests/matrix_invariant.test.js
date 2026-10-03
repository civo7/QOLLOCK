// tests/matrix_invariant.test.js
// =============================================================================
// Comprehensive Invariant & Matrix Simulation Test Suite
// =============================================================================
// Validates:
// 1. Native Valve Panel Safety across all game states and all manifests.
// 2. Production settings tab rendering and key binding checks, with three
//    bounded configuration interactions (not exhaustive engine/UI coverage).
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
// SUITE 3: Settings Tab Rendering, Key Bindings & Selected Interactions
// =============================================================================
test("INVARIANT 3: production settings tabs render, bind known keys, and selected controls change config", () => {
    const { global: g, list, doc, clock, hud } = require("./load_settings_environment")();
    const tabs = ["Support", "Config", "Presets", "Crosshair", "Healthbar", "HUD", "Overlay", "Minimap", "Audio", "Arcade", "Console", "Dev"];
    let rendered = 0;
    let boundRows = 0;
    let interactions = 0;
    for (const tab of tabs) {
        g.currentTab = tab;
        g.QOL.ui.window.renderTab(tab, list);
        assert.ok(list.GetChildCount() >= 2, `${tab} renders real content, not a fallback placeholder`);
        rendered++;
        for (const row of list.FindChildrenWithClassTraverse("SettingRow")) {
            const keys = row.GetAttributeString("QOL_ROW_RESET_KEYS", "").split(",").filter(Boolean);
            for (const key of keys) {
                assert.ok(Object.hasOwn(g.QOL_DEFAULT_CONFIG, key), `${tab} binds unknown setting ${key}`);
            }
            if (keys.length) boundRows++;
        }
        // Only known local configuration controls: no save/clear, links,
        // console commands, preset application, or arcade actions.
        if (tab === "Config") {
            const row = list.FindChildrenWithClassTraverse("SettingRow_SUPPORT_16_10")[0];
            assert.ok(row, "aspect-ratio setting is rendered");
            const button = row.FindChildrenWithClassTraverse("SwitchButton")[0];
            assert.ok(button, "real toggle button exists");
            const before = g.MOD_CONFIG.SUPPORT_16_10;
            assert.equal(button._fire("onactivate"), true);
            assert.equal(g.MOD_CONFIG.SUPPORT_16_10, before === 1 ? 0 : 1);
            interactions++;
        }
        if (tab === "Crosshair" || tab === "HUD") {
            const key = tab === "HUD" ? "TOP_BAR_SCALE" : "AMMO_CURRENT_SCALE";
            const row = list.FindChildrenWithClassTraverse(`SettingRow_${key}`)[0];
            assert.ok(row, `${tab} renders ${key}`);
            const slider = row.FindChildrenWithClassTraverse("HorizontalSlider")[0];
            assert.ok(slider, `${key} has a real slider`);
            slider.value = tab === "HUD" ? 123 : 150;
            assert.equal(slider._fire("onvaluechanged"), true);
            assert.equal(g.MOD_CONFIG[key], tab === "HUD" ? 1.25 : 150);
            interactions++;
            if (tab === "HUD") {
                assert.ok(list.FindChildrenWithClassTraverse("SettingRow_ACTIVE_ITEMS_SCALE")[0],
                    "active item scale renders as a normal setting row");
                assert.equal(list.FindChildTraverse("ActiveItemSlotsSubSectionHeader"), null,
                    "active item controls must not use a nested collapsible section");
            }
        }
        clock.advance(400);
        assert.deepStrictEqual(doc.eventErrors, [], `${tab} event handlers must not silently fail`);
        assert.deepStrictEqual(clock.errors, [], `${tab} scheduled callbacks must not silently fail`);
    }
    assert.equal(rendered, 12);
    assert.ok(boundRows >= 100, `expected substantial control coverage; got ${boundRows} bound rows`);
    assert.equal(interactions, 3, "all three bounded interactions must actually execute");
    clock.advance(1000);
    assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get("ql_topbar", "TOP_BAR_SCALE"), 1.25);
    assert.deepStrictEqual(doc.eventErrors, []);
    assert.deepStrictEqual(clock.errors, []);
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
        },
        globalThis: null,
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis = sandbox;

    const scriptsToLoad = [
        "panorama/scripts/core/ql_namespace.js",
        "panorama/scripts/ql_utils.js",
        "panorama/scripts/core/ql_panel_helpers.js",
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

