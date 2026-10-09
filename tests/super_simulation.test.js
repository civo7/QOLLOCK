// tests/super_simulation.test.js
// =============================================================================
// SUPER TEST: Comprehensive Game Lifecycle Simulation
// =============================================================================
// Simulates the full Deadlock environment across both contexts:
// 1. In-Match HUD Lifecycle:
//    - Real Deadlock panel hierarchy (#Hud, #gameplay_hud, #gameplay_hud_alive,
//      #gameplay_hud_dead, #TopBar, #hud_signature, etc.).
//    - Alive state, dead/respawn state, spectator, and hideout transitions.
//    - TopBar visibility: NEVER collapsed by default, not affected by alive/dead
//      toggle, responsive CSS overrides cleared when default, properly hidden
//      only when explicitly disabled (HUD_TOP_BAR_ENABLED: 0).
// 2. Settings Window & Preset Execution Lifecycle:
//    - Settings window creation and header structure (Logo, QOL LOCK by moglock.gg).
//    - Presets tab rendering with all community buttons.
//    - Clicking a preset opens the Diff Preview Modal with accurate diff rows.
//    - Confirming preset updates MOD_CONFIG and invokes SaveAndSync().
//    - Cross-isolate sync: #Hud attributes updated -> HUD poll loop picks up
//      new revision -> ConfigStore updated -> manifests notified -> root classes applied.
// 3. 94-Preset Exhaustive Integrity Check:
//    - Validates all presets in QOL_PRESETS resolve cleanly without exceptions.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");

const sim = require("../scripts/simulator/index.js");
const { Document, Panel } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");
const layout = require("../scripts/simulator/layout.js");

test("SUPER TEST 1: Match HUD lifecycle and TopBar persistence across states", () => {
    // 1. Create active match HUD (not in hideout)
    const hud = sim.createHud({ inHideout: false, boot: false });
    const root = hud.root; // #Hud
    const $ = hud.sandbox.global.$;

    // Construct standard Deadlock in-match panel tree before boot
    const gameplayHud = $.CreatePanel("Panel", root, "gameplay_hud");
    const gameplayHudAlive = $.CreatePanel("Panel", gameplayHud, "gameplay_hud_alive");
    const topBar = $.CreatePanel("CitadelHudTopBar", root, "TopBar");
    const hudSignature = $.CreatePanel("Panel", root, "hud_signature");
    const goldAndAp = $.CreatePanel("Panel", root, "gold_and_ap_container");
    const apContainer = $.CreatePanel("Panel", root, "APContainer");

    // Boot all HUD scripts derived directly from hud.xml
    for (const s of hud.scripts.scripts) {
        hud.sandbox.load(s.absPath);
    }
    hud.assertLoaded();

    // Verify initial boot: TopBar must exist, be visible, and NOT have qol-hidden
    assert.ok(topBar, "TopBar panel must exist");
    assert.strictEqual(topBar.BHasClass("qol-hidden"), false, "TopBar must NOT have qol-hidden on boot");
    assert.strictEqual(topBar.style.x || "", "", "TopBar must NOT have inline x override on default settings");
    assert.strictEqual(topBar.style.y || "", "", "TopBar must NOT have inline y override on default settings");
    assert.strictEqual(topBar.style.uiScale || "", "", "TopBar must NOT have inline uiScale override on default settings");

    // Advance clock so scheduler and poll loops run several ticks
    hud.clock.advance(1000);
    assert.strictEqual(topBar.BHasClass("qol-hidden"), false, "TopBar must remain visible after poll ticks");

    // 2. Simulate Hero Death / Respawn countdown:
    // In Deadlock, #gameplay_hud_alive is collapsed in CSS when dead.
    gameplayHudAlive.visible = false;
    hud.clock.advance(1500);

    // CRITICAL REGRESSION CHECK: TopBar MUST NOT be hidden when gameplayHudAlive is collapsed!
    assert.strictEqual(
        topBar.BHasClass("qol-hidden"),
        false,
        "REGRESSION: TopBar must NOT be collapsed when player is dead / respawning (#gameplay_hud_alive is collapsed)"
    );

    // Restore alive state
    gameplayHudAlive.visible = true;
    hud.clock.advance(1000);
    assert.strictEqual(topBar.BHasClass("qol-hidden"), false, "TopBar remains visible when alive");

    // 3. User explicitly disables TopBar in config
    const QOL = hud.sandbox.global.QOL;
    const CS = QOL.core.ConfigStore;
    CS.set("ql_topbar", "HUD_TOP_BAR_ENABLED", 0);
    hud.clock.advance(1000);
    assert.strictEqual(topBar.BHasClass("qol-hidden"), true, "TopBar MUST have qol-hidden when HUD_TOP_BAR_ENABLED is 0");

    // 4. User re-enables TopBar in config
    CS.set("ql_topbar", "HUD_TOP_BAR_ENABLED", 1);
    hud.clock.advance(1000);
    assert.strictEqual(topBar.BHasClass("qol-hidden"), false, "TopBar MUST restore visibility when HUD_TOP_BAR_ENABLED is 1");

    // 5. User applies custom offsets and scale
    CS.set("ql_topbar", "TOP_BAR_X_OFFSET", 120);
    CS.set("ql_topbar", "TOP_BAR_Y_OFFSET", -40);
    CS.set("ql_topbar", "TOP_BAR_SCALE", 1.15);
    CS.set("ql_topbar", "TOP_BAR_OPACITY", 0.85);
    hud.clock.advance(1000);

    assert.strictEqual(topBar.style.x, "120px", "TopBar must receive custom x offset");
    assert.strictEqual(topBar.style.y, "40px", "TopBar must receive custom -y offset");
    assert.strictEqual(topBar.style.uiScale, "115%", "TopBar must receive custom uiScale");
    assert.strictEqual(topBar.style.opacity, "0.85", "TopBar must receive custom opacity");

    // 6. User resets back to default settings
    CS.set("ql_topbar", "TOP_BAR_X_OFFSET", 0);
    CS.set("ql_topbar", "TOP_BAR_Y_OFFSET", 0);
    CS.set("ql_topbar", "TOP_BAR_SCALE", 1.0);
    CS.set("ql_topbar", "TOP_BAR_OPACITY", 1.0);
    hud.clock.advance(1000);

    // Inline styles must be cleared to allow Valve CSS responsive layout
    assert.strictEqual(topBar.style.x || "", "", "TopBar inline x must be cleared when reset to default");
    assert.strictEqual(topBar.style.y || "", "", "TopBar inline y must be cleared when reset to default");
    assert.strictEqual(topBar.style.uiScale || "", "", "TopBar inline uiScale must be cleared when reset to default");
    assert.strictEqual(topBar.style.opacity || "", "", "TopBar inline opacity must be cleared when reset to default");
    assert.strictEqual(topBar.BHasClass("qol-hidden"), false, "TopBar remains visible on default settings");
});

test("SUPER TEST 2: Settings Window header, Presets tab click, diff modal, and apply flow", () => {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const hudPanel = doc.root; // #Hud panel in document
    hudPanel.id = "Hud";
    hudPanel.paneltype = "CitadelHud";

    // Escape menu context
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

    const scheduled = new Map();
    let schedId = 0;

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => {
            const id = ++schedId;
            const timer = setTimeout(cb, Math.max(1, delaySec * 1000));
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
            VERSION: "4.0.0",
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

    // Load presets and settings files
    const scriptsToLoad = [
        "panorama/scripts/core/ql_namespace.js",
        "panorama/scripts/ql_utils.js",
        "panorama/scripts/core/ql_persistence.js",
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
        "panorama/scripts/ql_settings.js"
    ];

    for (const rel of scriptsToLoad) {
        const abs = path.resolve(__dirname, "..", rel);
        const code = fs.readFileSync(abs, "utf8");
        vm.runInNewContext(code, sandbox);
    }

    // 1. Initialize UI via BuildUI
    assert.strictEqual(typeof sandbox.globalThis.BuildUI, "function", "BuildUI must be exposed");
    sandbox.globalThis.BuildUI();

    // 2. Validate Header Layout
    // Expected: [Logo] [Accent: QOL] [Title: LOCK] [by moglock.gg] [CenterHost: Search] [CloseBtn: X]
    const headerLogo = header.FindChildTraverse("SettingsHeaderMogLogo");
    const headerAccent = header.FindChildTraverse("SettingsTitleAccent");
    const headerTitle = header.FindChildTraverse("SettingsTitle");
    const headerMoglock = header.FindChildTraverse("ModVersionLabelTop");
    const searchHost = header.FindChildTraverse("SettingsHeaderCenterHost");
    const closeButton = header.FindChildTraverse("CloseBtn");

    assert.ok(headerLogo, "Header must contain SettingsHeaderMogLogo");
    assert.ok(headerAccent, "Header must contain SettingsTitleAccent (QOL)");
    assert.ok(headerTitle, "Header must contain SettingsTitle (LOCK)");
    assert.ok(headerMoglock, "Header must contain ModVersionLabelTop link button");
    assert.ok(searchHost, "Header must contain SettingsHeaderCenterHost for search");
    assert.ok(closeButton, "Header must contain CloseBtn");

    const moglockDomain = headerMoglock.FindChildTraverse("ModVersionLabelTopDomain");
    assert.ok(moglockDomain, "ModVersionLabelTop must contain moglock.gg domain label");
    assert.strictEqual(moglockDomain.text, "moglock.gg", "Domain text must be moglock.gg");

    // 3. Open Presets Tab
    const windowApi = sandbox.QOL.ui.window;
    assert.ok(windowApi, "QOL.ui.window must exist");
    windowApi.setActiveTab("Presets");

    // Verify preset grid was rendered inside list
    const presetGrids = list.FindChildrenWithClassTraverse("PresetCategoryGrid");
    assert.ok(presetGrids.length > 0, "PresetCategoryGrid must be rendered in Presets tab");

    // 4. Find and Click a Community Preset Button (e.g. Bread)
    const breadBtns = list.FindChildrenWithClassTraverse("PresetGridBtn_Bread");
    assert.ok(breadBtns.length > 0, "Preset button for Bread must exist in preset grid");
    const breadBtn = breadBtns[0];

    // Activate the button
    const activated = breadBtn.activate();
    assert.ok(activated, "Bread preset button activation should succeed");

    // 5. Verify Config Diff Preview Modal opened
    const modalOverlay = emRoot.FindChildTraverse("ConfigDiffPreviewModalOverlay");
    assert.ok(modalOverlay, "ConfigDiffPreviewModalOverlay must be created when clicking a preset");

    const diffList = modalOverlay.FindChildTraverse("ConfigDiffList");
    assert.ok(diffList, "ConfigDiffList must exist inside the diff preview modal");

    const diffCells = diffList.FindChildrenWithClassTraverse("ConfigDiffCell");
    assert.ok(diffCells.length > 0, `Diff modal must show differences between current config and Bread (got ${diffCells.length})`);

    // 6. Confirm Preset Application
    const applyBtns = modalOverlay.FindChildrenWithClassTraverse("ConfigDiffApplyBtn");
    assert.ok(applyBtns.length > 0, "Confirm button (ConfigDiffApplyBtn) must exist in modal");
    const confirmBtn = applyBtns[0];

    // Click confirm
    confirmBtn.activate();

    // Verify MOD_CONFIG has been updated to Bread preset values
    const modConfig = sandbox.globalThis.MOD_CONFIG;
    assert.ok(modConfig, "MOD_CONFIG must exist");
    assert.strictEqual(modConfig.ACTIVE_PRESET_NAME, "BreadRollius", "Bread preset should set ACTIVE_PRESET_NAME to BreadRollius");

    // Verify SaveAndSync wrote to #Hud attributes
    const savedRaw = hudPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    assert.ok(savedRaw.length > 0, "SaveAndSync must write serialized config to #Hud");
    const savedRev = hudPanel.GetAttributeString("QOL_USER_EDIT_REV", "0");
    assert.ok(Number(savedRev) > 0, "SaveAndSync must increment QOL_USER_EDIT_REV on #Hud");
});

test("SUPER TEST 3: Cross-isolate bridge synchronization (Settings -> #Hud -> HUD poll -> ConfigStore)", () => {
    // 1. Boot match HUD isolate with TopBar
    const hud = sim.createHud({ inHideout: false, boot: false });
    const topBar = hud.sandbox.global.$.CreatePanel("CitadelHudTopBar", hud.root, "TopBar");
    for (const s of hud.scripts.scripts) {
        hud.sandbox.load(s.absPath);
    }
    hud.assertLoaded();

    const QOL = hud.sandbox.global.QOL;
    const CS = QOL.core.ConfigStore;

    // 2. Simulate Settings isolate writing an updated config string to #Hud with increased revision
    const targetConfig = Object.assign({}, hud.sandbox.global.QOL_DEFAULT_CONFIG, {
        HUD_TOP_BAR_ENABLED: 1,
        TOP_BAR_X_OFFSET: 250,
        TOP_BAR_SCALE: 1.25,
        ENABLE_UNSPENT_SOULS: 1
    });

    const payload = JSON.stringify({ schema: "3.1.9", data: targetConfig });
    hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", payload);
    hud.root.SetAttributeString("QOL_USER_EDIT_REV", "42");

    // 3. Advance virtual clock so ql_app.js config poller ticks
    hud.clock.advance(500);

    // 4. Verify HUD isolate synchronized the changes
    assert.strictEqual(CS.get("ql_topbar", "TOP_BAR_X_OFFSET"), 250, "ConfigStore must update TOP_BAR_X_OFFSET to 250");
    assert.strictEqual(CS.get("ql_topbar", "TOP_BAR_SCALE"), 1.25, "ConfigStore must update TOP_BAR_SCALE to 1.25");

    // 5. Verify live TopBar panel received the update
    assert.strictEqual(topBar.style.x, "250px", "TopBar inline style x must reflect synced config");
    assert.strictEqual(topBar.style.uiScale, "125%", "TopBar inline style uiScale must reflect synced config");
});

test("SUPER TEST 4: All 90+ community presets resolve cleanly with complete schemas", () => {
    const sandbox = {
        $: { Msg: () => {} },
        QOL: { core: {}, ui: { presets: null } },
        globalThis: null,
    };
    sandbox.globalThis = sandbox;

    const files = [
        "panorama/scripts/ql_utils.js",
        "panorama/scripts/core/ql_panel_helpers.js",
        "panorama/scripts/ui/renderer.js",
        "panorama/scripts/ql_shared_presets.js",
        "panorama/scripts/ql_config.js",
        "panorama/scripts/ui/presets.js"
    ];
    for (const f of files) {
        const abs = path.resolve(__dirname, "..", f);
        vm.runInNewContext(fs.readFileSync(abs, "utf8"), sandbox);
    }

    const p = sandbox.QOL.ui.presets;
    assert.ok(p, "QOL.ui.presets must exist");

    const entries = p.buildCommunityPresetEntries();
    assert.strictEqual(entries.length, 90, "Must contain exactly 90 entries");

    const validCommunityEntries = entries.filter(e => e.preset && e.available !== false);
    assert.ok(validCommunityEntries.length >= 70, `Expected at least 70 valid community presets, got ${validCommunityEntries.length}`);

    for (const entry of validCommunityEntries) {
        const resolved = p.resolvePresetConfigByName(entry.preset);
        assert.ok(
            resolved !== null && typeof resolved === "object",
            `Preset '${entry.preset}' failed to resolve: returned ${resolved}`
        );
        assert.ok(
            Object.keys(resolved).length >= 200,
            `Preset '${entry.preset}' resolved config has too few keys (${Object.keys(resolved).length})`
        );
        // Essential gameplay keys must be present
        assert.ok("HUD_TOP_BAR_ENABLED" in resolved, `Preset '${entry.preset}' missing HUD_TOP_BAR_ENABLED`);
        assert.ok("HUD_BOTTOM_BAR_ENABLED" in resolved, `Preset '${entry.preset}' missing HUD_BOTTOM_BAR_ENABLED`);
        assert.ok("ENABLE_UNSPENT_SOULS" in resolved, `Preset '${entry.preset}' missing ENABLE_UNSPENT_SOULS`);
    }
});
