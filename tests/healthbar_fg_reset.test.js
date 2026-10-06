"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const loadSettingsEnvironment = require("./load_settings_environment");

// Only the ownership path from the shipped hud_health / gold XML is modeled.
// The fixture does not claim to validate native layout or hero data binding.
function fixture(env) {
    const { hud, doc } = env;
    function add(parent, id, cls) {
        const p = doc.create("Panel", { id });
        parent.addChild(p);
        if (cls) p.AddClass(cls);
        return p;
    }
    const health = add(hud.root, "health_and_abilities_container");
    const bars = add(health, "hud_health_bars");
    const border = add(bars, "", "health_bar_border");
    const gold = add(hud.root, "gold_and_ap_container");
    add(gold, "Before");
    const portrait = add(gold, "LevelAmount");
    add(portrait, "HeroImage");
    add(gold, "After");
    const crosshair = hud.root.FindChildTraverse("crosshair");
    const dash = crosshair.FindChildrenWithClassTraverse("citadel_ability_dash")[0];
    dash.RemoveClass("hero_werewolf");
    dash.AddClass("hero_atlas");
    const imageCalls = [];
    const api = hud.sandbox.global.$;
    const createPanel = api.CreatePanel;
    api.CreatePanel = (...args) => {
        const panel = createPanel(...args);
        if (args[2] === "QOLFGPortrait") panel.SetImage = src => imageCalls.push({ panel, src });
        return panel;
    };
    return { health, bars, border, gold, portrait, add, crosshair, dash, imageCalls };
}

for (const type of [0, 1, 2, 3, 4, 5]) {
    test(`healthbar ${type}: real size row reset releases the HUD scale`, () => {
        const env = loadSettingsEnvironment();
        const { global: g, list, clock, hud, doc } = env;
        const { health } = fixture(env);
        g.MOD_CONFIG.HEALTHBAR_TYPE = type;
        const row = g.CreateSliderRow(list, "Size", "PLAYER_HEALTHBAR_SCALE", "size_50_200");
        const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
        const reset = row.FindChildrenWithClassTraverse("SettingRowResetBtn")[0];
        for (const scale of [156, 200]) {
            input.text = String(scale);
            input._fire("oninputsubmit");
            clock.advance(1200);
            assert.equal(health.style.uiScale, Math.round(120 * scale / 100) + "%");
            assert.equal(health.style.preTransformScale2d, undefined);
            reset._fire("onactivate");
            clock.advance(1200);
            assert.equal(g.MOD_CONFIG.PLAYER_HEALTHBAR_SCALE, 100);
            assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get("ql_healthbar", "PLAYER_HEALTHBAR_SCALE"), 100);
            assert.equal(health.style.uiScale, undefined, "native CSS owns scale again");
            assert.equal(health.style.preTransformScale2d, undefined);
        }
        assert.deepEqual(doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("FG refreshes Abrams to Sinclair on the same HUD without moving native portraits", () => {
    const env = loadSettingsEnvironment();
    const { border, gold, portrait, dash, imageCalls, add } = fixture(env);
    const playerLevel = add(gold, "PlayerLevel");
    const duplicate = add(playerLevel, "LevelAmount");
    add(duplicate, "HeroImage");
    const q = env.hud.sandbox.global.QOL;
    const cfg = { HEALTHBAR_TYPE: 2 };
    q.healthbar.fg.update(env.hud.root, cfg);
    const owned = border.FindChildTraverse("QOLFGPortrait");
    assert.ok(owned);
    assert.equal(owned.style.uiScale, "100%");
    assert.equal(imageCalls.at(-1).src, "s2r://panorama/images/heroes/bull_sm_psd.vtex");
    dash.RemoveClass("hero_atlas");
    dash.AddClass("hero_magician");
    q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(imageCalls.at(-1).src, "s2r://panorama/images/heroes/magician_sm_psd.vtex");
    let writes = 0;
    owned.style = new Proxy(owned.style, {
        set(target, key, value) { writes++; target[key] = value; return true; }
    });
    for (let i = 0; i < 100; i++) q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(writes, 0);
    assert.equal(imageCalls.length, 2, "unchanged hero does not reload the image");
    assert.equal(portrait.GetParent(), gold);
    assert.equal(gold.GetChild(1), portrait);
    assert.equal(duplicate.GetParent(), playerLevel);
    assert.equal(portrait.style.visibility, undefined);
    assert.equal(owned.visible, true);
});

test("FG hides missing/ambiguous hero signals and recovers with verified image extensions", () => {
    const env = loadSettingsEnvironment();
    const { border, crosshair, dash, imageCalls, add } = fixture(env);
    const q = env.hud.sandbox.global.QOL;
    const update = () => q.healthbar.fg.update(env.hud.root, { HEALTHBAR_TYPE: 2 });
    update();
    const owned = border.FindChildTraverse("QOLFGPortrait");
    dash.AddClass("hero_magician");
    update();
    assert.equal(owned.visible, false, "two hero classes must not choose the first alias");
    dash.RemoveClass("hero_atlas");
    update();
    assert.equal(owned.visible, true);
    const staleDash = add(crosshair, "", "citadel_ability_dash");
    staleDash.AddClass("hero_atlas");
    update();
    assert.equal(owned.visible, false, "conflicting dash panels are ambiguous");
    staleDash.DeleteAsync(0);
    env.clock.advance(1);
    dash.RemoveClass("hero_magician");
    update();
    assert.equal(owned.visible, false);
    dash.AddClass("hero_hornet");
    update();
    assert.equal(imageCalls.at(-1).src, "s2r://panorama/images/heroes/hornet_sm_png.vtex");
    assert.equal(owned.visible, true);
    dash.RemoveClass("hero_hornet");
    dash.AddClass("hero_airheart");
    update();
    assert.equal(owned.visible, false, "no guessed asset for an unmapped hero");
    dash.DeleteAsync(0);
    env.clock.advance(1);
    const replacement = add(crosshair, "", "citadel_ability_dash");
    replacement.AddClass("hero_magician");
    update();
    assert.equal(owned.visible, true);
    assert.equal(imageCalls.at(-1).src, "s2r://panorama/images/heroes/magician_sm_psd.vtex");
});

test("FG uses the native pregame hero before crosshair creation and in hero testing", () => {
    const env = loadSettingsEnvironment();
    const { border, crosshair, add, imageCalls } = fixture(env);
    const hud = env.hud.root;
    const pregame = add(hud, "Pregame");
    const reveal = add(pregame, "", "HeroLoaded");
    const abilities = add(reveal, "HeroAbilities", "ShowingHero");
    abilities.AddClass("hero_frank");
    const update = () => env.hud.sandbox.global.QOL.healthbar.fg.update(hud, { HEALTHBAR_TYPE: 2 });

    hud.AddClass("GameStatePreGame");
    crosshair.DeleteAsync(0);
    env.clock.advance(1);
    update();
    const owned = border.FindChildTraverse("QOLFGPortrait");
    assert.equal(owned.visible, true);
    assert.equal(imageCalls.at(-1).src, "s2r://panorama/images/heroes/frank_sm_psd.vtex");

    hud.RemoveClass("GameStatePreGame");
    hud.AddClass("connectedToHideout");
    hud.AddClass("connectedToHeroTesting");
    abilities.RemoveClass("hero_frank");
    abilities.AddClass("hero_magician");
    update();
    assert.equal(owned.visible, true);
    assert.equal(imageCalls.at(-1).src, "s2r://panorama/images/heroes/magician_sm_psd.vtex");

    hud.RemoveClass("connectedToHideout");
    hud.RemoveClass("connectedToHeroTesting");
    update();
    assert.equal(owned.visible, false, "stale reveal must not identify the live pawn");
    assert.deepEqual(env.clock.errors, []);
});

test("FG cleans up on anchor loss, replacement and disable", () => {
    const env = loadSettingsEnvironment();
    const { health, bars, border, gold, portrait, add, imageCalls } = fixture(env);
    const q = env.hud.sandbox.global.QOL;
    const update = () => q.healthbar.fg.update(env.hud.root, { HEALTHBAR_TYPE: 2 });
    update();
    let owned = border.FindChildTraverse("QOLFGPortrait");
    bars.SetParent(gold);
    update();
    assert.equal(owned.visible, false, "hide synchronously before deferred deletion");
    env.clock.advance(1);
    assert.equal(owned.IsValid(), false);
    const nextBars = add(health, "hud_health_bars");
    const nextBorder = add(nextBars, "", "health_bar_border");
    update();
    owned = nextBorder.FindChildTraverse("QOLFGPortrait");
    assert.equal(owned.style.width, "48px");
    assert.equal(imageCalls.at(-1).panel, owned, "replacement receives its image even for the same hero");
    owned.DeleteAsync(0);
    env.clock.advance(1);
    update();
    assert.notEqual(nextBorder.FindChildTraverse("QOLFGPortrait"), owned);
    owned = nextBorder.FindChildTraverse("QOLFGPortrait");
    q.healthbar.fg.update(env.hud.root, { HEALTHBAR_TYPE: 0 });
    assert.equal(owned.visible, false);
    env.clock.advance(1);
    assert.equal(owned.IsValid(), false);
    assert.equal(q.healthbar.fg.isActive(), false);
    assert.equal(portrait.GetParent(), gold);
    assert.equal(gold.GetChild(1), portrait);
    assert.deepEqual(env.clock.errors, []);
});

test("both clear helpers pass native CSS property names", () => {
    const { hud, doc } = loadSettingsEnvironment();
    const p = doc.create("Panel", { id: "StrictNativeStyle" });
    const names = [];
    const nativeClear = p.ClearPropertyFromCode.bind(p);
    p.ClearPropertyFromCode = name => { names.push(name); return nativeClear(name); };
    const q = hud.sandbox.global.QOL;
    for (const clear of [q.utils.ClearStyleSafe, q.core.panel.clearStyleProperty]) {
        p.style.uiScale = "190%";
        p.style.preTransformScale2d = "1.5";
        clear(p, "uiScale");
        clear(p, "preTransformScale2d");
        assert.equal(p.style.uiScale, undefined);
        assert.equal(p.style.preTransformScale2d, undefined);
    }
    assert.deepEqual(names, ["ui-scale", "pre-transform-scale2d", "ui-scale", "pre-transform-scale2d"]);
});

for (const [key, id, expected] of [["TOP_BAR_SCALE", "TopBar", "150%"], ["BOTTOM_BAR_SCALE", "hud_signature", "135%"]]) {
    test(`${key}: row reset restores another HUD element's CSS scale`, () => {
        const { global: g, list, clock, hud, doc } = loadSettingsEnvironment();
        const panel = hud.root.FindChildTraverse(id) || doc.create("Panel", { id });
        if (!panel.GetParent()) hud.root.addChild(panel);
        const row = g.CreateSliderRow(list, "Size", key, "scale_0_5_1_5");
        const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
        input.text = "1.5";
        input._fire("oninputsubmit");
        clock.advance(1200);
        assert.equal(panel.style.uiScale, expected);
        row.FindChildrenWithClassTraverse("SettingRowResetBtn")[0]._fire("onactivate");
        clock.advance(1200);
        assert.equal(g.MOD_CONFIG[key], 1);
        assert.equal(panel.style.uiScale, undefined);
        assert.deepEqual(doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}
