"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const loadSettings = require("./load_settings_environment");

const master = "ENABLE_ON_DEATH_GAMES";
const games = ["MINESWEEPER", "BLACKJACK", "FLAPPY_BAT", "GRAVES_TRAINER", "ZERGGY_MANIA", "WHACK_A_REM"];

function configure(hud, patch = {}) {
    const Q = hud.sandbox.global.QOL;
    Q.core.ConfigAdapter.loadFromFlat({ ...hud.sandbox.evalJson("QOL.buildDefaultConfig()"), [master]: 1,
        ...Object.fromEntries(games.map(game => ["ON_DEATH_GAME_" + game, 0])), ON_DEATH_GAME_MINESWEEPER: 1, ...patch });
}

function fixture(config = {}) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    env.sandbox.global.QOL.core.App.shutdown();
    configure(env, config);
    env.sandbox.eval("Math.random = () => 0;");
    const { QOL: Q, $ } = env.sandbox.global;
    const root = env.doc.absRoot;
    const create = () => Q.core.FeatureRegistry.getManifest("ql_on_death_arcade").create({ id: "ql_on_death_arcade", config: { view: () => Q.core.ConfigStore.view("ql_on_death_arcade") } });
    const addTimer = (seconds = "20") => {
        let core = env.root.FindChild("Core");
        if (!core) { core = $.CreatePanel("Panel", env.root, "Core"); core.AddClass("HudCore"); }
        let dead = core.FindChild("gameplay_hud_dead");
        if (!dead) dead = $.CreatePanel("Panel", core, "gameplay_hud_dead");
        const owner = $.CreatePanel("Panel", dead, "respawn_timer");
        const label = $.CreatePanel("Label", owner, ""); label.AddClass("respawn_number"); label.text = seconds;
        return { owner, label };
    };
    const read = (channel, panel = root) => panel.GetAttributeString(Q.bridge.channels[channel].attr, "");
    const escape = $.CreatePanel("Panel", env.root, "EscapeMenu");
    const retired = $.CreatePanel("Panel", null, "RetiredArcadeGeneration");
    return { ...env, Q, $, create, addTimer, read, escape, retired, absoluteRoot: root };
}

test("on-death launch selects the accepted pool and publishes one complete request per death", () => {
    const env = fixture({ ON_DEATH_GAME_MINESWEEPER: 0, ON_DEATH_GAME_BLACKJACK: 1 });
    const timer = env.addTimer("20,5");
    const feature = env.create(); feature.onEnable();
    assert.equal(env.read("onDeathArcadeActive"), "1");
    assert.equal(env.read("onDeathArcadeRequest"), "blackjack");
    const token = env.read("onDeathArcadeToken");
    assert.ok(token);
    env.clock.advance(6000);
    assert.equal(env.read("onDeathArcadeToken"), token, "polling does not relaunch the same death");
    assert.equal(env.read("onDeathArcadeToken", env.root), token);
    timer.label.text = "0"; env.clock.advance(200);
    for (const panel of [env.absoluteRoot, env.root, env.escape]) {
        assert.equal(panel.BHasClass("ShowEscapeMenu"), false);
        assert.equal(env.read("onDeathArcadeEscapeOwned", panel), "");
    }
    assert.equal(env.read("onDeathArcadeActive"), "");
    timer.label.text = "10"; env.clock.advance(200);
    assert.notEqual(env.read("onDeathArcadeToken"), token);
    feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("on-death retries a rejected payload without committing or changing request identity", () => {
    const env = fixture(); env.addTimer();
    const write = env.absoluteRoot.SetAttributeString.bind(env.absoluteRoot);
    const gameAttr = env.Q.bridge.channels.onDeathArcadeRequest.attr;
    let writes = 0;
    env.absoluteRoot.SetAttributeString = (attr, value) => {
        if (attr === gameAttr) { writes++; throw new Error("native bridge target not ready"); }
        write(attr, value);
    };
    const feature = env.create(); feature.onEnable();
    assert.equal(env.read("onDeathArcadeActive"), "", "partial payload is never committed");
    const pendingToken = env.read("onDeathArcadeToken");
    assert.ok(pendingToken);
    env.clock.advance(600);
    assert.ok(writes > 1, "the edge remains pending after the first failed publication");
    env.absoluteRoot.SetAttributeString = write;
    env.clock.advance(200);
    assert.equal(env.read("onDeathArcadeActive"), "1");
    assert.equal(env.read("onDeathArcadeRequest"), "minesweeper");
    assert.equal(env.read("onDeathArcadeToken"), pendingToken);
    feature.onDisable();
});

test("on-death retains a request through missing or unreadable native timer generations", () => {
    const env = fixture(); const timer = env.addTimer();
    const feature = env.create(); feature.onEnable();
    const token = env.read("onDeathArcadeToken");
    timer.owner.SetParent(env.retired);
    env.clock.advance(1200);
    assert.equal(env.read("onDeathArcadeActive"), "1", "a missing source is not respawn evidence");
    const replacement = env.addTimer("{s:respawn_timer}");
    env.clock.advance(1000);
    assert.equal(env.read("onDeathArcadeToken"), token);
    replacement.label.text = "0"; env.clock.advance(200);
    assert.equal(env.read("onDeathArcadeActive"), "");
    assert.equal(timer.owner.IsValid(), true);
    feature.onDisable();
});

test("on-death follows a living native label replacement and late respawn creation", () => {
    const env = fixture(); const feature = env.create(); feature.onEnable();
    assert.equal(env.read("onDeathArcadeActive"), "");
    const timer = env.addTimer(); env.clock.advance(1200);
    assert.equal(env.read("onDeathArcadeActive"), "1");
    timer.label.SetParent(env.retired);
    const replacement = env.$.CreatePanel("Label", timer.owner, ""); replacement.AddClass("respawn_number"); replacement.text = "0";
    env.clock.advance(200);
    assert.equal(env.read("onDeathArcadeActive"), "");
    assert.equal(env.escape.BHasClass("ShowEscapeMenu"), false);
    feature.onDisable();
});

test("on-death restores only owned menu classes, preserving a manually opened Escape menu", () => {
    const env = fixture(); env.addTimer();
    env.escape.AddClass("ShowEscapeMenu");
    const feature = env.create(); feature.onEnable();
    assert.equal(env.read("onDeathArcadeEscapeOwned", env.escape), "");
    assert.equal(env.root.BHasClass("ShowEscapeMenu"), true);
    feature.onDisable();
    assert.equal(env.escape.BHasClass("ShowEscapeMenu"), true);
    assert.equal(env.root.BHasClass("ShowEscapeMenu"), false);
    env.clock.advance(1000);
    assert.equal(env.read("onDeathArcadeActive"), "");
    assert.deepEqual(env.clock.errors, []);
});

test("on-death does not reopen a manually dismissed menu for the same request", () => {
    const env = fixture(); env.addTimer();
    const feature = env.create(); feature.onEnable();
    env.escape.RemoveClass("ShowEscapeMenu");
    env.clock.advance(6000);
    assert.equal(env.escape.BHasClass("ShowEscapeMenu"), false);
    feature.onDisable();
});

test("on-death token identity survives disable and rapid re-enable", () => {
    const env = fixture(); env.addTimer();
    const first = env.create(); first.onEnable();
    const token = env.read("onDeathArcadeToken"); first.onDisable();
    const next = env.create(); next.onEnable();
    assert.notEqual(env.read("onDeathArcadeToken"), token);
    next.onDisable(); env.clock.advance(2000);
    assert.equal(env.read("onDeathArcadeActive"), "");
    assert.equal(env.root.BHasClass("ShowEscapeMenu"), false);
});

test("on-death settings and hideout changes clear accepted requests immediately", () => {
    const env = fixture(); env.addTimer();
    const feature = env.create(); feature.onEnable();
    env.Q.core.ConfigStore.set("ql_on_death_arcade", "ON_DEATH_GAME_MINESWEEPER", false);
    feature.onSettingsChanged();
    assert.equal(env.read("onDeathArcadeActive"), "");
    env.clock.advance(6000);
    env.Q.core.ConfigStore.set("ql_on_death_arcade", "ON_DEATH_GAME_MINESWEEPER", true);
    feature.onSettingsChanged();
    assert.equal(env.read("onDeathArcadeActive"), "1");
    env.root.AddClass("connectedToHideout"); env.clock.advance(200);
    assert.equal(env.read("onDeathArcadeActive"), "");
    feature.onDisable();
});

test("settings arcade closes owned Escape targets through the same named bridge", () => {
    const env = loadSettings();
    const hud = env.hud;
    const Q = hud.sandbox.global.QOL;
    Q.core.App.shutdown(); configure(hud);
    env.settings.eval("MOD_CONFIG.ENABLE_ON_DEATH_GAMES = 1; MOD_CONFIG.ON_DEATH_GAME_MINESWEEPER = 1;");
    env.settings.eval("QOL.arcade.updateBridgePollerState();");
    const $ = hud.sandbox.global.$;
    const source = $.CreatePanel("Panel", hud.root, "respawn_timer");
    const label = $.CreatePanel("Label", source, ""); label.AddClass("respawn_number"); label.text = "20";
    env.em.AddClass("ShowEscapeMenu");
    const feature = Q.core.FeatureRegistry.getManifest("ql_on_death_arcade").create({ id: "ql_on_death_arcade", config: { view: () => Q.core.ConfigStore.view("ql_on_death_arcade") } });
    feature.onEnable(); env.clock.advance(600);
    assert.equal(env.global.QOL.arcade.isAnyModalOpen(), true, "a separate settings isolate accepts the committed request");
    assert.equal(hud.root.BHasClass("ShowEscapeMenu"), true);
    label.text = "0"; env.clock.advance(600);
    assert.equal(env.global.QOL.arcade.isAnyModalOpen(), false);
    assert.equal(env.em.BHasClass("ShowEscapeMenu"), true, "settings cleanup preserves a preexisting Escape class");
    assert.equal(hud.root.BHasClass("ShowEscapeMenu"), false);
    feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});
