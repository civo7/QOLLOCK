"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function fixture() {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    hud.sandbox.eval("Math.random = () => 0;");
    const { $, QOL: Q } = hud.sandbox.global;
    hud.root.AddClass("joined_team");
    const add = (parent, id, classes = []) => {
        const panel = $.CreatePanel("Panel", parent, id);
        for (const name of classes) panel.AddClass(name);
        return panel;
    };
    const text = (parent, id, value, classes = []) => {
        const panel = $.CreatePanel("Label", parent, id);
        panel.text = value;
        for (const name of classes) panel.AddClass(name);
        return panel;
    };
    const core = add(hud.root, "", ["HudCore"]);
    const gameplay = add(core, "gameplay_hud");
    const retired = add(hud.doc.absRoot, "RetiredTestGeneration");
    const config = patch => Q.core.ConfigAdapter.loadFromFlat(patch);
    const find = id => hud.root.FindChildTraverse(id);
    return { hud, Q, $, add, text, core, gameplay, retired, config, find };
}

function addFire(env, parent, value) {
    const source = env.add(parent, "hudActivePlayerStats");
    const list = env.add(source, "StatList");
    const weapon = env.add(list, "WeaponColumn");
    const row = env.add(weapon, "fireRateContainer", ["shouldShow", "isPositive"]);
    const core = env.add(row, "", ["miniModifierCore"]);
    env.text(core, "", value, ["statNumber"]);
    env.text(core, "", "%", ["statPostfix"]);
    return { source, row, core };
}

function enableCrosshair(env) {
    env.config({ ENABLE_CROSSHAIR_STATS: 1, CROSSHAIR_STATS_SHOW_FIRERATE: 1, CROSSHAIR_STATS_SHOW_BUFFS: 1,
        CROSSHAIR_STATS_X_OFFSET: 25, CROSSHAIR_STATS_Y_OFFSET: 20, CROSSHAIR_STATS_SCALE: 140, CROSSHAIR_STATS_OPACITY: 0.6 });
}

function addTopbar(env, clock = "20:00") {
    const top = env.add(env.root || env.hud.root, "TopBar");
    const gameTime = env.text(top, "GameTime", clock);
    return { top, gameTime };
}

function addCapture(env, top, nativeBuff = true) {
    const charges = env.add(top, "RejuvenatorCharges");
    const friendly = env.add(charges, "RejuvenatorFriendly", ["RejuvCount_3"]);
    env.add(charges, "RejuvenatorEnemy", ["RejuvCount_0"]);
    const timer = env.add(charges, "RejuvenatorTimer", nativeBuff ? ["has_rejuv"] : []);
    const panel = env.add(top, "RejuvBuff");
    const label = env.text(panel, "RejuvTimeBuff", "");
    return { charges, friendly, timer, panel, label };
}

function addRoster(env, top) {
    const teams = env.add(top, "TeamsContainer");
    const team = env.add(teams, "TeamFriendly");
    const contents = env.add(team, "PlayerContents");
    const players = env.add(contents, "PlayersContainer");
    return { teams, team, contents, players };
}

function addUlt(env, players, cooldown) {
    const player = env.add(players, "Player");
    const details = env.add(player, "PlayerDetailsContainer");
    const status = env.add(details, "StatusRow");
    const ultimate = env.add(status, "UltimateStatus");
    const background = env.add(ultimate, "UltimateStatusBG");
    const hidden = env.text(background, "UltimateCooldownTextHidden", cooldown);
    const shown = env.text(status, "UltimateCooldownTextShown", "");
    return { player, status, background, hidden, shown };
}

function createdTree(panel) {
    const result = [], queue = [panel];
    while (queue.length) { const current = queue.shift(); if (!current) continue; result.push(current); queue.push(...current.Children()); }
    return result;
}

const createdOwners = [
    { id: "ql_crosshair_stats", key: "ENABLE_CROSSHAIR_STATS", overlay: "QOLCrosshairStatsOverlay", label: "QOLCrosshairStatRow_fireRate_value" },
    { id: "ql_urn_timer", key: "ENABLE_URN_TIMER", overlay: "RiftTimer", label: "RiftTimerLabel" }
];
function directCreatedOwner(env, def) {
    env.Q.core.App.shutdown();
    env.config({ [def.key]: 1, CROSSHAIR_STATS_SHOW_FIRERATE: 1, CROSSHAIR_STATS_SHOW_BUFFS: 1 });
    const create = () => env.Q.core.FeatureRegistry.getManifest(def.id).create({ id: def.id, config: { view: () => env.Q.core.ConfigStore.view(def.id) } });
    const source = addFire(env, env.hud.root, "+12");
    const { top, gameTime } = addTopbar(env, "12:00"), map = env.add(env.hud.root, "hud_minimap");
    env.add(map, "TestCapturePoint", ["map_button", "capture_point", "koth_warning"]);
    return { feature: create(), create, source, top, gameTime };
}

for (const def of createdOwners) {
    test(def.id + ": retires all living moved children and contains stopped hooks", () => {
        const env = fixture(), { feature, source } = directCreatedOwner(env, def);
        feature.onEnable(); env.hud.clock.advance(600); const overlay = env.find(def.overlay);
        const children = createdTree(overlay).slice(1); assert.ok(children.length > 0);
        for (const panel of children) panel.SetParent(env.retired);
        env.hud.clock.advance(600); for (const panel of children) assert.equal(panel.IsValid(), false, panel.id);
        assert.equal(env.find(def.label).text, def.id === "ql_urn_timer" ? "0:20" : "+12%");
        const moved = env.find(def.label); moved.SetParent(env.retired);
        feature.onDisable(); env.hud.clock.advance(20); assert.equal(moved.IsValid(), false);
        feature.onSettingsChanged(); env.hud.clock.advance(1000); assert.equal(env.find(def.overlay), null);
        assert.equal(source.row.BHasClass("shouldShow"), true); assert.equal(source.source.IsValid(), true);
        assert.deepEqual(env.hud.clock.errors, []);
    });

    test(def.id + ": rapid re-enable waits for every retired tree instead of adopting it", () => {
        const env = fixture(), { feature, create } = directCreatedOwner(env, def);
        feature.onEnable(); env.hud.clock.advance(600); const previous = env.find(def.overlay);
        feature.onDisable(); let writes = 0;
        previous.style = new Proxy(previous.style, { set(target, key, value) { writes++; target[key] = value; return true; } });
        const next = create(); next.onEnable(); next.onSettingsChanged(); assert.equal(writes, 0);
        env.hud.clock.advance(600); assert.equal(previous.IsValid(), false);
        assert.ok(env.find(def.overlay)); assert.notEqual(env.find(def.overlay), previous);
        next.onDisable(); env.hud.clock.advance(20); assert.equal(env.find(def.overlay), null); assert.deepEqual(env.hud.clock.errors, []);
    });

    test(def.id + ": current Hud generations reset private source/model bindings while old sources stay live", () => {
        const env = fixture(), { feature, source, gameTime } = directCreatedOwner(env, def);
        feature.onEnable(); env.hud.clock.advance(600); gameTime.text = "12:05"; env.hud.clock.advance(600);
        if (def.id === "ql_urn_timer") assert.equal(env.find(def.label).text, "0:15");
        const previous = createdTree(env.find(def.overlay));
        env.hud.doc.root = env.$.CreatePanel("CitadelHud", null, "Hud"); env.hud.doc.root.AddClass("joined_team");
        const core = env.add(env.hud.doc.root, "", ["HudCore"]); env.add(core, "gameplay_hud");
        addFire(env, env.hud.doc.root, "+36");
        const top = env.add(core, "TopBar"); env.text(top, "GameTime", "12:05");
        const map = env.add(env.hud.doc.root, "hud_minimap"); env.add(map, "NextCapturePoint", ["map_button", "capture_point", "koth_warning"]);
        feature.onSettingsChanged(); env.hud.clock.advance(600);
        const label = env.hud.doc.root.FindChildTraverse(def.label);
        assert.equal(label.text, def.id === "ql_urn_timer" ? "0:20" : "+36%");
        for (const panel of previous) assert.equal(panel.IsValid(), false, panel.id);
        assert.equal(source.source.IsValid(), true); assert.equal(env.hud.root.IsValid(), true);
        feature.onDisable(); env.hud.clock.advance(20);
        assert.equal(env.hud.doc.root.FindChildTraverse(def.overlay), null); assert.deepEqual(env.hud.clock.errors, []);
    });
}

test("crosshair replaces an alive overlay generation with its current layout and content", () => {
    const env = fixture();
    addFire(env, env.hud.root, "+12");
    enableCrosshair(env);
    env.hud.clock.advance(200);
    const first = env.find("QOLCrosshairStatsOverlay");
    assert.equal(first.style.marginLeft, "160px");
    assert.equal(first.style.marginTop, "-20px");
    first.SetParent(env.retired);
    env.hud.clock.advance(100);
    const second = env.find("QOLCrosshairStatsOverlay");
    assert.notEqual(second, first);
    assert.equal(second.style.uiScale, "140%");
    assert.equal(second.style.opacity, "0.60");
    assert.equal(env.find("QOLCrosshairStatRow_fireRate_value").text, "+12%");
    env.config({ ENABLE_CROSSHAIR_STATS: 0 });
    env.hud.clock.advance(1000);
    assert.equal(env.find("QOLCrosshairStatsOverlay"), null);
    assert.deepEqual(env.hud.clock.errors, []);
});

test("crosshair retries partial row creation and incomplete style writes", () => {
    const env = fixture();
    addFire(env, env.hud.root, "+12");
    const create = env.$.CreatePanel;
    let rejectCreation = true;
    env.$.CreatePanel = (type, parent, id, properties) => {
        if (id === "QOLCrosshairStatRow_fireRate_value" && rejectCreation) { rejectCreation = false; throw Error("temporary creation failure"); }
        return create(type, parent, id, properties);
    };
    enableCrosshair(env);
    env.hud.clock.advance(300);
    const overlay = env.find("QOLCrosshairStatsOverlay");
    assert.equal(env.find("QOLCrosshairStatRow_fireRate_value").text, "+12%");
    let rejectScale = true;
    overlay.style = new Proxy(overlay.style, { set(target, key, value) {
        if (key === "uiScale" && rejectScale) { rejectScale = false; throw Error("temporary native style rejection"); }
        target[key] = value; return true;
    } });
    env.config({ CROSSHAIR_STATS_SCALE: 160 });
    assert.equal(overlay.style.uiScale, "140%");
    env.hud.clock.advance(100);
    assert.equal(overlay.style.uiScale, "160%");
    assert.deepEqual(env.hud.clock.errors, []);
});

test("crosshair releases detached source value handles and picks a new native modifier core", () => {
    const env = fixture();
    const { row, core } = addFire(env, env.hud.root, "+12");
    enableCrosshair(env);
    env.hud.clock.advance(200);
    core.SetParent(env.retired);
    const replacement = env.add(row, "", ["miniModifierCore"]);
    env.text(replacement, "", "+30", ["statNumber"]);
    env.text(replacement, "", "%", ["statPostfix"]);
    env.hud.clock.advance(100);
    assert.equal(env.find("QOLCrosshairStatRow_fireRate_value").text, "+30%");
    assert.deepEqual(env.hud.clock.errors, []);
});

test("ultimate mirror observes roster replacement with unchanged player counts and retires old classes", () => {
    const env = fixture();
    const { top } = addTopbar(env);
    const roster = addRoster(env, top);
    const first = addUlt(env, roster.players, "45");
    env.config({ ENABLE_ULT_COOLDOWNS: 1 });
    env.hud.clock.advance(250);
    assert.equal(first.shown.text, "45");
    roster.players.SetParent(env.retired);
    const players = env.add(roster.contents, "PlayersContainer");
    const second = addUlt(env, players, "18");
    env.hud.clock.advance(250);
    assert.equal(second.shown.text, "18");
    assert.equal(first.shown.text, "");
    assert.equal(first.player.BHasClass("ult_cooldowns_active"), false);
    assert.equal(first.hidden.text, "45");
    env.config({ ENABLE_ULT_COOLDOWNS: 0 });
    assert.equal(second.player.BHasClass("ult_cooldowns_active"), false);
    assert.equal(second.shown.text, "");
    assert.deepEqual(env.hud.clock.errors, []);
});

test("ultimate mirror binds replacement labels and clears obsolete text after source loss", () => {
    const env = fixture();
    const { top } = addTopbar(env);
    const { players } = addRoster(env, top);
    const slot = addUlt(env, players, "45");
    env.config({ ENABLE_ULT_COOLDOWNS: 1 });
    env.hud.clock.advance(250);
    slot.hidden.SetParent(env.retired);
    slot.shown.SetParent(env.retired);
    const hidden = env.text(slot.background, "UltimateCooldownTextHidden", "9");
    const shown = env.text(slot.status, "UltimateCooldownTextShown", "");
    env.hud.clock.advance(250);
    assert.equal(shown.text, "9");
    assert.equal(slot.shown.text, "");
    hidden.SetParent(env.retired);
    env.hud.clock.advance(250);
    assert.equal(shown.text, "");
    env.config({ ENABLE_ULT_COOLDOWNS: 0 });
    assert.equal(slot.player.BHasClass("ult_cooldowns_active"), false);
    assert.deepEqual(env.hud.clock.errors, []);
});

test("ultimate partial enable failure unwinds owned presentation and permits a clean retry", () => {
    const env = fixture();
    const { top } = addTopbar(env);
    const { players } = addRoster(env, top);
    const slot = addUlt(env, players, "45");
    let rejectWrite = true, content = "";
    Object.defineProperty(slot.shown, "text", {
        configurable: true, get: () => content,
        set(value) { if (rejectWrite) throw Error("temporary native label rejection"); content = value; }
    });
    env.config({ ENABLE_ULT_COOLDOWNS: 1 });
    assert.equal(env.Q.core.FeatureRegistry.isEnabled("ql_ult_cooldowns"), false);
    assert.equal(slot.player.BHasClass("ult_cooldowns_active"), false);
    assert.equal(top.BHasClass("ult_cooldowns_active"), false);
    rejectWrite = false;
    env.Q.core.FeatureRegistry.enable("ql_ult_cooldowns");
    assert.equal(content, "45");
    env.config({ ENABLE_ULT_COOLDOWNS: 0 });
    env.hud.clock.advance(1000);
    assert.equal(content, "");
    assert.equal(slot.player.BHasClass("ult_cooldowns_active"), false);
    assert.deepEqual(env.hud.clock.errors, []);
});

test("rejuv retains a capture through an unknown charge-source gap and updates a replacement topbar", () => {
    const env = fixture();
    const { top, gameTime } = addTopbar(env);
    const first = addCapture(env, top);
    env.config({ ENABLE_BUFF_HUD: 1 });
    env.hud.clock.advance(300);
    assert.equal(first.label.text, "3:00");
    first.charges.SetParent(env.retired);
    gameTime.text = "20:01";
    env.hud.clock.advance(600);
    assert.equal(first.panel.style.opacity, "1.00");
    assert.equal(first.label.text, "2:59");
    top.SetParent(env.retired);
    const next = addTopbar(env, "20:02");
    const second = addCapture(env, next.top);
    env.hud.clock.advance(600);
    assert.equal(first.panel.style.opacity, "0.00");
    assert.equal(first.panel.BHasClass("pop-out"), false);
    assert.equal(second.panel.style.opacity, "1.00");
    assert.equal(second.label.text, "2:58");
    env.config({ ENABLE_BUFF_HUD: 0 });
    env.hud.clock.advance(1000);
    assert.equal(second.panel.style.opacity, "0.00");
    assert.equal(second.panel.BHasClass("pop-out"), false);
    assert.deepEqual(env.hud.clock.errors, []);
});

test("rejuv publishes scalar phase state for the minimap-only consumer and resets at match transitions", () => {
    const env = fixture();
    const { top, gameTime } = addTopbar(env);
    env.config({ ENABLE_REJUV_HUD: 0, ENABLE_BUFF_HUD: 0, ENABLE_MINIMAP_REJUV_TIMER: 1 });
    env.hud.clock.advance(400);
    assert.equal(env.Q.core.FeatureRegistry.isEnabled("ql_rejuv_hud"), true);
    assert.deepEqual(JSON.parse(JSON.stringify(env.Q.state.rejuvState)), { running: true, spawnWaiting: true, counter: 0 });
    const map = env.add(env.hud.root, "hud_minimap");
    const midboss = env.add(map, "TestMidBoss", ["mid_boss", "map_button", "midboss_spawned"]);
    env.hud.clock.advance(10500);
    midboss.RemoveClass("midboss_spawned");
    gameTime.text = "20:01";
    env.hud.clock.advance(600);
    assert.equal(env.Q.state.rejuvState.spawnWaiting, false);
    assert.equal(env.Q.state.rejuvState.counter, 420);
    assert.deepEqual(Object.keys(env.Q.state.rejuvState).sort(), ["counter", "running", "spawnWaiting"]);
    env.hud.root.AddClass("InHideout");
    env.hud.clock.advance(300);
    assert.equal(env.Q.state.rejuvState.running, false);
    assert.equal(env.Q.state.rejuvState.counter, 0);
    env.hud.root.RemoveClass("InHideout");
    gameTime.text = "0:01";
    env.hud.clock.advance(400);
    assert.equal(env.Q.state.rejuvState.spawnWaiting, true);
    env.config({ ENABLE_MINIMAP_REJUV_TIMER: 0 });
    assert.equal(env.Q.state.rejuvState.running, false);
    assert.deepEqual(env.hud.clock.errors, []);
    assert.equal(top.IsValid(), true);
});

test("rejuv retries a rejected native text write without freezing the phase render", () => {
    const env = fixture();
    const { top, gameTime } = addTopbar(env);
    const capture = addCapture(env, top);
    env.config({ ENABLE_BUFF_HUD: 1 });
    env.hud.clock.advance(300);
    let content = capture.label.text, rejectWrite = true;
    Object.defineProperty(capture.label, "text", {
        configurable: true, get: () => content,
        set(value) { if (rejectWrite) { rejectWrite = false; throw Error("temporary native text failure"); } content = value; }
    });
    gameTime.text = "20:01";
    env.hud.clock.advance(700);
    assert.equal(content, "2:59");
    assert.equal(capture.panel.style.opacity, "1.00");
    env.config({ ENABLE_BUFF_HUD: 0 });
    const calls = env.hud.clock.errors.length;
    env.hud.clock.advance(2000);
    assert.equal(env.hud.clock.errors.length, calls);
    assert.equal(capture.panel.style.opacity, "0.00");
});

test("urn rebinds live minimap and topbar owners without changing its warning deadline", () => {
    const env = fixture();
    const { top, gameTime } = addTopbar(env, "12:00");
    const map = env.add(env.hud.root, "hud_minimap");
    const button = env.add(map, "TestCapturePoint", ["map_button", "capture_point", "koth_warning"]);
    env.config({ ENABLE_URN_TIMER: 1 });
    env.hud.clock.advance(500);
    const first = env.find("RiftTimer");
    assert.equal(env.find("RiftTimerLabel").text, "0:20");
    map.SetParent(env.retired);
    const replacementMap = env.add(env.hud.root, "hud_minimap");
    env.add(replacementMap, "NextCapturePoint", ["map_button", "capture_point", "koth_warning"]);
    gameTime.text = "12:05";
    env.hud.clock.advance(500);
    assert.equal(env.find("RiftTimerLabel").text, "0:15");
    top.SetParent(env.retired);
    addTopbar(env, "12:05");
    env.hud.clock.advance(500);
    const second = env.find("RiftTimer");
    assert.notEqual(second, first);
    assert.equal(first.IsValid(), false);
    assert.equal(env.find("RiftTimerLabel").text, "0:15");
    env.config({ ENABLE_URN_TIMER: 0 });
    env.hud.clock.advance(1000);
    assert.equal(second.IsValid(), false);
    assert.equal(env.find("RiftTimer"), null);
    assert.deepEqual(env.hud.clock.errors, []);
    assert.equal(button.IsValid(), true);
});

test("urn retries a partial overlay creation and resets the spawn window for a new match", () => {
    const env = fixture();
    const { gameTime } = addTopbar(env, "12:00");
    const create = env.$.CreatePanel;
    let reject = true;
    env.$.CreatePanel = (type, parent, id, properties) => {
        if (id === "RiftTimerLabel" && reject) throw Error("temporary native creation failure");
        return create(type, parent, id, properties);
    };
    env.config({ ENABLE_URN_TIMER: 1 });
    env.hud.clock.advance(500);
    assert.equal(env.find("RiftTimer").visible, false);
    assert.equal(env.find("RiftTimerLabel"), null);
    reject = false;
    env.hud.clock.advance(1000);
    assert.equal(env.find("RiftTimerLabel").text, "0:00 - 1:20");
    gameTime.text = "0:01";
    env.hud.clock.advance(500);
    assert.equal(env.find("RiftTimerLabel").text, "11:19 - 13:19");
    env.config({ ENABLE_URN_TIMER: 0 });
    env.hud.clock.advance(1000);
    assert.equal(env.find("RiftTimer"), null);
    assert.deepEqual(env.hud.clock.errors, []);
});

test("retired economy config keys stay recognized and inactive without native discovery or polling", () => {
    const env = fixture();
    const polls = [];
    const createPoll = env.Q.core.Scheduler.createPollLoop;
    env.Q.core.Scheduler.createPollLoop = (callback, rate, id) => { polls.push(id); return createPoll(callback, rate, id); };
    env.config({ ENABLE_MIN_SOULS: 1, ENABLE_UNSPENT_SOULS: 1 });
    const exported = env.Q.core.ConfigAdapter.exportToFlat();
    assert.equal(exported.ENABLE_MIN_SOULS, 0, "retired saved values retain their established disabled normalization");
    assert.equal(exported.ENABLE_UNSPENT_SOULS, 0);
    env.Q.core.FeatureRegistry.enable("ql_spm");
    env.Q.core.FeatureRegistry.enable("ql_unspent");
    assert.equal(polls.includes("ql_spm"), false);
    assert.equal(polls.includes("ql_unspent"), false);
    assert.equal(env.find("PlayerSPMDisplay"), null);
    assert.equal(env.find("SpentSoulDisplay"), null);
    assert.equal(env.Q.core.FeatureRegistry.getManifest("ql_spm").test, undefined);
    assert.equal(env.Q.core.FeatureRegistry.getManifest("ql_unspent").test, undefined);
    env.config({ ENABLE_MIN_SOULS: 0, ENABLE_UNSPENT_SOULS: 0 });
    assert.deepEqual(env.hud.clock.errors, []);
});
