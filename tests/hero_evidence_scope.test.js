"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
function fixture() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { $, QOL: Q } = env.sandbox.global; Q.core.App.shutdown();
    const previous = env.root.FindChildTraverse("crosshair"); if (previous) previous.DeleteAsync(0); env.clock.advance(20);
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    const crosshair = add(env.root, "crosshair"), dash = add(crosshair, "");
    dash.AddClass("citadel_ability_dash"); dash.AddClass("hero_atlas");
    return { ...env, Q, add, crosshair, dash, probe: Q.core.heroProbe };
}
test("hero evidence for a requested empty Hud cannot inherit the current context's old pawn", () => {
    const env = fixture(), requested = env.add(null, "Hud", "CitadelHud");
    assert.equal(env.probe.readHeroFromCrosshair(env.root), "hero_atlas");
    assert.equal(env.probe.readHeroFromCrosshair(requested), "");
    const crosshair = env.add(requested, "crosshair"), dash = env.add(crosshair, "");
    dash.AddClass("citadel_ability_dash"); dash.AddClass("hero_magician");
    env.clock.advance(1000); // A missing compatibility path retries with bounded backoff.
    assert.equal(env.probe.readHeroFromCrosshair(requested), "hero_magician");
    assert.equal(env.probe.readHeroFromCrosshair(env.root), "hero_atlas");
    requested.DeleteAsync(0); env.clock.advance(20); assert.equal(env.probe.readHeroFromCrosshair(requested), "");
    assert.deepEqual(env.clock.errors, []);
});

test("FG reader avoids repeated HUD walks while reading current classes and replaced native sources", () => {
    const env = fixture(), reader = env.Q.core.heroProbe.createReader();
    env.crosshair.SetParent(env.add(null, "OldPawn"));
    const core = env.add(env.root, ""); core.AddClass("HudCore");
    const gameplay = env.add(core, "gameplay_hud"), alive = env.add(gameplay, "gameplay_hud_alive");
    const crosshair = env.add(alive, "crosshair"), dash = env.add(crosshair, "");
    dash.AddClass("citadel_ability_dash"); dash.AddClass("hero_atlas");
    let broadWalks = 0;
    const traverse = env.root.FindChildTraverse;
    env.root.FindChildTraverse = id => { broadWalks++; return traverse.call(env.root, id); };
    env.root.AddClass("connectedToHeroTesting");
    for (let i = 0; i < 100; i++) {
        assert.equal(reader.readHeroFromPregame(env.root), "");
        assert.equal(reader.readHeroFromCrosshair(env.root), "hero_atlas");
        env.clock.advance(50);
    }
    assert.ok(broadWalks <= 6, `absent Pregame must not scan the HUD every tick: ${broadWalks}`);
    dash.RemoveClass("hero_atlas"); dash.AddClass("hero_magician");
    assert.equal(reader.readHeroFromCrosshair(env.root), "hero_magician", "classes remain live at the original cadence");
    crosshair.SetParent(env.add(null, "RetiredCrosshair"));
    const replacement = env.add(alive, "crosshair"); replacement.AddClass("hero_frank");
    assert.equal(reader.readHeroFromCrosshair(env.root), "hero_frank", "living detached crosshair is rejected immediately");
    const takeovers = env.add(env.root, ""); takeovers.AddClass("HudTakeovers");
    const pregame = env.add(takeovers, "Pregame"), abilities = env.add(pregame, "HeroAbilities");
    abilities.AddClass("ShowingHero"); abilities.AddClass("hero_atlas");
    assert.equal(reader.readHeroFromPregame(env.root), "hero_atlas", "verified owner path bypasses a pending miss deadline");
    abilities.SetParent(env.add(null, "RetiredReveal"));
    const next = env.add(pregame, "HeroAbilities"); next.AddClass("ShowingHero"); next.AddClass("hero_frank");
    assert.equal(reader.readHeroFromPregame(env.root), "hero_frank");
});

test("FG reader reset drops pending discovery misses for a later feature instance", () => {
    const env = fixture(), reader = env.Q.core.heroProbe.createReader();
    env.crosshair.SetParent(env.add(null, "OldPawn"));
    assert.equal(reader.readHeroFromCrosshair(env.root), "");
    const source = env.add(env.root, "crosshair"); source.AddClass("hero_atlas");
    assert.equal(reader.readHeroFromCrosshair(env.root), "");
    reader.reset();
    assert.equal(reader.readHeroFromCrosshair(env.root), "hero_atlas");
    const otherReader = env.Q.core.heroProbe.createReader();
    source.RemoveClass("hero_atlas"); source.AddClass("hero_magician");
    assert.equal(otherReader.readHeroFromCrosshair(env.root), "hero_magician");
});
test("hero evidence accepts bare/native dash classes, rejects conflicts and follows current live sources", () => {
    const env = fixture(); env.dash.RemoveClass("hero_atlas"); env.dash.AddClass("magician");
    assert.equal(env.probe.readHeroFromCrosshair(env.root), "hero_magician");
    const conflicting = env.add(env.crosshair, ""); conflicting.AddClass("citadel_ability_dash"); conflicting.AddClass("hero_atlas");
    assert.equal(env.probe.readHeroFromCrosshair(env.root), "");
    conflicting.SetParent(env.add(null, "OldIndicators")); assert.equal(env.probe.readHeroFromCrosshair(env.root), "hero_magician");
    const read = env.dash.BHasClass; env.dash.BHasClass = () => { throw Error("modeled native class failure"); };
    assert.equal(env.probe.readHeroFromCrosshair(env.root), ""); env.dash.BHasClass = read;
    assert.equal(env.probe.readHeroFromCrosshair(env.root), "hero_magician"); assert.deepEqual(env.clock.errors, []);
});
test("pregame evidence contains native read failures and ignores an old reveal in normal gameplay", () => {
    const env = fixture(), pregame = env.add(env.root, "Pregame"), reveal = env.add(pregame, "HeroAbilities");
    reveal.AddClass("ShowingHero"); reveal.AddClass("hero_frank");
    assert.equal(env.probe.readHeroFromPregame(env.root), ""); env.root.AddClass("GameStatePreGame");
    assert.equal(env.probe.readHeroFromPregame(env.root), "hero_frank");
    const rootRead = env.root.BHasClass; env.root.BHasClass = () => { throw Error("modeled root read failure"); };
    assert.equal(env.probe.readHeroFromPregame(env.root), ""); env.root.BHasClass = rootRead;
    const revealRead = reveal.BHasClass; reveal.BHasClass = () => { throw Error("modeled reveal read failure"); };
    assert.equal(env.probe.readHeroFromPregame(env.root), ""); reveal.BHasClass = revealRead;
    assert.equal(env.probe.readHeroFromPregame(env.root), "hero_frank"); env.root.RemoveClass("GameStatePreGame");
    assert.equal(env.probe.readHeroFromPregame(env.root), ""); assert.deepEqual(env.clock.errors, []);
});
